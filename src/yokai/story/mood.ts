import * as THREE from "three";
import type { KakuriyoSky } from "../sky.ts";
import type { SpiritLayer } from "../spirits.ts";

/**
 * Shared mood machinery: every tale wants to repaint the world's light —
 * the fox needed midnight, the tanuki needs a moonrise dusk. A controller
 * captures the day's true colors once, lerps toward any target, and can
 * always restore the world exactly as it found it.
 */

export type StoryWorld = {
  scene: THREE.Scene;
  sky: KakuriyoSky;
  sun: THREE.DirectionalLight;
  skyFill: THREE.HemisphereLight;
  warmAmbient: THREE.AmbientLight;
  fog: THREE.Fog;
  toriiPath: THREE.Vector3[];
  /** The ambient population, so tales can step their leads offstage. */
  spirits?: SpiritLayer;
};

export type Mood = {
  zenith: THREE.Color;
  horizon: THREE.Color;
  sunColor: THREE.Color;
  sunI: number;
  fillI: number;
  ambI: number;
  fog: THREE.Color;
};

export const MOODS = {
  midnight: {
    zenith: new THREE.Color("#141f3a"),
    horizon: new THREE.Color("#2c3a5c"),
    sunColor: new THREE.Color("#8fa6cf"),
    sunI: 0.5,
    fillI: 0.38,
    ambI: 0.1,
    fog: new THREE.Color("#2a3348"),
  } as Mood,
  moonriseDusk: {
    zenith: new THREE.Color("#333a66"),
    horizon: new THREE.Color("#c97a54"),
    sunColor: new THREE.Color("#e8d9b8"),
    sunI: 0.78,
    fillI: 0.52,
    ambI: 0.16,
    fog: new THREE.Color("#4a4460"),
  } as Mood,
};

export type MoodController = {
  /** Blend from the captured day toward `target` by k (0 → day, 1 → target). */
  apply: (target: Mood, k: number) => void;
  /** Blend between two moods (for dusk → deep night hand-offs). */
  blend: (from: Mood, to: Mood, k: number) => void;
  /** Snap the world back to the day it was captured on. */
  restore: () => void;
};

export const createMoodController = (world: StoryWorld): MoodController => {
  const { sky, sun, skyFill, warmAmbient, fog } = world;

  const day: Mood = {
    zenith: sky.uniforms.zenithColor.value.clone(),
    horizon: sky.uniforms.horizonColor.value.clone(),
    sunColor: sky.uniforms.sunColor.value.clone(),
    sunI: sun.intensity,
    fillI: skyFill.intensity,
    ambI: warmAmbient.intensity,
    fog: fog.color.clone(),
  };

  const blend = (from: Mood, to: Mood, k: number) => {
    sky.uniforms.zenithColor.value.lerpColors(from.zenith, to.zenith, k);
    sky.uniforms.horizonColor.value.lerpColors(from.horizon, to.horizon, k);
    sky.uniforms.sunColor.value.lerpColors(from.sunColor, to.sunColor, k);
    sun.intensity = THREE.MathUtils.lerp(from.sunI, to.sunI, k);
    skyFill.intensity = THREE.MathUtils.lerp(from.fillI, to.fillI, k);
    warmAmbient.intensity = THREE.MathUtils.lerp(from.ambI, to.ambI, k);
    fog.color.lerpColors(from.fog, to.fog, k);
  };

  return {
    apply: (target, k) => blend(day, target, k),
    blend,
    restore: () => blend(day, day, 0),
  };
};
