import * as THREE from "three";
import { createRng } from "../scene/random.ts";
import { KAKURIYO, getToonGradient, toon } from "./palette.ts";
import { POND_CENTER, TEMPLE_CENTER, heightAt, slopeAt } from "./terrain.ts";
import { SACRED_PEAK } from "./mountains.ts";

/* ═══════════════════════════════════════════════════════════════
   The spirits of Kakuriyo — yokai and animal kami going about
   their business. Ground spirits wander: walk somewhere, pause,
   consider the world, wander on. Sky spirits ride slow circuits.
   Kodama simply watch from beneath the sakura.

     · Kitsune        — white nine-tailed fox, patrols the torii path
     · Tanuki         — round and unbothered, ambles by the bamboo
     · Kappa          — hops along the pond shore
     · Shika kami     — golden deer spirit grazing the meadows
     · Karakasa-obake — one-legged umbrella, hops the shrine road
     · Nekomata       — forked-tail cat, prowls the plateau
     · Ryū            — jade river-dragon circling the sacred peak
     · Tengu          — crow-winged, rides the air around the pagoda
     · Hitodama       — pale soul-flames adrift among the lanterns
     · Kodama         — small white watchers beneath the blossoms
     · Komainu        — (stone; they guard, in architecture.ts)
   ═══════════════════════════════════════════════════════════════ */

export type SpiritLayer = {
  group: THREE.Group;
  update: (t: number, dt: number) => void;
  /** Stories cast the leads; the ambient double steps offstage meanwhile. */
  setHidden: (name: string, hidden: boolean) => void;
};

export type SpiritBuild = {
  group: THREE.Group;
  /** moving01: 0 idle → 1 walking, already smoothed by the AI. */
  animate: (t: number, phase: number, moving01: number) => void;
};

/* ── Shared body-part helpers (all builds face +Z) ── */

const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material) => new THREE.Mesh(geo, mat);

const limb = (mat: THREE.Material, r: number, len: number, x: number, y: number, z: number) => {
  const hip = new THREE.Group();
  hip.position.set(x, y, z);
  const bone = mesh(new THREE.CylinderGeometry(r * 0.75, r, len, 5), mat);
  bone.position.y = -len / 2;
  hip.add(bone);
  return hip;
};

/* ═══ Builders ════════════════════════════════════════════════ */

export const buildKitsune = (): SpiritBuild => {
  const white = toon(KAKURIYO.spiritWhite);
  const red = toon(KAKURIYO.foxRed);
  const group = new THREE.Group();

  const body = mesh(new THREE.CapsuleGeometry(9, 22, 4, 8), white);
  body.rotation.x = Math.PI / 2;
  body.position.y = 22;
  group.add(body);

  const head = mesh(new THREE.ConeGeometry(7.5, 16, 6), white);
  head.rotation.x = Math.PI / 2.6;
  head.position.set(0, 30, 18);
  group.add(head);
  for (const side of [-1, 1]) {
    const ear = mesh(new THREE.ConeGeometry(3, 9, 4), red);
    ear.position.set(side * 4.5, 39, 13);
    group.add(ear);
  }

  const legs = [
    limb(white, 2.2, 20, 5, 20, 12),
    limb(white, 2.2, 20, -5, 20, 12),
    limb(white, 2.2, 20, 5, 20, -10),
    limb(white, 2.2, 20, -5, 20, -10),
  ];
  legs.forEach((l) => group.add(l));

  const tails: THREE.Group[] = [];
  for (let i = 0; i < 5; i += 1) {
    const root = new THREE.Group();
    root.position.set(0, 26, -18);
    root.rotation.y = (i - 2) * 0.34;
    const tail = mesh(new THREE.ConeGeometry(3.4, 24, 5), white);
    tail.position.z = -12;
    tail.rotation.x = -Math.PI / 2 - 0.5;
    const tip = mesh(new THREE.SphereGeometry(2.6, 5, 4), red);
    tip.position.set(0, 8, -21);
    root.add(tail, tip);
    tails.push(root);
    group.add(root);
  }

  return {
    group,
    animate: (t, phase, moving) => {
      const gait = t * 7 + phase;
      legs.forEach((l, i) => {
        l.rotation.x = Math.sin(gait + (i % 2 === 0 ? 0 : Math.PI)) * 0.55 * moving;
      });
      group.position.y = Math.abs(Math.sin(gait)) * 2.4 * moving;
      tails.forEach((tail, i) => {
        tail.rotation.x = Math.sin(t * 1.8 + i * 0.8 + phase) * 0.16 - 0.1;
      });
      head.rotation.z = Math.sin(t * 0.7 + phase) * 0.1 * (1 - moving);
    },
  };
};

export const buildTanuki = (): SpiritBuild => {
  const brown = toon(KAKURIYO.tanukiBrown);
  const cream = toon("#e8d7b8");
  const dark = toon("#4a3826");
  const group = new THREE.Group();

  const belly = mesh(new THREE.SphereGeometry(14, 9, 7), cream);
  belly.position.set(0, 20, 3);
  const body = mesh(new THREE.SphereGeometry(15, 9, 7), brown);
  body.position.set(0, 22, -2);
  body.scale.set(1, 1.1, 1);
  const head = mesh(new THREE.SphereGeometry(9, 8, 6), brown);
  head.position.set(0, 42, 4);
  const maskL = mesh(new THREE.SphereGeometry(3.4, 5, 4), dark);
  maskL.position.set(4, 44, 11);
  const maskR = maskL.clone();
  maskR.position.x = -4;
  const snout = mesh(new THREE.ConeGeometry(3, 6, 5), cream);
  snout.rotation.x = Math.PI / 2;
  snout.position.set(0, 41, 13);
  for (const side of [-1, 1]) {
    const ear = mesh(new THREE.SphereGeometry(2.8, 5, 4), dark);
    ear.position.set(side * 6, 50, 2);
    group.add(ear);
  }
  const tail = mesh(new THREE.SphereGeometry(6, 6, 5), brown);
  tail.position.set(0, 22, -16);
  tail.scale.set(0.8, 0.8, 1.4);
  group.add(belly, body, head, maskL, maskR, snout, tail);

  const feet = [limb(brown, 3, 10, 6, 10, 4), limb(brown, 3, 10, -6, 10, 4)];
  feet.forEach((f) => group.add(f));

  return {
    group,
    animate: (t, phase, moving) => {
      const gait = t * 5 + phase;
      group.rotation.z = Math.sin(gait) * 0.12 * moving; // the waddle
      feet.forEach((f, i) => {
        f.rotation.x = Math.sin(gait + (i === 0 ? 0 : Math.PI)) * 0.5 * moving;
      });
      group.position.y = Math.abs(Math.sin(gait)) * 1.6 * moving;
      belly.scale.setScalar(1 + Math.sin(t * 1.1 + phase) * 0.03); // idle breathing
    },
  };
};

export const buildKappa = (): SpiritBuild => {
  const green = toon(KAKURIYO.kappaGreen);
  const shellMat = toon("#5a7a42");
  const dishMat = toon("#d9e8c4");
  const beak = toon("#e8c86a");
  const group = new THREE.Group();

  const body = mesh(new THREE.SphereGeometry(10, 8, 6), green);
  body.position.y = 18;
  body.scale.set(1, 1.15, 0.9);
  const shell = mesh(new THREE.SphereGeometry(10.5, 8, 6), shellMat);
  shell.position.set(0, 19, -5);
  shell.scale.set(1, 1, 0.6);
  const head = mesh(new THREE.SphereGeometry(7, 8, 6), green);
  head.position.y = 33;
  const dish = mesh(new THREE.CylinderGeometry(4.6, 5.2, 1.6, 10), dishMat);
  dish.position.y = 39.5;
  const bill = mesh(new THREE.ConeGeometry(2.6, 5, 5), beak);
  bill.rotation.x = Math.PI / 2;
  bill.position.set(0, 33, 7.5);
  group.add(body, shell, head, dish, bill);

  const legs = [limb(green, 2.6, 12, 5, 12, 0), limb(green, 2.6, 12, -5, 12, 0)];
  const arms = [limb(green, 2, 12, 10, 28, 0), limb(green, 2, 12, -10, 28, 0)];
  legs.forEach((l) => group.add(l));
  arms.forEach((a) => group.add(a));

  return {
    group,
    animate: (t, phase, moving) => {
      const hopT = (t * 2.2 + phase) % 1.4;
      const hop = hopT < 0.5 ? Math.sin((hopT / 0.5) * Math.PI) : 0;
      group.position.y = hop * 9 * moving;
      legs.forEach((l) => {
        l.rotation.x = (hop - 0.4) * 0.8 * moving;
      });
      arms.forEach((a, i) => {
        a.rotation.z = (i === 0 ? 1 : -1) * (0.5 + hop * 0.5 * moving);
      });
      dish.rotation.y = t * 0.4;
    },
  };
};

export const buildShika = (): SpiritBuild => {
  const gold = toon("#d9b98a");
  const cream = toon("#f0e6cf");
  const antlerMat = toon("#e8dbc0");
  const group = new THREE.Group();

  const body = mesh(new THREE.CapsuleGeometry(10, 26, 4, 8), gold);
  body.rotation.x = Math.PI / 2;
  body.position.y = 34;
  const chest = mesh(new THREE.SphereGeometry(9, 7, 6), cream);
  chest.position.set(0, 33, 14);
  const neck = mesh(new THREE.CylinderGeometry(4, 5.5, 20, 6), gold);
  neck.position.set(0, 48, 16);
  neck.rotation.x = 0.5;
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 58, 21);
  const head = mesh(new THREE.BoxGeometry(7, 8, 14), gold);
  head.position.z = 3;
  headGroup.add(head);
  for (const side of [-1, 1]) {
    const antlerA = mesh(new THREE.CylinderGeometry(0.9, 1.4, 16, 4), antlerMat);
    antlerA.position.set(side * 3, 12, -1);
    antlerA.rotation.z = side * 0.4;
    const antlerB = mesh(new THREE.CylinderGeometry(0.7, 1, 10, 4), antlerMat);
    antlerB.position.set(side * 6.5, 16, 1);
    antlerB.rotation.z = side * 1.0;
    headGroup.add(antlerA, antlerB);
    const ear = mesh(new THREE.ConeGeometry(2.2, 6, 4), cream);
    ear.position.set(side * 5, 6, -3);
    ear.rotation.z = side * 1.1;
    headGroup.add(ear);
  }
  group.add(body, chest, neck, headGroup);

  const legs = [
    limb(gold, 1.9, 30, 5.5, 30, 12),
    limb(gold, 1.9, 30, -5.5, 30, 12),
    limb(gold, 1.9, 30, 5.5, 30, -12),
    limb(gold, 1.9, 30, -5.5, 30, -12),
  ];
  legs.forEach((l) => group.add(l));

  return {
    group,
    animate: (t, phase, moving) => {
      const gait = t * 5.4 + phase;
      legs.forEach((l, i) => {
        l.rotation.x = Math.sin(gait + (i % 2 === 0 ? 0 : Math.PI) + (i < 2 ? 0 : 0.6)) * 0.5 * moving;
      });
      group.position.y = Math.abs(Math.sin(gait)) * 1.8 * moving;
      // Grazing when idle: the head dips to the grass and lifts to listen
      const graze = (1 - moving) * (Math.sin(t * 0.45 + phase) * 0.5 + 0.5);
      headGroup.rotation.x = graze * 1.1;
      headGroup.position.y = 58 - graze * 16;
    },
  };
};

const buildKarakasa = (): SpiritBuild => {
  const umbrella = toon("#b8543c");
  const paper = toon(KAKURIYO.paperWhite);
  const dark = toon("#3a3230");
  const group = new THREE.Group();

  const canopy = mesh(new THREE.ConeGeometry(16, 14, 10), umbrella);
  canopy.position.y = 40;
  const ribs = mesh(new THREE.ConeGeometry(16.4, 13, 10), paper);
  ribs.position.y = 39.4;
  ribs.scale.set(1, 0.35, 1);
  const eye = mesh(new THREE.SphereGeometry(4, 8, 6), paper);
  eye.position.set(0, 34, 9);
  const pupil = mesh(new THREE.SphereGeometry(1.8, 6, 5), dark);
  pupil.position.set(0, 34, 12.4);
  const tongue = mesh(new THREE.BoxGeometry(3.4, 9, 1.6), toon("#d0442a"));
  tongue.position.set(0, 26, 8);
  tongue.rotation.x = 0.4;
  const leg = mesh(new THREE.CylinderGeometry(1.8, 1.8, 26, 5), dark);
  leg.position.y = 14;
  const geta = mesh(new THREE.BoxGeometry(8, 2.4, 14), toon(KAKURIYO.templeWood));
  geta.position.y = 1.5;
  group.add(canopy, ribs, eye, pupil, tongue, leg, geta);

  return {
    group,
    animate: (t, phase, moving) => {
      const hopT = (t * 2.6 + phase) % 1.1;
      const hop = hopT < 0.45 ? Math.sin((hopT / 0.45) * Math.PI) : 0;
      group.position.y = hop * 14 * moving;
      group.rotation.z = Math.sin(t * 2.6 + phase) * 0.1 * moving;
      canopy.scale.y = 1 - hop * 0.25 * moving; // squash on landing
      tongue.rotation.x = 0.4 + Math.sin(t * 3 + phase) * 0.25;
    },
  };
};

const buildNekomata = (): SpiritBuild => {
  const fur = toon("#5a4d63");
  const cream = toon("#e8ddc9");
  const group = new THREE.Group();

  const body = mesh(new THREE.CapsuleGeometry(7, 16, 4, 8), fur);
  body.rotation.x = Math.PI / 2;
  body.position.y = 16;
  const head = mesh(new THREE.SphereGeometry(6.4, 8, 6), fur);
  head.position.set(0, 24, 13);
  for (const side of [-1, 1]) {
    const ear = mesh(new THREE.ConeGeometry(2.4, 6, 4), fur);
    ear.position.set(side * 3.6, 30, 11);
    group.add(ear);
  }
  const muzzle = mesh(new THREE.SphereGeometry(3, 6, 5), cream);
  muzzle.position.set(0, 22.4, 17.6);
  group.add(body, head, muzzle);

  const legs = [
    limb(fur, 1.7, 14, 4, 14, 9),
    limb(fur, 1.7, 14, -4, 14, 9),
    limb(fur, 1.7, 14, 4, 14, -8),
    limb(fur, 1.7, 14, -4, 14, -8),
  ];
  legs.forEach((l) => group.add(l));

  // The forked twin tails that mark a nekomata
  const tails: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    const tail = mesh(new THREE.ConeGeometry(2, 20, 5), fur);
    tail.position.set(side * 3, 22, -16);
    tail.rotation.x = -Math.PI / 2 - 0.7;
    tail.rotation.z = side * 0.4;
    tails.push(tail);
    group.add(tail);
  }

  return {
    group,
    animate: (t, phase, moving) => {
      const gait = t * 6.4 + phase;
      legs.forEach((l, i) => {
        l.rotation.x = Math.sin(gait + (i % 2 === 0 ? 0 : Math.PI)) * 0.5 * moving;
      });
      group.position.y = Math.abs(Math.sin(gait)) * 1.4 * moving;
      tails.forEach((tail, i) => {
        tail.rotation.z = (i === 0 ? 0.4 : -0.4) + Math.sin(t * 2.4 + phase + i * 2) * 0.35;
      });
    },
  };
};

export const buildRyu = (): SpiritBuild => {
  const jade = toon("#7fc9a8");
  const cream = toon(KAKURIYO.paperWhite);
  const coral = toon(KAKURIYO.foxRed);
  const group = new THREE.Group();

  const segments: THREE.Mesh[] = [];
  for (let i = 0; i < 15; i += 1) {
    const s = mesh(new THREE.SphereGeometry(13 - i * 0.55, 8, 6), jade);
    s.position.z = -i * 20;
    segments.push(s);
    group.add(s);
    if (i > 0 && i % 2 === 0) {
      const spine = mesh(new THREE.ConeGeometry(3, 10, 4), cream);
      spine.position.set(0, 11 - i * 0.4, -i * 20);
      group.add(spine);
    }
  }
  const skull = mesh(new THREE.BoxGeometry(18, 14, 26), jade);
  skull.position.z = 18;
  const snout = mesh(new THREE.BoxGeometry(10, 8, 14), jade);
  snout.position.set(0, -2, 34);
  const mane = mesh(new THREE.SphereGeometry(14, 7, 5), cream);
  mane.position.set(0, 4, 8);
  for (const side of [-1, 1]) {
    const horn = mesh(new THREE.CylinderGeometry(1.4, 2.4, 18, 4), cream);
    horn.position.set(side * 6, 14, 12);
    horn.rotation.z = side * 0.5;
    horn.rotation.x = -0.5;
    group.add(horn);
    const whisker = mesh(new THREE.CylinderGeometry(0.5, 0.5, 24, 3), coral);
    whisker.position.set(side * 8, -3, 34);
    whisker.rotation.z = side * 1.2;
    group.add(whisker);
  }
  const fluke = mesh(new THREE.ConeGeometry(9, 20, 5), cream);
  fluke.position.set(0, 0, -15 * 20 + 6);
  fluke.rotation.x = Math.PI / 2;
  group.add(skull, snout, mane, fluke);

  return {
    group,
    animate: (t, phase) => {
      segments.forEach((s, i) => {
        s.position.x = Math.sin(t * 1.7 - i * 0.5 + phase) * 3.2 * Math.sqrt(i + 1);
        s.position.y = Math.cos(t * 1.3 - i * 0.42 + phase) * 2.2 * Math.sqrt(i + 1);
      });
    },
  };
};

const buildTengu = (): SpiritBuild => {
  const red = toon(KAKURIYO.foxRed);
  const dark = toon("#2e2a33");
  const cream = toon(KAKURIYO.paperWhite);
  const group = new THREE.Group();

  const body = mesh(new THREE.CapsuleGeometry(8, 14, 4, 8), red);
  body.position.y = 0;
  const head = mesh(new THREE.SphereGeometry(6.5, 8, 6), red);
  head.position.set(0, 15, 2);
  const beakNose = mesh(new THREE.ConeGeometry(2.6, 12, 5), dark);
  beakNose.rotation.x = Math.PI / 2;
  beakNose.position.set(0, 15, 10);
  const hat = mesh(new THREE.BoxGeometry(5, 2.4, 5), dark);
  hat.position.set(0, 21.5, 2);
  group.add(body, head, beakNose, hat);

  const wings: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const wing = new THREE.Group();
    wing.position.set(side * 7, 6, -2);
    const feather = mesh(new THREE.BoxGeometry(26, 2, 12), dark);
    feather.position.x = side * 13;
    const feather2 = mesh(new THREE.BoxGeometry(16, 1.6, 9), cream);
    feather2.position.set(side * 24, -1, -2);
    wing.add(feather, feather2);
    wings.push(wing);
    group.add(wing);
  }
  const fan = mesh(new THREE.ConeGeometry(6, 2, 7), cream);
  fan.position.set(9, 4, 6);
  fan.rotation.x = Math.PI / 2;
  group.add(fan);

  return {
    group,
    animate: (t, phase) => {
      const flap = Math.sin(t * 4.4 + phase) * 0.5;
      wings[0]!.rotation.z = 0.2 + flap;
      wings[1]!.rotation.z = -0.2 - flap;
      group.rotation.z = Math.sin(t * 0.9 + phase) * 0.1;
    },
  };
};

export const buildHitodama = (): SpiritBuild => {
  const group = new THREE.Group();
  const flameMat = new THREE.MeshBasicMaterial({
    color: KAKURIYO.spiritGlow,
    transparent: true,
    opacity: 0.75,
  });
  const coreMat = new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, opacity: 0.9 });

  const flame = mesh(new THREE.ConeGeometry(6, 18, 7), flameMat);
  flame.rotation.x = Math.PI; // teardrop, tail up
  flame.position.y = 6;
  const core = mesh(new THREE.SphereGeometry(4.4, 8, 6), coreMat);
  const tail = mesh(new THREE.ConeGeometry(2.4, 14, 5), flameMat);
  tail.rotation.x = Math.PI + 0.5;
  tail.position.set(0, 10, -6);
  group.add(flame, core, tail);

  return {
    group,
    animate: (t, phase) => {
      const flicker = 0.85 + Math.sin(t * 6 + phase) * 0.1 + Math.sin(t * 13.7 + phase * 2) * 0.05;
      group.scale.setScalar(flicker);
      flameMat.opacity = 0.55 + Math.sin(t * 4.2 + phase) * 0.18;
    },
  };
};

export const buildOni = (): SpiritBuild => {
  const red = toon("#c04432");
  const dark = toon("#33261f");
  const bone = toon("#f0e6d0");
  const tigerY = toon("#d9a83c");
  const group = new THREE.Group();

  const body = mesh(new THREE.SphereGeometry(16, 9, 7), red);
  body.position.y = 34;
  body.scale.set(1, 1.2, 0.85);
  const head = mesh(new THREE.SphereGeometry(9.5, 8, 6), red);
  head.position.y = 60;
  const hair = mesh(new THREE.SphereGeometry(9.5, 7, 5), dark);
  hair.position.y = 64;
  hair.scale.set(1.05, 0.6, 1.05);
  for (const side of [-1, 1]) {
    const horn = mesh(new THREE.ConeGeometry(2.4, 10, 5), bone);
    horn.position.set(side * 5, 70, 2);
    horn.rotation.z = side * -0.3;
    group.add(horn);
    const tusk = mesh(new THREE.ConeGeometry(1.2, 4, 4), bone);
    tusk.position.set(side * 3.4, 55, 8.4);
    group.add(tusk);
  }
  // Tiger-stripe loincloth
  const cloth = mesh(new THREE.CylinderGeometry(13, 15, 12, 8), tigerY);
  cloth.position.y = 20;
  for (let i = 0; i < 5; i += 1) {
    const stripe = mesh(new THREE.BoxGeometry(3.4, 11, 1.6), dark);
    const a = (i / 5) * Math.PI * 2;
    stripe.position.set(Math.cos(a) * 14, 20, Math.sin(a) * 14);
    stripe.rotation.y = -a;
    group.add(stripe);
  }
  group.add(body, head, hair, cloth);

  const legs = [limb(red, 4.4, 16, 7, 14, 0), limb(red, 4.4, 16, -7, 14, 0)];
  legs.forEach((l) => group.add(l));

  // The kanabō, studded and dragged along
  const armR = limb(red, 3.4, 18, 16, 46, 2);
  const club = mesh(new THREE.CylinderGeometry(3.4, 5.2, 44, 7), dark);
  club.position.set(0, -34, 0);
  for (let i = 0; i < 6; i += 1) {
    const stud = mesh(new THREE.SphereGeometry(1.4, 4, 4), bone);
    const a = (i / 6) * Math.PI * 2;
    stud.position.set(Math.cos(a) * 5, -44 + (i % 3) * 8, Math.sin(a) * 5);
    armR.add(stud);
  }
  armR.add(club);
  const armL = limb(red, 3.4, 18, -16, 46, 2);
  group.add(armR, armL);

  return {
    group,
    animate: (t, phase, moving) => {
      const gait = t * 3.1 + phase; // a heavy stomp
      legs.forEach((l, i) => {
        l.rotation.x = Math.sin(gait + (i === 0 ? 0 : Math.PI)) * 0.55 * moving;
      });
      group.position.y = Math.abs(Math.sin(gait)) * 3.4 * moving;
      group.rotation.z = Math.sin(gait) * 0.06 * moving;
      armL.rotation.x = Math.sin(gait) * 0.4 * moving;
      armR.rotation.x = 0.5; // club dragging behind
      head.rotation.y = Math.sin(t * 0.5 + phase) * 0.3 * (1 - moving);
    },
  };
};

export const buildYukiOnna = (): SpiritBuild => {
  const snow = new THREE.MeshToonMaterial({
    color: "#f2f4f7",
    gradientMap: getToonGradient(),
    transparent: true,
    opacity: 0.92,
  });
  const hairMat = toon("#20242e");
  const skin = toon("#f6ead8");
  const group = new THREE.Group();

  // The kimono tapers to nothing — she has no feet
  const robe = mesh(new THREE.ConeGeometry(13, 58, 8), snow);
  robe.position.y = 34;
  const shoulders = mesh(new THREE.SphereGeometry(8, 8, 6), snow);
  shoulders.position.y = 60;
  const head = mesh(new THREE.SphereGeometry(6, 8, 6), skin);
  head.position.y = 72;
  const hairBack = mesh(new THREE.ConeGeometry(7, 40, 7), hairMat);
  hairBack.position.set(0, 56, -4);
  const hairCrown = mesh(new THREE.SphereGeometry(6.4, 8, 6), hairMat);
  hairCrown.position.set(0, 74.5, -1);
  hairCrown.scale.set(1.05, 0.8, 1.05);
  const sleeves: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    const sleeve = mesh(new THREE.ConeGeometry(4.4, 26, 6), snow);
    sleeve.position.set(side * 12, 52, 0);
    sleeve.rotation.z = side * 0.9;
    sleeves.push(sleeve);
    group.add(sleeve);
  }
  group.add(robe, shoulders, head, hairBack, hairCrown);

  return {
    group,
    animate: (t, phase, moving) => {
      // She glides: a slow vertical breath, robes swaying, no steps at all
      group.position.y = 6 + Math.sin(t * 0.8 + phase) * 3;
      group.rotation.z = Math.sin(t * 0.6 + phase) * 0.05 + moving * 0.06;
      sleeves.forEach((sleeve, i) => {
        sleeve.rotation.z = (i === 0 ? 0.9 : -0.9) + Math.sin(t * 1.1 + phase + i) * 0.2;
      });
      hairBack.rotation.x = Math.sin(t * 0.9 + phase) * 0.08 - moving * 0.12;
    },
  };
};

export const buildChochin = (): SpiritBuild => {
  const paper = toon("#f2d9a4");
  const rim = toon("#7d4230");
  const dark = new THREE.MeshBasicMaterial({ color: "#2a2320" });
  const tongueMat = toon("#c8452e");
  const group = new THREE.Group();

  const lanternBody = mesh(new THREE.CylinderGeometry(11, 11, 22, 10), paper);
  lanternBody.position.y = 14;
  // Ribs
  for (let i = 0; i < 4; i += 1) {
    const rib = mesh(new THREE.TorusGeometry(11.2, 0.7, 5, 14), rim);
    rib.rotation.x = Math.PI / 2;
    rib.position.y = 6 + i * 5.4;
    group.add(rib);
  }
  const capTop = mesh(new THREE.CylinderGeometry(6, 8, 4, 8), rim);
  capTop.position.y = 27;
  const capBottom = mesh(new THREE.CylinderGeometry(8, 6, 4, 8), rim);
  capBottom.position.y = 1;
  // The single great eye
  const eye = mesh(new THREE.SphereGeometry(4.4, 8, 6), toon("#f7f2e4"));
  eye.position.set(0, 17, 10);
  const pupil = mesh(new THREE.SphereGeometry(2, 6, 5), dark);
  pupil.position.set(0, 17, 13.6);
  // The split mouth and lolling tongue
  const mouth = mesh(new THREE.BoxGeometry(12, 2.4, 2), dark);
  mouth.position.set(0, 9, 10.4);
  const tongue = mesh(new THREE.BoxGeometry(5, 14, 2), tongueMat);
  tongue.position.set(0, 2, 11);
  tongue.rotation.x = 0.35;
  group.add(lanternBody, capTop, capBottom, eye, pupil, mouth, tongue);

  return {
    group,
    animate: (t, phase) => {
      group.rotation.z = Math.sin(t * 1.3 + phase) * 0.18; // lantern swing
      tongue.rotation.x = 0.35 + Math.sin(t * 2.2 + phase) * 0.2;
      const glow = 0.94 + Math.sin(t * 5 + phase) * 0.06;
      lanternBody.scale.set(glow, 1, glow);
    },
  };
};

const buildBaku = (): SpiritBuild => {
  const slate = toon("#8a93a8");
  const cream = toon("#e8e2d2");
  const dark = toon("#3c4252");
  const group = new THREE.Group();

  const body = mesh(new THREE.CapsuleGeometry(12, 22, 4, 8), slate);
  body.rotation.x = Math.PI / 2;
  body.position.y = 26;
  const mane = mesh(new THREE.SphereGeometry(10, 7, 6), dark);
  mane.position.set(0, 34, 12);
  const head = mesh(new THREE.SphereGeometry(8, 8, 6), slate);
  head.position.set(0, 36, 20);
  // The dream-drinking trunk
  const trunkA = mesh(new THREE.CylinderGeometry(2.6, 3.4, 14, 6), slate);
  trunkA.position.set(0, 32, 29);
  trunkA.rotation.x = 1.1;
  const trunkB = mesh(new THREE.CylinderGeometry(2, 2.6, 10, 6), slate);
  trunkB.position.set(0, 26, 34);
  trunkB.rotation.x = 1.5;
  for (const side of [-1, 1]) {
    const tusk = mesh(new THREE.ConeGeometry(1.3, 6, 4), cream);
    tusk.position.set(side * 4.4, 31, 26);
    tusk.rotation.x = 1.2;
    group.add(tusk);
    const ear = mesh(new THREE.SphereGeometry(3, 5, 4), dark);
    ear.position.set(side * 6.5, 43, 16);
    group.add(ear);
  }
  const tail = mesh(new THREE.ConeGeometry(2.4, 12, 5), dark);
  tail.position.set(0, 28, -22);
  tail.rotation.x = Math.PI / 2 + 0.6;
  group.add(body, mane, head, trunkA, trunkB, tail);

  const legs = [
    limb(slate, 2.8, 22, 7, 22, 12),
    limb(slate, 2.8, 22, -7, 22, 12),
    limb(slate, 2.8, 22, 7, 22, -10),
    limb(slate, 2.8, 22, -7, 22, -10),
  ];
  legs.forEach((l) => group.add(l));

  return {
    group,
    animate: (t, phase, moving) => {
      const gait = t * 4 + phase;
      legs.forEach((l, i) => {
        l.rotation.x = Math.sin(gait + (i % 2 === 0 ? 0 : Math.PI)) * 0.45 * moving;
      });
      group.position.y = Math.abs(Math.sin(gait)) * 1.6 * moving;
      trunkB.rotation.x = 1.5 + Math.sin(t * 1.4 + phase) * 0.25;
      tail.rotation.z = Math.sin(t * 2 + phase) * 0.3;
    },
  };
};

export const buildKodama = (): SpiritBuild => {
  const white = toon(KAKURIYO.spiritWhite);
  const dark = new THREE.MeshBasicMaterial({ color: "#2a2f2c" });
  const group = new THREE.Group();

  const body = mesh(new THREE.CylinderGeometry(3.4, 4.4, 12, 7), white);
  body.position.y = 6;
  const headGroup = new THREE.Group();
  headGroup.position.y = 15;
  const head = mesh(new THREE.SphereGeometry(6, 8, 6), white);
  head.scale.set(1, 1.15, 0.95);
  headGroup.add(head);
  const eyeL = mesh(new THREE.CircleGeometry(1.3, 6), dark);
  eyeL.position.set(2.2, 1.5, 5.6);
  const eyeR = mesh(new THREE.CircleGeometry(1.1, 6), dark);
  eyeR.position.set(-2.4, 0.8, 5.6);
  const mouth = mesh(new THREE.CircleGeometry(0.9, 6), dark);
  mouth.position.set(0.4, -2.2, 5.7);
  headGroup.add(eyeL, eyeR, mouth);
  group.add(body, headGroup);

  return {
    group,
    animate: (t, phase) => {
      // Long stillness, then the sudden rattle head-shake
      const cycle = (t * 0.08 + phase) % 1;
      if (cycle > 0.94) {
        headGroup.rotation.y = Math.sin(t * 34 + phase) * 0.4;
      } else {
        const tilt = Math.floor((t * 0.11 + phase) % 3) - 1;
        headGroup.rotation.z += (tilt * 0.3 - headGroup.rotation.z) * 0.02;
        headGroup.rotation.y *= 0.9;
      }
    },
  };
};

/* ═══ Wander AI ═══════════════════════════════════════════════ */

type Wanderer = {
  build: SpiritBuild;
  /** Outer node the AI moves; builders animate build.group inside it. */
  travel: THREE.Group;
  home: THREE.Vector2;
  range: number;
  speed: number;
  state: "idle" | "walk";
  timer: number;
  target: THREE.Vector2;
  phase: number;
  moving01: number;
  groundSmooth: number | null;
  yOffset: number;
};

type Circler = {
  build: SpiritBuild;
  travel: THREE.Group;
  center: THREE.Vector3;
  radius: number;
  angularSpeed: number;
  bobAmp: number;
  phase: number;
  tilt: number;
};

type Hoverer = {
  build: SpiritBuild;
  anchor: THREE.Vector3;
  drift: number;
  phase: number;
};

export type SpiritsOptions = {
  sakuraSpots: THREE.Vector3[];
  toriiPath: THREE.Vector3[];
  pagodaTop: THREE.Vector3;
  castleGate?: THREE.Vector3;
  villageSquare?: THREE.Vector3;
};

export const createSpirits = ({ sakuraSpots, toriiPath, pagodaTop, castleGate, villageSquare }: SpiritsOptions): SpiritLayer => {
  const group = new THREE.Group();
  const rng = createRng(0x10ca1);
  const wanderers: Wanderer[] = [];
  const circlers: Circler[] = [];
  const hoverers: Hoverer[] = [];
  const kodama: SpiritBuild[] = [];

  const pathMid = toriiPath[Math.floor(toriiPath.length / 2)] ?? new THREE.Vector3(TEMPLE_CENTER.x, 0, TEMPLE_CENTER.y);

  const namedActors = new Map<string, THREE.Object3D>();

  const addWanderer = (
    build: SpiritBuild,
    home: THREE.Vector2,
    range: number,
    speed: number,
    scale: number,
    yOffset = 0,
    name?: string
  ) => {
    const travel = new THREE.Group();
    if (name) namedActors.set(name, travel);
    travel.scale.setScalar(scale);
    travel.add(build.group);
    group.add(travel);
    wanderers.push({
      build,
      travel,
      home,
      range,
      speed,
      state: "idle",
      timer: 1 + rng() * 3,
      target: home.clone(),
      phase: rng() * Math.PI * 2,
      moving01: 0,
      groundSmooth: null,
      yOffset,
    });
    travel.position.set(home.x, heightAt(home.x, home.y), home.y);
  };

  // The ground-dwellers, each with a territory that suits their nature
  addWanderer(buildKitsune(), new THREE.Vector2(pathMid.x, pathMid.z), 900, 62, 1.5, 0, "kitsune");
  addWanderer(buildTanuki(), new THREE.Vector2(-500, 1900), 700, 34, 1.4, 0, "tanuki");
  addWanderer(buildKappa(), new THREE.Vector2(POND_CENTER.x + 350, POND_CENTER.y + 260), 420, 40, 1.3, 0, "kappa");
  addWanderer(buildShika(), new THREE.Vector2(1500, 1900), 1100, 48, 1.6, 0, "shika");
  addWanderer(buildShika(), new THREE.Vector2(1900, 1500), 900, 44, 1.3);
  addWanderer(buildKarakasa(), new THREE.Vector2(toriiPath[4]?.x ?? 900, toriiPath[4]?.z ?? 1500), 640, 46, 1.4);
  addWanderer(buildNekomata(), new THREE.Vector2(TEMPLE_CENTER.x + 150, TEMPLE_CENTER.y - 120), 520, 52, 1.5);

  // The oni paces outside the castle gate, club dragging
  if (castleGate) {
    addWanderer(buildOni(), new THREE.Vector2(castleGate.x - 200, castleGate.z + 200), 620, 30, 1.7, 0, "oni");
  }
  // The baku ambles the open meadow between shrine and castle, eating dreams
  addWanderer(buildBaku(), new THREE.Vector2(1450, -450), 850, 36, 1.5);
  // Yuki-onna drifts the cold slopes near the sacred peak — she never steps
  addWanderer(buildYukiOnna(), new THREE.Vector2(-1550, -1500), 800, 42, 1.6, 0, "yukionna");
  // Chōchin-obake bobs around the hamlet square
  if (villageSquare) {
    const chochin = buildChochin();
    chochin.group.scale.setScalar(1.4);
    group.add(chochin.group);
    namedActors.set("chochin", chochin.group);
    const anchor = villageSquare.clone();
    anchor.y = heightAt(anchor.x, anchor.z) + 58;
    hoverers.push({ build: chochin, anchor, drift: 150, phase: rng() * Math.PI * 2 });
  }

  // The sky-riders
  const addCircler = (
    build: SpiritBuild,
    scale: number,
    center: THREE.Vector3,
    radius: number,
    angularSpeed: number,
    bobAmp: number,
    tilt: number,
    name?: string
  ) => {
    const travel = new THREE.Group();
    travel.scale.setScalar(scale);
    travel.add(build.group);
    group.add(travel);
    if (name) namedActors.set(name, travel);
    circlers.push({ build, travel, center, radius, angularSpeed, bobAmp, tilt, phase: rng() * Math.PI * 2 });
  };

  addCircler(buildRyu(), 2.2, new THREE.Vector3(SACRED_PEAK.x, 1750, SACRED_PEAK.z), 1900, 0.045, 160, 0.1, "ryu");
  addCircler(buildTengu(), 1.5, new THREE.Vector3(pagodaTop.x, pagodaTop.y + 90, pagodaTop.z), 420, 0.22, 40, 0.16, "tengu");

  // Soul-flames drifting around the shrine plateau
  for (let i = 0; i < 6; i += 1) {
    const wisp = buildHitodama();
    group.add(wisp.group);
    namedActors.set(`wisp${i}`, wisp.group);
    const angle = rng() * Math.PI * 2;
    const r = 140 + rng() * 480;
    const anchor = new THREE.Vector3(
      TEMPLE_CENTER.x + Math.cos(angle) * r,
      0,
      TEMPLE_CENTER.y + Math.sin(angle) * r
    );
    anchor.y = heightAt(anchor.x, anchor.z) + 46 + rng() * 60;
    hoverers.push({ build: wisp, anchor, drift: 40 + rng() * 60, phase: rng() * Math.PI * 2 });
  }

  // Kodama gathered beneath the blossoms, watching
  sakuraSpots.forEach((spot, i) => {
    const cluster = 1 + Math.floor(rng() * 3);
    for (let k = 0; k < cluster; k += 1) {
      const spirit = buildKodama();
      const angle = rng() * Math.PI * 2;
      const r = 24 + rng() * 70;
      const x = spot.x + Math.cos(angle) * r;
      const z = spot.z + Math.sin(angle) * r;
      spirit.group.position.set(x, heightAt(x, z), z);
      spirit.group.rotation.y = rng() * Math.PI * 2;
      spirit.group.scale.setScalar(0.9 + rng() * 0.8);
      // Bake a phase into userData so each watches on its own clock
      spirit.group.userData.phase = i * 1.7 + k * 3.1;
      kodama.push(spirit);
      group.add(spirit.group);
    }
  });

  /* ── Update ── */

  const tmp = new THREE.Vector2();

  const update = (t: number, dt: number) => {
    for (const w of wanderers) {
      w.timer -= dt;

      if (w.state === "idle") {
        w.moving01 = Math.max(0, w.moving01 - dt * 2.5);
        if (w.timer <= 0) {
          // Choose somewhere new to be — flat enough, dry enough
          for (let attempt = 0; attempt < 8; attempt += 1) {
            const angle = rng() * Math.PI * 2;
            const r = w.range * (0.3 + rng() * 0.7);
            const tx = w.home.x + Math.cos(angle) * r;
            const tz = w.home.y + Math.sin(angle) * r;
            if (heightAt(tx, tz) < 22 || slopeAt(tx, tz) > 0.8) continue;
            w.target.set(tx, tz);
            w.state = "walk";
            break;
          }
          w.timer = 2 + rng() * 5;
        }
      } else {
        w.moving01 = Math.min(1, w.moving01 + dt * 3);
        const pos = w.travel.position;
        tmp.set(w.target.x - pos.x, w.target.y - pos.z);
        const dist = tmp.length();
        if (dist < 18) {
          w.state = "idle";
          w.timer = 2.5 + rng() * 6;
        } else {
          tmp.normalize();
          pos.x += tmp.x * w.speed * dt;
          pos.z += tmp.y * w.speed * dt;
          // Face the way we're going, turning smoothly
          const targetYaw = Math.atan2(tmp.x, tmp.y);
          let delta = targetYaw - w.travel.rotation.y;
          delta = Math.atan2(Math.sin(delta), Math.cos(delta));
          w.travel.rotation.y += delta * Math.min(1, dt * 4);
        }
      }

      // Smoothed terrain follow (same trick as the old world's creatures)
      const raw = heightAt(w.travel.position.x, w.travel.position.z);
      if (w.groundSmooth === null) w.groundSmooth = raw;
      const rate = raw > w.groundSmooth ? 5 : 2.4;
      w.groundSmooth += (raw - w.groundSmooth) * Math.min(1, dt * rate);
      w.travel.position.y = w.groundSmooth + w.yOffset;

      // The builder animates hops/bobs on its inner group, unclashed
      w.build.animate(t, w.phase, w.moving01);
    }

    for (const c of circlers) {
      const angle = t * c.angularSpeed + c.phase;
      const x = c.center.x + Math.cos(angle) * c.radius;
      const z = c.center.z + Math.sin(angle) * c.radius;
      const y = c.center.y + Math.sin(t * 0.4 + c.phase) * c.bobAmp;
      c.travel.position.set(x, y, z);
      // Face along the tangent of the circle
      const tx = c.center.x + Math.cos(angle + 0.05) * c.radius;
      const tz = c.center.z + Math.sin(angle + 0.05) * c.radius;
      c.travel.lookAt(tx, y, tz);
      c.build.animate(t, c.phase, 1);
    }

    for (const h of hoverers) {
      const g = h.build.group;
      g.position.set(
        h.anchor.x + Math.sin(t * 0.24 + h.phase) * h.drift,
        h.anchor.y + Math.sin(t * 0.5 + h.phase * 2) * 16,
        h.anchor.z + Math.cos(t * 0.19 + h.phase) * h.drift
      );
      h.build.animate(t, h.phase, 1);
    }

    for (const spirit of kodama) {
      spirit.animate(t, Number(spirit.group.userData.phase ?? 0), 0);
    }
  };

  return {
    group,
    update,
    setHidden: (name, hidden) => {
      const actor = namedActors.get(name);
      if (actor) actor.visible = !hidden;
    },
  };
};
