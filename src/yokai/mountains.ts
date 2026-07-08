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

const jaggedCone = (
  rng: () => number,
  radius: number,
  height: number,
  color: string,
  jag = 0.16
): THREE.Mesh => {
  const geometry = new THREE.ConeGeometry(radius, height, 9, 4);
  const positions = geometry.getAttribute("position") as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < positions.count; i += 1) {
    v.fromBufferAttribute(positions, i);
    if (Math.abs(v.y) < height * 0.49) {
      const wobble = 1 + (rng() - 0.5) * jag;
      positions.setX(i, v.x * wobble);
      positions.setZ(i, v.z * wobble);
    }
  }
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, toon(color, { flatShading: true }));
  return mesh;
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
