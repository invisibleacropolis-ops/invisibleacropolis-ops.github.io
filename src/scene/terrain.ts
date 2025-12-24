import * as THREE from "three";

import { fbm2D } from "./noise.ts";
import { WORLD_PALETTE } from "./palette.ts";
import { createValleyField } from "./valleys.ts";

export type TerrainOptions = {
  seed: number;
  width?: number;
  depth?: number;
  segments?: number;
  height?: number;
  palette?: string[];
};

const sampleTerrainHeight = (x: number, z: number, seed: number, height: number) => {
  const base = fbm2D(x * 0.35, z * 0.35, seed, 4, 2, 0.55);
  const detail = fbm2D(x * 0.9, z * 0.9, seed + 17, 3, 2.4, 0.4);
  return (base * 0.75 + detail * 0.35) * height;
};

const createTerrainGeometry = (width: number, depth: number, segments: number, seed: number, height: number) => {
  const geometry = new THREE.PlaneGeometry(width, depth, segments, segments);
  geometry.rotateX(-Math.PI / 2);

  const valleyField = createValleyField(seed, 4);
  const position = geometry.attributes.position;

  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const z = position.getZ(i);
    const terrainHeight = sampleTerrainHeight(x, z, seed, height);
    const valleyDepth = valleyField(x, z) * height * 1.1;
    position.setY(i, terrainHeight - valleyDepth);
  }

  position.needsUpdate = true;
  geometry.computeVertexNormals();

  return geometry;
};

export const createTerrainMesh = ({
  seed,
  width = 12,
  depth = 12,
  segments = 32,
  height = 2,
  palette = WORLD_PALETTE,
}: TerrainOptions) => {
  const material = new THREE.MeshBasicMaterial({
    color: palette[0],
    wireframe: true,
    transparent: true,
    opacity: 0.9,
  });

  const valleyField = createValleyField(seed, 4);
  const highGeometry = createTerrainGeometry(width, depth, segments, seed, height);
  const midSegments = Math.max(10, Math.round(segments * 0.55));
  const lowSegments = Math.max(6, Math.round(segments * 0.3));
  const midGeometry = createTerrainGeometry(width, depth, midSegments, seed, height);
  const lowGeometry = createTerrainGeometry(width, depth, lowSegments, seed, height);

  const mesh = new THREE.LOD();
  // Use progressively lower detail at farther distances to reduce fragment and vertex load.
  mesh.addLevel(new THREE.Mesh(highGeometry, material), 0);
  mesh.addLevel(new THREE.Mesh(midGeometry, material), width * 1.1);
  mesh.addLevel(new THREE.Mesh(lowGeometry, material), width * 2.2);

  const heightAt = (x: number, z: number) => {
    const terrainHeight = sampleTerrainHeight(x, z, seed, height);
    const valleyDepth = valleyField(x, z) * height * 1.1;
    return terrainHeight - valleyDepth;
  };

  return {
    mesh,
    width,
    depth,
    segments,
    height,
    heightAt,
  };
};
