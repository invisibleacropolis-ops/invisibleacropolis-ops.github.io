import * as THREE from "three";

import { sampleRealisticTerrain, getTerrainType } from "./noise.ts";
import { WORLD_PALETTE } from "./palette.ts";

export type TerrainOptions = {
  seed: number;
  width?: number;
  depth?: number;
  segments?: number;
  height?: number;
  palette?: string[];
};

const createTerrainGeometry = (
  width: number,
  depth: number,
  segments: number,
  seed: number,
  height: number,
  worldSize: number,
) => {
  const geometry = new THREE.PlaneGeometry(width, depth, segments, segments);
  geometry.rotateX(-Math.PI / 2);

  const position = geometry.attributes.position;

  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const z = position.getZ(i);
    const terrainHeight = sampleRealisticTerrain(x, z, seed, height, worldSize);
    position.setY(i, terrainHeight);
  }

  position.needsUpdate = true;
  geometry.computeVertexNormals();

  return geometry;
};

export const createTerrainMesh = ({
  seed,
  width = 14000,
  depth = 14000,
  segments = 200,
  height = 800,
  palette = WORLD_PALETTE,
}: TerrainOptions) => {
  const worldSize = Math.max(width, depth);

  const material = new THREE.MeshBasicMaterial({
    color: palette[0],
    wireframe: true,
    transparent: true,
    opacity: 0.9,
  });

  // Create LOD levels with different detail
  const highGeometry = createTerrainGeometry(width, depth, segments, seed, height, worldSize);
  const midSegments = Math.max(50, Math.round(segments * 0.5));
  const lowSegments = Math.max(25, Math.round(segments * 0.25));
  const midGeometry = createTerrainGeometry(width, depth, midSegments, seed, height, worldSize);
  const lowGeometry = createTerrainGeometry(width, depth, lowSegments, seed, height, worldSize);

  const mesh = new THREE.LOD();
  // Use progressively lower detail at farther distances
  mesh.addLevel(new THREE.Mesh(highGeometry, material), 0);
  mesh.addLevel(new THREE.Mesh(midGeometry, material), width * 0.3);
  mesh.addLevel(new THREE.Mesh(lowGeometry, material), width * 0.6);

  const heightAt = (x: number, z: number) => {
    return sampleRealisticTerrain(x, z, seed, height, worldSize);
  };

  const terrainTypeAt = (x: number, z: number) => {
    return getTerrainType(x, z, seed, worldSize);
  };

  return {
    mesh,
    width,
    depth,
    segments,
    height,
    heightAt,
    terrainTypeAt,
    worldSize,
  };
};
