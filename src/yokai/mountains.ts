import * as THREE from "three";
import { createRng } from "../scene/random.ts";
import { KAKURIYO, toon } from "./palette.ts";
import { WORLD_SIZE } from "./terrain.ts";

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

/** Shared material: all peaks use vertex colors under one toon shader. */
let peakMaterial: THREE.MeshToonMaterial | null = null;
const getPeakMaterial = () => {
  if (!peakMaterial) {
    peakMaterial = toon("#ffffff", { flatShading: true });
    peakMaterial.vertexColors = true;
  }
  return peakMaterial;
};

type PeakOptions = {
  /** Rock tone at the crest; the base always melts into the valley haze. */
  tone: string;
  /** 0–1: fraction of the height where snow begins (0 = no snow). */
  snowLine?: number;
  jag?: number;
};

/**
 * A stylized peak: jagged low-poly cone whose vertex colors carry the
 * whole read — haze-soft base grading into rock, shadowed gullies from
 * the displacement, and a wind-torn snowline near the summit.
 */
const jaggedCone = (
  rng: () => number,
  radius: number,
  height: number,
  { tone, snowLine = 0, jag = 0.16 }: PeakOptions
): THREE.Mesh => {
  const geometry = new THREE.ConeGeometry(radius, height, 10, 5);
  const positions = geometry.getAttribute("position") as THREE.BufferAttribute;
  const v = new THREE.Vector3();

  // Displace first, so shading follows the new silhouette
  const wobbles: number[] = [];
  for (let i = 0; i < positions.count; i += 1) {
    v.fromBufferAttribute(positions, i);
    let wobble = 1;
    if (Math.abs(v.y) < height * 0.49) {
      wobble = 1 + (rng() - 0.5) * jag;
      positions.setX(i, v.x * wobble);
      positions.setZ(i, v.z * wobble);
    }
    wobbles.push(wobble);
  }

  // Vertex colors: haze base → rock body → lit crest → torn snow
  const haze = new THREE.Color(KAKURIYO.hazeColor);
  const rock = new THREE.Color(tone);
  const crest = rock.clone().lerp(new THREE.Color("#ffffff"), 0.28);
  const snow = new THREE.Color(KAKURIYO.snow);
  const shadowRock = rock.clone().lerp(new THREE.Color("#2c3450"), 0.3);
  const colors = new Float32Array(positions.count * 3);
  const tint = new THREE.Color();

  for (let i = 0; i < positions.count; i += 1) {
    v.fromBufferAttribute(positions, i);
    const h = THREE.MathUtils.clamp(v.y / height + 0.5, 0, 1);

    // Ground the base in the valley's air, brighten toward the crest
    tint.copy(haze).lerp(rock, THREE.MathUtils.smoothstep(h, 0.02, 0.42));
    tint.lerp(crest, THREE.MathUtils.smoothstep(h, 0.55, 0.95) * 0.8);

    // Bulging faces read lit, recessed gullies read shadowed
    const relief = (wobbles[i]! - 1) / (jag * 0.5 + 1e-5);
    if (relief < -0.15) tint.lerp(shadowRock, Math.min(1, -relief) * 0.5);

    // Snowline, torn by the same wobble so it never sits ruler-straight
    if (snowLine > 0) {
      const line = snowLine + (wobbles[i]! - 1) * 0.55;
      if (h > line) {
        tint.lerp(snow, THREE.MathUtils.smoothstep(h, line, line + 0.1));
      }
    }

    colors[i * 3] = tint.r;
    colors[i * 3 + 1] = tint.g;
    colors[i * 3 + 2] = tint.b;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();

  return new THREE.Mesh(geometry, getPeakMaterial());
};

export const createMountains = (): THREE.Group => {
  const group = new THREE.Group();
  const rng = createRng(0x5e7a);

  // The sacred peak, Fuji-like, with its cap of eternal snow
  const peak = jaggedCone(rng, 1750, 2500, KAKURIYO.mountainNear, 0.1);
  peak.position.set(SACRED_PEAK.x, 1250 - 220, SACRED_PEAK.z);
  group.add(peak);

  const snow = jaggedCone(rng, 620, 900, KAKURIYO.snow, 0.12);
  snow.position.set(SACRED_PEAK.x, 2050, SACRED_PEAK.z);
  group.add(snow);

  // Rings of lesser ridges receding into the mist
  const rings: Array<{ radius: number; color: string; count: number; size: [number, number] }> = [
    { radius: WORLD_SIZE * 0.52, color: KAKURIYO.mountainNear, count: 9, size: [700, 1500] },
    { radius: WORLD_SIZE * 0.62, color: KAKURIYO.mountainMid, count: 11, size: [900, 1900] },
    { radius: WORLD_SIZE * 0.74, color: KAKURIYO.mountainFar, count: 12, size: [1100, 2300] },
  ];

  rings.forEach((ring) => {
    for (let i = 0; i < ring.count; i += 1) {
      const angle = (i / ring.count) * Math.PI * 2 + rng() * 0.5;
      const r = ring.radius * (0.92 + rng() * 0.18);
      const height = ring.size[0] + rng() * (ring.size[1] - ring.size[0]);
      const m = jaggedCone(rng, height * (0.75 + rng() * 0.5), height, ring.color, 0.22);
      m.position.set(Math.cos(angle) * r, height * 0.42 - 160, Math.sin(angle) * r);
      m.rotation.y = rng() * Math.PI;
      group.add(m);
    }
  });

  /* ── The hokora ledge: a resting place partway up the sacred peak ── */
  const stoneMat = toon("#a8a89e", { flatShading: true });
  const roofMat = toon("#46586e", { flatShading: true });

  const platform = new THREE.Mesh(new THREE.CylinderGeometry(78, 96, 26, 9), stoneMat);
  platform.position.set(PEAK_LEDGE.x, PEAK_LEDGE.y - 13, PEAK_LEDGE.z);
  group.add(platform);

  const hokora = new THREE.Group();
  const hBase = new THREE.Mesh(new THREE.BoxGeometry(26, 10, 22), stoneMat);
  hBase.position.y = 5;
  const hBody = new THREE.Mesh(new THREE.BoxGeometry(20, 22, 16), stoneMat);
  hBody.position.y = 21;
  const hHollow = new THREE.Mesh(new THREE.BoxGeometry(10, 12, 4), toon("#2e2c28"));
  hHollow.position.set(0, 21, 8.4);
  const hRoof = new THREE.Mesh(new THREE.ConeGeometry(22, 14, 4), roofMat);
  hRoof.rotation.y = Math.PI / 4;
  hRoof.position.y = 38;
  hokora.add(hBase, hBody, hHollow, hRoof);
  hokora.position.set(PEAK_LEDGE.x - 30, PEAK_LEDGE.y, PEAK_LEDGE.z - 30);
  hokora.lookAt(PEAK_LEDGE.x + 200, PEAK_LEDGE.y, PEAK_LEDGE.z + 260);
  group.add(hokora);

  return group;
};
