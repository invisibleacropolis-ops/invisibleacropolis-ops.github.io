import * as THREE from "three";
import { createRng } from "../scene/random.ts";
import { KAKURIYO, getToonGradient, toon } from "./palette.ts";
import { TEMPLE_CENTER, heightAt } from "./terrain.ts";
import { getGlowTexture, roofTexture, shojiTexture, stoneWallTexture, woodTexture } from "./textures.ts";
import { reserve } from "./occupancy.ts";

/**
 * Sacred architecture on the shrine plateau: a five-storied pagoda, a
 * small honden shrine hall, a procession of vermilion torii marching up
 * the southern slope, stone tōrō lanterns, and komainu guardians.
 */

export type Architecture = {
  group: THREE.Group;
  update: (t: number) => void;
  /** Torii path waypoints — spirits like to wander this route. */
  toriiPath: THREE.Vector3[];
  /** Top of the pagoda, for the tengu's perch. */
  pagodaTop: THREE.Vector3;
};

const toonTex = (map: THREE.Texture, color = "#ffffff") =>
  new THREE.MeshToonMaterial({ color, map, gradientMap: getToonGradient() });

const woodMat = toonTex(woodTexture("#7d4230", "#5c3021"));
const roofMat = toonTex(roofTexture());
const vermilionMat = toon(KAKURIYO.vermilion); // lacquer stays smooth
const stoneMat = toonTex(stoneWallTexture("#a8a89e", "#7d7d72", "#bcbcb0"));
const paperMat = toonTex(shojiTexture());
const goldMat = toon(KAKURIYO.gold);

/** A gently up-swept roof tier: a squashed, rotated cone reads as the
 *  classic irimoya silhouette at toon fidelity. */
const roofTier = (width: number): THREE.Group => {
  const tier = new THREE.Group();
  const cone = new THREE.Mesh(new THREE.ConeGeometry(width * 0.72, width * 0.34, 4, 1), roofMat);
  cone.rotation.y = Math.PI / 4;
  cone.scale.z = 0.8;
  tier.add(cone);
  // Upturned eave corners
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const tip = new THREE.Mesh(new THREE.ConeGeometry(width * 0.05, width * 0.12, 4), roofMat);
      tip.position.set(sx * width * 0.5, -width * 0.1, sz * width * 0.4);
      tip.rotation.z = sx * -0.5;
      tier.add(tip);
    }
  }
  return tier;
};

const createPagoda = (height = 5): THREE.Group => {
  const pagoda = new THREE.Group();
  let y = 0;
  let width = 150;

  for (let level = 0; level < height; level += 1) {
    const bodyH = 52 - level * 4;
    const body = new THREE.Mesh(new THREE.BoxGeometry(width * 0.62, bodyH, width * 0.62), level === 0 ? woodMat : paperMat);
    body.position.y = y + bodyH / 2;
    pagoda.add(body);

    // Vermilion pillars at the corners
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const pillar = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.4, bodyH, 6), vermilionMat);
        pillar.position.set(sx * width * 0.3, y + bodyH / 2, sz * width * 0.3);
        pagoda.add(pillar);
      }
    }

    y += bodyH;
    const roof = roofTier(width);
    roof.position.y = y + width * 0.1;
    pagoda.add(roof);
    y += width * 0.2;
    width *= 0.86;
  }

  // Sōrin finial
  const spire = new THREE.Mesh(new THREE.CylinderGeometry(2, 2, 70, 6), goldMat);
  spire.position.y = y + 30;
  pagoda.add(spire);
  for (let i = 0; i < 5; i += 1) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(9 - i, 1.6, 6, 14), goldMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = y + 18 + i * 11;
    pagoda.add(ring);
  }

  return pagoda;
};

const createTorii = (scale = 1): THREE.Group => {
  const torii = new THREE.Group();
  const postH = 90 * scale;
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(6 * scale, 7.5 * scale, postH, 8), vermilionMat);
    post.position.set(side * 50 * scale, postH / 2, 0);
    post.rotation.z = side * -0.035;
    torii.add(post);
  }
  // Kasagi (top lintel) with upswept ends
  const kasagi = new THREE.Mesh(new THREE.BoxGeometry(140 * scale, 9 * scale, 12 * scale), roofMat);
  kasagi.position.y = postH;
  torii.add(kasagi);
  for (const side of [-1, 1]) {
    const tip = new THREE.Mesh(new THREE.BoxGeometry(16 * scale, 9 * scale, 12 * scale), roofMat);
    tip.position.set(side * 76 * scale, postH + 4 * scale, 0);
    tip.rotation.z = side * 0.22;
    torii.add(tip);
  }
  // Nuki (lower tie beam)
  const nuki = new THREE.Mesh(new THREE.BoxGeometry(118 * scale, 7 * scale, 9 * scale), vermilionMat);
  nuki.position.y = postH * 0.74;
  torii.add(nuki);
  return torii;
};

const createLantern = (): THREE.Group => {
  const lantern = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(9, 12, 10, 6), stoneMat);
  base.position.y = 5;
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(4, 5, 26, 6), stoneMat);
  stem.position.y = 26;
  const housing = new THREE.Mesh(new THREE.BoxGeometry(16, 14, 16), stoneMat);
  housing.position.y = 46;
  const glow = new THREE.Mesh(
    new THREE.BoxGeometry(11, 9, 11),
    new THREE.MeshBasicMaterial({ color: "#ffe2a0" })
  );
  glow.position.y = 46;
  glow.name = "lantern-glow";
  const cap = new THREE.Mesh(new THREE.ConeGeometry(15, 12, 6), stoneMat);
  cap.position.y = 59;
  // A soft additive halo breathes around the flame
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
  halo.scale.set(58, 58, 1);
  halo.position.y = 46;
  halo.name = "lantern-halo";
  lantern.add(base, stem, housing, glow, cap, halo);
  return lantern;
};

const createKomainu = (): THREE.Group => {
  const komainu = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(20, 22, 34), stoneMat);
  body.position.y = 24;
  const chest = new THREE.Mesh(new THREE.SphereGeometry(13, 7, 6), stoneMat);
  chest.position.set(0, 30, 14);
  const head = new THREE.Mesh(new THREE.SphereGeometry(11, 7, 6), stoneMat);
  head.position.set(0, 44, 16);
  const mane = new THREE.Mesh(new THREE.SphereGeometry(13, 6, 5), stoneMat);
  mane.position.set(0, 42, 10);
  mane.scale.set(1.1, 0.9, 0.8);
  const plinth = new THREE.Mesh(new THREE.BoxGeometry(30, 12, 44), stoneMat);
  plinth.position.y = 6;
  for (const side of [-1, 1]) {
    const legF = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.8, 18, 5), stoneMat);
    legF.position.set(side * 8, 18, 14);
    komainu.add(legF);
  }
  komainu.add(plinth, body, chest, head, mane);
  return komainu;
};

export const createArchitecture = (): Architecture => {
  const group = new THREE.Group();
  const rng = createRng(0x70a1);
  const lanternGlows: THREE.Mesh[] = [];
  const lanternHalos: THREE.Sprite[] = [];

  const templeY = heightAt(TEMPLE_CENTER.x, TEMPLE_CENTER.y);

  // The pagoda crowns the plateau
  const pagoda = createPagoda(5);
  pagoda.position.set(TEMPLE_CENTER.x, templeY, TEMPLE_CENTER.y);
  pagoda.rotation.y = -0.35;
  group.add(pagoda);
  reserve(TEMPLE_CENTER.x, TEMPLE_CENTER.y, 230);
  const pagodaTop = new THREE.Vector3(TEMPLE_CENTER.x, templeY + 320, TEMPLE_CENTER.y);

  // A small honden hall beside it
  const honden = new THREE.Group();
  const hall = new THREE.Mesh(new THREE.BoxGeometry(120, 54, 90), woodMat);
  hall.position.y = 33;
  const hondenRoof = roofTier(170);
  hondenRoof.position.y = 78;
  const steps = new THREE.Mesh(new THREE.BoxGeometry(44, 12, 30), stoneMat);
  steps.position.set(0, 6, 58);
  honden.add(hall, hondenRoof, steps);
  honden.position.set(TEMPLE_CENTER.x - 240, templeY, TEMPLE_CENTER.y + 160);
  honden.rotation.y = 0.5;
  group.add(honden);
  reserve(TEMPLE_CENTER.x - 240, TEMPLE_CENTER.y + 160, 170);

  // Komainu pair guarding the approach
  const approachAngle = Math.PI * 0.62; // path heads south-ish
  for (const side of [-1, 1]) {
    const guardian = createKomainu();
    const gx = TEMPLE_CENTER.x + Math.cos(approachAngle) * 250 + Math.cos(approachAngle + Math.PI / 2) * side * 70;
    const gz = TEMPLE_CENTER.y + Math.sin(approachAngle) * 250 + Math.sin(approachAngle + Math.PI / 2) * side * 70;
    guardian.position.set(gx, heightAt(gx, gz), gz);
    guardian.lookAt(gx + Math.cos(approachAngle), guardian.position.y, gz + Math.sin(approachAngle));
    group.add(guardian);
    reserve(gx, gz, 50);
  }

  // The torii procession descending the southern slope
  const toriiPath: THREE.Vector3[] = [];
  const toriiCount = 6;
  for (let i = 0; i < toriiCount; i += 1) {
    const dist = 320 + i * 230;
    const wiggle = Math.sin(i * 1.1) * 140;
    const x = TEMPLE_CENTER.x + Math.cos(approachAngle) * dist + Math.cos(approachAngle + Math.PI / 2) * wiggle;
    const z = TEMPLE_CENTER.y + Math.sin(approachAngle) * dist + Math.sin(approachAngle + Math.PI / 2) * wiggle;
    const y = heightAt(x, z);
    const torii = createTorii(1 - i * 0.04);
    torii.position.set(x, y, z);
    const nx = TEMPLE_CENTER.x + Math.cos(approachAngle) * (dist + 200);
    const nz = TEMPLE_CENTER.y + Math.sin(approachAngle) * (dist + 200);
    torii.lookAt(nx, y, nz);
    group.add(torii);
    toriiPath.push(new THREE.Vector3(x, y, z));
    reserve(x, z, 105);
  }

  // Stone lanterns scattered along the way and around the plateau
  for (let i = 0; i < 14; i += 1) {
    const lantern = createLantern();
    let x: number;
    let z: number;
    if (i < toriiCount) {
      const p = toriiPath[i]!;
      x = p.x + (rng() - 0.5) * 120;
      z = p.z + 70 + (rng() - 0.5) * 60;
    } else {
      const angle = rng() * Math.PI * 2;
      const r = 180 + rng() * 320;
      x = TEMPLE_CENTER.x + Math.cos(angle) * r;
      z = TEMPLE_CENTER.y + Math.sin(angle) * r;
    }
    lantern.position.set(x, heightAt(x, z), z);
    lantern.rotation.y = rng() * Math.PI * 2;
    reserve(x, z, 36);
    const glow = lantern.getObjectByName("lantern-glow") as THREE.Mesh;
    if (glow) lanternGlows.push(glow);
    const halo = lantern.getObjectByName("lantern-halo") as THREE.Sprite;
    if (halo) lanternHalos.push(halo);
    group.add(lantern);
  }

  const update = (t: number) => {
    lanternGlows.forEach((glow, i) => {
      const mat = glow.material as THREE.MeshBasicMaterial;
      mat.color.setScalar(0.9 + Math.sin(t * 2.2 + i * 1.7) * 0.1);
      mat.color.lerp(new THREE.Color("#ffdf9a"), 0.9);
    });
    lanternHalos.forEach((halo, i) => {
      const mat = halo.material as THREE.SpriteMaterial;
      mat.opacity = 0.32 + Math.sin(t * 2.2 + i * 1.7) * 0.1;
    });
  };

  return { group, update, toriiPath, pagodaTop };
};
