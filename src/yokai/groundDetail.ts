import * as THREE from "three";
import { createRng } from "../scene/random.ts";
import { createGrassField } from "./grass.ts";
import { isFree } from "./occupancy.ts";
import { KAKURIYO, getToonGradient } from "./palette.ts";
import { POND_CENTER, heightAt, pondShoreRadiiAt, slopeAt } from "./terrain.ts";

/**
 * Dimensional material transitions layered over the terrain wash. The terrain
 * remains the broad painted underlayer; these meshes supply the close/mid-range
 * silhouette detail that distinguishes meadow, sand, scree, and bedrock.
 */
export type GroundDetail = {
  group: THREE.Group;
  dispose: () => void;
};

const buildShoreShelf = (): THREE.Mesh => {
  const radialSegments = 128;
  const bands = 8;
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const sand = new THREE.Color(KAKURIYO.sand);
  const damp = new THREE.Color("#9f9b79");
  const sunlit = new THREE.Color("#d3c091");
  const tint = new THREE.Color();

  for (let band = 0; band <= bands; band += 1) {
    const bandT = band / bands;
    for (let segment = 0; segment <= radialSegments; segment += 1) {
      const angle = (segment / radialSegments) * Math.PI * 2;
      const shore = pondShoreRadiiAt(angle);
      const radius = THREE.MathUtils.lerp(shore.inner, shore.outer, bandT);
      const x = POND_CENTER.x + Math.cos(angle) * radius;
      const z = POND_CENTER.y + Math.sin(angle) * radius;
      // Low sculpted ripples make the shore catch light as real geometry.
      const ripple = Math.sin(radius * 0.115 + angle * 4.0) * 0.65 * Math.sin(bandT * Math.PI);
      positions.push(x, heightAt(x, z) + 1.4 + ripple, z);

      const grain = Math.sin(angle * 17.0 + band * 2.3) * 0.5 + 0.5;
      tint.copy(damp).lerp(sand, THREE.MathUtils.smoothstep(bandT, 0.08, 0.48));
      tint.lerp(sunlit, grain * 0.16);
      colors.push(tint.r, tint.g, tint.b);
    }
  }

  const stride = radialSegments + 1;
  for (let band = 0; band < bands; band += 1) {
    for (let segment = 0; segment < radialSegments; segment += 1) {
      const a = band * stride + segment;
      const b = a + stride;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  const material = new THREE.MeshToonMaterial({
    vertexColors: true,
    gradientMap: getToonGradient(),
    side: THREE.DoubleSide,
  });
  // A ring outline would read as a UI marker, not a natural shoreline.
  material.userData.outlineParameters = { visible: false };

  const shore = new THREE.Mesh(geometry, material);
  shore.name = "spirit-pond-sand-shelf";
  shore.receiveShadow = true;
  return shore;
};

const createRockField = (
  rng: () => number,
  count: number,
  radii: [number, number],
  scale: [number, number],
  minSlope: number,
  name: string,
): THREE.InstancedMesh => {
  const isShore = name === "shore-pebbles";
  const geometry = new THREE.DodecahedronGeometry(1, 0);
  const material = new THREE.MeshToonMaterial({
    color: isShore ? "#e5dcc6" : "#d7dde3",
    vertexColors: true,
    gradientMap: getToonGradient(),
    emissive: isShore ? "#403b31" : "#35404a",
    emissiveIntensity: 0.62,
  });
  (material as THREE.MeshToonMaterial & { flatShading: boolean }).flatShading = true;
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.name = name;
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);

  const dummy = new THREE.Object3D();
  const stone = new THREE.Color(isShore ? "#948c77" : KAKURIYO.cliff);
  const blueStone = new THREE.Color(isShore ? "#77818a" : "#59697a");
  const warmStone = new THREE.Color(isShore ? "#b19f7c" : "#8e8876");
  const moss = new THREE.Color(KAKURIYO.forestFloor);
  const tint = new THREE.Color();
  let placed = 0;
  let attempts = 0;

  while (placed < count && attempts < count * 14) {
    attempts += 1;
    const angle = rng() * Math.PI * 2;
    const shore = pondShoreRadiiAt(angle);
    const radius = isShore
      ? THREE.MathUtils.lerp(shore.inner + 14, shore.outer - 7, Math.sqrt(rng()))
      : THREE.MathUtils.lerp(radii[0], radii[1], Math.sqrt(rng()));
    const x = POND_CENTER.x + Math.cos(angle) * radius;
    const z = POND_CENTER.y + Math.sin(angle) * radius;
    const slope = slopeAt(x, z);
    if (slope < minSlope || !isFree(x, z, 3)) continue;

    const size = THREE.MathUtils.lerp(scale[0], scale[1], Math.pow(rng(), 1.7));
    dummy.position.set(x, heightAt(x, z) + size * 0.32, z);
    dummy.rotation.set(rng() * 0.9, rng() * Math.PI, rng() * 0.9);
    dummy.scale.set(size * (0.75 + rng() * 0.65), size * (0.35 + rng() * 0.28), size);
    dummy.updateMatrix();
    mesh.setMatrixAt(placed, dummy.matrix);

    tint.copy(stone);
    if (rng() < 0.24) tint.lerp(blueStone, 0.55 + rng() * 0.25);
    else if (rng() < 0.32) tint.lerp(warmStone, 0.55);
    if (rng() < 0.14) tint.lerp(moss, 0.38);
    tint.offsetHSL((rng() - 0.5) * 0.025, 0, (rng() - 0.5) * 0.07);
    mesh.setColorAt(placed, tint);
    placed += 1;
  }

  mesh.count = placed;
  mesh.instanceMatrix.needsUpdate = true;
  mesh.instanceColor!.needsUpdate = true;
  mesh.receiveShadow = true;
  return mesh;
};

export const createGroundDetail = (): GroundDetail => {
  const group = new THREE.Group();
  group.name = "dimensional-ground-detail";
  const rng = createRng(0x57a0e);

  const grass = createGrassField({ count: 72000 });
  group.add(grass.mesh);

  const shore = buildShoreShelf();
  group.add(shore);

  // Fine shoreline stones sit in the sand; larger scree occupies the exposed
  // slope that formerly appeared as one flat grey placeholder patch.
  const shorePebbles = createRockField(rng, 110, [430, 605], [2.4, 6.2], 0.05, "shore-pebbles");
  const pondTalus = createRockField(rng, 175, [570, 1120], [4.5, 12.5], 0.38, "pond-talus");
  group.add(shorePebbles, pondTalus);

  return {
    group,
    dispose: () => {
      grass.dispose();
      group.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.geometry.dispose();
        if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose());
        else object.material.dispose();
      });
      group.removeFromParent();
    },
  };
};
