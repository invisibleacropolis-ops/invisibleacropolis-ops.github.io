import * as THREE from "three";
import type { Story } from "./engine.ts";
import { createMoodController, MOODS, type StoryWorld } from "./mood.ts";
import { createActorMover } from "./motion.ts";
import {
  createAurora,
  createDriftField,
  createFrostBloomPool,
  createShieldDome,
  createWhirl,
} from "./magicFx.ts";
import { windStrength } from "../shaders.ts";
import { buildHitodama, buildYukiOnna } from "../spirits.ts";
import { POND_CENTER, TEMPLE_CENTER, WATER_LEVEL, heightAt } from "../terrain.ts";
import { PEAK_LEDGE } from "../mountains.ts";

/**
 * THE NIGHT OF FIRST SNOW (初雪の夜)
 *
 * Mono no aware, in weather. When the year grows old, the Yuki-onna
 * comes down from the peak to hush it: frost blooms where she glides,
 * the pond closes its bright eye, the sky spills from her sleeves.
 * Then she finds three small flames caught out in her winter — and the
 * smallest is almost gone. This is a story about cold as a kind of
 * keeping. Every magical system the tales own plays a part.
 */

const POND_V3 = new THREE.Vector3(POND_CENTER.x, WATER_LEVEL, POND_CENTER.y);

export const createYukiOnnaStory = (world: StoryWorld): Story => {
  const { scene, water } = world;

  const moodCtl = createMoodController(world);

  /* ── Actors ── */
  const props = new THREE.Group();
  props.name = "yuki-onna-story";

  const yuki = buildYukiOnna();
  const yukiTravel = new THREE.Group();
  yukiTravel.scale.setScalar(1.7);
  yukiTravel.add(yuki.group);
  props.add(yukiTravel);
  const yukiMover = createActorMover(yukiTravel);
  let yukiMoving = 0;
  let yukiMovingTarget = 0;

  // Three flames on the lantern road — the smallest guttering
  const wisps = [buildHitodama(), buildHitodama(), buildHitodama()];
  const wispTravels = wisps.map((wisp, i) => {
    const travel = new THREE.Group();
    travel.scale.setScalar(i === 2 ? 0.7 : 1.05);
    travel.add(wisp.group);
    props.add(travel);
    return travel;
  });
  const FLAME_SPOT = new THREE.Vector3(980, 0, 1180); // on the shrine road
  FLAME_SPOT.y = heightAt(FLAME_SPOT.x, FLAME_SPOT.z);
  wispTravels[0]!.position.set(FLAME_SPOT.x - 60, FLAME_SPOT.y + 52, FLAME_SPOT.z + 40);
  wispTravels[1]!.position.set(FLAME_SPOT.x + 70, FLAME_SPOT.y + 62, FLAME_SPOT.z - 30);
  wispTravels[2]!.position.set(FLAME_SPOT.x, FLAME_SPOT.y + 26, FLAME_SPOT.z);
  let littleFlameLife = 0.28; // nearly out

  /* ── The magic ── */
  const snow = createDriftField({
    count: 6200,
    radius: 3200,
    height: 1700,
    velocityY: -150,
    sway: 52,
    size: 15,
  });
  snow.group.position.set(TEMPLE_CENTER.x - 600, 0, TEMPLE_CENTER.y + 500);
  props.add(snow.group);

  const frost = createFrostBloomPool(12);
  props.add(frost.group);
  let lastFrostAt = new THREE.Vector3(Infinity, 0, Infinity);

  const breathWhirl = createWhirl({
    count: 800,
    radiusBottom: 30,
    radiusTop: 260,
    height: 520,
    turns: 2.8,
    speed: 0.2,
    size: 14,
    colorA: "#ffffff",
    colorB: "#bfd8ec",
  });
  props.add(breathWhirl.group);

  const ascendWhirl = createWhirl({
    count: 700,
    radiusBottom: 70,
    radiusTop: 16,
    height: 640,
    turns: 3.6,
    speed: 0.26,
    size: 12,
    colorA: "#eaf4fc",
    colorB: "#ffffff",
  });
  props.add(ascendWhirl.group);

  const aurora = createAurora({ colorA: "#9fe8d8", colorB: "#b39ff2" });
  props.add(aurora.group);

  const shield = createShieldDome(40, "#cfe8ff");
  shield.mesh.visible = false;
  props.add(shield.mesh);

  /* ── Paths ── */
  const groundPoint = (x: number, z: number) => new THREE.Vector3(x, heightAt(x, z), z);
  const pathDescent = new THREE.CatmullRomCurve3([
    new THREE.Vector3(PEAK_LEDGE.x, PEAK_LEDGE.y, PEAK_LEDGE.z),
    new THREE.Vector3(-1580, 770, -1730),
    new THREE.Vector3(-1700, 480, -1150),
    groundPoint(-1450, -420),
    groundPoint(-1150, 240),
  ]);
  const pathToPond = new THREE.CatmullRomCurve3([
    groundPoint(-1150, 240),
    groundPoint(-1050, 620),
    groundPoint(POND_CENTER.x - 120, POND_CENTER.y - 520),
  ]);
  const pathToFlames = new THREE.CatmullRomCurve3([
    groundPoint(POND_CENTER.x - 120, POND_CENTER.y - 520),
    groundPoint(-260, 520),
    groundPoint(400, 880),
    groundPoint(FLAME_SPOT.x - 130, FLAME_SPOT.z - 60),
  ]);
  const pathHome = new THREE.CatmullRomCurve3([
    groundPoint(FLAME_SPOT.x - 130, FLAME_SPOT.z - 60),
    groundPoint(-300, 500),
    groundPoint(-1050, -150),
    groundPoint(-1420, -640),
  ]);

  /* ── Shared tick ── */
  let storyTime = 0;
  const tick = (dt: number) => {
    storyTime += dt;
    yukiMoving += (yukiMovingTarget - yukiMoving) * Math.min(1, dt * 2.4);
    yuki.animate(storyTime, 0.6, yukiMoving);
    wisps.forEach((wisp, i) => wisp.animate(storyTime, i * 2.1, 1));

    // The little flame's health writes itself onto its body
    const little = wispTravels[2]!;
    const gutter = littleFlameLife < 0.85
      ? Math.max(0.2, littleFlameLife + Math.sin(storyTime * 11) * 0.14 * (1 - littleFlameLife))
      : littleFlameLife;
    little.scale.setScalar(0.5 + gutter * 0.55);

    snow.update(storyTime);
    frost.update(dt);
    breathWhirl.update(storyTime);
    ascendWhirl.update(storyTime);
    aurora.update(storyTime);
    shield.update(storyTime);

    // Frost blooms wherever she has newly glided
    if (yukiMoving > 0.4) {
      if (yukiTravel.position.distanceTo(lastFrostAt) > 150) {
        lastFrostAt = yukiTravel.position.clone();
        frost.bloom(yukiTravel.position.clone(), 55 + Math.random() * 35);
      }
    }
  };

  const yukiPos = () => yukiTravel.position.clone();

  /* ── Shots ── */
  const shots: Story["shots"] = [
    // 0 — Someone must come down
    {
      duration: 10,
      rig: {
        kind: "dolly",
        from: new THREE.Vector3(PEAK_LEDGE.x + 520, PEAK_LEDGE.y + 340, PEAK_LEDGE.z + 640),
        to: new THREE.Vector3(PEAK_LEDGE.x + 260, PEAK_LEDGE.y + 120, PEAK_LEDGE.z + 420),
        lookFrom: new THREE.Vector3(PEAK_LEDGE.x, PEAK_LEDGE.y + 60, PEAK_LEDGE.z),
        lookTo: () => yukiPos().add(new THREE.Vector3(0, 60, 0)),
      },
      lines: [
        { at: 1.8, text: "When the year grows old, someone must come down to hush it." },
        { at: 6.6, text: "She has never once hurried. Winter arrives exactly when she does." },
      ],
      onEnter: () => {
        yukiMover.place(pathDescent.getPoint(0), pathDescent.getPoint(0.1));
        yukiMovingTarget = 1;
      },
      onUpdate: (k, dt) => {
        tick(dt);
        moodCtl.apply(MOODS.midnight, k * 0.75);
        snow.setIntensity(k * 0.25);
        yukiMover.onCurve(pathDescent, k * 0.55, dt);
      },
    },

    // 1 — Where she stepped
    {
      duration: 12,
      rig: {
        kind: "follow",
        target: yukiPos,
        offset: new THREE.Vector3(-190, 130, 210),
        lookOffset: new THREE.Vector3(0, 40, 0),
        stiffness: 2.4,
      },
      lines: [
        { at: 1.6, text: "Where she glided, the ground remembered winter." },
        { at: 6.6, text: "The grass put on its glass, blade by blade." },
      ],
      onUpdate: (k, dt) => {
        tick(dt);
        moodCtl.apply(MOODS.midnight, 0.75);
        snow.setIntensity(0.25 + k * 0.25);
        yukiMover.onCurve(pathDescent, 0.55 + k * 0.45, dt);
      },
    },

    // 2 — The pond closes its eye
    {
      duration: 11,
      rig: {
        // High enough that the sight-line clears the basin rim cleanly
        kind: "static",
        position: new THREE.Vector3(POND_CENTER.x + 620, 320, POND_CENTER.y + 420),
        lookAt: POND_V3.clone().add(new THREE.Vector3(-60, 30, -60)),
      },
      lines: [
        { at: 2.2, text: "At the shore she breathed once across the water," },
        { at: 6.8, text: "and the pond closed its bright eye for the season." },
      ],
      onUpdate: (k, dt, s) => {
        tick(dt);
        const walkT = Math.min(1, s / 4.5);
        yukiMover.onCurve(pathToPond, walkT, dt);
        if (walkT >= 1) {
          yukiMovingTarget = 0;
          yukiMover.faceToward(POND_V3, dt, 3);
        }
        const freeze = THREE.MathUtils.clamp((s - 4.5) / 5, 0, 1);
        water?.setIce(freeze);
        snow.setIntensity(0.5 + k * 0.15);
      },
    },

    // 3 — She opens her sleeves
    {
      duration: 10,
      rig: {
        kind: "dolly",
        from: new THREE.Vector3(POND_CENTER.x - 420, 110, POND_CENTER.y - 780),
        to: new THREE.Vector3(POND_CENTER.x - 260, 200, POND_CENTER.y - 900),
        lookFrom: () => yukiPos().add(new THREE.Vector3(0, 50, 0)),
        lookTo: () => yukiPos().add(new THREE.Vector3(0, 130, 0)),
      },
      lines: [
        { at: 2.0, text: "Then she opened her sleeves, and let the sky spill." },
      ],
      onEnter: () => {
        breathWhirl.group.position.copy(yukiTravel.position);
      },
      onUpdate: (k, dt) => {
        tick(dt);
        breathWhirl.setIntensity(Math.sin(Math.min(1, k * 1.25) * Math.PI));
        snow.setIntensity(0.65 + k * 0.35);
        windStrength.value = 1 + k * 0.9;
        moodCtl.apply(MOODS.midnight, 0.75 + k * 0.15);
      },
    },

    // 4 — Three small flames
    {
      duration: 11,
      rig: {
        kind: "static",
        position: new THREE.Vector3(FLAME_SPOT.x + 190, FLAME_SPOT.y + 60, FLAME_SPOT.z + 210),
        lookAt: new THREE.Vector3(FLAME_SPOT.x, FLAME_SPOT.y + 30, FLAME_SPOT.z),
      },
      lines: [
        { at: 1.4, text: "By the shrine road, three small flames were caught out in her weather." },
        { at: 6.4, text: "The smallest was almost out." },
      ],
      onEnter: () => {
        yukiMovingTarget = 1;
      },
      onUpdate: (k, dt, s) => {
        tick(dt);
        const walkT = Math.min(1, s / 8.5);
        yukiMover.onCurve(pathToFlames, walkT, dt);
        // The two bigger flames shrink behind the near lantern-light
        wispTravels[0]!.position.y = FLAME_SPOT.y + 52 + Math.sin(storyTime * 3) * 5;
        wispTravels[1]!.position.y = FLAME_SPOT.y + 62 + Math.cos(storyTime * 2.6) * 5;
      },
    },

    // 5 — Cold, keeping
    {
      duration: 12,
      rig: {
        kind: "dolly",
        from: new THREE.Vector3(FLAME_SPOT.x + 150, FLAME_SPOT.y + 40, FLAME_SPOT.z + 130),
        to: new THREE.Vector3(FLAME_SPOT.x + 90, FLAME_SPOT.y + 26, FLAME_SPOT.z + 80),
        lookFrom: new THREE.Vector3(FLAME_SPOT.x, FLAME_SPOT.y + 26, FLAME_SPOT.z),
        lookTo: new THREE.Vector3(FLAME_SPOT.x, FLAME_SPOT.y + 30, FLAME_SPOT.z),
      },
      lines: [
        { at: 1.2, text: "Winter looked at the little fire, and the little fire looked back." },
        { at: 6.2, text: "She cupped her hands around it, the way night cups the moon." },
      ],
      onEnter: () => {
        yukiMovingTarget = 0;
        yukiMover.place(
          new THREE.Vector3(FLAME_SPOT.x - 90, heightAt(FLAME_SPOT.x - 90, FLAME_SPOT.z - 40), FLAME_SPOT.z - 40),
          FLAME_SPOT
        );
        shield.mesh.position.set(FLAME_SPOT.x, FLAME_SPOT.y + 28, FLAME_SPOT.z);
        shield.mesh.visible = true;
      },
      onUpdate: (k, dt, s) => {
        tick(dt);
        const cup = THREE.MathUtils.clamp((s - 4.5) / 3.5, 0, 1);
        shield.setIntensity(cup);
        // Inside her cupped cold, the flame steadies and returns
        littleFlameLife = Math.min(1, littleFlameLife + cup * dt * 0.4);
        yuki.group.rotation.x = Math.sin(cup * Math.PI * 0.5) * 0.3; // leaning over it
      },
    },

    // 6 — No one had told her
    {
      duration: 10,
      rig: {
        kind: "static",
        position: new THREE.Vector3(FLAME_SPOT.x - 40, FLAME_SPOT.y + 70, FLAME_SPOT.z + 220),
        lookAt: () => yukiPos().add(new THREE.Vector3(0, 70, 0)),
      },
      lines: [
        { at: 1.6, text: "The little flame circled her once, twice — impertinent with gratitude." },
        { at: 6.4, text: "No one had ever told her that cold could be a kind of keeping." },
      ],
      onUpdate: (k, dt, s) => {
        tick(dt);
        shield.setIntensity(Math.max(0, 1 - s * 0.4));
        // The restored flame orbits her shoulders
        const angle = s * 1.7;
        const little = wispTravels[2]!;
        little.position.set(
          yukiTravel.position.x + Math.cos(angle) * 70,
          yukiTravel.position.y + 90 + Math.sin(s * 2.6) * 16,
          yukiTravel.position.z + Math.sin(angle) * 70
        );
        // The other two dare to drift closer
        wispTravels[0]!.position.lerp(
          yukiTravel.position.clone().add(new THREE.Vector3(-120, 80, 60)), Math.min(1, dt * 0.8));
        wispTravels[1]!.position.lerp(
          yukiTravel.position.clone().add(new THREE.Vector3(130, 95, -40)), Math.min(1, dt * 0.8));
        yuki.group.rotation.x *= 0.95;
      },
    },

    // 7 — Her one extravagance
    {
      duration: 13,
      rig: {
        kind: "dolly",
        from: new THREE.Vector3(FLAME_SPOT.x - 240, FLAME_SPOT.y + 90, FLAME_SPOT.z + 320),
        to: new THREE.Vector3(-700, 480, 900),
        lookFrom: () => yukiPos().add(new THREE.Vector3(0, 60, 0)),
        lookTo: () => yukiPos().add(new THREE.Vector3(0, 120, 0)),
      },
      lines: [
        { at: 1.8, text: "That night the sky wore ribbons — her one extravagance." },
        { at: 7.4, text: "The first snow fell soft as an apology." },
      ],
      onEnter: () => {
        yukiMovingTarget = 1;
      },
      onUpdate: (k, dt) => {
        tick(dt);
        yukiMover.onCurve(pathHome, Math.min(1, k * 1.1), dt);
        aurora.setIntensity(Math.min(1, k * 1.6));
        snow.setIntensity(1 - k * 0.45);
        windStrength.value = 1.9 - k * 0.9;
      },
    },

    // 8 — The ascent
    {
      duration: 12,
      rig: {
        kind: "dolly",
        from: new THREE.Vector3(-1100, 420, 260),
        to: new THREE.Vector3(-760, 640, 780),
        lookFrom: () => yukiPos().add(new THREE.Vector3(0, 80, 0)),
        lookTo: () => yukiPos().add(new THREE.Vector3(0, 160, 0)),
      },
      lines: [
        { at: 2.4, text: "Ever since, the first snow comes gently —" },
        { at: 7.0, text: "so the small flames have time to find their lanterns." },
      ],
      onEnter: () => {
        yukiMovingTarget = 0;
        ascendWhirl.group.position.copy(yukiTravel.position);
      },
      onUpdate: (k, dt) => {
        tick(dt);
        // Diamond dust carries her home
        ascendWhirl.setIntensity(Math.sin(Math.min(1, k * 1.2) * Math.PI));
        yukiTravel.position.y += dt * 90 * Math.min(1, k * 2);
        yukiTravel.rotation.y += dt * 0.8;
        yuki.group.scale.setScalar(Math.max(0.001, 1 - k * 0.9));
        aurora.setIntensity(Math.max(0, 1 - k * 0.6));
        snow.setIntensity(Math.max(0.15, 0.55 - k * 0.4));
        moodCtl.apply(MOODS.midnight, 0.9 * (1 - k * 0.8));
        water?.setIce(1 - k); // spring is only ever one story away
      },
    },
  ];

  return {
    title: "The Night of First Snow",
    subtitle: "初雪の夜 — a tale of Kakuriyo",
    shots,
    onStart: () => {
      scene.add(props);
      moodCtl.apply(MOODS.midnight, 0);
      world.spirits?.setHidden("yukionna", true);
      for (let i = 0; i < 6; i += 1) world.spirits?.setHidden(`wisp${i}`, true);
    },
    onEnd: () => {
      moodCtl.restore();
      windStrength.value = 1;
      water?.setIce(0);
      snow.dispose();
      frost.dispose();
      breathWhirl.dispose();
      ascendWhirl.dispose();
      aurora.dispose();
      shield.dispose();
      world.spirits?.setHidden("yukionna", false);
      for (let i = 0; i < 6; i += 1) world.spirits?.setHidden(`wisp${i}`, false);
      props.traverse((child) => {
        if (child instanceof THREE.Mesh || child instanceof THREE.Points) {
          child.geometry.dispose();
          if (child.material instanceof THREE.Material) child.material.dispose();
        }
      });
      props.removeFromParent();
    },
  };
};
