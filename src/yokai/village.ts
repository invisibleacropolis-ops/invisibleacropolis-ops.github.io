import * as THREE from "three";
import { createRng } from "../scene/random.ts";
import { KAKURIYO, getToonGradient, toon } from "./palette.ts";
import { POND_CENTER, VILLAGE_CENTER, VILLAGE_HEIGHT, heightAt } from "./terrain.ts";
import { paddyTexture, plasterTexture, thatchTexture, woodTexture } from "./textures.ts";
import { reserve, reserveLine } from "./occupancy.ts";

/**
 * The farm hamlet: steep-roofed thatched minka gathered on their shelf of
 * land, terraced rice paddies stepping down the slope, and a vermilion
 * taiko bridge arching over the pond's outlet stream.
 */

const toonTex = (map: THREE.Texture, color = "#ffffff") =>
  new THREE.MeshToonMaterial({ color, map, gradientMap: getToonGradient() });

export type Village = {
  group: THREE.Group;
  /** Around here the lantern yokai bobs and the tanuki snoops. */
  square: THREE.Vector3;
  bridgeCrossing: THREE.Vector3[];
  /** Actual deck and terrace surfaces, for grounded story choreography. */
  walkableY: (x: number, z: number) => number;
};

const buildMinka = (
  rng: () => number,
  thatchMat: THREE.Material,
  wallMat: THREE.Material,
  timberMat: THREE.Material,
  darkMat: THREE.Material
): THREE.Group => {
  const house = new THREE.Group();
  const w = 90 + rng() * 40;
  const d = 62 + rng() * 22;
  const wallH = 34;

  const walls = new THREE.Mesh(new THREE.BoxGeometry(w, wallH, d), wallMat);
  walls.position.y = wallH / 2;
  house.add(walls);

  // Timber posts at the corners
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(6, wallH, 6), timberMat);
      post.position.set(sx * (w / 2 - 3), wallH / 2, sz * (d / 2 - 3));
      house.add(post);
    }
  }

  // Doorway
  const door = new THREE.Mesh(new THREE.BoxGeometry(18, 24, 2), darkMat);
  door.position.set(w * 0.1, 12, d / 2 + 0.6);
  house.add(door);

  // The steep gasshō thatch: a triangular prism with generous eaves
  const roofH = 52 + rng() * 16;
  const shape = new THREE.Shape();
  shape.moveTo(-(d / 2 + 14), 0);
  shape.lineTo(d / 2 + 14, 0);
  shape.lineTo(0, roofH);
  shape.closePath();
  const roofGeo = new THREE.ExtrudeGeometry(shape, { depth: w + 22, bevelEnabled: false });
  roofGeo.translate(0, 0, -(w + 22) / 2);
  roofGeo.rotateY(Math.PI / 2);
  const roof = new THREE.Mesh(roofGeo, thatchMat);
  roof.position.y = wallH - 2;
  house.add(roof);

  // Ridge cap
  const ridge = new THREE.Mesh(new THREE.BoxGeometry(w + 26, 5, 10), darkMat);
  ridge.position.y = wallH + roofH - 2;
  house.add(ridge);

  return house;
};

export const createVillage = (): Village => {
  const group = new THREE.Group();
  const walkable: THREE.Mesh[] = [];
  const rng = createRng(0x0714);

  const thatchMat = toonTex(thatchTexture());
  const wallMat = toonTex(plasterTexture("#e8dfc8"));
  const timberMat = toonTex(woodTexture("#5f4432", "#443122"));
  const darkMat = toon("#3a3028");
  const paddyMat = toonTex(paddyTexture());
  const bundMat = toon("#8a7a52");
  const vermilionMat = toon(KAKURIYO.vermilion);
  const plankMat = toonTex(woodTexture("#8a5a40", "#6b4028"));

  /* ── Minka houses around a loose square ── */
  const houseCount = 6;
  for (let i = 0; i < houseCount; i += 1) {
    const angle = (i / houseCount) * Math.PI * 2 + rng() * 0.5;
    const r = 190 + rng() * 190;
    const x = VILLAGE_CENTER.x + Math.cos(angle) * r;
    const z = VILLAGE_CENTER.y + Math.sin(angle) * r * 0.8;
    const house = buildMinka(rng, thatchMat, wallMat, timberMat, darkMat);
    house.position.set(x, heightAt(x, z) - 1, z);
    house.rotation.y = -angle + Math.PI / 2 + (rng() - 0.5) * 0.4;
    group.add(house);
    reserve(x, z, 130);
  }

  /* ── Rice terraces stepping down the southern slope ── */
  const paddyBase = new THREE.Vector2(VILLAGE_CENTER.x - 620, VILLAGE_CENTER.y + 60);
  for (let i = 0; i < 5; i += 1) {
    const px = paddyBase.x - i * 60;
    const pz = paddyBase.y + i * 215;
    const py = VILLAGE_HEIGHT + 14 - i * 13;
    const w = 340 - i * 18;
    const d = 190;

    const water = new THREE.Mesh(new THREE.PlaneGeometry(w, d), paddyMat);
    water.rotation.x = -Math.PI / 2;
    water.position.set(px, py, pz);
    group.add(water);
    walkable.push(water);
    reserveLine(px - w / 2 + 40, pz, px + w / 2 - 40, pz, d / 2 + 30);

    // Bund walls around each terrace
    const bundH = 16;
    const edges: Array<[number, number, number, number]> = [
      [px, pz - d / 2, w + 14, 14],
      [px, pz + d / 2, w + 14, 14],
      [px - w / 2, pz, 14, d + 14],
      [px + w / 2, pz, 14, d + 14],
    ];
    for (const [ex, ez, ew, ed] of edges) {
      const bund = new THREE.Mesh(new THREE.BoxGeometry(ew, bundH, ed), bundMat);
      bund.position.set(ex, py + 2 - bundH / 2 + bundH * 0.55, ez);
      group.add(bund);
      walkable.push(bund);
    }
  }

  /* ── The taiko bridge over the pond outlet ── */
  const bridgeCenter = new THREE.Vector2(
    (POND_CENTER.x + VILLAGE_CENTER.x) / 2 - 120,
    (POND_CENTER.y + VILLAGE_CENTER.y) / 2 + 40
  );
  const bridge = new THREE.Group();
  const span = 240;
  const arcHeight = 46;
  const planks = 9;
  for (let i = 0; i < planks; i += 1) {
    const tt = i / (planks - 1);
    const along = (tt - 0.5) * span;
    const rise = Math.sin(tt * Math.PI) * arcHeight;
    const plank = new THREE.Mesh(new THREE.BoxGeometry(span / planks + 6, 6, 64), plankMat);
    plank.position.set(along, rise, 0);
    plank.rotation.z = Math.cos(tt * Math.PI) * -0.5;
    bridge.add(plank);
    walkable.push(plank);
  }
  // Vermilion railings following the arc
  for (const side of [-1, 1]) {
    for (let i = 0; i <= planks; i += 1) {
      const tt = i / planks;
      const along = (tt - 0.5) * span;
      const rise = Math.sin(tt * Math.PI) * arcHeight;
      const baluster = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 26, 5), vermilionMat);
      baluster.position.set(along, rise + 14, side * 30);
      bridge.add(baluster);
    }
    const rail = new THREE.Mesh(new THREE.TorusGeometry(span * 0.62, 3.4, 6, 18, Math.PI * 0.62), vermilionMat);
    rail.rotation.z = Math.PI * 0.19;
    rail.position.set(0, arcHeight - span * 0.38, side * 30);
    bridge.add(rail);
  }
  const bridgeY = heightAt(bridgeCenter.x, bridgeCenter.y);
  bridge.position.set(bridgeCenter.x, bridgeY + 8, bridgeCenter.y);
  reserve(bridgeCenter.x, bridgeCenter.y, 190);
  bridge.rotation.y = Math.atan2(
    VILLAGE_CENTER.y - POND_CENTER.y,
    VILLAGE_CENTER.x - POND_CENTER.x
  ) + Math.PI / 2;
  group.add(bridge);
  group.updateWorldMatrix(true, true);
  // The deck sits above the sloping banks. Join its ends to the land instead
  // of leaving a vertical first step for walking characters to pass through.
  for (const side of [-1, 1]) {
    const bank = bridge.localToWorld(new THREE.Vector3(side * 240, 0, 0));
    const bankY = heightAt(bank.x, bank.z) - bridge.position.y;
    const ramp = new THREE.Mesh(new THREE.BoxGeometry(Math.hypot(120, bankY), 6, 64), plankMat);
    ramp.position.set(side * 180, bankY / 2, 0);
    ramp.rotation.z = side * Math.atan2(bankY, 120);
    bridge.add(ramp);
    walkable.push(ramp);
  }
  group.updateWorldMatrix(true, true);
  // Straight lead-in/out keeps a spline turn outside the rail ends.
  const bridgeCrossing = [-240, -180, -140, -90, 0, 90, 140, 180, 240].map((along) =>
    bridge.localToWorld(new THREE.Vector3(along, 0, 0)));
  const groundRay = new THREE.Raycaster(new THREE.Vector3(), new THREE.Vector3(0, -1, 0));
  const walkableY = (x: number, z: number) => {
    groundRay.ray.origin.set(x, 10000, z);
    const hit = groundRay.intersectObjects(walkable, false)[0];
    return Math.max(heightAt(x, z), hit?.point.y ?? -Infinity);
  };
  bridgeCrossing.forEach((point) => { point.y = walkableY(point.x, point.z); });

  /* ── A well at the square's heart ── */
  const well = new THREE.Group();
  const wellRing = new THREE.Mesh(new THREE.CylinderGeometry(22, 24, 20, 8), toonTex(plasterTexture("#c9c4b2")));
  wellRing.position.y = 10;
  const wellRoof = new THREE.Mesh(new THREE.ConeGeometry(30, 22, 4), thatchMat);
  wellRoof.rotation.y = Math.PI / 4;
  wellRoof.position.y = 52;
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(4, 42, 4), timberMat);
    post.position.set(side * 20, 24, 0);
    well.add(post);
  }
  well.add(wellRing, wellRoof);
  const wy = heightAt(VILLAGE_CENTER.x, VILLAGE_CENTER.y);
  well.position.set(VILLAGE_CENTER.x, wy, VILLAGE_CENTER.y);
  group.add(well);
  reserve(VILLAGE_CENTER.x, VILLAGE_CENTER.y, 80);

  return {
    group,
    square: new THREE.Vector3(VILLAGE_CENTER.x, wy, VILLAGE_CENTER.y),
    bridgeCrossing,
    walkableY,
  };
};
