import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";

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

  void main() {
    vec3 direction = normalize(vWorldPosition);
    float height = clamp(direction.y * 0.5 + 0.5, 0.0, 1.0);
    float gradient = smoothstep(0.0, 1.0, pow(height, 1.35));
    vec3 dayColor = mix(bottomColor, topColor, gradient);
    vec3 baseColor = mix(nightColor, dayColor, dayFactor);

    vec2 cloudUv = direction.xz * cloudScale + vec2(time * cloudSpeed, time * cloudSpeed * 0.6);
    float cloudNoise = fbm(cloudUv);
    float cloudMask = smoothstep(0.52, 0.85, cloudNoise) * cloudIntensity;
    vec3 clouds = cloudColor * cloudMask * dayFactor;

    gl_FragColor = vec4(baseColor + clouds, 1.0);
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
