import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

/**
 * Sculpted kami bodies authored in Blender (tools/blender/*_build.py).
 *
 * A model is a set of named rigid parts, each already in the local space of
 * the procedural bone it dresses ("head", "ear_n", "leg_lower", "tail", ...).
 * The articulated rig in kamiCharacters.ts keeps every bone, IK chain and
 * animation; a loaded model only replaces the primitive blockout. When a
 * model is missing or fails to load, the procedural character is used.
 */
export type SculptPart = {
  geometry: THREE.BufferGeometry;
  /** Per geometry group: the authored material name and its colour. */
  surfaces: { name: string; color: THREE.Color }[];
};
export type SculptModel = Map<string, SculptPart>;

const models = new Map<string, SculptModel>();

/** The model URLs shipped in public/kami/models. */
export const KAMI_MODEL_URLS: Record<string, string> = {
  kitsune: "kami/models/kitsune.glb",
};

export function getSculptModel(kind: string): SculptModel | undefined {
  return models.get(kind);
}

/** Turn a loaded glTF scene into reusable, merged per-part geometry. */
export function registerSculptModel(kind: string, scene: THREE.Object3D): SculptModel {
  scene.updateMatrixWorld(true);
  const model: SculptModel = new Map();
  for (const node of scene.children) {
    const meshes: THREE.Mesh[] = [];
    node.traverse((object) => { if (object instanceof THREE.Mesh) meshes.push(object); });
    if (!meshes.length) continue;
    const geometries = meshes.map((mesh) => {
      const geometry = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
      // Only the shape matters: the toon materials need positions and normals.
      for (const name of Object.keys(geometry.attributes)) {
        if (name !== "position" && name !== "normal") geometry.deleteAttribute(name);
      }
      return geometry;
    });
    const geometry = geometries.length === 1 ? geometries[0] : mergeGeometries(geometries, true);
    if (!geometry) throw new Error(`Could not merge sculpted part ${node.name}`);
    if (geometries.length === 1) {
      geometry.clearGroups();
      geometry.addGroup(0, geometry.index ? geometry.index.count : geometry.attributes.position.count, 0);
    } else {
      geometries.forEach((g) => g.dispose());
    }
    geometry.computeBoundingSphere();
    const surfaces = meshes.map((mesh) => {
      const source = mesh.material as THREE.MeshStandardMaterial;
      return { name: source.name, color: source.color?.clone() ?? new THREE.Color("#ffffff") };
    });
    model.set(node.name, { geometry, surfaces });
  }
  models.set(kind, model);
  return model;
}

export async function loadSculptModel(kind: string, url: string): Promise<SculptModel> {
  const gltf = await new GLTFLoader().loadAsync(url);
  return registerSculptModel(kind, gltf.scene);
}

/** Fetch every shipped model; a failure only means that kami stays procedural. */
export async function preloadKamiModels(base = "/"): Promise<void> {
  await Promise.all(Object.entries(KAMI_MODEL_URLS).map(([kind, path]) =>
    loadSculptModel(kind, base + path).catch((error) => {
      console.warn(`Kakuriyo: ${kind} model unavailable, using the procedural body`, error);
    })));
}
