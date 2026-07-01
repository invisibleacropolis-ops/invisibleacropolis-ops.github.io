import * as THREE from "three";

export type Temple = {
  group: THREE.Group;
  /** World-space radius of the colonnade footprint (for keeping spawn/roads clear). */
  footprintRadius: number;
  update: (time: number) => void;
};

export type TempleOptions = {
  /** World position of the temple floor. */
  position?: THREE.Vector3;
  /** Uniform scale — one unit is roughly one column-height third. */
  scale?: number;
  columnColor?: string;
  trimColor?: string;
};

/**
 * The acropolis itself: a wireframe colonnade at the heart of the valley.
 * Purely a landmark — it is not a link, it is the place the light roads
 * radiate from, giving the spread-out monuments a shared origin.
 */
export const createTemple = ({
  position = new THREE.Vector3(0, 0, 0),
  scale = 150,
  columnColor = "#9cc8ff",
  trimColor = "#ffc857",
}: TempleOptions = {}): Temple => {
  const group = new THREE.Group();
  group.position.copy(position);
  group.scale.setScalar(scale);

  const column = new THREE.Color(columnColor);
  const trim = new THREE.Color(trimColor);

  const columnMat = new THREE.MeshBasicMaterial({ color: column, wireframe: true });
  const trimMat = new THREE.MeshBasicMaterial({ color: trim, transparent: true, opacity: 0.9 });

  // Stylobate — three concentric floor rings like temple steps
  [4.6, 5.2, 5.8].forEach((radius, i) => {
    const step = new THREE.Mesh(
      new THREE.TorusGeometry(radius, 0.05 - i * 0.01, 8, 96),
      new THREE.MeshBasicMaterial({ color: trim, transparent: true, opacity: 0.55 - i * 0.15 })
    );
    step.rotation.x = Math.PI * 0.5;
    step.position.y = 0.04 + i * 0.02;
    group.add(step);
  });

  // Colonnade — a ring of slender columns
  const columnCount = 12;
  const columnGeo = new THREE.CylinderGeometry(0.14, 0.18, 3.2, 6, 3);
  for (let i = 0; i < columnCount; i += 1) {
    const angle = (i / columnCount) * Math.PI * 2;
    const pillar = new THREE.Mesh(columnGeo, columnMat);
    pillar.position.set(Math.cos(angle) * 4, 1.6, Math.sin(angle) * 4);
    group.add(pillar);
  }

  // Entablature — the ring the columns carry
  const entablature = new THREE.Mesh(new THREE.TorusGeometry(4, 0.16, 8, 96), trimMat);
  entablature.rotation.x = Math.PI * 0.5;
  entablature.position.y = 3.3;
  group.add(entablature);

  // Floating capstone — the temple's unreachable roof
  const capstone = new THREE.Mesh(
    new THREE.OctahedronGeometry(1.1, 0),
    new THREE.MeshBasicMaterial({ color: trim, wireframe: true })
  );
  capstone.position.y = 5.2;
  group.add(capstone);

  const innerCapstone = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.55, 0),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 })
  );
  innerCapstone.position.y = 5.2;
  group.add(innerCapstone);

  // Axis mundi — the world-beam rising out of the temple
  const beamMat = new THREE.MeshBasicMaterial({
    color: trim,
    transparent: true,
    opacity: 0.1,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.9, 26, 18, 1, true), beamMat);
  beam.position.y = 13;
  group.add(beam);

  const update = (time: number) => {
    capstone.rotation.y = time * 0.3;
    innerCapstone.rotation.y = -time * 0.5;
    const bob = Math.sin(time * 0.9) * 0.12;
    capstone.position.y = 5.2 + bob;
    innerCapstone.position.y = 5.2 + bob;
    beamMat.opacity = 0.08 + Math.sin(time * 1.1) * 0.03;
    const capPulse = 0.65 + Math.sin(time * 1.8) * 0.15;
    (innerCapstone.material as THREE.MeshBasicMaterial).opacity = capPulse;
  };

  return {
    group,
    footprintRadius: 5.8 * scale,
    update,
  };
};
