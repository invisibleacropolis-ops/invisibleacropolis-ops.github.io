import * as THREE from "three";
import { createRng } from "../scene/random.ts";
import { fbm2D } from "../scene/noise.ts";
import { KAKURIYO, toon } from "./palette.ts";
import { WORLD_SIZE, TEMPLE_CENTER, POND_CENTER, heightAt, slopeAt } from "./terrain.ts";
import { isFree } from "./occupancy.ts";
import { applyWindSway } from "./shaders.ts";

/**
 * The living green of Kakuriyo: sakura in perpetual bloom around the
 * shrine, Japanese pines with their layered cloud-pruned canopies on the
 * hills, whispering bamboo in the hollows — and a slow snow of petals.
 */

export type Flora = {
  group: THREE.Group;
  update: (t: number, dt: number) => void;
  /** Sakura positions, so kodama know where to gather. */
  sakuraSpots: THREE.Vector3[];
};

type Placement = { x: number; y: number; z: number; scale: number; rotation: number };

const placeMatrix = (dummy: THREE.Object3D, p: Placement, yOffset: number) => {
  dummy.position.set(p.x, p.y + yOffset * p.scale, p.z);
  dummy.rotation.set(0, p.rotation, 0);
  dummy.scale.setScalar(p.scale);
  dummy.updateMatrix();
};

export const createFlora = (): Flora => {
  const group = new THREE.Group();
  const rng = createRng(0xf10a);
  const dummy = new THREE.Object3D();

  const trunkMat = toon(KAKURIYO.trunk);
  const sakuraMat = toon(KAKURIYO.sakura);
  const sakuraDeepMat = toon(KAKURIYO.sakuraDeep);
  const pineMat = toon(KAKURIYO.pine);
  const bambooMat = toon(KAKURIYO.bamboo);

  // The breeze: canopies rustle gently, bamboo swings with real intent
  applyWindSway(sakuraMat, 2.6, 1.0);
  applyWindSway(sakuraDeepMat, 2.6, 1.0);
  applyWindSway(pineMat, 1.6, 0.8);
  applyWindSway(bambooMat, 4.2, 1.35);

  /* ── Gather placements ── */
  const sakura: Placement[] = [];
  const pine: Placement[] = [];
  const bamboo: Placement[] = [];
  const sakuraSpots: THREE.Vector3[] = [];

  const tryPlace = (x: number, z: number, margin = 30): { y: number } | null => {
    if (Math.hypot(x, z) > WORLD_SIZE * 0.46) return null;
    const y = heightAt(x, z);
    if (y < 24) return null; // keep out of the pond
    if (slopeAt(x, z) > 0.85) return null;
    // Structures claimed their ground first; respect the register
    if (!isFree(x, z, margin)) return null;
    return { y };
  };

  // Sakura ring the shrine plateau and dot the southern meadows
  for (let i = 0; i < 90; i += 1) {
    const nearTemple = i < 40;
    const angle = rng() * Math.PI * 2;
    const r = nearTemple ? 480 + rng() * 500 : 900 + rng() * 2400;
    const cx = nearTemple ? TEMPLE_CENTER.x : 400;
    const cz = nearTemple ? TEMPLE_CENTER.y : 1600;
    const x = cx + Math.cos(angle) * r;
    const z = cz + Math.sin(angle) * r * (nearTemple ? 1 : 0.7);
    const spot = tryPlace(x, z);
    if (!spot) continue;
    const p = { x, y: spot.y, z, scale: 0.8 + rng() * 0.9, rotation: rng() * Math.PI * 2 };
    sakura.push(p);
    if (sakuraSpots.length < 14 && rng() < 0.4) {
      sakuraSpots.push(new THREE.Vector3(x, spot.y, z));
    }
  }

  // Pines prefer the higher hills, gathered in stands by noise
  for (let i = 0; i < 1400; i += 1) {
    const x = (rng() - 0.5) * WORLD_SIZE * 0.9;
    const z = (rng() - 0.5) * WORLD_SIZE * 0.9;
    const mask = fbm2D(x * (3.4 / WORLD_SIZE), z * (3.4 / WORLD_SIZE), 4451, 3);
    if (mask < 0.56) continue;
    const spot = tryPlace(x, z);
    if (!spot || spot.y < 60) continue;
    pine.push({ x, y: spot.y, z, scale: 0.7 + rng() * 1.2, rotation: rng() * Math.PI * 2 });
  }

  // Bamboo crowds the damp hollow north-east of the pond
  for (let i = 0; i < 420; i += 1) {
    const x = -300 + (rng() - 0.5) * 1500;
    const z = 1750 + (rng() - 0.5) * 1300;
    const spot = tryPlace(x, z, 14); // culms are slim; they may crowd closer
    if (!spot || spot.y > 170) continue;
    bamboo.push({ x, y: spot.y, z, scale: 0.8 + rng() * 0.8, rotation: rng() * Math.PI * 2 });
  }

  /* ── Sakura: gnarled trunk + two-tone blossom puffs ── */
  if (sakura.length > 0) {
    const trunkGeo = new THREE.CylinderGeometry(3, 6, 42, 5);
    const puffGeo = new THREE.IcosahedronGeometry(30, 1);
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, sakura.length);
    const crowns = new THREE.InstancedMesh(puffGeo, sakuraMat, sakura.length);
    const underCrowns = new THREE.InstancedMesh(puffGeo, sakuraDeepMat, sakura.length);

    sakura.forEach((p, i) => {
      placeMatrix(dummy, p, 21);
      trunks.setMatrixAt(i, dummy.matrix);
      dummy.position.y = p.y + 52 * p.scale;
      dummy.scale.set(p.scale * 1.15, p.scale * 0.85, p.scale * 1.15);
      dummy.updateMatrix();
      crowns.setMatrixAt(i, dummy.matrix);
      dummy.position.set(p.x + 14 * p.scale, p.y + 40 * p.scale, p.z - 8 * p.scale);
      dummy.scale.setScalar(p.scale * 0.7);
      dummy.updateMatrix();
      underCrowns.setMatrixAt(i, dummy.matrix);
    });
    group.add(trunks, crowns, underCrowns);
  }

  /* ── Pines: stacked flattened discs (cloud-pruned niwaki style) ── */
  if (pine.length > 0) {
    const trunkGeo = new THREE.CylinderGeometry(2.4, 4.2, 58, 5);
    const tierGeo = new THREE.SphereGeometry(22, 8, 5);
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, pine.length);
    const tiers = [
      new THREE.InstancedMesh(tierGeo, pineMat, pine.length),
      new THREE.InstancedMesh(tierGeo, pineMat, pine.length),
      new THREE.InstancedMesh(tierGeo, pineMat, pine.length),
    ];

    pine.forEach((p, i) => {
      placeMatrix(dummy, p, 29);
      trunks.setMatrixAt(i, dummy.matrix);
      const tierY = [46, 66, 84];
      const tierR = [1.25, 0.95, 0.6];
      tiers.forEach((tier, k) => {
        dummy.position.set(p.x, p.y + tierY[k]! * p.scale, p.z);
        dummy.scale.set(p.scale * tierR[k]!, p.scale * 0.42, p.scale * tierR[k]!);
        dummy.rotation.y = p.rotation + k;
        dummy.updateMatrix();
        tier.setMatrixAt(i, dummy.matrix);
      });
    });
    group.add(trunks, ...tiers);
  }

  /* ── Bamboo: tall slender culms with a small leaf tuft ── */
  if (bamboo.length > 0) {
    const culmGeo = new THREE.CylinderGeometry(1.6, 2.2, 95, 5);
    const tuftGeo = new THREE.ConeGeometry(9, 26, 5);
    const culms = new THREE.InstancedMesh(culmGeo, bambooMat, bamboo.length);
    const tufts = new THREE.InstancedMesh(tuftGeo, bambooMat, bamboo.length);

    bamboo.forEach((p, i) => {
      dummy.position.set(p.x, p.y + 47 * p.scale, p.z);
      dummy.rotation.set((rng() - 0.5) * 0.08, p.rotation, (rng() - 0.5) * 0.08);
      dummy.scale.setScalar(p.scale);
      dummy.updateMatrix();
      culms.setMatrixAt(i, dummy.matrix);
      dummy.position.y = p.y + 100 * p.scale;
      dummy.updateMatrix();
      tufts.setMatrixAt(i, dummy.matrix);
    });
    group.add(culms, tufts);
  }

  /* ── Falling sakura petals ── */
  const petalCount = 340;
  const petalGeo = new THREE.BufferGeometry();
  const petalPositions = new Float32Array(petalCount * 3);
  const petalSeeds = new Float32Array(petalCount);
  const petalHome: number[] = [];
  for (let i = 0; i < petalCount; i += 1) {
    const tree = sakura.length > 0 ? sakura[Math.floor(rng() * sakura.length)]! : { x: 0, y: 60, z: 0, scale: 1 };
    petalHome.push(tree.x, tree.y, tree.z);
    petalPositions[i * 3] = tree.x + (rng() - 0.5) * 120;
    petalPositions[i * 3 + 1] = tree.y + 20 + rng() * 70;
    petalPositions[i * 3 + 2] = tree.z + (rng() - 0.5) * 120;
    petalSeeds[i] = rng() * 100;
  }
  petalGeo.setAttribute("position", new THREE.BufferAttribute(petalPositions, 3));
  const petalMat = new THREE.PointsMaterial({
    color: KAKURIYO.sakura,
    size: 7,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
  });
  const petals = new THREE.Points(petalGeo, petalMat);
  petals.frustumCulled = false;
  group.add(petals);

  const petalAttr = petalGeo.getAttribute("position") as THREE.BufferAttribute;

  const update = (t: number, dt: number) => {
    for (let i = 0; i < petalCount; i += 1) {
      const seed = petalSeeds[i]!;
      let y = petalAttr.getY(i) - (8 + (seed % 5)) * dt;
      const x = petalAttr.getX(i) + Math.sin(t * 0.9 + seed) * 8 * dt;
      const z = petalAttr.getZ(i) + Math.cos(t * 0.7 + seed) * 8 * dt;
      const homeY = petalHome[i * 3 + 1]!;
      if (y < homeY - 55) {
        y = homeY + 30 + (seed % 60);
      }
      petalAttr.setXYZ(i, x, y, z);
    }
    petalAttr.needsUpdate = true;
  };

  return { group, update, sakuraSpots };
};
