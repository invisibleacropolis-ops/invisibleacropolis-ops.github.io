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
import { createTemple, type Temple } from "./scene/temple.ts";
import { createLightRoads, type LightRoads } from "./scene/lightRoads.ts";
import { createAsciiCloudDeck, type AsciiCloudDeck } from "./scene/asciiCloudDeck.ts";
import { createCreatureLayer, type CreatureLayer } from "./scene/creatures.ts";
import { createAsciiCloudField } from "./scene/asciiClouds.ts";
import { createSky } from "./scene/sky.ts";
import { createTerrainMeshFromHeightmap } from "./scene/terrain-heightmap.ts";

import { WORLD_PALETTE } from "./scene/palette.ts";
import { createDevPanel, type TerrainConfig, type DevSettings, type AsciiCloudStructure } from "./dev/devPanel.ts";
import { createNavigationHub } from "./ui/navigationHub.ts";
import { createHeroOverlay } from "./ui/heroOverlay.ts";
import { createWaypointCard } from "./ui/waypointCard.ts";
import { createCompass } from "./ui/compass.ts";
import type { PageEntry } from "./data/pages.ts";
import { createExperienceStateMachine, loadExperienceState, type ExperienceMode } from "./ui/experienceState.ts";
import { createSettingsMenu } from "./ui/settingsMenu.ts";
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

// Dev tooling (stats + lil-gui) only appears with ?debug in the URL
const debugEnabled = new URLSearchParams(window.location.search).has("debug");

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
scene.fog = new THREE.FogExp2(0x050505, 0.00006);

const camera = new THREE.PerspectiveCamera(
  60,
  window.innerWidth / window.innerHeight,
  0.1,
  50000
);
camera.position.set(0, 300, 800);

// Link picking — shared by clicks, hover, and the pointer-locked aim ray
const linkRaycaster = new THREE.Raycaster();
const pointerNdc = new THREE.Vector2();
const SCREEN_CENTER = new THREE.Vector2(0, 0);

const pickPageFromRay = (ndc: THREE.Vector2): PageEntry | null => {
  if (!linksScene) return null;
  linkRaycaster.setFromCamera(ndc, camera);
  const hits = linkRaycaster.intersectObjects(linksScene.group.children, true);
  return linksScene.pageForObject(hits[0]?.object ?? null);
};

const pickPageAtPointer = (event: MouseEvent): PageEntry | null => {
  pointerNdc.set(
    (event.clientX / window.innerWidth) * 2 - 1,
    -(event.clientY / window.innerHeight) * 2 + 1
  );
  return pickPageFromRay(pointerNdc);
};

// Fix: Pass object to createFlyControls
const controls = createFlyControls({
  camera,
  domElement: canvas,
  // Clicking a monument should travel, not grab the pointer
  shouldLock: (event) => pickPageAtPointer(event) === null,
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
  settingsMenu.setQualityTier(tier, source === "auto");
};

const enableBloom = (object: THREE.Object3D) => {
  object.layers.enable(BLOOM_LAYER);
  object.traverse((child) => {
    child.layers.enable(BLOOM_LAYER);
  });
};

let stats: Stats | null = null;
if (debugEnabled) {
  stats = new Stats();
  document.body.appendChild(stats.dom);
}

const hudBar = uiRoot.querySelector<HTMLElement>("[data-hud-bar]") ?? undefined;

const settingsMenu = createSettingsMenu({
  root: uiRoot,
  triggerHost: hudBar,
  onModeChange: (mode: ExperienceMode, source) => {
    const previousMode = experienceState.getState().mode;
    experienceState.dispatch({ type: "set-mode", mode });
    analytics.track("mode_selected", {
      mode,
      previousMode,
      source,
    });
  },
  onQualityChange: (tier) => applyQualityTier(tier, "manual"),
});
const navigationHub = createNavigationHub({
  root: uiRoot,
  triggerHost: hudBar,
  onLinkClick: (page) => {
    analytics.track("link_interaction", {
      url: page.url,
      origin: "navigation-hub",
      status: "success",
    });
    sessionDepth.recordPageVisit(page.url);
  },
});

settingsMenu.setQualityTier(activeQualityTier, qualitySource === "auto");
const uiReadyMs = performance.now();
const sessionDepth = createSessionDepthTracker(analytics);

// Accent color per destination URL (rebuilt whenever links regenerate)
const accentByUrl = new Map<string, string>();
const DEFAULT_ACCENT = "#ffc857";

type TravelOrigin = "world-link-aimed" | "world-link-clicked" | "waypoint-card";

// Step-through veil: a quick accent-colored flash before leaving for a destination
const travelVeil = document.createElement("div");
travelVeil.className = "travel-veil";
uiRoot.append(travelVeil);
let isTraveling = false;

const travelTo = (page: PageEntry, origin: TravelOrigin) => {
  if (isTraveling) return;
  isTraveling = true;

  analytics.track("link_interaction", {
    url: page.url,
    origin,
    status: "success",
  });
  sessionDepth.recordPageVisit(page.url);

  travelVeil.style.setProperty("--veil-accent", accentByUrl.get(page.url) ?? DEFAULT_ACCENT);
  travelVeil.classList.add("is-active");
  // Inline end-state so the flash lands even if the transition clock stalls
  travelVeil.style.opacity = "1";
  window.setTimeout(() => window.location.assign(page.url), 420);
};

const waypointCard = createWaypointCard({
  root: uiRoot,
  onTravel: (page) => travelTo(page, "waypoint-card"),
});

const compass = createCompass({ root: uiRoot });

const loadingVeil = uiRoot.querySelector<HTMLElement>("[data-loading-veil]");
const reticle = uiRoot.querySelector<HTMLElement>("[data-reticle]");

const heroOverlay = createHeroOverlay({
  root: uiRoot,
  onAction: (action) => {
    analytics.track("hero_action", { action });
    if (action === "settings") {
      // Settings opens above the hero; the landing page stays put behind it.
      settingsMenu.open();
      return;
    }
    heroOverlay.hide();
    if (action === "enter") {
      const state = experienceState.getState();
      if (state.mode === "explorer" && state.pointerLockConsent) {
        controls.controls.lock();
      }
    } else if (action === "explore") {
      navigationHub.open();
    }
  },
});

// Clicking the overlay backdrop (outside the buttons) also enters the world
const heroOverlayElement = uiRoot.querySelector<HTMLElement>("[data-hero-overlay]");
heroOverlayElement?.addEventListener("click", (event) => {
  const target = event.target as HTMLElement | null;
  if (target?.closest("[data-overlay-action]")) return;
  heroOverlay.hide();
  const state = experienceState.getState();
  if (state.mode === "explorer" && state.pointerLockConsent) {
    controls.controls.lock();
  }
});

document.addEventListener("pointerlockchange", () => {
  const locked = document.pointerLockElement === canvas;
  reticle?.classList.toggle("is-visible", locked);
  heroOverlay.setLocked(locked);
});

experienceState.subscribe((state) => {
  controls.setMode(state.mode);
  controls.setPointerLockAllowed(state.pointerLockConsent);
  settingsMenu.setState(state);

});

// World Objects
let terrain: Awaited<ReturnType<typeof createTerrainMeshFromHeightmap>> | null = null;
let propsManager: ReturnType<typeof createPropsManager> | null = null;

let sky: ReturnType<typeof createSky> | null = null;
let asciiCloudField: Awaited<ReturnType<typeof createAsciiCloudField>> | null = null;
let linksScene: Awaited<ReturnType<typeof createLinks>> | null = null;
let proximityEffect: ReturnType<typeof createProximityEffect> | null = null;
let temple: Temple | null = null;
let lightRoads: LightRoads | null = null;
let cloudDeck: AsciiCloudDeck | null = null;
let creatureLayer: CreatureLayer | null = null;

// Effects
let weather: ReturnType<typeof createWeatherEffects> | null = null;


// Persistent Settings
// v2: world scaled up 7000 → 18000; bump the key so stale saved settings
// don't pin visitors to the old, smaller valley
const SETTINGS_KEY = "invisible_acropolis_dev_settings_v2";

const defaultSettings: DevSettings = {
  props: {
    // Scaled with the 18000-unit world so the valley doesn't feel empty
    totalDensity: 3,
    treeDensity: 1,
    rockDensity: 1,
    clusteringFactor: 1,
  },
  bloom: {
    strength: 0.42,
    radius: 0.45,
    threshold: 0.35,
  },
  terrain: {
    size: 18000,
    segments: 200,
    height: 850,
    colorLow: "#00008b",
    colorHigh: "#a8c4ff",
    gradientStart: 0.0,
    gradientEnd: 1.0,
    gradientSkew: 1.0,
  },
  links: {
    size: 150.0,
    placementRadius: 7200,
    placementShape: "spread",
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
  if (temple) {
    temple.group.removeFromParent();
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

  // 4. The acropolis itself — the landmark every light road radiates from
  temple = createTemple({
    position: new THREE.Vector3(0, terrain.heightAt(0, 0), 0),
    scale: (linksConfig?.size || 150.0) * 1.15,
  });
  enableBloom(temple.group);
  world.add(temple.group);

  // 5. Create Links
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
    placementRadius: linksConfig?.placementRadius ?? 7200,
    placementShape: linksConfig?.placementShape ?? "spread",
    centerClearance: temple ? temple.footprintRadius + 250 : 1000,
  });
  enableBloom(linksScene.group);
  world.add(linksScene.group);

  accentByUrl.clear();
  linksScene.labels.forEach(({ page, accentColor }) => {
    accentByUrl.set(page.url, accentColor);
  });

  compass.setTargets(
    linksScene.labels.map(({ page, accentColor, monument }) => ({
      x: monument.position.x,
      z: monument.position.z,
      accentColor,
      title: page.title,
      url: page.url,
    }))
  );

  // Light roads: terrain-hugging guide lines from the temple to each monument
  if (lightRoads) {
    lightRoads.dispose();
    lightRoads = null;
  }
  if (temple && terrain) {
    lightRoads = createLightRoads({
      origin: temple.group.position.clone(),
      originClearance: temple.footprintRadius + 60,
      targets: linksScene.labels.map(({ monument, accentColor }) => ({
        position: monument.position.clone(),
        accentColor,
      })),
      heightAt: terrain.heightAt,
      hover: 22,
      packetsPerRoad: 44,
      packetSize: 36,
    });
    enableBloom(lightRoads.group);
    world.add(lightRoads.group);
  }

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

/**
 * Flight phases: while the hero overlay is up the camera slowly orbits the
 * valley (a living landing page), then glides into the spawn pose when the
 * visitor enters, and finally hands over to free flight.
 */
type FlightPhase = "orbit" | "glide" | "free";
let flightPhase: FlightPhase = "orbit";

const ORBIT_RADIUS = 5400;
const ORBIT_HEIGHT = 1500;
const ORBIT_SPEED = 0.02; // radians per second
let orbitAngle = 0;
// The orbit gazes at the temple that now crowns the valley center
const orbitLook = new THREE.Vector3(0, 420, 0);

const GLIDE_SECONDS = 2.6;
let glideElapsed = 0;
const glideFrom = new THREE.Vector3();
const glideFromQuat = new THREE.Quaternion();
const glideToQuat = new THREE.Quaternion();

const spawnPosition = new THREE.Vector3(0, 300, 800);
const spawnLook = new THREE.Vector3(0, 0, 0);

/** Frame the highest-priority monument from just inside the ring. */
const computeSpawnPose = () => {
  if (linksScene && linksScene.labels.length > 0) {
    const first = linksScene.labels[0];
    const monumentPos = first.monument.position;
    const linkSize = loadSettings().links?.size ?? 150;
    // Aim between the sculpture and its floating title (title sits at ~3.6 units)
    const lookHeight = linkSize * 2.2;
    // Stand outside the monument looking inward, so the title reads face-on
    // with the temple and the rest of the valley layered behind it
    const toCenter = new THREE.Vector3(-monumentPos.x, 0, -monumentPos.z).normalize();
    const camX = monumentPos.x - toCenter.x * linkSize * 8;
    const camZ = monumentPos.z - toCenter.z * linkSize * 8;
    const groundY = terrain ? terrain.heightAt(camX, camZ) : 0;
    const camY = Math.max(monumentPos.y + lookHeight + linkSize * 1.4, groundY + linkSize * 1.6);
    spawnPosition.set(camX, camY, camZ);
    spawnLook.set(monumentPos.x, monumentPos.y + lookHeight, monumentPos.z);
  }
  // Matrix4.lookAt uses camera convention (-Z toward target); a plain
  // Object3D.lookAt would face the glide exactly the wrong way.
  const lookMatrix = new THREE.Matrix4().lookAt(spawnPosition, spawnLook, new THREE.Vector3(0, 1, 0));
  glideToQuat.setFromRotationMatrix(lookMatrix);
  // Start the orbit just behind the spawn azimuth so the glide-in stays short
  orbitAngle = Math.atan2(spawnPosition.z, spawnPosition.x) - 0.25;
};

const BASE_FOV = 60;
const BOOST_FOV_KICK = 16;
const MIN_ALTITUDE_ABOVE_GROUND = 14;

const atmosphereGroup = new THREE.Group();
world.add(atmosphereGroup);

const createAtmosphericAccents = () => {
  const ringGeo = new THREE.TorusGeometry(1450, 10, 16, 220);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x3a7dff, transparent: true, opacity: 0.35 });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.rotation.x = Math.PI * 0.5;
  ring.position.y = 200;
  enableBloom(ring);
  atmosphereGroup.add(ring);

  const beaconGeo = new THREE.SphereGeometry(10, 16, 16);
  const beaconMat = new THREE.MeshBasicMaterial({ color: 0xb4ccff });
  for (let i = 0; i < 18; i += 1) {
    const beacon = new THREE.Mesh(beaconGeo, beaconMat.clone());
    const a = (i / 18) * Math.PI * 2;
    const r = 1200 + (i % 3) * 90;
    beacon.position.set(Math.cos(a) * r, 160 + (i % 4) * 20, Math.sin(a) * r);
    beacon.userData.phase = i * 0.37;
    enableBloom(beacon);
    atmosphereGroup.add(beacon);
  }
};
createAtmosphericAccents();

// Hover picking (unlocked pointer): throttled mousemove raycast
let hoveredPage: PageEntry | null = null;
let lastHoverCheckMs = 0;
window.addEventListener("mousemove", (event) => {
  if (document.pointerLockElement === canvas) {
    hoveredPage = null;
    return;
  }
  if (event.target !== canvas) {
    hoveredPage = null;
    return;
  }
  const now = performance.now();
  if (now - lastHoverCheckMs < 80) return;
  lastHoverCheckMs = now;
  hoveredPage = pickPageAtPointer(event);
  document.body.style.cursor = hoveredPage ? "pointer" : "default";
});

let activeWaypointUrl: string | null = null;

const updateWaypoint = () => {
  // Keep the HUD quiet while the intro overlay is up
  if (heroOverlayElement && !heroOverlayElement.classList.contains("is-hidden")) {
    if (activeWaypointUrl !== null) {
      activeWaypointUrl = null;
      waypointCard.hide();
    }
    reticle?.classList.remove("is-targeting");
    return;
  }

  let activePage: PageEntry | null = null;

  if (linksScene) {
    if (document.pointerLockElement === canvas) {
      // Pointer locked: whatever the reticle is aiming at
      activePage = pickPageFromRay(SCREEN_CENTER);
    } else if (hoveredPage) {
      activePage = hoveredPage;
    }

    if (!activePage && proximityEffect) {
      // Fall back to the nearest monument in range
      activePage = linksScene.pageForObject(proximityEffect.getActiveTarget());
    }
  }

  reticle?.classList.toggle("is-targeting", Boolean(activePage) && document.pointerLockElement === canvas);

  const nextUrl = activePage?.url ?? null;
  if (nextUrl === activeWaypointUrl) return;
  activeWaypointUrl = nextUrl;

  if (activePage) {
    waypointCard.show(activePage, accentByUrl.get(activePage.url) ?? DEFAULT_ACCENT);
  } else {
    waypointCard.hide();
  }
};

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

  stats?.begin();

  const heroVisible = Boolean(heroOverlayElement && !heroOverlayElement.classList.contains("is-hidden"));

  if (flightPhase === "orbit") {
    orbitAngle += frameDeltaSeconds * ORBIT_SPEED;
    const orbitX = Math.cos(orbitAngle) * ORBIT_RADIUS;
    const orbitZ = Math.sin(orbitAngle) * ORBIT_RADIUS;
    const groundY = terrain ? terrain.heightAt(orbitX, orbitZ) : 0;
    camera.position.set(orbitX, Math.max(ORBIT_HEIGHT, groundY + 220), orbitZ);
    camera.lookAt(orbitLook);

    if (!heroVisible) {
      // Visitor entered: glide from the orbit into the spawn pose
      flightPhase = "glide";
      glideElapsed = 0;
      glideFrom.copy(camera.position);
      glideFromQuat.copy(camera.quaternion);
    }
  } else if (flightPhase === "glide") {
    glideElapsed += frameDeltaSeconds;
    const t = Math.min(1, glideElapsed / GLIDE_SECONDS);
    const eased = t * t * (3 - 2 * t);
    camera.position.lerpVectors(glideFrom, spawnPosition, eased);
    if (document.pointerLockElement !== canvas) {
      camera.quaternion.slerpQuaternions(glideFromQuat, glideToQuat, eased);
    }
    if (t >= 1) {
      flightPhase = "free";
    }
  } else {
    controls.update(frameDeltaSeconds);

    // Stay above the terrain and inside the world bounds
    if (terrain) {
      const minY = terrain.heightAt(camera.position.x, camera.position.z) + MIN_ALTITUDE_ABOVE_GROUND;
      if (camera.position.y < minY) camera.position.y = minY;
    }
    camera.position.x = THREE.MathUtils.clamp(camera.position.x, -9800, 9800);
    camera.position.z = THREE.MathUtils.clamp(camera.position.z, -9800, 9800);
    camera.position.y = Math.min(camera.position.y, 7200);

    // Speed-reactive FOV: widen at full boost for a real sense of velocity
    const targetFov = BASE_FOV + controls.getBoost() * BOOST_FOV_KICK;
    if (Math.abs(targetFov - camera.fov) > 0.01) {
      camera.fov += (targetFov - camera.fov) * Math.min(1, frameDeltaSeconds * 4);
      camera.updateProjectionMatrix();
    }
  }

  if (weather && rainEnabled) weather.update(time, frameDeltaSeconds);

  if (sky) sky.update(time);
  if (asciiCloudField) asciiCloudField.update(time, frameDeltaSeconds, camera);
  if (cloudDeck) cloudDeck.update(time, frameDeltaSeconds);
  if (creatureLayer) creatureLayer.update(time, frameDeltaSeconds);

  atmosphereGroup.children.forEach((child, index) => {
    if (child instanceof THREE.Mesh && child.geometry instanceof THREE.SphereGeometry) {
      const phase = Number(child.userData.phase ?? 0);
      child.position.y += Math.sin(time * 1.6 + phase) * 0.12;
      const scale = 1 + Math.sin(time * 2.2 + phase) * 0.08;
      child.scale.setScalar(scale);
    }
    if (index === 0) {
      child.rotation.z += frameDeltaSeconds * 0.04;
    }
  });

  if (linksScene) {
    linksScene.updateVisibility(camera);
    linksScene.update(time, camera);
  }
  if (temple) temple.update(time);
  if (lightRoads) lightRoads.update(time);
  if (proximityEffect) proximityEffect.update(camera);
  updateWaypoint();

  compass.setVisible(flightPhase !== "orbit");
  if (flightPhase !== "orbit") compass.update(camera, activeWaypointUrl);

  postProcessing.render();

  stats?.end();

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


  applyQualityTier(activeQualityTier, qualitySource);

  // Initial Generation
  console.log("Generating world...");
  await generateWorld(settings.terrain!, settings.props, settings.links);
  console.log("World generated");

  // Camera Spawn & Controls
  // The camera starts on the hero orbit; this fixes where the glide-in lands.
  computeSpawnPose();

  // Create Sky
  // Deepened versions of the world palette so the horizon doesn't sear
  sky = createSky({
    radius: 24000,
    topColor: "#123764",
    bottomColor: "#b84b96",
    dayDuration: 320,
  });
  world.add(sky.mesh);
  // The sky owns a night-time starfield that fades in with its day cycle
  world.add(sky.stars);

  // The bestiary: mythological spirit-creatures crossing the valley
  creatureLayer = createCreatureLayer({
    seed: WORLD_SEED + 555,
    worldSize: settings.terrain!.size,
    // Closure so creatures keep tracking the terrain even after regeneration
    heightAt: (x, z) => terrain?.heightAt(x, z) ?? 0,
    maxActive: 5,
  });
  enableBloom(creatureLayer.group);
  world.add(creatureLayer.group);
  if (debugEnabled) {
    const debugWindow = window as Window & {
      __IA_CREATURES__?: () => unknown;
      __IA_SUMMON__?: (name?: string) => string | undefined;
    };
    debugWindow.__IA_CREATURES__ = () =>
      creatureLayer?.getActive().map(({ name, position }) => ({
        name,
        x: Math.round(position.x),
        y: Math.round(position.y),
        z: Math.round(position.z),
      }));
    debugWindow.__IA_SUMMON__ = (name?: string) => {
      const forward = new THREE.Vector3();
      camera.getWorldDirection(forward);
      const through = camera.position.clone().addScaledVector(forward, 1600);
      return creatureLayer?.summon(through, name);
    };
  }

  // The atmospheric ASCII cloud deck: the weather layer of the dimension
  cloudDeck = createAsciiCloudDeck({
    seed: WORLD_SEED + 311,
    worldSize: settings.terrain!.size,
    baseAltitude: 2500,
    cirrusAltitude: 3700,
    cumulusCount: 34,
    cirrusCount: 8,
  });
  world.add(cloudDeck.group);

  const cloudStructure: AsciiCloudStructure = {
    layerCount: 4,
    sigilsPerLayer: 5,
    glyphsPerSigil: 35,
  };

  const buildCloudField = async (structure: AsciiCloudStructure) => {
    if (asciiCloudField) {
      asciiCloudField.group.removeFromParent();
    }
    asciiCloudField = await createAsciiCloudField({
      seed: WORLD_SEED + 77,
      layerCount: structure.layerCount,
      sigilsPerLayer: structure.sigilsPerLayer,
      glyphsPerSigil: structure.glyphsPerSigil,
      terrainWidth: settings.terrain!.size,
      terrainDepth: settings.terrain!.size,
      baseAltitude: 1250,
      verticalSpacing: 220,
      sigilScaleMin: 140,
      sigilScaleMax: 320,
      glyphSizeMin: 16,
      glyphSizeMax: 46,
      extrudeDepth: 3.5,
      cullDistance: 11000,
    });
    enableBloom(asciiCloudField.group);
    world.add(asciiCloudField.group);
  };

  await buildCloudField(cloudStructure);

  // Effects
  weather = createWeatherEffects({
    scene,
    fogDensity: 0.00009
  });
  if (weather) {
    weather.group.visible = rainEnabled;
    scene.add(weather.group);
  }

  // Ray Interaction (Click)
  // Pointer locked: travel to whatever the reticle is aiming at.
  // Pointer free: travel to the monument under the cursor (any part of it —
  // text, rings, or light pillar all count).
  window.addEventListener("click", (event) => {
    if (!linksScene) return;

    if (document.pointerLockElement === canvas) {
      const page = pickPageFromRay(SCREEN_CENTER);
      if (page) {
        travelTo(page, "world-link-aimed");
      }
      return;
    }

    if (event.target !== canvas) return;
    const page = pickPageAtPointer(event);
    if (page) {
      travelTo(page, "world-link-clicked");
    }
  });

  // Dev Panel (only with ?debug in the URL)
  if (debugEnabled) createDevPanel({
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
    },
    cloudParams: asciiCloudField?.params,
    cloudStructure,
    onCloudRebuild: (structure) => {
      buildCloudField(structure);
    },
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
    navigationHub.dispose();
    settingsMenu.dispose();
    waypointCard.dispose();
    compass.dispose();
    heroOverlay.dispose();
    controls.dispose();
  });

  requestAnimationFrame(animate);

  // World is live — lift the veil and present the hero introduction
  loadingVeil?.classList.add("is-hidden");
  heroOverlay.show();
};

void initialize().catch(e => console.error("Initialize failed:", e));
