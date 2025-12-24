import * as THREE from "three";

type GlowOptions = {
  duration?: number;
  fadeOutDuration?: number;
};

type GlowTween = {
  object: THREE.Object3D;
  material: THREE.MeshBasicMaterial;
  fromColor: THREE.Color;
  toColor: THREE.Color;
  startTime: number;
  duration: number;
  onComplete?: () => void;
};

const nowInSeconds = () => performance.now() * 0.001;

const getMaterial = (object: THREE.Object3D): THREE.MeshBasicMaterial | null => {
  if (!(object instanceof THREE.Mesh)) {
    return null;
  }

  const material = object.material;

  if (Array.isArray(material)) {
    const basic = material.find((m): m is THREE.MeshBasicMaterial => m instanceof THREE.MeshBasicMaterial);
    return basic ?? null;
  }

  if (material instanceof THREE.MeshBasicMaterial) {
    return material;
  }

  return null;
};

const easeOutCubic = (value: number) => 1 - Math.pow(1 - value, 3);

export const createHoverGlow = ({
  duration = 0.3,
  fadeOutDuration = 0.2,
}: GlowOptions = {}) => {
  let active: THREE.Object3D | null = null;
  let tweens: GlowTween[] = [];

  const createTween = (
    object: THREE.Object3D,
    material: THREE.MeshBasicMaterial,
    fromColor: THREE.Color,
    toColor: THREE.Color,
    tweenDuration: number,
    onComplete?: () => void,
  ) => {
    tweens = tweens.filter((tween) => tween.object !== object);
    tweens.push({
      object,
      material,
      fromColor: fromColor.clone(),
      toColor: toColor.clone(),
      startTime: nowInSeconds(),
      duration: tweenDuration,
      onComplete,
    });
  };

  const start = (object: THREE.Object3D) => {
    if (active === object) {
      return;
    }

    if (active) {
      stop(active);
    }

    const material = getMaterial(object);
    if (!material) {
      return;
    }

    active = object;
    const baseColor = new THREE.Color(object.userData.baseColor ?? material.color.getHex());
    const hoverColor = new THREE.Color(object.userData.hoverColor ?? 0x7799ff);
    createTween(object, material, baseColor, hoverColor, duration);
  };

  const stop = (object: THREE.Object3D) => {
    if (active === object) {
      active = null;
    }

    const material = getMaterial(object);
    if (!material) {
      return;
    }

    const baseColor = new THREE.Color(object.userData.baseColor ?? material.color.getHex());
    const currentColor = material.color.clone();
    createTween(object, material, currentColor, baseColor, fadeOutDuration);
  };

  const update = (time: number) => {
    tweens = tweens.filter((tween) => {
      const elapsed = time - tween.startTime;
      const progress = tween.duration > 0 ? Math.min(elapsed / tween.duration, 1) : 1;
      const eased = easeOutCubic(progress);

      tween.material.color.copy(tween.fromColor).lerp(tween.toColor, eased);

      if (progress >= 1) {
        tween.onComplete?.();
        return false;
      }

      return true;
    });
  };

  return {
    start,
    stop,
    update,
  };
};
