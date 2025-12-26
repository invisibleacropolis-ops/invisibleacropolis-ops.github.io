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
import { createDevPanel, type TerrainConfig } from "./dev/devPanel.ts";

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

// World Objects
let terrain: Awaited<ReturnType<typeof createTerrainMeshFromHeightmap>> | null = null;
let roads: THREE.Object3D | null = null;
let water: ReturnType<typeof createWater> | null = null;
let propsManager: ReturnType<typeof createPropsManager> | null = null;

let sky: ReturnType<typeof createSky> | null = null;
let weather: ReturnType<typeof createWeatherEffects> | null = null;
let flyControls: ReturnType<typeof createFlyControls> | null = null;

const enableBloom = (object: THREE.Object3D) => {
  object.traverse((obj) => {
    obj.layers.enable(BLOOM_LAYER);
  });
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

// Regeneration function
const generateWorld = async (config: TerrainConfig) => {
  console.log("Generating world...", config);

  // 1. Cleanup
  if (terrain) {
    terrain.mesh.removeFromParent();
    // terrain.mesh.geometry.dispose(); // LOD complex dispose needed?
    // Using GC for now as complex cleanup is verbose
  }
  if (roads) {
    roads.removeFromParent();
  }
  if (water) {
    water.mesh.removeFromParent();
    water.rivers.removeFromParent();
  }
  if (propsManager) {
    propsManager.group.removeFromParent();
  }
  if (linksScene) {
    linksScene.group.removeFromParent();
  }

  // 2. Create Terrain
  terrain = await createTerrainMeshFromHeightmap({
    heightmapUrl: "/heightmap.jpg",
    width: config.size,
    depth: config.size,
    segments: config.segments,
    height: config.height,
    colorLow: config.colorLow,
    colorHigh: config.colorHigh,
    gradientStart: config.gradientStart,
    gradientEnd: config.gradientEnd,
    palette: WORLD_PALETTE,
  });
  enableBloom(terrain.mesh);
  world.add(terrain.mesh);

  // 3. Create Dependent Objects
  roads = createRoads({
    seed: WORLD_SEED,
    width: terrain.width,
    depth: terrain.depth,
    count: 4,
    elevation: 0.15,
    palette: WORLD_PALETTE,
    heightAt: terrain.heightAt,
  });
  enableBloom(roads);
  world.add(roads);

  water = createWater({
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
  enableBloom(water.mesh);
  enableBloom(water.rivers);
  world.add(water.mesh);
  world.add(water.rivers);

  propsManager = createPropsManager({
    seed: WORLD_SEED,
    width: terrain.width,
    depth: terrain.depth,
    heightAt: terrain.heightAt,
    palette: WORLD_PALETTE,
    // Preserve config if exists
    config: propsManager ? propsManager.config : {},
  });
  enableBloom(propsManager.group);
  world.add(propsManager.group);

  try {
    linksScene = await createLinks({
      width: terrain.width,
      depth: terrain.depth,
      seed: WORLD_SEED,
      heightAt: terrain.heightAt,
      elevation: 6,
      palette: WORLD_PALETTE,
    });
    enableBloom(linksScene.group);
    world.add(linksScene.group);

    if (linksScene.pagesCount > 0) {
      proximityEffect.addTargets(linksScene.labels.map((label) => label.mesh));
      proximityEffect.onEnter((mesh) => { rayBurst.start(mesh); });
      proximityEffect.onExit(() => { rayBurst.stop(); });
    }
  } catch (e) {
    console.warn("Failed to load links", e);
  }

  // Update weather area size
  if (weather) {
    weather.group.removeFromParent();
  }
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

  console.log("World generated!");
};

const initialize = async () => {
  resize();
  window.addEventListener("resize", resize);

  console.log("Initializing...");

  // Initial Generation
  await generateWorld({
    size: 7000,
    segments: 120,
    height: 500,
    colorLow: "#00008b",
    colorHigh: "#ffffff",
    gradientStart: 0.0,
    gradientEnd: 1.0,
  });

  // Camera Spawn & Controls
  // 1. Find a random link to look at
  let targetLinkParams = { x: 0, z: 0 };
  if (linksScene && linksScene.labels.length > 0) {
    const randomLabel = linksScene.labels[Math.floor(Math.random() * linksScene.labels.length)];
    targetLinkParams.x = randomLabel.mesh.position.x;
    targetLinkParams.z = randomLabel.mesh.position.z;
  }

  // 2. Spawn high above
  // Assuming terrain center is 0,0 and standard height
  const spawnHeight = 500 + 400;
  camera.position.set(0, spawnHeight, 0);

  // 3. Look at target
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

  // Sky
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
  scene.add(sky.mesh, sky.stars);

  // Dev Panel
  // We create it after everything is ready
  const devPanel = createDevPanel({
    propsConfig: propsManager?.config,
    onPropsChange: (config) => {
      if (propsManager) {
        propsManager.setConfig(config);
        const newGroup = propsManager.regenerate(world);
        enableBloom(newGroup);
      }
    },
    bloomPass: postProcessing.bloomPass,
    terrainConfig: {
      size: 7000,
      segments: 120,
      height: 500,
      colorLow: "#00008b",
      colorHigh: "#ffffff",
      gradientStart: 0.0,
      gradientEnd: 1.0,
    },
    onTerrainChange: (config) => {
      // Async regeneration
      generateWorld(config).then(() => {
        // Should we reset bloom pass to panel? It's same object ref.
        // Should we update props config in panel? It persists in propsManager.
      });
    },
  });

  requestAnimationFrame(animate);
};

void initialize();
