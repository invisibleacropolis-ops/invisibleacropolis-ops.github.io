import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { buildArticulatedKami, type KamiKind } from "./kamiCharacters.ts";
import "./kamiStudio.css";

/** Close-up review of the very same builders used by roaming and story actors.
 * No alternate models or animation mocks. Open /?kami to inspect them. */
const descriptions: Record<KamiKind, [string, string]> = {
  kitsune: ["Kitsune", "Nine jointed tails · fox-mask markings · listening ears"],
  shika: ["Shika", "Branching golden antlers · spotted coat · grazing and attention"],
  nekomata: ["Nekomata", "Twin curling tails · whiskers · alert ears and slit pupils"],
  tanuki: ["Tanuki", "Masked eyes · bell charm · finger joints and curious gestures"],
  kappa: ["Kappa", "Layered shell plates · water dish · articulated beak and hands"],
  oni: ["Oni", "Curved horns · tusks · tiger cloth · wrist-mounted kanabo"],
  baku: ["Baku", "Six-joint trunk · tusks · mane and softly curling tail"],
  kodama: ["Kodama", "Woodgrain rings · little hands and feet · head rattle"],
};
document.title = "Kami atelier — Kakuriyo";
document.querySelector(".ui")?.remove();
document.body.classList.add("kami-studio");
const panel = document.createElement("section");
panel.className = "kami-panel";
panel.innerHTML = `
  <a class="kami-back" href="/">← Return to the world</a>
  <p class="kami-eyebrow">KAKURIYO / CHARACTER STUDIES</p>
  <h1>Kami atelier<span>神の姿</span></h1>
  <p class="kami-intro">Meet the spirits up close. Drag to orbit, scroll to zoom.</p>
  <label for="kami-kind">Spirit</label>
  <select id="kami-kind">${Object.entries(descriptions).map(([key, [name]]) => `<option value="${key}">${name}</option>`).join("")}</select>
  <p id="kami-description"></p>
  <label for="kami-motion">Movement <output id="kami-motion-label">Idle</output></label>
  <input id="kami-motion" type="range" min="0" max="1" step="0.01" value="0" />
  <label class="kami-check"><input id="kami-skeleton" type="checkbox" /> Show articulated skeleton</label>
  <label class="kami-check"><input id="kami-slope" type="checkbox" /> Uneven ground / foot IK</label>
  <button id="kami-pause" type="button">Pause animation</button>
  <p id="kami-stats" class="kami-stats" aria-live="polite"></p>
  <p class="kami-note">Walking is demonstrated in place. Ground mode uses the live IK solver on the visible slope.</p>`;
document.body.append(panel);
const select = panel.querySelector<HTMLSelectElement>("#kami-kind")!;
const movement = panel.querySelector<HTMLInputElement>("#kami-motion")!;
const rigToggle = panel.querySelector<HTMLInputElement>("#kami-skeleton")!;
const slopeToggle = panel.querySelector<HTMLInputElement>("#kami-slope")!;
const pause = panel.querySelector<HTMLButtonElement>("#kami-pause")!;

const renderer = new THREE.WebGLRenderer({ canvas: document.querySelector<HTMLCanvasElement>("#scene")!, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.background = new THREE.Color("#d8d9cd");
scene.add(new THREE.HemisphereLight("#fff4dd", "#526258", 2));
const light = new THREE.DirectionalLight("#fff0d2", 3);
light.position.set(90, 170, 100);
light.castShadow = true;
light.shadow.mapSize.set(2048, 2048);
Object.assign(light.shadow.camera, { left: -95, right: 95, top: 95, bottom: -95, near: 1, far: 450 });
light.shadow.normalBias = 0.35;
scene.add(light);
const rim = new THREE.DirectionalLight("#a7c5dd", 1.5);
rim.position.set(-60, 80, -100);
scene.add(rim);
const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 1500);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.minDistance = 15;
controls.maxDistance = 420;
controls.maxPolarAngle = Math.PI * 0.49;
const groundGeometry = new THREE.PlaneGeometry(240, 240, 64, 64);
groundGeometry.rotateX(-Math.PI / 2);
const ground = new THREE.Mesh(groundGeometry, new THREE.MeshStandardMaterial({ color: "#9da990", roughness: 1, side: THREE.DoubleSide }));
ground.receiveShadow = true;
scene.add(ground);
const sampleSlope = (x: number, z: number) => 0.13 * x + Math.sin(z * 0.09) * 2;
const flatGround = () => 0;
const cache = new Map<KamiKind, ReturnType<typeof buildArticulatedKami>>();
let current: ReturnType<typeof buildArticulatedKami>;
let helper: THREE.SkeletonHelper | undefined;
let paused = false;
let time = 0;

function changeSpirit() {
  const kind = select.value as KamiKind;
  if (current) scene.remove(current.group);
  if (helper) { scene.remove(helper); helper.dispose(); }
  let build = cache.get(kind);
  if (!build) { build = buildArticulatedKami(kind); cache.set(kind, build); }
  current = build;
  current.setGroundSampler(slopeToggle.checked ? sampleSlope : flatGround);
  current.animate(time, 0.6, Number(movement.value));
  scene.add(current.group);
  current.group.updateMatrixWorld(true);
  helper = new THREE.SkeletonHelper(current.group);
  const helperMat = helper.material as THREE.LineBasicMaterial;
  helperMat.depthTest = false;
  helperMat.transparent = true;
  helper.renderOrder = 20;
  helper.visible = rigToggle.checked;
  scene.add(helper);
  const box = new THREE.Box3().setFromObject(current.group);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const extent = Math.max(size.x, size.y, size.z);
  controls.target.set(0, center.y, 0);
  camera.position.set(extent * 1.35, center.y + extent * 0.65, extent * 2.25);
  controls.update();
  panel.querySelector("#kami-description")!.textContent = descriptions[kind][1];
  let triangles = 0, meshes = 0;
  current.group.traverse((o) => {
    if (o instanceof THREE.Mesh) { meshes++; triangles += (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3; }
  });
  panel.querySelector("#kami-stats")!.textContent = `${current.skeleton.bones.length} bones · ${current.limbs.length} IK chains · ${Math.round(triangles).toLocaleString()} triangles · ${meshes} meshes`;
}
select.addEventListener("change", changeSpirit);
rigToggle.addEventListener("change", () => { if (helper) helper.visible = rigToggle.checked; });
slopeToggle.addEventListener("change", () => {
  const positions = groundGeometry.attributes.position;
  for (let i = 0; i < positions.count; i++) positions.setY(i, slopeToggle.checked ? sampleSlope(positions.getX(i), positions.getZ(i)) : 0);
  positions.needsUpdate = true;
  groundGeometry.computeVertexNormals();
  groundGeometry.computeBoundingSphere();
  current.setGroundSampler(slopeToggle.checked ? sampleSlope : flatGround);
});
movement.addEventListener("input", () => {
  panel.querySelector("#kami-motion-label")!.textContent = Number(movement.value) === 0 ? "Idle" : `${Math.round(Number(movement.value) * 100)}% walk`;
});
pause.addEventListener("click", () => { paused = !paused; pause.textContent = paused ? "Resume animation" : "Pause animation"; });
function resize() {
  const sidebar = innerWidth > 700 ? 330 : 0;
  const bottom = innerWidth <= 700 ? Math.min(350, innerHeight * 0.48) : 0;
  const width = innerWidth - sidebar, height = innerHeight - bottom;
  renderer.setSize(width, height);
  renderer.domElement.style.left = `${sidebar}px`;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);
resize();
changeSpirit();
const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.05);
  if (!paused) { time += dt; current.animate(time, 0.6, Number(movement.value)); }
  controls.update();
  renderer.render(scene, camera);
});
