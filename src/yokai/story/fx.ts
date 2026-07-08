import * as THREE from "three";

/**
 * Small reusable story effects.
 *
 * Poof — the leaf-and-smoke burst of tanuki henge magic (and any other
 * transformation a tale needs). Ripple — expanding rings for splashes,
 * belly-drum beats, and other percussive moments.
 */

export type PoofFx = {
  group: THREE.Group;
  burst: (at: THREE.Vector3) => void;
  update: (dt: number) => void;
  dispose: () => void;
};

export const createPoofFx = (color = "#cfe3a8", count = 42): PoofFx => {
  const group = new THREE.Group();
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(count * 3);
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color,
    size: 16,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  group.add(points);

  const velocities: THREE.Vector3[] = [];
  for (let i = 0; i < count; i += 1) velocities.push(new THREE.Vector3());
  const origin = new THREE.Vector3();
  let life = 0;

  return {
    group,
    burst: (at) => {
      origin.copy(at);
      life = 1;
      const attr = geometry.getAttribute("position") as THREE.BufferAttribute;
      for (let i = 0; i < count; i += 1) {
        attr.setXYZ(i, at.x, at.y, at.z);
        velocities[i]!.set(
          (Math.random() - 0.5) * 2,
          Math.random() * 1.2 + 0.2,
          (Math.random() - 0.5) * 2
        ).normalize().multiplyScalar(40 + Math.random() * 90);
      }
      attr.needsUpdate = true;
      material.opacity = 0.95;
    },
    update: (dt) => {
      if (life <= 0) return;
      life = Math.max(0, life - dt * 1.1);
      material.opacity = life * 0.95;
      const attr = geometry.getAttribute("position") as THREE.BufferAttribute;
      for (let i = 0; i < count; i += 1) {
        velocities[i]!.y -= 60 * dt; // leaves settle
        velocities[i]!.multiplyScalar(1 - dt * 1.6);
        attr.setXYZ(
          i,
          attr.getX(i) + velocities[i]!.x * dt,
          attr.getY(i) + velocities[i]!.y * dt,
          attr.getZ(i) + velocities[i]!.z * dt
        );
      }
      attr.needsUpdate = true;
    },
    dispose: () => {
      geometry.dispose();
      material.dispose();
      group.removeFromParent();
    },
  };
};

export type RippleFx = {
  group: THREE.Group;
  ring: (at: THREE.Vector3) => void;
  update: (dt: number) => void;
  dispose: () => void;
};

export const createRippleFx = (color = "#ffe2a0", poolSize = 5): RippleFx => {
  const group = new THREE.Group();
  type Ring = { mesh: THREE.Mesh; material: THREE.MeshBasicMaterial; life: number };
  const rings: Ring[] = [];
  for (let i = 0; i < poolSize; i += 1) {
    const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false });
    const mesh = new THREE.Mesh(new THREE.TorusGeometry(14, 1.8, 6, 28), material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.visible = false;
    rings.push({ mesh, material, life: 0 });
    group.add(mesh);
  }
  let next = 0;

  return {
    group,
    ring: (at) => {
      const ring = rings[next]!;
      next = (next + 1) % rings.length;
      ring.mesh.position.copy(at);
      ring.mesh.visible = true;
      ring.life = 1;
    },
    update: (dt) => {
      for (const ring of rings) {
        if (ring.life <= 0) continue;
        ring.life = Math.max(0, ring.life - dt * 0.9);
        const grown = 1 + (1 - ring.life) * 5;
        ring.mesh.scale.setScalar(grown);
        ring.material.opacity = ring.life * 0.7;
        if (ring.life <= 0) ring.mesh.visible = false;
      }
    },
    dispose: () => {
      rings.forEach((ring) => {
        ring.mesh.geometry.dispose();
        ring.material.dispose();
      });
      group.removeFromParent();
    },
  };
};
