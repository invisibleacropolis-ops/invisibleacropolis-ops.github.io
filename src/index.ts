import * as THREE from "three";
import Stats from "three/examples/jsm/libs/stats.module.js";

import { createPostProcessing } from "./effects/postprocessing.ts";
import { createRayBurst } from "./effects/rayBurst.ts";
import { createWeatherEffects } from "./effects/weather.ts";
import { createFpsControls } from "./controls/fps.ts";
import { createProximityEffect } from "./effects/proximityEffect.ts";
import { createLinks } from "./scene/links.ts";
import { createRoads } from "./scene/roads.ts";
import { createProps } from "./scene/props.ts";
import { createSky } from "./scene/sky.ts";
import { createTerrainMesh } from "./scene/terrain.ts";
import { createValleyMesh } from "./scene/valleys.ts";
import { createWater } from "./scene/water.ts";
import { WORLD_PALETTE } from "./scene/palette.ts";
import { createDevPanel } from "./dev/devPanel.ts";

const canvas = document.querySelector<HTMLCanvasElement>("#scene");

if (!canvas) {
  throw new Error("Canvas element #scene not found.");
}

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;

const scene = new THREE.Scene();
scene.background = new THREE.Color("#050608");

const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 2000);

const postProcessing = createPostProcessing({
  renderer,
  scene,
  camera,
  antiAlias: "smaa",
  bloom: {
    strength: 0.6,
    radius: 0.3,
    threshold: 0.4,
  },
});

// Create dev panel with bloom controls
const devPanel = createDevPanel({
  bloomPass: postProcessing.bloomPass,
});

const world = new THREE.Group();
scene.add(world);

const WORLD_SEED = 1337;

const terrain = createTerrainMesh({
  seed: WORLD_SEED,
  width: 140,
  depth: 140,
  segments: 80,
  height: 26,
  palette: WORLD_PALETTE,
});
world.add(terrain.mesh);

const fpsControls = createFpsControls({
  camera,
  domElement: renderer.domElement,
  heightAt: terrain.heightAt,
  eyeHeight: 1.7,
  moveSpeed: 60,
});

camera.position.set(0, terrain.heightAt(0, 0) + 1.7, 6);

const valleyMesh = createValleyMesh({
  seed: WORLD_SEED,
  width: terrain.width,
  depth: terrain.depth,
  segments: terrain.segments,
  height: terrain.height * 0.9,
  palette: WORLD_PALETTE,
});
valleyMesh.position.y = 0.05;
world.add(valleyMesh);

const roads = createRoads({
  seed: WORLD_SEED,
  width: terrain.width,
  depth: terrain.depth,
  count: 4,
  elevation: 0.15,
  palette: WORLD_PALETTE,
  heightAt: terrain.heightAt,
});
world.add(roads);

const water = createWater({
  seed: WORLD_SEED,
  width: terrain.width,
  depth: terrain.depth,
  amplitude: 0.18,
  speed: 0.7,
  tint: WORLD_PALETTE[0],
  elevation: 0.08,
  riverCount: 3,
  riverWidth: 0.2,
  palette: WORLD_PALETTE,
  heightAt: terrain.heightAt,
});
world.add(water.mesh);
world.add(water.rivers);

const props = createProps({
  seed: WORLD_SEED,
  width: terrain.width,
  depth: terrain.depth,
  heightAt: terrain.heightAt,
  palette: WORLD_PALETTE,
});
world.add(props);

const ambientLight = new THREE.AmbientLight("#9aa8ff", 0.6);
scene.add(ambientLight);

const keyLight = new THREE.DirectionalLight("#ffffff", 0.5);
keyLight.position.set(3, 6, 6);
scene.add(keyLight);

const sky = createSky({
  radius: 1200,
  seed: WORLD_SEED,
  topColor: "#2e6edb",
  bottomColor: "#f2f6ff",
  nightColor: "#020512",
  cloudScale: 0.45,
  cloudSpeed: 0.02,
  cloudIntensity: 0.5,
  starCount: 360,
  dayDuration: 180,
});
scene.add(sky.mesh, sky.stars);

const weather = createWeatherEffects({
  scene,
  seed: WORLD_SEED,
  areaWidth: terrain.width * 1.4,
  areaDepth: terrain.depth * 1.4,
  fogColor: "#8aa3c7",
  fogDensity: 0.002,
  rainEnabled: false,
});
scene.add(weather.group);

const dayAmbient = new THREE.Color("#9aa8ff");
const nightAmbient = new THREE.Color("#1f2b50");
const daySun = new THREE.Color("#ffffff");
const duskSun = new THREE.Color("#ffb978");



const rayBurst = createRayBurst({
  scene,
  color: "#b7c9ff",
  raysPerSecond: 20,
  maxRays: 80,
});

const proximityEffect = createProximityEffect({
  maxDistance: 40,
  minDistance: 8,
});

const state = {
  lastTime: 0,
};

let linksScene: Awaited<ReturnType<typeof createLinks>> | null = null;
const stats = new Stats();
const debugState = {
  enabled: false,
};

const setDebugEnabled = (enabled: boolean) => {
  debugState.enabled = enabled;
  if (enabled) {
    stats.showPanel(0);
    stats.dom.style.cssText =
      "position:fixed;top:0;left:0;z-index:9999;opacity:0.9;pointer-events:none;";
    document.body.appendChild(stats.dom);
  } else if (stats.dom.parentElement) {
    stats.dom.parentElement.removeChild(stats.dom);
  }
};

const resize = () => {
  const width = window.innerWidth;
  const height = window.innerHeight;
  renderer.setSize(width, height, false);
  postProcessing.resize(width, height);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
};

const animate = (time: number) => {
  const delta = (time - state.lastTime) * 0.001;
  const timeSeconds = time * 0.001;
  state.lastTime = time;
  water.update(timeSeconds);
  const skyState = sky.update(timeSeconds);
  weather.update(timeSeconds, delta);
  keyLight.position.copy(skyState.sunDirection).multiplyScalar(10);
  keyLight.intensity = 0.25 + 0.65 * skyState.dayFactor;
  keyLight.color.copy(duskSun).lerp(daySun, skyState.dayFactor);
  ambientLight.intensity = 0.2 + 0.5 * skyState.dayFactor;
  ambientLight.color.copy(nightAmbient).lerp(dayAmbient, skyState.dayFactor);
  linksScene?.updateVisibility(camera);
  proximityEffect.update(camera);
  rayBurst.update(timeSeconds, delta);
  fpsControls.update(delta);
  postProcessing.render();
  if (debugState.enabled) {
    stats.update();
  }
  requestAnimationFrame(animate);
};

const initialize = async () => {
  resize();
  window.addEventListener("resize", resize);
  window.addEventListener("keydown", (event) => {
    if (event.code === "KeyP") {
      setDebugEnabled(!debugState.enabled);
    }
  });
  const debugParam = new URLSearchParams(window.location.search).get("debug");
  if (debugParam === "1") {
    setDebugEnabled(true);
  }

  try {
    linksScene = await createLinks({
      radius: Math.max(terrain.width, terrain.depth) * 0.85 + 6,
      elevation: 2.1,
      palette: WORLD_PALETTE,
    });
    world.add(linksScene.group);

    if (linksScene.pagesCount > 0) {
      camera.position.z = Math.min(18, 10 + linksScene.pagesCount * 0.3);
      camera.position.y = Math.max(
        camera.position.y,
        terrain.heightAt(camera.position.x, camera.position.z) + 1.7,
      );

      // Add links to proximity effect system
      proximityEffect.addTargets(linksScene.labels.map((label) => label.mesh));
      proximityEffect.onEnter((mesh) => {
        rayBurst.start(mesh);
      });
      proximityEffect.onExit(() => {
        rayBurst.stop();
      });
    }
  } catch (error) {
    console.warn("Failed to load pages.json", error);
  }

  requestAnimationFrame(animate);
};

void initialize();
