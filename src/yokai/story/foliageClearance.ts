import * as THREE from "three";

/** Cinematic set dressing: open a narrow actor corridor, then restore every
 * instance exactly. Applied once at story start, never popped on/off per frame.
 * Only instanced vegetation is touched; buildings and terrain remain solid. */
export const openFoliageCorridor = (
  root: THREE.Object3D | undefined,
  routes: THREE.Curve<THREE.Vector3>[],
  radius = 125,
  preservedTrees: readonly THREE.Vector3[] = [],
): (() => void) => {
  if (!root) return () => {};
  const points = routes.flatMap((route) => route.getPoints(160));
  const saved: Array<{ mesh: THREE.InstancedMesh; index: number; matrix: THREE.Matrix4 }> = [];
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  // Nonzero scale avoids singular normal matrices in the outline pass.
  const hidden = new THREE.Matrix4().makeScale(0.000001, 0.000001, 0.000001);
  hidden.setPosition(0, -1000000, 0);
  root.updateWorldMatrix(true, true);
  root.traverse((object) => {
    if (!(object instanceof THREE.InstancedMesh)) return;
    if (!object.boundingSphere) object.computeBoundingSphere();
    for (let index = 0; index < object.count; index++) {
      object.getMatrixAt(index, matrix);
      position.setFromMatrixPosition(matrix).applyMatrix4(object.matrixWorld);
      // Keep a story's landmark tree, including its offset crown instances.
      if (preservedTrees.some((p) => Math.hypot(p.x - position.x, p.z - position.z) < 65)) continue;
      if (!points.some((p) => (p.x - position.x) ** 2 + (p.z - position.z) ** 2 < radius ** 2)) continue;
      saved.push({ mesh: object, index, matrix: matrix.clone() });
      object.setMatrixAt(index, hidden);
    }
    object.instanceMatrix.needsUpdate = true;
    // Keep conservative pre-existing bounds; restored instances still fit them.
  });
  return () => {
    for (const { mesh, index, matrix: original } of saved) {
      mesh.setMatrixAt(index, original);
      mesh.instanceMatrix.needsUpdate = true;
    }
    saved.length = 0;
  };
};
