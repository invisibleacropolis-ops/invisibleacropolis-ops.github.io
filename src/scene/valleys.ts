import * as THREE from "three";

import { createRng } from "./random.ts";
import { WORLD_PALETTE } from "./palette.ts";

export type ValleyBand = {
  angle: number;
  offset: number;
  width: number;
  depth: number;
};

export const createValleyBands = (seed: number, count = 3): ValleyBand[] => {
  const rng = createRng(seed ^ 0xa92f);
  const bands: ValleyBand[] = [];

  for (let i = 0; i < count; i += 1) {
    bands.push({
      angle: rng() * Math.PI,
      offset: (rng() - 0.5) * 6,
      width: 0.6 + rng() * 1.8,
      depth: 0.6 + rng() * 0.7,
    });
  }

  return bands;
};

export const createValleyField = (seed: number, count = 3) => {
  const bands = createValleyBands(seed, count);

  return (x: number, z: number) => {
    let depth = 0;

    for (const band of bands) {
      const nx = Math.cos(band.angle);
      const nz = Math.sin(band.angle);
      const distance = Math.abs(nx * x + nz * z + band.offset);
      const influence = Math.max(0, 1 - distance / band.width);
      depth = Math.max(depth, influence * band.depth);
    }

    return depth;
  };
};

export type ValleyMeshOptions = {
  seed: number;
  width: number;
  depth: number;
  segments: number;
  height: number;
  palette?: string[];
};

const createValleyGeometry = (
  width: number,
  depth: number,
  segments: number,
  seed: number,
  height: number,
) => {
  const geometry = new THREE.PlaneGeometry(width, depth, segments, segments);
  geometry.rotateX(-Math.PI / 2);

  const valleyField = createValleyField(seed, 4);
  const position = geometry.attributes.position;

  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const z = position.getZ(i);
    const valleyDepth = valleyField(x, z);
    position.setY(i, -valleyDepth * height);
  }

  position.needsUpdate = true;
  return geometry;
};

export const createValleyMesh = ({
  seed,
  width,
  depth,
  segments,
  height,
  palette = WORLD_PALETTE,
}: ValleyMeshOptions) => {
  const material = new THREE.MeshBasicMaterial({
    color: palette[2],
    wireframe: true,
    transparent: true,
    opacity: 0.55,
  });

  const highGeometry = createValleyGeometry(width, depth, segments, seed, height);
  const midSegments = Math.max(10, Math.round(segments * 0.55));
  const lowSegments = Math.max(6, Math.round(segments * 0.3));
  const midGeometry = createValleyGeometry(width, depth, midSegments, seed, height);
  const lowGeometry = createValleyGeometry(width, depth, lowSegments, seed, height);

  const mesh = new THREE.LOD();
  // LOD keeps distant valley wireframes light-weight while preserving nearby detail.
  mesh.addLevel(new THREE.Mesh(highGeometry, material), 0);
  mesh.addLevel(new THREE.Mesh(midGeometry, material), width * 1.1);
  mesh.addLevel(new THREE.Mesh(lowGeometry, material), width * 2.2);

  return mesh;
};
