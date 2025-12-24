import * as THREE from "three";

type RayBurstOptions = {
  scene: THREE.Scene;
  color?: THREE.ColorRepresentation;
  maxRays?: number;
  raysPerSecond?: number;
  minLength?: number;
  maxLength?: number;
  minLifetime?: number;
  maxLifetime?: number;
  jitter?: number;
  fadeOutDuration?: number;
};

type Ray = {
  line: THREE.Line;
  birth: number;
  life: number;
};

const nowInSeconds = () => performance.now() * 0.001;

const randomInRange = (min: number, max: number) => min + Math.random() * (max - min);

const randomDirection = () => {
  const u = Math.random();
  const v = Math.random();
  const theta = 2 * Math.PI * u;
  const phi = Math.acos(2 * v - 1);
  return new THREE.Vector3(
    Math.sin(phi) * Math.cos(theta),
    Math.sin(phi) * Math.sin(theta),
    Math.cos(phi),
  );
};

export const createRayBurst = ({
  scene,
  color = "#a6b9ff",
  maxRays = 60,
  raysPerSecond = 18,
  minLength = 0.6,
  maxLength = 1.6,
  minLifetime = 0.4,
  maxLifetime = 1.2,
  jitter = 0.12,
  fadeOutDuration = 0.5,
}: RayBurstOptions) => {
  const group = new THREE.Group();
  scene.add(group);

  let activeTarget: THREE.Object3D | null = null;
  let active = false;
  let stopTime: number | null = null;
  let emissionAccumulator = 0;
  const rays: Ray[] = [];
  const tempPosition = new THREE.Vector3();

  const spawnRay = (time: number) => {
    if (rays.length >= maxRays) {
      return;
    }

    const direction = randomDirection();
    const length = randomInRange(minLength, maxLength);
    const jitterVector = new THREE.Vector3(
      randomInRange(-jitter, jitter),
      randomInRange(-jitter, jitter),
      randomInRange(-jitter, jitter),
    );
    const geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0),
      direction.multiplyScalar(length),
    ]);
    const material = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: 1,
    });
    material.toneMapped = false;
    const line = new THREE.Line(geometry, material);
    line.position.copy(jitterVector);
    group.add(line);
    rays.push({
      line,
      birth: time,
      life: randomInRange(minLifetime, maxLifetime),
    });
  };

  const start = (object: THREE.Object3D) => {
    activeTarget = object;
    active = true;
    stopTime = null;
  };

  const stop = () => {
    active = false;
    stopTime = nowInSeconds();
  };

  const update = (time: number, delta: number) => {
    if (activeTarget) {
      activeTarget.getWorldPosition(tempPosition);
      group.position.copy(tempPosition);
    }

    if (active) {
      emissionAccumulator += delta * raysPerSecond;
      while (emissionAccumulator >= 1) {
        spawnRay(time);
        emissionAccumulator -= 1;
      }
    } else {
      emissionAccumulator = 0;
    }

    const fade = stopTime ? Math.max(1 - (time - stopTime) / fadeOutDuration, 0) : 1;

    for (let i = rays.length - 1; i >= 0; i -= 1) {
      const ray = rays[i];
      const age = time - ray.birth;
      const lifeProgress = Math.min(age / ray.life, 1);
      const opacity = Math.max(1 - lifeProgress, 0) * fade;
      (ray.line.material as THREE.LineBasicMaterial).opacity = opacity;

      if (lifeProgress >= 1 || opacity <= 0) {
        group.remove(ray.line);
        ray.line.geometry.dispose();
        (ray.line.material as THREE.LineBasicMaterial).dispose();
        rays.splice(i, 1);
      }
    }
  };

  return {
    start,
    stop,
    update,
  };
};
