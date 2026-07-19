import * as THREE from "three";
import type { Story } from "./engine.ts";
import { createMoodController, MOODS, type StoryWorld } from "./mood.ts";
import { createActorMover } from "./motion.ts";
import { createPoofFx } from "./fx.ts";
import { buildHitodama, buildKitsune, buildKodama, buildOni, buildShika } from "../spirits.ts";
import { heightAt } from "../terrain.ts";
import { CASTLE_CENTER } from "../terrain.ts";

/**
 * THE ONI WHO GUARDED THE GATE (門番の鬼)
 *
 * A gentle monster story, in the spirit of "Naita Aka Oni". Everyone
 * knows to be somewhere else when the gatekeeper walks. Then one dusk he
 * finds a very small lost thing — a kodama, too far from its tree — and
 * carries it home across the whole watching valley. The smallest spirits
 * bow first. The fox comes back first. Foxes always know.
 */

export const createOniKodamaStory = (world: StoryWorld): Story => {
  const { scene } = world;

  const moodCtl = createMoodController(world);
  const dusk = MOODS.moonriseDusk;

  const gate =
    world.castleGate?.clone() ??
    new THREE.Vector3(CASTLE_CENTER.x, heightAt(CASTLE_CENTER.x, CASTLE_CENTER.y - 420), CASTLE_CENTER.y - 420);
  const grove =
    world.sakuraSpots?.find((s) => s.z > 1200 && s.x > -200) ??
    new THREE.Vector3(520, heightAt(520, 1720), 1720);

  /* ── Actors ── */
  const props = new THREE.Group();
  props.name = "oni-kodama-story";

  const oni = buildOni();
  const oniTravel = new THREE.Group();
  oniTravel.scale.setScalar(1.8);
  oniTravel.add(oni.group);
  props.add(oniTravel);
  const oniMover = createActorMover(oniTravel);
  let oniMoving = 0;
  let oniMovingTarget = 0;

  const kitsune = buildKitsune();
  const kitsuneTravel = new THREE.Group();
  kitsuneTravel.scale.setScalar(1.5);
  kitsuneTravel.add(kitsune.group);
  props.add(kitsuneTravel);
  const kitsuneMover = createActorMover(kitsuneTravel);
  let kitsuneMoving = 0;
  let kitsuneMovingTarget = 0;

  const shika = buildShika();
  const shikaTravel = new THREE.Group();
  shikaTravel.scale.setScalar(1.5);
  shikaTravel.add(shika.group);
  props.add(shikaTravel);
  const shikaMover = createActorMover(shikaTravel);
  let shikaMoving = 0;
  let shikaMovingTarget = 0;

  // The lost one, and its waiting family
  const lostKodama = buildKodama();
  const lostTravel = new THREE.Group();
  lostTravel.scale.setScalar(1.3);
  lostTravel.add(lostKodama.group);
  props.add(lostTravel);

  const family: Array<ReturnType<typeof buildKodama>> = [];
  const familyGroups: THREE.Group[] = [];
  for (let i = 0; i < 3; i += 1) {
    const spirit = buildKodama();
    const travel = new THREE.Group();
    travel.scale.setScalar(1.1 + i * 0.15);
    travel.add(spirit.group);
    const angle = (i / 3) * Math.PI * 2 + 0.6;
    const x = grove.x + Math.cos(angle) * 52;
    const z = grove.z + Math.sin(angle) * 52;
    travel.position.set(x, heightAt(x, z), z);
    props.add(travel);
    family.push(spirit);
    familyGroups.push(travel);
  }

  // Two soul-flames that trail the strange procession at a safe distance
  const wisps = [buildHitodama(), buildHitodama()];
  const wispTravels = wisps.map((wisp, i) => {
    const travel = new THREE.Group();
    travel.scale.setScalar(1 + i * 0.2);
    travel.add(wisp.group);
    travel.visible = false;
    props.add(travel);
    return travel;
  });

  const petalBurst = createPoofFx("#e8abc0", 54);
  props.add(petalBurst.group);

  /* ── Paths ── */
  const groundPoint = (x: number, z: number) => new THREE.Vector3(x, heightAt(x, z), z);
  const meadow = groundPoint(1450, 620);
  const findSpot = groundPoint(gate.x - 260, gate.z + 300);

  const pathToMeadow = new THREE.CatmullRomCurve3([
    groundPoint(gate.x - 60, gate.z + 80),
    groundPoint(1780, 60),
    meadow.clone(),
  ]);
  const pathKitsuneFlee = new THREE.CatmullRomCurve3([
    groundPoint(meadow.x - 120, meadow.z + 60),
    groundPoint(900, 900),
    groundPoint(600, 1150),
  ]);
  const pathShikaFlee = new THREE.CatmullRomCurve3([
    groundPoint(meadow.x + 90, meadow.z + 140),
    groundPoint(1900, 1150),
    groundPoint(2100, 1600),
  ]);
  const pathBackToGate = new THREE.CatmullRomCurve3([
    meadow.clone(),
    groundPoint(1800, -300),
    findSpot.clone(),
  ]);
  const pathLongWalk = new THREE.CatmullRomCurve3([
    findSpot.clone(),
    groundPoint(1350, 250),
    groundPoint(950, 800),
    groundPoint(760, 1280),
    groundPoint(grove.x + 90, grove.z - 90),
  ]);
  const pathKitsuneReturn = new THREE.CatmullRomCurve3([
    groundPoint(600, 1150),
    groundPoint(560, 1450),
    groundPoint(grove.x - 70, grove.z - 60),
  ]);

  /* ── Shared tick ── */
  let storyTime = 0;
  let carrying = false;
  let petalsFired = false;
  const tick = (dt: number) => {
    storyTime += dt;
    oniMoving += (oniMovingTarget - oniMoving) * Math.min(1, dt * 3);
    kitsuneMoving += (kitsuneMovingTarget - kitsuneMoving) * Math.min(1, dt * 3.4);
    shikaMoving += (shikaMovingTarget - shikaMoving) * Math.min(1, dt * 3.4);
    oni.animate(storyTime, 0.3, oniMoving);
    kitsune.animate(storyTime, 1.4, kitsuneMoving);
    shika.animate(storyTime, 2.2, shikaMoving);
    lostKodama.animate(storyTime, 4.4, 0);
    family.forEach((spirit, i) => spirit.animate(storyTime, i * 2.3, 0));
    wisps.forEach((wisp, i) => wisp.animate(storyTime, i * 1.9, 1));
    petalBurst.update(dt);

    if (carrying) {
      // Riding the great open palm
      lostTravel.position.copy(oniTravel.position);
      lostTravel.position.y += 62;
      const forward = new THREE.Vector3(Math.sin(oniTravel.rotation.y), 0, Math.cos(oniTravel.rotation.y));
      lostTravel.position.addScaledVector(forward, 34);
      lostTravel.rotation.y = oniTravel.rotation.y;
    }
  };

  const oniPos = () => oniTravel.position.clone();

  /* ── Shots ── */
  const shots: Story["shots"] = [
    // 0 — The gatekeeper
    {
      duration: 9,
      rig: {
        kind: "dolly",
        from: new THREE.Vector3(gate.x + 500, gate.y + 260, gate.z + 620),
        to: new THREE.Vector3(gate.x + 160, gate.y + 90, gate.z + 300),
        lookFrom: new THREE.Vector3(gate.x, gate.y + 80, gate.z),
        lookTo: () => oniPos().add(new THREE.Vector3(0, 60, 0)),
      },
      lines: [
        { at: 1.6, text: "Everyone knew about the oni at the castle gate." },
        { at: 5.8, text: "Mostly, they knew to be somewhere else." },
      ],
      onEnter: () => {
        oniMover.place(groundPoint(gate.x - 60, gate.z + 80), new THREE.Vector3(gate.x, gate.y, gate.z + 600));
        kitsuneMover.place(pathKitsuneFlee.getPoint(0), meadow);
        shikaMover.place(pathShikaFlee.getPoint(0), meadow);
        lostTravel.position.copy(findSpot);
        lostTravel.visible = false;
      },
      onUpdate: (k, dt) => {
        tick(dt);
        moodCtl.apply(dusk, 0.25 + k * 0.3);
      },
    },

    // 1 — The scattering
    {
      duration: 11,
      rig: {
        kind: "static",
        position: new THREE.Vector3(meadow.x + 330, meadow.y + 150, meadow.z + 380),
        lookAt: meadow.clone().add(new THREE.Vector3(0, 40, 0)),
      },
      lines: [
        { at: 1.2, text: "Wherever he walked, the meadow emptied." },
        { at: 6.4, text: "He had stopped wondering why. Almost." },
      ],
      onEnter: () => {
        oniMovingTarget = 1;
      },
      onUpdate: (k, dt, s) => {
        tick(dt);
        oniMover.onCurve(pathToMeadow, k, dt);
        // The moment he crests the rise, the meadow bolts
        if (s > 3.5) {
          kitsuneMovingTarget = 1;
          shikaMovingTarget = 1;
          const fleeT = THREE.MathUtils.clamp((s - 3.5) / 5, 0, 1);
          kitsuneMover.onCurve(pathKitsuneFlee, fleeT, dt);
          shikaMover.onCurve(pathShikaFlee, fleeT, dt);
        }
      },
      onExit: () => {
        kitsuneMovingTarget = 0;
        shikaMovingTarget = 0;
      },
    },

    // 2 — The very small lost thing
    {
      duration: 11,
      rig: {
        kind: "dolly",
        from: new THREE.Vector3(findSpot.x + 240, findSpot.y + 120, findSpot.z + 200),
        to: new THREE.Vector3(findSpot.x + 90, findSpot.y + 34, findSpot.z + 110),
        lookFrom: () => oniPos().add(new THREE.Vector3(0, 50, 0)),
        lookTo: findSpot.clone().add(new THREE.Vector3(0, 16, 0)),
      },
      lines: [
        { at: 1.4, text: "Then, one evening by the wall, he found a very small lost thing." },
        { at: 6.6, text: "Too far from its tree to be brave. Too tired to run." },
      ],
      onEnter: () => {
        lostTravel.visible = true;
        oniMovingTarget = 1;
      },
      onUpdate: (k, dt, s) => {
        tick(dt);
        const walkT = Math.min(1, s / 6);
        oniMover.onCurve(pathBackToGate, walkT, dt);
        if (walkT >= 1) {
          oniMovingTarget = 0;
          oniMover.faceToward(findSpot, dt, 4);
        }
        // The little one trembles
        lostKodama.group.rotation.z = Math.sin(storyTime * 22) * 0.05;
      },
    },

    // 3 — The hand
    {
      duration: 8,
      rig: {
        kind: "dolly",
        from: new THREE.Vector3(findSpot.x + 100, findSpot.y + 30, findSpot.z + 120),
        to: new THREE.Vector3(findSpot.x + 130, findSpot.y + 70, findSpot.z + 90),
        lookFrom: findSpot.clone().add(new THREE.Vector3(0, 16, 0)),
        lookTo: () => oniPos().add(new THREE.Vector3(0, 90, 20)),
      },
      lines: [
        { at: 1.8, text: "A hand that drags a club all day forgets how gently it can close." },
      ],
      onUpdate: (k, dt, s) => {
        tick(dt);
        // He kneels; the little one rises to his palm
        const kneel = THREE.MathUtils.clamp(s / 2.4, 0, 1);
        oni.group.rotation.x = Math.sin(kneel * Math.PI) * 0.35;
        const lift = THREE.MathUtils.clamp((s - 2.6) / 2.6, 0, 1);
        if (lift > 0 && !carrying) {
          const eased = lift * lift * (3 - 2 * lift);
          const palm = oniTravel.position.clone().add(new THREE.Vector3(0, 62, 30));
          lostTravel.position.lerpVectors(findSpot, palm, eased);
          if (lift >= 1) carrying = true;
        }
        lostKodama.group.rotation.z *= 0.9; // the trembling stops
      },
    },

    // 4 — The long walk home
    {
      duration: 15,
      rig: {
        kind: "follow",
        target: oniPos,
        offset: new THREE.Vector3(-240, 170, 200),
        lookOffset: new THREE.Vector3(0, 60, 0),
        stiffness: 2.4,
      },
      lines: [
        { at: 1.6, text: "He walked it home the long way — past the paddies, under the pines —" },
        { at: 7.2, text: "and the valley watched from behind its trees." },
        { at: 11.8, text: "Two small flames followed, at what they hoped was a polite distance." },
      ],
      onEnter: () => {
        oniMovingTarget = 1;
        wispTravels.forEach((w) => { w.visible = true; });
      },
      onUpdate: (k, dt) => {
        tick(dt);
        oniMover.onCurve(pathLongWalk, k, dt);
        // The wisps trail the procession
        wispTravels.forEach((w, i) => {
          const trailT = Math.max(0, k - 0.1 - i * 0.06);
          const p = pathLongWalk.getPoint(trailT);
          p.y = heightAt(p.x, p.z) + 60 + i * 26 + Math.sin(storyTime * 1.4 + i * 2) * 10;
          w.position.lerp(p, Math.min(1, dt * 2.6));
        });
      },
    },

    // 5 — Among its family
    {
      duration: 10,
      rig: {
        kind: "dolly",
        from: new THREE.Vector3(grove.x + 260, grove.y + 120, grove.z + 240),
        to: new THREE.Vector3(grove.x + 130, grove.y + 40, grove.z + 170),
        lookFrom: () => oniPos().add(new THREE.Vector3(0, 60, 0)),
        lookTo: grove.clone().add(new THREE.Vector3(0, 16, 0)),
      },
      lines: [
        { at: 1.6, text: "He set it down beneath the blossoms, among its family." },
      ],
      onEnter: () => {
        oniMovingTarget = 0;
        oniMover.faceToward(grove, 1, 100);
      },
      onUpdate: (k, dt, s) => {
        tick(dt);
        const setDown = THREE.MathUtils.clamp((s - 1.2) / 2.8, 0, 1);
        if (setDown > 0) {
          carrying = false; // the hand guides from here
          const eased = setDown * setDown * (3 - 2 * setDown);
          const palm = oniTravel.position.clone().add(new THREE.Vector3(0, 62, 30));
          const home = new THREE.Vector3(grove.x, heightAt(grove.x, grove.z), grove.z);
          lostTravel.position.lerpVectors(palm, home, eased);
          if (setDown >= 1 && !petalsFired) {
            petalsFired = true;
            petalBurst.burst(home.clone().add(new THREE.Vector3(0, 40, 0)));
          }
        }
        oni.group.rotation.x = Math.sin(THREE.MathUtils.clamp(s / 3.4, 0, 1) * Math.PI) * 0.3;
      },
    },

    // 6 — The bow
    {
      duration: 10,
      rig: {
        kind: "static",
        position: new THREE.Vector3(grove.x - 90, grove.y + 26, grove.z + 150),
        lookAt: () => oniPos().add(new THREE.Vector3(0, 70, 0)),
      },
      lines: [
        { at: 1.4, text: "And the small spirits — who fear nothing, being nearly trees — bowed." },
        { at: 6.6, text: "No one had ever bowed to him before." },
      ],
      onUpdate: (k, dt, s) => {
        tick(dt);
        const bow = THREE.MathUtils.clamp((s - 1.8) / 2, 0, 1);
        const bowAngle = Math.sin(Math.min(1, bow) * Math.PI * 0.5) * 0.5;
        family.forEach((spirit, i) => {
          familyGroups[i]!.lookAt(oniTravel.position.x, familyGroups[i]!.position.y, oniTravel.position.z);
          spirit.group.rotation.x = bowAngle;
        });
        lostTravel.lookAt(oniTravel.position.x, lostTravel.position.y, oniTravel.position.z);
        lostKodama.group.rotation.x = bowAngle;
      },
    },

    // 7 — Foxes always know
    {
      duration: 11,
      rig: {
        kind: "static",
        position: new THREE.Vector3(grove.x + 210, grove.y + 60, grove.z + 260),
        lookAt: () => oniPos().add(new THREE.Vector3(-30, 40, 0)),
      },
      lines: [
        { at: 1.6, text: "The fox came back first. Foxes always know." },
        { at: 6.8, text: "She sat down beside him, and said nothing, which was everything." },
      ],
      onEnter: () => {
        kitsuneMovingTarget = 1;
      },
      onUpdate: (k, dt, s) => {
        tick(dt);
        const walkT = Math.min(1, s / 6.5);
        kitsuneMover.onCurve(pathKitsuneReturn, walkT, dt);
        if (walkT >= 1) {
          kitsuneMovingTarget = 0;
          kitsuneMover.faceToward(oniTravel.position, dt, 3);
        }
      },
    },

    // 8 — Lighter every night
    {
      duration: 11,
      rig: {
        kind: "dolly",
        from: new THREE.Vector3(grove.x + 240, grove.y + 90, grove.z + 300),
        to: new THREE.Vector3(grove.x + 420, grove.y + 360, grove.z + 620),
        lookFrom: () => oniPos().add(new THREE.Vector3(0, 50, 0)),
        lookTo: grove.clone().add(new THREE.Vector3(0, 60, 0)),
      },
      lines: [
        { at: 1.8, text: "A club is only as heavy as the heart that drags it." },
        { at: 6.8, text: "His grew lighter every night after." },
      ],
      onUpdate: (k, dt) => {
        tick(dt);
        moodCtl.apply(dusk, 0.55 + k * 0.25);
      },
    },
  ];

  return {
    title: "The Oni Who Guarded the Gate",
    subtitle: "門番の鬼 — a tale of Kakuriyo",
    shots,
    onStart: () => {
      scene.add(props);
      moodCtl.apply(dusk, 0.25);
      // The tale casts the oni, the fox, and the deer
      world.spirits?.setHidden("oni", true);
      world.spirits?.setHidden("kitsune", true);
      world.spirits?.setHidden("shika", true);
    },
    onEnd: () => {
      moodCtl.restore();
      petalBurst.dispose();
      world.spirits?.setHidden("oni", false);
      world.spirits?.setHidden("kitsune", false);
      world.spirits?.setHidden("shika", false);
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
