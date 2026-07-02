import * as THREE from "three";

import { createRng } from "./random.ts";

export type SkyOptions = {
  radius?: number;
  seed?: number;
  topColor?: string;
  bottomColor?: string;
  nightColor?: string;
  cloudColor?: string;
  cloudScale?: number;
  cloudSpeed?: number;
  cloudIntensity?: number;
  starColor?: string;
  starCount?: number;
  starSize?: number;
  dayDuration?: number;
  /** 0 = flat gradient sky, 1 = full visionary fractal field. */
  psyStrength?: number;
};

const vertexShader = `
  varying vec3 vWorldPosition;

  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const fragmentShader = `
  uniform vec3 topColor;
  uniform vec3 bottomColor;
  uniform vec3 nightColor;
  uniform vec3 cloudColor;
  uniform float cloudScale;
  uniform float cloudSpeed;
  uniform float cloudIntensity;
  uniform float time;
  uniform float dayFactor;
  uniform float psyStrength;
  varying vec3 vWorldPosition;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    float x1 = mix(a, b, u.x);
    float x2 = mix(c, d, u.x);
    return mix(x1, x2, u.y);
  }

  float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 4; i += 1) {
      value += amplitude * noise(p);
      p *= 2.0;
      amplitude *= 0.5;
    }
    return value;
  }

  /* ── 3D value noise (seamless over the dome, no polar/atan seams) ── */

  float hash3(vec3 p) {
    return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453123);
  }

  float noise3(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    vec3 u = f * f * (3.0 - 2.0 * f);
    float n000 = hash3(i);
    float n100 = hash3(i + vec3(1.0, 0.0, 0.0));
    float n010 = hash3(i + vec3(0.0, 1.0, 0.0));
    float n110 = hash3(i + vec3(1.0, 1.0, 0.0));
    float n001 = hash3(i + vec3(0.0, 0.0, 1.0));
    float n101 = hash3(i + vec3(1.0, 0.0, 1.0));
    float n011 = hash3(i + vec3(0.0, 1.0, 1.0));
    float n111 = hash3(i + vec3(1.0, 1.0, 1.0));
    return mix(
      mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y),
      mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y),
      u.z
    );
  }

  float fbm3(vec3 p) {
    float value = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 4; i += 1) {
      value += amplitude * noise3(p);
      p = p * 2.03 + vec3(13.7, 7.3, 3.1);
      amplitude *= 0.5;
    }
    return value;
  }

  void main() {
    vec3 direction = normalize(vWorldPosition);
    float height = clamp(direction.y * 0.5 + 0.5, 0.0, 1.0);
    float gradient = smoothstep(0.0, 1.0, pow(height, 1.35));
    vec3 dayColor = mix(bottomColor, topColor, gradient);
    vec3 baseColor = mix(nightColor, dayColor, dayFactor);

    /* ── Visionary field ────────────────────────────────────────
       Twice domain-warped fbm draped over the dome: q warps r,
       r warps v, and the folds of v become the pattern. Motion is
       geologically slow so it breathes rather than distracts.   */
    float tSlow = time * 0.006;
    vec3 p = direction * 2.7;
    float q = fbm3(p + vec3(0.0, tSlow * 0.5, tSlow * 0.2));
    float r = fbm3(p * 1.6 + vec3(q * 1.9, tSlow * 0.35, q * 1.3));
    float v = fbm3(p * 1.15 + vec3(r * 2.3 - 1.2, -tSlow * 0.3, q * 1.6));

    /* Colors are derived from whatever the day/night cycle says the
       sky currently is: same-tone shading, plus a luminance-matched
       complement and a hue-rotated triadic partner for contrast.  */
    vec3 fieldColor = baseColor * (0.72 + v * 0.62);

    float lum = dot(baseColor, vec3(0.299, 0.587, 0.114));
    vec3 comp = vec3(1.0) - baseColor;
    comp *= (lum + 0.32) / max(dot(comp, vec3(0.299, 0.587, 0.114)), 0.06);
    vec3 tri = baseColor.brg * (0.9 + v * 0.4);

    float ridge = 1.0 - abs(v * 2.0 - 1.0);
    float filaments = smoothstep(0.78, 0.985, ridge);
    float veil = smoothstep(0.32, 0.85, q) * smoothstep(0.9, 0.45, r);

    /* Accents glow a little brighter at night, when the base is dark */
    float accentGain = 0.35 + 0.65 * max(dayFactor, 0.4);
    vec3 sky = fieldColor;
    sky = mix(sky, comp, veil * 0.27 * accentGain * psyStrength);
    sky = mix(sky, tri, filaments * 0.45 * accentGain * psyStrength);

    /* The field concentrates overhead and thins toward the horizon,
       so distant monuments still read against a calm band.        */
    float domeMask = 0.45 + 0.55 * smoothstep(0.42, 0.72, height);
    sky = mix(baseColor, sky, domeMask * psyStrength);

    vec2 cloudUv = direction.xz * cloudScale + vec2(time * cloudSpeed, time * cloudSpeed * 0.6);
    float cloudNoise = fbm(cloudUv);
    float cloudMask = smoothstep(0.52, 0.85, cloudNoise) * cloudIntensity;
    vec3 clouds = cloudColor * cloudMask * dayFactor;

    /* Tiny dither hides gradient banding on the slow color ramps */
    float dither = (hash(direction.xy * 913.7 + direction.zx * 411.3) - 0.5) * 0.012;

    gl_FragColor = vec4(sky + clouds + dither, 1.0);
  }
`;

const createStarField = (radius: number, seed: number, count: number, color: string, size: number) => {
  const rng = createRng(seed ^ 0x7b9e);
  const positions = new Float32Array(count * 3);

  for (let i = 0; i < count; i += 1) {
    const u = rng();
    const v = rng();
    const theta = u * Math.PI * 2;
    const cosPhi = 2 * v - 1;
    const phi = Math.acos(THREE.MathUtils.clamp(cosPhi, -1, 1));
    const r = radius * (0.85 + rng() * 0.12);
    const sinPhi = Math.sin(phi);
    positions[i * 3] = r * sinPhi * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.cos(phi);
    positions[i * 3 + 2] = r * sinPhi * Math.sin(theta);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));

  const material = new THREE.PointsMaterial({
    color: new THREE.Color(color),
    size,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  material.toneMapped = false;

  const stars = new THREE.Points(geometry, material);

  return { stars, material };
};

export const createSky = ({
  radius = 120,
  seed = 1337,
  topColor = "#0f2a5a",
  bottomColor = "#dbe7ff",
  nightColor = "#02060f",
  cloudColor = "#ffffff",
  cloudScale = 0.35,
  cloudSpeed = 0.02,
  cloudIntensity = 0.45,
  starColor = "#c9d9ff",
  starCount = 320,
  starSize = 0.65,
  dayDuration = 160,
  psyStrength = 1,
}: SkyOptions) => {
  const geometry = new THREE.SphereGeometry(radius, 32, 24);

  const uniforms = {
    topColor: { value: new THREE.Color(topColor) },
    bottomColor: { value: new THREE.Color(bottomColor) },
    nightColor: { value: new THREE.Color(nightColor) },
    cloudColor: { value: new THREE.Color(cloudColor) },
    cloudScale: { value: cloudScale },
    cloudSpeed: { value: cloudSpeed },
    cloudIntensity: { value: cloudIntensity },
    time: { value: 0 },
    dayFactor: { value: 1 },
    psyStrength: { value: psyStrength },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    side: THREE.BackSide,
    depthWrite: false,
  });
  material.toneMapped = false;

  const mesh = new THREE.Mesh(geometry, material);

  const { stars, material: starMaterial } = createStarField(radius, seed, starCount, starColor, starSize);
  const sunDirection = new THREE.Vector3(1, 1, 0).normalize();

  const update = (time: number) => {
    const cycle = (time / dayDuration) % 1;
    const angle = cycle * Math.PI * 2;
    sunDirection.set(Math.cos(angle), Math.sin(angle), Math.sin(angle) * 0.35).normalize();

    const dayFactor = THREE.MathUtils.smoothstep(sunDirection.y, -0.1, 0.25);
    const nightFactor = 1 - dayFactor;

    uniforms.time.value = time;
    uniforms.dayFactor.value = dayFactor;
    starMaterial.opacity = nightFactor;

    return { sunDirection, dayFactor, nightFactor };
  };

  return {
    mesh,
    stars,
    update,
  };
};
