import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";

import { createRng } from "./random.ts";
import { WORLD_PALETTE } from "./palette.ts";

export type RoadsOptions = {
  seed: number;
  width: number;
  depth: number;
  count?: number;
  elevation?: number;
  palette?: string[];
  heightAt?: (x: number, z: number) => number;
};

const createRoadCurve = (
  rng: () => number,
  width: number,
  depth: number,
  heightAt?: (x: number, z: number) => number,
  elevation = 0.2,
) => {
  const controlPoints: THREE.Vector3[] = [];
  const segments = 5 + Math.floor(rng() * 3);
  const startX = (rng() - 0.5) * width;
  const startZ = (rng() - 0.5) * depth;

  for (let i = 0; i < segments; i += 1) {
    const t = i / (segments - 1);
    const x = startX + (rng() - 0.5) * width * 0.6 + (t - 0.5) * width * 0.6;
    const z = startZ + (rng() - 0.5) * depth * 0.6 + (t - 0.5) * depth * 0.6;
    const y = (heightAt ? heightAt(x, z) : 0) + elevation;
    controlPoints.push(new THREE.Vector3(x, y, z));
  }

  return new THREE.CatmullRomCurve3(controlPoints, false, "catmullrom", 0.25);
};

export const createRoads = ({
  seed,
  width,
  depth,
  count = 3,
  elevation = 0.2,
  palette = WORLD_PALETTE,
  heightAt,
}: RoadsOptions) => {
  const rng = createRng(seed ^ 0x7d3f);
  const positions: number[] = [];

  for (let i = 0; i < count; i += 1) {
    const curve = createRoadCurve(rng, width, depth, heightAt, elevation);
    const points = curve.getPoints(60);

    for (let j = 0; j < points.length - 1; j += 1) {
      const a = points[j];
      const b = points[j + 1];
      positions.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));

  const material = new THREE.LineBasicMaterial({
    color: palette[1],
    transparent: true,
    opacity: 0.85,
  });

  return new THREE.LineSegments(geometry, material);
};
