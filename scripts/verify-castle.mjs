// Real production layout, terrain, A* and movement; no mocked scene or pathfinder.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const bundled = await build({ stdin: { contents: 'export * from "./src/yokai/castleLayout.ts"; export * from "./src/yokai/castleVisits.ts"; export { heightAt } from "./src/yokai/terrain.ts";', resolveDir: process.cwd() }, bundle: true, write: false, platform: 'node', format: 'esm', logLevel: 'silent' });
const { createCastleLayout, findCastleRoute, castleSegmentClear, castleGroundY, createCastleVisitor, advanceCastleVisit, planCastleVisit, heightAt } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
const layout = createCastleLayout();
let routes = 0, samples = 0;
for (const start of ['approach','forecourt']) for (const radius of [18,20,24,26,30,34]) for (const goal of layout.nodes.filter(n => n.destination && n.clearance >= radius)) {
  const route = findCastleRoute(layout, start, goal.id, radius);
  assert.ok(route, `Unreachable ${goal.id} at radius ${radius}`);
  for (let j = 1; j < route.length; j++) {
    const a = route[j-1].position, b = route[j].position;
    assert.ok(castleSegmentClear(layout, a, b, radius), `Blocked ${route[j-1].id} -> ${route[j].id}`);
    let last;
    const steps = Math.ceil(a.distanceTo(b));
    for (let i=0;i<=steps;i++) {
      const p=a.clone().lerp(b,i/steps), y=castleGroundY(layout,p.x,p.z);
      assert.ok(Number.isFinite(y));
      if(last!==undefined) assert.ok(Math.abs(y-last)<3, `Surface step ${route[j-1].id}:${route[j].id} ${Math.abs(y-last)}`);
      last=y;samples++;
    }
  }
  routes++;
}
for(const dt of [1/120,1/60,1/24,.25,1]) {
  const route=findCastleRoute(layout,'forecourt','archive',24);
  const pos=route[0].position.clone();
  const visitor=createCastleVisitor(pos,24,true,false,0);
  visitor.route=route.map(n=>n.position.clone());visitor.destination=layout.byId.get('archive');
  for(let i=0;i<20000 && visitor.route.length;i++) {
    advanceCastleVisit(layout,visitor,pos,62*dt);
    assert.ok(Math.abs(pos.y-castleGroundY(layout,pos.x,pos.z))<1e-6);
    assert.ok(castleSegmentClear(layout,pos,pos,24),`Visitor collision at ${pos.toArray()}`);
  }
  assert.equal(visitor.node,'archive');assert.ok(pos.distanceTo(layout.byId.get('archive').position)<.01);
  visitor.trips=2;visitor.entrance='forecourt';visitor.connector=[layout.byId.get('forecourt').position.clone()];
  assert.ok(planCastleVisit(layout,visitor,pos,()=>.5));
  for(let i=0;i<20000 && visitor.route.length;i++) advanceCastleVisit(layout,visitor,pos,62*dt);
  assert.equal(visitor.node,undefined);assert.equal(visitor.trips,0);
}
assert.equal(findCastleRoute(layout,'forecourt','archive',34),null,'Large visitors cannot enter small rooms');
assert.equal(findCastleRoute(layout,'missing','archive',20),null);
const blocked = {...layout, edges: layout.edges.filter(e=>!e.includes('gate'))};
assert.equal(findCastleRoute(blocked,'forecourt','hall',20),null,'Disconnected gate must be unreachable');
console.log(`PASS castle: ${routes} production routes, ${samples} surface samples; real movement and return at 120/60/24/4/1 fps; clearance and disconnected-gate checks`);
