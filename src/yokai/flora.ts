import * as THREE from "three";
import { createRng } from "../scene/random.ts";
import { fbm2D } from "../scene/noise.ts";
import { KAKURIYO, getToonGradient, toon } from "./palette.ts";
import { WORLD_SIZE, TEMPLE_CENTER, POND_CENTER, heightAt, slopeAt } from "./terrain.ts";
import { isFree } from "./occupancy.ts";
import { applyWindSway, gustAt, windTime, type WindProfile } from "./shaders.ts";
import { getPetalTexture } from "./textures.ts";
import { getWorldModel } from "./kamiModels.ts";
import { CASTLE_CENTER } from "./terrain.ts";

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

/** Sculpted species when flora.glb is loaded, the primitive set otherwise. */
export const createFlora = (): Flora => {
  const model = getWorldModel("flora");
  return model ? createSculptedFlora(model) : createPrimitiveFlora();
};

const createPrimitiveFlora = (): Flora => {
  const group = new THREE.Group();
  const rng = createRng(0xf10a);
  const dummy = new THREE.Object3D();

  const trunkMat = toon(KAKURIYO.trunk);
  const sakuraMat = toon(KAKURIYO.sakura);
  const sakuraDeepMat = toon(KAKURIYO.sakuraDeep);
  const pineMat = toon(KAKURIYO.pine);
  const bambooMat = toon(KAKURIYO.bamboo);

  // The breeze: canopies rustle gently, bamboo swings with real intent
  applyWindSway(sakuraMat, { amplitude: 2.6, height: 80 });
  applyWindSway(sakuraDeepMat, { amplitude: 2.6, height: 80 });
  applyWindSway(pineMat, { amplitude: 1.6, height: 90, frequency: 0.8 });
  applyWindSway(bambooMat, { amplitude: 4.2, height: 110, frequency: 1.35 });

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
    trunks.name = "sakura-trunks";
    crowns.name = "sakura-crowns";
    underCrowns.name = "sakura-crowns";

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
    trunks.name = "pine-trunks";
    tiers.forEach((tier, index) => {
      tier.name = `pine-canopy-${index}`;
    });

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
    map: getPetalTexture(),
    alphaTest: 0.08,
    size: 8,
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

/* ── Sculpted flora (tools/blender/flora_build.py) ─────────────────────────
 * Six species in several variants each, instanced per variant and part.
 * Variety comes cheaply: a random variant, scale, lean and per-instance tint
 * on every plant. Movement comes from the shared wind field: each species
 * bends by its own height and stiffness, crowns shimmer, and gust fronts
 * roll through the forest and the grass together. */
type Species = "sakura" | "pine" | "cedar" | "maple" | "bush" | "bamboo";
type Plant = Placement & { species: Species; variant: number; lean: [number, number] };

const SPECIES: Record<Species, { wind: WindProfile; ink: boolean; scale: [number, number]; tint: number }> = {
  sakura: { wind: { amplitude: 3.2, height: 85, flutter: 0.55, frequency: 1.0 }, ink: true, scale: [0.85, 1.35], tint: 0.07 },
  pine: { wind: { amplitude: 2.2, height: 85, flutter: 0.25, frequency: 0.8 }, ink: true, scale: [0.8, 1.4], tint: 0.09 },
  cedar: { wind: { amplitude: 5.0, height: 170, flutter: 0.2, frequency: 0.7 }, ink: false, scale: [0.75, 1.15], tint: 0.08 },
  maple: { wind: { amplitude: 2.8, height: 75, flutter: 0.75, frequency: 1.1 }, ink: true, scale: [0.8, 1.2], tint: 0.1 },
  bush: { wind: { amplitude: 0.9, height: 20, flutter: 0.4, frequency: 1.4 }, ink: false, scale: [0.8, 1.6], tint: 0.1 },
  bamboo: { wind: { amplitude: 10, height: 130, flutter: 0.9, frequency: 1.25 }, ink: false, scale: [0.8, 1.2], tint: 0.06 },
};

/** Falling petals or leaves around a set of trees, drifting on the gusts. */
const fallingLeaves = (homes: Placement[], count: number, color: string, size: number, rng: () => number) => {
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  const home: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const tree = homes.length > 0 ? homes[Math.floor(rng() * homes.length)]! : { x: 0, y: 60, z: 0, scale: 1, rotation: 0 };
    home.push(tree.x, tree.y, tree.z);
    positions[i * 3] = tree.x + (rng() - 0.5) * 120;
    positions[i * 3 + 1] = tree.y + 20 + rng() * 70;
    positions[i * 3 + 2] = tree.z + (rng() - 0.5) * 120;
    seeds[i] = rng() * 100;
  }
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const points = new THREE.Points(geometry, new THREE.PointsMaterial({
    color, map: getPetalTexture(), alphaTest: 0.08, size, sizeAttenuation: true,
    transparent: true, opacity: 0.92, depthWrite: false,
  }));
  points.frustumCulled = false;
  const attr = geometry.getAttribute("position") as THREE.BufferAttribute;
  const update = (t: number, dt: number) => {
    const wt = windTime.value;
    for (let i = 0; i < count; i += 1) {
      const seed = seeds[i]!;
      const hx = home[i * 3]!, hy = home[i * 3 + 1]!, hz = home[i * 3 + 2]!;
      const gust = gustAt(hx, hz, wt);
      let x = attr.getX(i) + (Math.sin(t * 0.9 + seed) * 8 + 0.8 * gust * 26) * dt;
      let y = attr.getY(i) - (8 + (seed % 5) - gust * 3) * dt;
      let z = attr.getZ(i) + (Math.cos(t * 0.7 + seed) * 8 + 0.6 * gust * 26) * dt;
      // Blown away or settled: drift back in from the crown.
      if (y < hy - 55 || Math.abs(x - hx) > 240 || Math.abs(z - hz) > 240) {
        x = hx + (rng() - 0.5) * 100;
        y = hy + 30 + (seed % 60);
        z = hz + (rng() - 0.5) * 100;
      }
      attr.setXYZ(i, x, y, z);
    }
    attr.needsUpdate = true;
  };
  return { points, update };
};

const createSculptedFlora = (model: THREE.Group): Flora => {
  const group = new THREE.Group();
  const rng = createRng(0xf10a);
  const dummy = new THREE.Object3D();
  const parts = new Map<string, THREE.BufferGeometry>();
  model.traverse((object) => { if (object instanceof THREE.Mesh) parts.set(object.name, object.geometry); });
  const variantCount = (species: Species) => {
    let n = 0;
    while (parts.has(`${species}_${n}_crown`)) n += 1;
    return n;
  };

  const plants: Plant[] = [];
  const sakuraSpots: THREE.Vector3[] = [];
  const tryPlace = (x: number, z: number, margin = 30): { y: number } | null => {
    if (Math.hypot(x, z) > WORLD_SIZE * 0.46) return null;
    const y = heightAt(x, z);
    if (y < 24) return null; // keep out of the pond
    if (slopeAt(x, z) > 0.85) return null;
    if (!isFree(x, z, margin)) return null;
    return { y };
  };
  const plant = (species: Species, x: number, z: number, margin = 30) => {
    const spot = tryPlace(x, z, margin);
    if (!spot) return null;
    const [lo, hi] = SPECIES[species].scale;
    const p: Plant = {
      species, x, y: spot.y, z,
      variant: Math.floor(rng() * Math.max(1, variantCount(species))),
      scale: lo + rng() * (hi - lo),
      rotation: rng() * Math.PI * 2,
      lean: [(rng() - 0.5) * 0.09, (rng() - 0.5) * 0.09],
    };
    plants.push(p);
    return p;
  };

  // Sakura ring the shrine plateau and dot the southern meadows
  for (let i = 0; i < 90; i += 1) {
    const nearTemple = i < 40;
    const angle = rng() * Math.PI * 2;
    const r = nearTemple ? 480 + rng() * 500 : 900 + rng() * 2400;
    const cx = nearTemple ? TEMPLE_CENTER.x : 400;
    const cz = nearTemple ? TEMPLE_CENTER.y : 1600;
    const p = plant("sakura", cx + Math.cos(angle) * r, cz + Math.sin(angle) * r * (nearTemple ? 1 : 0.7));
    if (p && sakuraSpots.length < 14 && rng() < 0.4) sakuraSpots.push(new THREE.Vector3(p.x, p.y, p.z));
  }

  // Maples blaze around the shrine, the castle gardens and the pond shore
  const maples: Array<[THREE.Vector2, number, number, number]> = [
    [TEMPLE_CENTER, 430, 720, 18], [CASTLE_CENTER, 700, 1050, 14], [POND_CENTER, 600, 860, 12],
  ];
  for (const [center, inner, outer, count] of maples) {
    for (let i = 0; i < Math.round(count * 1.2); i += 1) {
      const angle = rng() * Math.PI * 2, r = inner + rng() * (outer - inner);
      plant("maple", center.x + Math.cos(angle) * r, center.y + Math.sin(angle) * r);
    }
  }

  // Evergreen stands by noise: niwaki pines on the low hills, tall sugi
  // cedars taking over as the ground rises toward the rim
  for (let i = 0; i < 1400; i += 1) {
    const x = (rng() - 0.5) * WORLD_SIZE * 0.9;
    const z = (rng() - 0.5) * WORLD_SIZE * 0.9;
    const mask = fbm2D(x * (3.4 / WORLD_SIZE), z * (3.4 / WORLD_SIZE), 4451, 3);
    if (mask < 0.56) continue;
    if (heightAt(x, z) < 60) continue;
    const cedarChance = heightAt(x, z) > 260 ? 0.65 : 0.15;
    plant(rng() < cedarChance ? "cedar" : "pine", x, z);
  }

  // Bamboo crowds the damp hollow north-east of the pond
  for (let i = 0; i < 340; i += 1) {
    const x = -300 + (rng() - 0.5) * 1500;
    const z = 1750 + (rng() - 0.5) * 1300;
    if (heightAt(x, z) > 170) continue;
    plant("bamboo", x, z, 14);
  }

  // Azalea understorey: clumps at the feet of the trees, a few in the meadows
  const canopy = plants.filter((p) => p.species === "sakura" || p.species === "maple" || p.species === "pine");
  for (let i = 0; i < 230 && canopy.length; i += 1) {
    const tree = canopy[Math.floor(rng() * canopy.length)]!;
    const angle = rng() * Math.PI * 2, r = 26 + rng() * 40;
    plant("bush", tree.x + Math.cos(angle) * r, tree.z + Math.sin(angle) * r, 12);
  }
  for (let i = 0; i < 120; i += 1) {
    plant("bush", (rng() - 0.5) * WORLD_SIZE * 0.82, (rng() - 0.5) * WORLD_SIZE * 0.82, 14);
  }

  /* ── Instancing: one InstancedMesh per species, variant and part ── */
  const materials = new Map<string, THREE.MeshToonMaterial>();
  const materialFor = (species: Species, part: "trunk" | "crown") => {
    const key = `${species}:${part}`;
    let mat = materials.get(key);
    if (!mat) {
      mat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: getToonGradient() });
      const wind = SPECIES[species].wind;
      // Trunks bend with their crowns but do not shimmer.
      applyWindSway(mat, part === "trunk" ? { ...wind, flutter: 0 } : wind);
      materials.set(key, mat);
    }
    return mat;
  };
  const groups = new Map<string, Plant[]>();
  for (const p of plants) {
    const key = `${p.species}_${p.variant}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(p);
  }
  const tint = new THREE.Color();
  for (const [key, list] of groups) {
    const species = list[0]!.species;
    for (const part of ["trunk", "crown"] as const) {
      const geometry = parts.get(`${key}_${part}`);
      if (!geometry) continue;
      const mesh = new THREE.InstancedMesh(geometry, materialFor(species, part), list.length);
      mesh.name = `${key}-${part}`;
      mesh.userData.inkCanopy = part === "crown" && SPECIES[species].ink;
      list.forEach((p, i) => {
        dummy.position.set(p.x, p.y - 1.5 * p.scale, p.z);
        dummy.rotation.set(p.lean[0], p.rotation, p.lean[1]);
        dummy.scale.setScalar(p.scale);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
        // Per-plant colour: a little lighter or deeper, warmer or cooler.
        const spread = SPECIES[species].tint * (part === "crown" ? 1 : 0.5);
        const value = 1 + (rng() - 0.5) * 2 * spread;
        const warm = (rng() - 0.5) * spread;
        tint.setRGB(value * (1 + warm), value, value * (1 - warm));
        mesh.setColorAt(i, tint);
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      group.add(mesh);
    }
  }

  /* ── Falling sakura petals and maple leaves, riding the gusts ── */
  const homesOf = (species: Species) => plants.filter((p) => p.species === species);
  const petals = fallingLeaves(homesOf("sakura"), 340, KAKURIYO.sakura, 8, rng);
  const leaves = fallingLeaves(homesOf("maple"), 160, "#e0643c", 10, rng);
  group.add(petals.points, leaves.points);

  const update = (t: number, dt: number) => {
    petals.update(t, dt);
    leaves.update(t, dt);
  };
  return { group, update, sakuraSpots };
};
