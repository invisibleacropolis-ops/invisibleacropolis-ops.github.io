// Exercises the production builders and IK solver, using real Three.js world
// matrices and geometry. No renderer, terrain, or skeletal-operation mocks.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { build } from "esbuild";
import * as THREE from "three";

const bundled = await build({
  stdin: { contents: 'export * from "./src/yokai/kamiCharacters.ts"; export * from "./src/yokai/kamiRig.ts"; export { worldGroundY } from "./src/yokai/story/motion.ts"; export { registerSculptModel } from "./src/yokai/kamiModels.ts"; export { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";', resolveDir: process.cwd() },
  bundle: true, write: false, platform: "node", format: "esm", logLevel: "silent",
});
const { buildArticulatedKami, TwoBoneIK, worldGroundY, registerSculptModel, GLTFLoader } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`);
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
function exercise(kind, label = kind) {
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
  console.log(`PASS ${label}: ${model.skeleton.bones.length} bones, ${model.limbs.length} IK chains, ${meshes} meshes, ${triangles} triangles; 720 live-terrain animation frames`);
}
names.forEach((kind) => exercise(kind));

function assertIndependentActors(label) {
  const actorA = buildArticulatedKami("kitsune"), actorB = buildArticulatedKami("kitsune");
  const resourcesA = new Set();
  actorA.group.traverse((o) => {
    if (!o.isMesh) return;
    resourcesA.add(o.geometry);
    (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => resourcesA.add(m));
  });
  actorB.group.traverse((o) => {
    if (!o.isMesh) return;
    assert.ok(!resourcesA.has(o.geometry), `${label}: story and ambient actors must not share disposable geometry`);
    (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => assert.ok(!resourcesA.has(m), `${label}: story and ambient actors must not share disposable materials`));
  });
}
assertIndependentActors("procedural kitsune");
console.log("PASS weighted tail deformation, bone-texture cleanup, independent story/ambient GPU resources");
console.log("PASS all 8 production models; 5,760 animation frames; story transforms preserved");

// Canine legs: at rest the front elbow points back and sits at chest-bottom
// height over a near-vertical forearm; the hind stifle points forward and the
// hock rides high behind the paw.
{
  const fox = buildArticulatedKami("kitsune");
  fox.setGroundSampler(undefined);
  fox.animate(0, 0, 0);
  fox.group.updateMatrixWorld(true);
  const at = (bone) => fox.group.worldToLocal(bone.getWorldPosition(new THREE.Vector3()));
  for (const [i, leg] of fox.limbs.entries()) {
    assert.ok(leg.cannon, "kitsune legs are digitigrade");
    const hip = at(leg.upper), knee = at(leg.lower), wrist = at(leg.wrist), paw = at(leg.end);
    if (i < 2) {
      assert.ok(knee.z < hip.z - 3 && knee.z < wrist.z, "front elbow must point back");
      assert.ok(knee.y > 14 && knee.y < 19, `front elbow at chest-bottom height (${knee.y.toFixed(1)})`);
      const lean = Math.atan2(Math.abs(wrist.z - knee.z), knee.y - wrist.y);
      assert.ok(lean < 0.3, `forearm near vertical (${lean.toFixed(2)} rad)`);
    } else {
      assert.ok(knee.z > hip.z + 3 && knee.z > wrist.z, "hind stifle must point forward");
      assert.ok(wrist.z < paw.z && wrist.y > 5, "hock rides high, behind the paw");
    }
  }
  console.log("PASS canine leg anatomy: elbows back over vertical forearms, stifles forward, high hocks");
}

// Gaits: footfall order, support, flight and spine motion over two strides.
function stride(gait) {
  const fox = buildArticulatedKami("kitsune");
  fox.setGroundSampler(undefined);
  fox.setGait(gait);
  const dt = 1 / 240;
  let t = 0;
  for (; t < 6; t += dt) fox.animate(t, 0, 1);
  const chest = fox.group.getObjectByName("chest");
  const names = ["F-", "F+", "H-", "H+"];
  const paw = new THREE.Vector3();
  let previous = [true, true, true, true], fewest = 4, flight = 0, minFlex = Infinity, maxFlex = -Infinity;
  const touchdowns = [];
  for (let i = 0; i < 480; i++) {
    t += dt;
    fox.animate(t, 0, 1);
    fox.group.updateMatrixWorld(true);
    const planted = fox.limbs.map((leg) => fox.group.worldToLocal(leg.end.getWorldPosition(paw)).y < 2.06);
    planted.forEach((down, j) => { if (down && !previous[j]) touchdowns.push({ leg: names[j], i }); });
    previous = planted;
    const count = planted.filter(Boolean).length;
    fewest = Math.min(fewest, count);
    if (!count) flight++;
    minFlex = Math.min(minFlex, chest.rotation.x);
    maxFlex = Math.max(maxFlex, chest.rotation.x);
  }
  return { touchdowns, fewest, flight, minFlex, maxFlex };
}
const cyclicOrder = (touchdowns, expected) => {
  const order = touchdowns.map((d) => d.leg).join(" ");
  return expected.some((_, k) => order.includes([...expected.slice(k), ...expected.slice(0, k)].join(" ")));
};
{
  const walk = stride("walk");
  assert.ok(cyclicOrder(walk.touchdowns, ["H-", "F-", "H+", "F+"]), "walk is a lateral-sequence four-beat");
  assert.ok(walk.fewest >= 2 && walk.flight === 0, "a walk always keeps at least two paws down");
  const trot = stride("trot");
  const byLeg = (leg) => trot.touchdowns.filter((d) => d.leg === leg).map((d) => d.i);
  const diagonal = (a, b) => byLeg(a).every((i) => byLeg(b).some((j) => Math.abs(i - j) <= 3));
  assert.ok(diagonal("F-", "H+") && diagonal("F+", "H-"), "trot lands diagonal pairs together");
  assert.ok(Math.max(Math.abs(trot.minFlex), Math.abs(trot.maxFlex)) < 0.03, "a trotting spine stays nearly rigid");
  const gallop = stride("gallop");
  assert.ok(cyclicOrder(gallop.touchdowns, ["H-", "H+", "F+", "F-"]), "gallop is rotary: hind, hind, opposite fore, fore");
  assert.ok(gallop.flight > 0, "the gallop has a flight phase");
  assert.ok(gallop.maxFlex > 0.12 && gallop.minFlex < -0.12, `gallop spine flexes and extends (${gallop.minFlex.toFixed(2)}..${gallop.maxFlex.toFixed(2)} rad)`);
  console.log(`PASS gaits: lateral-sequence walk, diagonal trot, rotary gallop with flight and ${(gallop.minFlex * 57.3).toFixed(0)}°..${(gallop.maxFlex * 57.3).toFixed(0)}° spine flex`);
}

// The sculpted kitsune from public/kami/models must dress the very same rig.
const glb = readFileSync("public/kami/models/kitsune.glb");
const gltf = await new GLTFLoader().parseAsync(glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength), "");
const sculpt = registerSculptModel("kitsune", gltf.scene);
const expectedParts = ["chest", "neck", "head", "jaw", "charm", "eye_n", "eye_p", "brow_n", "brow_p", "ear_n", "ear_p",
  "leg_front_upper", "leg_front_lower", "leg_front_cannon", "leg_hind_upper", "leg_hind_lower", "leg_hind_cannon", "paw", "tail"];
for (const part of expectedParts) assert.ok(sculpt.has(part), `kitsune.glb is missing part ${part}`);
const dressed = buildArticulatedKami("kitsune");
let sculpted = 0, tails = 0;
dressed.group.traverse((o) => {
  if (!o.isMesh) return;
  assert.ok(o.name.endsWith(".sculpt") || o.name.endsWith(".surface"), `primitive blockout left on the sculpted kitsune: ${o.name}`);
  if (o.isSkinnedMesh) tails++; else sculpted++;
});
assert.equal(tails, 9 + 1, "Nine sculpted tails and the flexing torso");
assert.equal(sculpted, 4 + 6 + 4 * 4, "Every bone dressed exactly once");
exercise("kitsune", "sculpted kitsune");
assertIndependentActors("sculpted kitsune");
console.log("PASS sculpted kitsune: every part dressed, nine skinned tails, independent actor resources");
