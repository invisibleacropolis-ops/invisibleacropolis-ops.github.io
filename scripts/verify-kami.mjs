// Exercises the production builders and IK solver, using real Three.js world
// matrices and geometry. No renderer, terrain, or skeletal-operation mocks.
import assert from "node:assert/strict";
import { build } from "esbuild";
import * as THREE from "three";

const bundled = await build({
  stdin: { contents: 'export * from "./src/yokai/kamiCharacters.ts"; export * from "./src/yokai/kamiRig.ts"; export { worldGroundY } from "./src/yokai/story/motion.ts";', resolveDir: process.cwd() },
  bundle: true, write: false, platform: "node", format: "esm", logLevel: "silent",
});
const { buildArticulatedKami, TwoBoneIK, worldGroundY } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`);
const root = new THREE.Group();
const chain = new TwoBoneIK(root, new THREE.Vector3(0, 10, 0), 6, 5, new THREE.Vector3(0, 0, 1), "verification");
const end = new THREE.Vector3();
for (const target of [new THREE.Vector3(2, 1, 3), new THREE.Vector3(0, 10, 0), new THREE.Vector3(0, -100, 0), new THREE.Vector3(0, 10, 8)]) {
  chain.solve(target);
  root.updateMatrixWorld(true);
  chain.end.getWorldPosition(end);
  assert.ok(end.distanceTo(chain.target) < 1e-6, "End effector must reach the clamped analytic target");
  assert.ok(Math.abs(chain.joint.distanceTo(chain.origin) - 6) < 1e-6);
  assert.ok(Math.abs(chain.target.distanceTo(chain.joint) - 5) < 1e-6);
  assert.ok(chain.upper.quaternion.toArray().every(Number.isFinite), "Singular poses must be finite");
}
console.log("PASS analytic IK: reachable, zero-distance, overreach, pole-aligned targets");

const names = ["kitsune", "shika", "nekomata", "baku", "tanuki", "kappa", "oni", "kodama"];
for (const kind of names) {
  const model = buildArticulatedKami(kind);
  const travel = new THREE.Group();
  travel.scale.setScalar(1.7);
  travel.add(model.group);
  // Story-owned transforms must survive every animation frame.
  model.group.position.set(0, 0.2, 0);
  model.group.rotation.set(0.08, 0.1, -0.04);
  const position = model.group.position.clone(), rotation = model.group.quaternion.clone();
  let meshes = 0, triangles = 0;
  model.group.traverse((object) => {
    if (object.isMesh) {
      meshes++;
      triangles += (object.geometry.index?.count ?? object.geometry.attributes.position.count) / 3;
      assert.ok([...object.geometry.attributes.position.array].every(Number.isFinite));
    }
  });
  assert.ok(model.skeleton.bones.length > 20);
  assert.ok(model.limbs.length >= 4);
  for (let frame = 0; frame < 720; frame++) {
    const t = frame / 60;
    travel.position.set(1400 + t * 35, 0, 1800 + Math.sin(t) * 20);
    travel.position.y = worldGroundY(travel.position.x, travel.position.z);
    travel.rotation.y = Math.sin(t * 0.3);
    model.animate(t, 1.2, frame < 180 ? 0 : frame < 240 ? (frame - 180) / 60 : 1);
    travel.updateMatrixWorld(true);
    assert.ok(model.group.position.equals(position), "Animation overwrote story placement");
    assert.ok(model.group.quaternion.equals(rotation), "Animation overwrote story bow/turn");
    for (const limb of model.limbs) {
      limb.end.getWorldPosition(end);
      limb.root.worldToLocal(end);
      assert.ok(end.distanceTo(limb.target) < 1e-5, `${kind}: actual bones missed IK target`);
    }
    for (const bone of model.skeleton.bones) assert.ok(bone.matrixWorld.elements.every(Number.isFinite), `${kind}: invalid bone transform`);
  }
  model.animate(0, 0, 0); // Story rewind / replay must not poison the state.
  model.setGroundSampler(undefined);
  model.animate(1000, 0, 1); // Large time jump / resume.
  travel.updateMatrixWorld(true);
  model.group.traverse((object) => {
    if (!object.isSkinnedMesh) return;
    object.skeleton.update();
    const positions = object.geometry.attributes.position;
    const weights = object.geometry.attributes.skinWeight;
    for (let i = 0; i < positions.count; i++) {
      assert.ok(Math.abs(weights.getX(i) + weights.getY(i) - 1) < 1e-6, "Tail weights must sum to one");
      end.fromBufferAttribute(positions, i);
      object.applyBoneTransform(i, end);
      assert.ok(end.toArray().every(Number.isFinite) && end.length() < 200, `${kind}: invalid deformed tail vertex`);
    }
    object.skeleton.computeBoneTexture();
    assert.ok(object.skeleton.boneTexture);
    object.geometry.dispose();
    assert.equal(object.skeleton.boneTexture, null, "Story geometry disposal must release the tail bone texture");
  });
  if (kind === "kitsune") assert.equal(model.skeleton.bones.filter((b) => /^tail\.\d+\.0$/.test(b.name)).length, 9);
  console.log(`PASS ${kind}: ${model.skeleton.bones.length} bones, ${model.limbs.length} IK chains, ${meshes} meshes, ${triangles} triangles; 720 live-terrain animation frames`);
}
const actorA = buildArticulatedKami("kitsune"), actorB = buildArticulatedKami("kitsune");
const resourcesA = new Set();
actorA.group.traverse((o) => {
  if (!o.isMesh) return;
  resourcesA.add(o.geometry);
  (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => resourcesA.add(m));
});
actorB.group.traverse((o) => {
  if (!o.isMesh) return;
  assert.ok(!resourcesA.has(o.geometry), "Story and ambient actors must not share disposable geometry");
  (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => assert.ok(!resourcesA.has(m), "Story and ambient actors must not share disposable materials"));
});
console.log("PASS weighted tail deformation, bone-texture cleanup, independent story/ambient GPU resources");
console.log("PASS all 8 production models; 5,760 animation frames; story transforms preserved");
