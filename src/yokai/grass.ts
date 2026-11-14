import * as THREE from "three";
import { createRng } from "../scene/random.ts";
import { POND_CENTER, WORLD_SIZE, heightAt, pondShoreRadiiAt } from "./terrain.ts";
import { forEachZone } from "./occupancy.ts";
import { GRASS_GUST_GLSL, GUST_GLSL, getWindNoiseTexture, windTime } from "./shaders.ts";
import { getToonGradient } from "./palette.ts";
import { SUN_DIRECTION } from "./sky.ts";

/**
 * The meadows: lush, clumped grass that follows the camera.
 *
 * Instead of tens of thousands of lone blades scattered once over the whole
 * valley, two fixed pools of tufts (a dense inner ring, a coarser outer ring)
 * wrap around the camera. Each tuft is three crossed cards painted with
 * dozens of blades, so a handful of triangles reads as a thick clump.
 * Everything about a tuft — where it sits in its cell, whether it grows,
 * its card (meadow, wild grass, susuki, wildflowers), size, turn and tint —
 * comes from a hash of its *world* cell and from low-frequency noise zones,
 * so the meadow is stable as the camera moves and naturally patchy:
 * flower drifts, silver-grass slopes, golden dry swathes, dense and thin
 * ground. Placement happens on the GPU from a terrain height texture (the
 * exact triangles of the terrain mesh) and a growth mask (meadow band,
 * slope, pond shore and every building's footprint).
 *
 * Wind: tufts arc downwind under the shared valley gust fronts, local gust
 * patches scroll through two noise layers, blades flutter individually, and
 * where a gust presses the grass flat its sheen brightens, so wind shows as
 * light rolling over the field. Tips glow when backlit by the low sun.
 * The tufts use the world's toon material, so they take shadows and are
 * lit like the ground beneath them.
 */

export type GrassField = {
  mesh: THREE.Object3D;
  dispose: () => void;
};

/* ── Card atlas: four painted tuft types, generated with RNG ─────────────── */
const TILE_W = 256, TILE_H = 512;

type Blade = { x: number; len: number; lean: number; curve: number; width: number; root: string; tip: string };

const paintBlade = (ctx: CanvasRenderingContext2D, ox: number, b: Blade) => {
  const x0 = ox + b.x, y0 = TILE_H;
  const tipX = x0 + b.lean * b.len, tipY = y0 - b.len * (1 - Math.abs(b.lean) * 0.25);
  const cx = x0 + b.lean * b.len * 0.25 + b.curve * b.len * 0.3, cy = y0 - b.len * 0.6;
  const left: [number, number][] = [], right: [number, number][] = [];
  const steps = 10;
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps, it = 1 - t;
    const px = it * it * x0 + 2 * it * t * cx + t * t * tipX;
    const py = it * it * y0 + 2 * it * t * cy + t * t * tipY;
    const tx = 2 * it * (cx - x0) + 2 * t * (tipX - cx), ty = 2 * it * (cy - y0) + 2 * t * (tipY - cy);
    const l = Math.hypot(tx, ty) || 1;
    const w = b.width * Math.pow(1 - t, 0.85) + 0.4;
    left.push([px - (ty / l) * w, py + (tx / l) * w]);
    right.push([px + (ty / l) * w, py - (tx / l) * w]);
  }
  const g = ctx.createLinearGradient(x0, y0, tipX, tipY);
  g.addColorStop(0, b.root);
  g.addColorStop(1, b.tip);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(left[0]![0], left[0]![1]);
  for (const [x, y] of left) ctx.lineTo(x, y);
  for (let i = right.length - 1; i >= 0; i -= 1) ctx.lineTo(right[i]![0], right[i]![1]);
  ctx.closePath();
  ctx.fill();
};

const greens = (rng: () => number) => {
  const roots = ["#21452a", "#26502e", "#2c5a33", "#1f4030"];
  const tips = ["#7fae5a", "#93bd62", "#a7c96e", "#6f9f55", "#b9c97a"];
  return { root: roots[Math.floor(rng() * roots.length)]!, tip: tips[Math.floor(rng() * tips.length)]! };
};

const paintAtlas = (): THREE.CanvasTexture => {
  const canvas = document.createElement("canvas");
  canvas.width = TILE_W * 4;
  canvas.height = TILE_H;
  const ctx = canvas.getContext("2d")!;
  const rng = createRng(0x6a55);
  const blades = (ox: number, count: number, len: [number, number], spread: number, width: [number, number], lean: number) => {
    const list: Blade[] = [];
    for (let i = 0; i < count; i += 1) {
      const x = TILE_W / 2 + (rng() - 0.5) * 2 * spread * Math.sqrt(rng());
      list.push({
        x, len: len[0] + rng() * (len[1] - len[0]),
        lean: (x - TILE_W / 2) / spread * lean * 0.6 + (rng() - 0.5) * lean,
        curve: (rng() - 0.5) * 0.9, width: width[0] + rng() * (width[1] - width[0]), ...greens(rng),
      });
    }
    // Short blades last, so the clump is darker and denser at its heart.
    list.sort((a, b) => b.len - a.len).forEach((b) => paintBlade(ctx, ox, b));
  };
  const stalk = (ox: number, x: number, len: number, lean: number, color: string) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(ox + x, TILE_H);
    ctx.quadraticCurveTo(ox + x + lean * len * 0.3, TILE_H - len * 0.6, ox + x + lean * len, TILE_H - len);
    ctx.stroke();
    return [ox + x + lean * len, TILE_H - len] as const;
  };

  // 0 · meadow tuft: many short, curling blades
  blades(0, 74, [110, 300], 92, [5, 9], 0.55);

  // 1 · wild grass: fewer, taller, thinner blades with seed heads
  blades(TILE_W, 38, [240, 470], 80, [3, 6], 0.7);
  for (let i = 0; i < 5; i += 1) {
    const [hx, hy] = stalk(TILE_W, TILE_W / 2 + (rng() - 0.5) * 120, 380 + rng() * 120, (rng() - 0.5) * 0.5, "#9a9a5c");
    ctx.fillStyle = "#c9b878";
    for (let k = 0; k < 7; k += 1) {
      ctx.beginPath();
      ctx.ellipse(hx + (rng() - 0.5) * 6, hy + k * 7, 2.6, 5, (rng() - 0.5) * 0.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 2 · susuki silver grass: long arching blades and feathery plumes
  blades(TILE_W * 2, 30, [260, 440], 70, [3, 6], 0.95);
  for (let i = 0; i < 6; i += 1) {
    const lean = (rng() - 0.5) * 0.7;
    const [hx, hy] = stalk(TILE_W * 2, TILE_W / 2 + (rng() - 0.5) * 70, 400 + rng() * 100, lean, "#b4a274");
    for (let k = 0; k < 26; k += 1) {
      const t = k / 26;
      const px = hx - lean * 120 * t, py = hy + t * 120;
      ctx.strokeStyle = rng() < 0.5 ? "#f2e8cf" : "#dcc9a0";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px + (rng() - 0.3) * 26 + lean * 30, py + 12 + rng() * 16);
      ctx.stroke();
    }
  }

  // 3 · wildflowers: bellflowers, spider lilies, daisies and buttercups
  blades(TILE_W * 3, 46, [90, 250], 90, [4, 8], 0.5);
  const flowers = [
    { petals: 5, color: "#8a6fd6", center: "#f1e7ff", r: 13 },   // kikyō bellflower
    { petals: 6, color: "#d6352b", center: "#f7a08a", r: 15 },   // higanbana spider lily
    { petals: 8, color: "#f8f5ec", center: "#f2c23a", r: 11 },   // daisy
    { petals: 5, color: "#f4cb2c", center: "#e09a1a", r: 9 },    // buttercup
  ];
  for (let i = 0; i < 9; i += 1) {
    const f = flowers[Math.floor(rng() * flowers.length)]!;
    const [hx, hy] = stalk(TILE_W * 3, TILE_W / 2 + (rng() - 0.5) * 150, 170 + rng() * 170, (rng() - 0.5) * 0.4, "#4f7a3a");
    ctx.fillStyle = f.color;
    for (let k = 0; k < f.petals; k += 1) {
      const a = (k / f.petals) * Math.PI * 2 + rng() * 0.3;
      ctx.beginPath();
      ctx.ellipse(hx + Math.cos(a) * f.r * 0.6, hy + Math.sin(a) * f.r * 0.45, f.r * 0.55, f.r * 0.28, a, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = f.center;
    ctx.beginPath();
    ctx.arc(hx, hy, f.r * 0.25, 0, Math.PI * 2);
    ctx.fill();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  return texture;
};

/* ── Ground data for GPU placement ──────────────────────────────────────── */
// The terrain mesh: PlaneGeometry(WORLD_SIZE, WORLD_SIZE, 190, 190).
const TERRAIN_SEGMENTS = 190;

const buildHeightTexture = () => {
  const n = TERRAIN_SEGMENTS + 1, step = WORLD_SIZE / TERRAIN_SEGMENTS, origin = -WORLD_SIZE / 2;
  const data = new Float32Array(n * n);
  for (let j = 0; j < n; j += 1) for (let i = 0; i < n; i += 1) data[j * n + i] = heightAt(origin + i * step, origin + j * step);
  const texture = new THREE.DataTexture(data, n, n, THREE.RedFormat, THREE.FloatType);
  texture.minFilter = texture.magFilter = THREE.NearestFilter;
  texture.needsUpdate = true;
  return { texture, data, n, step, origin };
};

/** Where grass may grow: the meadow band, gentle slopes, off the pond shore
 * and clear of every building footprint, with soft edges. */
const buildMaskTexture = (heights: ReturnType<typeof buildHeightTexture>) => {
  const n = 512, step = WORLD_SIZE / n, origin = -WORLD_SIZE / 2;
  const values = new Float32Array(n * n);
  const sample = (x: number, z: number) => {
    const gx = Math.min(heights.n - 1.001, Math.max(0, (x - heights.origin) / heights.step));
    const gz = Math.min(heights.n - 1.001, Math.max(0, (z - heights.origin) / heights.step));
    const i = Math.floor(gx), j = Math.floor(gz), fx = gx - i, fz = gz - j, d = heights.data, m = heights.n;
    const a = d[j * m + i]! + (d[j * m + i + 1]! - d[j * m + i]!) * fx;
    const b = d[(j + 1) * m + i]! + (d[(j + 1) * m + i + 1]! - d[(j + 1) * m + i]!) * fx;
    return a + (b - a) * fz;
  };
  const smooth = (e0: number, e1: number, x: number) => {
    const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
    return t * t * (3 - 2 * t);
  };
  for (let j = 0; j < n; j += 1) {
    for (let i = 0; i < n; i += 1) {
      const x = origin + (i + 0.5) * step, z = origin + (j + 0.5) * step;
      const y = sample(x, z);
      const slope = Math.hypot(sample(x + step, z) - sample(x - step, z), sample(x, z + step) - sample(x, z - step)) / (2 * step);
      const pdx = x - POND_CENTER.x, pdz = z - POND_CENTER.y;
      const shore = pondShoreRadiiAt(Math.atan2(pdz, pdx)).outer;
      const edge = Math.min(i, j, n - 1 - i, n - 1 - j);
      // Grass climbs right up to the foothills at the valley rim.
      values[j * n + i] = smooth(18, 34, y) * (1 - smooth(600, 640, y)) * (1 - smooth(0.6, 0.85, slope))
        * smooth(shore + 6, shore + 26, Math.hypot(pdx, pdz)) * smooth(0, 3, edge);
    }
  }
  // Rasterise every building footprint with a soft margin.
  forEachZone((zx, zz, r) => {
    const outer = r + 12;
    const i0 = Math.max(0, Math.floor((zx - outer - origin) / step)), i1 = Math.min(n - 1, Math.ceil((zx + outer - origin) / step));
    const j0 = Math.max(0, Math.floor((zz - outer - origin) / step)), j1 = Math.min(n - 1, Math.ceil((zz + outer - origin) / step));
    for (let j = j0; j <= j1; j += 1) {
      for (let i = i0; i <= i1; i += 1) {
        const d = Math.hypot(origin + (i + 0.5) * step - zx, origin + (j + 0.5) * step - zz);
        values[j * n + i]! *= smooth(r + 2, outer, d);
      }
    }
  });
  const data = new Uint8Array(n * n);
  for (let k = 0; k < data.length; k += 1) data[k] = Math.round(values[k]! * 255);
  const texture = new THREE.DataTexture(data, n, n, THREE.RedFormat, THREE.UnsignedByteType);
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return { texture, origin, size: WORLD_SIZE };
};

/* ── The tuft: three crossed cards ─────────────────────────────────────── */
const createTuftGeometry = (segments: number, cells: number, cards: number): THREE.InstancedBufferGeometry => {
  const positions: number[] = [], uvs: number[] = [], indices: number[] = [];
  for (let k = 0; k < cards; k += 1) {
    const a = (k / cards) * Math.PI;
    const dx = Math.cos(a) * 0.5, dz = Math.sin(a) * 0.5;
    const start = positions.length / 3;
    for (let s = 0; s <= segments; s += 1) {
      const v = s / segments;
      positions.push(-dx, v, -dz, dx, v, dz);
      uvs.push(0, v, 1, v);
    }
    for (let s = 0; s < segments; s += 1) {
      const i = start + s * 2;
      indices.push(i, i + 1, i + 2, i + 2, i + 1, i + 3);
    }
  }
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  const cell = new Float32Array(cells * cells * 2);
  for (let j = 0; j < cells; j += 1) for (let i = 0; i < cells; i += 1) cell.set([i, j], (j * cells + i) * 2);
  geometry.setAttribute("aCell", new THREE.InstancedBufferAttribute(cell, 2));
  geometry.instanceCount = cells * cells;
  return geometry;
};

const PLACE_GLSL = /* glsl */ `
attribute vec2 aCell;
uniform float uSpacing;
uniform float uGrid;
uniform vec2 uFade;
uniform vec2 uHole;
uniform vec2 uSize;
uniform sampler2D uHeight;
uniform vec4 uHeightInfo;   // origin x, origin z, step, vertices per side
uniform sampler2D uMask;
uniform vec3 uMaskInfo;     // origin x, origin z, size
uniform vec3 uSunDir;
uniform float uWindTime;
uniform float uBillboard;   // 1: one card turned to face the camera (distant LOD)
varying float vGrassH;
varying float vGrassFade;
varying float vGrassSheen;
varying vec3 vGrassTint;
${GUST_GLSL}
${GRASS_GUST_GLSL}

float grassHash(vec2 p) {
  p = fract(p * vec2(0.1031, 0.1030));
  p += dot(p, p.yx + 33.33);
  return fract((p.x + p.y) * p.x);
}

// Exactly the terrain mesh's triangles (PlaneGeometry splits each quad a-b-d / b-c-d).
float grassGround(vec2 p) {
  vec2 g = (p - uHeightInfo.xy) / uHeightInfo.z;
  vec2 i = clamp(floor(g), vec2(0.0), vec2(uHeightInfo.w - 2.0));
  vec2 f = clamp(g - i, 0.0, 1.0);
  ivec2 c = ivec2(i);
  float h00 = texelFetch(uHeight, c, 0).r;
  float h10 = texelFetch(uHeight, c + ivec2(1, 0), 0).r;
  float h01 = texelFetch(uHeight, c + ivec2(0, 1), 0).r;
  float h11 = texelFetch(uHeight, c + ivec2(1, 1), 0).r;
  if (f.x + f.y <= 1.0) return h00 + (h10 - h00) * f.x + (h01 - h00) * f.y;
  return h11 + (h01 - h11) * (1.0 - f.x) + (h10 - h11) * (1.0 - f.y);
}
`;

const PLACE_MAIN = /* glsl */ `
  // Which world cell this instance stands in, wrapping around the camera.
  vec2 grassCell = floor(cameraPosition.xz / uSpacing) - floor(uGrid * 0.5) + aCell;
  vec2 jitter = vec2(grassHash(grassCell), grassHash(grassCell + 17.31));
  float rKeep = grassHash(grassCell + 41.7);
  float rPick = grassHash(grassCell - 9.13);
  float rSize = grassHash(grassCell + 3.7);
  vec2 root = (grassCell + jitter) * uSpacing;
  float ground = grassGround(root);
  float density = texture2D(uMask, (root - uMaskInfo.xy) / uMaskInfo.z).r;
  vec4 zone = texture2D(uWindNoise, root / 4096.0);
  float clump = texture2D(uWindNoise, root / 560.0 + 0.37).g;
  float grows = step(rKeep, density * (0.5 + 0.8 * clump));
  float dist = length(root - cameraPosition.xz);
  float fade = (1.0 - smoothstep(uFade.x, uFade.y, dist)) * smoothstep(uHole.x, uHole.y, dist);

  // Emergent meadow: flower drifts, susuki on the rises, wild grass, tufts.
  float flowers = smoothstep(0.55, 0.74, zone.r);
  float susuki = smoothstep(0.56, 0.76, zone.a) * smoothstep(110.0, 220.0, ground);
  float card = 0.0;
  if (rPick < 0.025 + 0.32 * flowers) card = 3.0;
  else if (rPick < 0.04 + 0.32 * flowers + 0.4 * susuki) card = 2.0;
  else if (rPick < 0.3 + 0.32 * flowers + 0.4 * susuki) card = 1.0;

  float sizeK = (0.7 + 0.6 * rSize) * (0.75 + 0.5 * clump);
  float tuftW = uSize.x * sizeK * (card == 2.0 ? 1.25 : 1.0);
  float tuftH = uSize.y * sizeK * (card == 1.0 ? 1.35 : card == 2.0 ? 2.2 : card == 3.0 ? 0.9 : 1.0);
  float show = grows * step(0.002, fade);
  // Near tufts turn at random; a distant single card faces the camera.
  float turn = uBillboard > 0.5
    ? atan(cameraPosition.z - root.y, cameraPosition.x - root.x) + 1.5707963
    : grassHash(grassCell + 5.1) * 6.2831853;
  vec2 spread = vec2(position.x * cos(turn) - position.z * sin(turn), position.x * sin(turn) + position.z * cos(turn)) * tuftW * show;
  float rise = position.y * tuftH * show;

  // Wind: arc downwind (length-preserving), flutter, gust sheen.
  vec2 wind = vec2(0.8, 0.6);
  float gust = grassGust(root, uWindTime);
  float valleyGust = kakuriyoGust(root, uWindTime);
  float flutter = sin(uWindTime * 5.3 + rSize * 40.0) * 0.06 + sin(uWindTime * 9.1 + jitter.x * 25.0) * 0.035;
  float arc = (0.16 + 0.2 * valleyGust + 0.8 * gust + flutter) * pow(position.y, 1.4) * (card == 2.0 ? 1.2 : 1.0);
  vec2 sway = wind * sin(arc) * rise + vec2(-wind.y, wind.x) * flutter * rise * 0.6;
  vec3 grassWorld = vec3(root.x + spread.x + sway.x, ground - 0.6 + rise * cos(arc), root.y + spread.y + sway.y);

  float dry = smoothstep(0.55, 0.85, zone.g) * 0.75;
  vec3 tint = vec3(0.9 + 0.18 * rSize, 0.94 + 0.12 * jitter.y, 0.88 + 0.16 * rKeep);
  tint = mix(tint, tint * vec3(1.2, 1.03, 0.6), dry);
  float backlit = pow(max(0.0, dot(normalize(grassWorld - cameraPosition), uSunDir)), 3.0);
  vGrassTint = tint * (1.0 + position.y * 0.28 * backlit);
  vGrassH = position.y;
  vGrassFade = fade;
  vGrassSheen = gust * position.y;
`;

type PatchOptions = {
  cells: number; spacing: number; fade: [number, number]; hole: [number, number]; size: [number, number];
  segments: number;
  /** 3 crossed cards up close; 1 camera-facing card for distant rings. */
  cards: number;
};

const createPatch = (
  atlas: THREE.Texture,
  heights: ReturnType<typeof buildHeightTexture>,
  mask: ReturnType<typeof buildMaskTexture>,
  { cells, spacing, fade, hole, size, segments, cards }: PatchOptions,
): THREE.Mesh => {
  const material = new THREE.MeshToonMaterial({
    map: atlas, gradientMap: getToonGradient(), side: THREE.DoubleSide, alphaTest: 0.5,
  });
  // Instanced cards would only clutter with ink hulls.
  material.userData.outlineParameters = { visible: false };
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, {
      uSpacing: { value: spacing }, uGrid: { value: cells },
      uFade: { value: new THREE.Vector2(...fade) }, uHole: { value: new THREE.Vector2(...hole) },
      uSize: { value: new THREE.Vector2(...size) },
      uHeight: { value: heights.texture },
      uHeightInfo: { value: new THREE.Vector4(heights.origin, heights.origin, heights.step, heights.n) },
      uMask: { value: mask.texture },
      uMaskInfo: { value: new THREE.Vector3(mask.origin, mask.origin, mask.size) },
      uSunDir: { value: SUN_DIRECTION.clone() },
      uWindNoise: { value: getWindNoiseTexture() },
      uWindTime: windTime,
      uBillboard: { value: cards === 1 ? 1 : 0 },
    });
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", `#include <common>\n${PLACE_GLSL}`)
      .replace("#include <uv_vertex>", `#include <uv_vertex>\n${PLACE_MAIN}\n  vMapUv = vec2((card + uv.x) * 0.25, uv.y);`)
      // Lit like the ground it grows from, front and back alike.
      .replace("#include <beginnormal_vertex>", "vec3 objectNormal = vec3( 0.0, 1.0, 0.0 );")
      .replace("#include <begin_vertex>", "vec3 transformed = grassWorld;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vGrassH;\nvarying float vGrassFade;\nvarying float vGrassSheen;\nvarying vec3 vGrassTint;")
      .replace("#include <map_fragment>", `#include <map_fragment>
  diffuseColor.rgb *= vGrassTint;
  // Pressed flat by a gust, the blades flash their paler sides.
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 1.3 + vec3(0.05, 0.06, 0.03), clamp(vGrassSheen, 0.0, 1.0) * 0.6);`)
      // Crisp alpha at any distance (fwidth-sharpened), dithered fade-out.
      .replace("#include <alphatest_fragment>", `
  float grassAlpha = (diffuseColor.a - 0.5) / max(fwidth(diffuseColor.a), 0.0001) + 0.5;
  float grassDither = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
  if (grassAlpha < 0.5 || grassDither > vGrassFade) discard;
  diffuseColor.a = 1.0;`)
      .replace("#include <normal_fragment_begin>", THREE.ShaderChunk.normal_fragment_begin.replace("normal *= faceDirection;", ""));
  };
  material.customProgramCacheKey = () => `grass-${cells}-${segments}-${cards}`;

  const mesh = new THREE.Mesh(createTuftGeometry(segments, cells, cards), material);
  mesh.frustumCulled = false;
  mesh.receiveShadow = true;
  mesh.castShadow = false;
  mesh.userData.noShadowCast = true;
  mesh.matrixAutoUpdate = false;
  return mesh;
};

export const createGrassField = (): GrassField => {
  const atlas = paintAtlas();
  const heights = buildHeightTexture();
  const mask = buildMaskTexture(heights);
  const group = new THREE.Group();
  group.name = "grass-field";
  // Level of detail in rings around the camera, dither-cross-fading where
  // they meet. Each ring is coarser, its tufts bigger and cheaper: crossed
  // cards with a bending joint up close, then single cards, then (past
  // ~1.2 km, where a tuft is a few pixels) one camera-facing card. Tufts
  // stay about twice as wide as their spacing in every ring, so the meadow
  // reads as full cover all the way out; the last ring runs to the fog line
  // (8.6 km), covering the whole valley from anywhere in it.
  // Budget: ~0.9M triangles, about 1 ms a frame on a laptop RTX-class GPU;
  // the near ring dominates, so widen it last.
  const rings: Array<[string, PatchOptions]> = [
    ["grass-near", { cells: 196, spacing: 6.5, fade: [520, 620], hole: [-2, -1], size: [14, 14], segments: 2, cards: 3 }],
    ["grass-mid", { cells: 210, spacing: 13, fade: [1180, 1340], hole: [520, 620], size: [28, 17], segments: 1, cards: 3 }],
    ["grass-far", { cells: 216, spacing: 30, fade: [2900, 3200], hole: [1180, 1340], size: [64, 26], segments: 1, cards: 1 }],
    ["grass-horizon", { cells: 236, spacing: 72, fade: [7600, 8400], hole: [2900, 3200], size: [152, 40], segments: 1, cards: 1 }],
  ];
  const patches = rings.map(([name, options]) => {
    const patch = createPatch(atlas, heights, mask, options);
    patch.name = name;
    group.add(patch);
    return patch;
  });
  return {
    mesh: group,
    dispose: () => {
      for (const patch of patches) {
        patch.geometry.dispose();
        (patch.material as THREE.Material).dispose();
      }
      atlas.dispose();
      heights.texture.dispose();
      mask.texture.dispose();
      group.removeFromParent();
    },
  };
};
