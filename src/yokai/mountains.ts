import * as THREE from "three";
import { createRng } from "../scene/random.ts";
import { fbm2D } from "../scene/noise.ts";
import { getToonGradient } from "./palette.ts";
import { WORLD_SIZE } from "./terrain.ts";
import { mountainTexture } from "./textures.ts";
import { createMountainShrine } from "./shrine.ts";
import { getWorldModel } from "./kamiModels.ts";

/**
 * The mountains of the hidden world: a sacred snow-capped peak presiding
 * over the valley, ringed by receding layers of ridgeline that dissolve
 * into the haze — the classic layered depth of a woodblock print.
 */

export const SACRED_PEAK = new THREE.Vector3(-2100, 0, -2700);

/**
 * A ledge on the sacred peak's valley-facing flank, where a small hokora
 * shrine keeps watch. Stories climb to it; the world simply has it.
 */
export const PEAK_LEDGE = new THREE.Vector3(-1494, 905, -1922);

/**
 * Shared peak material: one painted alpine texture mapped to the cone UVs
 * (the same texture-on-geometry approach the castle uses), cel-shaded by
 * the world's toon ramp. The texture repeats a few times around so its
 * detail stays crisp; it tiles horizontally, so the wrap-seam is invisible.
 * Per-mountain aerial-perspective tint rides on the vertex colors.
 */
let peakMaterial: THREE.MeshToonMaterial | null = null;
const getPeakMaterial = () => {
  if (!peakMaterial) {
    const map = mountainTexture();
    map.repeat.set(3, 1);
    peakMaterial = new THREE.MeshToonMaterial({
      map,
      vertexColors: true,
      gradientMap: getToonGradient(),
    });
    // The mountains already read as one soft mass; individual ink hull
    // outlines would just crawl over the texture.
    peakMaterial.userData.outlineParameters = { visible: false };
  }
  return peakMaterial;
};

type PeakOptions = {
  /** Aerial tint (multiplies the texture): near ≈ white, far ≈ cool haze. */
  tint: string;
  /** Overall ruggedness of the silhouette. */
  jag?: number;
  /** Mesh resolution: [radialSegments, heightSegments]. */
  detail?: [number, number];
  /** Deterministic character seed for this peak. */
  peakSeed?: number;
};

/**
 * A sculpted peak. Displacement is deterministic by position, so the
 * cone's wrap-around seam gets identical offsets on both sides and can
 * never crack open. Great buttress lobes divide the flanks into ridges
 * and gullies; fbm crags roughen the faces. The rock and snow read comes
 * from the mapped texture — the vertex colors carry only a gentle aerial
 * tint so distant peaks recede. UVs are left untouched by displacement.
 */
const sculptedPeak = (
  rng: () => number,
  radius: number,
  height: number,
  { tint, jag = 0.14, detail = [40, 18], peakSeed = 1 }: PeakOptions
): THREE.Mesh => {
  const geometry = new THREE.ConeGeometry(radius, height, detail[0], detail[1]);
  const positions = geometry.getAttribute("position") as THREE.BufferAttribute;
  const v = new THREE.Vector3();

  // Per-peak character (fixed at build, stable across the seam)
  const lobes = 4 + Math.floor(rng() * 4); // buttress count
  const lobePhase = rng() * Math.PI * 2;
  const noiseSeed = 7000 + Math.floor(peakSeed * 997);

  const reliefAt = (x: number, y: number, z: number): number => {
    const angle = Math.atan2(z, x);
    const h01 = THREE.MathUtils.clamp(y / height + 0.5, 0, 1);
    // Buttresses: strong mid-slope, dying toward apex and skirt
    const band = Math.sin(h01 * Math.PI);
    const buttress = Math.sin(angle * lobes + lobePhase) * 0.55 * band;
    // Crags: position-based fbm (seam-safe), ridged for sharp spurs
    const crag = (Math.abs(fbm2D(x * 0.004 + y * 0.0028, z * 0.004 - y * 0.0028, noiseSeed, 3) - 0.5) * 2 - 0.4)
      * 0.95 * band;
    return buttress + crag;
  };

  for (let i = 0; i < positions.count; i += 1) {
    v.fromBufferAttribute(positions, i);
    if (Math.abs(v.y) < height * 0.495 && v.x * v.x + v.z * v.z > 1) {
      const relief = reliefAt(v.x, v.y, v.z);
      const wobble = 1 + relief * jag;
      positions.setX(i, v.x * wobble);
      positions.setZ(i, v.z * wobble);
      positions.setY(i, v.y + relief * height * 0.014);
    }
  }

  // Vertex colors: a single aerial tint per mountain (fog does the rest)
  const tintColor = new THREE.Color(tint);
  const colors = new Float32Array(positions.count * 3);
  for (let i = 0; i < positions.count; i += 1) {
    colors[i * 3] = tintColor.r;
    colors[i * 3 + 1] = tintColor.g;
    colors[i * 3 + 2] = tintColor.b;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();

  return new THREE.Mesh(geometry, getPeakMaterial());
};

/* ── Sculpted ranges (tools/blender/mountains_build.py) ──────────────────
 * One eroded heightfield, cut into tiles named mtn_<row>_<col> on a fixed
 * grid. Vertex colours carry the painted snow, rock, turf and forest; custom
 * normals are softened so the cel ramp paints broad planes. */
const TILE_EXTENT = 6500;
const TILE_SIZE = (2 * TILE_EXTENT) / 1023 * 128;
const VALLEY_RADIUS = 3300;
const PEAK_RADIUS = 2050;
const CELL = (2 * TILE_EXTENT) / 1023;
const sculptedTiles = new Map<string, THREE.Mesh>();
type TileHeights = { x0: number; z0: number; nx: number; nz: number; data: Float32Array };
const tileHeights = new Map<string, TileHeights>();

/** Rasterise a tile's triangles onto a grid at the authoring resolution,
 * once, so ground queries are a bilinear lookup instead of a raycast. */
const rasterizeTile = (tile: THREE.Mesh): TileHeights => {
  const geometry = tile.geometry;
  const box = geometry.boundingBox!;
  const x0 = Math.floor(box.min.x / CELL) * CELL, z0 = Math.floor(box.min.z / CELL) * CELL;
  const nx = Math.ceil((box.max.x - x0) / CELL) + 2, nz = Math.ceil((box.max.z - z0) / CELL) + 2;
  const data = new Float32Array(nx * nz).fill(-Infinity);
  const pos = geometry.attributes.position;
  const index = geometry.index;
  const count = index ? index.count : pos.count;
  const vi = (k: number) => (index ? index.getX(k) : k);
  for (let k = 0; k < count; k += 3) {
    const a = vi(k), b = vi(k + 1), c = vi(k + 2);
    const ax = pos.getX(a), az = pos.getZ(a), ay = pos.getY(a);
    const bx = pos.getX(b), bz = pos.getZ(b), by = pos.getY(b);
    const cx = pos.getX(c), cz = pos.getZ(c), cy = pos.getY(c);
    const det = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
    if (Math.abs(det) < 1e-9) continue;
    const i0 = Math.max(0, Math.floor((Math.min(ax, bx, cx) - x0) / CELL));
    const i1 = Math.min(nx - 1, Math.ceil((Math.max(ax, bx, cx) - x0) / CELL));
    const j0 = Math.max(0, Math.floor((Math.min(az, bz, cz) - z0) / CELL));
    const j1 = Math.min(nz - 1, Math.ceil((Math.max(az, bz, cz) - z0) / CELL));
    for (let j = j0; j <= j1; j++) {
      const pz = z0 + j * CELL;
      for (let i = i0; i <= i1; i++) {
        const px = x0 + i * CELL;
        const wa = ((bz - cz) * (px - cx) + (cx - bx) * (pz - cz)) / det;
        const wb = ((cz - az) * (px - cx) + (ax - cx) * (pz - cz)) / det;
        const wc = 1 - wa - wb;
        if (wa < -1e-4 || wb < -1e-4 || wc < -1e-4) continue;
        const y = wa * ay + wb * by + wc * cy;
        if (y > data[j * nx + i]) data[j * nx + i] = y;
      }
    }
  }
  return { x0, z0, nx, nz, data };
};

// The procedural cone's shape, for when the sculpted ranges are not loaded.
const CONE_APEX_Y = 2280;
const CONE_BASE_Y = -220;
const CONE_RADIUS = 1750;

/**
 * Height of the mountain surface at (x, z), or -Infinity where there is no
 * mountain. Cheap outside the ranges; inside, a single tile is raycast.
 */
export const mountainSurfaceY = (x: number, z: number): number => {
  const peakDist = Math.hypot(x - SACRED_PEAK.x, z - SACRED_PEAK.z);
  if (sculptedTiles.size === 0) {
    if (peakDist >= CONE_RADIUS) return -Infinity;
    return CONE_APEX_Y - (peakDist / CONE_RADIUS) * (CONE_APEX_Y - CONE_BASE_Y);
  }
  if (Math.hypot(x, z) < VALLEY_RADIUS && peakDist > PEAK_RADIUS) return -Infinity;
  const key = `mtn_${Math.floor((z + TILE_EXTENT) / TILE_SIZE)}_${Math.floor((x + TILE_EXTENT) / TILE_SIZE)}`;
  let grid = tileHeights.get(key);
  if (!grid) {
    const tile = sculptedTiles.get(key);
    if (!tile) return -Infinity;
    grid = rasterizeTile(tile);
    tileHeights.set(key, grid);
  }
  const fx = (x - grid.x0) / CELL, fz = (z - grid.z0) / CELL;
  const i = Math.floor(fx), j = Math.floor(fz);
  if (i < 0 || j < 0 || i >= grid.nx - 1 || j >= grid.nz - 1) return -Infinity;
  const tx = fx - i, tz = fz - j, d = grid.data, n = grid.nx;
  const h00 = d[j * n + i], h10 = d[j * n + i + 1], h01 = d[(j + 1) * n + i], h11 = d[(j + 1) * n + i + 1];
  if (h00 === -Infinity || h10 === -Infinity || h01 === -Infinity || h11 === -Infinity) {
    return Math.max(h00, h10, h01, h11); // the ragged edge of the ranges
  }
  return (h00 * (1 - tx) + h10 * tx) * (1 - tz) + (h01 * (1 - tx) + h11 * tx) * tz;
};

const sculptedRanges = (source: THREE.Group): THREE.Group => {
  const group = new THREE.Group();
  group.name = "sculpted-ranges";
  const material = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: getToonGradient() });
  // The ranges read as soft painted masses; ink hulls would crawl over them.
  material.userData.outlineParameters = { visible: false };
  source.updateMatrixWorld(true);
  source.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const tile = new THREE.Mesh(object.geometry, material);
    tile.name = object.name;
    tile.applyMatrix4(object.matrixWorld);
    tile.geometry.computeBoundingBox();
    tile.geometry.computeBoundingSphere();
    tile.matrixAutoUpdate = false;
    tile.updateMatrix();
    tile.updateMatrixWorld(true);
    sculptedTiles.set(object.name, tile);
    group.add(tile);
  });
  // Tales climb the sacred peak: build its ground grids up front so the
  // first step onto the mountain never hitches.
  const peakBox = new THREE.Box3(
    new THREE.Vector3(SACRED_PEAK.x - PEAK_RADIUS, -Infinity, SACRED_PEAK.z - PEAK_RADIUS),
    new THREE.Vector3(SACRED_PEAK.x + PEAK_RADIUS, Infinity, SACRED_PEAK.z + PEAK_RADIUS));
  for (const [key, tile] of sculptedTiles) {
    if (tile.geometry.boundingBox!.intersectsBox(peakBox)) tileHeights.set(key, rasterizeTile(tile));
  }
  return group;
};

export const createMountains = (): THREE.Group => {
  const sculpt = getWorldModel("mountains");
  if (sculpt) {
    const group = sculptedRanges(sculpt);
    const shrine = createMountainShrine(PEAK_LEDGE);
    group.add(shrine.group);
    group.userData.updateShrine = shrine.update;
    return group;
  }
  const group = new THREE.Group();
  const rng = createRng(0x5e7a);

  // The sacred peak, Fuji-like, with its cap of eternal snow
  const peak = sculptedPeak(rng, 1750, 2500, {
    tint: "#ffffff",
    jag: 0.16,
    detail: [64, 30],
    peakSeed: 0.77,
  });
  peak.position.set(SACRED_PEAK.x, 1250 - 220, SACRED_PEAK.z);
  group.add(peak);

  // Rings of lesser ridges receding into the mist. The aerial tint cools
  // and lightens with distance so the ranges layer like a woodblock print.
  const rings: Array<{ radius: number; tint: string; count: number; size: [number, number]; detail: [number, number] }> = [
    { radius: WORLD_SIZE * 0.52, tint: "#f2f5f8", count: 9, size: [700, 1500], detail: [44, 20] },
    { radius: WORLD_SIZE * 0.62, tint: "#e4ebf2", count: 11, size: [900, 1900], detail: [32, 15] },
    { radius: WORLD_SIZE * 0.74, tint: "#d6e0ea", count: 12, size: [1100, 2300], detail: [24, 11] },
  ];

  rings.forEach((ring, ringIndex) => {
    for (let i = 0; i < ring.count; i += 1) {
      const angle = (i / ring.count) * Math.PI * 2 + rng() * 0.5;
      const r = ring.radius * (0.92 + rng() * 0.18);
      const height = ring.size[0] + rng() * (ring.size[1] - ring.size[0]);
      const m = sculptedPeak(rng, height * (0.75 + rng() * 0.5), height, {
        tint: ring.tint,
        jag: 0.13,
        detail: ring.detail,
        peakSeed: ringIndex * 10 + i + rng(),
      });
      m.position.set(Math.cos(angle) * r, height * 0.42 - 160, Math.sin(angle) * r);
      m.rotation.y = rng() * Math.PI;
      group.add(m);
    }
  });

  /* ── The mountain shrine on its ledge (built in shrine.ts) ── */
  const shrine = createMountainShrine(PEAK_LEDGE);
  group.add(shrine.group);
  group.userData.updateShrine = shrine.update;

  return group;
};
