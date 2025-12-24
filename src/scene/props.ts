import * as THREE from "three";

import { createRng } from "./random.ts";
import { WORLD_PALETTE } from "./palette.ts";

export type PropsConfig = {
  /** Overall multiplier for all props (0-2, default 1) */
  totalDensity: number;
  /** Tree density multiplier (0-2, default 1) */
  treeDensity: number;
  /** Rock density multiplier (0-2, default 1) */
  rockDensity: number;
  /** Clustering factor - higher = more grouped, lower = more spread (0.2-2, default 1) */
  clusteringFactor: number;
};

export type PropsOptions = {
  seed: number;
  width: number;
  depth: number;
  heightAt: (x: number, z: number) => number;
  palette?: string[];
  config?: Partial<PropsConfig>;
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

const DEFAULT_CONFIG: PropsConfig = {
  totalDensity: 1,
  treeDensity: 1,
  rockDensity: 1,
  clusteringFactor: 1,
};

const sampleSlope = (x: number, z: number, heightAt: (x: number, z: number) => number) => {
  const offset = 2;
  const hL = heightAt(x - offset, z);
  const hR = heightAt(x + offset, z);
  const hD = heightAt(x, z - offset);
  const hU = heightAt(x, z + offset);
  const dx = (hR - hL) / (2 * offset);
  const dz = (hU - hD) / (2 * offset);
  return Math.sqrt(dx * dx + dz * dz);
};

const generateClusterCenters = (
  rng: () => number,
  width: number,
  depth: number,
  count: number,
  minDistance: number,
) => {
  const centers: { x: number; z: number; radius: number }[] = [];
  const maxAttempts = count * 30;

  for (let attempt = 0; attempt < maxAttempts && centers.length < count; attempt++) {
    const x = (rng() - 0.5) * width * 0.85;
    const z = (rng() - 0.5) * depth * 0.85;

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
        radius: 80 + rng() * 150
      });
    }
  }

  return centers;
};

const sampleTrees = (
  rng: () => number,
  width: number,
  depth: number,
  heightAt: (x: number, z: number) => number,
  config: PropsConfig,
): TreeSample[] => {
  const samples: TreeSample[] = [];
  const density = config.totalDensity * config.treeDensity;
  const clustering = config.clusteringFactor;

  // Forest clusters - count scaled by density, spacing by clustering
  const forestCount = Math.round(15 * density);
  const forestSpacing = width * (0.1 / clustering);
  const forestCenters = generateClusterCenters(rng, width, depth, forestCount, forestSpacing);

  for (const center of forestCenters) {
    // Trees per forest scaled by density and clustering
    const treesInForest = Math.floor((24 + rng() * 22) * density * clustering);

    for (let i = 0; i < treesInForest; i++) {
      const angle = rng() * Math.PI * 2;
      // Spread controlled by clustering (higher = tighter)
      const distance = Math.sqrt(rng()) * center.radius / clustering;

      const x = center.x + Math.cos(angle) * distance;
      const z = center.z + Math.sin(angle) * distance;

      if (Math.abs(x) > width * 0.48 || Math.abs(z) > depth * 0.48) continue;

      const y = heightAt(x, z);
      const slope = sampleSlope(x, z, heightAt);

      if (slope > 0.5 || y < 5) continue;

      const typeRoll = rng();
      let type: TreeType;
      if (typeRoll < 0.4) type = "pine";
      else if (typeRoll < 0.7) type = "oak";
      else if (typeRoll < 0.9) type = "birch";
      else type = "shrub";

      samples.push({
        x, y, z, slope,
        type,
        scale: 0.8 + rng() * 0.5,
        rotation: rng() * Math.PI * 2,
      });
    }
  }

  // Small groups
  const groupCount = Math.round(9 * density);
  for (let g = 0; g < groupCount; g++) {
    const cx = (rng() - 0.5) * width * 0.7;
    const cz = (rng() - 0.5) * depth * 0.7;
    const groupSize = Math.floor((3 + rng() * 5) * clustering);
    const groupType = ["pine", "oak", "birch", "shrub"][Math.floor(rng() * 4)] as TreeType;

    for (let i = 0; i < groupSize; i++) {
      const spread = 30 / clustering;
      const x = cx + (rng() - 0.5) * spread;
      const z = cz + (rng() - 0.5) * spread;
      const y = heightAt(x, z);
      const slope = sampleSlope(x, z, heightAt);

      if (slope > 0.5 || y < 3) continue;

      samples.push({
        x, y, z, slope,
        type: groupType,
        scale: 0.7 + rng() * 0.5,
        rotation: rng() * Math.PI * 2,
      });
    }
  }

  // Single trees (inversely affected by clustering)
  const singleCount = Math.round(18 * density / clustering);
  for (let i = 0; i < singleCount; i++) {
    const x = (rng() - 0.5) * width * 0.8;
    const z = (rng() - 0.5) * depth * 0.8;
    const y = heightAt(x, z);
    const slope = sampleSlope(x, z, heightAt);

    if (slope > 0.4 || y < 2) continue;

    const type = ["pine", "oak", "birch", "shrub"][Math.floor(rng() * 4)] as TreeType;

    samples.push({
      x, y, z, slope,
      type,
      scale: 1.0 + rng() * 0.4,
      rotation: rng() * Math.PI * 2,
    });
  }

  return samples;
};

const sampleRocks = (
  rng: () => number,
  width: number,
  depth: number,
  heightAt: (x: number, z: number) => number,
  config: PropsConfig,
): RockSample[] => {
  const samples: RockSample[] = [];
  const density = config.totalDensity * config.rockDensity;
  const clustering = config.clusteringFactor;

  const clusterCount = Math.round(12 * density);

  for (let c = 0; c < clusterCount; c++) {
    const cx = (rng() - 0.5) * width * 0.8;
    const cz = (rng() - 0.5) * depth * 0.8;
    const cy = heightAt(cx, cz);
    const slope = sampleSlope(cx, cz, heightAt);

    if (cy < 50 && slope < 0.2) {
      if (rng() > 0.4) continue;
    }

    const rocksInCluster = Math.floor((3 + rng() * 4) * clustering);

    for (let i = 0; i < rocksInCluster; i++) {
      const spread = 20 / clustering;
      const x = cx + (rng() - 0.5) * spread;
      const z = cz + (rng() - 0.5) * spread;
      const y = heightAt(x, z);

      if (y < 0) continue;

      const baseScale = 0.5 + rng() * 2.5;

      samples.push({
        x, y, z,
        slope: sampleSlope(x, z, heightAt),
        scale: baseScale,
        scaleX: 0.6 + rng() * 0.8,
        scaleY: 0.5 + rng() * 0.7,
        scaleZ: 0.6 + rng() * 0.8,
        rotX: rng() * Math.PI,
        rotY: rng() * Math.PI * 2,
        rotZ: rng() * Math.PI,
      });
    }
  }

  return samples;
};

const createTreeGeometries = () => {
  return {
    pine: {
      trunk: new THREE.CylinderGeometry(0.5, 0.8, 8, 4, 1),
      canopy: new THREE.ConeGeometry(3, 12, 4, 1),
      canopyOffset: 5,
    },
    oak: {
      trunk: new THREE.CylinderGeometry(1, 1.5, 6, 4, 1),
      canopy: new THREE.IcosahedronGeometry(5, 0),
      canopyOffset: 4,
    },
    birch: {
      trunk: new THREE.CylinderGeometry(0.3, 0.4, 12, 3, 1),
      canopy: new THREE.ConeGeometry(2, 6, 4, 1),
      canopyOffset: 6,
    },
    shrub: {
      trunk: new THREE.CylinderGeometry(0.2, 0.4, 2, 3, 1),
      canopy: new THREE.SphereGeometry(3, 4, 3),
      canopyOffset: 1,
    },
  };
};

const buildPropsGroup = (
  treeSamples: TreeSample[],
  rockSamples: RockSample[],
  palette: string[],
): THREE.Group => {
  const group = new THREE.Group();

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
  const trunkMaterial = new THREE.MeshBasicMaterial({ color: "#806040", wireframe: true });
  const canopyMaterial = new THREE.MeshBasicMaterial({ color: palette[3], wireframe: true });
  const rockMaterial = new THREE.MeshBasicMaterial({ color: palette[1], wireframe: true });

  const dummy = new THREE.Object3D();

  for (const [type, samples] of Object.entries(treesByType) as [TreeType, TreeSample[]][]) {
    if (samples.length === 0) continue;

    const geoms = treeGeoms[type];
    const trunks = new THREE.InstancedMesh(geoms.trunk, trunkMaterial, samples.length);
    const canopies = new THREE.InstancedMesh(geoms.canopy, canopyMaterial, samples.length);

    samples.forEach((sample, index) => {
      const scale = sample.scale;

      dummy.position.set(sample.x, sample.y + 3 * scale, sample.z);
      dummy.rotation.set(0, sample.rotation, 0);
      dummy.scale.set(scale, scale, scale);
      dummy.updateMatrix();
      trunks.setMatrixAt(index, dummy.matrix);

      dummy.position.set(sample.x, sample.y + (3 + geoms.canopyOffset) * scale, sample.z);
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

  const rockGeometry = new THREE.IcosahedronGeometry(2, 0);

  if (rockSamples.length > 0) {
    const rocks = new THREE.InstancedMesh(rockGeometry, rockMaterial, rockSamples.length);

    rockSamples.forEach((sample, index) => {
      dummy.position.set(sample.x, sample.y + sample.scale * 0.5, sample.z);
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
  }

  return group;
};

/**
 * Creates a props manager with configurable density and clustering
 */
export const createPropsManager = ({
  seed,
  width,
  depth,
  heightAt,
  palette = WORLD_PALETTE,
  config: initialConfig = {},
}: PropsOptions) => {
  const config: PropsConfig = { ...DEFAULT_CONFIG, ...initialConfig };
  let currentGroup: THREE.Group | null = null;

  const generate = () => {
    const rng = createRng(seed ^ 0x8a2f);
    const treeSamples = sampleTrees(rng, width, depth, heightAt, config);
    const rockSamples = sampleRocks(rng, width, depth, heightAt, config);
    return buildPropsGroup(treeSamples, rockSamples, palette);
  };

  currentGroup = generate();

  const regenerate = (parent: THREE.Object3D) => {
    if (currentGroup && currentGroup.parent) {
      currentGroup.parent.remove(currentGroup);
    }
    currentGroup = generate();
    parent.add(currentGroup);
    return currentGroup;
  };

  const getConfig = () => ({ ...config });

  const setConfig = (updates: Partial<PropsConfig>) => {
    Object.assign(config, updates);
  };

  return {
    group: currentGroup,
    config,
    regenerate,
    getConfig,
    setConfig,
  };
};

// Legacy function for backwards compatibility
export const createProps = (options: PropsOptions) => {
  return createPropsManager(options).group;
};
