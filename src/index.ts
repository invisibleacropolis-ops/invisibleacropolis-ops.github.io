import * as THREE from "three";
import Stats from "three/examples/jsm/libs/stats.module.js";

import {
  createSelectiveBloomPostProcessing,
  BLOOM_LAYER,
  QUALITY_PRESETS,
  type QualityTier,
} from "./effects/postprocessing.ts";

import { createWeatherEffects } from "./effects/weather.ts";
import { createFlyControls } from "./controls/fps.ts";
import { createProximityEffect } from "./effects/proximityEffect.ts";
import { createLinks } from "./scene/links.ts";

import { createPropsManager } from "./scene/props.ts";
import { createSky } from "./scene/sky.ts";
import { createTerrainMeshFromHeightmap } from "./scene/terrain-heightmap.ts";

import { WORLD_PALETTE } from "./scene/palette.ts";
import { createDevPanel, type TerrainConfig, type DevSettings } from "./dev/devPanel.ts";
import { createHeroOverlay } from "./ui/heroOverlay.ts";
import { createNavigationHub } from "./ui/navigationHub.ts";
import { createExperienceStateMachine, loadExperienceState, type ExperienceMode } from "./ui/experienceState.ts";
import { createExperienceControls } from "./ui/experienceControls.ts";
import { createOnboardingModal } from "./ui/onboardingModal.ts";
import {
  createAnalyticsClient,
  createConsoleAnalyticsProvider,
  createDataLayerAnalyticsProvider,
  createWindowEventAnalyticsProvider,
} from "./telemetry/analytics.ts";
import { createSessionDepthTracker } from "./ui/sessionDepthTracker.ts";

const canvas = document.querySelector<HTMLCanvasElement>("#scene");
const uiRoot = document.querySelector<HTMLElement>(".ui");

if (!canvas) {
  throw new Error("Canvas not found");
}

if (!uiRoot) {
  throw new Error("UI root not found");
}

const appStartMs = performance.now();
const analytics = createAnalyticsClient([
  createWindowEventAnalyticsProvider(),
  createDataLayerAnalyticsProvider(),
]);
if ((window as Window & { __RENDER_DEBUG__?: boolean }).__RENDER_DEBUG__) {
  analytics.addProvider(createConsoleAnalyticsProvider());
}

type QualitySettings = {
  tier: QualityTier;
  source: "auto" | "manual";
};

type RenderMetrics = {
  fps: number;
  frameTimeMs: number;
  drawCalls: number;
  triangles: number;
  points: number;
  lines: number;
  objectCount: number;
  visibleLinks: number;
  qualityTier: QualityTier;
  qualitySource: "auto" | "manual";
  qualityLevel: number;
  bloomEnabled: boolean;
  rainEnabled: boolean;
};

const QUALITY_SETTINGS_KEY = "invisible_acropolis_quality_settings";
const QUALITY_TIERS: QualityTier[] = ["low", "medium", "high", "ultra"];
const tierToLevel = (tier: QualityTier) => QUALITY_TIERS.indexOf(tier);
const levelToTier = (level: number): QualityTier => QUALITY_TIERS[Math.max(0, Math.min(QUALITY_TIERS.length - 1, level))] ?? "high";

const chooseQualityTierFromHardware = (): QualityTier => {
  const nav = navigator as Navigator & {
    deviceMemory?: number;
    hardwareConcurrency?: number;
    connection?: { effectiveType?: string; saveData?: boolean };
  };
  const cores = nav.hardwareConcurrency ?? 4;
  const memory = nav.deviceMemory ?? 4;
  const saveData = Boolean(nav.connection?.saveData);
  const effectiveType = nav.connection?.effectiveType ?? "4g";

  if (saveData || effectiveType === "2g" || memory <= 2 || cores <= 4) {
    return "low";
  }
  if (effectiveType === "3g" || memory <= 4 || cores <= 6) {
    return "medium";
  }
  if (memory >= 8 && cores >= 12) {
    return "ultra";
  }
  return "high";
};

const loadQualitySettings = (): QualitySettings => {
  try {
    const saved = localStorage.getItem(QUALITY_SETTINGS_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as Partial<QualitySettings>;
      if (parsed.tier && QUALITY_TIERS.includes(parsed.tier)) {
        return {
          tier: parsed.tier,
          source: parsed.source === "manual" ? "manual" : "auto",
        };
      }
    }
  } catch (error) {
    console.warn("Failed to load quality settings", error);
  }

  return {
    tier: chooseQualityTierFromHardware(),
    source: "auto",
  };
};

const saveQualitySettings = (qualitySettings: QualitySettings) => {
  try {
    localStorage.setItem(QUALITY_SETTINGS_KEY, JSON.stringify(qualitySettings));
  } catch (error) {
    console.warn("Failed to save quality settings", error);
  }
};

const emitDebugMetrics = (() => {
  let lastEmit = 0;
  return (metrics: RenderMetrics) => {
    const now = performance.now();
    if (now - lastEmit < 1000) {
      return;
    }
    lastEmit = now;

    window.dispatchEvent(new CustomEvent("render-metrics", { detail: metrics }));
    if ((window as Window & { __RENDER_DEBUG__?: boolean }).__RENDER_DEBUG__) {
      console.debug("[render-metrics]", metrics);
    }
  };
})();

const qualitySettings = loadQualitySettings();
let activeQualityTier: QualityTier = qualitySettings.tier;
let qualitySource: "auto" | "manual" = qualitySettings.source;
let targetQualityLevel = tierToLevel(activeQualityTier);
let dynamicQualityLevel = targetQualityLevel;
let bloomEnabled = true;
let rainEnabled = QUALITY_PRESETS[activeQualityTier].rainEnabled;

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: false,
  alpha: true,
  powerPreference: "high-performance",
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, QUALITY_PRESETS[activeQualityTier].pixelRatioCap));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050505);
scene.fog = new THREE.FogExp2(0x050505, 0.00015);

const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  50000
);
camera.position.set(0, 300, 800);

// Fix: Pass object to createFlyControls
const controls = createFlyControls({
  camera,
  domElement: canvas
});
const experienceState = createExperienceStateMachine(loadExperienceState());

// Enable Bloom
const postProcessing = createSelectiveBloomPostProcessing({
  renderer,
  scene,
  camera,
  qualityTier: activeQualityTier,
});

const applyQualityTier = (tier: QualityTier, source: "auto" | "manual", updateTarget = true) => {
  activeQualityTier = tier;
  qualitySource = source;
  dynamicQualityLevel = tierToLevel(tier);
  if (updateTarget) {
    targetQualityLevel = dynamicQualityLevel;
  }

  const preset = QUALITY_PRESETS[tier];
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, preset.pixelRatioCap));
  postProcessing.setQualityTier(tier);
  bloomEnabled = true;
  postProcessing.setBloomEnabled(true);
  rainEnabled = preset.rainEnabled;
  if (weather) {
    weather.group.visible = rainEnabled;
  }

  saveQualitySettings({ tier, source });
  experienceControls.setQualityTier(tier, source === "auto");
};

const enableBloom = (object: THREE.Object3D) => {
  object.layers.enable(BLOOM_LAYER);
  object.traverse((child) => {
    child.layers.enable(BLOOM_LAYER);
  });
};

const stats = new Stats();
document.body.appendChild(stats.dom);

const heroOverlay = createHeroOverlay({
  root: uiRoot,
  onImpression: (action) => {
    analytics.track("cta_impression", {
      ctaId: action,
      placement: "hero-overlay",
    });
  },
  onAction: (action) => {
    analytics.track("cta_click", {
      ctaId: action,
      placement: "hero-overlay",
    });

    if (action === "enter") {
      const previousMode = experienceState.getState().mode;
      experienceState.dispatch({ type: "set-mode", mode: "explorer" });
      analytics.track("mode_selected", {
        mode: "explorer",
        previousMode,
        source: "hero-overlay",
      });
      if (!experienceState.getState().pointerLockConsent) {
        onboardingModal.open();
        return;
      }
      controls.controls.lock();
      return;
    }

    if (action === "explore") {
      heroOverlay.hide();
    }
  },
});


const navigationHub = createNavigationHub({
  root: uiRoot,
  onLinkClick: (page) => {
    analytics.track("link_interaction", {
      url: page.url,
      origin: "navigation-hub",
      status: "success",
    });
    sessionDepth.recordPageVisit(page.url);
  },
});
const experienceControls = createExperienceControls({
  root: uiRoot,
  onModeChange: (mode: ExperienceMode, source) => {
    const previousMode = experienceState.getState().mode;
    experienceState.dispatch({ type: "set-mode", mode });
    analytics.track("mode_selected", {
      mode,
      previousMode,
      source,
    });
    if (mode === "explorer" && !experienceState.getState().pointerLockConsent) {
      onboardingModal.open();
    }
  },
  onOpenOnboarding: () => onboardingModal.open(),
  onQualityChange: (tier) => applyQualityTier(tier, "manual"),
});

experienceControls.setQualityTier(activeQualityTier, qualitySource === "auto");
const uiReadyMs = performance.now();
const sessionDepth = createSessionDepthTracker(analytics);

const onboardingModal = createOnboardingModal({
  root: uiRoot,
  onConsent: () => {
    experienceState.dispatch({ type: "set-pointer-lock-consent", consent: true });
    experienceState.dispatch({ type: "set-onboarding-seen", seen: true });
    if (experienceState.getState().mode === "explorer") {
      controls.controls.lock();
    }
  },
  onSkip: (neverShowAgain) => {
    experienceState.dispatch({ type: "set-onboarding-seen", seen: true });
    experienceState.dispatch({ type: "set-never-show-onboarding", neverShow: neverShowAgain });
    if (experienceState.getState().mode === "explorer" && !experienceState.getState().pointerLockConsent) {
      experienceState.dispatch({ type: "set-mode", mode: "guided" });
    }
  },
  onNeverShow: (neverShowAgain) => {
    experienceState.dispatch({ type: "set-never-show-onboarding", neverShow: neverShowAgain });
  },
});

experienceState.subscribe((state) => {
  controls.setMode(state.mode);
  controls.setPointerLockAllowed(state.pointerLockConsent);
  onboardingModal.setState(state);
  experienceControls.setState(state);

  if (state.mode === "guided") {
    heroOverlay.show();
  }

  if (state.mode === "explorer" && !state.pointerLockConsent && !state.neverShowOnboarding) {
    onboardingModal.open();
  }
});

controls.controls.addEventListener("lock", () => {
  heroOverlay.setLocked(true);
});

controls.controls.addEventListener("unlock", () => {
  heroOverlay.setLocked(false);
});

// World Objects
let terrain: Awaited<ReturnType<typeof createTerrainMeshFromHeightmap>> | null = null;
let propsManager: ReturnType<typeof createPropsManager> | null = null;

let sky: ReturnType<typeof createSky> | null = null;
let linksScene: Awaited<ReturnType<typeof createLinks>> | null = null;
let proximityEffect: ReturnType<typeof createProximityEffect> | null = null;

// Effects
let weather: ReturnType<typeof createWeatherEffects> | null = null;


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

let smoothedFrameTimeMs = 16.7;
let lowFpsBudgetBreachCount = 0;
let highFpsRecoveryCount = 0;
let frameCounter = 0;
let lastFrameAt = performance.now();

const animate = () => {
  const now = performance.now();
  const frameDeltaSeconds = Math.min(0.05, (now - lastFrameAt) / 1000);
  lastFrameAt = now;
  const time = now * 0.001;

  stats.begin();

  if (controls) controls.update(frameDeltaSeconds);
  if (weather && rainEnabled) weather.update(time, frameDeltaSeconds);

  if (sky) sky.update(time);

  if (linksScene) linksScene.updateVisibility(camera);
  if (proximityEffect) proximityEffect.update(camera);

  postProcessing.render();

  stats.end();

  const frameTimeMs = Math.max(0.1, frameDeltaSeconds * 1000);
  smoothedFrameTimeMs = smoothedFrameTimeMs * 0.9 + frameTimeMs * 0.1;
  const fps = 1000 / smoothedFrameTimeMs;
  const activeBudget = QUALITY_PRESETS[levelToTier(dynamicQualityLevel)].budget;

  if (fps < (1000 / activeBudget.frameTimeMs) * 0.8) {
    lowFpsBudgetBreachCount += 1;
    highFpsRecoveryCount = 0;
  } else if (fps > (1000 / activeBudget.frameTimeMs) * 1.1) {
    highFpsRecoveryCount += 1;
    lowFpsBudgetBreachCount = Math.max(0, lowFpsBudgetBreachCount - 1);
  }

  if (lowFpsBudgetBreachCount > 120 && qualitySource === "auto") {
    if (rainEnabled) {
      rainEnabled = false;
      if (weather) {
        weather.group.visible = false;
      }
    } else if (bloomEnabled) {
      bloomEnabled = false;
      postProcessing.setBloomEnabled(false);
    } else if (dynamicQualityLevel > 0) {
      dynamicQualityLevel -= 1;
      const nextTier = levelToTier(dynamicQualityLevel);
      applyQualityTier(nextTier, "auto", false);
    }
    lowFpsBudgetBreachCount = 0;
  }

  if (highFpsRecoveryCount > 240 && qualitySource === "auto") {
    if (dynamicQualityLevel < targetQualityLevel) {
      dynamicQualityLevel += 1;
      applyQualityTier(levelToTier(dynamicQualityLevel), "auto", false);
    }
    if (!bloomEnabled) {
      bloomEnabled = true;
      postProcessing.setBloomEnabled(true);
    }
    if (!rainEnabled && QUALITY_PRESETS[activeQualityTier].rainEnabled) {
      rainEnabled = true;
      if (weather) {
        weather.group.visible = true;
      }
    }
    highFpsRecoveryCount = 0;
  }

  frameCounter += 1;
  emitDebugMetrics({
    fps,
    frameTimeMs: smoothedFrameTimeMs,
    drawCalls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
    points: renderer.info.render.points,
    lines: renderer.info.render.lines,
    objectCount: world.children.length + scene.children.length,
    visibleLinks: linksScene ? linksScene.labels.filter((label) => label.mesh.visible).length : 0,
    qualityTier: activeQualityTier,
    qualitySource,
    qualityLevel: dynamicQualityLevel,
    bloomEnabled,
    rainEnabled,
  });

  requestAnimationFrame(animate);
};

// Resize Handler
window.addEventListener("resize", () => {
  const width = window.innerWidth;
  const height = window.innerHeight;

  camera.aspect = width / height;
  camera.updateProjectionMatrix();

  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, QUALITY_PRESETS[activeQualityTier].pixelRatioCap));

  // Fix: use resize()
  postProcessing.resize(width, height);
});

// Initialize
const initialize = async () => {
  console.log("Initialize started");
  const settings = loadSettings();
  const currentExperienceState = experienceState.getState();

  if (!currentExperienceState.onboardingSeen && !currentExperienceState.neverShowOnboarding) {
    onboardingModal.open();
  }

  applyQualityTier(activeQualityTier, qualitySource);

  // Initial Generation
  console.log("Generating world...");
  await generateWorld(settings.terrain!, settings.props, settings.links);
  console.log("World generated");

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
    topColor: WORLD_PALETTE[0],
    bottomColor: WORLD_PALETTE[1],
  });
  world.add(sky.mesh);

  // Effects
  weather = createWeatherEffects({
    scene,
    fogDensity: 0.00025
  });
  if (weather) {
    weather.group.visible = rainEnabled;
    scene.add(weather.group);
  }

  // Ray Interaction (Click)
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();



  window.addEventListener("click", () => {
    // If FPS controls are locked, click handles shooting? 
    // Or if not locked.
    if (document.pointerLockElement === canvas) {
      // We are in FPS mode. 
      // Check center of screen
      raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);

      // Intersect links
      if (linksScene) {
        const intersects = raycaster.intersectObjects(linksScene.group.children);
        if (intersects.length > 0) {
          const mesh = intersects[0].object as THREE.Mesh;
          if (mesh.userData.linkUrl) {
            const targetUrl = String(mesh.userData.linkUrl);
            try {
              analytics.track("link_interaction", {
                url: targetUrl,
                origin: "world-link",
                status: "success",
              });
              sessionDepth.recordPageVisit(targetUrl);
              window.open(targetUrl, "_self");
            } catch (error) {
              analytics.track("link_interaction", {
                url: targetUrl,
                origin: "world-link",
                status: "failure",
                reason: error instanceof Error ? error.message : "window-open-failed",
              });
            }
          }
        }
      }
    } else {
      // Check mouse position? Or center if controls?
      // If controls are FPS but not locked, we click to lock.
    }
  });

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

  const sceneReadyMs = performance.now();
  analytics.track("first_meaningful_paint", {
    appStartMs,
    uiReadyMs,
    sceneReadyMs,
    meaningfulPaintMs: sceneReadyMs - appStartMs,
    qualityTier: activeQualityTier,
    qualitySource,
  });

  window.addEventListener("beforeunload", () => {
    sessionDepth.dispose();
    heroOverlay.dispose();
    navigationHub.dispose();
    experienceControls.dispose();
    onboardingModal.dispose();
    controls.dispose();
  });

  requestAnimationFrame(animate);
};

void initialize().catch(e => console.error("Initialize failed:", e));
