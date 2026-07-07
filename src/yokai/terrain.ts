import * as THREE from "three";
import { fbm2D } from "../scene/noise.ts";
import { KAKURIYO, getToonGradient } from "./palette.ts";
import { grassTexture } from "./textures.ts";

/**
 * The valley floor of Kakuriyo: lush rolling hills built from smooth fbm,
 * with two sculpted features — a flattened plateau where the shrine stands,
 * and a still basin where the waterfall gathers into the spirit pond.
 */

export const WORLD_SIZE = 7000;
export const TEMPLE_CENTER = new THREE.Vector2(700, 350);
export const TEMPLE_PLATEAU_HEIGHT = 150;
export const POND_CENTER = new THREE.Vector2(-950, 950);
export const POND_FLOOR = 4;
export const WATER_LEVEL = 16;
export const CASTLE_CENTER = new THREE.Vector2(2050, -1350);
export const CASTLE_PLATEAU_HEIGHT = 290;
export const VILLAGE_CENTER = new THREE.Vector2(-450, 2350);
export const VILLAGE_HEIGHT = 70;

const HEIGHT_SEED = 6120;

const smooth = (t: number) => t * t * (3 - 2 * t);

const blendTo = (value: number, target: number, dist: number, inner: number, outer: number) => {
  if (dist >= outer) return value;
  if (dist <= inner) return target;
  const t = smooth((dist - inner) / (outer - inner));
  return target + (value - target) * t;
};

export const heightAt = (x: number, z: number): number => {
  const freq = 2.2 / WORLD_SIZE;
  const rolling = fbm2D(x * freq, z * freq, HEIGHT_SEED, 4) * 340;
  const swell = fbm2D(x * freq * 0.35 + 7.7, z * freq * 0.35, HEIGHT_SEED + 99, 3) * 220;
  let h = rolling + swell - 120;

  // Land rises gently toward the world rim so the valley feels held
  const rim = Math.hypot(x, z) / (WORLD_SIZE * 0.5);
  h += smooth(Math.min(1, Math.max(0, rim - 0.55) / 0.45)) * 260;

  // Shrine plateau
  const templeDist = Math.hypot(x - TEMPLE_CENTER.x, z - TEMPLE_CENTER.y);
  h = blendTo(h, TEMPLE_PLATEAU_HEIGHT, templeDist, 420, 900);

  // Spirit pond basin
  const pondDist = Math.hypot(x - POND_CENTER.x, z - POND_CENTER.y);
  h = blendTo(h, POND_FLOOR, pondDist, 380, 780);

  // Castle hill — a proud flat crown for the tenshu
  const castleDist = Math.hypot(x - CASTLE_CENTER.x, z - CASTLE_CENTER.y);
  h = blendTo(h, CASTLE_PLATEAU_HEIGHT, castleDist, 380, 1050);

  // The farm hamlet's gentle shelf
  const villageDist = Math.hypot(x - VILLAGE_CENTER.x, z - VILLAGE_CENTER.y);
  h = blendTo(h, VILLAGE_HEIGHT, villageDist, 420, 900);

  return h;
};

export const slopeAt = (x: number, z: number): number => {
  const e = 6;
  const dx = (heightAt(x + e, z) - heightAt(x - e, z)) / (2 * e);
  const dz = (heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e);
  return Math.hypot(dx, dz);
};

export const createTerrain = (): THREE.Mesh => {
  const segments = 190;
  const geometry = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, segments, segments);
  geometry.rotateX(-Math.PI / 2);

  const positions = geometry.getAttribute("position") as THREE.BufferAttribute;
  const colors = new Float32Array(positions.count * 3);

  const meadow = new THREE.Color(KAKURIYO.meadow);
  const hillside = new THREE.Color(KAKURIYO.hillside);
  const forest = new THREE.Color(KAKURIYO.forestFloor);
  const cliff = new THREE.Color(KAKURIYO.cliff);
  const sand = new THREE.Color(KAKURIYO.sand);
  const tint = new THREE.Color();

  for (let i = 0; i < positions.count; i += 1) {
    const x = positions.getX(i);
    const z = positions.getZ(i);
    const h = heightAt(x, z);
    positions.setY(i, h);

    const slope = slopeAt(x, z);
    const pondDist = Math.hypot(x - POND_CENTER.x, z - POND_CENTER.y);

    if (pondDist < 470) {
      tint.copy(sand); // shoreline
    } else if (slope > 0.75) {
      tint.copy(cliff);
    } else if (h > 320) {
      tint.copy(forest).lerp(cliff, Math.min(1, (h - 320) / 260));
    } else {
      // Meadow in the sun, deeper green on the shaded rises
      tint.copy(meadow).lerp(hillside, Math.min(1, Math.max(0, (h - 40) / 260) + slope * 0.7));
    }

    // Painterly variation so the grass isn't a flat fill
    const wobble = fbm2D(x * 0.004 + 31, z * 0.004, 777, 3);
    tint.offsetHSL(0, 0, (wobble - 0.5) * 0.06);

    colors[i * 3] = tint.r;
    colors[i * 3 + 1] = tint.g;
    colors[i * 3 + 2] = tint.b;
  }

  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();

  const material = new THREE.MeshToonMaterial({
    vertexColors: true,
    gradientMap: getToonGradient(),
    // A soft mottle multiplied over the vertex colors: grass, not paint fill
    map: grassTexture(),
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "kakuriyo-terrain";
  return mesh;
};
