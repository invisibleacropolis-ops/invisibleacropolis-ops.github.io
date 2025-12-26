import * as THREE from "three";
import Stats from "three/examples/jsm/libs/stats.module.js";

import { createSelectiveBloomPostProcessing, BLOOM_LAYER } from "./effects/postprocessing.ts";
import { createRayBurst } from "./effects/rayBurst.ts";
import { createWeatherEffects } from "./effects/weather.ts";
import { createFlyControls } from "./controls/fps.ts";
import { createProximityEffect } from "./effects/proximityEffect.ts";
import { createLinks } from "./scene/links.ts";
import { createRoads } from "./scene/roads.ts";
import { createPropsManager } from "./scene/props.ts";
import { createSky } from "./scene/sky.ts";
import { createTerrainMeshFromHeightmap } from "./scene/terrain-heightmap.ts";
import { createWater } from "./scene/water.ts";
import { WORLD_PALETTE } from "./scene/palette.ts";
import { createDevPanel } from "./dev/devPanel.ts";

const canvas = document.querySelector<HTMLCanvasElement>("#scene");

if (!canvas) {
  throw new Error("Canvas element not found");
}

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: false,
  powerPreference: "high-performance",
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const scene = new THREE.Scene();
scene.background = new THREE.Color("#050608");

const camera = new THREE.PerspectiveCamera(55, 1, 1, 50000);

const postProcessing = createSelectiveBloomPostProcessing({
  renderer,
  scene,
  camera,
  antiAlias: "smaa",
  bloom: {
    strength: 0.6,
    radius: 0.4,
    threshold: 0.0,
  },
});

const world = new THREE.Group();
scene.add(world);

const WORLD_SEED = 1337;

// Lights
const ambientLight = new THREE.AmbientLight("#9aa8ff", 0.6);
scene.add(ambientLight);

const keyLight = new THREE.DirectionalLight("#ffffff", 0.5);
keyLight.position.set(3, 6, 6);
scene.add(keyLight);

// Effects that don't need terrain
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

// State
const state = {
  lastTime: 0,
};

let linksScene: Awaited<ReturnType<typeof createLinks>> | null = null;
const stats = new Stats();
const debugState = {
  enabled: false,
};

// Colors
const dayAmbient = new THREE.Color("#9aa8ff");
const nightAmbient = new THREE.Color("#1f2b50");
const daySun = new THREE.Color("#ffffff");
const duskSun = new THREE.Color("#ffb978");

// Terrain-dependent objects
let terrain: Awaited<ReturnType<typeof createTerrainMeshFromHeightmap>> | null = null;
let sky: ReturnType<typeof createSky> | null = null;
let weather: ReturnType<typeof createWeatherEffects> | null = null;
let flyControls: ReturnType<typeof createFlyControls> | null = null;

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

  if (sky) {
    const skyState = sky.update(timeSeconds);
    keyLight.position.copy(skyState.sunDirection).multiplyScalar(10);
    keyLight.intensity = 0.25 + 0.65 * skyState.dayFactor;
    keyLight.color.copy(duskSun).lerp(daySun, skyState.dayFactor);
    ambientLight.intensity = 0.2 + 0.5 * skyState.dayFactor;
    ambientLight.color.copy(nightAmbient).lerp(dayAmbient, skyState.dayFactor);
  }

  if (weather) {
    weather.update(timeSeconds, delta);
  }

  linksScene?.updateVisibility(camera);
  proximityEffect.update(camera);
  rayBurst.update(timeSeconds, delta);

  if (flyControls) {
    flyControls.update(delta);
  }

  postProcessing.render();

  if (debugState.enabled) {
    stats.update();
  }

  requestAnimationFrame(animate);
};

// Start bloom on object (recursive)
const enableBloom = (object: THREE.Object3D) => {
  object.traverse((obj) => {
    obj.layers.enable(BLOOM_LAYER);
  });
};

const initialize = async () => {
  resize();
  window.addEventListener("resize", resize);

  console.log("Loading terrain from heightmap...");

  terrain = await createTerrainMeshFromHeightmap({
    heightmapUrl: "/heightmap.jpg",
    width: 7000,
    depth: 7000,
    segments: 120,
    height: 500,
    palette: WORLD_PALETTE,
  });
  enableBloom(terrain.mesh); // Enable bloom on terrain
  world.add(terrain.mesh);
  console.log("Terrain loaded!");

  // Cinematic Spawn Logic
  // 1. Find a random link to look at
  let targetLinkParams = { x: 0, z: 0 };
  if (linksScene && linksScene.labels.length > 0) {
    const randomLabel = linksScene.labels[Math.floor(Math.random() * linksScene.labels.length)];
    targetLinkParams.x = randomLabel.mesh.position.x;
    targetLinkParams.z = randomLabel.mesh.position.z;
  }

  // 2. Spawn high above terrain center (or slightly offset)
  const spawnHeight = 500 + 400; // Max terrain height + 400
  camera.position.set(0, spawnHeight, 0);

  // 3. Look at the target link
  camera.lookAt(targetLinkParams.x, 100, targetLinkParams.z);

  flyControls = createFlyControls({
    camera,
    domElement: renderer.domElement,
    baseSpeed: 50,
    swaySpeed: 0.5,
    swayAmount: 0.8,
  });

  // UI Hint
  const uiContainer = document.querySelector(".ui");
  if (uiContainer) {
    uiContainer.innerHTML = `
        <div style="
            position: absolute;
            bottom: 40px;
            width: 100%;
            text-align: center;
            font-family: 'Inter', sans-serif;
            color: rgba(255, 255, 255, 0.6);
            font-size: 14px;
            letter-spacing: 0.05em;
            text-transform: uppercase;
            pointer-events: none;
        ">
            Click to take control &middot; Press ESC to return
        </div>
      `;
  }

  const roads = createRoads({
    seed: WORLD_SEED,
    width: terrain.width,
    depth: terrain.depth,
    count: 4,
    elevation: 0.15,
    palette: WORLD_PALETTE,
    heightAt: terrain.heightAt,
  });
  // Note: Roads might not want bloom if they are lines, or they might. Let's enable for now.
  enableBloom(roads);
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
  enableBloom(water.mesh); // Bloom on water mesh (waves)
  enableBloom(water.rivers);
  world.add(water.mesh);
  world.add(water.rivers);

  const propsManager = createPropsManager({
    seed: WORLD_SEED,
    width: terrain.width,
    depth: terrain.depth,
    heightAt: terrain.heightAt,
    palette: WORLD_PALETTE,
  });
  enableBloom(propsManager.group); // Bloom on trees/rocks
  world.add(propsManager.group);

  // Create dev panel
  const devPanel = createDevPanel({
    propsConfig: propsManager.config,
    onPropsChange: (config) => {
      propsManager.setConfig(config);
      const newGroup = propsManager.regenerate(world);
      enableBloom(newGroup); // Re-enable bloom on regenerated props
    },
    bloomPass: postProcessing.bloomPass,
  });

  sky = createSky({
    radius: 15000,
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
  // Sky doesn't get enableBloom(), so it won't bloom! 
  scene.add(sky.mesh, sky.stars);

  weather = createWeatherEffects({
    scene,
    seed: WORLD_SEED,
    areaWidth: terrain.width * 1.4,
    areaDepth: terrain.depth * 1.4,
    fogColor: "#8aa3c7",
    fogDensity: 0.00005,
    rainEnabled: false,
  });
  scene.add(weather.group);

  try {
    linksScene = await createLinks({
      width: terrain.width,
      depth: terrain.depth,
      seed: WORLD_SEED,
      heightAt: terrain.heightAt,
      elevation: 6,
      palette: WORLD_PALETTE,
    });
    enableBloom(linksScene.group); // Bloom on links? Maybe. Let's say yes for uniformity.
    world.add(linksScene.group);

    // Re-initialize controls/camera targeting now that links are loaded
    if (linksScene.pagesCount > 0) {
      // Redo the spawn targeting now that we have real links
      const randomLabel = linksScene.labels[Math.floor(Math.random() * linksScene.labels.length)];
      // Keep camera position but look at new target
      camera.lookAt(randomLabel.mesh.position.x, 100, randomLabel.mesh.position.z);

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
