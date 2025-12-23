import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";

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

export const createValleyMesh = ({
  seed,
  width,
  depth,
  segments,
  height,
  palette = WORLD_PALETTE,
}: ValleyMeshOptions) => {
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

  const material = new THREE.MeshBasicMaterial({
    color: palette[2],
    wireframe: true,
    transparent: true,
    opacity: 0.55,
  });

  return new THREE.Mesh(geometry, material);
};
