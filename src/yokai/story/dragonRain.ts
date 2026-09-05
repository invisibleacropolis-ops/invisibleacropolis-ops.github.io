import * as THREE from "three";
import { createStorySpectacle } from "./spectacleDirector.ts";
import type { Story } from "./engine.ts";
import { createMoodController, MOODS, type StoryWorld } from "./mood.ts";
import { createActorMover } from "./motion.ts";
import { createRainFx, createRippleFx } from "./fx.ts";
import { createWhirl } from "./magicFx.ts";
import { windStrength } from "../shaders.ts";
import { buildKappa, buildRyu } from "../spirits.ts";
import { toon } from "../palette.ts";
import { POND_CENTER, WATER_LEVEL, heightAt } from "../terrain.ts";
import { PEAK_LEDGE, SACRED_PEAK } from "../mountains.ts";

/**
 * THE DAY THE RIVER SLEPT (川が眠った日)
 *
 * A nature myth, told slowly. The rain forgets the valley; the waterfall
 * thins to nothing. The kappa — who dies if his dish runs dry — carries
 * his last cupful up the sacred mountain and pours it out for the sky.
 * The river-dragon, who counts no debt but water, repays one cup with
 * a whole storm.
 */

const POND_V3 = new THREE.Vector3(POND_CENTER.x, WATER_LEVEL, POND_CENTER.y);

export const createDragonRainStory = (world: StoryWorld): Story => {
  const { scene, water } = world;

  const moodCtl = createMoodController(world);

  /* ── Actors ── */
  const props = new THREE.Group();
  props.name = "dragon-rain-story";

  const kappa = buildKappa();
  const kappaTravel = new THREE.Group();
  kappaTravel.scale.setScalar(1.4);
  kappaTravel.add(kappa.group);
  props.add(kappaTravel);
  const kappaMover = createActorMover(kappaTravel);
  let kappaMoving = 0;
  let kappaMovingTarget = 0;

  const ryu = buildRyu();
  const ryuTravel = new THREE.Group();
  ryuTravel.scale.setScalar(2.4);
  ryuTravel.add(ryu.group);
  ryuTravel.visible = false;
  props.add(ryuTravel);

  /* ── Props & FX ── */
  // The offered water: a small bright disc on the shrine stone
  const offering = new THREE.Mesh(
    new THREE.CircleGeometry(16, 20),
    new THREE.MeshBasicMaterial({ color: "#bfe4f2", transparent: true, opacity: 0 })
  );
  offering.rotation.x = -Math.PI / 2;
  offering.position.set(PEAK_LEDGE.x - 12, PEAK_LEDGE.y + 1.5, PEAK_LEDGE.z - 12);
  props.add(offering);

  const rain = createRainFx({
    center: new THREE.Vector3(0, 0, 800),
    radius: 3400,
    top: 1600,
    drops: 1500,
  });
  props.add(rain.group);

  const pondRipples = createRippleFx("#eaf6fb", 8);
  props.add(pondRipples.group);
  let rippleClock = 0;

  // Storm veil: dark cloud disc that gathers over the valley for the rain
  const stormVeil = new THREE.Mesh(
    new THREE.CircleGeometry(3600, 40),
    new THREE.MeshBasicMaterial({ color: "#5b6878", transparent: true, opacity: 0, depthWrite: false })
  );
  stormVeil.rotation.x = Math.PI / 2;
  stormVeil.position.set(0, 1750, 800);
  props.add(stormVeil);

  const dust = toon("#c9bd9c");
  void dust; // reserved for a future parched-earth pass

  /* ── Paths ── */
  const groundPoint = (x: number, z: number) => new THREE.Vector3(x, heightAt(x, z), z);
  const pathPilgrimage = new THREE.CatmullRomCurve3([
    groundPoint(POND_CENTER.x + 320, POND_CENTER.y + 240),
    groundPoint(-520, 1180),
    groundPoint(-900, 640),
    groundPoint(-1260, 60),
    groundPoint(-1520, -480),
    new THREE.Vector3(-1660, 330, -930),
    new THREE.Vector3(-1770, 580, -1380),
    new THREE.Vector3(-1580, 770, -1730),
    new THREE.Vector3(PEAK_LEDGE.x + 42, PEAK_LEDGE.y, PEAK_LEDGE.z + 42),
  ]);

  /** Dragon spiral: angle/height parameterized around the sacred peak. */
  const ryuAt = (angle: number, radius: number, y: number, out: THREE.Vector3) =>
    out.set(SACRED_PEAK.x + Math.cos(angle) * radius, y, SACRED_PEAK.z + Math.sin(angle) * radius);

  const ryuPos = new THREE.Vector3();
  const ryuAhead = new THREE.Vector3();
  const placeRyuOnSpiral = (spiralT: number, fromY: number, toY: number, fromR: number, toR: number, turns: number) => {
    const angle = spiralT * Math.PI * 2 * turns + 0.8;
    const radius = THREE.MathUtils.lerp(fromR, toR, spiralT);
    const y = THREE.MathUtils.lerp(fromY, toY, spiralT);
    ryuAt(angle, radius, y, ryuPos);
    const angle2 = angle + 0.08;
    ryuAt(angle2, radius, y + (toY - fromY) * 0.01, ryuAhead);
    ryuTravel.position.copy(ryuPos);
    ryuTravel.lookAt(ryuAhead);
  };

  /* ── Magic: the storm gathering around the climb ── */
  const stormWhirl = createWhirl({
    count: 1100,
    radiusBottom: 180,
    radiusTop: 640,
    height: 1500,
    turns: 2.2,
    speed: 0.12,
    size: 22,
    colorA: "#dfe8f2",
    colorB: "#8fa6c9",
  });
  stormWhirl.group.position.set(SACRED_PEAK.x, PEAK_LEDGE.y, SACRED_PEAK.z);
  props.add(stormWhirl.group);

  /* ── Shared tick ── */
  let storyTime = 0;
  const tick = (dt: number) => {
    storyTime += dt;
    kappaMoving += (kappaMovingTarget - kappaMoving) * Math.min(1, dt * 3);
    kappa.animate(storyTime, 0.9, kappaMoving);
    ryu.animate(storyTime, 0.2, 1);
    rain.update(dt);
    pondRipples.update(dt);
    stormWhirl.update(storyTime);
  };

  const kappaPos = () => kappaTravel.position.clone();

  /* ── Shots ── */
  const shots: Story["shots"] = [
    // 0 — The stillness
    {
      duration: 10,
      rig: {
        kind: "dolly",
        from: new THREE.Vector3(1500, 1150, 2900),
        to: new THREE.Vector3(-100, 520, 2050),
        lookFrom: new THREE.Vector3(-300, 220, 900),
        lookTo: POND_V3.clone().add(new THREE.Vector3(200, 60, 200)),
      },
      lines: [
        { at: 2.0, text: "One summer, the rain forgot the valley." },
        { at: 6.4, text: "The wind lay down in the grass and did not get up." },
      ],
      onEnter: () => {
        kappaMover.place(pathPilgrimage.getPoint(0), POND_V3);
      },
      onUpdate: (k, dt) => {
        tick(dt);
        moodCtl.apply(MOODS.drought, k);
        windStrength.value = 1 - k * 0.85;
        water?.setFlow(1 - k * 0.96);
      },
    },

    // 1 — The dry pond
    {
      duration: 10,
      rig: {
        kind: "static",
        position: new THREE.Vector3(POND_CENTER.x + 520, 70, POND_CENTER.y + 420),
        lookAt: POND_V3.clone().add(new THREE.Vector3(-60, 10, -60)),
      },
      lines: [
        { at: 1.2, text: "The waterfall thinned to a whisper, and then to a memory." },
        { at: 5.8, text: "The kappa's dish held one last cupful. A kappa is his dish." },
      ],
      onUpdate: (k, dt) => {
        tick(dt);
      },
    },

    // 2 — The pilgrimage
    {
      duration: 15,
      rig: {
        kind: "follow",
        target: kappaPos,
        offset: new THREE.Vector3(210, 160, 120),
        lookOffset: new THREE.Vector3(0, 26, 0),
        stiffness: 2.6,
      },
      lines: [
        { at: 1.6, text: "So the kappa did what no kappa should ever do —" },
        { at: 6.6, text: "he carried his water uphill, away from himself." },
        { at: 11.4, text: "Each step weighed a river." },
      ],
      onEnter: () => {
        kappaMovingTarget = 1;
      },
      onUpdate: (k, dt) => {
        tick(dt);
        kappaMover.onCurve(pathPilgrimage, k, dt);
      },
    },

    // 3 — The offering
    {
      duration: 11,
      rig: {
        kind: "dolly",
        from: new THREE.Vector3(PEAK_LEDGE.x + 210, PEAK_LEDGE.y + 70, PEAK_LEDGE.z + 240),
        to: new THREE.Vector3(PEAK_LEDGE.x + 110, PEAK_LEDGE.y + 40, PEAK_LEDGE.z + 130),
        lookFrom: new THREE.Vector3(PEAK_LEDGE.x, PEAK_LEDGE.y + 30, PEAK_LEDGE.z),
        lookTo: new THREE.Vector3(PEAK_LEDGE.x - 12, PEAK_LEDGE.y + 14, PEAK_LEDGE.z - 12),
      },
      lines: [
        { at: 1.4, text: "At the little shrine, he tipped his head, and poured." },
        { at: 6.2, text: "「For the river,」 he said, and sat down very carefully." },
      ],
      onEnter: () => {
        kappaMovingTarget = 0;
        kappaMover.place(
          new THREE.Vector3(PEAK_LEDGE.x + 34, PEAK_LEDGE.y, PEAK_LEDGE.z + 34),
          offering.position
        );
      },
      onUpdate: (k, dt, s) => {
        tick(dt);
        // The bow that empties the dish
        const pour = THREE.MathUtils.clamp((s - 2) / 2.6, 0, 1);
        kappa.group.rotation.x = Math.sin(Math.min(1, pour) * Math.PI) * 0.75;
        (offering.material as THREE.MeshBasicMaterial).opacity = pour * 0.85;
        // Spent, he settles
        if (s > 7) kappa.group.rotation.x = -0.15; // slumped back
      },
    },

    // 4 — Something older than thirst
    {
      duration: 13,
      rig: {
        kind: "static",
        position: new THREE.Vector3(PEAK_LEDGE.x + 300, PEAK_LEDGE.y - 30, PEAK_LEDGE.z + 330),
        lookAt: () => ryuTravel.visible
          ? ryuTravel.position.clone().lerp(new THREE.Vector3(PEAK_LEDGE.x, PEAK_LEDGE.y + 200, PEAK_LEDGE.z), 0.35)
          : new THREE.Vector3(SACRED_PEAK.x + 600, 1900, SACRED_PEAK.z + 600),
      },
      lines: [
        { at: 1.6, text: "Far above, something older than thirst uncoiled from its patience." },
        { at: 8.0, text: "Dragons keep no ledgers. They keep water." },
      ],
      onEnter: () => {
        ryuTravel.visible = true;
      },
      onUpdate: (k, dt) => {
        tick(dt);
        // Grand descending spiral to the ledge
        placeRyuOnSpiral(k, 2100, PEAK_LEDGE.y + 120, 1900, 320, 2.2);
      },
    },

    // 5 — One cupful, one feast
    {
      duration: 10,
      rig: {
        kind: "static",
        position: new THREE.Vector3(PEAK_LEDGE.x + 170, PEAK_LEDGE.y + 55, PEAK_LEDGE.z + 185),
        lookAt: new THREE.Vector3(PEAK_LEDGE.x - 20, PEAK_LEDGE.y + 60, PEAK_LEDGE.z - 20),
      },
      lines: [
        { at: 1.2, text: "It drank the little offering as though it were a feast." },
        { at: 6.0, text: "Debts of water are the only debts a dragon counts." },
      ],
      onUpdate: (k, dt, s) => {
        tick(dt);
        // The great head hovers, then dips to the shrine stone
        const dip = Math.sin(THREE.MathUtils.clamp((s - 1.5) / 5, 0, 1) * Math.PI);
        ryuTravel.position.set(
          PEAK_LEDGE.x + 40,
          PEAK_LEDGE.y + 150 - dip * 95,
          PEAK_LEDGE.z + 60
        );
        ryuTravel.lookAt(offering.position.x, offering.position.y + 10, offering.position.z);
        (offering.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 0.85 - Math.max(0, s - 3) * 0.3);
      },
    },

    // 6 — Wringing out the clouds
    {
      duration: 13,
      rig: {
        kind: "dolly",
        from: new THREE.Vector3(PEAK_LEDGE.x + 420, PEAK_LEDGE.y + 60, PEAK_LEDGE.z + 470),
        to: new THREE.Vector3(PEAK_LEDGE.x + 700, PEAK_LEDGE.y + 480, PEAK_LEDGE.z + 760),
        lookFrom: () => ryuTravel.position.clone(),
        lookTo: () => ryuTravel.position.clone(),
      },
      lines: [
        { at: 1.6, text: "Then it climbed — up past the sleeping clouds — and wrung them out." },
      ],
      onUpdate: (k, dt) => {
        tick(dt);
        // Ascending spiral into the sky
        placeRyuOnSpiral(k, PEAK_LEDGE.y + 120, 2500, 320, 1500, 2.6);
        // The mountain spins its own weather up around the climb
        stormWhirl.setIntensity(Math.min(1, k * 1.6));
        moodCtl.blend(MOODS.drought, MOODS.rainlight, k);
        windStrength.value = 0.15 + k * 1.5;
        (stormVeil.material as THREE.MeshBasicMaterial).opacity = k * 0.5;
        rain.setIntensity(Math.max(0, k - 0.55) * 2.2);
      },
    },

    // 7 — The rain comes home
    {
      duration: 13,
      rig: {
        kind: "dolly",
        from: new THREE.Vector3(-1750, 420, 2150),
        to: new THREE.Vector3(-1250, 260, 1800),
        lookFrom: POND_V3.clone().add(new THREE.Vector3(0, 120, 0)),
        lookTo: POND_V3.clone().add(new THREE.Vector3(80, 30, 0)),
      },
      lines: [
        { at: 1.4, text: "And the rain came home." },
        { at: 5.6, text: "The waterfall found its voice. The paddies drank until they mirrored the sky." },
      ],
      onUpdate: (k, dt) => {
        tick(dt);
        moodCtl.apply(MOODS.rainlight, 1);
        rain.setIntensity(1);
        water?.setFlow(0.04 + k * 0.96);
        // Rain rings across the pond
        rippleClock += dt;
        if (rippleClock > 0.5) {
          rippleClock = 0;
          const angle = Math.random() * Math.PI * 2;
          const r = Math.sqrt(Math.random()) * 330;
          pondRipples.ring(new THREE.Vector3(
            POND_CENTER.x + Math.cos(angle) * r,
            WATER_LEVEL + 2,
            POND_CENTER.y + Math.sin(angle) * r
          ));
        }
      },
    },

    // 8 — The dish, full
    {
      duration: 12,
      rig: {
        kind: "dolly",
        from: new THREE.Vector3(POND_CENTER.x + 420, 90, POND_CENTER.y + 380),
        to: new THREE.Vector3(POND_CENTER.x + 640, 300, POND_CENTER.y + 720),
        lookFrom: () => kappaTravel.position.clone().add(new THREE.Vector3(0, 30, 0)),
        lookTo: new THREE.Vector3(SACRED_PEAK.x + 900, 1500, SACRED_PEAK.z + 900),
      },
      lines: [
        { at: 1.6, text: "They say the kappa's dish has never been empty since." },
        { at: 6.6, text: "The sky remembers who filled it." },
      ],
      onEnter: () => {
        // Home again, dancing at the water's edge
        kappaMover.place(
          new THREE.Vector3(POND_CENTER.x + 330, heightAt(POND_CENTER.x + 330, POND_CENTER.y + 250), POND_CENTER.y + 250),
          POND_V3
        );
        kappaMovingTarget = 1; // hopping for joy in place
        kappa.group.rotation.x = 0;
      },
      onUpdate: (k, dt) => {
        tick(dt);
        // The storm eases into ordinary golden light
        moodCtl.apply(MOODS.rainlight, 1 - k);
        rain.setIntensity(1 - k);
        stormWhirl.setIntensity(Math.max(0, 0.6 - k));
        (stormVeil.material as THREE.MeshBasicMaterial).opacity = 0.5 * (1 - k);
        windStrength.value = 1.65 - k * 0.65;
        // The dragon resumes its patient circle
        placeRyuOnSpiral(0.5 + k * 0.2, 1750, 1750, 1900, 1900, 1);
      },
    },
  ];

  const spectacle = createStorySpectacle(props, "#aee9ff", "#d3b9ff", kappa);
  const spellAt = new THREE.Vector3();
  spectacle.smoke.setColors("#8498ab", "#c7d3e0");
  spectacle.rainbow.group.position.set(POND_CENTER.x, WATER_LEVEL + 35, POND_CENTER.y - 200);
  spectacle.rainbow.group.scale.setScalar(1.65);
  let cloudBeat = -1;
  spectacle.direct(shots, {
    3: { pose: { cast: 0.55 }, cues: [{ at: 4.5, fire: () => { spectacle.sparks.burst(offering.position, { count: 70, speed: 35 }); spectacle.echoes.ring(offering.position, 95, 4); } }] },
    4: { pose: { wonder: 1 } },
    6: { pose: { wonder: 0.8 }, frame: (k, s, dt) => {
      spectacle.trail(ryuTravel.position, dt, 4);
      const beat = Math.floor(s * 2);
      if (beat !== cloudBeat) {
        cloudBeat = beat;
        spectacle.smoke.burst(ryuTravel.position, { count: 8, size: 180, speed: 45, life: 5 });
        if (beat % 5 === 0) spectacle.echoes.ring(ryuTravel.position, 450, 4);
      }
      spectacle.enchantment?.setIntensity(k * 0.5);
    } },
    7: { frame: (k) => spectacle.rainbow.setIntensity(Math.max(0, k - 0.45)) },
    8: { pose: { joy: 1, cast: 0.4 }, cues: [{ at: 0.6, fire: () => spectacle.sparks.burst(kappa.getAnchorWorld("head", spellAt), { count: 130, speed: 90 }) }],
      frame: (k) => { spectacle.rainbow.setIntensity(Math.sin((0.15 + k * 0.85) * Math.PI)); spectacle.enchantment?.setIntensity((1 - k) * 0.6); } },
  });

  return {
    title: "The Day the River Slept",
    subtitle: "川が眠った日 — a tale of Kakuriyo",
    shots,
    onStart: () => {
      scene.add(props);
      moodCtl.apply(MOODS.drought, 0);
      // The tale casts the kappa and the dragon themselves
      world.spirits?.setHidden("kappa", true);
      world.spirits?.setHidden("ryu", true);
    },
    onEnd: () => {
      spectacle.dispose();
      moodCtl.restore();
      windStrength.value = 1;
      water?.setFlow(1);
      rain.dispose();
      pondRipples.dispose();
      stormWhirl.dispose();
      world.spirits?.setHidden("kappa", false);
      world.spirits?.setHidden("ryu", false);
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
