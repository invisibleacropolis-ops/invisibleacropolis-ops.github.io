import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

import { createRng } from "./random.ts";
import { WORLD_PALETTE } from "./palette.ts";

export type WaterOptions = {
  seed: number;
  width: number;
  depth: number;
  segments?: number;
  /**
   * Vertex shader wave height (world units).
   */
  amplitude?: number;
  /**
   * Speed multiplier for the sine wave phase advance.
   */
  speed?: number;
  /**
   * Base tint for emissive-like water color.
   */
  tint?: string;
  /**
   * Vertical offset above the terrain surface.
   */
  elevation?: number;
  riverCount?: number;
  riverWidth?: number;
  palette?: string[];
  heightAt?: (x: number, z: number) => number;
};

const vertexShader = `
  uniform float time;
  uniform float amplitude;
  uniform float speed;
  varying vec2 vUv;

  void main() {
    vUv = uv;
    vec3 pos = position;
    float waveA = sin((pos.x + time * speed) * 1.4) * 0.6;
    float waveB = sin((pos.z - time * speed * 0.8) * 1.9) * 0.4;
    pos.y += (waveA + waveB) * amplitude;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

const fragmentShader = `
  uniform vec3 tint;
  varying vec2 vUv;

  void main() {
    float shimmer = 0.25 + 0.75 * sin((vUv.x + vUv.y) * 6.2831);
    vec3 color = tint * (1.1 + shimmer * 0.15);
    gl_FragColor = vec4(color, 0.6);
  }
`;

const createRiverCurve = (
  rng: () => number,
  width: number,
  depth: number,
  heightAt?: (x: number, z: number) => number,
  elevation = 0.12,
) => {
  const controlPoints: THREE.Vector3[] = [];
  const segments = 6 + Math.floor(rng() * 4);
  const startX = (rng() - 0.5) * width * 0.8;
  const startZ = (rng() - 0.5) * depth * 0.8;

  for (let i = 0; i < segments; i += 1) {
    const t = i / (segments - 1);
    const x = startX + (rng() - 0.5) * width * 0.5 + (t - 0.5) * width * 0.7;
    const z = startZ + (rng() - 0.5) * depth * 0.5 + (t - 0.5) * depth * 0.7;
    const y = (heightAt ? heightAt(x, z) : 0) + elevation;
    controlPoints.push(new THREE.Vector3(x, y, z));
  }

  return new THREE.CatmullRomCurve3(controlPoints, false, "catmullrom", 0.35);
};

const createRiverStripGeometry = (curve: THREE.CatmullRomCurve3, width: number, segments = 90) => {
  const positions: number[] = [];
  const indices: number[] = [];
  const up = new THREE.Vector3(0, 1, 0);

  for (let i = 0; i <= segments; i += 1) {
    const t = i / segments;
    const point = curve.getPoint(t);
    const tangent = curve.getTangent(t).normalize();
    const normal = new THREE.Vector3().crossVectors(up, tangent).normalize();
    const left = point.clone().addScaledVector(normal, width * 0.5);
    const right = point.clone().addScaledVector(normal, -width * 0.5);
    positions.push(left.x, left.y, left.z, right.x, right.y, right.z);
  }

  for (let i = 0; i < segments; i += 1) {
    const a = i * 2;
    const b = a + 1;
    const c = a + 2;
    const d = a + 3;
    indices.push(a, b, c, b, d, c);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  return geometry;
};

export const createWater = ({
  seed,
  width,
  depth,
  segments = 24,
  amplitude = 0.15,
  speed = 0.8,
  tint = WORLD_PALETTE[0],
  elevation = 0.1,
  riverCount = 3,
  riverWidth = 0.18,
  palette = WORLD_PALETTE,
  heightAt,
}: WaterOptions) => {
  const geometry = new THREE.PlaneGeometry(width, depth, segments, segments);
  geometry.rotateX(-Math.PI / 2);

  const uniforms = {
    time: { value: 0 },
    amplitude: { value: amplitude },
    speed: { value: speed },
    tint: { value: new THREE.Color(tint) },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    transparent: true,
    side: THREE.DoubleSide,
  });
  material.depthWrite = false;
  material.toneMapped = false;

  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = elevation;

  const riverGroup = new THREE.Group();
  const rng = createRng(seed ^ 0x51a9);
  const riverColor = new THREE.Color(tint).lerp(new THREE.Color(palette[3]), 0.35).multiplyScalar(1.4);
  const riverGeometries: THREE.BufferGeometry[] = [];

  for (let i = 0; i < riverCount; i += 1) {
    const curve = createRiverCurve(rng, width, depth, heightAt, elevation + 0.05);
    const strip = createRiverStripGeometry(curve, riverWidth);
    riverGeometries.push(strip);
  }

  if (riverGeometries.length > 0) {
    const riverMaterial = new THREE.MeshBasicMaterial({
      color: riverColor,
      wireframe: true,
      transparent: true,
      opacity: 0.75,
      side: THREE.DoubleSide,
    });
    riverMaterial.toneMapped = false;

    const mergedGeometry =
      riverGeometries.length === 1 ? riverGeometries[0] : mergeGeometries(riverGeometries, false);
    if (mergedGeometry) {
      const riverMesh = new THREE.Mesh(mergedGeometry, riverMaterial);
      riverGroup.add(riverMesh);
    }
  }

  const update = (time: number) => {
    uniforms.time.value = time;
  };

  return {
    mesh,
    rivers: riverGroup,
    update,
  };
};
