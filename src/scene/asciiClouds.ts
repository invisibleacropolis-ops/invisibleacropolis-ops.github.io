import * as THREE from "three";
import { FontLoader } from "three/examples/jsm/loaders/FontLoader.js";

/* ───────────────────────────────────────────────────────────────
   ASCII Cloud Layer – World-integrated volumetric glyph clouds

   Clouds are scattered across the terrain footprint as fixed
   world-space formations. They drift laterally with wind, form
   and dissolve in sections, and hover above the heightmap at
   varying altitudes — never attached to the camera.
   ─────────────────────────────────────────────────────────────── */

export type AsciiCloudField = {
  group: THREE.Group;
  update: (timeSeconds: number, deltaSeconds: number) => void;
};

/* ── Per-glyph state ─────────────────────────────────────────── */

type AsciiGlyph = {
  mesh: THREE.Mesh;
  /** Which cloud cluster this glyph belongs to */
  clusterId: number;
  /** Layer index (0 = lowest) */
  layerIndex: number;
  /** Local offset from cluster centre */
  localOffset: THREE.Vector3;
  /** World-space base X */
  baseX: number;
  /** World-space base Z */
  baseZ: number;
  /** Base Y position (altitude above terrain) */
  baseY: number;
  /** Lateral drift velocity X (world units / sec) */
  driftVX: number;
  /** Lateral drift velocity Z (world units / sec) */
  driftVZ: number;
  /** Accumulated drift offset X */
  driftOffsetX: number;
  /** Accumulated drift offset Z */
  driftOffsetZ: number;
  /** Vertical oscillation speed */
  waveSpeed: number;
  /** Vertical oscillation amplitude */
  waveAmplitude: number;
  /** Phase offset for wave */
  wavePhase: number;
  /** When reveal starts (seconds) */
  revealDelay: number;
  /** Duration of reveal fade-in */
  revealDuration: number;
  /** Lifecycle start time */
  lifeStart: number;
  /** Lifecycle duration */
  lifeDuration: number;
  /** When next mutation fires */
  nextMutationAt: number;
  /** Cadence between mutations */
  mutationCadence: number;
  /** Base scale of this glyph */
  baseScale: number;
  /** Z-rotation velocity (slow tumble) */
  tumbleSpeed: number;
  /** Whether this glyph is part of a wisp tendril */
  isWisp: boolean;
  /** Wisp extension factor (0 = retracted, 1 = fully extended) */
  wispExtension: number;
  /** Wisp target extension */
  wispTarget: number;
  /** Wisp extension speed */
  wispSpeed: number;
  /** Initial rotation snapshot for gentle sway */
  baseRotX: number;
  baseRotY: number;
};

/* ── Cloud cluster: a group of glyphs that move together ────── */

type CloudCluster = {
  id: number;
  /** World-space centre X */
  centreX: number;
  /** World-space centre Z */
  centreZ: number;
  /** Base Y (altitude) */
  baseY: number;
  /** Lateral drift velocity (world units / sec) */
  driftVX: number;
  driftVZ: number;
  /** Accumulated drift */
  driftOffsetX: number;
  driftOffsetZ: number;
  /** Cluster "size" – how spread out the glyphs are */
  spread: number;
  /** Current formation phase (0 = forming, 1 = stable, 2 = dissolving) */
  phase: number;
  /** Phase timer */
  phaseTimer: number;
  /** Duration of each phase */
  formDuration: number;
  stableDuration: number;
  dissolveDuration: number;
  /** Vertical drift amplitude */
  verticalDrift: number;
  /** Layer this cluster belongs to */
  layerIndex: number;
  /** Wind influence multiplier */
  windInfluence: number;
  /** Half-extents of the terrain for wrapping */
  terrainHalfW: number;
  terrainHalfD: number;
};

/* ── Wind system ─────────────────────────────────────────────── */

type WindState = {
  /** Current wind direction angle (radians) */
  direction: number;
  /** Current wind strength (world units / sec) */
  strength: number;
  /** Target values (slowly interpolated to) */
  targetDirection: number;
  targetStrength: number;
  /** Time until next wind shift */
  nextShiftAt: number;
};

/* ── Options ─────────────────────────────────────────────────── */

type AsciiCloudOptions = {
  seed?: number;
  /** Number of vertical cloud layers */
  layerCount?: number;
  /** Cluster formations per layer */
  clustersPerLayer?: number;
  /** Core glyphs in each cluster */
  glyphsPerCluster?: number;
  /** Wisp/tendril glyphs per cluster */
  wispGlyphsPerCluster?: number;
  /** Terrain width to scatter across */
  terrainWidth?: number;
  /** Terrain depth to scatter across */
  terrainDepth?: number;
  /** Lowest cloud altitude */
  baseAltitude?: number;
  /** Vertical spacing between layers */
  verticalSpacing?: number;
  /** Minimum glyph size */
  glyphSizeMin?: number;
  /** Maximum glyph size */
  glyphSizeMax?: number;
  /** Extrusion depth for 3D glyphs */
  extrudeDepth?: number;
  /** Tint palette per layer */
  palette?: number[];
  /** Character pool */
  characters?: string;
};

/* ── Character sets ──────────────────────────────────────────── */

const CORE_GLYPHS = "@#$%&*+=-:;<>[]{}()!?/\\|^~";
const EXTRA_GLYPHS = "^v<>[]{}()@#$%&*";
const ALL_GLYPHS = CORE_GLYPHS + EXTRA_GLYPHS;

const FONT_URL = "/helvetiker_regular.typeface.json";

/* ── Seeded PRNG ─────────────────────────────────────────────── */

const createSeededRandom = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
};

const pick = <T>(items: T[], random: () => number): T => {
  const index = Math.floor(random() * items.length) % items.length;
  return items[index] as T;
};

const gaussRandom = (random: () => number, mean: number, stddev: number): number => {
  const u1 = Math.max(1e-10, random());
  const u2 = random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z * stddev;
};

const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

/* ── Main factory ────────────────────────────────────────────── */

export const createAsciiCloudField = async (
  options: AsciiCloudOptions = {},
): Promise<AsciiCloudField> => {
  const {
    seed = 90210,
    layerCount = 5,
    clustersPerLayer = 8,
    glyphsPerCluster = 18,
    wispGlyphsPerCluster = 6,
    terrainWidth = 7000,
    terrainDepth = 7000,
    baseAltitude = 350,
    verticalSpacing = 120,
    glyphSizeMin = 12,
    glyphSizeMax = 36,
    extrudeDepth = 3,
    palette = [0xe4efff, 0xc4d8ff, 0x9ab8ff, 0x7da4ff, 0x6690ff],
    characters = ALL_GLYPHS,
  } = options;

  const random = createSeededRandom(seed);
  const font = await new FontLoader().loadAsync(FONT_URL);
  const group = new THREE.Group();
  group.name = "ascii-cloud-field";

  const halfW = terrainWidth * 0.5;
  const halfD = terrainDepth * 0.5;

  /* ── Geometry caches ────────────────────────────────────────── */

  const shapeCache = new Map<string, THREE.ShapeGeometry>();
  const extrudeCache = new Map<string, THREE.ExtrudeGeometry>();

  const centreGeometry = (geo: THREE.BufferGeometry) => {
    geo.computeBoundingBox();
    const box = geo.boundingBox;
    if (box) {
      geo.translate(
        -(box.min.x + box.max.x) * 0.5,
        -(box.min.y + box.max.y) * 0.5,
        -(box.min.z + box.max.z) * 0.5,
      );
    }
  };

  const getShapeGeometry = (char: string, size: number): THREE.ShapeGeometry => {
    const key = `s-${char}-${size.toFixed(1)}`;
    const existing = shapeCache.get(key);
    if (existing) return existing;
    const shapes = font.generateShapes(char, size);
    const geo = new THREE.ShapeGeometry(shapes);
    centreGeometry(geo);
    shapeCache.set(key, geo);
    return geo;
  };

  const getExtrudeGeometry = (char: string, size: number, depth: number): THREE.ExtrudeGeometry => {
    const key = `e-${char}-${size.toFixed(1)}-${depth.toFixed(1)}`;
    const existing = extrudeCache.get(key);
    if (existing) return existing;
    const shapes = font.generateShapes(char, size);
    const geo = new THREE.ExtrudeGeometry(shapes, {
      depth,
      bevelEnabled: true,
      bevelThickness: depth * 0.15,
      bevelSize: depth * 0.1,
      bevelSegments: 1,
    });
    centreGeometry(geo);
    extrudeCache.set(key, geo);
    return geo;
  };

  /* ── Wind system ────────────────────────────────────────────── */

  const wind: WindState = {
    direction: random() * Math.PI * 2,
    strength: 8 + random() * 12,           // world units/sec
    targetDirection: random() * Math.PI * 2,
    targetStrength: 6 + random() * 15,
    nextShiftAt: 8 + random() * 15,
  };

  const updateWind = (timeSeconds: number, deltaSeconds: number) => {
    if (timeSeconds >= wind.nextShiftAt) {
      wind.targetDirection += (random() - 0.5) * Math.PI * 0.8;
      wind.targetStrength = 5 + random() * 18;
      wind.nextShiftAt = timeSeconds + 12 + random() * 25;
    }
    wind.direction += (wind.targetDirection - wind.direction) * deltaSeconds * 0.12;
    wind.strength += (wind.targetStrength - wind.strength) * deltaSeconds * 0.15;
  };

  /* ── Build clusters scattered across the terrain ────────────── */

  const chars = Array.from(new Set(characters));
  const clusters: CloudCluster[] = [];
  const glyphs: AsciiGlyph[] = [];

  for (let layerIndex = 0; layerIndex < layerCount; layerIndex++) {
    const layerGroup = new THREE.Group();
    layerGroup.name = `ascii-cloud-layer-${layerIndex}`;

    const layerY = baseAltitude + layerIndex * verticalSpacing;
    const tint = palette[layerIndex % palette.length] ?? 0xd5e6ff;
    const layerSizeScale = 1.0 + layerIndex * 0.12;

    for (let ci = 0; ci < clustersPerLayer; ci++) {
      // Scatter cluster centres across the terrain footprint
      const cx = (random() - 0.5) * terrainWidth * 0.85;
      const cz = (random() - 0.5) * terrainDepth * 0.85;
      const clusterSpread = 80 + random() * 160;

      // Base lateral drift — slow, world-space movement
      const driftAngle = random() * Math.PI * 2;
      const driftMag = 2 + random() * 6; // world units / sec

      const cluster: CloudCluster = {
        id: clusters.length,
        centreX: cx,
        centreZ: cz,
        baseY: layerY + (random() - 0.5) * 60,
        driftVX: Math.cos(driftAngle) * driftMag,
        driftVZ: Math.sin(driftAngle) * driftMag,
        driftOffsetX: 0,
        driftOffsetZ: 0,
        spread: clusterSpread,
        phase: 0,
        phaseTimer: random() * 8, // stagger initial formation
        formDuration: 3 + random() * 5,
        stableDuration: 15 + random() * 30,
        dissolveDuration: 4 + random() * 8,
        verticalDrift: 3 + random() * 8,
        layerIndex,
        windInfluence: 0.4 + random() * 0.6,
        terrainHalfW: halfW,
        terrainHalfD: halfD,
      };
      clusters.push(cluster);

      // ── Core cluster glyphs ──
      const totalGlyphs = glyphsPerCluster + Math.floor(random() * 6) - 3;
      for (let gi = 0; gi < Math.max(1, totalGlyphs); gi++) {
        const g = createGlyphForCluster({
          cluster,
          layerIndex,
          layerGroup,
          tint,
          layerSizeScale,
          clusterSpread,
          isWisp: false,
          revealBase: cluster.phaseTimer + gi * 0.06,
          random,
          chars,
          font,
          glyphSizeMin,
          glyphSizeMax,
          extrudeDepth,
          getShapeGeometry,
          getExtrudeGeometry,
        });
        glyphs.push(g);
      }

      // ── Wisp/tendril glyphs ──
      const wispCount = Math.max(0, wispGlyphsPerCluster + Math.floor(random() * 4) - 2);
      for (let wi = 0; wi < wispCount; wi++) {
        const g = createGlyphForCluster({
          cluster,
          layerIndex,
          layerGroup,
          tint,
          layerSizeScale,
          clusterSpread,
          isWisp: true,
          revealBase: cluster.phaseTimer + totalGlyphs * 0.06 + wi * 0.12,
          random,
          chars,
          font,
          glyphSizeMin,
          glyphSizeMax,
          extrudeDepth,
          getShapeGeometry,
          getExtrudeGeometry,
        });
        glyphs.push(g);
      }
    }

    group.add(layerGroup);
  }

  /* ── Mutation logic ─────────────────────────────────────────── */

  const mutateGlyph = (glyph: AsciiGlyph, timeSeconds: number) => {
    const glyphChar = pick(chars, random);
    const size = glyphSizeMin + random() * (glyphSizeMax - glyphSizeMin);
    const useExtrude = random() > 0.35;

    glyph.mesh.geometry = useExtrude
      ? getExtrudeGeometry(glyphChar, size, extrudeDepth * (0.4 + random() * 0.6))
      : getShapeGeometry(glyphChar, size);

    glyph.lifeStart = timeSeconds;
    glyph.lifeDuration = 6 + random() * 12;
    glyph.nextMutationAt = timeSeconds + glyph.mutationCadence * (0.6 + random() * 0.8);
    glyph.mesh.rotation.z += (random() - 0.5) * 0.5;
    glyph.mesh.rotation.y += (random() - 0.5) * 0.3;
  };

  /* ── Sectional formation: track which sector is currently active ── */

  let activeSector = 0;
  let sectorTimer = 0;
  const sectorCount = layerCount * 2;
  const sectorDuration = 4 + random() * 6;

  /* ── Wrap helper: keeps clusters within terrain bounds ──────── */

  const wrapCoord = (val: number, half: number): number => {
    if (val > half) return val - half * 2;
    if (val < -half) return val + half * 2;
    return val;
  };

  /* ── Update loop ────────────────────────────────────────────── */

  return {
    group,
    update: (timeSeconds: number, deltaSeconds: number) => {
      updateWind(timeSeconds, deltaSeconds);

      // Advance sector formation
      sectorTimer += deltaSeconds;
      if (sectorTimer > sectorDuration) {
        sectorTimer = 0;
        activeSector = (activeSector + 1) % sectorCount;
      }

      // Wind displacement per frame
      const windDx = Math.cos(wind.direction) * wind.strength * deltaSeconds;
      const windDz = Math.sin(wind.direction) * wind.strength * deltaSeconds;

      // ── Update clusters ──
      for (const cluster of clusters) {
        cluster.phaseTimer += deltaSeconds;
        const totalCycle = cluster.formDuration + cluster.stableDuration + cluster.dissolveDuration;

        if (cluster.phaseTimer > totalCycle) {
          // Cluster reforms — can shift position slightly
          cluster.phaseTimer = 0;
          cluster.centreX += (random() - 0.5) * 200;
          cluster.centreZ += (random() - 0.5) * 200;
          cluster.spread = 80 + random() * 160;
        }

        // Determine phase
        if (cluster.phaseTimer < cluster.formDuration) {
          cluster.phase = 0;
        } else if (cluster.phaseTimer < cluster.formDuration + cluster.stableDuration) {
          cluster.phase = 1;
        } else {
          cluster.phase = 2;
        }

        // Drift cluster: own velocity + wind influence
        cluster.driftOffsetX += (cluster.driftVX + windDx * cluster.windInfluence / deltaSeconds) * deltaSeconds;
        cluster.driftOffsetZ += (cluster.driftVZ + windDz * cluster.windInfluence / deltaSeconds) * deltaSeconds;

        // Wrap so clusters cycle back across terrain
        const worldX = cluster.centreX + cluster.driftOffsetX;
        const worldZ = cluster.centreZ + cluster.driftOffsetZ;
        if (Math.abs(worldX) > halfW * 1.2) {
          cluster.driftOffsetX = wrapCoord(worldX, halfW * 1.2) - cluster.centreX;
        }
        if (Math.abs(worldZ) > halfD * 1.2) {
          cluster.driftOffsetZ = wrapCoord(worldZ, halfD * 1.2) - cluster.centreZ;
        }
      }

      // Global breathing
      const globalBreath = 0.7 + Math.sin(timeSeconds * 0.4) * 0.15 + Math.sin(timeSeconds * 0.17) * 0.15;

      // ── Update each glyph ──
      for (const glyph of glyphs) {
        const cluster = clusters[glyph.clusterId]!;

        // Cluster phase opacity
        let clusterOpacity = 1;
        if (cluster.phase === 0) {
          clusterOpacity = smoothstep(0, 1, cluster.phaseTimer / cluster.formDuration);
        } else if (cluster.phase === 2) {
          const dissolveStart = cluster.formDuration + cluster.stableDuration;
          const t = (cluster.phaseTimer - dissolveStart) / cluster.dissolveDuration;
          clusterOpacity = 1 - smoothstep(0, 1, t);
        }

        // Sectional formation boost
        const glyphSector = (glyph.layerIndex * 2 + (glyph.clusterId % 2)) % sectorCount;
        const sectorActive = glyphSector === activeSector || glyphSector === (activeSector + 1) % sectorCount;
        const sectorBoost = sectorActive ? 1.15 : 0.92;

        // Glyph's own drift (minor individual drift on top of cluster)
        glyph.driftOffsetX += glyph.driftVX * deltaSeconds;
        glyph.driftOffsetZ += glyph.driftVZ * deltaSeconds;

        // Vertical wave
        const waveY = Math.sin(timeSeconds * glyph.waveSpeed + glyph.wavePhase) * glyph.waveAmplitude;

        // Wisp extension
        let wispMul = 1;
        if (glyph.isWisp) {
          glyph.wispTarget = 0.3 + Math.sin(timeSeconds * glyph.wispSpeed * 2 + glyph.wavePhase) * 0.5 + 0.2;
          glyph.wispExtension += (glyph.wispTarget - glyph.wispExtension) * deltaSeconds * glyph.wispSpeed * 3;
          wispMul = glyph.wispExtension;
        }

        // Compose world position: cluster centre + cluster drift + local offset + glyph drift
        const worldX = cluster.centreX + cluster.driftOffsetX
          + glyph.localOffset.x * wispMul
          + glyph.driftOffsetX;
        const worldZ = cluster.centreZ + cluster.driftOffsetZ
          + glyph.localOffset.z * wispMul
          + glyph.driftOffsetZ;
        const worldY = glyph.baseY + waveY + glyph.localOffset.y * wispMul;

        glyph.mesh.position.set(worldX, worldY, worldZ);

        // Gentle rotation sway (NOT lookAt, NOT radial — just slow tumble in place)
        glyph.mesh.rotation.x = glyph.baseRotX + Math.sin(timeSeconds * 0.3 + glyph.wavePhase) * 0.08;
        glyph.mesh.rotation.y = glyph.baseRotY + Math.sin(timeSeconds * 0.2 + glyph.wavePhase * 1.3) * 0.06;
        glyph.mesh.rotation.z += glyph.tumbleSpeed * deltaSeconds;

        // ── Opacity ──
        const revealT = THREE.MathUtils.clamp(
          (timeSeconds - glyph.revealDelay) / glyph.revealDuration,
          0, 1,
        );
        const lifeT = (timeSeconds - glyph.lifeStart) / glyph.lifeDuration;
        const lifeWave = 0.5 + Math.sin(lifeT * Math.PI * 2) * 0.5;
        const breath = globalBreath * (0.85 + Math.sin(timeSeconds * (0.7 + glyph.layerIndex * 0.1) + glyph.wavePhase * 2) * 0.15);

        let opacity = Math.pow(revealT, 1.6) * lifeWave * breath * clusterOpacity * sectorBoost;

        if (glyph.isWisp) {
          opacity *= 0.45 * glyph.wispExtension;
        }

        // Higher layers more translucent
        opacity *= 1.0 - glyph.layerIndex * 0.07;
        opacity = Math.min(opacity * 0.6, 0.72);

        const material = glyph.mesh.material;
        if (material instanceof THREE.MeshBasicMaterial) {
          material.opacity = Math.max(0, opacity);
        }

        // ── Scale ──
        const scaleWave = glyph.baseScale * (0.88 + Math.sin(timeSeconds * glyph.waveSpeed * 0.5 + glyph.wavePhase) * 0.15);
        const clusterScale = cluster.phase === 0
          ? smoothstep(0, 1, cluster.phaseTimer / cluster.formDuration)
          : cluster.phase === 2
            ? 1 - smoothstep(0, 1, (cluster.phaseTimer - cluster.formDuration - cluster.stableDuration) / cluster.dissolveDuration) * 0.4
            : 1;
        glyph.mesh.scale.setScalar(scaleWave * clusterScale);

        // ── Mutation ──
        if (timeSeconds >= glyph.nextMutationAt) {
          mutateGlyph(glyph, timeSeconds);
        }
      }

      // NO layer-group rotation — clouds are world-fixed, not a skybox
    },
  };
};

/* ── Glyph factory helper ────────────────────────────────────── */

type GlyphFactoryArgs = {
  cluster: CloudCluster;
  layerIndex: number;
  layerGroup: THREE.Group;
  tint: number;
  layerSizeScale: number;
  clusterSpread: number;
  isWisp: boolean;
  revealBase: number;
  random: () => number;
  chars: string[];
  font: any;
  glyphSizeMin: number;
  glyphSizeMax: number;
  extrudeDepth: number;
  getShapeGeometry: (char: string, size: number) => THREE.ShapeGeometry;
  getExtrudeGeometry: (char: string, size: number, depth: number) => THREE.ExtrudeGeometry;
};

const createGlyphForCluster = (args: GlyphFactoryArgs): AsciiGlyph => {
  const {
    cluster, layerIndex, layerGroup, tint, layerSizeScale, clusterSpread,
    isWisp, revealBase, random, chars,
    glyphSizeMin, glyphSizeMax, extrudeDepth,
    getShapeGeometry, getExtrudeGeometry,
  } = args;

  const glyphChar = pick(chars, random);
  const sizeFactor = isWisp ? 0.6 : 1.0;
  const size = (glyphSizeMin + random() * (glyphSizeMax - glyphSizeMin)) * layerSizeScale * sizeFactor;
  const useExtrude = random() > (isWisp ? 0.5 : 0.35);

  const geometry = useExtrude
    ? getExtrudeGeometry(glyphChar, size, extrudeDepth * (isWisp ? 0.4 : 0.5 + random()))
    : getShapeGeometry(glyphChar, size);

  const material = new THREE.MeshBasicMaterial({
    color: tint,
    transparent: true,
    depthWrite: false,
    opacity: 0,
    side: THREE.DoubleSide,
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 3;

  // Local offset: wisps are further out from cluster centre
  let localX: number, localY: number, localZ: number;
  if (isWisp) {
    const wispAngle = random() * Math.PI * 2;
    const wispDist = clusterSpread * (0.8 + random() * 1.2);
    localX = Math.cos(wispAngle) * wispDist;
    localZ = Math.sin(wispAngle) * wispDist;
    localY = (random() - 0.5) * clusterSpread * 0.3;
  } else {
    localX = gaussRandom(random, 0, clusterSpread * 0.45);
    localY = gaussRandom(random, 0, clusterSpread * 0.25);
    localZ = gaussRandom(random, 0, clusterSpread * 0.35);
  }

  // Small individual drift velocity (much slower than cluster drift)
  const indivDriftAngle = random() * Math.PI * 2;
  const indivDriftMag = 0.3 + random() * 1.2;

  const baseRotX = random() * Math.PI * 0.4;
  const baseRotY = random() * Math.PI * 2;

  mesh.rotation.set(baseRotX, baseRotY, random() * Math.PI * 2);

  const glyph: AsciiGlyph = {
    mesh,
    clusterId: cluster.id,
    layerIndex,
    localOffset: new THREE.Vector3(localX, localY, localZ),
    baseX: cluster.centreX + localX,
    baseZ: cluster.centreZ + localZ,
    baseY: cluster.baseY + localY,
    driftVX: Math.cos(indivDriftAngle) * indivDriftMag,
    driftVZ: Math.sin(indivDriftAngle) * indivDriftMag,
    driftOffsetX: 0,
    driftOffsetZ: 0,
    waveSpeed: 0.3 + random() * (isWisp ? 1.5 : 1.0),
    waveAmplitude: (isWisp ? 8 : 4) + random() * (isWisp ? 30 : 20),
    wavePhase: random() * Math.PI * 2,
    revealDelay: revealBase + random() * (isWisp ? 0.8 : 0.4),
    revealDuration: (isWisp ? 1.0 : 0.6) + random() * (isWisp ? 2.5 : 1.8),
    lifeStart: random() * 10,
    lifeDuration: (isWisp ? 6 : 8) + random() * (isWisp ? 10 : 14),
    nextMutationAt: (isWisp ? 1.5 : 2.5) + random() * (isWisp ? 4 : 7),
    mutationCadence: (isWisp ? 2 : 3) + random() * (isWisp ? 4 : 6),
    baseScale: ((isWisp ? 0.35 : 0.5) + random() * (isWisp ? 0.5 : 0.7)) * layerSizeScale,
    tumbleSpeed: (random() - 0.5) * (isWisp ? 0.25 : 0.15),
    isWisp,
    wispExtension: 0,
    wispTarget: isWisp ? 0.3 + random() * 0.7 : 0,
    wispSpeed: isWisp ? 0.1 + random() * 0.3 : 0,
    baseRotX,
    baseRotY,
  };

  layerGroup.add(mesh);
  return glyph;
};
