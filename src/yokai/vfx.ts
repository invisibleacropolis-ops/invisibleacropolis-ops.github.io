import * as THREE from "three";
import { GUST_GLSL, getWindNoiseTexture, windTime } from "./shaders.ts";

/**
 * Kakuriyo's effects runtime.
 *
 * The look comes from flipbooks baked in Blender (tools/blender/vfx_build.py):
 * procedural volumes rendered in Cycles and packed as DATA — R coverage,
 * G light (or flame heat), B flame core — so one atlas can be shaded and
 * recoloured many ways. Everything moves on the GPU: the CPU only writes a
 * particle's spawn values once; drag, buoyancy, turbulence, the valley's
 * wind, growth, spin and the flipbook frame are all computed per vertex.
 *
 *   createFlipbook  puffs of cel-shaded smoke or flame (bursts and streams)
 *   createWisps     flames orbiting a point (kitsunebi foxfire, hitodama)
 *   createRingPool  ripples and shock rings
 *   createRain      wind-slanted rain streaks
 *   createFireflies drifting, blinking lights that wake at dusk
 */

const FRAMES = 64;
const COLS = 8;
const base = ((import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL) ?? "/";

const atlases = new Map<string, THREE.Texture>();
export const vfxAtlas = (name: "puff" | "flame"): THREE.Texture => {
  let texture = atlases.get(name);
  if (!texture) {
    // Node-side checks build characters without a document to load into.
    texture = typeof document === "undefined" ? new THREE.Texture() : new THREE.TextureLoader().load(`${base}kami/vfx/${name}.png`);
    texture.colorSpace = THREE.NoColorSpace; // the channels are data, not colour
    texture.anisotropy = 2;
    atlases.set(name, texture);
  }
  return texture;
};

const FLIPBOOK_GLSL = /* glsl */ `
vec2 flipbookUv(float frame, vec2 uv) {
  float col = mod(frame, ${COLS.toFixed(1)});
  float row = floor(frame / ${COLS.toFixed(1)});
  return vec2((col + uv.x) / ${COLS.toFixed(1)}, 1.0 - (row + 1.0 - uv.y) / ${COLS.toFixed(1)});
}
`;

// Shading shared by every flipbook user. STYLE 0 = cel smoke, 1 = flame.
const SHADE_GLSL = /* glsl */ `
uniform sampler2D uAtlas;
uniform vec3 uColorA;   // smoke: shadow · flame: outer
uniform vec3 uColorB;   // smoke: lit    · flame: mid
uniform vec3 uColorC;   // smoke: rim    · flame: core
uniform float uOpacity;
vec4 shadeFlipbook(vec2 uv0, vec2 uv1, float blend, float age, vec4 tint) {
  vec4 s = mix(texture2D(uAtlas, uv0), texture2D(uAtlas, uv1), blend);
  float alpha;
  vec3 color;
#if STYLE == 0
  // Cel smoke: a crisp edge that is eaten away late in life, two light
  // bands and a bright rim where the thin edge catches the sun.
  float cut = 0.1 + 0.3 * smoothstep(0.6, 1.0, age);
  alpha = smoothstep(cut, cut + 0.07, s.r) * smoothstep(0.0, 0.05, age);
  float lit = smoothstep(0.4, 0.5, s.g);
  color = mix(uColorA, uColorB, lit);
  color = mix(color, uColorC, smoothstep(0.78, 0.95, s.g) * 0.7);
#else
  alpha = smoothstep(0.05, 0.22, s.r);
  color = mix(uColorA, uColorB, smoothstep(0.2, 0.55, s.g));
  color = mix(color, uColorC, smoothstep(0.15, 0.75, s.b));
  alpha *= smoothstep(0.0, 0.08, age) * (1.0 - smoothstep(0.82, 1.0, age));
#endif
  return vec4(color * tint.rgb, alpha * tint.a * uOpacity);
}
`;

// Additive effects fade into the fog instead of turning fog-coloured.
const FOG_FADE_GLSL = /* glsl */ `
#ifdef USE_FOG
  float vfxFog = smoothstep(fogNear, fogFar, vFogDepth);
  gl_FragColor.a *= 1.0 - vfxFog;
#endif
`;

const fogUniforms = () => THREE.UniformsUtils.clone(THREE.UniformsLib.fog);

/* ── Flipbook particles ─────────────────────────────────────────────────── */

export type FlipbookOptions = {
  atlas: "puff" | "flame";
  capacity?: number;
  /** Smoke: shadow, lit, rim. Flame: outer, mid, core. */
  colors: [string, string, string];
  additive?: boolean;
  /** Velocity damping per second. */
  drag?: number;
  /** Downward acceleration; negative rises (buoyant smoke). */
  gravity?: number;
  /** Sideways wander, units per second of age. */
  turbulence?: number;
  /** How strongly the valley wind carries it. */
  wind?: number;
  /** Size multiplier reached at the end of life. */
  growth?: number;
  /** Random spin rate (smoke); flames stay upright. */
  spin?: number;
  /** Flame frames loop at this rate instead of playing once over a life. */
  loopFps?: number;
  opacity?: number;
};

export type EmitOptions = {
  count?: number;
  /** Random scatter of spawn points. */
  spread?: number;
  speed?: number;
  /** Bias of the launch direction upward (0 = sphere). */
  upward?: number;
  /** Explicit initial velocity (overrides speed/upward). */
  velocity?: THREE.Vector3;
  size?: number;
  life?: number;
  tint?: THREE.Color;
  alpha?: number;
};

export type Flipbook = {
  group: THREE.Group;
  emit: (at: THREE.Vector3, options?: EmitOptions) => void;
  /** Continuous emission: rate per second, call every frame. */
  stream: (dt: number, rate: number, at: THREE.Vector3, options?: EmitOptions) => void;
  setColors: (a: string, b: string, c?: string) => void;
  setOpacity: (k: number) => void;
  update: (t: number) => void;
  dispose: () => void;
};

let flipbookSeed = 1;
const random = () => {
  flipbookSeed = (flipbookSeed * 16807) % 2147483647;
  return flipbookSeed / 2147483647;
};

export const createFlipbook = ({
  atlas, capacity = 256, colors, additive = false, drag = 1.2, gravity = -8, turbulence = 10,
  wind = 0.6, growth = 2.2, spin = 0.4, loopFps = 0, opacity = 1,
}: FlipbookOptions): Flipbook => {
  const group = new THREE.Group();
  const quad = new THREE.PlaneGeometry(1, 1);
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setIndex(quad.index!.clone());
  geometry.setAttribute("position", quad.attributes.position.clone());
  geometry.setAttribute("uv", quad.attributes.uv.clone());
  quad.dispose();
  const origin = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const velocity = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const life = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4).setUsage(THREE.DynamicDrawUsage);
  const tint = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4).setUsage(THREE.DynamicDrawUsage);
  for (let i = 0; i < capacity; i += 1) life.setXYZW(i, -1e4, 1, 1, random());
  geometry.setAttribute("aOrigin", origin);
  geometry.setAttribute("aVelocity", velocity);
  geometry.setAttribute("aLife", life);
  geometry.setAttribute("aTint", tint);
  geometry.instanceCount = capacity;

  const uniforms = {
    ...fogUniforms(),
    uTime: { value: 0 },
    uWindTime: windTime,
    uNoise: { value: getWindNoiseTexture() },
    uAtlas: { value: vfxAtlas(atlas) },
    uColorA: { value: new THREE.Color(colors[0]) },
    uColorB: { value: new THREE.Color(colors[1]) },
    uColorC: { value: new THREE.Color(colors[2]) },
    uOpacity: { value: opacity },
    uDrag: { value: drag }, uGravity: { value: gravity }, uTurbulence: { value: turbulence },
    uWind: { value: wind }, uGrowth: { value: growth }, uSpin: { value: spin }, uLoopFps: { value: loopFps },
  };
  const style = atlas === "flame" ? 1 : 0;
  const material = new THREE.ShaderMaterial({
    uniforms,
    defines: { STYLE: style },
    transparent: true,
    depthWrite: false,
    fog: true,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    vertexShader: /* glsl */ `
      #include <fog_pars_vertex>
      attribute vec3 aOrigin, aVelocity;
      attribute vec4 aLife, aTint;      // birth, duration, size, seed
      uniform float uTime, uWindTime, uDrag, uGravity, uTurbulence, uWind, uGrowth, uSpin, uLoopFps;
      uniform sampler2D uNoise;
      varying vec2 vUv0, vUv1;
      varying float vBlend, vAge;
      varying vec4 vTint;
      ${GUST_GLSL}
      ${FLIPBOOK_GLSL}
      void main() {
        float age = uTime - aLife.x;
        vAge = age / aLife.y;
        vTint = aTint;
        if (age < 0.0 || age >= aLife.y) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
        float travel = uDrag > 0.0 ? (1.0 - exp(-age * uDrag)) / uDrag : age;
        vec3 p = aOrigin + aVelocity * travel;
        p.y -= 0.5 * uGravity * age * age;
        vec2 wander = texture2D(uNoise, vec2(aLife.w * 0.37 + age * 0.05, aLife.w * 0.71 - age * 0.04)).rg - 0.5;
        p.xz += wander * uTurbulence * age * 2.0;
        p.xz += vec2(0.8, 0.6) * uWind * (0.3 + kakuriyoGust(aOrigin.xz, uWindTime)) * age * 12.0;
        float size = aLife.z * mix(1.0, uGrowth, sqrt(clamp(vAge, 0.0, 1.0)));
        float angle = uSpin > 0.0 ? aLife.w * 6.2831 + age * uSpin * (fract(aLife.w * 7.3) - 0.5) : 0.0;
        vec2 corner = mat2(cos(angle), sin(angle), -sin(angle), cos(angle)) * position.xy * size;
        float frame = uLoopFps > 0.0 ? mod(age * uLoopFps + aLife.w * ${FRAMES.toFixed(1)}, ${FRAMES.toFixed(1)})
                                     : clamp(vAge, 0.0, 0.999) * ${(FRAMES - 1).toFixed(1)};
        float f0 = floor(frame);
        float f1 = uLoopFps > 0.0 ? mod(f0 + 1.0, ${FRAMES.toFixed(1)}) : min(f0 + 1.0, ${(FRAMES - 1).toFixed(1)});
        vBlend = frame - f0;
        vUv0 = flipbookUv(f0, uv);
        vUv1 = flipbookUv(f1, uv);
        vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
        mvPosition.xy += corner;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <fog_pars_fragment>
      varying vec2 vUv0, vUv1;
      varying float vBlend, vAge;
      varying vec4 vTint;
      ${SHADE_GLSL}
      void main() {
        vec4 c = shadeFlipbook(vUv0, vUv1, vBlend, vAge, vTint);
        if (c.a < 0.004) discard;
        gl_FragColor = c;
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        ${additive ? FOG_FADE_GLSL : "#include <fog_fragment>"}
      }`,
  });
  material.userData.outlineParameters = { visible: false };
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  group.add(mesh);

  let cursor = 0, time = 0, aliveUntil = -1, carry = 0;
  const white = new THREE.Color(1, 1, 1);
  const emit = (at: THREE.Vector3, o: EmitOptions = {}) => {
    const count = Math.max(0, Math.floor(o.count ?? 12));
    const speed = o.speed ?? 30, size = o.size ?? 40, duration = o.life ?? 3, spread = o.spread ?? 6;
    const color = o.tint ?? white, alpha = o.alpha ?? 1;
    for (let k = 0; k < count; k += 1) {
      const slot = cursor++ % capacity;
      origin.setXYZ(slot, at.x + (random() - 0.5) * spread, at.y + (random() - 0.5) * spread * 0.5, at.z + (random() - 0.5) * spread);
      if (o.velocity) {
        velocity.setXYZ(slot, o.velocity.x * (0.85 + random() * 0.3), o.velocity.y * (0.85 + random() * 0.3), o.velocity.z * (0.85 + random() * 0.3));
      } else {
        const a = random() * Math.PI * 2, y = random() * 1.4 - 0.4 + (o.upward ?? 0.6);
        const r = Math.sqrt(Math.max(0, 1 - Math.min(1, y * y))), v = speed * (0.4 + random() * 0.6);
        velocity.setXYZ(slot, Math.cos(a) * r * v, y * v, Math.sin(a) * r * v);
      }
      const d = duration * (0.75 + random() * 0.5);
      life.setXYZW(slot, time, d, size * (0.7 + random() * 0.6), random());
      const v = 0.9 + random() * 0.2;
      tint.setXYZW(slot, color.r * v, color.g * v, color.b * v, alpha);
      aliveUntil = Math.max(aliveUntil, time + d);
    }
    origin.needsUpdate = velocity.needsUpdate = life.needsUpdate = tint.needsUpdate = true;
    mesh.visible = true;
  };
  return {
    group,
    emit,
    stream: (dt, rate, at, o = {}) => {
      carry += rate * dt;
      const n = Math.floor(carry);
      if (n > 0) { carry -= n; emit(at, { ...o, count: n }); }
    },
    setColors: (a, b, c) => {
      uniforms.uColorA.value.set(a);
      uniforms.uColorB.value.set(b);
      if (c) uniforms.uColorC.value.set(c);
    },
    setOpacity: (k) => { uniforms.uOpacity.value = k; },
    update: (t) => {
      time = t;
      uniforms.uTime.value = t;
      mesh.visible = t < aliveUntil;
    },
    dispose: () => { geometry.dispose(); material.dispose(); group.removeFromParent(); },
  };
};

/* ── Wisps: flames circling a point (in their parent's space) ───────────── */

export type WispOptions = {
  count?: number;
  radius?: number;
  height?: number;
  size?: number;
  colors?: [string, string, string];
  speed?: number;
  /** Vertical bob amplitude. */
  bob?: number;
};

export type Wisps = {
  group: THREE.Group;
  setIntensity: (k: number) => void;
  update: (t: number) => void;
  dispose: () => void;
};

export const createWisps = ({
  count = 3, radius = 34, height = 40, size = 16, colors = ["#2f8dff", "#7fe8ff", "#f4ffff"], speed = 0.7, bob = 7,
}: WispOptions = {}): Wisps => {
  const group = new THREE.Group();
  group.name = "wisps";
  const quad = new THREE.PlaneGeometry(1, 1.6);
  quad.translate(0, 0.3, 0);
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setIndex(quad.index!.clone());
  geometry.setAttribute("position", quad.attributes.position.clone());
  geometry.setAttribute("uv", quad.attributes.uv.clone());
  quad.dispose();
  const params = new Float32Array(count * 4);
  for (let i = 0; i < count; i += 1) {
    params.set([i / count * Math.PI * 2, 0.75 + Math.random() * 0.5, Math.random(), 0.8 + Math.random() * 0.4], i * 4);
  }
  geometry.setAttribute("aWisp", new THREE.InstancedBufferAttribute(params, 4));
  geometry.instanceCount = count;
  const uniforms = {
    ...fogUniforms(),
    uTime: { value: 0 },
    uAtlas: { value: vfxAtlas("flame") },
    uColorA: { value: new THREE.Color(colors[0]) },
    uColorB: { value: new THREE.Color(colors[1]) },
    uColorC: { value: new THREE.Color(colors[2]) },
    uOpacity: { value: 1 },
    uRadius: { value: radius }, uHeight: { value: height }, uSize: { value: size },
    uSpeed: { value: speed }, uBob: { value: bob },
  };
  const material = new THREE.ShaderMaterial({
    uniforms, defines: { STYLE: 1 }, transparent: true, depthWrite: false, fog: true,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      #include <fog_pars_vertex>
      attribute vec4 aWisp;   // phase, speed factor, seed, size factor
      uniform float uTime, uRadius, uHeight, uSize, uSpeed, uBob;
      varying vec2 vUv0, vUv1;
      varying float vBlend;
      ${FLIPBOOK_GLSL}
      void main() {
        float a = aWisp.x + uTime * uSpeed * aWisp.y;
        float r = uRadius * (0.8 + 0.25 * sin(uTime * 0.7 + aWisp.z * 9.0));
        vec3 p = vec3(cos(a) * r, uHeight + sin(uTime * 1.9 + aWisp.z * 6.0) * uBob, sin(a) * r);
        float frame = mod(uTime * 22.0 + aWisp.z * 64.0, 64.0);
        float f0 = floor(frame);
        vBlend = frame - f0;
        vUv0 = flipbookUv(f0, uv);
        vUv1 = flipbookUv(mod(f0 + 1.0, 64.0), uv);
        vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
        float flicker = 0.9 + 0.12 * sin(uTime * 13.0 + aWisp.z * 20.0);
        mvPosition.xy += position.xy * uSize * aWisp.w * flicker;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <fog_pars_fragment>
      varying vec2 vUv0, vUv1;
      varying float vBlend;
      ${SHADE_GLSL}
      void main() {
        vec4 c = shadeFlipbook(vUv0, vUv1, vBlend, 0.5, vec4(1.0));
        if (c.a < 0.004) discard;
        gl_FragColor = vec4(c.rgb * 1.4, c.a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        ${FOG_FADE_GLSL}
      }`,
  });
  material.userData.outlineParameters = { visible: false };
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.renderOrder = 3;
  group.add(mesh);
  return {
    group,
    setIntensity: (k) => { uniforms.uOpacity.value = k; mesh.visible = k > 0.001; },
    update: (t) => { uniforms.uTime.value = t; },
    dispose: () => { geometry.dispose(); material.dispose(); group.removeFromParent(); },
  };
};

/* ── Ripple / shock rings ───────────────────────────────────────────────── */

export type RingPool = {
  group: THREE.Group;
  ring: (at: THREE.Vector3, radius?: number, duration?: number) => void;
  update: (t: number) => void;
  dispose: () => void;
};

/** Expanding rings with a wobbling leading edge and a fainter echo behind,
 * all in one instanced draw; the CPU only writes a ring's start. */
export const createRingPool = (color = "#ffe2a0", capacity = 12): RingPool => {
  const group = new THREE.Group();
  const quad = new THREE.PlaneGeometry(2, 2);
  quad.rotateX(-Math.PI / 2);
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setIndex(quad.index!.clone());
  geometry.setAttribute("position", quad.attributes.position.clone());
  geometry.setAttribute("uv", quad.attributes.uv.clone());
  quad.dispose();
  const spawn = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 4), 4).setUsage(THREE.DynamicDrawUsage);
  const timing = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 2), 2).setUsage(THREE.DynamicDrawUsage);
  for (let i = 0; i < capacity; i += 1) timing.setXY(i, -1e4, 1);
  geometry.setAttribute("aSpawn", spawn);
  geometry.setAttribute("aTiming", timing);
  geometry.instanceCount = capacity;
  const uniforms = { uTime: { value: 0 }, uColor: { value: new THREE.Color(color) } };
  const material = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute vec4 aSpawn;   // x y z radius
      attribute vec2 aTiming;  // start, duration
      uniform float uTime;
      varying vec2 vUv;
      varying float vAge;
      void main() {
        vAge = (uTime - aTiming.x) / aTiming.y;
        if (vAge < 0.0 || vAge >= 1.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
        vUv = uv;
        vec3 p = aSpawn.xyz + position * aSpawn.w;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      varying vec2 vUv;
      varying float vAge;
      void main() {
        vec2 q = (vUv - 0.5) * 2.0;
        float r = length(q), a = atan(q.y, q.x);
        float ease = 1.0 - pow(1.0 - vAge, 2.2);
        float wobble = 0.018 * sin(a * 7.0 + vAge * 9.0) + 0.012 * sin(a * 13.0 - vAge * 5.0);
        float front = ease * 0.92 + wobble;
        float band = exp(-pow((r - front) * 38.0, 2.0)) + 0.45 * exp(-pow((r - front * 0.72) * 46.0, 2.0));
        float alpha = band * (1.0 - vAge) * (1.0 - smoothstep(0.92, 1.0, r));
        if (alpha < 0.004) discard;
        gl_FragColor = vec4(uColor, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  material.userData.outlineParameters = { visible: false };
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  group.add(mesh);
  let cursor = 0, time = 0;
  return {
    group,
    ring: (at, radius = 90, duration = 1.6) => {
      const slot = cursor++ % capacity;
      spawn.setXYZW(slot, at.x, at.y, at.z, radius);
      timing.setXY(slot, time, duration);
      spawn.needsUpdate = timing.needsUpdate = true;
    },
    update: (t) => { time = t; uniforms.uTime.value = t; },
    dispose: () => { geometry.dispose(); material.dispose(); group.removeFromParent(); },
  };
};

/* ── Rain ───────────────────────────────────────────────────────────────── */

export type Rain = {
  group: THREE.Group;
  setIntensity: (k: number) => void;
  update: (t: number) => void;
  dispose: () => void;
};

/** Streaks falling and wrapping entirely in the vertex shader, slanted by
 * the valley wind; each streak faces the camera around its fall axis. */
export const createRain = ({ center = new THREE.Vector3(), radius = 2600, top = 1500, drops = 4000 } = {}): Rain => {
  const group = new THREE.Group();
  const quad = new THREE.PlaneGeometry(1, 1);
  quad.translate(0, 0.5, 0);
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setIndex(quad.index!.clone());
  geometry.setAttribute("position", quad.attributes.position.clone());
  geometry.setAttribute("uv", quad.attributes.uv.clone());
  quad.dispose();
  const seeds = new Float32Array(drops * 4);
  for (let i = 0; i < drops; i += 1) {
    const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * radius;
    seeds.set([center.x + Math.cos(a) * r, center.z + Math.sin(a) * r, Math.random(), 620 + Math.random() * 340], i * 4);
  }
  geometry.setAttribute("aDrop", new THREE.InstancedBufferAttribute(seeds, 4));
  geometry.instanceCount = drops;
  const uniforms = {
    ...fogUniforms(),
    uTime: { value: 0 }, uWindTime: windTime, uTop: { value: top }, uIntensity: { value: 0 },
    uColor: { value: new THREE.Color("#d7e4ef") },
  };
  const material = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, fog: true,
    vertexShader: /* glsl */ `
      #include <fog_pars_vertex>
      attribute vec4 aDrop;  // x, z, phase, speed
      uniform float uTime, uWindTime, uTop, uIntensity;
      varying vec2 vUv;
      ${GUST_GLSL}
      void main() {
        vUv = uv;
        if (aDrop.z > uIntensity) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
        float y = uTop - mod(uTime * aDrop.w + aDrop.z * uTop, uTop);
        vec2 slant = vec2(0.8, 0.6) * (0.12 + 0.18 * kakuriyoGust(aDrop.xy, uWindTime));
        vec3 axis = normalize(vec3(-slant.x, -1.0, -slant.y));
        vec3 root = vec3(aDrop.x + slant.x * (uTop - y), y, aDrop.y + slant.y * (uTop - y));
        vec3 toCamera = normalize(cameraPosition - root);
        vec3 side = normalize(cross(axis, toCamera));
        vec3 p = root - axis * position.y * 34.0 + side * position.x * 1.1;
        vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <fog_pars_fragment>
      uniform vec3 uColor;
      varying vec2 vUv;
      void main() {
        float alpha = (1.0 - abs(vUv.x - 0.5) * 2.0) * smoothstep(0.0, 0.4, vUv.y) * 0.5;
        gl_FragColor = vec4(uColor, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  material.userData.outlineParameters = { visible: false };
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  mesh.visible = false;
  group.add(mesh);
  return {
    group,
    setIntensity: (k) => {
      uniforms.uIntensity.value = THREE.MathUtils.clamp(k, 0, 1);
      mesh.visible = k > 0.001;
    },
    update: (t) => { uniforms.uTime.value = t; },
    dispose: () => { geometry.dispose(); material.dispose(); group.removeFromParent(); },
  };
};

/* ── Fireflies ──────────────────────────────────────────────────────────── */

export type Fireflies = {
  group: THREE.Group;
  /** 0 = golden hour (a few faint glints) … 1 = night (the full display). */
  setNight: (k: number) => void;
  update: (t: number) => void;
  dispose: () => void;
};

/** Hotaru over the pond and the bamboo: each wanders its own loop, rising
 * and settling, and blinks on a slow pulse of its own. */
export const createFireflies = (places: { x: number; y: number; z: number; radius: number; count: number }[]): Fireflies => {
  const group = new THREE.Group();
  const total = places.reduce((n, p) => n + p.count, 0);
  const home = new Float32Array(total * 3);
  const seed = new Float32Array(total);
  let k = 0;
  for (const p of places) {
    for (let i = 0; i < p.count; i += 1, k += 1) {
      const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * p.radius;
      home.set([p.x + Math.cos(a) * r, p.y + 8 + Math.random() * 40, p.z + Math.sin(a) * r], k * 3);
      seed[k] = Math.random() * 100;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(home, 3));
  geometry.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
  const uniforms = { ...fogUniforms(), uTime: { value: 0 }, uNight: { value: 0 } };
  const material = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, fog: true, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      #include <fog_pars_vertex>
      attribute float aSeed;
      uniform float uTime, uNight;
      varying float vGlow;
      void main() {
        float s = aSeed;
        float t = uTime * (0.25 + 0.15 * fract(s * 3.1));
        vec3 p = position.xyz + vec3(sin(t + s) * 22.0 + sin(t * 2.3 + s * 4.0) * 6.0,
                                     sin(t * 1.3 + s * 2.0) * 9.0,
                                     cos(t * 0.9 + s * 1.7) * 22.0);
        float blink = pow(max(0.0, sin(uTime * (0.9 + fract(s * 7.7)) + s * 11.0)), 6.0);
        vGlow = blink * mix(0.12 * step(0.82, fract(s * 13.1)), 1.0, uNight);
        vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = (3.0 + 5.0 * blink) * (420.0 / max(40.0, -mvPosition.z));
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      #include <fog_pars_fragment>
      varying float vGlow;
      void main() {
        float r = length(gl_PointCoord - 0.5) * 2.0;
        float glow = exp(-r * r * 5.0) * vGlow;
        if (glow < 0.004) discard;
        gl_FragColor = vec4(vec3(0.86, 1.0, 0.45) * 1.6, glow);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        ${FOG_FADE_GLSL}
      }`,
  });
  material.userData.outlineParameters = { visible: false };
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  group.add(points);
  return {
    group,
    setNight: (night) => { uniforms.uNight.value = THREE.MathUtils.clamp(night, 0, 1); },
    update: (t) => { uniforms.uTime.value = t; },
    dispose: () => { geometry.dispose(); material.dispose(); group.removeFromParent(); },
  };
};
