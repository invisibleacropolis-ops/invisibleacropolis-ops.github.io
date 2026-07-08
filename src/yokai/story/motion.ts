import * as THREE from "three";
import { heightAt } from "../terrain.ts";
import { PEAK_LEDGE, SACRED_PEAK } from "../mountains.ts";

/**
 * Shared story motion utilities.
 *
 * worldGroundY — the true walkable surface: the terrain heightfield PLUS
 * the sacred peak's cone and the hokora ledge, which live outside the
 * heightfield. Cameras and actors clamp against this so nothing sinks
 * into the mountain.
 *
 * createActorMover — moves an actor along a curve with ground-sticking,
 * and derives its heading from actual frame-to-frame motion (smoothly
 * turned), so a creature always faces the way it is really going.
 */

const CONE_APEX_Y = 2280;
const CONE_BASE_Y = -220;
const CONE_RADIUS = 1750;

export const worldGroundY = (x: number, z: number): number => {
  let ground = heightAt(x, z);

  // The sacred peak is a mesh cone, invisible to the heightfield
  const peakDist = Math.hypot(x - SACRED_PEAK.x, z - SACRED_PEAK.z);
  if (peakDist < CONE_RADIUS) {
    const coneY = CONE_APEX_Y - (peakDist / CONE_RADIUS) * (CONE_APEX_Y - CONE_BASE_Y);
    ground = Math.max(ground, coneY);
  }

  // The hokora ledge platform juts out of the flank
  const ledgeDist = Math.hypot(x - PEAK_LEDGE.x, z - PEAK_LEDGE.z);
  if (ledgeDist < 95) {
    ground = Math.max(Math.min(ground, PEAK_LEDGE.y), PEAK_LEDGE.y);
  }

  return ground;
};

export type ActorMover = {
  /** Teleport (scene setup): sets position and resets heading memory. */
  place: (p: THREE.Vector3, faceToward?: THREE.Vector3) => void;
  /** Move to the curve point at t01, stuck to the ground, facing travel. */
  onCurve: (curve: THREE.CatmullRomCurve3, t01: number, dt: number) => void;
  /** Smoothly turn in place to face a point (idle beats). */
  faceToward: (target: THREE.Vector3, dt: number, rate?: number) => void;
};

export const createActorMover = (
  travel: THREE.Group,
  ground: (x: number, z: number) => number = worldGroundY,
  turnRate = 7
): ActorMover => {
  const prev = new THREE.Vector3();
  let hasPrev = false;

  const turnTo = (targetYaw: number, dt: number, rate: number) => {
    let delta = targetYaw - travel.rotation.y;
    delta = Math.atan2(Math.sin(delta), Math.cos(delta));
    travel.rotation.y += delta * Math.min(1, dt * rate);
  };

  return {
    place: (p, faceToward) => {
      travel.position.copy(p);
      travel.position.y = Math.max(p.y, ground(p.x, p.z));
      if (faceToward) {
        travel.rotation.y = Math.atan2(faceToward.x - p.x, faceToward.z - p.z);
      }
      hasPrev = false;
    },
    onCurve: (curve, t01, dt) => {
      const p = curve.getPoint(THREE.MathUtils.clamp(t01, 0, 1));
      // Never below the real surface, even between control points
      p.y = Math.max(p.y, ground(p.x, p.z));
      travel.position.copy(p);

      if (hasPrev) {
        const dx = p.x - prev.x;
        const dz = p.z - prev.z;
        // Only steer on meaningful motion; micro-jitters don't spin the actor
        if (dx * dx + dz * dz > 0.25) {
          turnTo(Math.atan2(dx, dz), dt, turnRate);
        }
      }
      prev.copy(p);
      hasPrev = true;
    },
    faceToward: (target, dt, rate = 5) => {
      turnTo(
        Math.atan2(target.x - travel.position.x, target.z - travel.position.z),
        dt,
        rate
      );
    },
  };
};
