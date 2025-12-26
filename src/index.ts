import * as THREE from "three";
import Stats from "three/examples/jsm/libs/stats.module.js";

import { createSelectiveBloomPostProcessing, BLOOM_LAYER } from "./effects/postprocessing.ts";
import { createRayBurst } from "./effects/rayBurst.ts";
import { createWeatherEffects } from "./effects/weather.ts";
import { createFlyControls } from "./controls/fps.ts";
import { createProximityEffect } from "./effects/proximityEffect.ts";
import { createLinks } from "./scene/links.ts";

import { createPropsManager } from "./scene/props.ts";
import { createSky } from "./scene/sky.ts";
import { createTerrainMeshFromHeightmap } from "./scene/terrain-heightmap.ts";

import { WORLD_PALETTE } from "./scene/palette.ts";
import { createDevPanel, type TerrainConfig, type DevSettings } from "./dev/devPanel.ts";

const canvas = document.querySelector<HTMLCanvasElement>("#scene");

if (!canvas) {
  throw new Error("Canvas not found");
}

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: false,
  alpha: true,
  powerPreference: "high-performance",
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050505);
scene.fog = new THREE.FogExp2(0x050505, 0.00015);

const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  15000
);
camera.position.set(0, 300, 800);

const controls = createFlyControls(camera, canvas);

// Enable Bloom
const postProcessing = createSelectiveBloomPostProcessing(renderer, scene, camera);
const enableBloom = (object: THREE.Object3D) => {
  object.layers.enable(BLOOM_LAYER);
  object.traverse((child) => {
    child.layers.enable(BLOOM_LAYER);
  });
};

const stats = new Stats();
document.body.appendChild(stats.dom);

// World Objects
let terrain: Awaited<ReturnType<typeof createTerrainMeshFromHeightmap>> | null = null;
let propsManager: ReturnType<typeof createPropsManager> | null = null;

let sky: ReturnType<typeof createSky> | null = null;
let linksScene: Awaited<ReturnType<typeof createLinks>> | null = null;
let proximityEffect: ReturnType<typeof createProximityEffect> | null = null;

// Effects
let weather: ReturnType<typeof createWeatherEffects> | null = null;
const rayBurst = createRayBurst(scene, camera);

// Persistent Settings
const SETTINGS_KEY = "invisible_acropolis_dev_settings";

const defaultSettings: DevSettings = {
  props: {
    totalDensity: 1,
    treeDensity: 1,
    rockDensity: 1,
    clusteringFactor: 1,
  },
  bloom: {
    strength: 0.6,
    radius: 0.4,
    threshold: 0.0,
  },
  terrain: {
    size: 7000,
    segments: 120,
    height: 500,
    colorLow: "#00008b",
    colorHigh: "#ffffff",
    gradientStart: 0.0,
    gradientEnd: 1.0,
    gradientSkew: 1.0,
  },
  links: {
    size: 150.0,
    placementRadius: 2000,
    placementShape: "ring",
  }
};

const loadSettings = (): DevSettings => {
  try {
    const saved = localStorage.getItem(SETTINGS_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      // Deep merge with defaults to ensure new keys exist
      return {
        props: { ...defaultSettings.props, ...parsed.props },
        bloom: { ...defaultSettings.bloom, ...parsed.bloom },
        terrain: { ...defaultSettings.terrain, ...parsed.terrain },
        links: { ...defaultSettings.links, ...parsed.links },
      };
    }
  } catch (e) {
    console.warn("Failed to load settings", e);
  }
  return defaultSettings;
};

const saveSettings = (settings: DevSettings) => {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    console.log("Settings saved:", settings);
  } catch (e) {
    console.warn("Failed to save settings", e);
  }
};

// Regeneration function
const generateWorld = async (config: TerrainConfig, propsConfig?: any, linksConfig?: any) => {
  console.log("Generating world...", config);

  // 1. Cleanup
  if (terrain) {
    terrain.mesh.removeFromParent();
  }
  if (propsManager) {
    propsManager.group.removeFromParent();
  }
  if (linksScene) {
    linksScene.group.removeFromParent();
  }
  // Remove sky if needed, but sky is usually static-ish or updated separately

  // 2. Create Terrain
  terrain = await createTerrainMeshFromHeightmap({
    width: config.size,
    depth: config.size,
    segments: config.segments,
    height: config.height,
    colorLow: config.colorLow,
    colorHigh: config.colorHigh,
    gradientStart: config.gradientStart,
    gradientEnd: config.gradientEnd,
    gradientSkew: config.gradientSkew,
    palette: WORLD_PALETTE,
  });
  enableBloom(terrain.mesh);
  world.add(terrain.mesh);

  // 3. Create Dependent Objects (Just props now)

  propsManager = createPropsManager({
    seed: WORLD_SEED,
    width: terrain.width,
    depth: terrain.depth,
    heightAt: terrain.heightAt,
    palette: WORLD_PALETTE,
    config: propsConfig,
  });
  propsManager.group.visible = true;
  // Should we bloom props? Maybe selective. for now yes.
  // propsManager doesn't expose enableBloom helper easily, but we can traverse.
  enableBloom(propsManager.group);
  world.add(propsManager.group);

  // 4. Create Links
  await generateLinks(linksConfig);
};

const generateLinks = async (linksConfig?: any) => {
  if (!terrain) return;

  if (linksScene) {
    linksScene.group.removeFromParent();
  }

  linksScene = await createLinks({
    width: terrain.width,
    depth: terrain.depth,
    seed: WORLD_SEED,
    heightAt: terrain.heightAt,
    elevation: 6,
    palette: WORLD_PALETTE,
    size: linksConfig?.size || 150.0,
    placementRadius: linksConfig?.placementRadius ?? 2000,
    placementShape: linksConfig?.placementShape ?? "ring",
  });
  enableBloom(linksScene.group);
  world.add(linksScene.group);

  // Reset Proximity
  proximityEffect = createProximityEffect({
    maxDistance: (linksConfig?.size || 150.0) * 10,
    minDistance: (linksConfig?.size || 150.0) * 2,
  });
  proximityEffect.addTargets(linksScene.labels.map(l => l.mesh));
  proximityEffect.onEnter((mesh) => {
    document.body.style.cursor = "pointer";
  });
  proximityEffect.onExit((mesh) => {
    document.body.style.cursor = "default";
  });
};

const WORLD_SEED = 12345;
const world = new THREE.Group();
scene.add(world);

const animate = () => {
  const time = performance.now() * 0.001;
  const delta = Math.min(0.05, 1 / 60); // Cap delta

  stats.begin();

  if (controls) controls.update(delta);
  if (weather) weather.update(time, delta);
  if (rayBurst) rayBurst.update(time);
  if (sky) sky.update(time); // Rotate sky?

  if (linksScene) linksScene.updateVisibility(camera);
  if (proximityEffect) proximityEffect.update(camera);

  if (propsManager) {
    // propsManager.update(time); // If animated
  }

  postProcessing.composer.render();

  stats.end();
  requestAnimationFrame(animate);
};

// Initialize
const initialize = async () => {
  const settings = loadSettings();

  // Initial Generation
  await generateWorld(settings.terrain!, settings.props, settings.links);

  // Camera Spawn & Controls
  // 1. Find a random link to look at
  if (linksScene && linksScene.labels.length > 0) {
    const target = linksScene.labels[0].mesh.position;
    // Place camera nearby
    camera.position.set(target.x, target.y + 20, target.z + 150);
    camera.lookAt(target);
  } else {
    camera.position.set(0, 300, 800);
    camera.lookAt(0, 0, 0);
  }

  // Create Sky
  sky = createSky({
    radius: 10000,
    palette: WORLD_PALETTE,
  });
  world.add(sky.mesh);

  // Effects
  weather = createWeatherEffects(scene, camera);

  // Ray Interaction (Click)
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();

  window.addEventListener("click", () => {
    // If FPS controls are locked, click handles shooting? 
    // Or if not locked.
    if (document.pointerLockElement === document.body) {
      // We are in FPS mode. 
      // Check center of screen
      raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);

      // Intersect links
      if (linksScene) {
        const intersects = raycaster.intersectObjects(linksScene.group.children);
        if (intersects.length > 0) {
          const mesh = intersects[0].object as THREE.Mesh;
          if (mesh.userData.linkUrl) {
            window.open(mesh.userData.linkUrl, "_self");
          }
        }
      }
    } else {
      // Check mouse position? Or center if controls?
      // If controls are FPS but not locked, we click to lock.
    }
  });

  // Controls Event Listeners
  // (Handled inside createFlyControls usually, or here for locking)

  // Dev Panel
  createDevPanel({
    propsConfig: settings.props,
    onPropsChange: (config) => {
      // Ideally we just update props?
      // For now regenerate world is safest
      generateWorld(settings.terrain!, config, settings.links);
    },
    bloomPass: postProcessing.bloomPass,
    terrainConfig: settings.terrain,
    onTerrainChange: (config) => {
      // Async regeneration
      generateWorld(config, settings.props, settings.links).then(() => {
      });
    },
    linksConfig: settings.links,
    onLinkSizeChange: (size) => {
      // Fast path for size
      if (linksScene) {
        linksScene.setSize(size);
        proximityEffect?.setDistances(size * 2, size * 10);
      }
    },
    onLinkLayoutChange: (config) => {
      // Regenerate links only
      generateLinks(config);
    },
    onSaveDefaults: (currentSettings) => {
      saveSettings(currentSettings);
    }
  });

  requestAnimationFrame(animate);
};

void initialize();
