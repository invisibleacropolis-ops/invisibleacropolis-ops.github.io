import * as THREE from "three";
import { heightAt } from "./terrain.ts";
import { castleGroundY, castleSegmentClear, findCastleRoute, type CastleLayout, type CastleNode } from "./castleLayout.ts";

export type CastleVisitor = {
  radius: number; indoors: boolean; patrol: boolean; cooldown: number;
  route: THREE.Vector3[]; index: number; node?: string; returning: boolean;
  destination?: CastleNode; visited: string[]; trips: number;
  home: THREE.Vector3; entrance?: string; connector: THREE.Vector3[];
};

export const createCastleVisitor = (home: THREE.Vector3, radius: number, indoors: boolean, patrol: boolean, delay: number): CastleVisitor => ({
  home: home.clone(), radius, indoors, patrol, cooldown: delay,
  route: [], index: 0, returning: false, connector: [], visited: [], trips: 0,
});

/** Register the real shrine/village meshes, ignoring light halos and other transparent effects. */
export function registerNavigationObstacles(layout: CastleLayout, groups: THREE.Object3D[]) {
  layout.worldSolids.length = 0;
  for (const group of groups) {
    group.updateMatrixWorld(true);
    group.traverse(o => {
      if (!(o instanceof THREE.Mesh)) return;
      const materials = Array.isArray(o.material) ? o.material : [o.material];
      if (materials.every(m => m.transparent || m instanceof THREE.ShaderMaterial)) return;
      o.geometry.computeBoundingBox();
      const add = (matrix: THREE.Matrix4) => {
        const b=o.geometry.boundingBox!.clone().applyMatrix4(matrix), c=b.getCenter(new THREE.Vector3()), size=b.getSize(new THREE.Vector3());
        if (size.x < 1 || size.z < 1) return;
        layout.worldSolids.push({id:o.name || o.uuid,x:c.x,z:c.z,width:size.x,depth:size.z,bottom:b.min.y,top:b.max.y});
      };
      if(o instanceof THREE.InstancedMesh) {
        const matrix=new THREE.Matrix4();
        for(let i=0;i<o.count;i++){o.getMatrixAt(i,matrix);add(matrix.clone().premultiply(o.matrixWorld));}
      } else add(o.matrixWorld);
    });
  }
}

export function safeVisitorHome(layout: CastleLayout, home: THREE.Vector3, radius: number): THREE.Vector3 {
  if(castleSegmentClear(layout,home,home,radius,true)) return home;
  for(let r=32;r<=256;r+=32) for(let i=0;i<16;i++) {
    const x=home.x+Math.cos(i*Math.PI/8)*r,z=home.z+Math.sin(i*Math.PI/8)*r;
    const p=new THREE.Vector3(x,heightAt(x,z),z);
    if(castleSegmentClear(layout,p,p,radius,true)) return p;
  }
  return home;
}

/** A bounded terrain grid supplies obstacle-aware connectors to the authored castle graph. */
function terrainConnector(layout: CastleLayout, start: THREE.Vector3, goal: THREE.Vector3, radius: number): THREE.Vector3[] | null {
  const step=64, key=(x:number,z:number)=>`${x},${z}`;
  const point=(x:number,z:number)=>{const px=start.x+x*step,pz=start.z+z*step;return new THREE.Vector3(px,heightAt(px,pz)+2,pz);};
  type Cell={x:number;z:number;g:number;f:number;parent?:Cell};
  const first:Cell={x:0,z:0,g:0,f:start.distanceTo(goal)};
  const open:Cell[]=[first], best=new Map([[key(0,0),0]]), closed=new Set<string>();
  const margin=640,minX=Math.min(start.x,goal.x)-margin,maxX=Math.max(start.x,goal.x)+margin,minZ=Math.min(start.z,goal.z)-margin,maxZ=Math.max(start.z,goal.z)+margin;
  for(let iteration=0;open.length && iteration<6000;iteration++) {
    open.sort((a,b)=>b.f-a.f);const c=open.pop()!,id=key(c.x,c.z);
    if(closed.has(id)) continue;closed.add(id);
    const p=point(c.x,c.z);
    if(p.distanceTo(goal)<step*2 && castleSegmentClear(layout,p,goal,radius,true)) {
      const result=[goal.clone()];let prev:Cell|undefined=c;
      while(prev){result.unshift(point(prev.x,prev.z));prev=prev.parent;}
      // Visibility simplification retains the same obstacle/terrain checks.
      const simplified:THREE.Vector3[]=[];let at=0;
      while(at<result.length-1){let next=result.length-1;while(next>at+1&&!castleSegmentClear(layout,result[at],result[next],radius,true)) next--;simplified.push(result[next]);at=next;}
      return simplified;
    }
    for(let dx=-1;dx<=1;dx++) for(let dz=-1;dz<=1;dz++) {
      if(!dx&&!dz) continue;const x=c.x+dx,z=c.z+dz,k=key(x,z);
      if(closed.has(k)) continue;const q=point(x,z),g=c.g+p.distanceTo(q);
      if(g>=(best.get(k)??Infinity)||q.x<minX||q.x>maxX||q.z<minZ||q.z>maxZ||!castleSegmentClear(layout,p,q,radius,true))continue;
      best.set(k,g);open.push({x,z,g,f:g+q.distanceTo(goal),parent:c});
    }
  }
  return null;
}

/** Connect at ground level only: nearest elevated veranda is not an entrance. */
function joinNetwork(layout: CastleLayout, position: THREE.Vector3, radius: number) {
  const candidates = layout.nodes.filter(n => n.position.y <= heightAt(n.position.x, n.position.z) + 3 && n.clearance >= radius)
    .sort((a, b) => a.position.distanceToSquared(position) - b.position.distanceToSquared(position));
  for (const n of candidates) {
    if (castleSegmentClear(layout, position, n.position, radius, true)) return { node: n, points: [n.position.clone()] };
  }
  const entrance = layout.byId.get("approach")!;
  const points = terrainConnector(layout, position, entrance.position, radius);
  if(points) return {node:entrance,points};
  return null;
}

/** Chooses a trip or a homebound route. No per-frame path search, no teleport fallback. */
export function planCastleVisit(layout: CastleLayout, visitor: CastleVisitor, position: THREE.Vector3, random: () => number): boolean {
  if (!visitor.node) {
    const entry = joinNetwork(layout, position, visitor.radius);
    if (!entry) { visitor.cooldown = 12; return false; }
    visitor.entrance = entry.node.id; visitor.node = entry.node.id;
    visitor.home.copy(position); visitor.connector = [position.clone(), ...entry.points];
  }
  const goHome = !visitor.patrol && visitor.trips >= 2;
  const choices = goHome ? [layout.byId.get(visitor.entrance!)!] : layout.nodes.filter(n =>
    n.destination && (!n.destination.indoors || visitor.indoors) && n.clearance >= visitor.radius && n.id !== visitor.node);
  // Cycle the candidates from a seeded offset; unreachable choices never make the actor walk through a wall.
  const offset = Math.floor(random() * choices.length);
  for (let i = 0; i < choices.length; i++) {
    const goal = choices[(i + offset) % choices.length];
    const route = findCastleRoute(layout, visitor.node, goal.id, visitor.radius);
    if (!route) continue;
    visitor.route = route.map(n => n.position.clone());
    if (visitor.connector.length && visitor.trips === 0) visitor.route.unshift(...visitor.connector.slice(1).map(p => p.clone()));
    if (goHome) visitor.route.push(...visitor.connector.slice(0, -1).reverse().map(p => p.clone()));
    visitor.index = 0; visitor.returning = goHome; visitor.destination = goHome ? undefined : goal;
    return true;
  }
  visitor.cooldown = 12; return false;
}

/** Consumes distance across waypoints, so slow frames cannot overshoot a doorway. */
export function advanceCastleVisit(layout: CastleLayout, visitor: CastleVisitor, position: THREE.Vector3, distance: number): boolean {
  while (visitor.index < visitor.route.length) {
    const target = visitor.route[visitor.index];
    const dx = target.x - position.x, dz = target.z - position.z, length = Math.hypot(dx, dz);
    if (length <= distance + 1e-6) {
      position.x = target.x; position.z = target.z;
      distance -= length; visitor.index++;
    } else {
      position.x += dx / length * distance; position.z += dz / length * distance; break;
    }
  }
  position.y = castleGroundY(layout, position.x, position.z);
  if (visitor.index < visitor.route.length) return false;
  if (visitor.returning) {
    visitor.node = undefined; visitor.destination = undefined; visitor.trips = 0;
    visitor.cooldown = 55; visitor.returning = false;
  } else if (visitor.destination) {
    visitor.node = visitor.destination.id; visitor.visited.push(visitor.node);
    if (visitor.visited.length > 32) visitor.visited.shift();
    visitor.trips++; visitor.cooldown = visitor.destination.destination!.pause;
  }
  visitor.route = []; visitor.index = 0;
  return true;
}
