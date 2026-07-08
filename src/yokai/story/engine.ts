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
}: {
  camera: THREE.PerspectiveCamera;
  overlay: StoryOverlay;
  onFinished: () => void;
}): StoryPlayer => {
  let story: Story | null = null;
  let shotIndex = 0;
  let shotTime = 0;
  let firedLines = 0;
  const smoothedLook = new THREE.Vector3();
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

  const runRig = (rig: CameraRig, shotT01: number, dt: number) => {
    switch (rig.kind) {
      case "static": {
        camera.position.copy(resolve(rig.position));
        camera.lookAt(resolve(rig.lookAt));
        break;
      }
      case "dolly": {
        const k = rig.ease === false ? shotT01 : smooth(shotT01);
        camera.position.lerpVectors(resolve(rig.from), resolve(rig.to), k);
        const look = new THREE.Vector3().lerpVectors(resolve(rig.lookFrom), resolve(rig.lookTo), k);
        camera.lookAt(look);
        break;
      }
      case "follow": {
        const target = resolve(rig.target);
        const desired = target.clone().add(rig.offset);
        const stiffness = rig.stiffness ?? 2.4;
        camera.position.lerp(desired, Math.min(1, dt * stiffness));
        const lookPoint = target.clone().add(rig.lookOffset ?? new THREE.Vector3(0, 20, 0));
        if (!lookInitialized) {
          smoothedLook.copy(lookPoint);
          lookInitialized = true;
        }
        smoothedLook.lerp(lookPoint, Math.min(1, dt * 3.2));
        camera.lookAt(smoothedLook);
        break;
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
        break;
      }
    }
  };

  return {
    play: (next) => {
      story = next;
      lookInitialized = false;
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

      runRig(shot.rig, shotT01, dt);
      shot.onUpdate?.(shotT01, dt, shotTime);

      if (shotTime >= shot.duration) {
        shot.onExit?.();
        if (shotIndex + 1 < story.shots.length) {
          lookInitialized = false;
          enterShot(shotIndex + 1);
        } else {
          finish();
        }
      }
    },
    isActive: () => story !== null,
  };
};
