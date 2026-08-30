import * as THREE from "three";
import { createRng } from "../scene/random.ts";
import { fbm2D } from "../scene/noise.ts";
import { getToonGradient } from "./palette.ts";
import { WORLD_SIZE } from "./terrain.ts";
import { mountainTexture } from "./textures.ts";
import { createMountainShrine } from "./shrine.ts";

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

export const createMountains = (): THREE.Group => {
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
