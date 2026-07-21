import * as THREE from "three";
import { createRng } from "../scene/random.ts";
import { fbm2D } from "../scene/noise.ts";
import { KAKURIYO, toon } from "./palette.ts";
import { WORLD_SIZE } from "./terrain.ts";
import { SUN_DIRECTION } from "./sky.ts";

/**
 * The mountains of the hidden world: a sacred snow-capped peak presiding
 * over the valley, ringed by receding layers of ridgeline that dissolve
 * into the haze — the classic layered depth of a woodblock print.
 */

export const SACRED_PEAK = new THREE.Vector3(-2100, 0, -2700);

/**
 * A ledge on the sacred peak's valley-facing flank, where a small hokora
 * shrine keeps watch. Stories climb to it; the world simply has it.
 */
export const PEAK_LEDGE = new THREE.Vector3(-1494, 905, -1922);

/* ── The mountain shader ─────────────────────────────────────────
   Per-PIXEL painting (per-vertex color at this mesh density can only
   make washy gradients). The standard stylized-terrain recipe: snow
   coverage = height + surface upness + noise, cut with a hard hem;
   rock detail from vertically-stretched striation noise and broad
   facet-panel value breakup; lighting cel-banded to match the world. */

const peakVertexShader = /* glsl */ `
  #include <fog_pars_vertex>
  varying vec3 vLocalPos;
  varying vec3 vWorldNormal;

  void main() {
    vLocalPos = position;
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vec4 mvPosition = viewMatrix * worldPosition;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const peakFragmentShader = /* glsl */ `
  #include <fog_pars_fragment>
  uniform vec3 uRockLow;
  uniform vec3 uRockHigh;
  uniform vec3 uSnowColor;
  uniform vec3 uSnowShade;
  uniform float uSnowLine;
  uniform float uHeight;
  uniform float uSeed;
  uniform vec3 uSunDir;
  varying vec3 vLocalPos;
  varying vec3 vWorldNormal;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }
  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 4; i += 1) {
      v += a * noise(p);
      p = p * 2.13 + vec2(7.7);
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec3 N = normalize(vWorldNormal);
    float h01 = clamp(vLocalPos.y / uHeight + 0.5, 0.0, 1.0);

    /* Rock: altitude gradient, broken by vertical crag striations
       (noise stretched along the fall line) and broad facet panels */
    vec3 rock = mix(uRockLow, uRockHigh, smoothstep(0.05, 0.85, h01));
    float striation = fbm(vec2(
      vLocalPos.x * 0.012 + vLocalPos.z * 0.012 + uSeed,
      vLocalPos.y * 0.003
    ));
    rock *= 0.82 + striation * 0.36;
    float panel = fbm(vLocalPos.xz * 0.0014 + uSeed);
    rock *= 0.88 + panel * 0.24;

    /* Snow: height + upness + noise, hard painterly hem, with couloir
       tongues where the column-noise says a gully runs */
    float snow = 0.0;
    if (uSnowLine > 0.001) {
      float upness = clamp(N.y, 0.0, 1.0);
      float columns = fbm(vLocalPos.xz * 0.0042 + uSeed * 3.1);
      float breakup = fbm(vLocalPos.xz * 0.02 + vLocalPos.y * 0.004 + uSeed);
      float cover = (h01 - uSnowLine)
        + upness * 0.2
        + (columns - 0.5) * 0.42
        + (breakup - 0.5) * 0.14;
      snow = smoothstep(0.0, 0.05, cover);
    }
    vec3 snowCol = mix(uSnowShade, uSnowColor, 0.45 + 0.55 * clamp(N.y, 0.0, 1.0));
    vec3 albedo = mix(rock, snowCol, snow);

    /* Cel light: one hard band, matching the world's toon ramp, plus a
       warm kiss on the sun side */
    float ndl = dot(N, normalize(uSunDir));
    float band = 0.7 + 0.3 * smoothstep(0.16, 0.24, ndl);
    vec3 color = albedo * band;
    color += vec3(0.09, 0.05, 0.015) * smoothstep(0.3, 0.75, ndl) * (1.0 - snow * 0.55);

    gl_FragColor = vec4(color, 1.0);
    #include <fog_fragment>
  }
`;

const createPeakMaterial = (tone: string, snowLine: number, height: number, seed: number) => {
  const rockHigh = new THREE.Color(tone);
  const rockLow = rockHigh.clone().lerp(new THREE.Color("#2e3854"), 0.45);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uRockLow: { value: rockLow },
      uRockHigh: { value: rockHigh.clone().lerp(new THREE.Color("#dfe4ec"), 0.25) },
      uSnowColor: { value: new THREE.Color("#f6f5ef") },
      uSnowShade: { value: new THREE.Color("#b9c9dd") },
      uSnowLine: { value: snowLine },
      uHeight: { value: height },
      uSeed: { value: seed },
      uSunDir: { value: SUN_DIRECTION.clone() },
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
    },
    vertexShader: peakVertexShader,
    fragmentShader: peakFragmentShader,
    fog: true,
  });
  return material;
};

type PeakOptions = {
  /** Rock tone at the crest; the base always melts into the valley haze. */
  tone: string;
  /** 0–1: fraction of the height where snow begins (0 = no snow). */
  snowLine?: number;
  /** Overall ruggedness of the silhouette. */
  jag?: number;
  /** Mesh resolution: [radialSegments, heightSegments]. */
  detail?: [number, number];
  /** Deterministic character seed for this peak. */
  peakSeed?: number;
};

/**
 * A sculpted peak. The displacement is deterministic by position (the
 * cone's wrap-around seam gets identical offsets on both sides, so it
 * can never crack open) and structured: great buttress lobes divide the
 * flanks into ridges and gullies, fbm crags rough the surface, and the
 * paint follows the geology — gullies shade cool, ridges catch warm sun,
 * strata bands ring the rock, and snow gathers deepest in the couloirs
 * with a hash-dithered, patchy anime edge.
 */
const sculptedPeak = (
  rng: () => number,
  radius: number,
  height: number,
  { tone, snowLine = 0, jag = 0.16, detail = [18, 8], peakSeed = 1 }: PeakOptions
): THREE.Mesh => {
  const geometry = new THREE.ConeGeometry(radius, height, detail[0], detail[1]);
  const positions = geometry.getAttribute("position") as THREE.BufferAttribute;
  const v = new THREE.Vector3();

  // Per-peak character (fixed at build, stable across the seam)
  const lobes = 4 + Math.floor(rng() * 4); // buttress count
  const lobePhase = rng() * Math.PI * 2;
  const noiseSeed = 7000 + Math.floor(peakSeed * 997);

  /** Radial displacement factor at a vertex, in [-1, 1]-ish. */
  const reliefAt = (x: number, y: number, z: number): number => {
    const angle = Math.atan2(z, x);
    const h01 = THREE.MathUtils.clamp(y / height + 0.5, 0, 1);
    // Buttresses: strong mid-slope, dying toward apex and skirt
    const band = Math.sin(h01 * Math.PI);
    const buttress = Math.sin(angle * lobes + lobePhase) * 0.55 * band;
    // Crags: position-based fbm (seam-safe), ridged for sharpness
    const crag = (Math.abs(fbm2D(x * 0.004 + y * 0.0028, z * 0.004 - y * 0.0028, noiseSeed, 3) - 0.5) * 2 - 0.4)
      * 0.9 * band;
    return buttress + crag;
  };

  const reliefs: number[] = [];
  for (let i = 0; i < positions.count; i += 1) {
    v.fromBufferAttribute(positions, i);
    let relief = 0;
    if (Math.abs(v.y) < height * 0.495 && (v.x * v.x + v.z * v.z) > 1) {
      relief = reliefAt(v.x, v.y, v.z);
      const wobble = 1 + relief * jag;
      positions.setX(i, v.x * wobble);
      positions.setZ(i, v.z * wobble);
      // Slight vertical shear gives ridgelines a hand-drawn irregularity
      positions.setY(i, v.y + relief * height * 0.012);
    }
    reliefs.push(relief);
  }

  /* ── Paint ── */
  const haze = new THREE.Color(KAKURIYO.hazeColor);
  const rock = new THREE.Color(tone);
  const crest = rock.clone().lerp(new THREE.Color("#ffffff"), 0.26);
  const snow = new THREE.Color(KAKURIYO.snow);
  const gullyShadow = rock.clone().lerp(new THREE.Color("#39415c"), 0.55);
  const sunWarm = new THREE.Color("#ffdcb0");
  const colors = new Float32Array(positions.count * 3);
  const tint = new THREE.Color();
  const sunAzimuth = Math.atan2(SUN_DIRECTION.z, SUN_DIRECTION.x);

  const hashAt = (x: number, y: number, z: number) => {
    const s = Math.sin(Math.round(x * 10) * 12.9898 + Math.round(y * 10) * 78.233 + Math.round(z * 10) * 37.719) * 43758.5453;
    return s - Math.floor(s);
  };

  for (let i = 0; i < positions.count; i += 1) {
    v.fromBufferAttribute(positions, i);
    const h = THREE.MathUtils.clamp(v.y / height + 0.5, 0, 1);
    const relief = reliefs[i]!;
    const angle = Math.atan2(v.z, v.x);

    // Altitude read: valley haze → rock → luminous crest
    tint.copy(haze).lerp(rock, THREE.MathUtils.smoothstep(h, 0.02, 0.4));
    tint.lerp(crest, THREE.MathUtils.smoothstep(h, 0.55, 0.95) * 0.75);

    // Facet planes: broad around-the-axis tone variation so each face
    // of the mountain carries its own value, like painted rock planes.
    // (Keyed on direction, so it flows vertically — never in rings.)
    const facePaint = fbm2D(Math.cos(angle) * 2.1 + noiseSeed * 0.01, Math.sin(angle) * 2.1, noiseSeed + 5, 2);
    tint.offsetHSL(0, 0, (facePaint - 0.5) * 0.13);

    // Geology: gullies shade cool and deep, buttresses stand pale
    if (relief < 0) {
      tint.lerp(gullyShadow, Math.min(1, -relief * 1.2) * 0.55);
    } else {
      tint.lerp(crest, Math.min(1, relief) * 0.2);
    }

    // One warm cheek toward the low sun — ukiyo-e directional color
    const sunFace = Math.max(0, Math.cos(angle - sunAzimuth));
    tint.lerp(sunWarm, sunFace * 0.1 * THREE.MathUtils.smoothstep(h, 0.25, 0.8));

    // Snow, painted the way the reference paints it: broad fields on the
    // heights with a ragged dithered hem — and long white streaks that
    // run DOWN the gullies, reaching far below the snowline.
    if (snowLine > 0) {
      const dither = (hashAt(v.x, v.y, v.z) - 0.5) * 0.045;

      // The cap: everything above the line, hem torn by the dither
      const cap = THREE.MathUtils.smoothstep(h, snowLine + dither, snowLine + 0.05 + dither);

      // The streaks: gully depth lets snow tongue far down the fall line
      const gullyDepth = Math.max(0, -relief);
      const reach = gullyDepth * 0.45;
      const streak =
        THREE.MathUtils.smoothstep(h, snowLine - reach + dither, snowLine - reach + 0.06 + dither) *
        THREE.MathUtils.smoothstep(gullyDepth, 0.12, 0.42);

      const snowMask = Math.max(cap, streak);
      if (snowMask > 0) {
        // Snow keeps a whisper of blue in its own shadowed gullies
        const snowTint = relief < -0.25 ? snow.clone().lerp(new THREE.Color("#c2d2e4"), 0.35) : snow;
        tint.lerp(snowTint, snowMask);
      }
    }

    colors[i * 3] = tint.r;
    colors[i * 3 + 1] = tint.g;
    colors[i * 3 + 2] = tint.b;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();

  return new THREE.Mesh(geometry, getPeakMaterial());
};

export const createMountains = (): THREE.Group => {
  const group = new THREE.Group();
  const rng = createRng(0x5e7a);

  // The sacred peak, Fuji-like, with its cap of eternal snow
  const peak = sculptedPeak(rng, 1750, 2500, {
    tone: KAKURIYO.mountainNear,
    snowLine: 0.56,
    jag: 0.16,
    detail: [36, 18],
    peakSeed: 0.77,
  });
  peak.position.set(SACRED_PEAK.x, 1250 - 220, SACRED_PEAK.z);
  group.add(peak);

  // Rings of lesser ridges receding into the mist
  const rings: Array<{ radius: number; color: string; count: number; size: [number, number] }> = [
    { radius: WORLD_SIZE * 0.52, color: KAKURIYO.mountainNear, count: 9, size: [700, 1500] },
    { radius: WORLD_SIZE * 0.62, color: KAKURIYO.mountainMid, count: 11, size: [900, 1900] },
    { radius: WORLD_SIZE * 0.74, color: KAKURIYO.mountainFar, count: 12, size: [1100, 2300] },
  ];

  rings.forEach((ring, ringIndex) => {
    for (let i = 0; i < ring.count; i += 1) {
      const angle = (i / ring.count) * Math.PI * 2 + rng() * 0.5;
      const r = ring.radius * (0.92 + rng() * 0.18);
      const height = ring.size[0] + rng() * (ring.size[1] - ring.size[0]);
      const m = sculptedPeak(rng, height * (0.75 + rng() * 0.5), height, {
        tone: ring.color,
        jag: 0.13,
        // The tallest near-ring peaks keep real snowfields of their own
        snowLine: ringIndex === 0 && height > 1250 ? 0.66 : ringIndex === 1 && height > 1650 ? 0.78 : 0,
        detail: ringIndex === 0 ? [22, 10] : ringIndex === 1 ? [18, 8] : [14, 6],
        peakSeed: ringIndex * 10 + i + rng(),
      });
      m.position.set(Math.cos(angle) * r, height * 0.42 - 160, Math.sin(angle) * r);
      m.rotation.y = rng() * Math.PI;
      group.add(m);
    }
  });

  /* ── The hokora ledge: a resting place partway up the sacred peak ── */
  const stoneMat = toon("#a8a89e", { flatShading: true });
  const roofMat = toon("#46586e", { flatShading: true });

  const platform = new THREE.Mesh(new THREE.CylinderGeometry(78, 96, 26, 9), stoneMat);
  platform.position.set(PEAK_LEDGE.x, PEAK_LEDGE.y - 13, PEAK_LEDGE.z);
  group.add(platform);

  const hokora = new THREE.Group();
  const hBase = new THREE.Mesh(new THREE.BoxGeometry(26, 10, 22), stoneMat);
  hBase.position.y = 5;
  const hBody = new THREE.Mesh(new THREE.BoxGeometry(20, 22, 16), stoneMat);
  hBody.position.y = 21;
  const hHollow = new THREE.Mesh(new THREE.BoxGeometry(10, 12, 4), toon("#2e2c28"));
  hHollow.position.set(0, 21, 8.4);
  const hRoof = new THREE.Mesh(new THREE.ConeGeometry(22, 14, 4), roofMat);
  hRoof.rotation.y = Math.PI / 4;
  hRoof.position.y = 38;
  hokora.add(hBase, hBody, hHollow, hRoof);
  hokora.position.set(PEAK_LEDGE.x - 30, PEAK_LEDGE.y, PEAK_LEDGE.z - 30);
  hokora.lookAt(PEAK_LEDGE.x + 200, PEAK_LEDGE.y, PEAK_LEDGE.z + 260);
  group.add(hokora);

  return group;
};
