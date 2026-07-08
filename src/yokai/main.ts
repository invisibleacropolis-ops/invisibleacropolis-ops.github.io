import * as THREE from "three";

import { createFlyControls } from "../controls/fps.ts";
import { createNavigationHub } from "../ui/navigationHub.ts";
import { KAKURIYO } from "./palette.ts";
import { WORLD_SIZE, TEMPLE_CENTER, heightAt, createTerrain } from "./terrain.ts";
import { createSky, SUN_DIRECTION } from "./sky.ts";
import { createMountains } from "./mountains.ts";
import { createClouds } from "./clouds.ts";
import { createFlora } from "./flora.ts";
import { createWaterFeature } from "./water.ts";
import { createArchitecture } from "./architecture.ts";
import { createCastle } from "./castle.ts";
import { createVillage } from "./village.ts";
import { createSpirits } from "./spirits.ts";
import { createYokaiUi } from "./ui.ts";
import { createStoryOverlay } from "./story/overlay.ts";
import { createStoryPlayer, type Story } from "./story/engine.ts";
import type { StoryWorld } from "./story/mood.ts";
import { createFoxStarStory } from "./story/foxStar.ts";
import { createTanukiMoonStory } from "./story/tanukiMoon.ts";

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
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(new THREE.Color(KAKURIYO.hazeColor), 1500, 8600);

const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 1, 24000);

/* ── Light of the eternal golden hour ── */
const sun = new THREE.DirectionalLight(KAKURIYO.sunColor, 2.1);
sun.position.copy(SUN_DIRECTION).multiplyScalar(6000);
scene.add(sun);
const skyFill = new THREE.HemisphereLight("#bcd4ee", "#5d7a52", 0.85);
scene.add(skyFill);
const warmAmbient = new THREE.AmbientLight("#ffe4c2", 0.32);
scene.add(warmAmbient);

/* ── The world ── */
const sky = createSky();
scene.add(sky.mesh);

const terrain = createTerrain();
scene.add(terrain);

scene.add(createMountains());

const clouds = createClouds();
scene.add(clouds.group);

const flora = createFlora();
scene.add(flora.group);

const water = createWaterFeature();
scene.add(water.group);

const architecture = createArchitecture();
scene.add(architecture.group);

const castle = createCastle();
scene.add(castle.group);

const village = createVillage();
scene.add(village.group);

const spirits = createSpirits({
  sakuraSpots: flora.sakuraSpots,
  toriiPath: architecture.toriiPath,
  pagodaTop: architecture.pagodaTop,
  castleGate: castle.gatePoint,
  villageSquare: village.square,
});
scene.add(spirits.group);

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
  // While a tale owns the camera, clicks must not grab the pointer
  shouldLock: () => !storyPlayer.isActive(),
});

let freeFlight = false;
let driftAngle = Math.PI * 0.7;
const lookTarget = new THREE.Vector3(TEMPLE_CENTER.x, 320, TEMPLE_CENTER.y);

/* ── Tales of Kakuriyo ── */
const storyOverlay = createStoryOverlay(uiRoot);
const storyPlayer = createStoryPlayer({
  camera,
  overlay: storyOverlay,
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
};

// The library of tales, each on its own key from the splash screen
const TALES: Record<string, (world: StoryWorld) => Story> = {
  Digit1: createFoxStarStory,
  Digit2: createTanukiMoonStory,
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
    const r = 1850;
    const x = TEMPLE_CENTER.x + Math.cos(driftAngle) * r;
    const z = TEMPLE_CENTER.y + Math.sin(driftAngle) * r;
    const groundY = heightAt(x, z);
    camera.position.set(x, Math.max(380, groundY + 240), z);
    camera.lookAt(lookTarget);
  }

  sky.update(t);
  clouds.update(t, dt);
  flora.update(t, dt);
  water.update(t);
  architecture.update(t);
  spirits.update(t, dt);

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
};

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

window.addEventListener("beforeunload", () => {
  navigationHub.dispose();
  ui.dispose();
  controls.dispose();
});

requestAnimationFrame(animate);
ui.reveal();
