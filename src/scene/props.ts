import * as THREE from "three";

import { createRng } from "./random.ts";
import { WORLD_PALETTE } from "./palette.ts";

export type PropsOptions = {
  seed: number;
  width: number;
  depth: number;
  heightAt: (x: number, z: number) => number;
  palette?: string[];
};

type PropSample = {
  x: number;
  y: number;
  z: number;
  slope: number;
};

const sampleSlope = (x: number, z: number, heightAt: (x: number, z: number) => number) => {
  const offset = 0.2;
  const hL = heightAt(x - offset, z);
  const hR = heightAt(x + offset, z);
  const hD = heightAt(x, z - offset);
  const hU = heightAt(x, z + offset);
  const dx = (hR - hL) / (2 * offset);
  const dz = (hU - hD) / (2 * offset);
  return Math.sqrt(dx * dx + dz * dz);
};

const sampleProps = (
  rng: () => number,
  width: number,
  depth: number,
  heightAt: (x: number, z: number) => number,
  count: number,
  predicate: (sample: PropSample) => boolean,
) => {
  const samples: PropSample[] = [];
  const maxAttempts = count * 8;

  for (let attempt = 0; attempt < maxAttempts && samples.length < count; attempt += 1) {
    const x = (rng() - 0.5) * width;
    const z = (rng() - 0.5) * depth;
    const y = heightAt(x, z);
    const slope = sampleSlope(x, z, heightAt);

    if (predicate({ x, y, z, slope })) {
      samples.push({ x, y, z, slope });
    }
  }

  return samples;
};

/**
 * Creates instanced vegetation/rock props and distributes them by terrain height and slope.
 * The returned group can be added directly to the world scene.
 */
export const createProps = ({ seed, width, depth, heightAt, palette = WORLD_PALETTE }: PropsOptions) => {
  const rng = createRng(seed ^ 0x8a2f);
  const area = width * depth;
  const treeCount = Math.max(60, Math.floor(area * 0.55));
  const bushCount = Math.max(70, Math.floor(area * 0.7));
  const rockCount = Math.max(35, Math.floor(area * 0.25));

  const treeSamples = sampleProps(rng, width, depth, heightAt, treeCount, ({ y, slope }) => {
    return y > 0.1 && slope < 0.55;
  });

  const bushSamples = sampleProps(rng, width, depth, heightAt, bushCount, ({ y, slope }) => {
    return y > -0.15 && y < 1.5 && slope < 0.45;
  });

  const rockSamples = sampleProps(rng, width, depth, heightAt, rockCount, ({ y, slope }) => {
    return y > -0.1 && (slope > 0.45 || y > 1.4);
  });

  const group = new THREE.Group();

  const trunkGeometry = new THREE.CylinderGeometry(0.06, 0.08, 1, 6, 1);
  const canopyGeometry = new THREE.ConeGeometry(0.35, 0.9, 6, 1);
  const bushGeometry = new THREE.SphereGeometry(0.25, 7, 6);
  const rockGeometry = new THREE.IcosahedronGeometry(0.22, 0);

  const trunkMaterial = new THREE.MeshBasicMaterial({ color: "#b2936b", wireframe: true });
  const canopyMaterial = new THREE.MeshBasicMaterial({ color: palette[3], wireframe: true });
  const bushMaterial = new THREE.MeshBasicMaterial({ color: palette[2], wireframe: true });
  const rockMaterial = new THREE.MeshBasicMaterial({ color: palette[1], wireframe: true });

  const trunks = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, treeSamples.length);
  const canopies = new THREE.InstancedMesh(canopyGeometry, canopyMaterial, treeSamples.length);
  const bushes = new THREE.InstancedMesh(bushGeometry, bushMaterial, bushSamples.length);
  const rocks = new THREE.InstancedMesh(rockGeometry, rockMaterial, rockSamples.length);

  const dummy = new THREE.Object3D();

  treeSamples.forEach((sample, index) => {
    const trunkHeight = 0.3 + rng() * 0.25;
    const canopyHeight = 0.55 + rng() * 0.45;
    const canopyRadius = 0.3 + rng() * 0.2;
    const rotation = rng() * Math.PI * 2;

    dummy.position.set(sample.x, sample.y + trunkHeight * 0.5, sample.z);
    dummy.rotation.set(0, rotation, 0);
    dummy.scale.set(1, trunkHeight, 1);
    dummy.updateMatrix();
    trunks.setMatrixAt(index, dummy.matrix);

    dummy.position.set(sample.x, sample.y + trunkHeight + canopyHeight * 0.35, sample.z);
    dummy.rotation.set(0, rotation, 0);
    dummy.scale.set(canopyRadius, canopyHeight, canopyRadius);
    dummy.updateMatrix();
    canopies.setMatrixAt(index, dummy.matrix);
  });

  bushSamples.forEach((sample, index) => {
    const size = 0.4 + rng() * 0.35;
    dummy.position.set(sample.x, sample.y + size * 0.25, sample.z);
    dummy.rotation.set(0, rng() * Math.PI * 2, 0);
    dummy.scale.set(size, size * 0.7, size);
    dummy.updateMatrix();
    bushes.setMatrixAt(index, dummy.matrix);
  });

  rockSamples.forEach((sample, index) => {
    const size = 0.35 + rng() * 0.35;
    dummy.position.set(sample.x, sample.y + size * 0.25, sample.z);
    dummy.rotation.set(rng() * Math.PI, rng() * Math.PI, rng() * Math.PI);
    dummy.scale.set(size, size * 0.8, size);
    dummy.updateMatrix();
    rocks.setMatrixAt(index, dummy.matrix);
  });

  [trunks, canopies, bushes, rocks].forEach((mesh) => {
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = true;
    mesh.computeBoundingSphere();
  });

  group.add(trunks, canopies, bushes, rocks);
  return group;
};
