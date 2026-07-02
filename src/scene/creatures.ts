import * as THREE from "three";

/* ═══════════════════════════════════════════════════════════════
   The Bestiary — mythological spirit-creatures of the valley

   Creatures spawn at one edge of the world, cross it, and vanish
   at the other side. Each is a procedural wireframe construct in
   the world's neon idiom with its own locomotion:

     · Dragon      — serpentine flyer, undulating segment chain
     · Phoenix     — blazing flap-flyer trailing ribbon tails
     · Sphinx      — stately ground walker
     · Makara      — vedic sea-beast skimming the terrain
     · Kitsune     — nine-tailed fox sprinting overland
     · Kirin       — antlered galloper with flame hooves
     · Garuda      — vast soarer riding just under the cloud deck
     · Sky-Kraken  — drifting medusa with trailing tentacles
     · Pegasus     — winged horse galloping through open air
     · Ouroboros   — a serpent-wheel rolling across the sky
     · Leviathan   — porpoises THROUGH the wireframe terrain
   ═══════════════════════════════════════════════════════════════ */

export type CreatureLayer = {
  group: THREE.Group;
  update: (t: number, dt: number) => void;
  /** Names + world positions of active creatures (debug/HUD). */
  getActive: () => Array<{ name: string; position: THREE.Vector3 }>;
  /** Debug: spawn a creature on a path passing through `through`. */
  summon: (through: THREE.Vector3, kindName?: string) => string;
  dispose: () => void;
};

export type CreatureLayerOptions = {
  seed?: number;
  worldSize?: number;
  heightAt?: (x: number, z: number) => number;
  maxActive?: number;
};

type MotionMode = "fly" | "soar" | "ground" | "skim" | "porpoise" | "drift" | "roll";

type CreatureBuild = {
  group: THREE.Group;
  /** Per-frame skeletal animation. gait ~= how fast limbs cycle. */
  animate: (t: number, seed: number) => void;
};

type CreatureKind = {
  name: string;
  mode: MotionMode;
  /** World units per second. */
  speed: [number, number];
  /** Uniform scale applied to the unit-space build. */
  scale: [number, number];
  /** Altitude band above spawn baseline (fly/soar/drift/roll only). */
  altitude?: [number, number];
  color: string;
  build: (mat: THREE.MeshBasicMaterial) => CreatureBuild;
};

const createRng = (seed: number): (() => number) => {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0x100000000; };
};

/* ── Small geometry helpers (all builds face +Z = direction of travel) ── */

const box = (m: THREE.MeshBasicMaterial, w: number, h: number, d: number) =>
  new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);

const orb = (m: THREE.MeshBasicMaterial, r: number, detail = 8) =>
  new THREE.Mesh(new THREE.SphereGeometry(r, detail, Math.max(4, detail - 2)), m);

const spike = (m: THREE.MeshBasicMaterial, r: number, len: number) =>
  new THREE.Mesh(new THREE.ConeGeometry(r, len, 6), m);

const fin = (m: THREE.MeshBasicMaterial, w: number, h: number) =>
  new THREE.Mesh(new THREE.PlaneGeometry(w, h, 3, 2), m);

const rod = (m: THREE.MeshBasicMaterial, r: number, len: number) =>
  new THREE.Mesh(new THREE.CylinderGeometry(r * 0.7, r, len, 5), m);

/** Leg with its pivot at the hip so rotation.x swings it naturally. */
const leg = (m: THREE.MeshBasicMaterial, r: number, len: number, x: number, y: number, z: number) => {
  const hip = new THREE.Group();
  hip.position.set(x, y, z);
  const bone = rod(m, r, len);
  bone.position.y = -len / 2;
  hip.add(bone);
  return hip;
};

/* ═══ Creature builders ═══════════════════════════════════════ */

const buildDragon = (m: THREE.MeshBasicMaterial): CreatureBuild => {
  const group = new THREE.Group();
  const segments: THREE.Mesh[] = [];
  for (let i = 0; i < 10; i += 1) {
    const s = orb(m, 0.3 - i * 0.022, 7);
    s.position.z = -0.45 * i;
    segments.push(s);
    group.add(s);
  }
  const head = box(m, 0.5, 0.38, 0.72);
  head.position.z = 0.5;
  group.add(head);
  const hornL = spike(m, 0.06, 0.4);
  hornL.position.set(0.16, 0.3, 0.35);
  hornL.rotation.x = -0.5;
  const hornR = hornL.clone();
  hornR.position.x = -0.16;
  group.add(hornL, hornR);

  const wingL = new THREE.Group();
  wingL.position.set(0.15, 0.15, -0.4);
  const membraneL = fin(m, 1.9, 0.9);
  membraneL.position.x = 0.95;
  membraneL.rotation.x = -Math.PI / 2;
  wingL.add(membraneL);
  const wingR = new THREE.Group();
  wingR.position.set(-0.15, 0.15, -0.4);
  const membraneR = fin(m, 1.9, 0.9);
  membraneR.position.x = -0.95;
  membraneR.rotation.x = -Math.PI / 2;
  wingR.add(membraneR);
  group.add(wingL, wingR);

  return {
    group,
    animate: (t, seed) => {
      for (let i = 0; i < segments.length; i += 1) {
        const seg = segments[i]!;
        const w = Math.sqrt(i + 1);
        seg.position.x = Math.sin(t * 2.4 - i * 0.68 + seed) * 0.13 * w;
        seg.position.y = Math.cos(t * 1.8 - i * 0.5 + seed) * 0.07 * w;
      }
      const flap = Math.sin(t * 5 + seed) * 0.55;
      wingL.rotation.z = 0.25 + flap;
      wingR.rotation.z = -0.25 - flap;
    },
  };
};

const buildPhoenix = (m: THREE.MeshBasicMaterial): CreatureBuild => {
  const group = new THREE.Group();
  const body = spike(m, 0.32, 1.3);
  body.rotation.x = Math.PI / 2; // point the beak forward
  group.add(body);
  const crest = spike(m, 0.08, 0.4);
  crest.position.set(0, 0.3, 0.45);
  crest.rotation.x = -0.6;
  group.add(crest);

  const mkWing = (side: 1 | -1) => {
    const wing = new THREE.Group();
    wing.position.set(side * 0.12, 0.05, 0);
    const feather = fin(m, 1.8, 0.85);
    feather.position.x = side * 0.9;
    feather.rotation.x = -Math.PI / 2;
    wing.add(feather);
    return wing;
  };
  const wingL = mkWing(1);
  const wingR = mkWing(-1);
  group.add(wingL, wingR);

  const tails: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i += 1) {
    const ribbon = fin(m, 0.16, 1.9);
    ribbon.position.set((i - 1) * 0.18, -0.05, -1.4);
    ribbon.rotation.x = -Math.PI / 2 + 0.25;
    tails.push(ribbon);
    group.add(ribbon);
  }

  return {
    group,
    animate: (t, seed) => {
      const flap = Math.sin(t * 6.2 + seed) * 0.75;
      wingL.rotation.z = 0.15 + flap;
      wingR.rotation.z = -0.15 - flap;
      tails.forEach((ribbon, i) => {
        ribbon.rotation.z = Math.sin(t * 3 + i * 1.2 + seed) * 0.3;
      });
      group.position.y = Math.sin(t * 6.2 + seed - 0.8) * 0.08;
    },
  };
};

const buildSphinx = (m: THREE.MeshBasicMaterial): CreatureBuild => {
  const group = new THREE.Group();
  const body = box(m, 0.8, 0.55, 1.7);
  body.position.y = 0.75;
  group.add(body);
  const chest = box(m, 0.6, 0.6, 0.5);
  chest.position.set(0, 1.0, 0.75);
  group.add(chest);
  const head = orb(m, 0.26, 8);
  head.position.set(0, 1.5, 0.85);
  group.add(head);
  // Nemes headdress
  const headdress = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.42, 0.55, 4), m);
  headdress.position.set(0, 1.55, 0.72);
  headdress.rotation.y = Math.PI / 4;
  group.add(headdress);
  // Folded wings
  const foldL = fin(m, 0.5, 1.2);
  foldL.position.set(0.45, 1.05, -0.2);
  foldL.rotation.set(0, Math.PI / 2, -0.5);
  const foldR = foldL.clone();
  foldR.position.x = -0.45;
  foldR.rotation.z = 0.5;
  group.add(foldL, foldR);

  const legs = [
    leg(m, 0.09, 0.75, 0.32, 0.75, 0.7),
    leg(m, 0.09, 0.75, -0.32, 0.75, 0.7),
    leg(m, 0.09, 0.75, 0.32, 0.75, -0.65),
    leg(m, 0.09, 0.75, -0.32, 0.75, -0.65),
  ];
  legs.forEach((l) => group.add(l));

  return {
    group,
    animate: (t, seed) => {
      const gait = t * 3.4 + seed;
      const phases = [0, Math.PI, Math.PI, 0];
      legs.forEach((l, i) => {
        l.rotation.x = Math.sin(gait + phases[i]!) * 0.42;
      });
      group.position.y = Math.abs(Math.sin(gait)) * 0.05;
    },
  };
};

const buildMakara = (m: THREE.MeshBasicMaterial): CreatureBuild => {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.42, 1.6, 7), m);
  body.rotation.x = Math.PI / 2;
  group.add(body);
  const head = box(m, 0.42, 0.34, 0.5);
  head.position.z = 1.0;
  group.add(head);
  const snout = box(m, 0.24, 0.18, 0.6);
  snout.position.set(0, -0.02, 1.5);
  group.add(snout);
  // Curled trunk — the makara's elephant inheritance
  const trunk = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.05, 6, 12, Math.PI * 1.3), m);
  trunk.position.set(0, 0.1, 1.78);
  trunk.rotation.y = Math.PI / 2;
  group.add(trunk);

  const tail = new THREE.Group();
  tail.position.z = -0.85;
  const fluke = fin(m, 0.85, 0.6);
  fluke.position.z = -0.35;
  tail.add(fluke);
  group.add(tail);

  const flipperL = fin(m, 0.55, 0.3);
  flipperL.position.set(0.4, -0.15, 0.5);
  flipperL.rotation.set(-Math.PI / 2, 0, -0.5);
  const flipperR = flipperL.clone();
  flipperR.position.x = -0.4;
  flipperR.rotation.z = 0.5;
  group.add(flipperL, flipperR);

  return {
    group,
    animate: (t, seed) => {
      tail.rotation.y = Math.sin(t * 3.6 + seed) * 0.55;
      trunk.rotation.x = Math.sin(t * 1.4 + seed) * 0.25;
      flipperL.rotation.y = Math.sin(t * 2.4 + seed) * 0.3;
      flipperR.rotation.y = -Math.sin(t * 2.4 + seed) * 0.3;
      group.rotation.z = Math.sin(t * 1.1 + seed) * 0.08;
    },
  };
};

const buildKitsune = (m: THREE.MeshBasicMaterial): CreatureBuild => {
  const group = new THREE.Group();
  const body = box(m, 0.34, 0.36, 1.15);
  body.position.y = 0.62;
  group.add(body);
  const head = spike(m, 0.2, 0.5);
  head.position.set(0, 0.78, 0.78);
  head.rotation.x = Math.PI / 2;
  group.add(head);
  const earL = spike(m, 0.07, 0.26);
  earL.position.set(0.1, 1.0, 0.6);
  const earR = earL.clone();
  earR.position.x = -0.1;
  group.add(earL, earR);

  const legs = [
    leg(m, 0.05, 0.62, 0.14, 0.62, 0.42),
    leg(m, 0.05, 0.62, -0.14, 0.62, 0.42),
    leg(m, 0.05, 0.62, 0.14, 0.62, -0.42),
    leg(m, 0.05, 0.62, -0.14, 0.62, -0.42),
  ];
  legs.forEach((l) => group.add(l));

  // The nine tails
  const tails: THREE.Group[] = [];
  for (let i = 0; i < 9; i += 1) {
    const root = new THREE.Group();
    root.position.set(0, 0.72, -0.55);
    const spread = (i - 4) * 0.24;
    root.rotation.y = spread;
    const tuft = spike(m, 0.07, 1.0);
    tuft.position.z = -0.5;
    tuft.rotation.x = -Math.PI / 2 - 0.35;
    root.add(tuft);
    tails.push(root);
    group.add(root);
  }

  return {
    group,
    animate: (t, seed) => {
      const gait = t * 8.5 + seed;
      const phases = [0, Math.PI, Math.PI, 0];
      legs.forEach((l, i) => {
        l.rotation.x = Math.sin(gait + phases[i]!) * 0.7;
      });
      group.position.y = Math.abs(Math.sin(gait)) * 0.1;
      tails.forEach((tail, i) => {
        tail.rotation.x = Math.sin(t * 2.6 + i * 0.7 + seed) * 0.18 - 0.25;
      });
    },
  };
};

const buildKirin = (m: THREE.MeshBasicMaterial): CreatureBuild => {
  const group = new THREE.Group();
  const body = box(m, 0.42, 0.5, 1.4);
  body.position.y = 0.95;
  group.add(body);
  const neck = rod(m, 0.12, 0.7);
  neck.position.set(0, 1.35, 0.62);
  neck.rotation.x = 0.6;
  group.add(neck);
  const head = box(m, 0.2, 0.24, 0.5);
  head.position.set(0, 1.68, 0.92);
  group.add(head);
  // Branched antlers
  for (const side of [1, -1]) {
    const main = rod(m, 0.03, 0.45);
    main.position.set(side * 0.08, 1.95, 0.8);
    main.rotation.z = side * 0.35;
    const tine = rod(m, 0.02, 0.25);
    tine.position.set(side * 0.16, 2.05, 0.86);
    tine.rotation.z = side * 0.95;
    group.add(main, tine);
  }

  const legs = [
    leg(m, 0.06, 0.95, 0.18, 0.95, 0.55),
    leg(m, 0.06, 0.95, -0.18, 0.95, 0.55),
    leg(m, 0.06, 0.95, 0.18, 0.95, -0.55),
    leg(m, 0.06, 0.95, -0.18, 0.95, -0.55),
  ];
  legs.forEach((l) => group.add(l));

  // Flame hooves
  const flames: THREE.Mesh[] = legs.map((l) => {
    const flame = new THREE.Mesh(new THREE.TetrahedronGeometry(0.12), m);
    flame.position.set(l.position.x, 0.06, l.position.z);
    group.add(flame);
    return flame;
  });

  const tail = fin(m, 0.14, 0.7);
  tail.position.set(0, 1.05, -0.8);
  tail.rotation.x = 0.7;
  group.add(tail);

  return {
    group,
    animate: (t, seed) => {
      const gait = t * 6.4 + seed;
      legs.forEach((l, i) => {
        const phase = i < 2 ? 0 : Math.PI * 0.85;
        l.rotation.x = Math.sin(gait + phase) * 0.75;
      });
      group.position.y = Math.abs(Math.sin(gait * 0.5)) * 0.16;
      flames.forEach((flame, i) => {
        flame.scale.setScalar(0.8 + Math.abs(Math.sin(gait + i)) * 0.6);
        flame.rotation.y = t * 4 + i;
      });
      tail.rotation.z = Math.sin(t * 3 + seed) * 0.3;
    },
  };
};

const buildGaruda = (m: THREE.MeshBasicMaterial): CreatureBuild => {
  const group = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.34, 1.3, 6), m);
  body.rotation.x = Math.PI / 2;
  group.add(body);
  const beak = spike(m, 0.12, 0.5);
  beak.position.z = 0.85;
  beak.rotation.x = Math.PI / 2;
  group.add(beak);
  const crown = spike(m, 0.1, 0.3);
  crown.position.set(0, 0.28, 0.55);
  group.add(crown);

  const mkWing = (side: 1 | -1) => {
    const wing = new THREE.Group();
    wing.position.set(side * 0.2, 0.1, 0.1);
    const inner = fin(m, 1.5, 1.0);
    inner.position.x = side * 0.75;
    inner.rotation.x = -Math.PI / 2;
    const outer = fin(m, 1.3, 0.7);
    outer.position.x = side * 1.9;
    outer.rotation.x = -Math.PI / 2;
    outer.rotation.y = side * 0.15;
    wing.add(inner, outer);
    return wing;
  };
  const wingL = mkWing(1);
  const wingR = mkWing(-1);
  group.add(wingL, wingR);

  const tailFeathers = fin(m, 0.8, 0.9);
  tailFeathers.position.set(0, 0, -1.05);
  tailFeathers.rotation.x = -Math.PI / 2 + 0.2;
  group.add(tailFeathers);

  return {
    group,
    animate: (t, seed) => {
      // Slow, powerful soaring flap
      const flap = Math.sin(t * 1.7 + seed) * 0.38;
      wingL.rotation.z = 0.1 + flap;
      wingR.rotation.z = -0.1 - flap;
      group.rotation.z = Math.sin(t * 0.6 + seed) * 0.12;
    },
  };
};

const buildSkyKraken = (m: THREE.MeshBasicMaterial): CreatureBuild => {
  const group = new THREE.Group();
  const bell = orb(m, 0.75, 10);
  bell.scale.set(1, 1.25, 1);
  group.add(bell);
  const eyeL = orb(m, 0.12, 6);
  eyeL.position.set(0.3, 0.1, 0.62);
  const eyeR = eyeL.clone();
  eyeR.position.x = -0.3;
  group.add(eyeL, eyeR);

  const tentacles: THREE.Mesh[][] = [];
  for (let i = 0; i < 8; i += 1) {
    const angle = (i / 8) * Math.PI * 2;
    const chain: THREE.Mesh[] = [];
    for (let j = 0; j < 6; j += 1) {
      const bead = orb(m, 0.14 - j * 0.017, 6);
      bead.position.set(Math.cos(angle) * 0.42, -0.8 - j * 0.34, Math.sin(angle) * 0.42);
      chain.push(bead);
      group.add(bead);
    }
    tentacles.push(chain);
  }

  return {
    group,
    animate: (t, seed) => {
      const pulse = 1 + Math.sin(t * 1.4 + seed) * 0.08;
      bell.scale.set(pulse, 1.25 * (2 - pulse), pulse);
      tentacles.forEach((chain, i) => {
        const angle = (i / 8) * Math.PI * 2;
        chain.forEach((bead, j) => {
          const sway = Math.sin(t * 1.8 + seed + i * 0.8 + j * 0.75) * 0.1 * (j + 1);
          bead.position.x = Math.cos(angle) * 0.42 + Math.cos(angle + Math.PI / 2) * sway;
          bead.position.z = Math.sin(angle) * 0.42 + Math.sin(angle + Math.PI / 2) * sway;
        });
      });
    },
  };
};

const buildPegasus = (m: THREE.MeshBasicMaterial): CreatureBuild => {
  const group = new THREE.Group();
  const body = box(m, 0.44, 0.52, 1.45);
  body.position.y = 0.95;
  group.add(body);
  const neck = rod(m, 0.13, 0.72);
  neck.position.set(0, 1.38, 0.62);
  neck.rotation.x = 0.55;
  group.add(neck);
  const head = box(m, 0.2, 0.26, 0.55);
  head.position.set(0, 1.72, 0.95);
  head.rotation.x = 0.25;
  group.add(head);
  const mane = fin(m, 0.1, 0.6);
  mane.position.set(0, 1.6, 0.55);
  mane.rotation.x = 0.55;
  group.add(mane);

  const mkWing = (side: 1 | -1) => {
    const wing = new THREE.Group();
    wing.position.set(side * 0.24, 1.2, 0.15);
    const feather = fin(m, 1.7, 0.8);
    feather.position.x = side * 0.85;
    feather.rotation.x = -Math.PI / 2;
    wing.add(feather);
    return wing;
  };
  const wingL = mkWing(1);
  const wingR = mkWing(-1);
  group.add(wingL, wingR);

  const legs = [
    leg(m, 0.06, 0.95, 0.18, 0.95, 0.58),
    leg(m, 0.06, 0.95, -0.18, 0.95, 0.58),
    leg(m, 0.06, 0.95, 0.18, 0.95, -0.58),
    leg(m, 0.06, 0.95, -0.18, 0.95, -0.58),
  ];
  legs.forEach((l) => group.add(l));

  const tail = fin(m, 0.16, 0.8);
  tail.position.set(0, 1.0, -0.85);
  tail.rotation.x = 0.9;
  group.add(tail);

  return {
    group,
    animate: (t, seed) => {
      const flap = Math.sin(t * 4.6 + seed) * 0.6;
      wingL.rotation.z = 0.2 + flap;
      wingR.rotation.z = -0.2 - flap;
      const gait = t * 6 + seed;
      legs.forEach((l, i) => {
        const phase = i < 2 ? 0 : Math.PI * 0.8;
        l.rotation.x = Math.sin(gait + phase) * 0.6;
      });
      tail.rotation.z = Math.sin(t * 2.2 + seed) * 0.25;
    },
  };
};

const buildOuroboros = (m: THREE.MeshBasicMaterial): CreatureBuild => {
  const group = new THREE.Group();
  // The wheel: ring plane contains the direction of travel (Y-Z after yaw)
  const wheel = new THREE.Group();
  wheel.rotation.y = Math.PI / 2;
  group.add(wheel);

  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.13, 8, 40), m);
  wheel.add(ring);
  // Head chasing its own tail, riding the ring
  const head = box(m, 0.3, 0.3, 0.55);
  head.position.set(1.15, 0, 0.1);
  ring.add(head);
  const jaw = spike(m, 0.1, 0.3);
  jaw.position.set(1.15, 0.28, 0.1);
  ring.add(jaw);
  // Dorsal fins around the ring
  for (let i = 1; i < 5; i += 1) {
    const angle = (i / 5) * Math.PI * 2;
    const dorsal = spike(m, 0.07, 0.35);
    dorsal.position.set(Math.cos(angle) * 1.32, Math.sin(angle) * 1.32, 0);
    dorsal.rotation.z = angle - Math.PI / 2;
    ring.add(dorsal);
  }

  return {
    group,
    animate: (t, seed) => {
      // Roll forward, forever devouring itself
      ring.rotation.z = -t * 1.5 + seed;
    },
  };
};

const buildLeviathan = (m: THREE.MeshBasicMaterial): CreatureBuild => {
  const group = new THREE.Group();
  const segments: THREE.Mesh[] = [];
  for (let i = 0; i < 13; i += 1) {
    const s = orb(m, 0.34 - i * 0.02, 7);
    s.position.z = -0.5 * i;
    segments.push(s);
    group.add(s);
    if (i > 0 && i % 3 === 0) {
      const dorsal = spike(m, 0.08, 0.4);
      dorsal.position.set(0, 0.3, -0.5 * i);
      segments.push(dorsal as unknown as THREE.Mesh);
      group.add(dorsal);
    }
  }
  const skull = box(m, 0.55, 0.4, 0.8);
  skull.position.z = 0.55;
  group.add(skull);
  const fluke = fin(m, 1.0, 0.55);
  fluke.position.z = -6.4;
  fluke.rotation.x = -0.3;
  group.add(fluke);

  return {
    group,
    animate: (t, seed) => {
      group.children.forEach((child, i) => {
        if (child === skull || child === fluke) return;
        child.position.y = Math.sin(t * 2.3 - i * 0.5 + seed) * 0.14 * Math.sqrt(i + 1) * 0.5;
      });
      fluke.rotation.x = -0.3 + Math.sin(t * 2.3 - 6 + seed) * 0.35;
    },
  };
};

/* ═══ The bestiary roster ═════════════════════════════════════ */

const BESTIARY: CreatureKind[] = [
  { name: "Dragon", mode: "fly", speed: [260, 380], scale: [90, 150], altitude: [500, 1400], color: "#7cffc4", build: buildDragon },
  { name: "Phoenix", mode: "fly", speed: [300, 430], scale: [70, 110], altitude: [600, 1600], color: "#ffc857", build: buildPhoenix },
  { name: "Sphinx", mode: "ground", speed: [110, 170], scale: [70, 110], color: "#e8d9a0", build: buildSphinx },
  { name: "Makara", mode: "skim", speed: [180, 260], scale: [80, 130], color: "#6fe1ff", build: buildMakara },
  { name: "Kitsune", mode: "ground", speed: [260, 360], scale: [50, 80], color: "#ff7ad9", build: buildKitsune },
  { name: "Kirin", mode: "ground", speed: [220, 320], scale: [60, 95], color: "#b8ff6f", build: buildKirin },
  { name: "Garuda", mode: "soar", speed: [220, 320], scale: [130, 200], altitude: [1800, 2300], color: "#ffd9a0", build: buildGaruda },
  { name: "Sky-Kraken", mode: "drift", speed: [60, 110], scale: [110, 180], altitude: [1100, 1900], color: "#9a7dff", build: buildSkyKraken },
  { name: "Pegasus", mode: "fly", speed: [280, 400], scale: [60, 95], altitude: [400, 1200], color: "#f4f8ff", build: buildPegasus },
  { name: "Ouroboros", mode: "roll", speed: [180, 260], scale: [90, 140], altitude: [700, 1500], color: "#6fffe1", build: buildOuroboros },
  { name: "Leviathan", mode: "porpoise", speed: [240, 340], scale: [80, 130], color: "#5f8fff", build: buildLeviathan },
];

/* ═══ Active creature state ═══════════════════════════════════ */

type ActiveCreature = {
  kind: CreatureKind;
  build: CreatureBuild;
  /** Outer node the mover positions/orients; builders animate build.group inside it freely. */
  travel: THREE.Group;
  start: THREE.Vector3;
  end: THREE.Vector3;
  perp: THREE.Vector3;
  meanderAmp: number;
  meanderFreq: number;
  altitude: number;
  elapsed: number;
  duration: number;
  animSeed: number;
  scale: number;
  /** Low-pass-filtered terrain height under the creature (null until first frame). */
  groundSmooth: number | null;
};

/**
 * Universal height-snapping softener. The raw heightmap is faceted, so
 * following it directly makes every creature twitch with the terrain.
 * Each mode gets its own tracking rates (per second), asymmetric so
 * creatures step up onto rises quickly but glide down off them slowly.
 */
const GROUND_TRACKING: Record<MotionMode, { up: number; down: number }> = {
  ground: { up: 6.5, down: 2.6 },
  skim: { up: 5.0, down: 2.2 },
  porpoise: { up: 3.5, down: 2.0 },
  fly: { up: 1.4, down: 0.7 },
  soar: { up: 1.0, down: 0.5 },
  drift: { up: 0.8, down: 0.4 },
  roll: { up: 1.4, down: 0.7 },
};

export const createCreatureLayer = ({
  seed = 777,
  worldSize = 18000,
  heightAt,
  maxActive = 5,
}: CreatureLayerOptions = {}): CreatureLayer => {
  const rng = createRng(seed);
  const group = new THREE.Group();
  group.name = "bestiary";

  const half = worldSize * 0.5;
  const spawnRadius = half * 1.05;
  const active: ActiveCreature[] = [];
  let nextSpawnAt = 0;
  let lastKindIndex = -1;

  const ground = (x: number, z: number) => {
    const y = heightAt ? heightAt(x, z) : 0;
    // Out-of-bounds heightmap samples can be NaN near the spawn ring
    return Number.isFinite(y) ? y : 0;
  };

  const spawn = (initialProgress = 0, override?: { kind: CreatureKind; start: THREE.Vector3; end: THREE.Vector3 }) => {
    // Never spawn the same creature twice in a row
    let kindIndex = Math.floor(rng() * BESTIARY.length);
    if (kindIndex === lastKindIndex) kindIndex = (kindIndex + 1) % BESTIARY.length;
    lastKindIndex = kindIndex;
    const kind = override?.kind ?? BESTIARY[kindIndex]!;

    // Cross the world: enter at one edge, exit near the opposite one.
    // Paths bias toward the middle so journeys pass through the valley.
    const entryAngle = rng() * Math.PI * 2;
    const exitAngle = entryAngle + Math.PI + (rng() - 0.5) * 0.9;
    const start = override?.start
      ?? new THREE.Vector3(Math.cos(entryAngle) * spawnRadius, 0, Math.sin(entryAngle) * spawnRadius);
    const end = override?.end
      ?? new THREE.Vector3(Math.cos(exitAngle) * spawnRadius, 0, Math.sin(exitAngle) * spawnRadius);

    const dir = end.clone().sub(start).normalize();
    const perp = new THREE.Vector3(-dir.z, 0, dir.x);

    const speed = kind.speed[0] + rng() * (kind.speed[1] - kind.speed[0]);
    const scale = kind.scale[0] + rng() * (kind.scale[1] - kind.scale[0]);
    const altBand = kind.altitude ?? [0, 0];
    const altitude = altBand[0] + rng() * (altBand[1] - altBand[0]);

    const build = kind.build(
      new THREE.MeshBasicMaterial({ color: kind.color, wireframe: true, transparent: true, opacity: 0.9 })
    );
    // The mover owns `travel`; builders may freely bob/roll `build.group`
    // inside it without fighting over the same transform.
    const travel = new THREE.Group();
    travel.scale.setScalar(scale);
    travel.add(build.group);
    group.add(travel);

    const creature: ActiveCreature = {
      kind,
      build,
      travel,
      start,
      end,
      perp,
      meanderAmp: override ? 80 : 300 + rng() * 900,
      meanderFreq: 1 + Math.floor(rng() * 3),
      altitude,
      elapsed: initialProgress * (start.distanceTo(end) / speed),
      duration: start.distanceTo(end) / speed,
      animSeed: rng() * Math.PI * 2,
      scale,
      groundSmooth: null,
    };
    active.push(creature);
  };

  const despawn = (index: number) => {
    const creature = active[index]!;
    creature.travel.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry.dispose();
        if (child.material instanceof THREE.Material) child.material.dispose();
      }
    });
    creature.travel.removeFromParent();
    active.splice(index, 1);
  };

  // Populate the world so there's life in the sky from the first look
  spawn(0.3);
  spawn(0.5);
  spawn(0.65);

  const pathPoint = (c: ActiveCreature, u: number, out: THREE.Vector3) => {
    out.lerpVectors(c.start, c.end, u);
    const meander = Math.sin(u * Math.PI * c.meanderFreq) * c.meanderAmp;
    out.addScaledVector(c.perp, meander);
    return out;
  };

  const pos = new THREE.Vector3();
  const ahead = new THREE.Vector3();

  const elevationFor = (c: ActiveCreature, u: number, groundY: number): number => {
    const s = c.scale;
    switch (c.kind.mode) {
      case "ground":
        return groundY;
      case "skim":
        return groundY + s * 0.6 + Math.sin(u * Math.PI * 8 + c.animSeed) * s * 0.25;
      case "porpoise": {
        // Arcs that plunge below the wireframe surface and burst back out
        const arc = Math.sin(u * Math.PI * 9 + c.animSeed);
        return groundY + arc * s * 2.4 - s * 0.4;
      }
      case "soar":
      case "drift":
      case "fly":
      case "roll":
      default: {
        const wobble = Math.sin(u * Math.PI * 5 + c.animSeed) * 120;
        // Never clip into hills
        return Math.max(groundY + 220, c.altitude + wobble + groundY * 0.35);
      }
    }
  };

  const update = (t: number, dt: number) => {
    if (t >= nextSpawnAt && active.length < maxActive) {
      spawn();
      nextSpawnAt = t + 7 + rng() * 12;
    }

    for (let i = active.length - 1; i >= 0; i -= 1) {
      const c = active[i]!;
      c.elapsed += dt;
      const u = c.elapsed / c.duration;
      if (u >= 1) {
        despawn(i);
        continue;
      }

      pathPoint(c, u, pos);

      // Smooth the terrain sample before any mode formula sees it, so the
      // faceted heightmap can't jerk the creature around frame to frame.
      const rawGround = ground(pos.x, pos.z);
      if (c.groundSmooth === null) {
        c.groundSmooth = rawGround;
      } else {
        const rates = GROUND_TRACKING[c.kind.mode];
        const rate = rawGround > c.groundSmooth ? rates.up : rates.down;
        c.groundSmooth += (rawGround - c.groundSmooth) * Math.min(1, dt * rate);
      }
      pos.y = elevationFor(c, u, c.groundSmooth);

      // Orientation reuses the same smoothed ground: intentional pitch from
      // arcs (porpoise/skim sines) survives, terrain-follow twitch does not.
      const aheadU = Math.min(1, u + 0.004);
      pathPoint(c, aheadU, ahead);
      ahead.y = elevationFor(c, aheadU, c.groundSmooth);

      c.travel.position.copy(pos);
      // Ground creatures stay level; flyers pitch gently along their arcs
      const flatModes: MotionMode[] = ["ground", "skim"];
      if (flatModes.includes(c.kind.mode)) {
        c.travel.lookAt(ahead.x, pos.y, ahead.z);
      } else {
        c.travel.lookAt(ahead.x, pos.y + (ahead.y - pos.y) * 0.6, ahead.z);
      }

      c.build.animate(t, c.animSeed);
    }
  };

  const dispose = () => {
    while (active.length > 0) despawn(active.length - 1);
    group.removeFromParent();
  };

  const summon = (through: THREE.Vector3, kindName?: string): string => {
    const kind =
      BESTIARY.find((k) => k.name.toLowerCase() === (kindName ?? "").toLowerCase()) ??
      BESTIARY[Math.floor(rng() * BESTIARY.length)]!;
    // A path that passes through the requested point
    const heading = rng() * Math.PI * 2;
    const dir = new THREE.Vector3(Math.cos(heading), 0, Math.sin(heading));
    const start = through.clone().setY(0).addScaledVector(dir, -3000);
    const end = through.clone().setY(0).addScaledVector(dir, spawnRadius * 1.5);
    spawn(3000 / start.distanceTo(end), { kind, start, end });
    return kind.name;
  };

  return {
    group,
    update,
    getActive: () =>
      active.map((c) => ({ name: c.kind.name, position: c.travel.position.clone() })),
    summon,
    dispose,
  };
};
