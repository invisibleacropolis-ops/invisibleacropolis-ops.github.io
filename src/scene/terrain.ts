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
) => {
  const geometry = new THREE.PlaneGeometry(width, depth, segments, segments);
  geometry.rotateX(-Math.PI / 2);

  const position = geometry.attributes.position;

  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const z = position.getZ(i);
    const terrainHeight = sampleRealisticTerrain(x, z, seed, height);
    position.setY(i, terrainHeight);
  }

  position.needsUpdate = true;
  geometry.computeVertexNormals();

  return geometry;
};

export const createTerrainMesh = ({
  seed,
  width = 140,
  depth = 140,
  segments = 100,
  height = 30,
  palette = WORLD_PALETTE,
}: TerrainOptions) => {
  const material = new THREE.MeshBasicMaterial({
    color: palette[0],
    wireframe: true,
    transparent: true,
    opacity: 0.9,
  });

  const highGeometry = createTerrainGeometry(width, depth, segments, seed, height);
  const midSegments = Math.max(20, Math.round(segments * 0.5));
  const lowSegments = Math.max(10, Math.round(segments * 0.25));
  const midGeometry = createTerrainGeometry(width, depth, midSegments, seed, height);
  const lowGeometry = createTerrainGeometry(width, depth, lowSegments, seed, height);

  const mesh = new THREE.LOD();
  // Use progressively lower detail at farther distances
  mesh.addLevel(new THREE.Mesh(highGeometry, material), 0);
  mesh.addLevel(new THREE.Mesh(midGeometry, material), width * 0.6);
  mesh.addLevel(new THREE.Mesh(lowGeometry, material), width * 1.2);

  const heightAt = (x: number, z: number) => {
    return sampleRealisticTerrain(x, z, seed, height);
  };

  const terrainTypeAt = (x: number, z: number) => {
    return getTerrainType(x, z, seed);
  };

  return {
    mesh,
    width,
    depth,
    segments,
    height,
    heightAt,
    terrainTypeAt,
  };
};
