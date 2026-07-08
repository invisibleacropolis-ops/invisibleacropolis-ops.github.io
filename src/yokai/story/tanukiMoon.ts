import * as THREE from "three";
import type { Story } from "./engine.ts";
import { createMoodController, MOODS, type StoryWorld } from "./mood.ts";
import { createPoofFx, createRippleFx } from "./fx.ts";
import { buildChochin, buildTanuki } from "../spirits.ts";
import { getToonGradient, toon } from "../palette.ts";
import { VILLAGE_CENTER, heightAt } from "../terrain.ts";

/**
 * THE TANUKI AND THE MOON-OFFERING (狸と月見団子)
 *
 * A comedy. The village sets out tsukimi dango for the harvest moon;
 * the tanuki disguises himself as a stone lantern to steal them while
 * the one-eyed lantern-ghost isn't looking. His tail betrays him, the
 * moon catches him mid-crime, and the night ends the only way a tanuki
 * story can: with everything given back, and drumming.
 */

const SQUARE = new THREE.Vector2(VILLAGE_CENTER.x, VILLAGE_CENTER.y);

export const createTanukiMoonStory = (world: StoryWorld): Story => {
  const { scene } = world;

  const moodCtl = createMoodController(world);
  const dusk = MOODS.moonriseDusk;

  /* ── Actors ── */
  const props = new THREE.Group();
  props.name = "tanuki-moon-story";

  const tanuki = buildTanuki();
  const tanukiTravel = new THREE.Group();
  tanukiTravel.scale.setScalar(1.5);
  tanukiTravel.add(tanuki.group);
  props.add(tanukiTravel);
  let tanukiMoving = 0;
  let tanukiMovingTarget = 0;

  const chochin = buildChochin();
  const chochinTravel = new THREE.Group();
  chochinTravel.scale.setScalar(1.5);
  chochinTravel.add(chochin.group);
  props.add(chochinTravel);

  const groundY = (x: number, z: number) => heightAt(x, z);
  const squareY = groundY(SQUARE.x, SQUARE.y);

  /* ── Props: the offering stand ── */
  const stand = new THREE.Group();
  const table = new THREE.Mesh(new THREE.BoxGeometry(46, 6, 34), toon("#8a5a40"));
  table.position.y = 22;
  const legL = new THREE.Mesh(new THREE.BoxGeometry(6, 22, 26), toon("#6b4028"));
  legL.position.set(-16, 11, 0);
  const legR = legL.clone();
  legR.position.x = 16;
  stand.add(table, legL, legR);

  const dangoMat = new THREE.MeshToonMaterial({ color: "#f7f2e6", gradientMap: getToonGradient() });
  const dango: THREE.Mesh[] = [];
  const dangoLayout: Array<[number, number, number]> = [
    [-8, 30, -5], [8, 30, -5], [0, 30, 7], [-4, 40, 1], [4, 40, 1],
  ];
  dangoLayout.forEach(([x, y, z]) => {
    const ball = new THREE.Mesh(new THREE.SphereGeometry(6.4, 10, 8), dangoMat);
    ball.position.set(x, y, z);
    dango.push(ball);
    stand.add(ball);
  });
  // The prize: the topmost dango, free to travel
  const topDango = new THREE.Mesh(new THREE.SphereGeometry(6.8, 10, 8), dangoMat);
  topDango.position.set(0, 49, 1);
  stand.add(topDango);

  const STAND_POS = new THREE.Vector3(SQUARE.x + 60, squareY, SQUARE.y - 40);
  stand.position.copy(STAND_POS);
  props.add(stand);

  /* ── Props: the stone-lantern disguise (note the tail) ── */
  const disguise = new THREE.Group();
  const stoneMat = toon("#a8a89e", { flatShading: true });
  const dBase = new THREE.Mesh(new THREE.CylinderGeometry(13, 17, 14, 6), stoneMat);
  dBase.position.y = 7;
  const dStem = new THREE.Mesh(new THREE.CylinderGeometry(6, 7, 30, 6), stoneMat);
  dStem.position.y = 34;
  const dHouse = new THREE.Mesh(new THREE.BoxGeometry(22, 18, 22), stoneMat);
  dHouse.position.y = 58;
  const dGlow = new THREE.Mesh(new THREE.BoxGeometry(15, 12, 15), new THREE.MeshBasicMaterial({ color: "#ffe2a0" }));
  dGlow.position.y = 58;
  const dCap = new THREE.Mesh(new THREE.ConeGeometry(20, 16, 6), stoneMat);
  dCap.position.y = 74;
  // The one detail he forgot
  const dTail = new THREE.Mesh(new THREE.SphereGeometry(8, 6, 5), toon("#8a6748"));
  dTail.scale.set(0.8, 0.8, 1.6);
  dTail.position.set(0, 12, -20);
  disguise.add(dBase, dStem, dHouse, dGlow, dCap, dTail);
  disguise.visible = false;
  props.add(disguise);

  /* ── Props: the moon ── */
  const moon = new THREE.Group();
  const moonFace = new THREE.Mesh(new THREE.SphereGeometry(240, 20, 16), new THREE.MeshBasicMaterial({ color: "#f2e6c0" }));
  const moonHalo = new THREE.Mesh(
    new THREE.SphereGeometry(360, 20, 16),
    new THREE.MeshBasicMaterial({ color: "#f2e0a8", transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false })
  );
  moon.add(moonFace, moonHalo);
  const MOON_FROM = new THREE.Vector3(3800, -300, 4600);
  const MOON_TO = new THREE.Vector3(3800, 2400, 4600);
  moon.position.copy(MOON_FROM);
  moon.visible = false;
  props.add(moon);

  /* ── FX ── */
  const poof = createPoofFx("#cfe3a8");
  props.add(poof.group);
  const drumRipples = createRippleFx("#ffd9a0");
  props.add(drumRipples.group);

  /* ── Choreography helpers ── */
  const HIDE_SPOT = new THREE.Vector3(SQUARE.x - 320, 0, SQUARE.y + 210);
  HIDE_SPOT.y = groundY(HIDE_SPOT.x, HIDE_SPOT.z);
  const CHOCHIN_POST = new THREE.Vector3(STAND_POS.x + 90, squareY + 78, STAND_POS.z + 40);

  const pathArrive = new THREE.CatmullRomCurve3([
    new THREE.Vector3(SQUARE.x - 680, groundY(SQUARE.x - 680, SQUARE.y + 640), SQUARE.y + 640),
    new THREE.Vector3(SQUARE.x - 480, groundY(SQUARE.x - 480, SQUARE.y + 430), SQUARE.y + 430),
    HIDE_SPOT.clone(),
  ]);

  const bridgeMid = new THREE.Vector3(-820, groundY(-820, 1690) + 56, 1690);
  const paddySplash = new THREE.Vector3(-1120, groundY(-1120, 2440) + 8, 2440);
  const pathFlee = new THREE.CatmullRomCurve3([
    new THREE.Vector3(STAND_POS.x, squareY, STAND_POS.z + 40),
    new THREE.Vector3(SQUARE.x - 260, groundY(SQUARE.x - 260, SQUARE.y - 160), SQUARE.y - 160),
    new THREE.Vector3(-700, groundY(-700, 1960), 1960),
    bridgeMid,
    new THREE.Vector3(-1010, groundY(-1010, 2120), 2120),
    paddySplash,
    new THREE.Vector3(-1240, groundY(-1240, 2760), 2760),
  ]);
  const pathReturn = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-1240, groundY(-1240, 2760), 2760),
    new THREE.Vector3(-880, groundY(-880, 2620), 2620),
    new THREE.Vector3(SQUARE.x - 300, groundY(SQUARE.x - 300, SQUARE.y + 180), SQUARE.y + 180),
    new THREE.Vector3(STAND_POS.x - 60, squareY, STAND_POS.z + 50),
  ]);

  const actorOnPath = (travel: THREE.Group, curve: THREE.CatmullRomCurve3, t01: number) => {
    const p = curve.getPoint(t01);
    travel.position.copy(p);
    const ahead = curve.getPoint(Math.min(1, t01 + 0.01));
    travel.rotation.y = Math.atan2(ahead.x - p.x, ahead.z - p.z);
  };

  const faceTarget = (travel: THREE.Group, target: THREE.Vector3, dt: number, rate = 5) => {
    const yaw = Math.atan2(target.x - travel.position.x, target.z - travel.position.z);
    let delta = yaw - travel.rotation.y;
    delta = Math.atan2(Math.sin(delta), Math.cos(delta));
    travel.rotation.y += delta * Math.min(1, dt * rate);
  };

  /* ── Shared tick ── */
  let storyTime = 0;
  let disguiseProgress = 0; // 0 at hide spot → 1 at the stand
  let lastDrumBeat = 0;
  const tick = (dt: number) => {
    storyTime += dt;
    tanukiMoving += (tanukiMovingTarget - tanukiMoving) * Math.min(1, dt * 3.5);
    tanuki.animate(storyTime, 0.7, tanukiMoving);
    chochin.animate(storyTime, 2.3, 1);
    poof.update(dt);
    drumRipples.update(dt);
  };

  const tanukiPos = () => tanukiTravel.position.clone();
  const disguisePos = () => disguise.position.clone();

  // The lantern-ghost's patrol: it turns to inspect the square on a cycle
  const ghostIsWatching = (s: number) => s % 3.8 > 2.5;

  /* ── Shots ── */
  const shots: Story["shots"] = [
    // 0 — The offering
    {
      duration: 9,
      rig: {
        kind: "dolly",
        from: new THREE.Vector3(SQUARE.x + 620, squareY + 420, SQUARE.y + 700),
        to: new THREE.Vector3(STAND_POS.x + 120, squareY + 100, STAND_POS.z + 190),
        lookFrom: new THREE.Vector3(SQUARE.x, squareY + 60, SQUARE.y),
        lookTo: STAND_POS.clone().add(new THREE.Vector3(0, 40, 0)),
        ease: true,
      },
      lines: [
        { at: 2.4, text: "On the night of the moon-viewing, the village set out sweet dango for the sky." },
        { at: 6.4, text: "The sky, being patient, had not yet come down for them." },
      ],
      onEnter: () => {
        tanukiTravel.position.copy(pathArrive.getPoint(0));
        chochinTravel.position.copy(CHOCHIN_POST);
      },
      onUpdate: (k, dt) => {
        tick(dt);
        moodCtl.apply(dusk, k * 0.25);
        chochinTravel.position.y = CHOCHIN_POST.y + Math.sin(storyTime * 0.9) * 8;
      },
    },

    // 1 — The nose knows
    {
      duration: 9,
      rig: {
        kind: "follow",
        target: tanukiPos,
        offset: new THREE.Vector3(-150, 120, 170),
        lookOffset: new THREE.Vector3(0, 26, 0),
      },
      lines: [
        { at: 1.2, text: "The tanuki smelled them from three fields away." },
        { at: 5.6, text: "He was, he told himself, only going to count them." },
      ],
      onEnter: () => {
        tanukiMovingTarget = 1;
      },
      onUpdate: (k, dt) => {
        tick(dt);
        moodCtl.apply(dusk, 0.25 + k * 0.1);
        actorOnPath(tanukiTravel, pathArrive, k);
        chochinTravel.position.y = CHOCHIN_POST.y + Math.sin(storyTime * 0.9) * 8;
      },
    },

    // 2 — The watcher
    {
      duration: 9,
      rig: {
        // Inside the ring of houses, above the tanuki's hiding shoulder
        kind: "static",
        position: new THREE.Vector3(SQUARE.x - 190, squareY + 135, SQUARE.y + 230),
        lookAt: CHOCHIN_POST.clone(),
      },
      lines: [
        { at: 1.2, text: "But the lantern-ghost was on watch beside the offering." },
        { at: 5.4, text: "It had one eye, no eyelid, and nowhere else to be." },
      ],
      onEnter: () => {
        tanukiMovingTarget = 0;
        tanukiTravel.position.copy(HIDE_SPOT);
        faceTarget(tanukiTravel, STAND_POS, 1, 100);
      },
      onUpdate: (k, dt) => {
        tick(dt);
        chochinTravel.position.y = CHOCHIN_POST.y + Math.sin(storyTime * 0.9) * 8;
        chochinTravel.rotation.y = Math.sin(storyTime * 0.5) * 1.1; // scanning the square
      },
    },

    // 3 — Henge: grandmother's footsteps
    {
      duration: 15,
      rig: {
        // High enough to clear every thatched roof between here and the well
        kind: "static",
        position: new THREE.Vector3(STAND_POS.x - 20, squareY + 150, STAND_POS.z + 240),
        lookAt: () => disguise.visible ? disguisePos().add(new THREE.Vector3(0, 40, 0)) : tanukiPos().add(new THREE.Vector3(0, 30, 0)),
      },
      lines: [
        { at: 1.0, text: "So: a leaf, a breath, a puff of old magic —" },
        { at: 4.6, text: "and a very ordinary stone lantern began inching across the square." },
        { at: 11.0, text: "Whenever the ghost turned, the lantern was terribly still." },
      ],
      onEnter: () => {
        disguiseProgress = 0;
      },
      onUpdate: (k, dt, s) => {
        tick(dt);
        // The poof happens at 2.2s
        if (s > 2.2 && !disguise.visible) {
          poof.burst(tanukiTravel.position.clone().add(new THREE.Vector3(0, 30, 0)));
          disguise.position.copy(tanukiTravel.position);
          disguise.visible = true;
          tanukiTravel.visible = false;
        }
        if (disguise.visible) {
          const watching = ghostIsWatching(s);
          if (!watching) {
            disguiseProgress = Math.min(1, disguiseProgress + dt / 8);
          }
          const target = STAND_POS.clone().add(new THREE.Vector3(-46, 0, 26));
          disguise.position.lerpVectors(HIDE_SPOT, target, disguiseProgress);
          disguise.position.y = groundY(disguise.position.x, disguise.position.z);
          // Hop while moving, freeze at a guilty tilt while watched
          if (!watching) {
            disguise.position.y += Math.abs(Math.sin(s * 7)) * 8;
            disguise.rotation.z = Math.sin(s * 7) * 0.06;
            dTail.rotation.y = Math.sin(s * 9) * 0.4; // the tail cannot help itself
          } else {
            disguise.rotation.z = 0.1;
          }
          // The ghost turns to look, then away
          const ghostFacing = watching ? disguise.position : CHOCHIN_POST.clone().add(new THREE.Vector3(200, 0, 200));
          faceTarget(chochinTravel, ghostFacing, dt, 6);
          chochinTravel.position.y = CHOCHIN_POST.y + Math.sin(storyTime * 0.9) * 8;
        }
      },
    },

    // 4 — The tail
    {
      duration: 10,
      rig: {
        kind: "dolly",
        from: new THREE.Vector3(STAND_POS.x + 130, squareY + 40, STAND_POS.z + 150),
        to: new THREE.Vector3(STAND_POS.x + 90, squareY + 26, STAND_POS.z + 90),
        lookFrom: () => disguisePos().add(new THREE.Vector3(0, 40, 0)),
        lookTo: () => disguisePos().add(new THREE.Vector3(0, 16, -14)),
      },
      lines: [
        { at: 1.2, text: "He had rehearsed everything. Except the tail." },
        { at: 6.2, text: "The lantern-ghost screamed the way only paper can." },
      ],
      onUpdate: (k, dt, s) => {
        tick(dt);
        // The paw sneaks out; the prize comes down
        const grab = THREE.MathUtils.clamp((s - 1.8) / 2.4, 0, 1);
        const perch = disguise.position.clone().add(new THREE.Vector3(0, 40, 16));
        topDango.getWorldPosition(new THREE.Vector3());
        if (grab > 0) {
          const from = STAND_POS.clone().add(new THREE.Vector3(0, 49, 1));
          const worldTarget = perch;
          const p = from.clone().lerp(worldTarget, grab * grab * (3 - 2 * grab));
          stand.worldToLocal(p);
          topDango.position.copy(p);
        }
        // Tail wags with excitement, dooming him
        dTail.rotation.y = Math.sin(s * 11) * 0.7;
        dTail.scale.z = 1.6 + Math.sin(s * 11) * 0.2;
        // At 6s the ghost sees: whips around, tongue out
        if (s > 5.6) {
          faceTarget(chochinTravel, disguise.position, dt, 10);
          chochinTravel.position.y = CHOCHIN_POST.y + Math.sin(storyTime * 6) * 14; // agitated bobbing
        }
      },
    },

    // 5 — The chase
    {
      duration: 13,
      rig: {
        kind: "follow",
        target: tanukiPos,
        offset: new THREE.Vector3(240, 170, 80),
        lookOffset: new THREE.Vector3(0, 24, 0),
        stiffness: 3,
      },
      lines: [
        { at: 1.4, text: "He fled — over the drum bridge, straight through the young rice —" },
        { at: 7.0, text: "pursued by furious lamplight." },
      ],
      onEnter: () => {
        // Poof back: the disguise bursts, the tanuki runs
        poof.burst(disguise.position.clone().add(new THREE.Vector3(0, 30, 0)));
        disguise.visible = false;
        tanukiTravel.visible = true;
        tanukiTravel.position.copy(pathFlee.getPoint(0));
        tanukiMovingTarget = 1;
        // The dango rides in his mouth
        scene.attach(topDango);
        tanukiTravel.add(topDango);
        topDango.position.set(0, 28, 16);
      },
      onUpdate: (k, dt) => {
        tick(dt);
        actorOnPath(tanukiTravel, pathFlee, k);
        // The ghost gives chase, always a little behind
        const chaseT = Math.max(0, k - 0.14);
        const ghostPoint = pathFlee.getPoint(chaseT);
        ghostPoint.y += 74;
        chochinTravel.position.lerp(ghostPoint, Math.min(1, dt * 4));
        faceTarget(chochinTravel, tanukiTravel.position, dt, 6);
        // Splash rings when he tears through the paddy
        if (k > 0.68 && k < 0.82 && Math.floor(storyTime * 4) !== lastDrumBeat) {
          lastDrumBeat = Math.floor(storyTime * 4);
          drumRipples.ring(tanukiTravel.position.clone().setY(groundY(tanukiTravel.position.x, tanukiTravel.position.z) + 6));
        }
      },
    },

    // 6 — The moon comes up
    {
      duration: 11,
      rig: {
        kind: "static",
        position: new THREE.Vector3(-1420, groundY(-1240, 2760) + 60, 2980),
        lookAt: () => new THREE.Vector3(-1240, groundY(-1240, 2760) + 40, 2760).lerp(moon.position, 0.12),
      },
      lines: [
        { at: 2.0, text: "And then, above the mountains, the moon came up to see." },
        { at: 6.8, text: "It is very hard to eat a stolen offering while the moon is looking at you." },
      ],
      onEnter: () => {
        tanukiMovingTarget = 0;
        moon.visible = true;
        // The ghost hangs back at the paddy's edge, catching its breath
        chochinTravel.position.set(-1010, groundY(-1010, 2120) + 80, 2120);
      },
      onUpdate: (k, dt) => {
        tick(dt);
        moodCtl.apply(dusk, 0.35 + k * 0.65);
        moon.position.lerpVectors(MOON_FROM, MOON_TO, k * k * (3 - 2 * k));
        faceTarget(tanukiTravel, moon.position, dt, 2);
      },
    },

    // 7 — The hardest trick
    {
      duration: 12,
      rig: {
        kind: "dolly",
        from: new THREE.Vector3(STAND_POS.x - 160, squareY + 150, STAND_POS.z + 240),
        to: new THREE.Vector3(STAND_POS.x + 40, squareY + 50, STAND_POS.z + 170),
        lookFrom: STAND_POS.clone().add(new THREE.Vector3(0, 30, 0)),
        lookTo: STAND_POS.clone().add(new THREE.Vector3(-30, 26, 30)),
      },
      lines: [
        { at: 1.4, text: "So he brought it back — which is the hardest trick a tanuki knows." },
        { at: 7.2, text: "And because the moon was full and the night was kind, the lantern shared." },
      ],
      onEnter: () => {
        tanukiMovingTarget = 1;
        chochinTravel.position.copy(CHOCHIN_POST);
      },
      onUpdate: (k, dt, s) => {
        tick(dt);
        const walkT = Math.min(1, s / 5.5);
        actorOnPath(tanukiTravel, pathReturn, walkT);
        if (walkT >= 1) {
          tanukiMovingTarget = 0;
          faceTarget(tanukiTravel, STAND_POS, dt, 4);
          // The dango returns to its place...
          const putBack = THREE.MathUtils.clamp((s - 6) / 2, 0, 1);
          if (putBack > 0 && topDango.parent === tanukiTravel) {
            scene.attach(topDango);
          }
          if (topDango.parent === scene) {
            const home = STAND_POS.clone().add(new THREE.Vector3(0, 49, 1));
            topDango.position.lerp(home, Math.min(1, dt * 3));
          }
          // ...and the ghost nudges one across in return
          const share = THREE.MathUtils.clamp((s - 9) / 2.5, 0, 1);
          if (share > 0) {
            const gift = dango[2]!;
            if (gift.parent === stand) scene.attach(gift);
            const mouth = tanukiTravel.position.clone().add(new THREE.Vector3(0, 26, 18));
            gift.position.lerp(mouth, Math.min(1, dt * 2.4));
          }
        }
        faceTarget(chochinTravel, tanukiTravel.position, dt, 3);
        chochinTravel.position.y = CHOCHIN_POST.y + Math.sin(storyTime * 0.9) * 8;
      },
    },

    // 8 — Pon poko pon
    {
      duration: 13,
      rig: {
        kind: "dolly",
        from: new THREE.Vector3(STAND_POS.x + 120, squareY + 50, STAND_POS.z + 200),
        to: new THREE.Vector3(STAND_POS.x + 60, squareY + 380, STAND_POS.z + 560),
        lookFrom: () => tanukiPos().add(new THREE.Vector3(0, 30, 0)),
        lookTo: () => tanukiPos().clone().lerp(moon.position, 0.2),
      },
      lines: [
        { at: 2.0, text: "If you hear drumming on the night of the full moon, it is not thunder." },
        { at: 7.6, text: "It is a round belly, keeping time for the sky." },
      ],
      onUpdate: (k, dt, s) => {
        tick(dt);
        moodCtl.apply(dusk, 1);
        // The belly-drum: rhythmic bounce with sound-ripples
        const beat = Math.floor(s / 0.62);
        if (beat !== lastDrumBeat && s > 0.6) {
          lastDrumBeat = beat;
          drumRipples.ring(tanukiTravel.position.clone().add(new THREE.Vector3(0, 30, 14)));
        }
        tanukiTravel.rotation.y += Math.sin(s * 10.1) * 0.004;
        tanuki.group.rotation.x = Math.abs(Math.sin(s * 5.05)) * -0.12;
        // The ghost sways like a festival lantern
        chochinTravel.position.y = CHOCHIN_POST.y + Math.sin(s * 5.05) * 16;
        chochinTravel.rotation.z = Math.sin(s * 2.5) * 0.15;
      },
    },
  ];

  return {
    title: "The Tanuki and the Moon-Offering",
    subtitle: "狸と月見団子 — a tale of Kakuriyo",
    shots,
    onStart: () => {
      scene.add(props);
      moodCtl.apply(dusk, 0);
    },
    onEnd: () => {
      moodCtl.restore();
      poof.dispose();
      drumRipples.dispose();
      props.traverse((child) => {
        if (child instanceof THREE.Mesh || child instanceof THREE.Points) {
          child.geometry.dispose();
          if (child.material instanceof THREE.Material) child.material.dispose();
        }
      });
      topDango.removeFromParent();
      dango.forEach((ball) => ball.removeFromParent());
      props.removeFromParent();
    },
  };
};
