import * as THREE from "three";
import { KAKURIYO, getToonGradient, toon } from "./palette.ts";
import {
  getGlowTexture,
  roofTexture,
  shojiTexture,
  stoneWallTexture,
  woodTexture,
} from "./textures.ts";

/**
 * The mountain shrine (奥宮, okumiya — the inner shrine of the sacred peak).
 * It stands on the ledge platform where so many tales come to rest, so the
 * platform keeps its footprint and its flat crown for the spirits to stand
 * on; everything else is built up into a proper Shinto honden — a tiered
 * stone stylobate with a kōran railing, vermilion pillars, a shoji-walled
 * sanctuary, a sweeping tiled roof crowned with gold chigi and katsuogi,
 * a shimenawa across the front, and stone lanterns to either side.
 */

const toonTex = (map: THREE.Texture, color = "#ffffff") =>
  new THREE.MeshToonMaterial({ color, map, gradientMap: getToonGradient() });

/** A sweeping, up-swept tiled roof (irimoya silhouette at toon fidelity). */
const sweepRoof = (width: number, height: number, tileMat: THREE.Material): THREE.Group => {
  const roof = new THREE.Group();
  const hip = new THREE.Mesh(new THREE.ConeGeometry(width * 0.72, height, 4, 1), tileMat);
  hip.rotation.y = Math.PI / 4;
  hip.scale.z = 0.82;
  roof.add(hip);
  // Upturned eave corners
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const tip = new THREE.Mesh(new THREE.ConeGeometry(width * 0.05, width * 0.13, 4), tileMat);
      tip.position.set(sx * width * 0.5, -height * 0.3, sz * width * 0.42);
      tip.rotation.z = sx * -0.55;
      roof.add(tip);
    }
  }
  return roof;
};

const createLantern = (stoneMat: THREE.Material): THREE.Group => {
  const lantern = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(6, 8, 6, 6), stoneMat);
  base.position.y = 3;
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3.2, 16, 6), stoneMat);
  stem.position.y = 15;
  const housing = new THREE.Mesh(new THREE.BoxGeometry(10, 9, 10), stoneMat);
  housing.position.y = 28;
  const glow = new THREE.Mesh(new THREE.BoxGeometry(6.5, 6, 6.5), new THREE.MeshBasicMaterial({ color: "#ffe2a0" }));
  glow.position.y = 28;
  glow.name = "shrine-lantern-glow";
  const cap = new THREE.Mesh(new THREE.ConeGeometry(9, 8, 6), stoneMat);
  cap.position.y = 36;
  const halo = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: getGlowTexture(),
      color: "#ffd98a",
      transparent: true,
      opacity: 0.4,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  halo.scale.set(40, 40, 1);
  halo.position.y = 28;
  halo.name = "shrine-lantern-halo";
  lantern.add(base, stem, housing, glow, cap, halo);
  return lantern;
};

export type MountainShrine = {
  group: THREE.Group;
  update: (t: number) => void;
};

export const createMountainShrine = (
  center: THREE.Vector3,
  facingTarget = new THREE.Vector3(0, center.y, 0)
): MountainShrine => {
  const group = new THREE.Group();
  group.position.copy(center);
  group.rotation.y = Math.atan2(facingTarget.x - center.x, facingTarget.z - center.z);
  // Local space: platform crown at y = 0, front (valley side) toward +z.

  /* ── Materials ── */
  const stoneMat = toonTex(stoneWallTexture("#a8a89e", "#7d7d72", "#bcbcb0"));
  const stoneDarkMat = toonTex(stoneWallTexture("#8f929a", "#63656d", "#a4a7ad"));
  const floorMat = toonTex(woodTexture("#7d4230", "#5c3021"));
  const beamMat = toonTex(woodTexture("#5f3d2c", "#432b1e"));
  const bodyMat = toonTex(shojiTexture());
  const roofMat = toonTex(roofTexture());
  const vermilionMat = toon(KAKURIYO.vermilion);
  const goldMat = toon(KAKURIYO.gold);
  const darkMat = toon("#241f1b");
  const ropeMat = toon("#d8c89a");
  const paperMat = toon(KAKURIYO.paperWhite);

  /* ── The stylobate: a stepped stone base, crown kept at footprint ── */
  const steps: Array<[number, number, number, number]> = [
    // [radiusTop, radiusBottom, height, centerY]
    [78, 80, 10, -5],
    [86, 90, 12, -16],
    [96, 104, 18, -31],
  ];
  steps.forEach(([rt, rb, hgt, cy], i) => {
    const tier = new THREE.Mesh(
      new THREE.CylinderGeometry(rt, rb, hgt, 26),
      i === 1 ? stoneDarkMat : stoneMat
    );
    tier.position.y = cy;
    group.add(tier);
  });
  // A smooth inlaid standing crown, faintly bordered
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(74, 74, 2, 26), stoneDarkMat);
  crown.position.y = 0.4;
  group.add(crown);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(78, 2.4, 8, 40), goldMat);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.6;
  group.add(rim);

  /* ── Approach steps at the valley-facing front ── */
  for (let s = 0; s < 3; s += 1) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(46 - s * 6, 6, 8), stoneMat);
    step.position.set(0, -3 - s * 6, 80 + s * 7);
    group.add(step);
  }

  /* ── Kōran railing around the rear arc (front left open) ── */
  const railR = 74;
  const openHalf = 0.62; // radians of open front gap (each side of +z)
  const arcStart = openHalf;
  const arcEnd = Math.PI * 2 - openHalf;
  const posts = 13;
  for (let i = 0; i <= posts; i += 1) {
    const a = arcStart + (i / posts) * (arcEnd - arcStart);
    const px = Math.sin(a) * railR;
    const pz = Math.cos(a) * railR;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.7, 15, 6), vermilionMat);
    post.position.set(px, 7, pz);
    group.add(post);
    const giboshi = new THREE.Mesh(new THREE.SphereGeometry(2.4, 8, 6), goldMat);
    giboshi.position.set(px, 15, pz);
    group.add(giboshi);
  }
  // Two horizontal rails following the arc
  for (const [ry, tube] of [[12, 1.4], [6, 1.2]] as Array<[number, number]>) {
    const rail = new THREE.Mesh(
      new THREE.TorusGeometry(railR, tube, 6, 60, arcEnd - arcStart),
      vermilionMat
    );
    rail.rotation.x = Math.PI / 2;
    // Torus arc starts at +x; rotate so the open gap sits on +z (front)
    rail.rotation.z = -(Math.PI / 2 - arcStart);
    rail.position.y = ry;
    group.add(rail);
  }

  /* ── The honden sanctuary, set toward the back ── */
  const shrine = new THREE.Group();
  shrine.position.set(0, 0, -40);
  group.add(shrine);

  const foundation = new THREE.Mesh(new THREE.BoxGeometry(48, 12, 36), stoneMat);
  foundation.position.y = 6;
  shrine.add(foundation);
  const floor = new THREE.Mesh(new THREE.BoxGeometry(44, 5, 32), floorMat);
  floor.position.y = 14;
  shrine.add(floor);

  // Vermilion pillars: four corners plus two mid-sides
  const pillarSpots: Array<[number, number]> = [
    [-19, -14], [19, -14], [-19, 14], [19, 14], [-19, 0], [19, 0],
  ];
  pillarSpots.forEach(([px, pz]) => {
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(3, 3.4, 34, 8), vermilionMat);
    pillar.position.set(px, 33, pz);
    shrine.add(pillar);
  });

  // The sanctuary body (shoji walls), set back with a dark doorway
  const body = new THREE.Mesh(new THREE.BoxGeometry(32, 26, 20), bodyMat);
  body.position.set(0, 30, -4);
  shrine.add(body);
  const doorway = new THREE.Mesh(new THREE.BoxGeometry(11, 17, 3), darkMat);
  doorway.position.set(0, 27, 6.2);
  shrine.add(doorway);
  // Gold door frame
  for (const [w, hh, ox, oy] of [[13, 2, 0, 36], [2, 19, -6.5, 27], [2, 19, 6.5, 27]] as Array<[number, number, number, number]>) {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(w, hh, 1.6), goldMat);
    frame.position.set(ox, oy, 6.6);
    shrine.add(frame);
  }
  // A gohei (paper streamer) standing in the doorway
  const gohei = new THREE.Mesh(new THREE.BoxGeometry(1.4, 16, 1.4), beamMat);
  gohei.position.set(0, 27, 5.5);
  shrine.add(gohei);
  for (const side of [-1, 1]) {
    const paper = new THREE.Mesh(new THREE.BoxGeometry(4, 8, 0.4), paperMat);
    paper.position.set(side * 2.6, 31, 5.5);
    shrine.add(paper);
  }

  // Approach steps up onto the honden floor
  for (let s = 0; s < 3; s += 1) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(20, 3.5, 5), stoneMat);
    step.position.set(0, 10 - s * 3.5, 17 + s * 5);
    shrine.add(step);
  }

  // Saisen offering box before the doorway
  const saisen = new THREE.Mesh(new THREE.BoxGeometry(16, 9, 9), beamMat);
  saisen.position.set(0, 21, 15);
  shrine.add(saisen);
  const slot = new THREE.Mesh(new THREE.BoxGeometry(12, 1.4, 2), darkMat);
  slot.position.set(0, 25.6, 15);
  shrine.add(slot);

  // Entablature plate the roof rests on
  const plate = new THREE.Mesh(new THREE.BoxGeometry(46, 5, 34), beamMat);
  plate.position.y = 47;
  shrine.add(plate);

  /* ── The great roof ── */
  const lowerRoof = sweepRoof(66, 26, roofMat);
  lowerRoof.position.y = 54;
  shrine.add(lowerRoof);
  const upperRoof = sweepRoof(40, 18, roofMat);
  upperRoof.position.y = 66;
  shrine.add(upperRoof);

  // Ridge beam
  const ridge = new THREE.Mesh(new THREE.BoxGeometry(40, 4, 5), beamMat);
  ridge.position.y = 71;
  shrine.add(ridge);
  // Katsuogi: gold billets laid across the ridge
  for (let i = 0; i < 5; i += 1) {
    const billet = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 14, 8), goldMat);
    billet.rotation.x = Math.PI / 2;
    billet.position.set((i - 2) * 8, 74, 0);
    shrine.add(billet);
  }
  // Chigi: crossed forked finials at each gable end
  for (const end of [-1, 1]) {
    for (const cross of [-1, 1]) {
      const blade = new THREE.Mesh(new THREE.BoxGeometry(2.4, 26, 2.4), goldMat);
      blade.position.set(end * 20, 78, 0);
      blade.rotation.x = cross * 0.5;
      shrine.add(blade);
    }
  }
  // A gold gegyo hanging under the front gable
  const gegyo = new THREE.Mesh(new THREE.CylinderGeometry(4, 0, 7, 6), goldMat);
  gegyo.position.set(0, 60, 20);
  gegyo.rotation.x = Math.PI;
  shrine.add(gegyo);

  // Shimenawa: the sacred rope across the front, with hanging shide
  const rope = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 40, 8), ropeMat);
  rope.rotation.z = Math.PI / 2;
  rope.position.set(0, 43, 15);
  shrine.add(rope);
  for (let i = -1; i <= 1; i += 1) {
    const shide = new THREE.Mesh(new THREE.BoxGeometry(3, 9, 0.4), paperMat);
    shide.position.set(i * 12, 38, 15);
    shrine.add(shide);
  }

  /* ── Stone lanterns flanking the sanctuary front ── */
  const lanternGlows: THREE.Mesh[] = [];
  const lanternHalos: THREE.Sprite[] = [];
  for (const side of [-1, 1]) {
    const lantern = createLantern(stoneMat);
    lantern.position.set(side * 40, 0, 18);
    group.add(lantern);
    const glow = lantern.getObjectByName("shrine-lantern-glow") as THREE.Mesh;
    if (glow) lanternGlows.push(glow);
    const halo = lantern.getObjectByName("shrine-lantern-halo") as THREE.Sprite;
    if (halo) lanternHalos.push(halo);
  }

  const update = (t: number) => {
    lanternGlows.forEach((glow, i) => {
      const mat = glow.material as THREE.MeshBasicMaterial;
      mat.color.setScalar(0.92 + Math.sin(t * 2.4 + i * 2.1) * 0.08);
      mat.color.lerp(new THREE.Color("#ffdf9a"), 0.9);
    });
    lanternHalos.forEach((halo, i) => {
      (halo.material as THREE.SpriteMaterial).opacity = 0.34 + Math.sin(t * 2.4 + i * 2.1) * 0.1;
    });
  };

  return { group, update };
};
