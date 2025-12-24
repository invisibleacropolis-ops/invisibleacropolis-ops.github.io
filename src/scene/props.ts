import * as THREE from "three";

import { createRng } from "./random.ts";
import { fbm2D } from "./noise.ts";
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

type TreeType = "pine" | "oak" | "birch" | "shrub";

type TreeSample = PropSample & {
  type: TreeType;
  scale: number;
  rotation: number;
};

type RockSample = PropSample & {
  scale: number;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
  rotX: number;
  rotY: number;
  rotZ: number;
};

const sampleSlope = (x: number, z: number, heightAt: (x: number, z: number) => number) => {
  const offset = 0.5;
  const hL = heightAt(x - offset, z);
  const hR = heightAt(x + offset, z);
  const hD = heightAt(x, z - offset);
  const hU = heightAt(x, z + offset);
  const dx = (hR - hL) / (2 * offset);
  const dz = (hU - hD) / (2 * offset);
  return Math.sqrt(dx * dx + dz * dz);
};

// Generate forest cluster centers using Poisson-like distribution
const generateClusterCenters = (
  rng: () => number,
  width: number,
  depth: number,
  count: number,
  minDistance: number,
) => {
  const centers: { x: number; z: number; radius: number }[] = [];
  const maxAttempts = count * 20;

  for (let attempt = 0; attempt < maxAttempts && centers.length < count; attempt++) {
    const x = (rng() - 0.5) * width * 0.9;
    const z = (rng() - 0.5) * depth * 0.9;

    // Check distance from existing centers
    let tooClose = false;
    for (const center of centers) {
      const dist = Math.sqrt((x - center.x) ** 2 + (z - center.z) ** 2);
      if (dist < minDistance) {
        tooClose = true;
        break;
      }
    }

    if (!tooClose) {
      centers.push({
        x,
        z,
        radius: 8 + rng() * 15  // Forest radius 8-23 units
      });
    }
  }

  return centers;
};

// Sample trees with naturalistic clustering
const sampleTrees = (
  rng: () => number,
  width: number,
  depth: number,
  heightAt: (x: number, z: number) => number,
  seed: number,
): TreeSample[] => {
  const samples: TreeSample[] = [];

  // Forest clusters (60% of trees)
  const forestCenters = generateClusterCenters(rng, width, depth, 12, 20);

  for (const center of forestCenters) {
    const treesInForest = Math.floor(15 + rng() * 25);

    for (let i = 0; i < treesInForest; i++) {
      // Random position within cluster with falloff
      const angle = rng() * Math.PI * 2;
      const distance = rng() * rng() * center.radius; // Squared for density falloff

      const x = center.x + Math.cos(angle) * distance;
      const z = center.z + Math.sin(angle) * distance;

      // Skip if outside bounds
      if (Math.abs(x) > width * 0.45 || Math.abs(z) > depth * 0.45) continue;

      const y = heightAt(x, z);
      const slope = sampleSlope(x, z, heightAt);

      // Skip if too steep or below water level
      if (slope > 0.6 || y < 0.5) continue;

      // Determine tree type based on cluster and position
      const typeRoll = rng();
      let type: TreeType;
      if (typeRoll < 0.5) type = "pine";
      else if (typeRoll < 0.75) type = "oak";
      else if (typeRoll < 0.9) type = "birch";
      else type = "shrub";

      samples.push({
        x, y, z, slope,
        type,
        scale: 0.7 + rng() * 0.6, // 0.7 - 1.3x scale
        rotation: rng() * Math.PI * 2,
      });
    }
  }

  // Small groups (25% of trees)
  const groupCount = Math.floor(width * depth * 0.002);
  for (let g = 0; g < groupCount; g++) {
    const cx = (rng() - 0.5) * width * 0.85;
    const cz = (rng() - 0.5) * depth * 0.85;
    const groupSize = 3 + Math.floor(rng() * 6); // 3-8 trees
    const groupType = ["pine", "oak", "birch", "shrub"][Math.floor(rng() * 4)] as TreeType;

    for (let i = 0; i < groupSize; i++) {
      const x = cx + (rng() - 0.5) * 4;
      const z = cz + (rng() - 0.5) * 4;
      const y = heightAt(x, z);
      const slope = sampleSlope(x, z, heightAt);

      if (slope > 0.55 || y < 0.3) continue;

      samples.push({
        x, y, z, slope,
        type: groupType,
        scale: 0.65 + rng() * 0.7,
        rotation: rng() * Math.PI * 2,
      });
    }
  }

  // Single isolated trees (15%)
  const singleCount = Math.floor(width * depth * 0.003);
  for (let i = 0; i < singleCount; i++) {
    const x = (rng() - 0.5) * width * 0.9;
    const z = (rng() - 0.5) * depth * 0.9;
    const y = heightAt(x, z);
    const slope = sampleSlope(x, z, heightAt);

    if (slope > 0.5 || y < 0.2) continue;

    const type = ["pine", "oak", "birch", "shrub"][Math.floor(rng() * 4)] as TreeType;

    samples.push({
      x, y, z, slope,
      type,
      scale: 0.8 + rng() * 0.5, // Singles tend to be larger
      rotation: rng() * Math.PI * 2,
    });
  }

  return samples;
};

// Sample rocks in clusters
const sampleRocks = (
  rng: () => number,
  width: number,
  depth: number,
  heightAt: (x: number, z: number) => number,
): RockSample[] => {
  const samples: RockSample[] = [];

  // Much fewer rock clusters
  const clusterCount = Math.floor(width * depth * 0.0004);

  for (let c = 0; c < clusterCount; c++) {
    const cx = (rng() - 0.5) * width * 0.9;
    const cz = (rng() - 0.5) * depth * 0.9;
    const cy = heightAt(cx, cz);
    const slope = sampleSlope(cx, cz, heightAt);

    // Prefer rocky areas on slopes or mountains
    if (slope < 0.2 && cy < 8) {
      if (rng() > 0.3) continue; // Skip most flat, low areas
    }

    const rocksInCluster = 2 + Math.floor(rng() * 5); // 2-6 rocks per cluster

    for (let i = 0; i < rocksInCluster; i++) {
      const x = cx + (rng() - 0.5) * 3;
      const z = cz + (rng() - 0.5) * 3;
      const y = heightAt(x, z);

      if (y < -0.5) continue; // Skip underwater

      // Heavy randomization for rocks
      const baseScale = 0.3 + rng() * 1.7; // 0.3 - 2.0x

      samples.push({
        x, y, z,
        slope: sampleSlope(x, z, heightAt),
        scale: baseScale,
        scaleX: 0.5 + rng(), // 0.5 - 1.5
        scaleY: 0.5 + rng(),
        scaleZ: 0.5 + rng(),
        rotX: rng() * Math.PI,
        rotY: rng() * Math.PI * 2,
        rotZ: rng() * Math.PI,
      });
    }
  }

  return samples;
};

// Create tree geometries for each type
const createTreeGeometries = () => {
  return {
    pine: {
      trunk: new THREE.CylinderGeometry(0.04, 0.06, 1, 5, 1),
      canopy: new THREE.ConeGeometry(0.3, 1.2, 5, 1),
      canopyOffset: 0.5,
    },
    oak: {
      trunk: new THREE.CylinderGeometry(0.08, 0.12, 0.8, 5, 1),
      canopy: new THREE.IcosahedronGeometry(0.5, 1), // Round-ish
      canopyOffset: 0.4,
    },
    birch: {
      trunk: new THREE.CylinderGeometry(0.03, 0.04, 1.4, 4, 1),
      canopy: new THREE.ConeGeometry(0.2, 0.6, 4, 1),
      canopyOffset: 0.6,
    },
    shrub: {
      trunk: new THREE.CylinderGeometry(0.03, 0.05, 0.3, 4, 1),
      canopy: new THREE.SphereGeometry(0.35, 5, 4),
      canopyOffset: 0.15,
    },
  };
};

/**
 * Creates instanced vegetation/rock props with naturalistic distribution
 */
export const createProps = ({
  seed,
  width,
  depth,
  heightAt,
  palette = WORLD_PALETTE
}: PropsOptions) => {
  const rng = createRng(seed ^ 0x8a2f);
  const group = new THREE.Group();

  // Sample all props
  const treeSamples = sampleTrees(rng, width, depth, heightAt, seed);
  const rockSamples = sampleRocks(rng, width, depth, heightAt);

  // Group trees by type for instanced rendering
  const treesByType: Record<TreeType, TreeSample[]> = {
    pine: [],
    oak: [],
    birch: [],
    shrub: [],
  };

  for (const sample of treeSamples) {
    treesByType[sample.type].push(sample);
  }

  const treeGeoms = createTreeGeometries();
  const trunkMaterial = new THREE.MeshBasicMaterial({ color: "#a08060", wireframe: true });
  const canopyMaterial = new THREE.MeshBasicMaterial({ color: palette[3], wireframe: true });
  const rockMaterial = new THREE.MeshBasicMaterial({ color: palette[1], wireframe: true });

  const dummy = new THREE.Object3D();

  // Create instanced meshes for each tree type
  for (const [type, samples] of Object.entries(treesByType) as [TreeType, TreeSample[]][]) {
    if (samples.length === 0) continue;

    const geoms = treeGeoms[type];
    const trunks = new THREE.InstancedMesh(geoms.trunk, trunkMaterial, samples.length);
    const canopies = new THREE.InstancedMesh(geoms.canopy, canopyMaterial, samples.length);

    samples.forEach((sample, index) => {
      const scale = sample.scale;

      // Trunk
      dummy.position.set(sample.x, sample.y + 0.4 * scale, sample.z);
      dummy.rotation.set(0, sample.rotation, 0);
      dummy.scale.set(scale, scale, scale);
      dummy.updateMatrix();
      trunks.setMatrixAt(index, dummy.matrix);

      // Canopy
      dummy.position.set(
        sample.x,
        sample.y + (0.4 + geoms.canopyOffset) * scale + 0.3,
        sample.z
      );
      dummy.rotation.set(0, sample.rotation, 0);
      dummy.scale.set(scale, scale * 1.1, scale);
      dummy.updateMatrix();
      canopies.setMatrixAt(index, dummy.matrix);
    });

    trunks.instanceMatrix.needsUpdate = true;
    canopies.instanceMatrix.needsUpdate = true;
    trunks.frustumCulled = true;
    canopies.frustumCulled = true;

    group.add(trunks, canopies);
  }

  // Create rocks - simpler icosahedron (0 subdivisions = lowest poly)
  const rockGeometry = new THREE.IcosahedronGeometry(0.25, 0);
  const rocks = new THREE.InstancedMesh(rockGeometry, rockMaterial, rockSamples.length);

  rockSamples.forEach((sample, index) => {
    dummy.position.set(sample.x, sample.y + sample.scale * 0.1, sample.z);
    dummy.rotation.set(sample.rotX, sample.rotY, sample.rotZ);
    dummy.scale.set(
      sample.scale * sample.scaleX,
      sample.scale * sample.scaleY,
      sample.scale * sample.scaleZ
    );
    dummy.updateMatrix();
    rocks.setMatrixAt(index, dummy.matrix);
  });

  rocks.instanceMatrix.needsUpdate = true;
  rocks.frustumCulled = true;
  group.add(rocks);

  return group;
};
