import * as THREE from "three";

import { createRng } from "./random.ts";
import { fbm2D } from "./noise.ts";
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

/**
 * Naturalistic tree distribution via a noise "forest mask".
 *
 * Instead of stamping circular clusters, a low-frequency fbm field defines
 * organic woodland regions with irregular coastline-like edges. Density
 * rises toward each forest's core, a second noise field carves glade
 * clearings, species follow elevation zones (oak valleys → mixed slopes →
 * pine highlands), and size grows from fringe saplings to core elders —
 * the same rules real forests follow.
 */
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

  // Candidate budget scales with world area; instancing keeps thousands cheap
  const candidates = Math.min(90000, Math.round((width * depth) / 4200 * density));

  const MASK_SEED = 4271;
  const GLADE_SEED = 9917;
  const SPECIES_SEED = 5531;
  const maskFreq = 2.6 / width;
  const gladeFreq = 9 / width;
  const speciesFreq = 5 / width;

  // Higher clustering = tighter, denser woods with sharper edges
  const threshold = 0.56 + (clustering - 1) * 0.06;

  for (let i = 0; i < candidates; i += 1) {
    const x = (rng() - 0.5) * width * 0.94;
    const z = (rng() - 0.5) * depth * 0.94;

    const mask = fbm2D(x * maskFreq, z * maskFreq, MASK_SEED, 4);
    // 0 at the forest edge → 1 deep in the core
    const forestness = (mask - threshold) / Math.max(0.12, 0.86 - threshold);

    let acceptP: number;
    let isLone = false;
    if (forestness <= 0) {
      // Rare lone sentinels out on the open plains
      acceptP = 0.012;
      isLone = true;
    } else {
      // Glades carve organic clearings inside the woods
      const glade = fbm2D(x * gladeFreq, z * gladeFreq, GLADE_SEED, 3);
      if (glade > 0.62 && forestness < 0.85) continue;
      acceptP = 0.25 + Math.min(1, forestness) * 0.75;
    }
    if (rng() > acceptP) continue;

    const y = heightAt(x, z);
    const slope = sampleSlope(x, z, heightAt);
    if (slope > 0.62 || y < 4) continue;

    // Species: elevation zones blended by a species-noise so groves mix
    const speciesNoise = fbm2D(x * speciesFreq, z * speciesFreq, SPECIES_SEED, 3);
    const altNorm = Math.min(1, y / 620);
    let type: TreeType;
    if (!isLone && forestness > 0 && forestness < 0.18) {
      type = rng() < 0.6 ? "shrub" : "birch"; // scrubby fringe
    } else if (altNorm > 0.55 + (speciesNoise - 0.5) * 0.3) {
      type = "pine"; // highlands
    } else if (altNorm < 0.22 + (speciesNoise - 0.5) * 0.2) {
      type = "oak"; // valley floors
    } else {
      type = speciesNoise > 0.55 ? "birch" : rng() < 0.5 ? "pine" : "oak";
    }

    // Elders in the deep core, saplings at the fringe, heavy-tailed spread.
    // The multiplier keys tree height to the 18000-unit world so forests
    // read as landscape features, not sub-pixel specks.
    const TREE_SCALE = 3.6;
    const core = THREE.MathUtils.clamp(forestness, 0, 1);
    const scale = (isLone
      ? 1.4 + rng() * 1.2 // lone trees read as landmarks
      : 0.45 + core * 0.9 + Math.pow(rng(), 1.6) * 1.35) * TREE_SCALE;

    samples.push({
      x, y, z, slope,
      type,
      scale,
      rotation: rng() * Math.PI * 2,
    });
  }

  return samples;
};

/**
 * Rocks follow geology instead of dice: steep slopes shed talus, a noise
 * field defines boulder-strewn badlands, and sizes are heavy-tailed —
 * plenty of stones, the occasional monolith, and rare standing stones.
 */
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

  const candidates = Math.min(24000, Math.round((width * depth) / 28000 * density));
  const FIELD_SEED = 7723;
  const fieldFreq = 4.5 / width;
  const fieldThreshold = 0.58 - (clustering - 1) * 0.04;

  for (let i = 0; i < candidates; i += 1) {
    const x = (rng() - 0.5) * width * 0.94;
    const z = (rng() - 0.5) * depth * 0.94;
    const y = heightAt(x, z);
    if (y < 1) continue;

    const slope = sampleSlope(x, z, heightAt);
    const field = fbm2D(x * fieldFreq, z * fieldFreq, FIELD_SEED, 3);

    // Talus loves steep ground; boulder fields follow the noise patches
    const talus = THREE.MathUtils.clamp((slope - 0.18) / 0.5, 0, 1);
    const fieldMask = Math.max(0, (field - fieldThreshold) / 0.28);
    const acceptP = Math.min(0.85, talus * 0.55 + fieldMask * 0.5);
    if (rng() > acceptP) continue;

    // Heavy-tailed sizes: pebbles common, monoliths rare (scaled to world)
    const baseScale = (0.5 + Math.pow(rng(), 2.6) * 6.5) * 2.8;

    // Occasionally a standing stone rises from a boulder field
    const isMenhir = fieldMask > 0.4 && rng() < 0.05;

    samples.push({
      x, y, z, slope,
      scale: baseScale,
      scaleX: isMenhir ? 0.35 + rng() * 0.2 : 0.6 + rng() * 0.9,
      scaleY: isMenhir ? 2.2 + rng() * 1.6 : 0.45 + rng() * 0.85,
      scaleZ: isMenhir ? 0.35 + rng() * 0.2 : 0.6 + rng() * 0.9,
      rotX: isMenhir ? (rng() - 0.5) * 0.2 : rng() * Math.PI,
      rotY: rng() * Math.PI * 2,
      rotZ: isMenhir ? (rng() - 0.5) * 0.2 : rng() * Math.PI,
    });
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

/**
 * Procedurally deformed rock geometry. Each variant starts from a subdivided
 * polyhedron and displaces every vertex radially by a hash of its position —
 * deterministic, so vertices shared between faces move together and the
 * mesh stays watertight while turning craggy and asymmetric. A baked squash
 * per variant adds slabs, eggs, and shards to the mix.
 */
const createRockGeometryVariants = (count: number): THREE.BufferGeometry[] => {
  const variants: THREE.BufferGeometry[] = [];

  const displacementFor = (x: number, y: number, z: number, seed: number) => {
    // Quantize so duplicated vertices hash identically despite float noise
    const qx = Math.round(x * 100);
    const qy = Math.round(y * 100);
    const qz = Math.round(z * 100);
    const s = Math.sin(qx * 12.9898 + qy * 78.233 + qz * 37.719 + seed * 917.331) * 43758.5453;
    return s - Math.floor(s);
  };

  for (let v = 0; v < count; v += 1) {
    const base =
      v % 2 === 0 ? new THREE.IcosahedronGeometry(2, 1) : new THREE.DodecahedronGeometry(2, 1);

    // Per-variant character: how craggy, and which way it's squashed
    const roughness = 0.35 + displacementFor(v, 7, 3, 11) * 0.5;
    const squashX = 0.75 + displacementFor(v, 1, 0, 23) * 0.55;
    const squashY = 0.6 + displacementFor(v, 2, 0, 31) * 0.7;
    const squashZ = 0.75 + displacementFor(v, 3, 0, 47) * 0.55;

    const positions = base.getAttribute("position") as THREE.BufferAttribute;
    const vertex = new THREE.Vector3();
    for (let i = 0; i < positions.count; i += 1) {
      vertex.fromBufferAttribute(positions, i);
      const n = displacementFor(vertex.x, vertex.y, vertex.z, v);
      const radial = 1 + (n - 0.5) * roughness;
      vertex.multiplyScalar(radial);
      positions.setXYZ(i, vertex.x * squashX, vertex.y * squashY, vertex.z * squashZ);
    }
    positions.needsUpdate = true;
    base.computeBoundingSphere();
    variants.push(base);
  }

  return variants;
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
  const trunkMaterial = new THREE.MeshBasicMaterial({ color: "#9a7a5a", wireframe: true });
  // Each species gets its own shade so groves read as texture, not repetition
  const canopyMaterials: Record<TreeType, THREE.MeshBasicMaterial> = {
    pine: new THREE.MeshBasicMaterial({ color: palette[3] ?? "#7cffc4", wireframe: true }),
    oak: new THREE.MeshBasicMaterial({ color: "#a3e86f", wireframe: true }),
    birch: new THREE.MeshBasicMaterial({ color: "#c9f2ff", wireframe: true }),
    shrub: new THREE.MeshBasicMaterial({ color: "#6fbf9a", wireframe: true }),
  };
  const rockMaterial = new THREE.MeshBasicMaterial({ color: "#8fa8d8", wireframe: true });

  const dummy = new THREE.Object3D();

  for (const [type, samples] of Object.entries(treesByType) as [TreeType, TreeSample[]][]) {
    if (samples.length === 0) continue;

    const geoms = treeGeoms[type];
    const trunks = new THREE.InstancedMesh(geoms.trunk, trunkMaterial, samples.length);
    const canopies = new THREE.InstancedMesh(geoms.canopy, canopyMaterials[type], samples.length);

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

  // Procedural craggy boulders: a pool of deformed variants, alternated,
  // so no two neighboring rocks share a silhouette
  const rockGeometries = createRockGeometryVariants(8);

  if (rockSamples.length > 0) {
    rockGeometries.forEach((rockGeometry, variant) => {
      const variantSamples = rockSamples.filter((_, i) => i % rockGeometries.length === variant);
      if (variantSamples.length === 0) return;

      const rocks = new THREE.InstancedMesh(rockGeometry, rockMaterial, variantSamples.length);

      variantSamples.forEach((sample, index) => {
        // Sit rocks into the ground a little so they read as bedded, not dropped
        dummy.position.set(sample.x, sample.y + sample.scale * sample.scaleY * 0.7, sample.z);
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
    });
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
