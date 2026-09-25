import * as THREE from "three";
import { buildArticulatedKami } from "./kamiCharacters.ts";
import { createRng } from "../scene/random.ts";
import { KAKURIYO, getToonGradient, toon } from "./palette.ts";
import { POND_CENTER, TEMPLE_CENTER, heightAt, slopeAt } from "./terrain.ts";
import { SACRED_PEAK } from "./mountains.ts";
import { castleGroundY, castleSegmentClear, type CastleLayout } from "./castleLayout.ts";
import { createCastleVisitor, planCastleVisit, advanceCastleVisit, safeVisitorHome, type CastleVisitor } from "./castleVisits.ts";

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
  setGroundSampler?: (sampler?: (x: number, z: number) => number) => void;
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

export const buildKitsune = () => buildArticulatedKami("kitsune");

export const buildTanuki = () => buildArticulatedKami("tanuki");

export const buildKappa = () => buildArticulatedKami("kappa");

export const buildShika = () => buildArticulatedKami("shika");

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

export const buildNekomata = () => buildArticulatedKami("nekomata");

export const buildRyu = (): SpiritBuild => {
  // A Shenron-lineage river dragon: emerald serpent, ribbed cream belly
  // edged in red, crocodilian head with antlers and flowing whiskers.
  const bodyMat = toon("#5fae4d");
  const bellyMat = toon("#ecdcae");
  const redMat = toon("#c8402e");
  const maneMat = toon("#39762f");
  const hornMat = toon("#c2a86e");
  const toothMat = toon("#f4efe2");
  const eyeMat = toon("#f6f1e6");
  const pupilMat = toon("#231d17");
  const whiskerMat = toon("#8fc46a");
  // The tiniest parts skip the ink outline, to keep it clean and cheap
  const noOutline = { visible: false } as const;
  [redMat, toothMat, pupilMat, whiskerMat, eyeMat].forEach((m) => {
    m.userData.outlineParameters = noOutline;
  });

  const group = new THREE.Group();
  const SEG = 16;
  const SPACING = 17;
  const vertebrae: THREE.Group[] = [];
  const radii: number[] = [];

  for (let i = 0; i < SEG; i += 1) {
    const p = i / (SEG - 1);
    const r = 12.5 * (1 - p * 0.8) + 2.2;
    radii.push(r);
    const seg = new THREE.Group();
    seg.position.z = -i * SPACING;

    const bodySphere = mesh(new THREE.SphereGeometry(r, 10, 8), bodyMat);
    bodySphere.scale.set(1.14, 0.98, 1.18);
    seg.add(bodySphere);

    // Ribbed underbelly, tucked beneath the body: a cream plate with a
    // thin red line down each lateral edge (the Shenron belly stripe)
    const bellyDepth = SPACING * 1.16;
    const creamPlate = mesh(new THREE.BoxGeometry(r * 1.02, r * 0.46, bellyDepth), bellyMat);
    creamPlate.position.y = -r * 0.62;
    seg.add(creamPlate);
    for (const side of [-1, 1]) {
      const redEdge = mesh(new THREE.BoxGeometry(r * 0.14, r * 0.44, bellyDepth), redMat);
      redEdge.position.set(side * r * 0.5, -r * 0.58, 0);
      seg.add(redEdge);
    }

    // Dorsal ridge fin
    if (r > 3.2) {
      const fin = mesh(new THREE.ConeGeometry(r * 0.3, r, 5), maneMat);
      fin.position.set(0, r * 0.9, 0);
      fin.rotation.x = -0.45;
      seg.add(fin);
    }

    vertebrae.push(seg);
    group.add(seg);
  }

  // Tapering tail fin
  const tailFin = mesh(new THREE.ConeGeometry(radii[SEG - 1]! * 2.8, 24, 5), maneMat);
  tailFin.position.set(0, 0, -10);
  tailFin.rotation.x = -Math.PI / 2;
  vertebrae[SEG - 1]!.add(tailFin);

  /* ── Small clawed arms on an early vertebra ── */
  for (const side of [-1, 1]) {
    const arm = new THREE.Group();
    const rr = radii[4]!;
    arm.position.set(side * rr * 1.0, -rr * 0.4, 0);
    arm.rotation.z = side * -0.5;
    const upper = mesh(new THREE.CylinderGeometry(1.6, 2.2, 12, 6), bodyMat);
    upper.position.y = -6;
    arm.add(upper);
    const fore = mesh(new THREE.CylinderGeometry(1.2, 1.6, 9, 6), bodyMat);
    fore.position.set(0, -13, 3);
    fore.rotation.x = 0.8;
    arm.add(fore);
    for (let c = -1; c <= 1; c += 1) {
      const claw = mesh(new THREE.ConeGeometry(0.7, 4, 4), bellyMat);
      claw.position.set(c * 1.6, -16, 6.5);
      claw.rotation.x = 1.4;
      arm.add(claw);
    }
    vertebrae[4]!.add(arm);
  }

  /* ── Head, riding the front vertebra ── */
  const head = new THREE.Group();
  head.position.set(0, 1, 11);
  vertebrae[0]!.add(head);

  const cranium = mesh(new THREE.SphereGeometry(11, 10, 8), bodyMat);
  cranium.scale.set(1.05, 1.0, 1.25);
  cranium.position.set(0, 2, 5);
  head.add(cranium);

  const upperSnout = mesh(new THREE.BoxGeometry(12, 8, 22), bodyMat);
  upperSnout.position.set(0, 2.5, 22);
  head.add(upperSnout);
  const snoutTip = mesh(new THREE.BoxGeometry(9, 6, 6), bodyMat);
  snoutTip.position.set(0, 2, 33);
  head.add(snoutTip);
  const upperLip = mesh(new THREE.BoxGeometry(13, 2.4, 22), bellyMat);
  upperLip.position.set(0, -1.4, 22);
  head.add(upperLip);

  // Nostrils
  for (const side of [-1, 1]) {
    const nostril = mesh(new THREE.SphereGeometry(1.5, 6, 5), bodyMat);
    nostril.position.set(side * 3, 4.5, 35);
    head.add(nostril);
  }

  // Hinged lower jaw + teeth
  const jaw = new THREE.Group();
  jaw.position.set(0, -2, 12);
  head.add(jaw);
  const lowerJaw = mesh(new THREE.BoxGeometry(11, 4.5, 20), bellyMat);
  lowerJaw.position.set(0, -1.5, 10);
  jaw.add(lowerJaw);
  for (let i = 0; i < 5; i += 1) {
    for (const side of [-1, 1]) {
      const upperTooth = mesh(new THREE.ConeGeometry(0.85, 3, 4), toothMat);
      upperTooth.position.set(side * 5, -1, 15 - i * 4);
      upperTooth.rotation.x = Math.PI;
      head.add(upperTooth);
      const lowerTooth = mesh(new THREE.ConeGeometry(0.8, 2.6, 4), toothMat);
      lowerTooth.position.set(side * 4.4, 1, 14 - i * 4);
      jaw.add(lowerTooth);
    }
  }
  // Chin beard
  const beard = mesh(new THREE.ConeGeometry(4, 12, 5), whiskerMat);
  beard.position.set(0, -4, 4);
  beard.rotation.x = -0.5;
  jaw.add(beard);

  // Eyes + heavy brows
  for (const side of [-1, 1]) {
    const eye = mesh(new THREE.SphereGeometry(2.8, 8, 6), eyeMat);
    eye.position.set(side * 8.5, 5, 9);
    head.add(eye);
    const pupil = mesh(new THREE.SphereGeometry(1.3, 6, 5), pupilMat);
    pupil.position.set(side * 9.6, 5, 11);
    head.add(pupil);
    const brow = mesh(new THREE.BoxGeometry(7, 3, 6), bodyMat);
    brow.position.set(side * 8, 8.5, 8);
    brow.rotation.z = side * -0.35;
    head.add(brow);
  }

  // Branched antlers sweeping up and back
  for (const side of [-1, 1]) {
    const antler = new THREE.Group();
    antler.position.set(side * 5, 9, 0);
    antler.rotation.set(-0.6, 0, side * 0.5);
    const beam = mesh(new THREE.CylinderGeometry(1.2, 2, 20, 5), hornMat);
    beam.position.y = 9;
    antler.add(beam);
    const tine1 = mesh(new THREE.CylinderGeometry(0.8, 1.2, 11, 4), hornMat);
    tine1.position.set(side * 4, 13, 1);
    tine1.rotation.z = side * -0.9;
    antler.add(tine1);
    const tine2 = mesh(new THREE.CylinderGeometry(0.7, 1, 8, 4), hornMat);
    tine2.position.set(side * -2, 16, 0);
    tine2.rotation.z = side * 0.8;
    antler.add(tine2);
    head.add(antler);
  }

  // Mane: spiky crest running the head-to-neck
  for (let i = 0; i < 5; i += 1) {
    const spike = mesh(new THREE.ConeGeometry(2.4 - i * 0.2, 11 - i, 5), maneMat);
    spike.position.set(0, 9 - i * 0.6, 2 - i * 4.5);
    spike.rotation.x = -0.7;
    head.add(spike);
  }

  // Flowing whiskers — a chain of tapering segments, swayed each frame
  const whiskerRoots: THREE.Group[] = [];
  for (const side of [-1, 1]) {
    const root = new THREE.Group();
    root.position.set(side * 5, 3.5, 33);
    root.rotation.set(0.1, side * 0.5, 0);
    let parent: THREE.Object3D = root;
    for (let s = 0; s < 4; s += 1) {
      const link = new THREE.Group();
      link.position.z = s === 0 ? 0 : -13;
      link.rotation.set(0.12, side * 0.16, 0);
      const bone = mesh(new THREE.CylinderGeometry(1.5 - s * 0.32, 1.7 - s * 0.32, 13, 5), whiskerMat);
      bone.rotation.x = Math.PI / 2;
      bone.position.z = -6.5;
      link.add(bone);
      parent.add(link);
      parent = link;
    }
    head.add(root);
    whiskerRoots.push(root);
  }

  return {
    group,
    animate: (t, phase) => {
      for (let i = 0; i < SEG; i += 1) {
        const w = Math.sqrt(i + 1);
        vertebrae[i]!.position.x = Math.sin(t * 1.7 - i * 0.5 + phase) * 3.4 * w;
        vertebrae[i]!.position.y = Math.cos(t * 1.3 - i * 0.42 + phase) * 2.2 * w;
      }
      head.rotation.x = Math.sin(t * 1.1 + phase) * 0.05;
      head.rotation.z = Math.sin(t * 0.7 + phase) * 0.05;
      jaw.rotation.x = 0.1 + Math.sin(t * 0.9 + phase) * 0.1;
      whiskerRoots.forEach((wr, k) => {
        const dir = k === 0 ? 1 : -1;
        wr.children.forEach((link, s) => {
          link.rotation.y = dir * (0.16 + Math.sin(t * 1.6 + phase + s * 0.9) * 0.14);
          link.rotation.x = 0.12 + Math.sin(t * 1.3 + phase + s * 0.7) * 0.1;
        });
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

export const buildOni = () => buildArticulatedKami("oni");

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

export const buildBaku = () => buildArticulatedKami("baku");

export const buildKodama = () => buildArticulatedKami("kodama");

/* ═══ Wander AI ═══════════════════════════════════════════════ */

type Wanderer = {
  visitor?: CastleVisitor;
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
  castleNavigation?: CastleLayout;
  sakuraSpots: THREE.Vector3[];
  toriiPath: THREE.Vector3[];
  pagodaTop: THREE.Vector3;
  castleGate?: THREE.Vector3;
  villageSquare?: THREE.Vector3;
};

export const createSpirits = ({ sakuraSpots, toriiPath, pagodaTop, castleGate, villageSquare, castleNavigation }: SpiritsOptions): SpiritLayer => {
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
    name?: string,
    visit?: { radius: number; indoors?: boolean; patrol?: boolean },
  ) => {
    const travel = new THREE.Group();
    if (name) namedActors.set(name, travel);
    travel.scale.setScalar(scale);
    travel.add(build.group);
    group.add(travel);
    if (visit && castleNavigation) {
      const safe = safeVisitorHome(castleNavigation, new THREE.Vector3(home.x,heightAt(home.x,home.y),home.y), visit.radius);
      home.set(safe.x,safe.z);
    }
    const visitor = visit && castleNavigation ? createCastleVisitor(new THREE.Vector3(home.x, heightAt(home.x, home.y), home.y), visit.radius, !!visit.indoors, !!visit.patrol, 8 + wanderers.length * 7) : undefined;
    if (visitor) {
      build.setGroundSampler?.((x, z) => castleGroundY(castleNavigation!, x, z));
      travel.userData.castleVisitor = visitor;
    }
    wanderers.push({
      visitor,
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
  addWanderer(buildKitsune(), new THREE.Vector2(pathMid.x, pathMid.z), 900, 62, 1.5, 0, "kitsune", { radius: 24, indoors: true });
  addWanderer(buildTanuki(), new THREE.Vector2(-500, 1900), 700, 34, 1.4, 0, "tanuki", { radius: 20, indoors: true });
  addWanderer(buildKappa(), new THREE.Vector2(POND_CENTER.x + 350, POND_CENTER.y + 260), 420, 40, 1.3, 0, "kappa");
  addWanderer(buildShika(), new THREE.Vector2(1500, 1900), 1100, 48, 1.6, 0, "shika", { radius: 34 });
  addWanderer(buildShika(), new THREE.Vector2(1900, 1500), 900, 44, 1.3, 0, undefined, { radius: 30 });
  addWanderer(buildKarakasa(), new THREE.Vector2(toriiPath[4]?.x ?? 900, toriiPath[4]?.z ?? 1500), 640, 46, 1.4);
  addWanderer(buildNekomata(), new THREE.Vector2(TEMPLE_CENTER.x + 150, TEMPLE_CENTER.y - 120), 520, 52, 1.5, 0, undefined, { radius: 18, indoors: true });

  // The oni paces outside the castle gate, club dragging
  if (castleGate) {
    addWanderer(buildOni(), new THREE.Vector2(castleGate.x, castleGate.z - 180), 620, 30, 1.7, 0, "oni", { radius: 34, patrol: true });
  }
  // The baku ambles the open meadow between shrine and castle, eating dreams
  addWanderer(buildBaku(), new THREE.Vector2(1450, -450), 850, 36, 1.5, 0, undefined, { radius: 26, indoors: true });
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
      const v = w.visitor;
      if (v && !w.travel.visible) continue;
      if (v && castleNavigation && w.travel.visible) {
        v.cooldown -= dt;
        if (!v.route.length && v.cooldown <= 0) planCastleVisit(castleNavigation, v, w.travel.position, rng);
        if (v.route.length || v.node) {
          const previousX = w.travel.position.x, previousZ = w.travel.position.z;
          const walking = v.route.length > 0;
          if (walking) advanceCastleVisit(castleNavigation, v, w.travel.position, w.speed * Math.max(0, dt));
          const dx = w.travel.position.x - previousX, dz = w.travel.position.z - previousZ;
          const yaw = Math.hypot(dx, dz) > 0.001 ? Math.atan2(dx, dz) : v.destination?.destination?.yaw;
          if (yaw !== undefined) {
            const delta = yaw - w.travel.rotation.y;
            w.travel.rotation.y += Math.atan2(Math.sin(delta), Math.cos(delta)) * Math.min(1, dt * 4);
          }
          w.moving01 = THREE.MathUtils.damp(w.moving01, walking ? 1 : 0, 5, dt);
          w.groundSmooth = w.travel.position.y;
          w.state = "idle"; w.timer = 3;
          w.build.animate(t, w.phase, w.moving01);
          continue;
        }
      }
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
            if (castleNavigation && !castleSegmentClear(castleNavigation, w.travel.position, new THREE.Vector3(tx, heightAt(tx, tz), tz), v?.radius ?? 24, true)) continue;
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
          const step = Math.min(dist, w.speed * dt);
          pos.x += tmp.x * step;
          pos.z += tmp.y * step;
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
