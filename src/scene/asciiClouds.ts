import * as THREE from "three";
import { FontLoader } from "three/examples/jsm/loaders/FontLoader.js";

/* ═══════════════════════════════════════════════════════════════
   ASCII Cloud Layer – Sigil Formation System

   Glyphs coalesce into structured sigil shapes (diamond, mandala,
   cross, vesica) that form, breathe, mutate, and dissolve over
   the terrain. Multiple formation animation methods give variety.
   Frustum + distance culling keep performance tight.
   ═══════════════════════════════════════════════════════════════ */

/** Runtime-tunable parameters (mutate these directly; update loop reads every frame) */
export type AsciiCloudRuntimeParams = {
  // ── Size & Scale ──
  sigilScaleMul: number;      // multiplier on sigil formation size
  glyphScaleMul: number;      // multiplier on individual glyph size
  altitudeOffset: number;     // added to each sigil's base altitude
  layerSpreadMul: number;     // multiplier on vertical spacing between layers
  // ── Motion ──
  driftSpeedMul: number;      // multiplier on lateral drift velocity
  windStrengthMul: number;    // multiplier on wind force
  waveSpeedMul: number;       // multiplier on vertical oscillation speed
  waveAmplitudeMul: number;   // multiplier on vertical oscillation range
  tumbleSpeedMul: number;     // multiplier on glyph rotation speed
  bobAmplitude: number;       // vertical bob amplitude (world units)
  // ── Formation ──
  formSpeedMul: number;       // multiplier on form/dissolve rate (higher = faster)
  stableDurationMul: number;  // multiplier on how long sigils hold formation
  dormantDurationMul: number; // multiplier on dormant gap between cycles
  scatterRadiusMul: number;   // multiplier on scatter distance for converge/spiral
  staggerStrength: number;    // 0–2: how much centre-first stagger affects formation
  // ── Appearance ──
  opacityMul: number;         // overall opacity multiplier
  breathDepth: number;        // 0–1: how strong the breathing animation is
  mutationRateMul: number;    // multiplier on character mutation frequency
  cullDistance: number;        // max render distance from camera
};

export type AsciiCloudField = {
  group: THREE.Group;
  update: (t: number, dt: number, camera: THREE.Camera) => void;
  /** Live-tunable params — mutate freely, read every frame */
  params: AsciiCloudRuntimeParams;
};

/* ── Sigil template slot ─────────────────────────────────────── */

type SigilSlot = {
  /** Normalised X in [-1, 1] */
  x: number;
  /** Normalised Y in [-1, 1] */
  y: number;
  /** Relative scale (0.3–1.4) */
  scale: number;
};

/* ── Formation animation method ──────────────────────────────── */

type FormationMethod = "converge" | "cascade" | "spiral";

/* ── Per-sigil state ─────────────────────────────────────────── */

type Sigil = {
  id: number;
  group: THREE.Group;
  /** World-space anchor position */
  worldX: number;
  worldZ: number;
  altitude: number;
  /** How big the sigil is in world units */
  sigilScale: number;
  /** Drift velocity (world units / sec) */
  driftVX: number;
  driftVZ: number;
  /** Accumulated drift from wind + own velocity */
  driftAccumX: number;
  driftAccumZ: number;
  /** 0 = forming, 1 = stable, 2 = dissolving, 3 = dormant */
  phase: number;
  phaseTimer: number;
  formDuration: number;
  stableDuration: number;
  dissolveDuration: number;
  dormantDuration: number;
  formationMethod: FormationMethod;
  layerIndex: number;
  windInfluence: number;
  /** Bounding radius for frustum culling */
  cullRadius: number;
  /** Cached: is this sigil in the view frustum? */
  inFrustum: boolean;
};

/* ── Per-glyph state ─────────────────────────────────────────── */

type AsciiGlyph = {
  mesh: THREE.Mesh;
  sigilId: number;
  layerIndex: number;
  /** Target position in sigil-local space (from template) */
  homeX: number;
  homeY: number;
  homeScale: number;
  /** Scattered position offset (where the glyph drifts from/to) */
  scatterX: number;
  scatterY: number;
  /** 0–1 stagger: center glyphs form first (0), edge glyphs last (1) */
  stagger: number;
  /** Animation */
  wavePhase: number;
  waveSpeed: number;
  waveAmp: number;
  tumbleSpeed: number;
  baseRotZ: number;
  /** Mutation timing */
  nextMutationAt: number;
  mutationCadence: number;
  lifeStart: number;
  lifeDuration: number;
  /** Composite base scale */
  baseScale: number;
};

/* ── Wind ────────────────────────────────────────────────────── */

type WindState = {
  direction: number;
  strength: number;
  targetDirection: number;
  targetStrength: number;
  nextShiftAt: number;
};

/* ── Options ─────────────────────────────────────────────────── */

type AsciiCloudOptions = {
  seed?: number;
  layerCount?: number;
  sigilsPerLayer?: number;
  glyphsPerSigil?: number;
  terrainWidth?: number;
  terrainDepth?: number;
  baseAltitude?: number;
  verticalSpacing?: number;
  sigilScaleMin?: number;
  sigilScaleMax?: number;
  glyphSizeMin?: number;
  glyphSizeMax?: number;
  extrudeDepth?: number;
  palette?: number[];
  characters?: string;
  /** Max distance from camera before a sigil is culled */
  cullDistance?: number;
};

/* ── Constants ───────────────────────────────────────────────── */

const ALL_GLYPHS = "@#$%&*+=-:;<>[]{}()!?/\\|^~";
const FONT_URL = "/helvetiker_regular.typeface.json";
const FORMATION_METHODS: FormationMethod[] = ["converge", "cascade", "spiral"];

/* ── PRNG ────────────────────────────────────────────────────── */

const createSeededRandom = (seed: number): (() => number) => {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0x100000000; };
};
const pick = <T>(a: T[], r: () => number): T => a[Math.floor(r() * a.length) % a.length] as T;
const gaussR = (r: () => number, m: number, s: number) => {
  const u1 = Math.max(1e-10, r()), u2 = r();
  return m + Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2) * s;
};

/* ── Easing helpers ──────────────────────────────────────────── */

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const easeOutBack = (t: number) => {
  const c = 1.7;
  return 1 + (t - 1) ** 3 + c * (t - 1) ** 2;
};

/* ═══════════════════════════════════════════════════════════════
   Sigil Template Generators
   Each returns exactly `count` slots normalised to [-1, 1].
   ═══════════════════════════════════════════════════════════════ */

const generateDiamondSlots = (random: () => number, count: number): SigilSlot[] => {
  const slots: SigilSlot[] = [];
  // Hero centre glyph
  slots.push({ x: 0, y: 0, scale: 1.3 });
  let attempts = 0;
  while (slots.length < count && attempts < count * 20) {
    attempts++;
    const x = (random() - 0.5) * 2;
    const y = (random() - 0.5) * 2;
    const diamond = Math.abs(x) + Math.abs(y);
    if (diamond > 1.0) continue;
    // Denser toward centre
    const dist = Math.sqrt(x * x + y * y);
    if (random() > (1 - dist * 0.4)) continue;
    // Slight grid snapping for structured feel
    const snap = 0.12;
    const sx = Math.round(x / snap) * snap + (random() - 0.5) * snap * 0.4;
    const sy = Math.round(y / snap) * snap + (random() - 0.5) * snap * 0.4;
    const scale = 0.4 + (1 - dist) * 0.7 + random() * 0.2;
    slots.push({ x: sx, y: sy, scale });
  }
  return slots.slice(0, count);
};

const generateCircleSlots = (random: () => number, count: number): SigilSlot[] => {
  const slots: SigilSlot[] = [];
  slots.push({ x: 0, y: 0, scale: 1.2 });
  // Concentric rings
  const rings = 4;
  const perRing = Math.floor((count - 1) / rings);
  for (let r = 0; r < rings; r++) {
    const radius = (r + 1) / rings * 0.9;
    const n = Math.min(perRing + (r === rings - 1 ? (count - 1 - perRing * rings) : 0), count - slots.length);
    for (let i = 0; i < n; i++) {
      const angle = (i / n) * Math.PI * 2 + random() * 0.25;
      const jR = radius + (random() - 0.5) * 0.08;
      slots.push({
        x: Math.cos(angle) * jR,
        y: Math.sin(angle) * jR,
        scale: 0.4 + (1 - radius) * 0.6 + random() * 0.15,
      });
    }
  }
  return slots.slice(0, count);
};

const generateCrossSlots = (random: () => number, count: number): SigilSlot[] => {
  const slots: SigilSlot[] = [];
  slots.push({ x: 0, y: 0, scale: 1.3 });
  const armW = 0.18;
  let attempts = 0;
  while (slots.length < count && attempts < count * 20) {
    attempts++;
    const x = (random() - 0.5) * 2;
    const y = (random() - 0.5) * 2;
    const inVert = Math.abs(x) < armW && Math.abs(y) < 0.95;
    const inHoriz = Math.abs(y) < armW && Math.abs(x) < 0.95;
    if (!inVert && !inHoriz) continue;
    const dist = Math.sqrt(x * x + y * y);
    const scale = 0.45 + (1 - dist * 0.6) * 0.5 + random() * 0.15;
    slots.push({ x: x + (random() - 0.5) * 0.04, y: y + (random() - 0.5) * 0.04, scale });
  }
  return slots.slice(0, count);
};

const generateVesicaSlots = (random: () => number, count: number): SigilSlot[] => {
  // Intersection of two circles offset on X
  const slots: SigilSlot[] = [];
  slots.push({ x: 0, y: 0, scale: 1.25 });
  const offset = 0.55;
  let attempts = 0;
  while (slots.length < count && attempts < count * 20) {
    attempts++;
    const x = (random() - 0.5) * 1.4;
    const y = (random() - 0.5) * 2;
    // Inside both circles
    const d1 = Math.sqrt((x - offset) ** 2 + y * y);
    const d2 = Math.sqrt((x + offset) ** 2 + y * y);
    if (d1 > 1.0 || d2 > 1.0) continue;
    const dist = Math.sqrt(x * x + y * y);
    const scale = 0.35 + (1 - dist * 0.6) * 0.65 + random() * 0.15;
    slots.push({ x, y, scale });
  }
  return slots.slice(0, count);
};

const SIGIL_GENERATORS = [generateDiamondSlots, generateCircleSlots, generateCrossSlots, generateVesicaSlots];

/* ═══════════════════════════════════════════════════════════════
   Main Factory
   ═══════════════════════════════════════════════════════════════ */

export const createAsciiCloudField = async (
  options: AsciiCloudOptions = {},
): Promise<AsciiCloudField> => {
  const {
    seed = 90210,
    layerCount = 4,
    sigilsPerLayer = 4,
    glyphsPerSigil = 35,
    terrainWidth = 7000,
    terrainDepth = 7000,
    baseAltitude = 350,
    verticalSpacing = 120,
    sigilScaleMin = 80,
    sigilScaleMax = 180,
    glyphSizeMin = 10,
    glyphSizeMax = 32,
    extrudeDepth = 2.5,
    palette = [0xe4efff, 0xc4d8ff, 0x9ab8ff, 0x7da4ff, 0x6690ff],
    characters = ALL_GLYPHS,
    cullDistance = 5000,
  } = options;

  const random = createSeededRandom(seed);
  const font = await new FontLoader().loadAsync(FONT_URL);
  const rootGroup = new THREE.Group();
  rootGroup.name = "ascii-cloud-field";

  const halfW = terrainWidth * 0.5;
  const halfD = terrainDepth * 0.5;
  const chars = Array.from(new Set(characters));

  /* ── Geometry caches ────────────────────────────────────────── */

  const shapeCache = new Map<string, THREE.ShapeGeometry>();
  const extrudeCache = new Map<string, THREE.ExtrudeGeometry>();

  const centre = (geo: THREE.BufferGeometry) => {
    geo.computeBoundingBox();
    const b = geo.boundingBox!;
    geo.translate(-(b.min.x + b.max.x) * 0.5, -(b.min.y + b.max.y) * 0.5, -(b.min.z + b.max.z) * 0.5);
  };

  const getFlat = (ch: string, sz: number): THREE.ShapeGeometry => {
    const k = `s-${ch}-${sz.toFixed(0)}`;
    let g = shapeCache.get(k);
    if (!g) { g = new THREE.ShapeGeometry(font.generateShapes(ch, sz)); centre(g); shapeCache.set(k, g); }
    return g;
  };

  const getExtrude = (ch: string, sz: number, d: number): THREE.ExtrudeGeometry => {
    const k = `e-${ch}-${sz.toFixed(0)}-${d.toFixed(1)}`;
    let g = extrudeCache.get(k);
    if (!g) {
      g = new THREE.ExtrudeGeometry(font.generateShapes(ch, sz), {
        depth: d, bevelEnabled: true, bevelThickness: d * 0.15, bevelSize: d * 0.1, bevelSegments: 1,
      });
      centre(g);
      extrudeCache.set(k, g);
    }
    return g;
  };

  const randomGeo = (sz: number) => {
    const ch = pick(chars, random);
    return random() > 0.4 ? getExtrude(ch, sz, extrudeDepth * (0.4 + random() * 0.6)) : getFlat(ch, sz);
  };

  /* ── Wind ───────────────────────────────────────────────────── */

  const wind: WindState = {
    direction: random() * Math.PI * 2,
    strength: 8 + random() * 10,
    targetDirection: random() * Math.PI * 2,
    targetStrength: 6 + random() * 14,
    nextShiftAt: 10 + random() * 15,
  };

  /* ── Frustum culling objects (pre-allocated) ────────────────── */

  const _frustum = new THREE.Frustum();
  const _mat4 = new THREE.Matrix4();
  const _sphere = new THREE.Sphere();
  const _vec3 = new THREE.Vector3();

  /* ── Build sigils ───────────────────────────────────────────── */

  const sigils: Sigil[] = [];
  const sigilGlyphs: AsciiGlyph[][] = []; // glyphs indexed by sigil ID

  for (let li = 0; li < layerCount; li++) {
    const layerY = baseAltitude + li * verticalSpacing;
    const tint = palette[li % palette.length] ?? 0xd5e6ff;

    for (let si = 0; si < sigilsPerLayer; si++) {
      const sigilId = sigils.length;
      const sigilGroup = new THREE.Group();
      sigilGroup.name = `sigil-${sigilId}`;

      // Scatter across terrain
      const wx = (random() - 0.5) * terrainWidth * 0.8;
      const wz = (random() - 0.5) * terrainDepth * 0.8;
      const alt = layerY + (random() - 0.5) * 50;
      const scale = sigilScaleMin + random() * (sigilScaleMax - sigilScaleMin);

      // Orient sigil: mostly vertical with random Y rotation and slight lean
      sigilGroup.rotation.set(
        -0.3 - random() * 0.4,           // lean top backward 17-40°
        random() * Math.PI * 2,           // face random direction
        (random() - 0.5) * 0.15,         // slight roll
      );
      sigilGroup.position.set(wx, alt, wz);

      const driftAngle = random() * Math.PI * 2;
      const driftMag = 1.5 + random() * 4;

      const sigil: Sigil = {
        id: sigilId,
        group: sigilGroup,
        worldX: wx,
        worldZ: wz,
        altitude: alt,
        sigilScale: scale,
        driftVX: Math.cos(driftAngle) * driftMag,
        driftVZ: Math.sin(driftAngle) * driftMag,
        driftAccumX: 0,
        driftAccumZ: 0,
        phase: 0,
        phaseTimer: random() * 3, // stagger starts
        formDuration: 4 + random() * 6,
        stableDuration: 18 + random() * 30,
        dissolveDuration: 5 + random() * 8,
        dormantDuration: 6 + random() * 12,
        formationMethod: pick(FORMATION_METHODS, random),
        layerIndex: li,
        windInfluence: 0.3 + random() * 0.6,
        cullRadius: scale * 1.6,
        inFrustum: false,
      };
      sigils.push(sigil);

      // Generate template and create glyphs
      const generator = pick(SIGIL_GENERATORS, random);
      const slots = generator(random, glyphsPerSigil);
      const glyphsForSigil: AsciiGlyph[] = [];

      for (let gi = 0; gi < slots.length; gi++) {
        const slot = slots[gi]!;
        const sz = (glyphSizeMin + (glyphSizeMax - glyphSizeMin) * slot.scale) * (1 + li * 0.08);
        const geo = randomGeo(sz);
        const mat = new THREE.MeshBasicMaterial({
          color: tint, transparent: true, depthWrite: false, opacity: 0, side: THREE.DoubleSide,
        });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.renderOrder = 3;
        mesh.frustumCulled = false; // we do manual sigil-level culling

        const dist = Math.sqrt(slot.x ** 2 + slot.y ** 2);
        const rotZ = random() * Math.PI * 2;
        mesh.rotation.set(random() * 0.2, random() * 0.2, rotZ);

        const glyph: AsciiGlyph = {
          mesh,
          sigilId,
          layerIndex: li,
          homeX: slot.x * scale,
          homeY: slot.y * scale,
          homeScale: slot.scale,
          scatterX: (random() - 0.5) * scale * 3.5,
          scatterY: (random() - 0.5) * scale * 3.5,
          stagger: dist, // normalised 0-1 distance from centre → centre forms first
          wavePhase: random() * Math.PI * 2,
          waveSpeed: 0.3 + random() * 0.8,
          waveAmp: 2 + random() * 8,
          tumbleSpeed: (random() - 0.5) * 0.08,
          baseRotZ: rotZ,
          nextMutationAt: 3 + random() * 8,
          mutationCadence: 4 + random() * 8,
          lifeStart: random() * 10,
          lifeDuration: 8 + random() * 14,
          baseScale: (0.5 + slot.scale * 0.6) * (1 + li * 0.06),
        };

        glyphsForSigil.push(glyph);
        sigilGroup.add(mesh);
      }

      sigilGlyphs.push(glyphsForSigil);
      rootGroup.add(sigilGroup);
    }
  }

  /* ── Reformation: give a sigil a new template ───────────────── */

  const reformSigil = (sigil: Sigil) => {
    const glyphs = sigilGlyphs[sigil.id]!;
    const generator = pick(SIGIL_GENERATORS, random);
    const slots = generator(random, glyphs.length);
    sigil.formationMethod = pick(FORMATION_METHODS, random);

    for (let i = 0; i < glyphs.length; i++) {
      const g = glyphs[i]!;
      const s = slots[i] ?? slots[slots.length - 1]!;
      g.homeX = s.x * sigil.sigilScale;
      g.homeY = s.y * sigil.sigilScale;
      g.homeScale = s.scale;
      g.scatterX = (random() - 0.5) * sigil.sigilScale * 3.5;
      g.scatterY = (random() - 0.5) * sigil.sigilScale * 3.5;
      g.stagger = Math.sqrt(s.x ** 2 + s.y ** 2);
      g.baseScale = (0.5 + s.scale * 0.6) * (1 + g.layerIndex * 0.06);

      // Mutate character on reform
      const sz = glyphSizeMin + (glyphSizeMax - glyphSizeMin) * s.scale;
      g.mesh.geometry = randomGeo(sz);
    }
  };

  /* ── Mutation helper ────────────────────────────────────────── */

  const mutateGlyph = (g: AsciiGlyph, t: number) => {
    const sz = glyphSizeMin + random() * (glyphSizeMax - glyphSizeMin);
    g.mesh.geometry = randomGeo(sz);
    g.lifeStart = t;
    g.lifeDuration = 6 + random() * 12;
    g.nextMutationAt = t + g.mutationCadence * (0.6 + random() * 0.8);
    g.mesh.rotation.z += (random() - 0.5) * 0.4;
  };

  /* ── Wrap coordinate for terrain recycling ──────────────────── */

  const wrap = (v: number, half: number) => {
    if (v > half) return v - half * 2;
    if (v < -half) return v + half * 2;
    return v;
  };

  /* ── Runtime params (live-tunable every frame) ──────────────── */

  const params: AsciiCloudRuntimeParams = {
    sigilScaleMul: 1,
    glyphScaleMul: 1,
    altitudeOffset: 0,
    layerSpreadMul: 1,
    driftSpeedMul: 1,
    windStrengthMul: 1,
    waveSpeedMul: 1,
    waveAmplitudeMul: 1,
    tumbleSpeedMul: 1,
    bobAmplitude: 6,
    formSpeedMul: 1,
    stableDurationMul: 1,
    dormantDurationMul: 1,
    scatterRadiusMul: 1,
    staggerStrength: 1,
    opacityMul: 1,
    breathDepth: 0.55,
    mutationRateMul: 1,
    cullDistance,
  };

  /* ═══ Update Loop ═══════════════════════════════════════════ */

  return {
    group: rootGroup,
    params,
    update: (t: number, dt: number, camera: THREE.Camera) => {
      const p = params; // alias for brevity

      // ── Wind ──
      if (t >= wind.nextShiftAt) {
        wind.targetDirection += (random() - 0.5) * Math.PI * 0.7;
        wind.targetStrength = 5 + random() * 16;
        wind.nextShiftAt = t + 12 + random() * 25;
      }
      wind.direction += (wind.targetDirection - wind.direction) * dt * 0.12;
      wind.strength += (wind.targetStrength - wind.strength) * dt * 0.15;
      const windDX = Math.cos(wind.direction) * wind.strength * p.windStrengthMul;
      const windDZ = Math.sin(wind.direction) * wind.strength * p.windStrengthMul;

      // ── Build frustum once per frame ──
      _mat4.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      _frustum.setFromProjectionMatrix(_mat4);
      const camPos = camera.position;

      // ── Global breath ──
      const breathRange = p.breathDepth * 0.28;
      const breath = (1 - p.breathDepth * 0.28) + Math.sin(t * 0.38) * breathRange * 0.5 + Math.sin(t * 0.17) * breathRange * 0.5;

      // ── Update each sigil ──
      for (const sigil of sigils) {
        // Drift (scaled by runtime param)
        const driftMul = p.driftSpeedMul;
        sigil.driftAccumX += (sigil.driftVX * driftMul + windDX * sigil.windInfluence) * dt;
        sigil.driftAccumZ += (sigil.driftVZ * driftMul + windDZ * sigil.windInfluence) * dt;

        // Wrap at terrain edges
        let curX = sigil.worldX + sigil.driftAccumX;
        let curZ = sigil.worldZ + sigil.driftAccumZ;
        if (Math.abs(curX) > halfW * 1.15) {
          sigil.driftAccumX = wrap(curX, halfW * 1.15) - sigil.worldX;
          curX = sigil.worldX + sigil.driftAccumX;
        }
        if (Math.abs(curZ) > halfD * 1.15) {
          sigil.driftAccumZ = wrap(curZ, halfD * 1.15) - sigil.worldZ;
          curZ = sigil.worldZ + sigil.driftAccumZ;
        }

        // Vertical position: base altitude + runtime offset + layer spread + bob
        const layerAltitude = sigil.altitude + p.altitudeOffset + (sigil.layerIndex * verticalSpacing * (p.layerSpreadMul - 1));
        const bobY = Math.sin(t * 0.25 + sigil.id * 1.7) * p.bobAmplitude;
        sigil.group.position.set(curX, layerAltitude + bobY, curZ);

        // ── Frustum + distance culling ──
        _vec3.set(curX, layerAltitude + bobY, curZ);
        const dist = _vec3.distanceTo(camPos);
        const effectiveCullRadius = sigil.cullRadius * p.sigilScaleMul;
        _sphere.set(_vec3, effectiveCullRadius);
        sigil.inFrustum = dist < p.cullDistance && _frustum.intersectsSphere(_sphere);
        sigil.group.visible = sigil.inFrustum;
        if (!sigil.inFrustum) continue;

        // ── Phase lifecycle (form speed affects form/dissolve, other multipliers for stable/dormant) ──
        const effectiveFormDur = sigil.formDuration / p.formSpeedMul;
        const effectiveDissolveDur = sigil.dissolveDuration / p.formSpeedMul;
        const effectiveStableDur = sigil.stableDuration * p.stableDurationMul;
        const effectiveDormantDur = sigil.dormantDuration * p.dormantDurationMul;

        sigil.phaseTimer += dt;
        const totalCycle = effectiveFormDur + effectiveStableDur + effectiveDissolveDur + effectiveDormantDur;
        if (sigil.phaseTimer >= totalCycle) {
          sigil.phaseTimer = 0;
          sigil.phase = 0;
          reformSigil(sigil);
        } else if (sigil.phaseTimer < effectiveFormDur) {
          sigil.phase = 0;
        } else if (sigil.phaseTimer < effectiveFormDur + effectiveStableDur) {
          sigil.phase = 1;
        } else if (sigil.phaseTimer < effectiveFormDur + effectiveStableDur + effectiveDissolveDur) {
          sigil.phase = 2;
        } else {
          sigil.phase = 3;
        }

        // Dormant → hide all children cheaply
        if (sigil.phase === 3) {
          sigil.group.visible = false;
          continue;
        }

        // Compute formationT using effective durations
        let formT: number;
        if (sigil.phase === 0) {
          formT = Math.min(1, sigil.phaseTimer / effectiveFormDur);
        } else if (sigil.phase === 1) {
          formT = 1;
        } else {
          const dissolveElapsed = sigil.phaseTimer - effectiveFormDur - effectiveStableDur;
          formT = Math.max(0, 1 - dissolveElapsed / effectiveDissolveDur);
        }

        const method = sigil.formationMethod;
        const glyphs = sigilGlyphs[sigil.id]!;
        const scaleMul = p.sigilScaleMul;
        const scatterMul = p.scatterRadiusMul;
        const staggerStr = p.staggerStrength;

        // ── Update glyphs within this sigil ──
        for (const g of glyphs) {
          // Position from formation method (with runtime scatter/stagger scaling)
          const staggeredT = Math.max(0, Math.min(1,
            (formT * 1.4 - g.stagger * 0.5 * staggerStr) / (1.4 - g.stagger * 0.5 * staggerStr),
          ));

          let px: number, py: number;
          switch (method) {
            case "converge": {
              const e = easeOutCubic(staggeredT);
              px = g.homeX * scaleMul + g.scatterX * scatterMul * (1 - e);
              py = g.homeY * scaleMul + g.scatterY * scatterMul * (1 - e);
              break;
            }
            case "cascade": {
              px = g.homeX * scaleMul;
              py = g.homeY * scaleMul;
              break;
            }
            case "spiral": {
              const e = easeOutCubic(staggeredT);
              const angle = (1 - e) * Math.PI * 2.5;
              const drift = 1 - e;
              const cos = Math.cos(angle), sin = Math.sin(angle);
              px = g.homeX * scaleMul + (g.scatterX * cos - g.scatterY * sin) * scatterMul * drift;
              py = g.homeY * scaleMul + (g.scatterX * sin + g.scatterY * cos) * scatterMul * drift;
              break;
            }
          }

          // Per-glyph wave
          const wave = Math.sin(t * g.waveSpeed * p.waveSpeedMul + g.wavePhase) * g.waveAmp * p.waveAmplitudeMul;
          g.mesh.position.set(px, py + wave, 0);

          // Gentle tumble
          g.mesh.rotation.z = g.baseRotZ + g.tumbleSpeed * p.tumbleSpeedMul * t;

          // ── Opacity (formation method + life + breath, scaled by runtime param) ──
          let methodOp: number;
          switch (method) {
            case "converge": methodOp = smoothstep(0, 0.4, staggeredT); break;
            case "cascade": methodOp = staggeredT > 0.02 ? smoothstep(0, 0.3, staggeredT) : 0; break;
            case "spiral": methodOp = smoothstep(0, 0.5, staggeredT); break;
          }
          const lifeT = (t - g.lifeStart) / g.lifeDuration;
          const lifeWave = 0.55 + Math.sin(lifeT * Math.PI * 2) * 0.45;
          let opacity = methodOp * lifeWave * breath;
          opacity *= 1.0 - g.layerIndex * 0.06;
          opacity = Math.min(opacity * 0.65 * p.opacityMul, 0.85);

          const mat = g.mesh.material;
          if (mat instanceof THREE.MeshBasicMaterial) {
            mat.opacity = Math.max(0, opacity);
          }

          // ── Scale ──
          let methodSc: number;
          switch (method) {
            case "converge": methodSc = 0.3 + easeOutCubic(staggeredT) * 0.7; break;
            case "cascade": methodSc = staggeredT > 0.02 ? easeOutBack(Math.min(1, staggeredT)) : 0; break;
            case "spiral": methodSc = 0.2 + easeOutCubic(staggeredT) * 0.8; break;
          }
          const scaleWave = 0.9 + Math.sin(t * g.waveSpeed * p.waveSpeedMul * 0.4 + g.wavePhase) * 0.1;
          g.mesh.scale.setScalar(g.baseScale * p.glyphScaleMul * methodSc * scaleWave);

          // ── Mutation (only during stable phase, rate scaled by param) ──
          if (sigil.phase === 1 && t >= g.nextMutationAt) {
            mutateGlyph(g, t);
            // Scale next mutation time by mutation rate
            g.nextMutationAt = t + g.mutationCadence * (0.6 + random() * 0.8) / Math.max(0.1, p.mutationRateMul);
          }
        }
      }
    },
  };
};
