import * as THREE from "three";
import type { StoryOverlay } from "./overlay.ts";

/**
 * The story engine: a sequence of shots, each owning the camera for its
 * duration, cueing narration lines at set moments, and running whatever
 * scene logic the tale needs. Esc leaves the tale at any point.
 */

type Vec3Like = THREE.Vector3 | (() => THREE.Vector3);

const resolve = (v: Vec3Like): THREE.Vector3 => (typeof v === "function" ? v() : v);

export type CameraRig =
  | { kind: "static"; position: Vec3Like; lookAt: Vec3Like }
  | { kind: "dolly"; from: Vec3Like; to: Vec3Like; lookFrom: Vec3Like; lookTo: Vec3Like; ease?: boolean }
  | { kind: "follow"; target: Vec3Like; offset: THREE.Vector3; lookOffset?: THREE.Vector3; stiffness?: number }
  | { kind: "orbit"; center: Vec3Like; radius: number; height: number; speed: number; startAngle: number };

export type Shot = {
  duration: number;
  rig: CameraRig;
  /** Narration cues: seconds into the shot → line of text. */
  lines?: Array<{ at: number; text: string }>;
  onEnter?: () => void;
  onUpdate?: (shotT01: number, dt: number, shotSeconds: number) => void;
  onExit?: () => void;
};

export type Story = {
  title: string;
  subtitle: string;
  shots: Shot[];
  onStart?: () => void;
  onEnd?: () => void;
};

export type StoryPlayer = {
  play: (story: Story) => void;
  stop: () => void;
  update: (t: number, dt: number) => void;
  isActive: () => boolean;
};

const smooth = (x: number) => x * x * (3 - 2 * x);

export const createStoryPlayer = ({
  camera,
  overlay,
  onFinished,
  groundY,
  cameraClearance = 26,
  occluders,
}: {
  camera: THREE.PerspectiveCamera;
  overlay: StoryOverlay;
  onFinished: () => void;
  /** World surface function; when set, the camera never dips beneath it. */
  groundY?: (x: number, z: number) => number;
  cameraClearance?: number;
  /**
   * Solid scenery (terrain, mountains, buildings). Each frame a ray is
   * cast from the shot's look-target back toward the desired camera; if
   * scenery interrupts it, the camera booms in front of the obstruction.
   * This center-line guard complements authored clear paths; it is not a
   * full camera-volume collision solver and excludes decorative foliage.
   */
  occluders?: THREE.Object3D[];
}): StoryPlayer => {
  let story: Story | null = null;
  let shotIndex = 0;
  let shotTime = 0;
  let firedLines = 0;
  const smoothedLook = new THREE.Vector3();
  // Keep the authored follow motion independent of collision corrections.
  const followPosition = new THREE.Vector3();
  let lookInitialized = false;

  const enterShot = (index: number) => {
    if (!story) return;
    overlay.clearLines();
    shotIndex = index;
    shotTime = 0;
    firedLines = 0;
    story.shots[index]?.onEnter?.();
  };

  const finish = () => {
    if (!story) return;
    const ending = story;
    story = null;
    overlay.clearLines();
    overlay.hideTitle();
    overlay.hideHint();
    ending.onEnd?.();
    onFinished();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (story && event.key === "Escape") {
      finish();
    }
  };
  window.addEventListener("keydown", onKeyDown);

  /** Runs the rig, returning the look-target it aimed the camera at. */
  const runRig = (rig: CameraRig, shotT01: number, dt: number): THREE.Vector3 => {
    switch (rig.kind) {
      case "static": {
        camera.position.copy(resolve(rig.position));
        const look = resolve(rig.lookAt);
        camera.lookAt(look);
        return look;
      }
      case "dolly": {
        const k = rig.ease === false ? shotT01 : smooth(shotT01);
        camera.position.lerpVectors(resolve(rig.from), resolve(rig.to), k);
        const look = new THREE.Vector3().lerpVectors(resolve(rig.lookFrom), resolve(rig.lookTo), k);
        camera.lookAt(look);
        return look;
      }
      case "follow": {
        const target = resolve(rig.target);
        const desired = target.clone().add(rig.offset);
        const stiffness = rig.stiffness ?? 2.4;
        const lookPoint = target.clone().add(rig.lookOffset ?? new THREE.Vector3(0, 20, 0));
        if (!lookInitialized) {
          smoothedLook.copy(lookPoint);
          followPosition.copy(desired);
          lookInitialized = true;
        }
        const blend = 1 - Math.exp(-dt * stiffness);
        followPosition.lerp(desired, blend);
        camera.position.copy(followPosition);
        // Aim follows the current subject; translation alone supplies the
        // cinematic lag. Delaying both can lose fast actors around tight bends.
        smoothedLook.copy(lookPoint);
        camera.lookAt(smoothedLook);
        return smoothedLook.clone();
      }
      case "orbit": {
        const center = resolve(rig.center);
        const angle = rig.startAngle + shotTime * rig.speed;
        camera.position.set(
          center.x + Math.cos(angle) * rig.radius,
          center.y + rig.height,
          center.z + Math.sin(angle) * rig.radius
        );
        camera.lookAt(center);
        return center;
      }
    }
  };

  /* ── Camera boom: never inside scenery ──
     A ray runs from the look-target toward the desired camera position;
     if solid scenery interrupts it, the camera pulls in front of the
     obstruction — instantly when blocked, easing back out when clear. */
  const raycaster = new THREE.Raycaster();
  // Occluder groups contain Sprites (lantern halos); Sprite.raycast
  // requires the camera or it throws mid-frame.
  raycaster.camera = camera;
  const boomDir = new THREE.Vector3();
  let boomFrac = 1;
  let boomFresh = true;

  const resolveBoom = (look: THREE.Vector3, dt: number) => {
    if (!occluders || occluders.length === 0) return;
    boomDir.copy(camera.position).sub(look);
    const dist = boomDir.length();
    if (dist < 1) return;
    boomDir.normalize();
    raycaster.set(look, boomDir);
    raycaster.far = dist;
    const hits = raycaster.intersectObjects(occluders, true).filter((hit) => {
      // Light halos and invisible helpers are not physical camera obstacles.
      if (!(hit.object instanceof THREE.Mesh)) return false;
      for (let node: THREE.Object3D | null = hit.object; node; node = node.parent) {
        if (!node.visible) return false;
      }
      const materials = Array.isArray(hit.object.material) ? hit.object.material : [hit.object.material];
      const material = materials[hit.face?.materialIndex ?? 0];
      return material?.visible && !(material.transparent && !material.depthWrite);
    });

    let targetFrac = 1;
    if (hits.length > 0) {
      // A minimum subject distance must never override an actual obstruction.
      targetFrac = THREE.MathUtils.clamp((hits[0]!.distance - 20) / dist, 0, 1);
    }
    if (boomFresh) {
      boomFrac = targetFrac; // a fresh shot must not start embedded
      boomFresh = false;
    } else if (targetFrac < boomFrac) {
      boomFrac = targetFrac; // snap in front of obstruction immediately
    } else {
      boomFrac += (targetFrac - boomFrac) * (1 - Math.exp(-dt * 3.7));
    }
    camera.position.copy(look).addScaledVector(boomDir, dist * boomFrac);
  };

  return {
    play: (next) => {
      story = next;
      lookInitialized = false;
      boomFresh = true;
      overlay.showTitle(next.title, next.subtitle);
      overlay.showHint();
      next.onStart?.();
      enterShot(0);
      // The title lingers over the first shot, then bows out
      window.setTimeout(() => overlay.hideTitle(), 6500);
    },
    stop: finish,
    update: (_t, dt) => {
      if (!story) return;
      const shot = story.shots[shotIndex];
      if (!shot) {
        finish();
        return;
      }

      shotTime += dt;
      const shotT01 = Math.min(1, shotTime / shot.duration);

      // Narration cues
      if (shot.lines) {
        while (firedLines < shot.lines.length && shotTime >= shot.lines[firedLines]!.at) {
          overlay.addLine(shot.lines[firedLines]!.text);
          firedLines += 1;
        }
      }

      // Choreography must precede framing: targets now describe this frame.
      shot.onUpdate?.(shotT01, dt, shotTime);
      const lookPoint = runRig(shot.rig, shotT01, dt);

      // Raise the intended endpoint before checking the sightline.
      if (groundY) {
        const minY = groundY(camera.position.x, camera.position.z) + cameraClearance;
        if (camera.position.y < minY) {
          camera.position.y = minY;
        }
      }
      resolveBoom(lookPoint, dt);
      if (groundY) {
        camera.position.y = Math.max(camera.position.y,
          groundY(camera.position.x, camera.position.z) + cameraClearance);
      }
      // Ground/boom corrections change the view direction, especially on slopes.
      camera.lookAt(lookPoint);

      if (shotTime >= shot.duration) {
        shot.onExit?.();
        if (shotIndex + 1 < story.shots.length) {
          lookInitialized = false;
          boomFresh = true;
          enterShot(shotIndex + 1);
        } else {
          finish();
        }
      }
    },
    isActive: () => story !== null,
  };
};
