import * as THREE from "three";
import { FontLoader, type Font } from "three/examples/jsm/loaders/FontLoader.js";

/* ───────────────────────────────────────────────────────────────
   ASCII Cloud Layer – Volumetric glyph cloud system
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
  /** Orbital angle around world Y axis (radians) */
  angle: number;
  /** Orbital radius from world centre */
  radius: number;
  /** Drift speed in radians/sec along the orbit */
  driftSpeed: number;
  /** Base Y position */
  baseY: number;
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
  /** Depth offset within cluster for parallax */
  depthOffset: number;
};

/* ── Cloud cluster: a group of glyphs that move together ────── */

type CloudCluster = {
  id: number;
  /** World-space centre position */
  centre: THREE.Vector3;
  /** Orbital angle of the cluster */
  angle: number;
  /** Orbital radius */
  radius: number;
  /** Drift speed around the orbit */
  driftSpeed: number;
  /** Base Y elevation */
  baseY: number;
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
  /** Vertical drift rate */
  verticalDrift: number;
  /** Layer this cluster belongs to */
  layerIndex: number;
  /** Wind influence multiplier */
  windInfluence: number;
};

/* ── Wind system ─────────────────────────────────────────────── */

type WindState = {
  /** Current wind direction angle (radians) */
  direction: number;
  /** Current wind strength */
  strength: number;
  /** Target wind direction (slowly interpolated to) */
  targetDirection: number;
  /** Target wind strength */
  targetStrength: number;
  /** Time until next wind shift */
  nextShiftAt: number;
};

/* ── Options ─────────────────────────────────────────────────── */

type AsciiCloudOptions = {
  seed?: number;
  layerCount?: number;
  clustersPerLayer?: number;
  glyphsPerCluster?: number;
  wispGlyphsPerCluster?: number;
  baseRadius?: number;
  glyphSizeMin?: number;
  glyphSizeMax?: number;
  verticalSpacing?: number;
  extrudeDepth?: number;
  palette?: number[];
  characters?: string;
};

/* ── Character sets ──────────────────────────────────────────── */

const CORE_GLYPHS = "@#$%&*+=-:;<>[]{}()!?/\\|^~";
const ARROW_GLYPHS = "^v<>";
const BRACKET_GLYPHS = "[]{}()";
const SYMBOL_GLYPHS = "@#$%&*";
const ALL_GLYPHS = CORE_GLYPHS + ARROW_GLYPHS + BRACKET_GLYPHS + SYMBOL_GLYPHS;

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

/** Gaussian-ish distribution via Box-Muller approximation */
const gaussRandom = (random: () => number, mean: number, stddev: number): number => {
  const u1 = Math.max(1e-10, random());
  const u2 = random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z * stddev;
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
    baseRadius = 1200,
    glyphSizeMin = 12,
    glyphSizeMax = 36,
    verticalSpacing = 130,
    extrudeDepth = 3,
    palette = [0xe4efff, 0xc4d8ff, 0x9ab8ff, 0x7da4ff, 0x6690ff],
    characters = ALL_GLYPHS,
  } = options;

  const random = createSeededRandom(seed);
  const font = await new FontLoader().loadAsync(FONT_URL);
  const group = new THREE.Group();
  group.name = "ascii-cloud-field";

  /* ── Geometry caches ────────────────────────────────────────── */

  const shapeCache = new Map<string, THREE.ShapeGeometry>();
  const extrudeCache = new Map<string, THREE.ExtrudeGeometry>();

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

  const centreGeometry = (geo: THREE.BufferGeometry) => {
    geo.computeBoundingBox();
    const box = geo.boundingBox;
    if (box) {
      const cx = -(box.min.x + box.max.x) * 0.5;
      const cy = -(box.min.y + box.max.y) * 0.5;
      const cz = -(box.min.z + box.max.z) * 0.5;
      geo.translate(cx, cy, cz);
    }
  };

  /* ── Wind system ────────────────────────────────────────────── */

  const wind: WindState = {
    direction: random() * Math.PI * 2,
    strength: 0.15 + random() * 0.25,
    targetDirection: random() * Math.PI * 2,
    targetStrength: 0.1 + random() * 0.3,
    nextShiftAt: 8 + random() * 15,
  };

  const updateWind = (timeSeconds: number, deltaSeconds: number) => {
    if (timeSeconds >= wind.nextShiftAt) {
      wind.targetDirection += (random() - 0.5) * Math.PI * 0.8;
      wind.targetStrength = 0.08 + random() * 0.35;
      wind.nextShiftAt = timeSeconds + 10 + random() * 20;
    }
    wind.direction += (wind.targetDirection - wind.direction) * deltaSeconds * 0.15;
    wind.strength += (wind.targetStrength - wind.strength) * deltaSeconds * 0.2;
  };

  /* ── Build clusters ─────────────────────────────────────────── */

  const chars = Array.from(new Set(characters));
  const clusters: CloudCluster[] = [];
  const glyphs: AsciiGlyph[] = [];

  for (let layerIndex = 0; layerIndex < layerCount; layerIndex++) {
    const layerGroup = new THREE.Group();
    layerGroup.name = `ascii-cloud-layer-${layerIndex}`;

    const layerRadius = baseRadius + layerIndex * 200 + (random() - 0.5) * 100;
    const layerY = 220 + layerIndex * verticalSpacing;
    const tint = palette[layerIndex % palette.length] ?? 0xd5e6ff;

    // Higher layers are more transparent and larger
    const layerOpacityScale = 1.0 - layerIndex * 0.08;
    const layerSizeScale = 1.0 + layerIndex * 0.12;

    for (let ci = 0; ci < clustersPerLayer; ci++) {
      const clusterAngle = (ci / clustersPerLayer) * Math.PI * 2 + (random() - 0.5) * 0.6;
      const clusterRadius = layerRadius * (0.6 + random() * 0.5);
      const clusterSpread = 60 + random() * 120;

      const cluster: CloudCluster = {
        id: clusters.length,
        centre: new THREE.Vector3(),
        angle: clusterAngle,
        radius: clusterRadius,
        driftSpeed: 0.015 + random() * 0.04,
        baseY: layerY + (random() - 0.5) * 80,
        spread: clusterSpread,
        phase: 0,
        phaseTimer: random() * 5, // stagger initial formation
        formDuration: 3 + random() * 5,
        stableDuration: 12 + random() * 25,
        dissolveDuration: 4 + random() * 8,
        verticalDrift: (random() - 0.5) * 8,
        layerIndex,
        windInfluence: 0.5 + random() * 0.7,
      };
      clusters.push(cluster);

      // ── Core cluster glyphs ──
      const totalGlyphs = glyphsPerCluster + Math.floor(random() * 6) - 3;
      for (let gi = 0; gi < totalGlyphs; gi++) {
        const glyphChar = pick(chars, random);
        const size = (glyphSizeMin + random() * (glyphSizeMax - glyphSizeMin)) * layerSizeScale;
        const useExtrude = random() > 0.35; // 65% of glyphs are 3D extruded

        const geometry = useExtrude
          ? getExtrudeGeometry(glyphChar, size, extrudeDepth * (0.5 + random()))
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

        // Distribute within cluster using gaussian-ish distribution
        const localX = gaussRandom(random, 0, clusterSpread * 0.45);
        const localY = gaussRandom(random, 0, clusterSpread * 0.25);
        const localZ = gaussRandom(random, 0, clusterSpread * 0.35);

        const glyph: AsciiGlyph = {
          mesh,
          clusterId: cluster.id,
          layerIndex,
          localOffset: new THREE.Vector3(localX, localY, localZ),
          angle: clusterAngle + (random() - 0.5) * 0.3,
          radius: clusterRadius + (random() - 0.5) * clusterSpread * 0.4,
          driftSpeed: cluster.driftSpeed * (0.85 + random() * 0.3),
          baseY: cluster.baseY + localY,
          waveSpeed: 0.3 + random() * 1.0,
          waveAmplitude: 4 + random() * 20,
          wavePhase: random() * Math.PI * 2,
          revealDelay: cluster.phaseTimer + gi * 0.06 + random() * 0.4,
          revealDuration: 0.6 + random() * 1.8,
          lifeStart: random() * 10,
          lifeDuration: 8 + random() * 14,
          nextMutationAt: 2.5 + random() * 7,
          mutationCadence: 3 + random() * 6,
          baseScale: (0.5 + random() * 0.7) * layerSizeScale,
          tumbleSpeed: (random() - 0.5) * 0.15,
          isWisp: false,
          wispExtension: 0,
          wispTarget: 0,
          wispSpeed: 0,
          depthOffset: (random() - 0.5) * clusterSpread * 0.6,
        };

        mesh.rotation.set(
          random() * Math.PI * 0.3,
          random() * Math.PI * 2,
          random() * Math.PI * 2,
        );

        glyphs.push(glyph);
        layerGroup.add(mesh);
      }

      // ── Wisp/tendril glyphs extending from cluster edges ──
      const wispCount = wispGlyphsPerCluster + Math.floor(random() * 4) - 2;
      for (let wi = 0; wi < Math.max(0, wispCount); wi++) {
        const glyphChar = pick(chars, random);
        const size = (glyphSizeMin * 0.7 + random() * glyphSizeMin * 0.6) * layerSizeScale;
        const useExtrude = random() > 0.5;

        const geometry = useExtrude
          ? getExtrudeGeometry(glyphChar, size, extrudeDepth * 0.4)
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

        // Wisps extend outward from cluster centre
        const wispAngle = random() * Math.PI * 2;
        const wispDist = clusterSpread * (0.8 + random() * 1.2);
        const localX = Math.cos(wispAngle) * wispDist;
        const localZ = Math.sin(wispAngle) * wispDist;
        const localY = (random() - 0.5) * clusterSpread * 0.3;

        const glyph: AsciiGlyph = {
          mesh,
          clusterId: cluster.id,
          layerIndex,
          localOffset: new THREE.Vector3(localX, localY, localZ),
          angle: clusterAngle + (random() - 0.5) * 0.5,
          radius: clusterRadius + wispDist * 0.3,
          driftSpeed: cluster.driftSpeed * (0.7 + random() * 0.4),
          baseY: cluster.baseY + localY,
          waveSpeed: 0.5 + random() * 1.5,
          waveAmplitude: 8 + random() * 30,
          wavePhase: random() * Math.PI * 2,
          revealDelay: cluster.phaseTimer + totalGlyphs * 0.06 + wi * 0.12 + random() * 0.8,
          revealDuration: 1.0 + random() * 2.5,
          lifeStart: random() * 10,
          lifeDuration: 6 + random() * 10,
          nextMutationAt: 1.5 + random() * 4,
          mutationCadence: 2 + random() * 4,
          baseScale: (0.35 + random() * 0.5) * layerSizeScale,
          tumbleSpeed: (random() - 0.5) * 0.25,
          isWisp: true,
          wispExtension: 0,
          wispTarget: 0.3 + random() * 0.7,
          wispSpeed: 0.1 + random() * 0.3,
          depthOffset: (random() - 0.5) * clusterSpread * 0.4,
        };

        mesh.rotation.set(
          random() * Math.PI * 0.4,
          random() * Math.PI * 2,
          random() * Math.PI * 2,
        );

        glyphs.push(glyph);
        layerGroup.add(mesh);
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
    glyph.mesh.rotation.z += (random() - 0.5) * 0.6;
    glyph.mesh.rotation.y += (random() - 0.5) * 0.4;
  };

  /* ── Sectional formation: track which sector is currently forming ── */

  let activeSector = 0;
  let sectorTimer = 0;
  const sectorCount = layerCount * 2;
  const sectorDuration = 4 + random() * 6;

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

      // Wind displacement vector
      const windDx = Math.cos(wind.direction) * wind.strength;
      const windDz = Math.sin(wind.direction) * wind.strength;

      // Update cluster phases
      for (const cluster of clusters) {
        cluster.phaseTimer += deltaSeconds;
        const totalCycleDuration = cluster.formDuration + cluster.stableDuration + cluster.dissolveDuration;

        if (cluster.phaseTimer > totalCycleDuration) {
          // Reset cycle – cluster reforms
          cluster.phaseTimer = 0;
          cluster.angle += (random() - 0.5) * 0.4;
          cluster.baseY += (random() - 0.5) * 30;
          cluster.spread = 60 + random() * 120;
        }

        // Determine phase
        if (cluster.phaseTimer < cluster.formDuration) {
          cluster.phase = 0; // forming
        } else if (cluster.phaseTimer < cluster.formDuration + cluster.stableDuration) {
          cluster.phase = 1; // stable
        } else {
          cluster.phase = 2; // dissolving
        }

        // Drift cluster orbit
        cluster.angle += cluster.driftSpeed * deltaSeconds + windDx * cluster.windInfluence * deltaSeconds * 0.02;

        // Update cluster centre
        cluster.centre.set(
          Math.cos(cluster.angle) * cluster.radius,
          cluster.baseY + Math.sin(timeSeconds * 0.3 + cluster.id) * cluster.verticalDrift,
          Math.sin(cluster.angle) * cluster.radius,
        );
      }

      // Global breathing
      const globalBreath = 0.7 + Math.sin(timeSeconds * 0.4) * 0.15 + Math.sin(timeSeconds * 0.17) * 0.15;

      // Update each glyph
      for (const glyph of glyphs) {
        const cluster = clusters[glyph.clusterId]!;

        // ── Cluster phase opacity multiplier ──
        let clusterOpacity = 1;
        if (cluster.phase === 0) {
          // Forming: ease in
          const t = cluster.phaseTimer / cluster.formDuration;
          clusterOpacity = smoothstep(0, 1, t);
        } else if (cluster.phase === 2) {
          // Dissolving: ease out
          const dissolveStart = cluster.formDuration + cluster.stableDuration;
          const t = (cluster.phaseTimer - dissolveStart) / cluster.dissolveDuration;
          clusterOpacity = 1 - smoothstep(0, 1, t);
        }

        // ── Sectional formation boost ──
        const glyphSector = (glyph.layerIndex * 2 + (glyph.clusterId % 2)) % sectorCount;
        const sectorActive = glyphSector === activeSector || glyphSector === (activeSector + 1) % sectorCount;
        const sectorBoost = sectorActive ? 1.15 : 0.92;

        // ── Orbital position with wind influence ──
        glyph.angle += glyph.driftSpeed * deltaSeconds + windDx * 0.01 * deltaSeconds;
        const orbitX = Math.cos(glyph.angle) * glyph.radius;
        const orbitZ = Math.sin(glyph.angle) * glyph.radius;

        // ── Vertical wave ──
        const waveY = Math.sin(timeSeconds * glyph.waveSpeed + glyph.wavePhase + glyph.angle * 1.2) * glyph.waveAmplitude;

        // ── Wisp extension animation ──
        let wispMultiplier = 1;
        if (glyph.isWisp) {
          // Wisps extend and retract rhythmically
          glyph.wispTarget = 0.3 + Math.sin(timeSeconds * glyph.wispSpeed * 2 + glyph.wavePhase) * 0.5 + 0.2;
          glyph.wispExtension += (glyph.wispTarget - glyph.wispExtension) * deltaSeconds * glyph.wispSpeed * 3;
          wispMultiplier = glyph.wispExtension;
        }

        // ── Compose position ──
        const localX = glyph.localOffset.x * wispMultiplier;
        const localY = glyph.localOffset.y * wispMultiplier;
        const localZ = glyph.localOffset.z * wispMultiplier;

        // Wind pushes glyph positions
        const windPushX = windDx * 15 * glyph.layerIndex * 0.3;
        const windPushZ = windDz * 15 * glyph.layerIndex * 0.3;

        glyph.mesh.position.set(
          orbitX + localX + windPushX,
          glyph.baseY + waveY + localY,
          orbitZ + localZ + glyph.depthOffset + windPushZ,
        );

        // ── Face outward with slight tumble ──
        glyph.mesh.lookAt(
          glyph.mesh.position.x * 1.06,
          glyph.mesh.position.y + 12,
          glyph.mesh.position.z * 1.06,
        );
        glyph.mesh.rotation.z += glyph.tumbleSpeed * deltaSeconds;

        // ── Opacity computation ──
        const revealT = THREE.MathUtils.clamp(
          (timeSeconds - glyph.revealDelay) / glyph.revealDuration,
          0,
          1,
        );
        const lifeT = (timeSeconds - glyph.lifeStart) / glyph.lifeDuration;
        const lifeWave = 0.5 + Math.sin(lifeT * Math.PI * 2) * 0.5;
        const breath = globalBreath * (0.85 + Math.sin(timeSeconds * (0.7 + glyph.layerIndex * 0.1) + glyph.angle * 2) * 0.15);

        let opacity = Math.pow(revealT, 1.6) * lifeWave * breath * clusterOpacity * sectorBoost;

        // Wisps are more transparent
        if (glyph.isWisp) {
          opacity *= 0.5 * glyph.wispExtension;
        }

        // Layer-based distance fade (higher layers more translucent)
        opacity *= 1.0 - glyph.layerIndex * 0.07;

        // Clamp
        opacity = Math.min(opacity * 0.6, 0.75);

        const material = glyph.mesh.material;
        if (material instanceof THREE.MeshBasicMaterial) {
          material.opacity = Math.max(0, opacity);
        }

        // ── Scale animation ──
        const scaleWave = glyph.baseScale * (0.85 + Math.sin(timeSeconds * glyph.waveSpeed * 0.5 + glyph.angle) * 0.18);
        const clusterScaleInfluence = cluster.phase === 0
          ? smoothstep(0, 1, cluster.phaseTimer / cluster.formDuration)
          : cluster.phase === 2
            ? 1 - smoothstep(0, 1, (cluster.phaseTimer - cluster.formDuration - cluster.stableDuration) / cluster.dissolveDuration) * 0.4
            : 1;
        glyph.mesh.scale.setScalar(scaleWave * clusterScaleInfluence);

        // ── Mutation ──
        if (timeSeconds >= glyph.nextMutationAt) {
          mutateGlyph(glyph, timeSeconds);
        }
      }

      // ── Global layer drift ──
      // Each layer group rotates at slightly different rates for parallax
      const children = group.children;
      for (let i = 0; i < children.length; i++) {
        const layerGroup = children[i];
        if (!layerGroup) continue;
        const rate = 0.004 + i * 0.0015 + Math.sin(timeSeconds * 0.06 + i) * 0.001;
        layerGroup.rotation.y += deltaSeconds * rate;
        // Subtle vertical float per layer
        layerGroup.position.y = Math.sin(timeSeconds * 0.15 + i * 1.3) * 8;
      }
    },
  };
};

/* ── Utility ─────────────────────────────────────────────────── */

const smoothstep = (edge0: number, edge1: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};
