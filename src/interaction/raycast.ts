import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.js";

type RaycastOptions = {
  camera: THREE.Camera;
  domElement: HTMLElement;
  targets: THREE.Object3D[];
};

const getLinkTarget = (object: THREE.Object3D | null) => {
  let current: THREE.Object3D | null = object;
  while (current) {
    if (current.userData.linkUrl) {
      return current;
    }
    current = current.parent;
  }
  return null;
};

const setEmissive = (object: THREE.Object3D, color: number) => {
  if (!(object instanceof THREE.Mesh)) {
    return;
  }

  const material = object.material;

  if (Array.isArray(material)) {
    material.forEach((entry) => {
      if (entry instanceof THREE.MeshStandardMaterial) {
        entry.emissive.setHex(color);
      }
    });
    return;
  }

  if (material instanceof THREE.MeshStandardMaterial) {
    material.emissive.setHex(color);
  }
};

export const createRaycast = ({ camera, domElement, targets }: RaycastOptions) => {
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let hovered: THREE.Object3D | null = null;

  const updatePointer = (event: MouseEvent) => {
    const rect = domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  };

  const updateHover = (event: MouseEvent) => {
    updatePointer(event);
    raycaster.setFromCamera(pointer, camera);

    const intersections = raycaster.intersectObjects(targets, true);
    const hit = getLinkTarget(intersections[0]?.object ?? null);

    if (hovered === hit) {
      return;
    }

    if (hovered) {
      setEmissive(hovered, hovered.userData.baseEmissive ?? 0x000000);
    }

    hovered = hit;

    if (hovered) {
      setEmissive(hovered, hovered.userData.hoverEmissive ?? 0x222244);
      domElement.style.cursor = "pointer";
    } else {
      domElement.style.cursor = "";
    }
  };

  const clearHover = () => {
    if (!hovered) {
      return;
    }
    setEmissive(hovered, hovered.userData.baseEmissive ?? 0x000000);
    hovered = null;
    domElement.style.cursor = "";
  };

  const handleClick = (event: MouseEvent) => {
    updatePointer(event);
    raycaster.setFromCamera(pointer, camera);
    const intersections = raycaster.intersectObjects(targets, true);
    const hit = getLinkTarget(intersections[0]?.object ?? null);

    if (hit?.userData.linkUrl) {
      window.location.href = hit.userData.linkUrl as string;
    }
  };

  domElement.addEventListener("pointermove", updateHover);
  domElement.addEventListener("pointerleave", clearHover);
  domElement.addEventListener("click", handleClick);

  return () => {
    domElement.removeEventListener("pointermove", updateHover);
    domElement.removeEventListener("pointerleave", clearHover);
    domElement.removeEventListener("click", handleClick);
  };
};
