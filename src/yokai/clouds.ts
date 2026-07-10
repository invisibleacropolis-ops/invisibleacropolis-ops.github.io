import * as THREE from "three";
import { createRng } from "../scene/random.ts";
import { WORLD_SIZE } from "./terrain.ts";

/**
 * Ghibli clouds: fat, friendly cumulus built from clumped spheres with
 * flattened bellies, sailing very slowly on a shared wind.
 *
 * Shading is a dedicated painterly shader rather than lit toon spheres:
 * a warm-shadowed belly grading to a white crown by surface direction,
 * plus a fresnel rim that catches the low sun on every silhouette —
 * the "marshmallow" look stylized games use for cumulus.
 */

const cloudVertexShader = /* glsl */ `
  #include <fog_pars_vertex>
  varying vec3 vWorldNormal;
  varying vec3 vViewDir;
  varying vec3 vCloudPosition;

  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldNormal = normalize(mat3(modelMatrix) * normal);
    vViewDir = normalize(cameraPosition - worldPosition.xyz);
    vCloudPosition = worldPosition.xyz;
    vec4 mvPosition = viewMatrix * worldPosition;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const cloudFragmentShader = /* glsl */ `
  #include <fog_pars_fragment>
  uniform vec3 uCrownColor;
  uniform vec3 uBellyColor;
  uniform vec3 uRimColor;
  varying vec3 vWorldNormal;
  varying vec3 vViewDir;
  varying vec3 vCloudPosition;

  float hash(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
  }

  float cloudNoise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash(i), hash(i + vec3(1.0,0.0,0.0)), f.x),
          mix(hash(i + vec3(0.0,1.0,0.0)), hash(i + vec3(1.0,1.0,0.0)), f.x), f.y),
      mix(mix(hash(i + vec3(0.0,0.0,1.0)), hash(i + vec3(1.0,0.0,1.0)), f.x),
          mix(hash(i + vec3(0.0,1.0,1.0)), hash(i + vec3(1.0,1.0,1.0)), f.x), f.y),
      f.z
    );
  }

  void main() {
    vec3 n = normalize(vWorldNormal);
    float up = smoothstep(-0.55, 0.75, n.y);
    float cloudBand = step(0.48, up);
    vec3 color = mix(uBellyColor, uCrownColor, cloudBand);

    // Broad tonal islands merge the individual spheres into one painted mass.
    float textureA = cloudNoise(vCloudPosition * 0.0035);
    float textureB = cloudNoise(vCloudPosition * 0.008 + vec3(7.1));
    float textureMix = textureA * 0.72 + textureB * 0.28;
    color *= 0.94 + textureMix * 0.1;

    // A low warm key shapes the cloud instead of leaving every puff white.
    vec3 lightDir = normalize(vec3(-0.55, 0.28, -0.62));
    float keyLight = smoothstep(-0.25, 0.8, dot(n, lightDir));
    color = mix(color * vec3(0.86, 0.89, 0.97), color * vec3(1.03, 1.0, 0.95), keyLight * 0.42);

    // The low sun catching the cloud's silhouette
    float fresnel = pow(1.0 - abs(dot(n, normalize(vViewDir))), 2.4);
    color += uRimColor * fresnel * 0.55;

    gl_FragColor = vec4(color, 1.0);
    #include <fog_fragment>
  }
`;

export type CloudField = {
  group: THREE.Group;
  update: (t: number, dt: number) => void;
};

type Cloud = {
  group: THREE.Group;
  speed: number;
  bobPhase: number;
  baseY: number;
};

export const createClouds = (count = 13): CloudField => {
  const group = new THREE.Group();
  const rng = createRng(0xc10d);
  const clouds: Cloud[] = [];

  const cloudMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uCrownColor: { value: new THREE.Color("#f5f0e7") },
      uBellyColor: { value: new THREE.Color("#aeb8cb") },
      uRimColor: { value: new THREE.Color("#ffdfae") },
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
    },
    vertexShader: cloudVertexShader,
    fragmentShader: cloudFragmentShader,
    fog: true,
  });

  for (let c = 0; c < count; c += 1) {
    const cloud = new THREE.Group();
    const width = 340 + rng() * 520;
    const puffs = 5 + Math.floor(rng() * 5);

    for (let p = 0; p < puffs; p += 1) {
      const r = width * (0.22 + rng() * 0.2);
      const puff = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 12), cloudMaterial);
      puff.position.set(
        (p / (puffs - 1) - 0.5) * width + (rng() - 0.5) * width * 0.2,
        (rng() - 0.2) * r * 0.5,
        (rng() - 0.5) * width * 0.35
      );
      puff.scale.y = 0.58 + rng() * 0.18; // flat-bottomed, pillowy top
      cloud.add(puff);
    }

    cloud.position.set(
      (rng() - 0.5) * WORLD_SIZE * 1.3,
      1150 + rng() * 900,
      (rng() - 0.5) * WORLD_SIZE * 1.3
    );

    clouds.push({
      group: cloud,
      speed: 8 + rng() * 10,
      bobPhase: rng() * Math.PI * 2,
      baseY: cloud.position.y,
    });
    group.add(cloud);
  }

  const limit = WORLD_SIZE * 0.75;

  return {
    group,
    update: (t, dt) => {
      for (const cloud of clouds) {
        cloud.group.position.x += cloud.speed * dt;
        cloud.group.position.y = cloud.baseY + Math.sin(t * 0.05 + cloud.bobPhase) * 22;
        if (cloud.group.position.x > limit) cloud.group.position.x = -limit;
      }
    },
  };
};
