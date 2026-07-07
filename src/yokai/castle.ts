import * as THREE from "three";
import { getToonGradient } from "./palette.ts";
import { CASTLE_CENTER, heightAt } from "./terrain.ts";
import { plasterTexture, roofTexture, stoneWallTexture, woodTexture } from "./textures.ts";

/**
 * The white castle — a Himeji-spirited tenshu on its own hill: sloped
 * ishigaki stone foundation, stacked white-plaster tiers with tiled hip
 * roofs, timber sills, gold shachihoko guarding the ridge, and a walled
 * bailey with corner yagura towers.
 */

const toonTex = (map: THREE.Texture, color = "#ffffff") =>
  new THREE.MeshToonMaterial({ color, map, gradientMap: getToonGradient() });

export type Castle = {
  group: THREE.Group;
  /** Where the Oni likes to lurk. */
  gatePoint: THREE.Vector3;
};

const buildShachihoko = (goldMat: THREE.Material): THREE.Group => {
  const fish = new THREE.Group();
  const body = new THREE.Mesh(new THREE.ConeGeometry(6, 22, 6), goldMat);
  body.rotation.x = Math.PI; // diving mouth-down
  const tail = new THREE.Mesh(new THREE.ConeGeometry(5, 14, 5), goldMat);
  tail.position.set(0, 13, 4);
  tail.rotation.x = -0.9; // the upward tail-flick
  fish.add(body, tail);
  return fish;
};

const buildRoof = (width: number, tileMat: THREE.Material): THREE.Group => {
  const roof = new THREE.Group();
  const hip = new THREE.Mesh(new THREE.ConeGeometry(width * 0.74, width * 0.3, 4, 1), tileMat);
  hip.rotation.y = Math.PI / 4;
  hip.scale.z = 0.78;
  roof.add(hip);
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const eave = new THREE.Mesh(new THREE.ConeGeometry(width * 0.06, width * 0.14, 4), tileMat);
      eave.position.set(sx * width * 0.52, -width * 0.09, sz * width * 0.4);
      eave.rotation.z = sx * -0.55;
      roof.add(eave);
    }
  }
  return roof;
};

export const createCastle = (): Castle => {
  const group = new THREE.Group();

  const stoneMat = toonTex(stoneWallTexture());
  const plasterMat = toonTex(plasterTexture());
  const tileMat = toonTex(roofTexture());
  const timberMat = toonTex(woodTexture("#5f4030", "#463024"));
  const goldMat = new THREE.MeshToonMaterial({ color: "#e0b354", gradientMap: getToonGradient() });
  const darkMat = new THREE.MeshToonMaterial({ color: "#2e2c28", gradientMap: getToonGradient() });

  const baseY = heightAt(CASTLE_CENTER.x, CASTLE_CENTER.y);
  const keep = new THREE.Group();
  keep.position.set(CASTLE_CENTER.x, baseY, CASTLE_CENTER.y);
  keep.rotation.y = 0.4;
  group.add(keep);

  /* ── Ishigaki: the sloped stone foundation ── */
  const foundation = new THREE.Mesh(new THREE.CylinderGeometry(150, 235, 150, 4, 3), stoneMat);
  foundation.rotation.y = Math.PI / 4;
  foundation.position.y = 75;
  keep.add(foundation);

  /* ── The tenshu tiers ── */
  let y = 150;
  let width = 250;
  const tiers = 4;
  for (let tier = 0; tier < tiers; tier += 1) {
    const bodyH = 66 - tier * 6;

    const body = new THREE.Mesh(new THREE.BoxGeometry(width * 0.8, bodyH, width * 0.66), plasterMat);
    body.position.y = y + bodyH / 2;
    keep.add(body);

    // Timber sill band at the tier's foot
    const sill = new THREE.Mesh(new THREE.BoxGeometry(width * 0.82, 7, width * 0.68), timberMat);
    sill.position.y = y + 4;
    keep.add(sill);

    // Slit windows on the long faces
    for (const side of [-1, 1]) {
      const win = new THREE.Mesh(new THREE.BoxGeometry(width * 0.5, 9, 3), darkMat);
      win.position.set(0, y + bodyH * 0.58, side * (width * 0.33 + 1));
      keep.add(win);
      const winEnd = new THREE.Mesh(new THREE.BoxGeometry(3, 9, width * 0.4), darkMat);
      winEnd.position.set(side * (width * 0.4 + 1), y + bodyH * 0.58, 0);
      keep.add(winEnd);
    }

    y += bodyH;
    const roof = buildRoof(width, tileMat);
    roof.position.y = y + width * 0.09;
    keep.add(roof);
    y += width * 0.17;
    width *= 0.82;
  }

  // Shachihoko pair on the topmost ridge
  for (const side of [-1, 1]) {
    const fish = buildShachihoko(goldMat);
    fish.position.set(side * width * 0.34, y + 14, 0);
    fish.rotation.z = side * -0.15;
    keep.add(fish);
  }

  /* ── Bailey wall with corner yagura ── */
  const wallRadius = 420;
  const wallSegments = 10;
  for (let i = 0; i < wallSegments; i += 1) {
    // Leave a gap for the gate on the south-west face
    if (i === 7) continue;
    const a0 = (i / wallSegments) * Math.PI * 2;
    const a1 = ((i + 1) / wallSegments) * Math.PI * 2;
    const mx = CASTLE_CENTER.x + Math.cos((a0 + a1) / 2) * wallRadius;
    const mz = CASTLE_CENTER.y + Math.sin((a0 + a1) / 2) * wallRadius;
    const length = wallRadius * (a1 - a0) * 1.02;
    const wall = new THREE.Mesh(new THREE.BoxGeometry(length, 46, 16), plasterMat);
    const wallBase = new THREE.Mesh(new THREE.BoxGeometry(length, 26, 26), stoneMat);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(length, 8, 24), tileMat);
    const yWall = heightAt(mx, mz);
    wall.position.set(mx, yWall + 44, mz);
    wallBase.position.set(mx, yWall + 12, mz);
    cap.position.set(mx, yWall + 70, mz);
    const yaw = -((a0 + a1) / 2) + Math.PI / 2;
    wall.rotation.y = yaw;
    wallBase.rotation.y = yaw;
    cap.rotation.y = yaw;
    group.add(wall, wallBase, cap);
  }

  // Corner yagura watchtowers
  for (const angle of [Math.PI * 0.25, Math.PI * 1.05, Math.PI * 1.6]) {
    const tx = CASTLE_CENTER.x + Math.cos(angle) * wallRadius;
    const tz = CASTLE_CENTER.y + Math.sin(angle) * wallRadius;
    const ty = heightAt(tx, tz);
    const tower = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(34, 50, 60, 4, 2), stoneMat);
    base.rotation.y = Math.PI / 4;
    base.position.y = 30;
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(52, 40, 52), plasterMat);
    cabin.position.y = 80;
    const roof = buildRoof(80, tileMat);
    roof.position.y = 108;
    tower.add(base, cabin, roof);
    tower.position.set(tx, ty, tz);
    group.add(tower);
  }

  // The gate: timber posts + tiled lintel at the wall gap
  const gateAngle = ((7.5 / wallSegments) * Math.PI * 2);
  const gx = CASTLE_CENTER.x + Math.cos(gateAngle) * wallRadius;
  const gz = CASTLE_CENTER.y + Math.sin(gateAngle) * wallRadius;
  const gy = heightAt(gx, gz);
  const gate = new THREE.Group();
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(14, 78, 14), timberMat);
    post.position.set(side * 46, 39, 0);
    gate.add(post);
  }
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(128, 14, 20), timberMat);
  lintel.position.y = 82;
  const gateRoof = new THREE.Mesh(new THREE.BoxGeometry(150, 8, 34), tileMat);
  gateRoof.position.y = 94;
  gate.add(lintel, gateRoof);
  gate.position.set(gx, gy, gz);
  gate.rotation.y = -gateAngle + Math.PI / 2;
  group.add(gate);

  return {
    group,
    gatePoint: new THREE.Vector3(gx, gy, gz),
  };
};
