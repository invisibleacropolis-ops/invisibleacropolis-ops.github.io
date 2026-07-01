import * as THREE from "three";

/**
 * Sculptural forms that give each destination monument its own identity.
 * All geometry lives in "unit space" (the monument group is scaled by the
 * configured link size), standing on the base ring and reaching roughly
 * y = 2.8 so the floating title clears it.
 */

export type Sculpture = {
  group: THREE.Group;
  update: (time: number, phase: number) => void;
};

type SculptureBuilder = (accent: THREE.Color) => Sculpture;

const wireMat = (color: THREE.Color | string, opacity = 1) =>
  new THREE.MeshBasicMaterial({
    color,
    wireframe: true,
    transparent: opacity < 1,
    opacity,
  });

/** Galaxy — an orrery: glowing core inside three tilted rotating rings. */
const createOrrery: SculptureBuilder = (accent) => {
  const group = new THREE.Group();

  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 1), wireMat(accent));
  core.position.y = 1.5;
  group.add(core);

  const rings: THREE.Mesh[] = [];
  const radii = [0.85, 1.15, 1.45];
  radii.forEach((radius, i) => {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(radius, 0.03, 8, 64),
      wireMat(accent, 0.85 - i * 0.2)
    );
    ring.position.y = 1.5;
    ring.rotation.set(Math.PI / 3 * i, Math.PI / 5 * i, 0);
    rings.push(ring);
    group.add(ring);
  });

  return {
    group,
    update: (time, phase) => {
      core.rotation.y = time * 0.6 + phase;
      rings.forEach((ring, i) => {
        ring.rotation.z = time * (0.3 + i * 0.18) + phase;
        ring.rotation.x = Math.PI / 3 * i + Math.sin(time * 0.2 + i) * 0.2;
      });
    },
  };
};

/** Audio — a resonator totem: stacked discs pulsing like an equalizer. */
const createResonator: SculptureBuilder = (accent) => {
  const group = new THREE.Group();
  const discs: THREE.Mesh[] = [];
  const count = 7;

  for (let i = 0; i < count; i += 1) {
    const radius = 0.55 + Math.sin((i / (count - 1)) * Math.PI) * 0.55;
    const disc = new THREE.Mesh(
      new THREE.TorusGeometry(radius, 0.055, 8, 40),
      wireMat(accent, 0.95 - i * 0.06)
    );
    disc.rotation.x = Math.PI * 0.5;
    disc.position.y = 0.35 + i * 0.38;
    discs.push(disc);
    group.add(disc);
  }

  return {
    group,
    update: (time, phase) => {
      discs.forEach((disc, i) => {
        const pulse = 1 + Math.sin(time * 2.4 + phase + i * 0.9) * 0.22;
        disc.scale.set(pulse, pulse, 1);
        disc.rotation.z = time * 0.15 * (i % 2 === 0 ? 1 : -1);
      });
    },
  };
};

/** Flow field — a current: an endless flowing knot. */
const createCurrent: SculptureBuilder = (accent) => {
  const group = new THREE.Group();
  const knot = new THREE.Mesh(
    new THREE.TorusKnotGeometry(0.85, 0.24, 96, 10, 2, 3),
    wireMat(accent, 0.9)
  );
  knot.position.y = 1.55;
  group.add(knot);

  return {
    group,
    update: (time, phase) => {
      knot.rotation.y = time * 0.35 + phase;
      knot.rotation.x = Math.sin(time * 0.22 + phase) * 0.35;
    },
  };
};

/** Procedural city — a ziggurat of stacked, slowly shearing blocks. */
const createZiggurat: SculptureBuilder = (accent) => {
  const group = new THREE.Group();
  const tiers: THREE.Mesh[] = [];
  const levels = 5;

  for (let i = 0; i < levels; i += 1) {
    const span = 2.1 - i * 0.38;
    const tier = new THREE.Mesh(new THREE.BoxGeometry(span, 0.42, span), wireMat(accent, 1 - i * 0.1));
    tier.position.y = 0.25 + i * 0.5;
    tiers.push(tier);
    group.add(tier);
  }

  const crown = new THREE.Mesh(new THREE.OctahedronGeometry(0.3), wireMat(accent));
  crown.position.y = 0.25 + levels * 0.5 + 0.25;
  group.add(crown);

  return {
    group,
    update: (time, phase) => {
      tiers.forEach((tier, i) => {
        tier.rotation.y = Math.sin(time * 0.18 + phase + i * 0.7) * 0.25;
      });
      crown.rotation.y = time * 0.8 + phase;
      crown.position.y = 0.25 + levels * 0.5 + 0.25 + Math.sin(time * 1.1 + phase) * 0.08;
    },
  };
};

/** Nebula — nested translucent shells drifting against each other. */
const createShells: SculptureBuilder = (accent) => {
  const group = new THREE.Group();
  const shells: THREE.Mesh[] = [];
  const radii = [0.55, 0.95, 1.4];

  radii.forEach((radius, i) => {
    const shell = new THREE.Mesh(
      new THREE.IcosahedronGeometry(radius, 1),
      wireMat(accent, 0.85 - i * 0.28)
    );
    shell.position.y = 1.55;
    shells.push(shell);
    group.add(shell);
  });

  return {
    group,
    update: (time, phase) => {
      shells.forEach((shell, i) => {
        const dir = i % 2 === 0 ? 1 : -1;
        shell.rotation.y = time * (0.12 + i * 0.08) * dir + phase;
        shell.rotation.x = time * 0.07 * dir;
      });
    },
  };
};

/** Cloth — a banner: a woven sheet rippling in an invisible wind. */
const createBanner: SculptureBuilder = (accent) => {
  const group = new THREE.Group();
  const geometry = new THREE.PlaneGeometry(1.9, 2.3, 12, 14);
  const banner = new THREE.Mesh(geometry, wireMat(accent, 0.9));
  banner.position.y = 1.6;
  group.add(banner);

  const positions = geometry.attributes.position as THREE.BufferAttribute;
  const baseX = new Float32Array(positions.count);
  const baseY = new Float32Array(positions.count);
  for (let i = 0; i < positions.count; i += 1) {
    baseX[i] = positions.getX(i);
    baseY[i] = positions.getY(i);
  }

  return {
    group,
    update: (time, phase) => {
      for (let i = 0; i < positions.count; i += 1) {
        const x = baseX[i];
        const yv = baseY[i];
        // Pinned along the left edge, free at the right — flag-like
        const freedom = (x + 0.95) / 1.9;
        positions.setZ(i, Math.sin(x * 2.4 + time * 2.1 + phase + yv * 0.9) * 0.3 * freedom);
      }
      positions.needsUpdate = true;
    },
  };
};

/** Fluid — a droplet: a lathed teardrop breathing around a core. */
const createDroplet: SculptureBuilder = (accent) => {
  const group = new THREE.Group();

  const profile: THREE.Vector2[] = [];
  for (let i = 0; i <= 14; i += 1) {
    const t = i / 14;
    // Teardrop: wide at the bottom, tapering to a point
    const radius = Math.sin(t * Math.PI) * (1 - t * 0.45) * 0.95;
    profile.push(new THREE.Vector2(radius, t * 2.6));
  }
  const drop = new THREE.Mesh(new THREE.LatheGeometry(profile, 20), wireMat(accent, 0.85));
  drop.position.y = 0.15;
  group.add(drop);

  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 1), wireMat(accent));
  core.position.y = 1.15;
  group.add(core);

  return {
    group,
    update: (time, phase) => {
      const breathe = 1 + Math.sin(time * 1.3 + phase) * 0.06;
      drop.scale.set(breathe, 1, breathe);
      drop.rotation.y = time * 0.2 + phase;
      core.rotation.y = -time * 0.7;
      core.position.y = 1.15 + Math.sin(time * 1.3 + phase) * 0.1;
    },
  };
};

/** Fallback — an obelisk with an orbiting spark. */
const createObelisk: SculptureBuilder = (accent) => {
  const group = new THREE.Group();

  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.4, 2.4, 4), wireMat(accent));
  shaft.position.y = 1.2;
  group.add(shaft);

  const tip = new THREE.Mesh(new THREE.OctahedronGeometry(0.28), wireMat(accent));
  tip.position.y = 2.7;
  group.add(tip);

  const spark = new THREE.Mesh(new THREE.TetrahedronGeometry(0.14), wireMat(accent));
  group.add(spark);

  return {
    group,
    update: (time, phase) => {
      tip.rotation.y = time * 0.9 + phase;
      const angle = time * 0.7 + phase;
      spark.position.set(Math.cos(angle) * 0.9, 1.3 + Math.sin(time * 1.7 + phase) * 0.6, Math.sin(angle) * 0.9);
      spark.rotation.y = time * 2;
    },
  };
};

/** Sculpture archetype per destination page (keyed by URL basename). */
const SCULPTURES_BY_PAGE: Record<string, SculptureBuilder> = {
  "galaxy.html": createOrrery,
  "audio-reactive.html": createResonator,
  "flow-field.html": createCurrent,
  "procedural-city.html": createZiggurat,
  "volumetric-nebula.html": createShells,
  "cloth.html": createBanner,
  "fluid.html": createDroplet,
};

const FALLBACK_SCULPTURES: SculptureBuilder[] = [
  createObelisk,
  createShells,
  createZiggurat,
  createCurrent,
];

export const createSculptureForPage = (
  url: string,
  index: number,
  accent: THREE.Color
): Sculpture => {
  const basename = url.split("/").pop() ?? "";
  const builder =
    SCULPTURES_BY_PAGE[basename] ?? FALLBACK_SCULPTURES[index % FALLBACK_SCULPTURES.length];
  return builder(accent);
};
