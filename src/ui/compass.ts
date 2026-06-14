import * as THREE from "three";

export type CompassTarget = {
  x: number;
  z: number;
  accentColor: string;
  title: string;
  url: string;
};

export type CompassController = {
  setTargets: (targets: CompassTarget[]) => void;
  /** Project each target's bearing onto the strip; call once per frame. */
  update: (camera: THREE.Camera, activeUrl: string | null) => void;
  setVisible: (visible: boolean) => void;
  dispose: () => void;
};

/** Bearings within ±HALF_ARC of the camera heading map onto the strip; the rest pin to the edges. */
const HALF_ARC = Math.PI * 0.42;

const TWO_PI = Math.PI * 2;

const wrapAngle = (angle: number) => {
  let wrapped = (angle + Math.PI) % TWO_PI;
  if (wrapped < 0) wrapped += TWO_PI;
  return wrapped - Math.PI;
};

export const createCompass = ({ root }: { root: HTMLElement }): CompassController => {
  const strip = document.createElement("div");
  strip.className = "compass";
  strip.setAttribute("aria-hidden", "true");
  root.append(strip);

  type Pip = { element: HTMLSpanElement; target: CompassTarget };
  let pips: Pip[] = [];

  const forward = new THREE.Vector3();

  const setTargets = (targets: CompassTarget[]) => {
    pips.forEach(({ element }) => element.remove());
    pips = targets.map((target) => {
      const element = document.createElement("span");
      element.className = "compass__pip";
      element.style.setProperty("--pip-color", target.accentColor);
      element.title = target.title;
      strip.append(element);
      return { element, target };
    });
  };

  const update = (camera: THREE.Camera, activeUrl: string | null) => {
    camera.getWorldDirection(forward);
    const heading = Math.atan2(forward.x, forward.z);

    for (const { element, target } of pips) {
      const bearing = Math.atan2(target.x - camera.position.x, target.z - camera.position.z);
      const relative = wrapAngle(bearing - heading);
      const onArc = Math.abs(relative) <= HALF_ARC;
      const clamped = THREE.MathUtils.clamp(relative, -HALF_ARC, HALF_ARC);
      // -HALF_ARC → 0%, straight ahead → 50%, +HALF_ARC → 100%
      const position = (clamped / HALF_ARC) * 0.5 + 0.5;

      element.style.left = `${(position * 100).toFixed(2)}%`;
      element.classList.toggle("is-edge", !onArc);
      element.classList.toggle("is-active", target.url === activeUrl);
    }
  };

  return {
    setTargets,
    update,
    setVisible: (visible) => {
      strip.classList.toggle("is-visible", visible);
    },
    dispose: () => {
      strip.remove();
    },
  };
};
