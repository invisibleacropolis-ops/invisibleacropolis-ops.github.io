import * as THREE from "three";
import { createRng } from "../scene/random.ts";
import { toon } from "./palette.ts";
import { WORLD_SIZE } from "./terrain.ts";

/**
 * Ghibli clouds: fat, friendly cumulus built from clumped spheres with
 * flattened bellies, sailing very slowly on a shared wind.
 */

export type CloudField = {
  group: THREE.Group;
  update: (t: number, dt: number) => void;
};

type Cloud = {
  group: THREE.Group;
  speed: number;
  bobPhase: number;
  baseY: number;
};

export const createClouds = (count = 15): CloudField => {
  const group = new THREE.Group();
  const rng = createRng(0xc10d);
  const clouds: Cloud[] = [];

  const puffMaterial = toon("#ffffff");
  const shadowMaterial = toon("#e3ecf4");

  for (let c = 0; c < count; c += 1) {
    const cloud = new THREE.Group();
    const width = 260 + rng() * 420;
    const puffs = 4 + Math.floor(rng() * 5);

    for (let p = 0; p < puffs; p += 1) {
      const r = width * (0.22 + rng() * 0.2);
      const puff = new THREE.Mesh(
        new THREE.SphereGeometry(r, 10, 8),
        p % 3 === 2 ? shadowMaterial : puffMaterial
      );
      puff.position.set(
        (p / (puffs - 1) - 0.5) * width + (rng() - 0.5) * width * 0.2,
        (rng() - 0.2) * r * 0.5,
        (rng() - 0.5) * width * 0.35
      );
      puff.scale.y = 0.62 + rng() * 0.18; // flat-bottomed, pillowy top
      cloud.add(puff);
    }

    cloud.position.set(
      (rng() - 0.5) * WORLD_SIZE * 1.3,
      1150 + rng() * 900,
      (rng() - 0.5) * WORLD_SIZE * 1.3
    );

    clouds.push({
      group: cloud,
      speed: 8 + rng() * 10,
      bobPhase: rng() * Math.PI * 2,
      baseY: cloud.position.y,
    });
    group.add(cloud);
  }

  const limit = WORLD_SIZE * 0.75;

  return {
    group,
    update: (t, dt) => {
      for (const cloud of clouds) {
        cloud.group.position.x += cloud.speed * dt;
        cloud.group.position.y = cloud.baseY + Math.sin(t * 0.05 + cloud.bobPhase) * 22;
        if (cloud.group.position.x > limit) cloud.group.position.x = -limit;
      }
    },
  };
};
