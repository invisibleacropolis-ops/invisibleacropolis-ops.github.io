import * as THREE from "three";
import { getToonGradient } from "./palette.ts";
import { CASTLE_CENTER, heightAt } from "./terrain.ts";
import { plasterTexture, roofTexture, stoneWallTexture, woodTexture, castleTatamiTexture, castleGravelTexture, castleScrollTexture } from "./textures.ts";
import { reserve, reserveLine } from "./occupancy.ts";
import { createCastleLayout, castleGroundY, type CastleLayout } from "./castleLayout.ts";

export type Castle = { group: THREE.Group; gatePoint: THREE.Vector3; navigation: CastleLayout; groundY: (x: number, z: number) => number };

/** Physical UVs keep courses and grain the same size on a tower and the main keep. */
function surfaceUV(geometry: THREE.BufferGeometry, scale: number) {
  const p = geometry.getAttribute("position"), n = geometry.getAttribute("normal");
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i)), nz = Math.abs(n.getZ(i));
    uv[i * 2] = (nx > nz && nx > ny ? p.getZ(i) : p.getX(i)) / scale;
    uv[i * 2 + 1] = (ny > nx && ny > nz ? p.getZ(i) : p.getY(i)) / scale;
  }
  geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return geometry;
}

/** Swept rectangular hips: a long ridge, broad tiled slopes, and lifted eaves. */
function roofGeometry(width: number, depth: number, height: number) {
  const positions: number[] = [], uv: number[] = [], indices: number[] = [];
  const rings = [ [0.27, 0.006, 1], [0.38, 0.23, 0.59], [0.47, 0.41, 0.20], [0.55, 0.53, 0.04], [0.59, 0.57, 0.13] ];
  for (const [rx, rz, ry] of rings) for (const [sx, sz] of [[-1,-1], [1,-1], [1,1], [-1,1]]) {
    positions.push(sx * width * rx, height * ry, sz * depth * rz);
    uv.push(sx * width * rx / 100, sz * depth * rz / 100);
  }
  for (let r = 0; r < rings.length - 1; r++) for (let k = 0; k < 4; k++) {
    const a = r * 4 + k, b = r * 4 + (k + 1) % 4, c = b + 4, d = a + 4;
    indices.push(a, b, d, b, c, d);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  return geometry;
}

export const createCastle = (): Castle => {
  const navigation = createCastleLayout();
  const { baseY, floorY, world } = navigation;
  const group = new THREE.Group(); group.name = "castle-precinct";
  const toon = (color: string, map?: THREE.Texture) => new THREE.MeshToonMaterial({ color, ...(map ? { map } : {}), gradientMap: getToonGradient() });
  const stone = toon("#c8c7ba", stoneWallTexture("#92968f", "#515c58", "#b6b6a9"));
  const plaster = toon("#fff8e9", plasterTexture("#f4efdf"));
  const tile = toon("#bbc9d3", roofTexture("#394d62", "#243646", "#8098aa")); tile.side = THREE.DoubleSide;
  const timber = toon("#fff4df", woodTexture("#82634d", "#4c3b32"));
  const floor = toon("#fff2d5", woodTexture("#a78160", "#6d543c"));
  const dark = toon("#252e31"), gold = toon("#d6ab57"), paper = toon("#f7e5bb");
  const tatami = toon("#f4e3b2", castleTatamiTexture());
  const gravel = toon("#e5e0cb", castleGravelTexture());
  const gardenStone = toon("#89968b", gravel.map!);
  const leaf = toon("#618367"), pink = toon("#d99bab");
  const batches = new Map<THREE.Material, THREE.Matrix4[]>();
  const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
  const dummy = new THREE.Object3D();
  // Repeated small trim is instanced; major surfaces retain correctly scaled UVs.
  const trim = (mat: THREE.Material, x: number, y: number, z: number, w: number, h: number, d: number, yaw = 0) => {
    dummy.position.set(x, y, z); dummy.rotation.set(0, yaw, 0); dummy.scale.set(w, h, d); dummy.updateMatrix();
    if (!batches.has(mat)) batches.set(mat, []);
    batches.get(mat)!.push(dummy.matrix.clone());
  };
  const mesh = (name: string, geo: THREE.BufferGeometry, mat: THREE.Material, p: THREE.Vector3) => {
    const m = new THREE.Mesh(geo, mat); m.name = name; m.position.copy(p); group.add(m); return m;
  };
  const box = (name: string, x: number, y: number, z: number, w: number, h: number, d: number, mat: THREE.Material, scale = 100) =>
    mesh(name, surfaceUV(new THREE.BoxGeometry(w, h, d), scale), mat, new THREE.Vector3(x, y, z));
  const localBox = (name: string, x: number, y: number, z: number, w: number, h: number, d: number, mat: THREE.Material) =>
    box(name, CASTLE_CENTER.x + x, y, CASTLE_CENTER.y + z, w, h, d, mat);
  const beam = (a: THREE.Vector3, b: THREE.Vector3, radius: number, mat: THREE.Material) => {
    const m = mesh("ridge-and-rail", new THREE.CylinderGeometry(radius, radius, a.distanceTo(b), 6), mat, a.clone().add(b).multiplyScalar(0.5));
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()); return m;
  };
  const roof = (x: number, y: number, z: number, w: number, d: number, h: number) => {
    mesh("curved-kawara-roof", roofGeometry(w, d, h), tile, new THREE.Vector3(x, y, z));
    beam(new THREE.Vector3(x-w*.29,y+h,z), new THREE.Vector3(x+w*.29,y+h,z), 3.5, tile);
    // Eave fascia and timber brackets below the lifted tile edge.
    for (const side of [-1, 1]) {
      trim(timber, x, y+2, z+side*d*.51, w*1.12, 5, 5);
      for (let i=-3; i<=3; i++) {
        trim(timber, x+i*w*.14, y-7, z+side*d*.41, 5, 13, d*.18);
        trim(tile, x+i*w*.14, y+h*.14, z+side*d*.566, 6, 6, 7);
      }
      beam(new THREE.Vector3(x+side*w*.27,y+h,z), new THREE.Vector3(x+side*w*.59,y+h*.13,z-d*.57), 2.2, tile);
      beam(new THREE.Vector3(x+side*w*.27,y+h,z), new THREE.Vector3(x+side*w*.59,y+h*.13,z+d*.57), 2.2, tile);
    }
  };
  // A bowed ishigaki profile, widened at the heel rather than a four-sided cone.
  const foundationGeo = new THREE.CylinderGeometry(1, 1, 1, 4, 5, false);
  const fp = foundationGeo.getAttribute("position");
  for (let i=0;i<fp.count;i++) {
    const t = fp.getY(i)+.5, span = 1 - Math.pow(t, .7)*.22;
    const a = Math.PI/4, x = fp.getX(i), z = fp.getZ(i);
    fp.setXYZ(i, (x*Math.cos(a)-z*Math.sin(a))*276*span, t*150, (x*Math.sin(a)+z*Math.cos(a))*240*span);
  }
  foundationGeo.computeVertexNormals();
  mesh("battered-ishigaki", surfaceUV(foundationGeo, 115), stone, world(0,0,baseY));
  reserve(CASTLE_CENTER.x, CASTLE_CENTER.y, 235);
  localBox("keep-floor",0,floorY-4,0,342,8,282,floor);
  localBox("plaster-ceiling",0,floorY+97,0,290,3,230,plaster);
  for(const x of [-105,-35,35,105]) localBox("ceiling-rafter",x,floorY+92,0,7,8,230,timber);
  const roomLight = new THREE.PointLight("#ffdfad", 4800, 340, 2);
  roomLight.position.copy(world(0,20,floorY+72));group.add(roomLight);
  // Render every architectural blocker from its navigation envelope.
  for (const s of navigation.solids) {
    if (s.id === "foundation" || s.id === "garden-rocks" || s.id.startsWith("prop-")) continue;
    const wall = /wall|front-left|front-right/.test(s.id);
    const furnishing = /display|table/.test(s.id);
    const wood = /post|divider|screen|house/.test(s.id);
    const bottom = wall ? Math.min(baseY, heightAt(s.x,s.z))-12 : s.bottom;
    box(s.id, s.x, (bottom+s.top)/2, s.z, s.width, s.top-bottom, s.depth, furnishing ? floor : wood ? timber : plaster);
    if (s.id.startsWith("display")) {
      box("cabinet-top",s.x,s.top+1.5,s.z,s.width+5,3,s.depth+4,timber);
      for(const side of [-1,1]) {
        box("cabinet-panel",s.x+side*23,s.bottom+23,s.z+12.1,40,31,1,paper);
        trim(gold,s.x+side*8,s.bottom+24,s.z+14,2,5,2);
      }
    }
    if (wall) {
      box(`${s.id}-stone-foot`,s.x,bottom+17,s.z,s.width+4,34,s.depth+4,stone);
      box(`${s.id}-tile-cap`,s.x,s.top+4,s.z,s.width+14,8,s.depth+14,tile);
      reserveLine(s.x-s.width/2,s.z-s.depth/2,s.x+s.width/2,s.z+s.depth/2,22);
    }
  }
  // Reception mats and a warmer entry floor; generous circulation around the displays.
  for (const side of [-1,1]) for (let row=0;row<2;row++) {
    localBox("tatami-border",side*78,floorY+.6,-35+row*47,118,1,44,timber);
    localBox("woven-tatami",side*78,floorY+1.2,-35+row*47,111,.8,38,tatami);
  }
  for (const side of [-1,1]) {
    const x = CASTLE_CENTER.x+side*78, z = CASTLE_CENTER.y-105;
    box("hanging-scroll",x,floorY+60,z,34,45,1.5,paper);
    mesh("ink-landscape",new THREE.PlaneGeometry(30,39),toon("#ffffff",castleScrollTexture(side>0)),new THREE.Vector3(x,floorY+60,z+1));
    trim(timber,x,floorY+84,z+1,40,3,3); trim(timber,x,floorY+36,z+1,40,3,3);
    const vase = mesh("ceramic-offering",new THREE.LatheGeometry([new THREE.Vector2(5,0),new THREE.Vector2(8,6),new THREE.Vector2(6,13),new THREE.Vector2(3,17),new THREE.Vector2(4,19)],12),side<0?gold:tile,new THREE.Vector3(x+26,floorY+44,z+7));
    if(side>0) for(let i=0;i<4;i++) trim(paper,x-30+i*8,floorY+48,z+8,6,8,16);
    void vase;
  }
  // Thick lintels leave a genuinely open entry and side-to-side hall.
  localBox("entry-lintel",0,floorY+90,115,112,16,13,timber);
  for (const x of [-95,0,95]) {
    localBox("lower-window-recess",x,floorY+59,-121,42,27,2,dark);
    for(const bar of [-1,0,1]) trim(timber,CASTLE_CENTER.x+x+bar*11,floorY+59,CASTLE_CENTER.y-123,3,29,3);
    localBox("lower-window-sill",x,floorY+43,-124,49,5,8,timber);
  }
  for (const x of [-150,150]) for(const z of [-115,115]) trim(timber,CASTLE_CENTER.x+x,floorY+49,CASTLE_CENTER.y+z,13,98,13);
  // Shōji strips on the interior walls, visible from the furnished rooms.
  for (const side of [-1,1]) {
    localBox("shoji-panel",side*144,floorY+52,-20,1,52,95,paper);
    for(let i=-2;i<=2;i++) trim(timber,CASTLE_CENTER.x+side*143,floorY+52,CASTLE_CENTER.y-20+i*18,2,54,2);
    for(let i=-1;i<=1;i++) trim(timber,CASTLE_CENTER.x+side*143,floorY+52+i*17,CASTLE_CENTER.y-20,2,2,95);
  }
  // Four diminishing stories with separate window bays, sills and gabled dormers.
  let y = floorY+98;
  roof(CASTLE_CENTER.x,y,CASTLE_CENTER.y,340,278,66);
  for(let tier=1;tier<4;tier++) {
    const w=300*Math.pow(.77,tier), d=240*Math.pow(.77,tier), h=58-tier*3;
    y += tier===1 ? 42 : 38;
    localBox(`tier-${tier}`,0,y+h/2,0,w,h,d,plaster);
    localBox("timber-sill",0,y+3,0,w+5,6,d+5,timber);
    for(const side of [-1,1]) for(let win=-1;win<=1;win++) {
      localBox("recessed-window",win*w*.26,y+h*.53,side*(d/2+.3),w*.16,20,2,dark);
      for(let bar=-1;bar<=1;bar++) trim(timber,CASTLE_CENTER.x+win*w*.26+bar*w*.045,y+h*.53,CASTLE_CENTER.y+side*(d/2+2),2,22,3);
      trim(timber,CASTLE_CENTER.x+win*w*.26,y+h*.53-12,CASTLE_CENTER.y+side*(d/2+3),w*.18,4,6);
    }
    y+=h; roof(CASTLE_CENTER.x,y,CASTLE_CENTER.y,w+34,d+32,48);
    for(const side of [-1,1]) {
      const gable = new THREE.BufferGeometry();
      gable.setAttribute("position",new THREE.Float32BufferAttribute([-34,0,0,34,0,0,0,28,0],3));gable.setIndex(side>0?[0,1,2]:[2,1,0]);gable.computeVertexNormals();
      mesh("plaster-gable",gable,plaster,world(0,side*(d*.44),y+10));
      beam(world(-36,side*d*.44,y+10),world(0,side*d*.44,y+40),3,timber);
      beam(world(0,side*d*.44,y+40),world(36,side*d*.44,y+10),3,timber);
    }
  }
  // Curved fish bodies, open fan tails and eyes make the ridge ornaments legible.
  for(const side of [-1,1]) {
    const x=CASTLE_CENTER.x+side*48, z=CASTLE_CENTER.y, fy=y+53;
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(x,fy,z),new THREE.Vector3(x+side*8,fy+11,z),new THREE.Vector3(x+side*7,fy+24,z),new THREE.Vector3(x,fy+32,z)]);
    mesh("golden-shachihoko",new THREE.TubeGeometry(curve,10,4.3,7,false),gold,new THREE.Vector3());
    const tail=mesh("fish-fan",new THREE.ConeGeometry(11,14,3),gold,new THREE.Vector3(x,fy+36,z));tail.rotation.z=Math.PI;
    mesh("fish-eye",new THREE.SphereGeometry(1.5,6,4),dark,new THREE.Vector3(x,fy+4,z-4));
  }
  // Towers are set into the rear wall corners, away from the ramp and garden.
  for(const x of [-422,422]) {
    const p=world(x,410), ty=p.y;
    localBox("watchtower-stone",x,ty+27,410,82,54,82,stone);
    localBox("watchtower-room",x,ty+75,410,64,44,64,plaster);
    for(const side of [-1,1]) localBox("tower-window",x,ty+78,410+side*33,34,13,2,dark);
    roof(p.x,ty+99,p.z,90,90,30); reserve(p.x,p.z,76);
  }
  const gate=world(0,-420); gate.y=heightAt(gate.x,gate.z);
  for(const side of [-1,1]) {
    localBox("gate-post",side*88,gate.y+51,-420,16,102,20,timber);
    localBox("open-gate-leaf",side*94,gate.y+39,-389,9,76,56,timber);
  }
  localBox("gate-lintel",0,gate.y+104,-420,202,18,32,timber);
  roof(gate.x,gate.y+118,gate.z,225,100,42);
  // Walkways follow the exact sampler used by roots and feet. Raised routes have masonry beneath.
  for(const s of navigation.surfaces) {
    const dx=s.b.x-s.a.x,dz=s.b.z-s.a.z,length=Math.hypot(dx,dz), nx=-dz/length,nz=dx/length;
    const steps=Math.max(2,Math.ceil(length/12)), pos:number[]=[], uvs:number[]=[], idx:number[]=[];
    for(let i=0;i<=steps;i++) for(const side of [-1,1]) {
      const t=i/steps,x=s.a.x+dx*t+nx*s.width*.5*side,z=s.a.z+dz*t+nz*s.width*.5*side;
      pos.push(x,castleGroundY(navigation,x,z)+.15,z);uvs.push(side*s.width/110,t*length/110);
    }
    for(let i=0;i<steps;i++){const a=i*2;idx.push(a,a+1,a+2,a+1,a+3,a+2);}
    const geo=new THREE.BufferGeometry();geo.setAttribute("position",new THREE.Float32BufferAttribute(pos,3));geo.setAttribute("uv",new THREE.Float32BufferAttribute(uvs,2));geo.setIndex(idx);geo.computeVertexNormals();
    mesh(`path-${s.id}`,geo,s.terrain?stone:floor,new THREE.Vector3());
    reserveLine(s.a.x,s.a.z,s.b.x,s.b.z,s.width/2+20);
    if(!s.terrain && s.id.startsWith("ramp")) {
      for(let i=0;i<=steps;i+=3) {
        const t=i/steps,x=s.a.x+dx*t,z=s.a.z+dz*t,top=castleGroundY(navigation,x,z),bottom=heightAt(x,z);
        if(top-bottom>8) box("ramp-support",x,(top+bottom)/2-2,z,18,top-bottom,18,stone);
      }
      for(const side of [-1,1]) {
        const points:THREE.Vector3[]=[];
        // Leave the landing clear where railings from two different slopes meet.
        for(let i=Math.ceil(50/length*steps);i<=steps-Math.ceil(50/length*steps);i+=2) {
          const t=i/steps,x=s.a.x+dx*t+nx*(s.width/2+2)*side,z=s.a.z+dz*t+nz*(s.width/2+2)*side;
          const y=castleGroundY(navigation,s.a.x+dx*t,s.a.z+dz*t);
          trim(timber,x,y+17,z,4,34,4);points.push(new THREE.Vector3(x,y+33,z));
        }
        for(let i=1;i<points.length;i++) beam(points[i-1],points[i],2,timber);
      }
    }
  }
  for (const n of navigation.nodes.filter(n => n.id.startsWith("ramp") || n.id === "veranda")) {
    mesh("ramp-landing",new THREE.CylinderGeometry(44,44,4,16),floor,n.position.clone().add(new THREE.Vector3(0,-1.85,0)));
  }
  // An open tea shelter: no solid box hidden behind the doorway.
  const tea=world(345,-600);roof(tea.x,tea.y+102,tea.z,166,158,39);
  for(const side of [-1,1]) {
    const z=-600+side*43;
    localBox("tea-bench",345,tea.y+14,z,84,8,17,timber);
    for(const x of [318,372]) {
      const bottom=heightAt(CASTLE_CENTER.x+x,CASTLE_CENTER.y+z)-2,top=tea.y+10;
      if(top>bottom) localBox("tea-bench-leg",x,(top+bottom)/2,z,8,top-bottom,11,stone);
    }
  }
  reserve(tea.x,tea.z,107);
  const shrine=world(435,-820);roof(shrine.x,shrine.y+98,shrine.z,115,132,40);
  const shrineBottom = Math.min(...[-48,48].flatMap(x=>[-56,56].map(z=>heightAt(shrine.x+x,shrine.z+z))))-5;
  localBox("shrine-stone-plinth",435,(shrineBottom+shrine.y)/2,-820,96,shrine.y-shrineBottom,112,stone);
  localBox("shrine-door",392,shrine.y+51,-820,2,50,42,paper);
  for(const z of [-836,-825,-814,-803]) localBox("shrine-door-lattice",390,shrine.y+51,z,3,53,2,timber);
  for(const y of [shrine.y+32,shrine.y+51,shrine.y+70]) localBox("shrine-door-crossbar",389,y,-820,3,2,44,timber);
  beam(world(389,-859,shrine.y+84),world(389,-781,shrine.y+84),2,gold);
  for(const z of [-842,-798]) {
    const streamer=mesh("shrine-paper-streamer",new THREE.PlaneGeometry(6,18),paper,world(386,z,shrine.y+73));streamer.rotation.y=-Math.PI/2;
  }
  localBox("shrine-offering-shelf",382,shrine.y+25,-820,20,5,54,timber);
  reserve(shrine.x,shrine.z,93);
  // Dry garden, raked rings, three stones and a bench beside the walking lane.
  localBox("raked-gravel",-351,baseY+1,-155,108,2,165,gravel);
  localBox("garden-retaining-bed",-351,baseY-13,-155,108,26,165,stone);
  reserve(CASTLE_CENTER.x-351,CASTLE_CENTER.y-155,100);
  for(let i=0;i<3;i++) {
    const p=world(-365+(i%2)*23,-170+i*18,baseY+10+i*3);
    const rock=mesh("garden-stone",new THREE.DodecahedronGeometry(16+i*3,0),gardenStone,p);rock.scale.set(1,1.5,.8);
    for(let ring=0;ring<3;ring++) {const g=mesh("raked-ring",new THREE.TorusGeometry(23+i*4+ring*6,.5,3,32),paper,new THREE.Vector3(p.x,baseY+2.2,p.z));g.rotation.x=-Math.PI/2;g.scale.y=.7;}
  }
  localBox("garden-bench",-285,baseY+17,0,80,7,24,timber);
  for(const x of [-315,-255]) localBox("bench-leg",x,baseY+8,0,8,16,16,stone);
  // Lanterns, low planted beds and small clipped shrubs frame the destinations.
  for(const [x,z] of [[-75,-510],[75,-510],[-100,-365],[100,-365],[145,-760],[380,-730],[-270,-350],[210,345]]) {
    const p=world(x,z), y=p.y;
    localBox("lantern-plinth",x,y+3,z,24,6,24,stone);
    localBox("lantern-stem",x,y+21,z,9,34,9,stone);
    localBox("lantern-glow",x,y+43,z,18,16,18,paper);
    localBox("lantern-cap",x,y+54,z,29,6,29,tile);
    for(const sx of [-1,1]) for(const sz of [-1,1]) trim(timber,p.x+sx*9,y+43,p.z+sz*9,2,17,2);
    reserve(p.x,p.z,22);
  }
  for(const [x,z] of [[140,-680],[120,-790],[-360,-290],[-355,60],[220,-940],[380,-950]]) {
    const p=world(x,z);localBox("planting-bed",x,p.y+4,z,64,8,36,stone);
    for(let i=0;i<3;i++){const shrub=mesh("clipped-azalea",new THREE.IcosahedronGeometry(16,1),i===1?pink:leaf,new THREE.Vector3(p.x-20+i*20,p.y+17,p.z));shrub.scale.y=.7;}
    reserve(p.x,p.z,46);
  }
  for(const [mat,matrices] of batches) {
    const batch=new THREE.InstancedMesh(boxGeometry,mat,matrices.length); batch.name="castle-repeated-trim";
    matrices.forEach((matrix,i)=>batch.setMatrixAt(i,matrix));batch.instanceMatrix.needsUpdate=true;group.add(batch);
  }
  return { group, gatePoint: gate, navigation, groundY: (x,z)=>castleGroundY(navigation,x,z) };
};
