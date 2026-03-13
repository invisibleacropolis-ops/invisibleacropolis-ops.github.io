import * as THREE from "three";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls.js";
import type { ExperienceMode } from "../ui/experienceState.ts";

export type FlyControlsOptions = {
  camera: THREE.Camera;
  domElement: HTMLElement;
  baseSpeed?: number;
  swaySpeed?: number;
  swayAmount?: number;
};

export const createFlyControls = ({
  camera,
  domElement,
  baseSpeed = 30,
  swaySpeed = 0.5,
  swayAmount = 0.5,
}: FlyControlsOptions) => {
  const controls = new PointerLockControls(camera, domElement);

  const direction = new THREE.Vector3();
  const camForward = new THREE.Vector3();
  const camRight = new THREE.Vector3();
  const moveVector = new THREE.Vector3();
  const lookTarget = new THREE.Vector3();

  const speeds = {
    current: baseSpeed,
    target: baseSpeed,
    min: baseSpeed * 0.1,
    max: baseSpeed * 5.0,
    base: baseSpeed,
    accessibility: baseSpeed * 0.45,
  };

  let swayTime = 0;
  let mode: ExperienceMode = "explorer";
  let pointerLockAllowed = true;

  const input = {
    accelerate: false,
    decelerate: false,
    strafeLeft: false,
    strafeRight: false,
    turnLeft: false,
    turnRight: false,
  };

  const onKeyDown = (event: KeyboardEvent) => {
    switch (event.code) {
      case "KeyW": input.accelerate = true; break;
      case "KeyS": input.decelerate = true; break;
      case "KeyA": input.strafeLeft = true; break;
      case "KeyD": input.strafeRight = true; break;
      case "ArrowLeft": input.turnLeft = true; break;
      case "ArrowRight": input.turnRight = true; break;
    }
  };

  const onKeyUp = (event: KeyboardEvent) => {
    switch (event.code) {
      case "KeyW": input.accelerate = false; break;
      case "KeyS": input.decelerate = false; break;
      case "KeyA": input.strafeLeft = false; break;
      case "KeyD": input.strafeRight = false; break;
      case "ArrowLeft": input.turnLeft = false; break;
      case "ArrowRight": input.turnRight = false; break;
    }
  };

  const onClick = () => {
    if (mode === "explorer" && pointerLockAllowed && !controls.isLocked) {
      controls.lock();
    }
  };

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  domElement.addEventListener("click", onClick);

  const update = (delta: number) => {
    if (mode === "accessibility") {
      if (controls.isLocked) controls.unlock();
      speeds.target = speeds.accessibility;
    } else {
      if (input.accelerate) {
        speeds.target = speeds.max;
      } else if (input.decelerate) {
        speeds.target = speeds.min;
      } else {
        speeds.target = speeds.base;
      }
    }

    speeds.current += (speeds.target - speeds.current) * delta * 2.0;

    direction.set(0, 0, 0);
    direction.z = 1;
    if (input.strafeLeft) direction.x = -1;
    if (input.strafeRight) direction.x = 1;
    if (direction.lengthSq() > 0) direction.normalize();

    camera.getWorldDirection(camForward);
    camRight.crossVectors(camForward, camera.up).normalize();

    moveVector.set(0, 0, 0);
    moveVector.addScaledVector(camForward, direction.z * speeds.current * delta);
    moveVector.addScaledVector(camRight, direction.x * speeds.current * delta);
    camera.position.add(moveVector);

    if (mode === "accessibility") {
      const yawDelta = (input.turnLeft ? 1 : 0) - (input.turnRight ? 1 : 0);
      if (yawDelta !== 0) {
        const yawAxis = new THREE.Vector3(0, 1, 0);
        camForward.applyAxisAngle(yawAxis, yawDelta * delta * 0.9);
        lookTarget.copy(camera.position).add(camForward);
        camera.lookAt(lookTarget);
      }
      return;
    }

    swayTime += delta * swaySpeed;
    const velocityFactor = THREE.MathUtils.clamp(speeds.current / speeds.base, 0.5, 2.5);
    const swayY = Math.sin(swayTime * 1.25) * delta * swayAmount * velocityFactor;
    const swayX = Math.cos(swayTime * 0.7) * delta * swayAmount * 0.5 * velocityFactor;
    camera.position.addScaledVector(camera.up, swayY);
    camera.position.addScaledVector(camRight, swayX);
  };

  const setMode = (nextMode: ExperienceMode) => {
    mode = nextMode;
    if (mode !== "explorer" && controls.isLocked) {
      controls.unlock();
    }
  };

  return {
    controls,
    update,
    setMode,
    setPointerLockAllowed: (allowed: boolean) => {
      pointerLockAllowed = allowed;
      if (!allowed && controls.isLocked) controls.unlock();
    },
    dispose: () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      domElement.removeEventListener("click", onClick);
      controls.dispose();
    },
  };
};
