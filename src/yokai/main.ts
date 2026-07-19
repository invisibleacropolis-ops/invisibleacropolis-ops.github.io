import * as THREE from "three";

import { createFlyControls } from "../controls/fps.ts";
import { createNavigationHub } from "../ui/navigationHub.ts";
import { KAKURIYO } from "./palette.ts";
import { WORLD_SIZE, TEMPLE_CENTER, heightAt, createTerrain } from "./terrain.ts";
import { createSky, SUN_DIRECTION } from "./sky.ts";
import { createMountains } from "./mountains.ts";
import { createClouds } from "./clouds.ts";
import { createFlora } from "./flora.ts";
import { createGroundDetail } from "./groundDetail.ts";
import { createWaterFeature } from "./water.ts";
import { createArchitecture } from "./architecture.ts";
import { createCastle } from "./castle.ts";
import { createVillage } from "./village.ts";
import { createSpirits } from "./spirits.ts";
import { createYokaiUi } from "./ui.ts";
import { configureCelOutlines, windStrength, windTime } from "./shaders.ts";
import { createCinematicRenderer } from "./cinematic.ts";
import { createStoryOverlay } from "./story/overlay.ts";
import { createStoryPlayer, type Story } from "./story/engine.ts";
import type { StoryWorld } from "./story/mood.ts";
import { worldGroundY } from "./story/motion.ts";
import { createFoxStarStory } from "./story/foxStar.ts";
import { createTanukiMoonStory } from "./story/tanukiMoon.ts";
import { createDragonRainStory } from "./story/dragonRain.ts";
import { createOniKodamaStory } from "./story/oniKodama.ts";

/**
 * Kakuriyo (隠り世) — the hidden world. A mystical vision of Japan from
 * the perspective of its kami and yokai: golden-hour light over rolling
 * green hills, a shrine on its plateau, the sacred peak in the haze, and
 * the spirit-folk wandering about their unhurried business.
 */

const canvas = document.querySelector<HTMLCanvasElement>("#scene");
const uiRoot = document.querySelector<HTMLElement>(".ui");
if (!canvas || !uiRoot) throw new Error("Kakuriyo: missing #scene canvas or .ui root");

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(new THREE.Color(KAKURIYO.hazeColor), 1500, 8600);

const camera = new THREE.PerspectiveCamera(51, window.innerWidth / window.innerHeight, 1, 24000);

/* ── Light of the eternal golden hour ── */
const sun = new THREE.DirectionalLight(KAKURIYO.sunColor, 2.2);
sun.position.copy(SUN_DIRECTION).multiplyScalar(6000);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -3200;
sun.shadow.camera.right = 3200;
sun.shadow.camera.top = 3200;
sun.shadow.camera.bottom = -3200;
sun.shadow.camera.near = 500;
sun.shadow.camera.far = 11000;
sun.shadow.bias = -0.00035;
sun.shadow.normalBias = 1.4;
sun.shadow.radius = 3.2;
scene.add(sun);
sun.target.position.set(TEMPLE_CENTER.x, 0, TEMPLE_CENTER.y);
scene.add(sun.target);

const skyFill = new THREE.HemisphereLight("#c7d9ec", "#526b55", 0.66);
scene.add(skyFill);
const warmAmbient = new THREE.AmbientLight("#ffe7c9", 0.17);
scene.add(warmAmbient);

// A cool, shadowless edge light separates silhouettes from the mist and gives
// characters the polished two-light treatment common to modern anime games.
const spiritRim = new THREE.DirectionalLight("#9ec9ff", 0.48);
spiritRim.position.set(3600, 2100, 4200);
scene.add(spiritRim);

/* ── The world ── */
const sky = createSky();
scene.add(sky.mesh);

const terrain = createTerrain();
scene.add(terrain);

const mountains = createMountains();
scene.add(mountains);

const clouds = createClouds();
scene.add(clouds.group);

// Structures claim their ground in the occupancy register first;
// only then does the flora scatter around them.
const water = createWaterFeature();
scene.add(water.group);

const architecture = createArchitecture();
scene.add(architecture.group);

const castle = createCastle();
scene.add(castle.group);

const village = createVillage();
scene.add(village.group);

const groundDetail = createGroundDetail();
scene.add(groundDetail.group);

const flora = createFlora();
scene.add(flora.group);

const spirits = createSpirits({
  sakuraSpots: flora.sakuraSpots,
  toriiPath: architecture.toriiPath,
  pagodaTop: architecture.pagodaTop,
  castleGate: castle.gatePoint,
  villageSquare: village.square,
});
scene.add(spirits.group);

// Opaque authored geometry participates in the new shadow pipeline. Shader
// surfaces (sky, water, clouds, grass) keep their specialized depth behavior.
scene.traverse((object) => {
  if (!(object instanceof THREE.Mesh)) return;
  const materials = Array.isArray(object.material) ? object.material : [object.material];
  const opaqueLitSurface = materials.some(
    (material) => !material.transparent && !(material instanceof THREE.ShaderMaterial),
  );
  if (!opaqueLitSurface) return;
  object.receiveShadow = true;
  // Local authored forms keep grounding shadows; vast mountain hulls and the
  // instanced forest no longer paint hard graphic bars across the whole valley.
  object.castShadow = object !== terrain && !(object instanceof THREE.InstancedMesh);
});
mountains.traverse((object) => {
  if (object instanceof THREE.Mesh) object.castShadow = false;
});
configureCelOutlines(scene);

const cinematic = createCinematicRenderer(renderer, scene, camera);

/* ── UI ── */
const ui = createYokaiUi(uiRoot);
const navigationHub = createNavigationHub({ root: uiRoot });

// The hub appends a bare trigger; give it a corner to live in
const hudCorner = document.createElement("div");
hudCorner.className = "yokai-hud";
uiRoot.append(hudCorner);
const hubTrigger = uiRoot.querySelector(".nav-hub__trigger");
if (hubTrigger) hudCorner.append(hubTrigger);

/* ── Camera: a slow spirit-drift until the visitor takes the reins ── */
const controls = createFlyControls({
  camera,
  domElement: canvas,
  baseSpeed: 85,
  // Truly free flight: hang still until a key is held
  cruise: false,
  // While a tale owns the camera, clicks must not grab the pointer
  shouldLock: () => !storyPlayer.isActive(),
});

let freeFlight = false;
let driftAngle = Math.PI * 0.7;
const lookTarget = new THREE.Vector3(TEMPLE_CENTER.x, 190, TEMPLE_CENTER.y);

/* ── Tales of Kakuriyo ── */
const storyOverlay = createStoryOverlay(uiRoot);
const storyPlayer = createStoryPlayer({
  camera,
  overlay: storyOverlay,
  groundY: worldGroundY,
  // Solid scenery only — the boom ignores soft foliage on purpose
  occluders: [terrain, mountains, architecture.group, castle.group, village.group],
  onFinished: () => {
    // The tale releases the camera; the spirit-drift resumes
    freeFlight = false;
    ui.showIntro();
  },
});

const storyWorld: StoryWorld = {
  scene,
  sky,
  sun,
  skyFill,
  warmAmbient,
  fog: scene.fog as THREE.Fog,
  toriiPath: architecture.toriiPath,
  spirits,
  water,
  castleGate: castle.gatePoint,
  sakuraSpots: flora.sakuraSpots,
};

// The library of tales, each on its own key from the splash screen
const TALES: Record<string, (world: StoryWorld) => Story> = {
  Digit1: createFoxStarStory,
  Digit2: createTanukiMoonStory,
  Digit3: createDragonRainStory,
  Digit4: createOniKodamaStory,
};

const beginTale = (factory: (world: StoryWorld) => Story) => {
  if (storyPlayer.isActive()) return;
  freeFlight = false;
  document.exitPointerLock();
  ui.dismissIntro();
  storyPlayer.play(factory(storyWorld));
};

window.addEventListener("keydown", (event) => {
  const factory = TALES[event.code];
  if (factory && !storyPlayer.isActive()) {
    beginTale(factory);
  }
});

document.addEventListener("pointerlockchange", () => {
  if (document.pointerLockElement === canvas && !storyPlayer.isActive()) {
    freeFlight = true;
    ui.dismissIntro();
  }
});

const clock = new THREE.Clock();

const animate = () => {
  const dt = Math.min(0.05, clock.getDelta());
  const t = clock.elapsedTime;

  if (storyPlayer.isActive()) {
    // Debug hook: lets tests fast-forward a tale (unset = real time)
    const speed = (window as Window & { __STORY_SPEED__?: number }).__STORY_SPEED__ ?? 1;
    storyPlayer.update(t, dt * speed);
  } else if (freeFlight) {
    controls.update(dt);
    // Stay above the land and inside the painting
    const minY = heightAt(camera.position.x, camera.position.z) + 10;
    if (camera.position.y < minY) camera.position.y = minY;
    camera.position.y = Math.min(camera.position.y, 3200);
    const bound = WORLD_SIZE * 0.55;
    camera.position.x = THREE.MathUtils.clamp(camera.position.x, -bound, bound);
    camera.position.z = THREE.MathUtils.clamp(camera.position.z, -bound, bound);
  } else {
    // The kami's-eye drift: a slow circle of the valley, watching the shrine
    driftAngle += dt * 0.016;
    const r = 2350;
    const x = TEMPLE_CENTER.x + Math.cos(driftAngle) * r;
    const z = TEMPLE_CENTER.y + Math.sin(driftAngle) * r;
    const groundY = heightAt(x, z);
    camera.position.set(x, Math.max(560, groundY + 440), z);
    camera.lookAt(lookTarget);
  }

  windTime.value += dt * windStrength.value;
  sky.update(t);
  clouds.update(t, dt);
  flora.update(t, dt);
  water.update(t);
  architecture.update(t);
  spirits.update(t, dt);

  cinematic.render(t);
  requestAnimationFrame(animate);
};

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  cinematic.resize(window.innerWidth, window.innerHeight);
});

window.addEventListener("beforeunload", () => {
  navigationHub.dispose();
  groundDetail.dispose();
  ui.dispose();
  controls.dispose();
});

requestAnimationFrame(animate);
ui.reveal();
