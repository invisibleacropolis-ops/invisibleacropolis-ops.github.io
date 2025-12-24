import * as THREE from "three";

type GlowOptions = {
  duration?: number;
  fadeOutDuration?: number;
  baseIntensity?: number;
  peakIntensity?: number;
};

type GlowTween = {
  object: THREE.Object3D;
  materials: THREE.MeshStandardMaterial[];
  from: number;
  to: number;
  startTime: number;
  duration: number;
  onComplete?: () => void;
};

const nowInSeconds = () => performance.now() * 0.001;

const getGlowMaterials = (object: THREE.Object3D): THREE.MeshStandardMaterial[] => {
  if (!(object instanceof THREE.Mesh)) {
    return [];
  }

  const material = object.material;

  if (Array.isArray(material)) {
    return material.filter((entry): entry is THREE.MeshStandardMaterial => entry instanceof THREE.MeshStandardMaterial);
  }

  if (material instanceof THREE.MeshStandardMaterial) {
    return [material];
  }

  return [];
};

const setEmissiveColor = (materials: THREE.MeshStandardMaterial[], color: number) => {
  materials.forEach((material) => {
    material.emissive.setHex(color);
  });
};

const setEmissiveIntensity = (materials: THREE.MeshStandardMaterial[], intensity: number) => {
  materials.forEach((material) => {
    material.emissiveIntensity = intensity;
  });
};

const easeOutCubic = (value: number) => 1 - Math.pow(1 - value, 3);

export const createHoverGlow = ({
  duration = 2,
  fadeOutDuration = 0.6,
  baseIntensity = 1,
  peakIntensity = 2.6,
}: GlowOptions = {}) => {
  let active: THREE.Object3D | null = null;
  let tweens: GlowTween[] = [];

  const createTween = (
    object: THREE.Object3D,
    materials: THREE.MeshStandardMaterial[],
    from: number,
    to: number,
    tweenDuration: number,
    onComplete?: () => void,
  ) => {
    tweens = tweens.filter((tween) => tween.object !== object);
    tweens.push({
      object,
      materials,
      from,
      to,
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

    const materials = getGlowMaterials(object);
    if (materials.length === 0) {
      return;
    }

    active = object;
    const hoverEmissive = (object.userData.hoverEmissive as number | undefined) ?? 0x222244;
    setEmissiveColor(materials, hoverEmissive);
    setEmissiveIntensity(materials, baseIntensity);
    createTween(object, materials, baseIntensity, peakIntensity, duration);
  };

  const stop = (object: THREE.Object3D) => {
    if (active === object) {
      active = null;
    }

    const materials = getGlowMaterials(object);
    if (materials.length === 0) {
      return;
    }

    const baseEmissive = (object.userData.baseEmissive as number | undefined) ?? 0x000000;
    const currentIntensity = materials[0]?.emissiveIntensity ?? baseIntensity;
    createTween(object, materials, currentIntensity, baseIntensity, fadeOutDuration, () => {
      setEmissiveColor(materials, baseEmissive);
    });
  };

  const update = (time: number) => {
    tweens = tweens.filter((tween) => {
      const elapsed = time - tween.startTime;
      const progress = tween.duration > 0 ? Math.min(elapsed / tween.duration, 1) : 1;
      const eased = easeOutCubic(progress);
      const intensity = tween.from + (tween.to - tween.from) * eased;
      setEmissiveIntensity(tween.materials, intensity);

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
