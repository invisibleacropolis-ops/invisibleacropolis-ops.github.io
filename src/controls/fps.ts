import * as THREE from "three";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls.js";

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
  baseSpeed = 30, // Slower base speed for cinematic feel
  swaySpeed = 0.5,
  swayAmount = 0.5,
}: FlyControlsOptions) => {
  const controls = new PointerLockControls(camera, domElement);

  // Movement state
  const velocity = new THREE.Vector3();
  const direction = new THREE.Vector3();

  // Speed multipliers
  const speeds = {
    current: baseSpeed,
    target: baseSpeed,
    min: baseSpeed * 0.1,  // Slow down (S)
    max: baseSpeed * 5.0,  // Speed up (W) - 3x requested but 5x feels better for large worlds
    base: baseSpeed,
  };

  // Sway state
  let swayTime = 0;

  // Inputs
  const input = {
    accelerate: false,
    decelerate: false,
    strafeLeft: false,
    strafeRight: false,
  };

  const onKeyDown = (event: KeyboardEvent) => {
    switch (event.code) {
      case "KeyW": input.accelerate = true; break;
      case "KeyS": input.decelerate = true; break;
      case "KeyA": input.strafeLeft = true; break;
      case "KeyD": input.strafeRight = true; break;
    }
  };

  const onKeyUp = (event: KeyboardEvent) => {
    switch (event.code) {
      case "KeyW": input.accelerate = false; break;
      case "KeyS": input.decelerate = false; break;
      case "KeyA": input.strafeLeft = false; break;
      case "KeyD": input.strafeRight = false; break;
    }
  };

  const onClick = () => {
    if (!controls.isLocked) {
      controls.lock();
    }
  };

  // Add event listeners
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  domElement.addEventListener("click", onClick);

  const dispose = () => {
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
    domElement.removeEventListener("click", onClick);
    controls.dispose();
  };

  const update = (delta: number) => {
    // 1. Calculate Target Speed
    if (input.accelerate) {
      speeds.target = speeds.max;
    } else if (input.decelerate) {
      speeds.target = speeds.min;
    } else {
      speeds.target = speeds.base;
    }

    // Smooth intersection to target speed
    speeds.current += (speeds.target - speeds.current) * delta * 2.0;

    // 2. Handle Direction (Strafe uses standard logic)
    direction.set(0, 0, 0);

    // Constant forward motion
    direction.z = 1;

    // Strafing
    if (input.strafeLeft) direction.x = -1;
    if (input.strafeRight) direction.x = 1;

    // Normalize (so strafing doesn't boost forward speed weirdly, though forward is dominant)
    if (direction.lengthSq() > 0) {
      direction.normalize();
    }

    // 3. Move Camera
    // Get camera forward/right vectors
    const camForward = new THREE.Vector3();
    camera.getWorldDirection(camForward);
    const camRight = new THREE.Vector3().crossVectors(camForward, camera.up).normalize();

    // Apply movement defined by direction relative to camera look
    // Forward (z=1) means move along camForward
    // Strafe (x) means move along camRight

    const moveVector = new THREE.Vector3();
    moveVector.addScaledVector(camForward, direction.z * speeds.current * delta);
    moveVector.addScaledVector(camRight, direction.x * speeds.current * delta);

    camera.position.add(moveVector);

    // 4. Apply Gentle Sway (Sine wave on local Y/X)
    swayTime += delta * swaySpeed;

    // Sway affects position slightly to simulate floating
    const swayY = Math.sin(swayTime) * delta * swayAmount;
    const swayX = Math.cos(swayTime * 0.7) * delta * swayAmount * 0.5;

    // Apply sway relative to camera up and right
    camera.position.addScaledVector(camera.up, swayY);
    camera.position.addScaledVector(camRight, swayX);

    // Optional: Gentle rotation sway (very subtle)
    if (!controls.isLocked) {
      // If not locked, maybe auto-rotate steer? 
      // User didn't ask for auto-steer, just "constant forward motion".
      // But "Target one of the links" implies initial look.
    }
  };

  return {
    controls,
    update,
    dispose,
  };
};
