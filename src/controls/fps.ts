import * as THREE from "three";
import { PointerLockControls } from "three/examples/jsm/controls/PointerLockControls.js";

export type FlyControlsOptions = {
  camera: THREE.Camera;
  domElement: HTMLElement;
  moveSpeed?: number;
  /** How quickly the camera accelerates (higher = more responsive) */
  acceleration?: number;
  /** How quickly the camera decelerates when no input (higher = stops faster) */
  friction?: number;
  /** Vertical movement speed multiplier */
  verticalSpeed?: number;
};

export const createFlyControls = ({
  camera,
  domElement,
  moveSpeed = 40,
  acceleration = 80,
  friction = 3,
  verticalSpeed = 0.7,
}: FlyControlsOptions) => {
  const controls = new PointerLockControls(camera, domElement);

  // Current velocity with inertia
  const velocity = new THREE.Vector3();

  // Input state
  const movement = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    up: false,
    down: false,
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
      case "Space":
        movement.up = value;
        break;
      case "ShiftLeft":
      case "ShiftRight":
        movement.down = value;
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

  // Temporary vectors for calculation
  const inputDirection = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const right = new THREE.Vector3();

  const update = (delta: number) => {
    if (!controls.isLocked) {
      // Apply friction even when not locked (for smooth stop)
      velocity.multiplyScalar(Math.max(0, 1 - friction * delta));
      return;
    }

    // Get camera direction vectors
    camera.getWorldDirection(forward);
    right.crossVectors(forward, camera.up).normalize();

    // Calculate desired input direction
    inputDirection.set(0, 0, 0);

    if (movement.forward) inputDirection.add(forward);
    if (movement.backward) inputDirection.sub(forward);
    if (movement.right) inputDirection.add(right);
    if (movement.left) inputDirection.sub(right);

    // Handle vertical movement (world space Y)
    if (movement.up) inputDirection.y += verticalSpeed;
    if (movement.down) inputDirection.y -= verticalSpeed;

    // Normalize horizontal movement if there's input
    if (inputDirection.lengthSq() > 0) {
      inputDirection.normalize();

      // Accelerate towards desired direction
      velocity.x += inputDirection.x * acceleration * delta;
      velocity.y += inputDirection.y * acceleration * delta;
      velocity.z += inputDirection.z * acceleration * delta;

      // Clamp velocity to max speed
      const speed = velocity.length();
      if (speed > moveSpeed) {
        velocity.multiplyScalar(moveSpeed / speed);
      }
    }

    // Apply friction (deceleration when no input)
    velocity.multiplyScalar(Math.max(0, 1 - friction * delta));

    // Apply velocity to camera position
    camera.position.add(velocity.clone().multiplyScalar(delta));

    // Keep camera above a minimum height
    if (camera.position.y < 1) {
      camera.position.y = 1;
      velocity.y = Math.max(0, velocity.y);
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
    velocity, // Expose velocity for debugging
  };
};
