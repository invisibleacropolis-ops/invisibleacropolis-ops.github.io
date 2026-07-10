import * as THREE from "three";
import { createRng } from "../scene/random.ts";
import { POND_CENTER, heightAt, slopeAt } from "./terrain.ts";
import { isFree } from "./occupancy.ts";
import { windTime } from "./shaders.ts";

/**
 * The blade field: real grass the way stylized games do it — one tapered
 * blade, instanced tens of thousands of times across the meadows, bent by
 * wind in the vertex shader (tips move, roots hold) and shaded root-dark
 * to tip-light so the field reads as depth, not noise. One draw call.
 */

export type GrassField = {
  mesh: THREE.InstancedMesh;
  dispose: () => void;
};

/** A single tapered blade: 3 quad segments narrowing to a point. */
const createBladeGeometry = (): THREE.BufferGeometry => {
  const height = 11;
  const halfWidths = [0.9, 0.72, 0.42, 0];
  const heights = [0, 0.45, 0.78, 1];

  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  heights.forEach((h, i) => {
    const hw = halfWidths[i]!;
    if (hw > 0) {
      positions.push(-hw, h * height, 0, hw, h * height, 0);
      uvs.push(0, h, 1, h);
    } else {
      positions.push(0, h * height, 0);
      uvs.push(0.5, h);
    }
  });
  // Three quads' worth of triangles, closing on the tip vertex (index 6)
  indices.push(0, 1, 2, 2, 1, 3, 2, 3, 4, 4, 3, 5, 4, 5, 6);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return geometry;
};

const vertexShader = /* glsl */ `
  #include <fog_pars_vertex>

  uniform float uTime;
  varying float vHeight;
  varying vec3 vTint;

  void main() {
    vHeight = uv.y;
    #ifdef USE_INSTANCING_COLOR
      vTint = instanceColor;
    #else
      vTint = vec3(1.0);
    #endif

    vec3 transformed = position;

    #ifdef USE_INSTANCING
      vec3 base = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
      // Two crossed waves plus a slow travelling gust; tips bend, roots hold
      float phase = base.x * 0.043 + base.z * 0.049;
      float bendW = sin(uTime * 1.45 + phase) + sin(uTime * 0.92 + phase * 1.7) * 0.55;
      float gust = sin(uTime * 0.31 + base.x * 0.0016 + base.z * 0.0011);
      float bend = (bendW * 1.5 + gust * 2.2) * vHeight * vHeight;
      transformed.x += bend;
      transformed.z += bend * 0.6;
      transformed = (instanceMatrix * vec4(transformed, 1.0)).xyz;
    #endif

    vec4 mvPosition = viewMatrix * vec4(transformed, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const fragmentShader = /* glsl */ `
  #include <fog_pars_fragment>

  uniform vec3 uRootColor;
  uniform vec3 uTipColor;
  varying float vHeight;
  varying vec3 vTint;

  void main() {
    // Dark at the root (self-shadowed turf), bright at the sunlit tip
    vec3 color = mix(uRootColor, uTipColor, pow(vHeight, 0.85));
    color *= vTint;
    gl_FragColor = vec4(color, 1.0);
    #include <fog_fragment>
  }
`;

export type GrassOptions = {
  seed?: number;
  count?: number;
  /** Center and radius of the bladed region (the story heartland). */
  center?: THREE.Vector2;
  radius?: number;
};

export const createGrassField = ({
  seed = 0x9a55,
  count = 105000,
  center = new THREE.Vector2(250, 650),
  radius = 3000,
}: GrassOptions = {}): GrassField => {
  const rng = createRng(seed);
  const geometry = createBladeGeometry();

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: windTime,
      uRootColor: { value: new THREE.Color("#3f7a3e") },
      uTipColor: { value: new THREE.Color("#a9d878") },
      ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
    },
    vertexShader,
    fragmentShader,
    side: THREE.DoubleSide,
    fog: true,
  });

  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);
  mesh.frustumCulled = false;
  mesh.name = "grass-field";

  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();
  const fresh = new THREE.Color("#ffffff");
  const dry = new THREE.Color("#d8c890");

  let placed = 0;
  let attempts = 0;
  const maxAttempts = count * 6;

  while (placed < count && attempts < maxAttempts) {
    attempts += 1;
    const angle = rng() * Math.PI * 2;
    const r = Math.sqrt(rng()) * radius;
    const x = center.x + Math.cos(angle) * r;
    const z = center.y + Math.sin(angle) * r;

    const y = heightAt(x, z);
    if (y < 24 || y > 460) continue; // meadow band only
    if (slopeAt(x, z) > 0.8) continue;
    if (Math.hypot(x - POND_CENTER.x, z - POND_CENTER.y) < 500) continue; // shore sand
    if (!isFree(x, z, 2)) continue; // not inside buildings or bridges

    dummy.position.set(x, y - 0.5, z);
    dummy.rotation.set((rng() - 0.5) * 0.22, rng() * Math.PI * 2, (rng() - 0.5) * 0.22);
    const s = 0.65 + rng() * 1.05;
    dummy.scale.set(s * (0.85 + rng() * 0.5), s, s);
    dummy.updateMatrix();
    mesh.setMatrixAt(placed, dummy.matrix);

    // Mostly fresh green, the odd sun-dried blade
    tint.copy(fresh).lerp(dry, rng() < 0.12 ? 0.4 + rng() * 0.5 : rng() * 0.14);
    // Slight hue variance so the field ripples with tone
    tint.offsetHSL((rng() - 0.5) * 0.03, 0, (rng() - 0.5) * 0.08);
    mesh.setColorAt(placed, tint);

    placed += 1;
  }

  mesh.count = placed;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

  return {
    mesh,
    dispose: () => {
      geometry.dispose();
      material.dispose();
      mesh.removeFromParent();
    },
  };
};
