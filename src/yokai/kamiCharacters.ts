import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { toon } from "./palette.ts";
import { worldGroundY } from "./story/motion.ts";
import { FootGait, TwoBoneIK, type GroundSampler } from "./kamiRig.ts";
import type { SpiritBuild } from "./spirits.ts";

export type KamiKind = "kitsune" | "shika" | "nekomata" | "baku" | "tanuki" | "kappa" | "oni" | "kodama";
export type KamiPerformance = { wonder?: number; joy?: number; protect?: number; cast?: number; drum?: number };
export type ArticulatedKami = SpiritBuild & {
  skeleton: THREE.Skeleton;
  limbs: TwoBoneIK[];
  /** Undefined disables terrain sampling for the turntable/flat story stages. */
  setGroundSampler: (sampler?: GroundSampler) => void;
  setPerformance: (pose: KamiPerformance) => void;
  getAnchorWorld: (anchor: "leftHand" | "rightHand" | "head" | "tail", out: THREE.Vector3) => THREE.Vector3;
};

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const ball = new THREE.SphereGeometry(1, 14, 10);
const cone = new THREE.ConeGeometry(1, 1, 10);
const materials = new Map<string, THREE.MeshToonMaterial>();
function material(color: string, ink = true) {
  const key = `${color}:${ink}`;
  let mat = materials.get(key);
  if (!mat) {
    mat = toon(color);
    mat.userData.outlineParameters = { visible: ink, thickness: 0.0025, alpha: 0.9 };
    materials.set(key, mat);
  }
  return mat;
}
const ivory = material("#f4ead5"), ink = material("#28262b", false);
const gold = material("#d9ad57"), red = material("#b84439");
const pink = material("#d48d91", false);

function piece(parent: THREE.Object3D, geometry: THREE.BufferGeometry, mat: THREE.Material,
  pos: THREE.Vector3, scale = V(1, 1, 1), rotation?: THREE.Euler) {
  const item = new THREE.Mesh(geometry, mat);
  item.position.copy(pos);
  item.scale.copy(scale);
  if (rotation) item.rotation.copy(rotation);
  item.castShadow = item.receiveShadow = true;
  parent.add(item);
  return item;
}
const ellipsoid = (parent: THREE.Object3D, mat: THREE.Material, pos: THREE.Vector3, scale: THREE.Vector3) =>
  piece(parent, ball, mat, pos, scale);
function bone(parent: THREE.Object3D, name: string, pos = V()) {
  const joint = new THREE.Bone();
  joint.name = name;
  joint.position.copy(pos);
  parent.add(joint);
  return joint;
}
function taper(parent: THREE.Object3D, mat: THREE.Material, from: THREE.Vector3, to: THREE.Vector3, r0: number, r1: number) {
  const delta = to.clone().sub(from);
  const item = piece(parent, new THREE.CylinderGeometry(r1, r0, delta.length(), 10), mat,
    from.clone().add(to).multiplyScalar(0.5));
  item.quaternion.setFromUnitVectors(V(0, 1, 0), delta.normalize());
  return item;
}
function tuft(parent: THREE.Object3D, mat: THREE.Material, pos: THREE.Vector3, length: number, width: number, tilt: number) {
  return piece(parent, cone, mat, pos, V(width, length, width * 0.48), new THREE.Euler(0, 0, tilt));
}

/** Merge static detail within each joint, never across moving joints. Fur,
 * markings, claws and shell plates do not each cost their own draw call. */
function batchDetails(root: THREE.Object3D) {
  const parents: THREE.Object3D[] = [];
  root.traverse((object) => { if (!(object instanceof THREE.Mesh)) parents.push(object); });
  for (const parent of parents) {
    const batches = new Map<THREE.Material, THREE.Mesh[]>();
    for (const child of parent.children) {
      if (!(child instanceof THREE.Mesh) || child instanceof THREE.SkinnedMesh || Array.isArray(child.material)) continue;
      const batch = batches.get(child.material) ?? [];
      batch.push(child);
      batches.set(child.material, batch);
    }
    for (const [mat, meshes] of batches) {
      if (meshes.length < 2) continue;
      const geometries = meshes.map((m) => {
        m.updateMatrix();
        return m.geometry.clone().applyMatrix4(m.matrix);
      });
      const merged = mergeGeometries(geometries, false);
      geometries.forEach((g) => g.dispose());
      if (!merged) throw new Error(`Could not batch kami joint ${parent.name}`);
      meshes.forEach((m) => parent.remove(m));
      piece(parent, merged, mat, V());
    }
  }
}

/** Continuous weighted tail surface. Rings interpolate between successive
 * bones, so the silhouette bends without the bead seams of rigid segments. */
function tailSurface(joints: THREE.Bone[], length: number, radius: number, fox: boolean, mat: THREE.Material) {
  const positions: number[] = [], weights: number[] = [], skinIndices: number[] = [], indices: number[] = [];
  const rings = 30, sides = 10, segments = joints.length;
  for (let ring = 0; ring <= rings; ring++) {
    const t = ring / rings;
    const bonePosition = Math.min(t * segments, segments - 1);
    const a = Math.floor(bonePosition), b = Math.min(a + 1, segments - 1);
    const blend = bonePosition - a;
    const width = fox
      ? radius * (0.27 + Math.sin(Math.pow(t, 0.8) * Math.PI) * 0.9) * Math.min(1, (1 - t) * 9 + 0.025)
      : radius * (1 - t * 0.7) * Math.min(1, (1 - t) * 14 + 0.025);
    for (let side = 0; side <= sides; side++) {
      const angle = side / sides * Math.PI * 2;
      positions.push(Math.cos(angle) * width, Math.sin(angle) * width, -t * segments * length);
      skinIndices.push(a, b, 0, 0);
      weights.push(1 - blend, blend, 0, 0);
      if (ring < rings && side < sides) {
        const v = ring * (sides + 1) + side;
        indices.push(v, v + sides + 1, v + 1, v + 1, v + sides + 1, v + sides + 2);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(skinIndices, 4));
  geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(weights, 4));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const tipStart = 25 * sides * 6;
  geometry.addGroup(0, tipStart, 0);
  geometry.addGroup(tipStart, indices.length - tipStart, fox ? 1 : 0);
  const surface = new THREE.SkinnedMesh(geometry, fox ? [mat, red] : mat);
  surface.name = `${joints[0].name}.surface`;
  surface.position.copy(joints[0].position);
  joints[0].parent!.add(surface);
  surface.castShadow = surface.receiveShadow = true;
  // Only nine/fewer small tail meshes: avoid a stale bind-pose frustum box
  // clipping the tips as they curl beyond it (r160 does not refresh each frame).
  surface.frustumCulled = false;
  return { surface, joints };
}

type Profile = {
  coat: string; accent: string; bodyY: number; body: [number, number, number];
  head: [number, number, number]; headSize: number; hipX: number; hipY: number;
  frontZ: number; backZ: number; legRadius: number; stride: number; pace: number;
};
const profiles: Record<KamiKind, Profile> = {
  kitsune: { coat: "#eee6d9", accent: "#b84439", bodyY: 23, body: [8, 9, 20], head: [0, 33, 20], headSize: 7.2, hipX: 5.8, hipY: 21, frontZ: 12, backZ: -12, legRadius: 2.2, stride: 7, pace: 1.25 },
  shika: { coat: "#bc8748", accent: "#e5c27c", bodyY: 35, body: [9.5, 12, 22], head: [0, 60, 23], headSize: 6.8, hipX: 6, hipY: 31, frontZ: 13, backZ: -13, legRadius: 1.9, stride: 10, pace: 0.95 },
  nekomata: { coat: "#464753", accent: "#c79c62", bodyY: 17, body: [6.5, 7, 14], head: [0, 26, 14], headSize: 6.4, hipX: 4.5, hipY: 15, frontZ: 9, backZ: -8, legRadius: 1.6, stride: 6, pace: 1.35 },
  baku: { coat: "#708d94", accent: "#c8bc98", bodyY: 28, body: [12, 13, 22], head: [0, 39, 22], headSize: 8.8, hipX: 8, hipY: 24, frontZ: 13, backZ: -12, legRadius: 3.4, stride: 6, pace: 0.8 },
  tanuki: { coat: "#886449", accent: "#dac49b", bodyY: 24, body: [14, 17, 11], head: [0, 45, 3], headSize: 8.6, hipX: 6.5, hipY: 13, frontZ: 1, backZ: 0, legRadius: 3.2, stride: 5, pace: 1.05 },
  kappa: { coat: "#6c9c67", accent: "#c7d1a0", bodyY: 21, body: [9, 12, 7], head: [0, 37, 1], headSize: 7.2, hipX: 5, hipY: 14, frontZ: 0, backZ: 0, legRadius: 2.4, stride: 6, pace: 1.2 },
  oni: { coat: "#b65349", accent: "#e1b65e", bodyY: 37, body: [15, 19, 10], head: [0, 63, 1], headSize: 9, hipX: 8, hipY: 19, frontZ: 0, backZ: 0, legRadius: 4, stride: 7, pace: 0.85 },
  kodama: { coat: "#e8ead9", accent: "#a4bba9", bodyY: 8, body: [3.5, 5, 2.6], head: [0, 17, 0], headSize: 5.8, hipX: 1.9, hipY: 5, frontZ: 0, backZ: 0, legRadius: 0.8, stride: 1.5, pace: 1.3 },
};

export function buildArticulatedKami(kind: KamiKind): ArticulatedKami {
  const p = profiles[kind];
  const quadruped = ["kitsune", "shika", "nekomata", "baku"].includes(kind);
  const coat = material(p.coat), accent = material(p.accent);
  const group = new THREE.Group();
  group.name = `${kind}.character`;
  const pelvis = bone(group, "pelvis");
  const spine = bone(pelvis, "spine", V(0, p.bodyY, 0));
  const chest = bone(spine, "chest");
  ellipsoid(chest, coat, V(), V(...p.body));
  ellipsoid(chest, kind === "oni" ? coat : kind === "kitsune" ? ivory : accent,
    V(0, quadruped ? -p.body[1] * 0.15 : -2, quadruped ? 4 : p.body[2] * 0.64),
    V(p.body[0] * 0.77, p.body[1] * 0.8, p.body[2] * (quadruped ? 0.82 : 0.52)));
  const neck = bone(chest, "neck", V(p.head[0], p.head[1] - p.bodyY - p.headSize * 0.55, p.head[2] - 2));
  if (kind === "shika") {
    taper(chest, coat, V(0, 0, 13), neck.position, 6.5, 3.6);
    for (let i = 0; i < 5; i++) tuft(chest, accent, V(0, 4 + i * 3, 17 + i * 0.4), 5, 2.7, Math.PI);
  }
  const head = bone(neck, "head", V(0, p.headSize * 0.55, 2));
  const h = p.headSize;
  ellipsoid(head, coat, V(), V(h, h * (kind === "kodama" ? 0.98 : 0.88), h * 0.86));
  const jaw = bone(head, "jaw", V(0, -h * 0.35, h * 0.45));
  const snoutLength = kind === "kitsune" || kind === "shika" ? h * 0.95 : h * 0.5;
  if (kind !== "kodama") {
    ellipsoid(jaw, kind === "oni" ? coat : kind === "kitsune" ? ivory : accent, V(0, -h * 0.08, snoutLength * 0.65), V(h * 0.48, h * 0.23, snoutLength));
    if (kind !== "kappa" && kind !== "baku" && kind !== "oni")
      ellipsoid(jaw, ink, V(0, h * 0.05, snoutLength * 1.5), V(h * 0.19, h * 0.12, h * 0.15));
  } else {
    ellipsoid(head, ink, V(h * 0.08, -h * 0.37, h * 0.8), V(h * 0.12, h * 0.18, h * 0.035));
    // Growth rings make their wood-spirit origin readable without losing the
    // deliberately simple, uncanny face.
    for (let i = 0; i < 3; i++) {
      const ring = piece(chest, new THREE.TorusGeometry(1.15 + i * 0.65, 0.09, 4, 16), accent, V(0.2, -1, 2.45));
      ring.scale.y = 1.3;
    }
    tuft(head, accent, V(-1.8, 5.7, -0.5), 3.1, 1.2, -0.5);
    tuft(head, coat, V(-0.2, 5.8, -0.5), 2.5, 0.9, 0.4);
  }

  const eyes: THREE.Bone[] = [], ears: THREE.Bone[] = [], brows: THREE.Bone[] = [];
  for (const side of [-1, 1]) {
    if (kind === "tanuki") ellipsoid(head, ink, V(side * h * 0.44, h * 0.08, h * 0.68), V(h * 0.4, h * 0.29, h * 0.2));
    const eye = bone(head, `eye.${side}`, V(side * h * 0.43, h * 0.09, h * (kind === "tanuki" ? 0.94 : 0.78)));
    ellipsoid(eye, kind === "kodama" ? ink : ivory, V(), V(h * 0.23, h * 0.2, h * 0.075));
    if (kind !== "kodama") {
      ellipsoid(eye, kind === "kitsune" || kind === "nekomata" ? gold : ink, V(0, 0, h * 0.068), V(h * 0.13, h * 0.17, h * 0.04));
      ellipsoid(eye, ink, V(0, 0, h * 0.102), V(h * 0.047, h * 0.135, h * 0.025));
      ellipsoid(eye, ivory, V(-h * 0.04, h * 0.07, h * 0.12), V(h * 0.034, h * 0.035, h * 0.02));
    }
    eyes.push(eye);
    if (kind !== "kodama") {
      const brow = bone(head, `brow.${side}`, V(side * h * 0.43, h * 0.37, h * 0.77));
      ellipsoid(brow, kind === "oni" ? ink : coat, V(), V(h * 0.29, h * 0.095, h * 0.1));
      brows.push(brow);
    }
    if (kind !== "kappa" && kind !== "oni" && kind !== "kodama") {
      const ear = bone(head, `ear.${side}`, V(side * h * 0.71, h * 0.55, -h * 0.1));
      if (kind === "tanuki" || kind === "baku") {
        ellipsoid(ear, coat, V(0, 1, 0), V(h * 0.4, h * 0.48, h * 0.17));
        ellipsoid(ear, pink, V(0, 1, h * 0.14), V(h * 0.26, h * 0.32, h * 0.055));
      } else {
        tuft(ear, coat, V(0, h * 0.35, 0), h * 1.05, h * 0.36, -side * 0.3);
        tuft(ear, kind === "kitsune" ? red : pink, V(0, h * 0.35, h * 0.13), h * 0.71, h * 0.22, -side * 0.3);
      }
      ears.push(ear);
    }
    if (kind === "kitsune" || kind === "nekomata" || kind === "tanuki") {
      for (let i = 0; i < 3; i++) {
        tuft(head, kind === "kitsune" ? ivory : coat, V(side * h * (0.75 + i * 0.06), -h * (0.12 + i * 0.14), h * 0.12), h * 0.6, h * 0.22, side * (1.05 + i * 0.22));
      }
      for (let i = 0; i < 3; i++) taper(head, ivory,
        V(side * h * 0.35, -h * 0.29, h * 0.9), V(side * h * 1.18, h * (-0.25 + i * 0.16), h * 1.02), 0.075, 0.025);
    }
    if (kind === "kitsune") {
      tuft(head, red, V(side * h * 0.65, -h * 0.1, h * 0.75), h * 0.47, h * 0.13, side * 0.75);
      tuft(head, red, V(side * h * 0.29, h * 0.55, h * 0.68), h * 0.48, h * 0.11, -side * 0.35);
    }
  }

  const limbs: TwoBoneIK[] = [], feet: FootGait[] = [], arms: TwoBoneIK[] = [];
  const pairs = quadruped ? [p.frontZ, p.backZ] : [p.frontZ];
  pairs.forEach((z, pair) => {
    for (const side of [-1, 1]) {
      const length = p.hipY * 0.56;
      const ik = new TwoBoneIK(pelvis, V(side * p.hipX, p.hipY, z), length, length,
        V(side * 0.15, 0, quadruped && pair === 0 ? -1 : 1), `leg.${pair}.${side}`);
      limbs.push(ik);
      ellipsoid(ik.upper, coat, V(0, -length * 0.32, 0), V(p.legRadius * 1.25, length * 0.5, p.legRadius * 1.25));
      taper(ik.lower, coat, V(), V(0, -length, 0), p.legRadius * 0.8, p.legRadius * 0.5);
      ellipsoid(ik.lower, coat, V(), V(p.legRadius * 0.95, p.legRadius, p.legRadius * 0.95));
      const footMat = kind === "shika" ? ink : kind === "kitsune" ? red : coat;
      ellipsoid(ik.end, footMat, V(0, -p.legRadius * 0.15, p.legRadius * 0.7), V(p.legRadius * 1.05, p.legRadius * 0.58, p.legRadius * 1.65));
      if (kind !== "kodama" && kind !== "shika") for (let toe = -1; toe <= 1; toe++) {
        ellipsoid(ik.end, kind === "kappa" ? accent : ivory,
          V(toe * p.legRadius * 0.57, -p.legRadius * 0.12, p.legRadius * 1.9),
          V(p.legRadius * 0.23, p.legRadius * 0.24, p.legRadius * 0.55));
      }
      if (kind === "shika") taper(ik.end, accent, V(0, 0, p.legRadius * 2.3), V(0, -p.legRadius * 0.6, p.legRadius * 2.3), 0.08, 0.08);
      feet.push(new FootGait(ik, V(side * (p.hipX + 0.3), p.legRadius * 0.8, z),
        (side === 1 ? 0.5 : 0) + (pair === 1 ? 0.5 : 0), p.stride, p.hipY * 0.23));
    }
  });
  if (!quadruped) for (const side of [-1, 1]) {
    const length = kind === "kodama" ? 3.1 : kind === "oni" ? 12 : 8;
    const r = p.legRadius * 0.72;
    const ik = new TwoBoneIK(chest, V(side * p.body[0] * 0.88, p.body[1] * 0.56, 0), length, length * 0.9,
      V(side * 0.5, 0, -1), `arm.${side}`);
    arms.push(ik); limbs.push(ik);
    ellipsoid(ik.upper, coat, V(0, -length * 0.4, 0), V(r * 1.3, length * 0.57, r * 1.35));
    taper(ik.lower, coat, V(), V(0, -length * 0.9, 0), r, r * 0.62);
    ellipsoid(ik.end, coat, V(0, -r, 0), V(r * 1.25, r * 1.35, r * 0.72));
    for (let f = 0; f < 3; f++) {
      const finger = bone(ik.end, `finger.${side}.${f}`, V((f - 1) * r * 0.7, -r * 1.4, 0));
      taper(finger, coat, V(), V(0, -r * 1.45, r * 0.35), r * 0.32, r * 0.21);
      finger.rotation.x = -0.3 - f * 0.13;
    }
    const thumb = bone(ik.end, `thumb.${side}`, V(-side * r, -r * 0.3, 0.2));
    taper(thumb, coat, V(), V(-side * r * 0.55, -r, r * 0.6), r * 0.38, r * 0.2);
  }

  const tails: { joints: THREE.Bone[]; spread: number; index: number }[] = [];
  const tailSkins: ReturnType<typeof tailSurface>[] = [];
  const tailCount = kind === "kitsune" ? 9 : kind === "nekomata" ? 2 : ["shika", "tanuki", "baku"].includes(kind) ? 1 : 0;
  for (let i = 0; i < tailCount; i++) {
    const spread = (i - (tailCount - 1) / 2) * (kind === "kitsune" ? 0.25 : 0.65);
    const joints: THREE.Bone[] = [];
    let parent: THREE.Object3D = chest;
    const segments = kind === "kitsune" || kind === "nekomata" ? 5 : 3;
    const len = kind === "shika" ? 3 : kind === "tanuki" ? 4.2 : 6.5;
    for (let j = 0; j < segments; j++) {
      const joint = bone(parent, `tail.${i}.${j}`, j === 0 ? V(0, 1, -p.body[2] * 0.8) : V(0, 0, -len));
      const radius = kind === "kitsune" ? 1.5 + Math.sin(j / segments * Math.PI) * 2.5 : kind === "tanuki" ? 4 - j * 0.7 : 1.6 - j * 0.2;
      if (kind !== "kitsune" && kind !== "nekomata") {
        ellipsoid(joint, kind === "tanuki" && j % 2 === 0 ? ink : coat,
          V(0, 0, -len * 0.5), V(radius, radius, len * 0.73));
      }
      joints.push(joint); parent = joint;
    }
    tails.push({ joints, spread, index: i });
    if (kind === "kitsune" || kind === "nekomata") tailSkins.push(tailSurface(joints, len, kind === "kitsune" ? 4 : 1.9, kind === "kitsune", coat));
  }

  // Species-specific silhouettes and surface detail.
  const trunk: THREE.Bone[] = [];
  if (kind === "baku") {
    let parent: THREE.Object3D = head;
    for (let i = 0; i < 6; i++) {
      const joint = bone(parent, `trunk.${i}`, i === 0 ? V(0, -2, 7) : V(0, -3.2, 0));
      taper(joint, coat, V(), V(0, -3.2, 0), 3 - i * 0.35, 2.7 - i * 0.35);
      trunk.push(joint); parent = joint;
    }
    for (const side of [-1, 1]) {
      taper(head, ivory, V(side * 4, -3, 5), V(side * 6, -1, 11), 1.4, 0.15);
      for (let i = 0; i < 6; i++) tuft(chest, accent, V(side * 5, 8, 5 + i * 2.2), 7, 2.4, -side * 0.35);
    }
  }
  if (kind === "shika") {
    for (const side of [-1, 1]) {
      const antler = bone(head, `antler.${side}`, V(side * 3.5, 5, -1));
      const points = [V(), V(side * 3, 8, -2), V(side * 5, 16, -4), V(side * 6, 23, -3)];
      for (let i = 0; i < 3; i++) {
        taper(antler, gold, points[i], points[i + 1], 1.3 - i * 0.3, 0.9 - i * 0.3);
        const tip = points[i + 1].clone().add(V(side * (4 + i), 4 + i, 3));
        taper(antler, gold, points[i + 1], tip, 0.8 - i * 0.2, 0.12);
      }
      for (let row = 0; row < 3; row++) for (let i = 0; i < 7; i++) {
        const z = -14 + i * 4.5, y = 2 + row * 2.7;
        const x = p.body[0] * Math.sqrt(Math.max(0.1, 1 - (z / p.body[2]) ** 2 - (y / p.body[1]) ** 2)) + 0.08;
        ellipsoid(chest, ivory, V(side * x, y, z), V(0.24, 0.6 + (i % 2) * 0.25, 0.95));
      }
    }
  }
  if (kind === "kappa") {
    ellipsoid(chest, material("#405e4c"), V(0, 0, -5.5), V(10.5, 12.5, 5));
    for (let row = -1; row <= 1; row++) for (let col = -1; col <= 1; col++) {
      ellipsoid(chest, material((row + col) % 2 ? "#74915d" : "#58764e"),
        V(col * 5.6, row * 6.1, -9.3 + Math.abs(col) * 0.8 + Math.abs(row) * 0.6), V(3.4, 3.9, 1.3));
    }
    for (let i = 0; i < 4; i++) ellipsoid(chest, accent, V(0, -6 + i * 3.6, 6.5), V(6.8, 1.4, 1.4));
    piece(head, new THREE.TorusGeometry(5.2, 0.8, 8, 24), ivory, V(0, 6.2, 0), V(1, 1, 1), new THREE.Euler(Math.PI / 2, 0, 0));
    piece(head, new THREE.CylinderGeometry(4.6, 4.6, 0.35, 24), material("#9ecbc2", false), V(0, 6.2, 0));
    for (let i = 0; i < 10; i++) {
      const a = i / 10 * Math.PI * 2;
      tuft(head, material("#354e43"), V(Math.sin(a) * 5.4, 4.1, Math.cos(a) * 5.4), 3.5, 1.3, Math.PI);
    }
    ellipsoid(jaw, gold, V(0, 0.2, 4), V(4.6, 1.1, 4));
    ellipsoid(head, gold, V(0, -1, 7), V(4.6, 1.2, 3.3));
  }
  if (kind === "oni") {
    const hair = material("#36333d");
    ellipsoid(head, coat, V(0, -0.4, 7.8), V(2.2, 2, 2));
    for (const side of [-1, 1]) ellipsoid(head, ink, V(side * 0.9, -1.1, 9.3), V(0.4, 0.28, 0.2));
    for (let i = 0; i < 9; i++) {
      const a = i * Math.PI * 2 / 9;
      ellipsoid(head, hair, V(Math.sin(a) * 6.7, 5, Math.cos(a) * 5), V(3.4, 3.6, 3.2));
    }
    for (const side of [-1, 1]) {
      taper(head, ivory, V(side * 5, 6, 1), V(side * 6, 13, 0), 2, 0.85);
      taper(head, gold, V(side * 6, 13, 0), V(side * 5.4, 16, 2), 0.85, 0.08);
      taper(jaw, ivory, V(side * 3.2, -1, 4), V(side * 3.6, 3.5, 4.5), 1.1, 0.08);
      ellipsoid(chest, coat, V(side * 6, 6, 7.5), V(7, 5, 3.4));
    }
    piece(spine, new THREE.CylinderGeometry(12, 14, 13, 18, 1, true), gold, V(0, -13, 0));
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * Math.PI * 2;
      tuft(spine, hair, V(Math.sin(a) * 13.3, -14, Math.cos(a) * 13.3), 10, 1.2, i % 2 ? 0.2 : -0.2);
    }
    // The kanabo follows the wrist, not a free-floating shoulder cylinder.
    const hand = arms[1].end;
    taper(hand, material("#71513d"), V(0, 2, 0), V(0, -20, 0), 1.2, 2.7);
    taper(hand, hair, V(0, -13, 0), V(0, -32, 0), 3.7, 4.8);
    for (let ring = 0; ring < 4; ring++) for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3;
      ellipsoid(hand, gold, V(Math.sin(a) * 4.4, -15 - ring * 4, Math.cos(a) * 4.4), V(1, 1, 1));
    }
  }
  if (kind === "tanuki" || kind === "kitsune") {
    const cord = piece(neck, new THREE.TorusGeometry(h * 0.71, 0.5, 6, 20), red, V(0, 0, 0));
    cord.rotation.x = Math.PI / 2;
    const charm = bone(neck, "charm", V(0, -2, h * 0.76));
    ellipsoid(charm, gold, V(0, -1, 0), V(1.5, 1.9, 0.7));
    ellipsoid(charm, ink, V(0, -1.4, 0.65), V(0.1, 0.6, 0.07));
  }

  batchDetails(group);
  // Stories dispose their actors on exit. Give every character its own GPU
  // resources, while still sharing detail within an individual character.
  // Otherwise ending a tale disposes materials/geometry of ambient doubles.
  const ownGeometry = new Map<THREE.BufferGeometry, THREE.BufferGeometry>();
  const ownMaterial = new Map<THREE.Material, THREE.Material>();
  const acquireMaterial = (source: THREE.Material) => {
    let copy = ownMaterial.get(source);
    if (!copy) { copy = source.clone(); ownMaterial.set(source, copy); }
    return copy;
  };
  group.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const geometry: THREE.BufferGeometry = ownGeometry.get(object.geometry) ?? object.geometry.clone();
    ownGeometry.set(object.geometry, geometry);
    object.geometry = geometry;
    object.material = Array.isArray(object.material) ? object.material.map(acquireMaterial) : acquireMaterial(object.material);
  });
  const bones: THREE.Bone[] = [];
  group.traverse((object) => { if (object instanceof THREE.Bone) bones.push(object); });
  group.updateMatrixWorld(true);
  tailSkins.forEach(({ surface, joints }) => {
    const tailSkeleton = new THREE.Skeleton(joints);
    surface.bind(tailSkeleton);
    // The existing story teardown disposes mesh geometry; release the bone
    // texture at the same time so repeated story playback cannot leak it.
    surface.geometry.addEventListener("dispose", () => tailSkeleton.dispose());
  });
  const skeleton = new THREE.Skeleton(bones);
  let sampler: GroundSampler | undefined = worldGroundY;
  const performance = { wonder: 0, joy: 0, protect: 0, cast: 0, drum: 0 };
  let lastTime: number | undefined;
  const handTarget = V();
  const poseTarget = V();
  const fingers = bones.filter((b) => b.name.startsWith("finger."));
  const charm = bones.find((b) => b.name === "charm");

  const build: ArticulatedKami = {
    group, skeleton, limbs,
    setGroundSampler: (ground) => { sampler = ground; },
    setPerformance(pose) {
      for (const name of Object.keys(performance) as (keyof typeof performance)[]) performance[name] = THREE.MathUtils.clamp(pose[name] ?? 0, 0, 1);
    },
    getAnchorWorld(anchor, out) {
      const firstTail = tails[0]?.joints;
      const joint = anchor === "leftHand" ? arms[0]?.end : anchor === "rightHand" ? arms[1]?.end : anchor === "tail" ? firstTail?.[firstTail.length - 1] : head;
      return (joint ?? head).getWorldPosition(out);
    },
    animate(t, phase, moving01) {
      const moving = THREE.MathUtils.clamp(moving01, 0, 1);
      const dt = lastTime === undefined || t < lastTime ? 1 / 60 : Math.min(0.1, t - lastTime);
      lastTime = t;
      const cycle = t * p.pace + phase / (Math.PI * 2);
      const gait = cycle * Math.PI * 2;
      const breath = Math.sin(t * 1.7 + phase);
      // Outer group transforms belong to placement/story choreography.
      pelvis.position.y = (Math.cos(gait * 2) * 0.35 + 0.35) * moving;
      spine.rotation.z = Math.sin(gait) * moving * (quadruped ? 0.025 : 0.045);
      chest.rotation.y = Math.sin(gait) * moving * (quadruped ? 0.025 : 0.055);
      chest.scale.set(1 + breath * 0.008, 1 + breath * 0.012, 1);
      neck.rotation.x = Math.sin(t * 1.1 + phase) * 0.035 + Math.cos(gait) * moving * 0.04;
      const attention = Math.sin(t * 0.43 + phase) * Math.sin(t * 0.17 + phase);
      head.rotation.y = attention * (1 - moving * 0.7) * 0.3;
      head.rotation.z = Math.sin(t * 0.61 + phase) * 0.06 * (1 - moving);
      head.rotation.x = kind === "shika" ? Math.pow(Math.max(0, Math.sin(t * 0.24 + phase)), 6) * 0.65 * (1 - moving) : breath * 0.02;
      head.rotation.x -= performance.wonder * 0.25 + performance.cast * 0.12;
      head.rotation.z += performance.joy * Math.sin(t * 3.2) * 0.09;
      if (kind === "kodama") head.rotation.z += Math.pow(Math.max(0, Math.sin(t * 0.73 + phase)), 18) * Math.sin(t * 34) * 0.16;
      jaw.rotation.x = 0.02 + Math.max(0, Math.sin(t * 1.8 + phase)) ** 8 * (kind === "oni" ? 0.18 : 0.07);
      jaw.rotation.x += performance.wonder * 0.13 + performance.joy * 0.08;
      const blinkPhase = ((t + phase) % 4.7 + 4.7) % 4.7;
      const blink = blinkPhase < 0.16 ? 1 - Math.sin(blinkPhase / 0.16 * Math.PI) * 0.96 : 1;
      eyes.forEach((eye) => { eye.scale.y = blink * (kind === "kitsune" || kind === "nekomata" ? 0.7 : 1); eye.rotation.y = attention * 0.12; });
      brows.forEach((b, i) => { b.rotation.z = (i === 0 ? -1 : 1) * (kind === "oni" ? -0.2 : 0.08) + attention * 0.08; });
      ears.forEach((ear, i) => {
        ear.rotation.z = (i === 0 ? 1 : -1) * 0.1 + Math.sin(t * 0.9 + phase + i) * 0.1;
        ear.rotation.x = Math.pow(Math.max(0, Math.sin(t * 1.6 + phase + i * 2)), 16) * 0.28;
      });
      tails.forEach(({ joints, spread, index }) => joints.forEach((joint, j) => {
        joint.rotation.y = (j === 0 ? spread : 0) + Math.sin(t * 1.4 + phase + index * 0.7 - j * 0.55) * 0.12;
        joint.rotation.x = (j === 0 ? 0.42 + (index % 3) * 0.15 : 0.12) + Math.sin(t * (1.8 + performance.joy) + phase - j * 0.5 + index) * (0.1 + performance.cast * 0.12);
      }));
      trunk.forEach((joint, i) => { joint.rotation.x = -0.14 + Math.sin(t * 1.1 + phase - i * 0.35) * 0.13; joint.rotation.z = Math.sin(t * 0.7 + phase - i * 0.3) * 0.06; });
      if (charm) charm.rotation.x = Math.sin(gait + 0.8) * 0.22 * moving + breath * 0.04;
      fingers.forEach((finger, i) => { finger.rotation.x = -0.32 - (i % 3) * 0.13 + Math.sin(t * 1.2 + phase) * 0.1; });
      // Refresh parent travel transforms BEFORE sampling real terrain.
      group.updateWorldMatrix(true, true);
      feet.forEach((foot) => foot.update(cycle, moving, dt, sampler));
      arms.forEach((arm, i) => {
        const side = i === 0 ? -1 : 1;
        handTarget.set(side * (p.body[0] + 1), -p.body[1] * 0.32,
          3 + Math.sin(gait + i * Math.PI) * p.stride * 0.75 * moving);
        const gesture = Math.pow(Math.max(0, Math.sin(t * 0.55 + phase + i)), 6) * (1 - moving);
        handTarget.y += gesture * p.body[1] * 0.75;
        handTarget.z += gesture * p.body[0] * 0.65;
        if (kind === "oni" && i === 1) handTarget.y += 9;
        if (performance.protect > 0 && i === 0) handTarget.lerp(poseTarget.set(-p.body[0] * 0.5, -1, p.body[2] + 9), performance.protect);
        if (performance.cast > 0) handTarget.lerp(poseTarget.set(side * (p.body[0] + 3), p.body[1] * 0.65, p.body[2] + 6), performance.cast);
        if (performance.drum > 0) {
          const beat = Math.sin(t * Math.PI * 2 / 0.62 + i * Math.PI);
          handTarget.lerp(poseTarget.set(side * p.body[0] * 0.34, -1 + Math.max(0, beat) * 7, p.body[2] + 2), performance.drum);
        }
        arm.solve(handTarget);
        arm.end.rotation.x += kind === "oni" && i === 1 ? 0.8 : -gesture * 0.3;
        if (i === 0) arm.end.rotation.x -= performance.protect * Math.PI / 2;
      });
    },
  };
  build.animate(0, 0, 0);
  return build;
}
