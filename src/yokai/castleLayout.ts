import * as THREE from "three";
import { CASTLE_CENTER, heightAt, slopeAt } from "./terrain.ts";

export type CastleNode = {
  id: string; position: THREE.Vector3; clearance: number;
  destination?: { label: string; indoors?: boolean; pause: number; yaw: number };
};
export type CastleSolid = { id: string; x: number; z: number; width: number; depth: number; bottom: number; top: number };
export type CastleSurface = { id: string; a: THREE.Vector3; b: THREE.Vector3; width: number; terrain?: boolean };
export type CastleLayout = ReturnType<typeof createCastleLayout>;

/** Coordinates, walkable surfaces and solid envelopes are shared by the builder and AI. */
export function createCastleLayout() {
  const baseY = heightAt(CASTLE_CENTER.x, CASTLE_CENTER.y);
  const floorY = baseY + 150;
  const world = (x: number, z: number, y?: number) => new THREE.Vector3(CASTLE_CENTER.x + x, y ?? heightAt(CASTLE_CENTER.x + x, CASTLE_CENTER.y + z) + 2, CASTLE_CENTER.y + z);
  const nodes: CastleNode[] = [];
  const edges: [string, string][] = [];
  const surfaces: CastleSurface[] = [];
  const solids: CastleSolid[] = [];
  const worldSolids: CastleSolid[] = [];
  const node = (id: string, x: number, z: number, y?: number, destination?: CastleNode["destination"], clearance = 40) => {
    const n = { id, position: world(x, z, y), clearance, destination }; nodes.push(n); return n;
  };
  const stop = (label: string, yaw = 0, indoors = false, pause = 9) => ({ label, yaw, indoors, pause });
  node("approach", -650, 1100);
  node("hillside", -650, 350);
  node("west-bend", -680, -50);
  node("west-approach", -650, -500);
  node("story-lane", -310, -580);
  node("forecourt", 0, -600, undefined, stop("Lantern court", 0));
  node("gate", 0, -420, undefined, stop("Castle gate", Math.PI, false, 5));
  node("court", 0, -300, undefined, stop("Inner courtyard", 0));
  node("tea-path", 220, -600);
  node("tea", 330, -600, undefined, stop("Tea pavilion", Math.PI / 2, false, 14));
  node("shrine-path", 220, -820);
  node("shrine", 330, -820, undefined, stop("Wayside shrine", Math.PI / 2, false, 12));
  node("garden", -270, -280, undefined, stop("Dry garden", 0, false, 13));
  node("garden-seat", -285, -70, undefined, stop("Garden bench", 0, false, 11));
  node("ramp-foot", 295, -280, baseY + 2);
  node("ramp-one", 295, -70, baseY + 48);
  node("ramp-two", 295, 210, baseY + 104);
  node("ramp-three", 100, 280, floorY);
  node("veranda", 0, 280, floorY, stop("Upper veranda", Math.PI, false, 12));
  node("threshold", 0, 125, floorY, undefined, 38);
  node("hall", 0, 65, floorY, stop("Entrance hall", Math.PI, true), 32);
  node("left-door", -78, 65, floorY, undefined, 28);
  node("right-door", 78, 65, floorY, undefined, 28);
  node("reception", -78, -35, floorY, stop("Tatami reception", Math.PI, true, 16), 28);
  node("archive", 78, -35, floorY, stop("Scroll room", Math.PI, true, 14), 28);
  const byId = new Map(nodes.map(n => [n.id, n]));
  const link = (a: string, b: string, width = 88, terrain = true) => {
    edges.push([a, b]);
    surfaces.push({ id: `${a}:${b}`, a: byId.get(a)!.position, b: byId.get(b)!.position, width, terrain });
  };
  ["approach", "hillside", "west-bend", "west-approach", "story-lane", "forecourt", "gate", "court"].forEach((id, i, ids) => { if (i) link(ids[i - 1], id); });
  link("forecourt", "tea-path"); link("tea-path", "tea"); link("tea-path", "shrine-path"); link("shrine-path", "shrine");
  link("court", "garden"); link("garden", "garden-seat"); link("court", "ramp-foot");
  ["ramp-foot", "ramp-one", "ramp-two", "ramp-three", "veranda", "threshold", "hall"].forEach((id, i, ids) => { if (i) link(ids[i - 1], id, 88, false); });
  link("hall", "left-door", 64, false); link("hall", "right-door", 64, false);
  link("left-door", "reception", 64, false); link("right-door", "archive", 64, false);
  const solid = (id: string, x: number, z: number, width: number, depth: number, bottom: number, top: number) => {
    solids.push({ id, x: CASTLE_CENTER.x + x, z: CASTLE_CENTER.y + z, width, depth, bottom, top });
  };
  // Walls use the same envelopes as the visible geometry, including real doorway gaps.
  solid("west-wall", -430, 0, 20, 860, baseY - 85, baseY + 80);
  solid("east-wall", 430, 0, 20, 860, baseY - 85, baseY + 80);
  solid("rear-wall", 0, 420, 840, 20, baseY - 85, baseY + 80);
  solid("front-left", -260, -420, 320, 20, baseY - 85, baseY + 80);
  solid("front-right", 260, -420, 320, 20, baseY - 85, baseY + 80);
  solid("foundation", 0, 0, 390, 340, baseY - 5, floorY - 3);
  solid("keep-west", -150, 0, 10, 240, floorY, floorY + 98);
  solid("keep-east", 150, 0, 10, 240, floorY, floorY + 98);
  solid("keep-north", 0, -115, 290, 10, floorY, floorY + 98);
  solid("entrance-left", -103, 115, 94, 10, floorY, floorY + 98);
  solid("entrance-right", 103, 115, 94, 10, floorY, floorY + 98);
  solid("room-divider", 0, -42, 8, 146, floorY, floorY + 83);
  solid("screen-center", 0, 31, 56, 8, floorY, floorY + 83);
  for (const x of [-137, 137]) solid(`screen-${x}`, x, 31, 26, 8, floorY, floorY + 83);
  for (const x of [-78, 78]) solid(`display-${x}`, x, -97, 92, 23, floorY, floorY + 44);
  // Pavilion remains open; its posts and rear furnishings are the only blockers.
  for (const x of [285, 405]) for (const z of [-658, -542]) {
    const y = world(x, z).y; solid(`tea-post-${x}-${z}`, x, z, 9, 9, y, y + 95);
  }
  solid("tea-table", 385, -600, 24, 56, world(385, -600).y, world(385, -600).y + 18);
  solid("shrine-house", 435, -820, 80, 100, world(435, -820).y, world(435, -820).y + 95);
  solid("prop-offering-shelf",382,-820,20,54,world(435,-820).y+22.5,world(435,-820).y+27.5);
  solid("garden-rocks", -355, -150, 60, 90, baseY, baseY + 40);
  for (const [x,z] of [[-75,-510],[75,-510],[-100,-365],[100,-365],[145,-760],[380,-730],[-270,-350],[210,345]]) {
    const y = world(x,z).y; solid(`prop-lantern-${x}-${z}`,x,z,29,29,y,y+57);
  }
  for (const [x,z] of [[140,-680],[120,-790],[-360,-290],[-355,60],[220,-940],[380,-950]]) {
    const y = world(x,z).y; solid(`prop-bed-${x}-${z}`,x,z,64,36,y,y+30);
  }
  solid("prop-garden-bench",-285,0,80,24,baseY,baseY+21);
  for (const x of [-422,422]) solid(`prop-tower-${x}`,x,410,82,82,world(x,410).y,world(x,410).y+130);
  return { baseY, floorY, world, nodes, byId, edges, surfaces, solids, worldSolids };
}

export function castleGroundY(layout: CastleLayout, x: number, z: number): number {
  let y = heightAt(x, z);
  const lx = x - CASTLE_CENTER.x, lz = z - CASTLE_CENTER.y;
  if (Math.abs(lx) <= 171 && Math.abs(lz) <= 141) y = Math.max(y, layout.floorY);
  for (const s of layout.surfaces) {
    const dx = s.b.x - s.a.x, dz = s.b.z - s.a.z, lenSq = dx * dx + dz * dz;
    const t = THREE.MathUtils.clamp(((x - s.a.x) * dx + (z - s.a.z) * dz) / lenSq, 0, 1);
    if (Math.hypot(x - s.a.x - t * dx, z - s.a.z - t * dz) > s.width / 2 + 1e-6) continue;
    const length = Math.sqrt(lenSq);
    // Flat landings prevent adjacent ramp strips from producing a step at a bend.
    const rampT = length > 90 ? THREE.MathUtils.clamp((t * length - 44) / (length - 88), 0, 1) : t;
    y = Math.max(y, s.terrain ? heightAt(x, z) + 2 : THREE.MathUtils.lerp(s.a.y, s.b.y, rampT));
  }
  return y;
}

export function castleSegmentClear(layout: CastleLayout, a: THREE.Vector3, b: THREE.Vector3, radius: number, terrainCheck = false) {
  const solids = [...layout.solids, ...layout.worldSolids].filter(s =>
    s.x + s.width / 2 + radius >= Math.min(a.x,b.x) && s.x - s.width / 2 - radius <= Math.max(a.x,b.x) &&
    s.z + s.depth / 2 + radius >= Math.min(a.z,b.z) && s.z - s.depth / 2 - radius <= Math.max(a.z,b.z));
  const steps = Math.max(1, Math.ceil(a.distanceTo(b) / 6));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, x = THREE.MathUtils.lerp(a.x, b.x, t), z = THREE.MathUtils.lerp(a.z, b.z, t);
    const y = terrainCheck ? heightAt(x,z) + 2 : THREE.MathUtils.lerp(a.y, b.y, t);
    if (terrainCheck && (heightAt(x, z) < 22 || slopeAt(x, z) > 0.8)) return false;
    if (solids.some(s => y < s.top - 0.5 && y + 65 > s.bottom && Math.abs(x - s.x) < s.width / 2 + radius && Math.abs(z - s.z) < s.depth / 2 + radius)) return false;
  }
  return true;
}

/** Small authored graph: A* runs only when choosing a destination, never per frame. */
export function findCastleRoute(layout: CastleLayout, start: string, goal: string, radius: number): CastleNode[] | null {
  if (!layout.byId.has(start) || !layout.byId.has(goal)) return null;
  const open = new Set([start]), came = new Map<string, string>(), scores = new Map([[start, 0]]);
  const heuristic = (id: string) => layout.byId.get(id)!.position.distanceTo(layout.byId.get(goal)!.position);
  while (open.size) {
    const current = [...open].sort((a, b) => scores.get(a)! + heuristic(a) - scores.get(b)! - heuristic(b))[0];
    if (current === goal) {
      const result = [layout.byId.get(goal)!]; let id = goal;
      while (came.has(id)) { id = came.get(id)!; result.unshift(layout.byId.get(id)!); }
      return result;
    }
    open.delete(current);
    for (const edge of layout.edges) {
      const next = edge[0] === current ? edge[1] : edge[1] === current ? edge[0] : undefined;
      if (!next) continue;
      const a = layout.byId.get(current)!, b = layout.byId.get(next)!;
      if (Math.min(a.clearance, b.clearance) < radius || !castleSegmentClear(layout, a.position, b.position, radius)) continue;
      const score = scores.get(current)! + a.position.distanceTo(b.position);
      if (score >= (scores.get(next) ?? Infinity)) continue;
      scores.set(next, score); came.set(next, current); open.add(next);
    }
  }
  return null;
}
