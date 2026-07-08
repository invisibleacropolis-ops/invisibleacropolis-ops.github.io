import * as THREE from "three";
import type { Story } from "./engine.ts";
import { createMoodController, MOODS, type StoryWorld } from "./mood.ts";
import { buildKappa, buildKitsune } from "../spirits.ts";
import { heightAt, WATER_LEVEL } from "../terrain.ts";
import { PEAK_LEDGE } from "../mountains.ts";

/**
 * THE FOX AND THE FALLEN STAR
 *
 * A star slips from the sky into the spirit pond. The five-tailed
 * kitsune of the shrine road carries it up the sacred mountain, to the
 * little hokora on the world's shoulder, and throws it home.
 */

const STAR_REST = new THREE.Vector3(-620, WATER_LEVEL + 10, 1105);
const SHORE = new THREE.Vector3(-490, 0, 1235);

export const createFoxStarStory = (world: StoryWorld): Story => {
  const { scene, toriiPath } = world;

  /* ── Mood: the world dims to midnight and back ── */
  const moodCtl = createMoodController(world);
  const applyMood = (k: number) => moodCtl.apply(MOODS.midnight, k);

  /* ── Actors & props ── */
  const props = new THREE.Group();
  props.name = "fox-star-story";

  // The fox
  const fox = buildKitsune();
  const foxTravel = new THREE.Group();
  foxTravel.scale.setScalar(1.5);
  foxTravel.add(fox.group);
  props.add(foxTravel);
  let foxMoving = 0;
  let foxMovingTarget = 0;

  // The kappa, witness and failed cucumber-diplomat
  const kappa = buildKappa();
  const kappaTravel = new THREE.Group();
  kappaTravel.scale.setScalar(1.3);
  kappaTravel.add(kappa.group);
  kappaTravel.position.set(-712, heightAt(-712, 1078), 1078);
  kappaTravel.lookAt(STAR_REST.x, kappaTravel.position.y, STAR_REST.z);
  props.add(kappaTravel);

  // The star: warm core, breathing halo
  const star = new THREE.Group();
  const starCore = new THREE.Mesh(
    new THREE.SphereGeometry(9, 12, 10),
    new THREE.MeshBasicMaterial({ color: "#fff4cf" })
  );
  const haloMat = new THREE.MeshBasicMaterial({
    color: "#ffe6a3",
    transparent: true,
    opacity: 0.3,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const starHalo = new THREE.Mesh(new THREE.SphereGeometry(20, 12, 10), haloMat);
  const cometTail = new THREE.Mesh(new THREE.ConeGeometry(7, 90, 8), haloMat);
  cometTail.position.y = 50;
  cometTail.visible = false;
  star.add(starCore, starHalo, cometTail);
  star.visible = false;
  props.add(star);

  // Splash ring where the star strikes the pond
  const splash = new THREE.Mesh(
    new THREE.TorusGeometry(20, 3, 8, 32),
    new THREE.MeshBasicMaterial({ color: "#f2fbff", transparent: true, opacity: 0 })
  );
  splash.rotation.x = -Math.PI / 2;
  splash.position.set(STAR_REST.x, WATER_LEVEL + 2, STAR_REST.z);
  props.add(splash);

  // The night's stars, waiting to be joined
  const starfieldGeo = new THREE.BufferGeometry();
  const starCount = 750;
  const starPositions = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i += 1) {
    const u = Math.random();
    const v = Math.random() * 0.85 + 0.12;
    const theta = u * Math.PI * 2;
    const phi = Math.acos(1 - v);
    const r = 8300;
    starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    starPositions[i * 3 + 1] = r * Math.cos(phi);
    starPositions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
  }
  starfieldGeo.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
  const starfieldMat = new THREE.PointsMaterial({
    color: "#f4ecd8",
    size: 20,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const starfield = new THREE.Points(starfieldGeo, starfieldMat);
  starfield.frustumCulled = false;
  props.add(starfield);

  // Sparkle trail for the homeward throw
  const sparkGeo = new THREE.BufferGeometry();
  const sparkCount = 70;
  const sparkPositions = new Float32Array(sparkCount * 3);
  sparkGeo.setAttribute("position", new THREE.BufferAttribute(sparkPositions, 3));
  const sparkMat = new THREE.PointsMaterial({
    color: "#ffe9b0",
    size: 14,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const sparks = new THREE.Points(sparkGeo, sparkMat);
  sparks.frustumCulled = false;
  props.add(sparks);

  /* ── Paths ── */
  const groundPoint = (x: number, z: number, lift = 0) => new THREE.Vector3(x, heightAt(x, z) + lift, z);

  const t1 = toriiPath[1] ?? groundPoint(900, 900);
  const t3 = toriiPath[3] ?? groundPoint(1000, 1400);
  const t5 = toriiPath[5] ?? groundPoint(1100, 1900);

  const pathRoad = new THREE.CatmullRomCurve3([
    t1.clone(), t3.clone(), t5.clone(),
  ]);

  const bridgeMid = groundPoint(-820, 1690, 56);
  const pathJourney = new THREE.CatmullRomCurve3([
    t5.clone(),
    groundPoint(240, 1780),
    groundPoint(-320, 2020),
    groundPoint(-660, 1800),
    bridgeMid,
    groundPoint(-980, 1430),
    groundPoint(SHORE.x, SHORE.z),
  ]);

  const pathClimb = new THREE.CatmullRomCurve3([
    groundPoint(SHORE.x, SHORE.z),
    groundPoint(-900, 690),
    groundPoint(-1240, 110),
    groundPoint(-1500, -430),
    new THREE.Vector3(-1660, 330, -930),
    new THREE.Vector3(-1770, 580, -1380),
    new THREE.Vector3(-1580, 770, -1730),
    new THREE.Vector3(PEAK_LEDGE.x + 40, PEAK_LEDGE.y, PEAK_LEDGE.z + 40),
  ]);

  // The comet's fall, and the throw home
  const cometPath = new THREE.CatmullRomCurve3([
    new THREE.Vector3(2400, 4200, -2400),
    new THREE.Vector3(900, 2300, -300),
    new THREE.Vector3(-200, 900, 700),
    STAR_REST.clone(),
  ]);
  const throwPath = new THREE.CatmullRomCurve3([
    new THREE.Vector3(PEAK_LEDGE.x, PEAK_LEDGE.y + 60, PEAK_LEDGE.z),
    new THREE.Vector3(PEAK_LEDGE.x + 300, PEAK_LEDGE.y + 700, PEAK_LEDGE.z + 200),
    new THREE.Vector3(PEAK_LEDGE.x - 200, PEAK_LEDGE.y + 1600, PEAK_LEDGE.z - 100),
    new THREE.Vector3(PEAK_LEDGE.x + 100, PEAK_LEDGE.y + 3000, PEAK_LEDGE.z + 100),
  ]);

  const foxOnPath = (curve: THREE.CatmullRomCurve3, t01: number) => {
    const p = curve.getPoint(t01);
    foxTravel.position.copy(p);
    const ahead = curve.getPoint(Math.min(1, t01 + 0.008));
    const yaw = Math.atan2(ahead.x - p.x, ahead.z - p.z);
    foxTravel.rotation.y = yaw;
  };

  /* ── Shared per-frame tick ── */
  let storyTime = 0;
  const tick = (dt: number) => {
    storyTime += dt;
    foxMoving += (foxMovingTarget - foxMoving) * Math.min(1, dt * 3);
    fox.animate(storyTime, 0.4, foxMoving);
    kappa.animate(storyTime, 1.7, 0);
    // Star breath: dimmer while fallen, brighter once carried
    const breath = 1 + Math.sin(storyTime * 2.6) * 0.12;
    starHalo.scale.setScalar(breath);
    starfield.rotation.y = storyTime * 0.002;
  };

  const foxPos = () => foxTravel.position.clone();

  /* ── The shots ── */
  const shots: Story["shots"] = [
    // 0 — Nightfall
    {
      duration: 9,
      rig: {
        kind: "dolly",
        from: new THREE.Vector3(-1600, 1500, 3200),
        to: new THREE.Vector3(-400, 900, 2400),
        lookFrom: new THREE.Vector3(700, 250, 350),
        lookTo: new THREE.Vector3(200, 150, 800),
      },
      lines: [{ at: 3.2, text: "When the sun slipped behind the mountains, Kakuriyo held its breath." }],
      onEnter: () => {
        foxOnPath(pathRoad, 0);
        foxMovingTarget = 0;
      },
      onUpdate: (k, dt) => {
        tick(dt);
        applyMood(Math.min(1, k * 1.25));
        starfieldMat.opacity = Math.min(0.5, k * 0.5);
      },
    },

    // 1 — The star falls
    {
      duration: 9.5,
      rig: {
        kind: "static",
        position: new THREE.Vector3(-1450, 190, 1720),
        lookAt: () => star.visible ? star.position.clone() : new THREE.Vector3(400, 1500, 0),
      },
      lines: [
        { at: 0.8, text: "That night, a young star lost its footing on the sky." },
        { at: 6.6, text: "It fell — past the clouds, past the wind — into the spirit pond." },
      ],
      onEnter: () => {
        star.visible = true;
        cometTail.visible = true;
      },
      onUpdate: (k, dt, s) => {
        tick(dt);
        const fallT = THREE.MathUtils.clamp((s - 1.2) / 4.6, 0, 1);
        const eased = fallT * fallT;
        star.position.copy(cometPath.getPoint(eased));
        const ahead = cometPath.getPoint(Math.min(1, eased + 0.02));
        star.lookAt(ahead);
        if (fallT >= 1) {
          cometTail.visible = false;
          star.position.copy(STAR_REST);
          const splashT = THREE.MathUtils.clamp((s - 5.8) / 1.6, 0, 1);
          splash.scale.setScalar(1 + splashT * 7);
          (splash.material as THREE.MeshBasicMaterial).opacity = 0.7 * (1 - splashT);
          // Dim, hurt light
          haloMat.opacity = 0.16 + Math.sin(storyTime * 3.4) * 0.05;
        }
      },
    },

    // 2 — The fox sees
    {
      duration: 10,
      rig: {
        kind: "follow",
        target: foxPos,
        offset: new THREE.Vector3(-130, 150, -170),
        lookOffset: new THREE.Vector3(0, 30, 60),
      },
      lines: [
        { at: 1.4, text: "On the shrine road, the five-tailed fox saw the sky stumble." },
        { at: 6.2, text: "Curiosity is a fox's oldest religion." },
      ],
      onEnter: () => {
        foxMovingTarget = 1;
      },
      onUpdate: (k, dt) => {
        tick(dt);
        foxOnPath(pathRoad, k);
      },
    },

    // 3 — The journey
    {
      duration: 13,
      rig: {
        kind: "follow",
        target: foxPos,
        // High enough to clear the bamboo grove the route threads through
        offset: new THREE.Vector3(230, 175, 70),
        lookOffset: new THREE.Vector3(0, 26, 0),
        stiffness: 3,
      },
      lines: [
        { at: 1.6, text: "She ran — through sleeping meadows, over the drum bridge," },
        { at: 6.8, text: "past houses dreaming under their deep thatch." },
      ],
      onUpdate: (k, dt) => {
        tick(dt);
        foxOnPath(pathJourney, k);
      },
    },

    // 4 — At the pond
    {
      duration: 12,
      rig: {
        kind: "static",
        position: new THREE.Vector3(-980, 70, 1420),
        lookAt: STAR_REST.clone().add(new THREE.Vector3(60, 10, 40)),
      },
      lines: [
        { at: 1.0, text: "In the shallows lay the star, growing dim." },
        { at: 4.6, text: "「The sky is so far,」 it wept, 「and I am so small.」" },
        { at: 8.4, text: "The kappa had offered it a cucumber. It had not helped." },
      ],
      onEnter: () => {
        foxMovingTarget = 0;
        foxTravel.position.set(SHORE.x, heightAt(SHORE.x, SHORE.z), SHORE.z);
        foxTravel.lookAt(STAR_REST.x, foxTravel.position.y, STAR_REST.z);
      },
      onUpdate: (k, dt, s) => {
        tick(dt);
        // The kappa bows solemnly to the visiting fox
        const bow = THREE.MathUtils.clamp((s - 8.2) / 1.4, 0, 1);
        kappa.group.rotation.x = Math.sin(Math.min(1, bow) * Math.PI) * 0.5;
      },
    },

    // 5 — The promise
    {
      duration: 8.5,
      rig: {
        kind: "dolly",
        from: new THREE.Vector3(-870, 60, 1350),
        to: new THREE.Vector3(-700, 46, 1290),
        lookFrom: STAR_REST.clone(),
        lookTo: () => foxTravel.position.clone().add(new THREE.Vector3(0, 40, 0)),
      },
      lines: [
        { at: 1.6, text: "「Then ride my tails,」 said the fox. 「The mountain knows the way home.」" },
      ],
      onUpdate: (k, dt) => {
        tick(dt);
        // The star gathers its courage and floats to the fox's back
        const lift = THREE.MathUtils.clamp((k - 0.3) / 0.55, 0, 1);
        const eased = lift * lift * (3 - 2 * lift);
        const perch = foxTravel.position.clone().add(new THREE.Vector3(0, 62, 0));
        star.position.lerpVectors(STAR_REST, perch, eased);
        haloMat.opacity = 0.16 + eased * 0.2;
      },
      onExit: () => {
        // Ride the fox from here on
        foxTravel.add(star);
        star.position.set(0, 46, -16);
        star.rotation.set(0, 0, 0);
      },
    },

    // 6 — The climb
    {
      duration: 16,
      rig: {
        kind: "follow",
        target: foxPos,
        offset: new THREE.Vector3(150, 120, 190),
        lookOffset: new THREE.Vector3(0, 30, 0),
        stiffness: 2.6,
      },
      lines: [
        { at: 2.0, text: "Up she climbed, past the sleeping clouds," },
        { at: 8.2, text: "to where the air thins into prayer." },
      ],
      onEnter: () => {
        foxMovingTarget = 1;
      },
      onUpdate: (k, dt) => {
        tick(dt);
        foxOnPath(pathClimb, k);
        starfieldMat.opacity = 0.5 + k * 0.25;
      },
    },

    // 7 — The throw
    {
      duration: 13,
      rig: {
        kind: "static",
        position: new THREE.Vector3(PEAK_LEDGE.x + 260, PEAK_LEDGE.y + 60, PEAK_LEDGE.z + 300),
        lookAt: () => star.getWorldPosition(new THREE.Vector3()).lerp(new THREE.Vector3(PEAK_LEDGE.x, PEAK_LEDGE.y + 120, PEAK_LEDGE.z), 0.4),
      },
      lines: [
        { at: 1.2, text: "At the little shrine on the world's shoulder, she threw with all five tails." },
        { at: 9.0, text: "And the sky, delighted, caught it." },
      ],
      onEnter: () => {
        foxMovingTarget = 0;
        foxTravel.position.set(PEAK_LEDGE.x + 30, PEAK_LEDGE.y, PEAK_LEDGE.z + 30);
        foxTravel.rotation.y = Math.PI * 0.15;
        // Free the star for its flight
        scene.attach(star);
        star.position.set(PEAK_LEDGE.x, PEAK_LEDGE.y + 60, PEAK_LEDGE.z);
      },
      onUpdate: (k, dt, s) => {
        tick(dt);
        const throwT = THREE.MathUtils.clamp((s - 2.2) / 7, 0, 1);
        const eased = throwT * throwT * (3 - 2 * throwT) ;
        star.position.copy(throwPath.getPoint(eased));
        // A joyful spiral as it rises
        star.position.x += Math.sin(throwT * Math.PI * 6) * 90 * throwT;
        star.position.z += Math.cos(throwT * Math.PI * 6) * 90 * throwT;
        haloMat.opacity = 0.36 + throwT * 0.3;
        // Sparkle trail chases it
        sparkMat.opacity = throwT > 0 && throwT < 1 ? 0.9 : Math.max(0, 0.9 - (s - 9.2));
        const attr = sparkGeo.getAttribute("position") as THREE.BufferAttribute;
        for (let i = 0; i < sparkCount; i += 1) {
          const trailT = Math.max(0, eased - i * 0.011);
          const p = throwPath.getPoint(trailT);
          attr.setXYZ(
            i,
            p.x + Math.sin(trailT * Math.PI * 6) * 90 * trailT,
            p.y,
            p.z + Math.cos(trailT * Math.PI * 6) * 90 * trailT
          );
        }
        attr.needsUpdate = true;
        starfieldMat.opacity = 0.75 + throwT * 0.2;
        if (throwT >= 1) {
          star.visible = false;
        }
      },
    },

    // 8 — Dawn
    {
      duration: 12,
      rig: {
        kind: "dolly",
        from: new THREE.Vector3(PEAK_LEDGE.x + 400, PEAK_LEDGE.y + 160, PEAK_LEDGE.z + 480),
        to: new THREE.Vector3(-100, 1250, 2400),
        lookFrom: new THREE.Vector3(PEAK_LEDGE.x, PEAK_LEDGE.y + 60, PEAK_LEDGE.z),
        lookTo: new THREE.Vector3(400, 260, 300),
      },
      lines: [
        { at: 2.2, text: "They say a fox's wish still burns among the stars —" },
        { at: 6.8, text: "look for the small one that flickers, and flickers back." },
      ],
      onUpdate: (k, dt) => {
        tick(dt);
        applyMood(1 - k);
        starfieldMat.opacity = Math.max(0, 0.95 - k * 1.2);
      },
    },
  ];

  return {
    title: "The Fox and the Fallen Star",
    subtitle: "狐と流れ星 — a tale of Kakuriyo",
    shots,
    onStart: () => {
      scene.add(props);
      applyMood(0);
    },
    onEnd: () => {
      applyMood(0);
      props.traverse((child) => {
        if (child instanceof THREE.Mesh || child instanceof THREE.Points) {
          child.geometry.dispose();
          if (child.material instanceof THREE.Material) child.material.dispose();
        }
      });
      // The star may be riding the scene graph elsewhere
      star.removeFromParent();
      props.removeFromParent();
    },
  };
};
