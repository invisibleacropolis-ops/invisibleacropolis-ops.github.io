import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";
import { PointerLockControls } from "https://unpkg.com/three@0.160.0/examples/jsm/controls/PointerLockControls.js";

export type FpsControlsOptions = {
  camera: THREE.Camera;
  domElement: HTMLElement;
  heightAt: (x: number, z: number) => number;
  eyeHeight?: number;
  moveSpeed?: number;
  heightSmoothing?: number;
};

export const createFpsControls = ({
  camera,
  domElement,
  heightAt,
  eyeHeight = 1.6,
  moveSpeed = 5.5,
  heightSmoothing = 10,
}: FpsControlsOptions) => {
  const controls = new PointerLockControls(camera, domElement);
  const movement = {
    forward: false,
    backward: false,
    left: false,
    right: false,
  };

  const setMovement = (code: string, value: boolean) => {
    switch (code) {
      case "KeyW":
      case "ArrowUp":
        movement.forward = value;
        break;
      case "KeyS":
      case "ArrowDown":
        movement.backward = value;
        break;
      case "KeyA":
      case "ArrowLeft":
        movement.left = value;
        break;
      case "KeyD":
      case "ArrowRight":
        movement.right = value;
        break;
      default:
        break;
    }
  };

  const handleKeyDown = (event: KeyboardEvent) => {
    setMovement(event.code, true);
  };

  const handleKeyUp = (event: KeyboardEvent) => {
    setMovement(event.code, false);
  };

  const handleClick = () => {
    if (!controls.isLocked) {
      controls.lock();
    }
  };

  window.addEventListener("keydown", handleKeyDown);
  window.addEventListener("keyup", handleKeyUp);
  domElement.addEventListener("click", handleClick);

  const direction = new THREE.Vector3();

  const update = (delta: number) => {
    if (!controls.isLocked) {
      return;
    }

    direction.set(
      Number(movement.right) - Number(movement.left),
      0,
      Number(movement.backward) - Number(movement.forward),
    );

    if (direction.lengthSq() > 0) {
      direction.normalize();
    }

    const distance = moveSpeed * delta;
    controls.moveRight(direction.x * distance);
    controls.moveForward(direction.z * distance);

    const groundHeight = heightAt(camera.position.x, camera.position.z);
    const targetHeight = groundHeight + eyeHeight;

    if (camera.position.y < targetHeight) {
      camera.position.y = targetHeight;
    } else {
      const lerpFactor = 1 - Math.exp(-heightSmoothing * delta);
      camera.position.y = THREE.MathUtils.lerp(camera.position.y, targetHeight, lerpFactor);
    }
  };

  const dispose = () => {
    window.removeEventListener("keydown", handleKeyDown);
    window.removeEventListener("keyup", handleKeyUp);
    domElement.removeEventListener("click", handleClick);
  };

  return {
    controls,
    update,
    dispose,
  };
};
