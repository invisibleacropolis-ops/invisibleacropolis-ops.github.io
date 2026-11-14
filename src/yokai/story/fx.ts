import * as THREE from "three";
import { createFlipbook, createRain, createRingPool } from "../vfx.ts";
import { createSpellParticles } from "./spectacleFx.ts";

/**
 * Small reusable story effects, now all on the GPU.
 *
 * Poof — the leaf-and-smoke burst of tanuki henge magic: a cluster of
 * cel-shaded smoke puffs (the Blender-baked flipbook) with leaves tumbling
 * out of it. Ripple — expanding rings with a wobbling edge and an echo,
 * for splashes and belly-drum beats. Rain — wind-slanted streaks.
 *
 * The interfaces are unchanged: each effect keeps its own clock from the
 * dt it is given.
 */

export type PoofFx = {
  group: THREE.Group;
  burst: (at: THREE.Vector3) => void;
  update: (dt: number) => void;
  dispose: () => void;
};

export const createPoofFx = (color = "#cfe3a8", count = 42): PoofFx => {
  const group = new THREE.Group();
  const lit = new THREE.Color(color);
  const shadow = lit.clone().multiplyScalar(0.62);
  const rim = lit.clone().lerp(new THREE.Color("#ffffff"), 0.65);
  const smoke = createFlipbook({
    atlas: "puff", capacity: 48, colors: [`#${shadow.getHexString()}`, `#${lit.getHexString()}`, `#${rim.getHexString()}`],
    drag: 2.4, gravity: -14, turbulence: 6, wind: 0.25, growth: 2.0, spin: 0.6,
  });
  const leaves = createSpellParticles("leaves", Math.max(16, count), 404);
  leaves.setColors("#6f9a3e", "#b7cf5a");
  group.add(smoke.group, leaves.group);
  let clock = 0;
  return {
    group,
    burst: (at) => {
      // A core billow plus a ring of smaller puffs thrown outward.
      smoke.emit(at, { count: 4, spread: 10, speed: 10, upward: 0.4, size: 46, life: 1.6 });
      smoke.emit(at, { count: 9, spread: 14, speed: 70, upward: 0.25, size: 26, life: 1.3 });
      leaves.burst(at, { count, speed: 85, size: 7, life: 2.6, upward: 0.9 });
    },
    update: (dt) => {
      clock += dt;
      smoke.update(clock);
      leaves.update(clock);
    },
    dispose: () => {
      smoke.dispose();
      leaves.dispose();
      group.removeFromParent();
    },
  };
};

export type RainFx = {
  group: THREE.Group;
  /** 0 = dry sky, 1 = full downpour; fade it in as the clouds break. */
  setIntensity: (k: number) => void;
  update: (dt: number) => void;
  dispose: () => void;
};

/**
 * A curtain of rain. Intensity thins the curtain by dropping streaks
 * rather than fading them, so a storm arrives the way real ones do — a few
 * drops, then everything.
 */
export const createRainFx = ({
  center = new THREE.Vector3(0, 0, 0),
  radius = 2600,
  top = 1500,
  drops = 1300,
}: {
  center?: THREE.Vector3;
  radius?: number;
  top?: number;
  drops?: number;
} = {}): RainFx => {
  // The GPU can afford a far denser curtain than the CPU version did.
  const rain = createRain({ center, radius, top, drops: drops * 4 });
  let clock = 0;
  return {
    group: rain.group,
    setIntensity: rain.setIntensity,
    update: (dt) => {
      clock += dt;
      rain.update(clock);
    },
    dispose: rain.dispose,
  };
};

export type RippleFx = {
  group: THREE.Group;
  ring: (at: THREE.Vector3) => void;
  update: (dt: number) => void;
  dispose: () => void;
};

export const createRippleFx = (color = "#ffe2a0", poolSize = 5): RippleFx => {
  const rings = createRingPool(color, Math.max(poolSize * 2, 8));
  let clock = 0;
  return {
    group: rings.group,
    ring: (at) => rings.ring(at, 85, 1.5),
    update: (dt) => {
      clock += dt;
      rings.update(clock);
    },
    dispose: rings.dispose,
  };
};
