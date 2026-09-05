import * as THREE from "three";

const DOWN = new THREE.Vector3(0, -1, 0);

/** Rigid-piece skeleton: meshes are attached to real bones, with no skinning
 * seams or weights to maintain. All solver inputs are in the root's space. */
export class TwoBoneIK {
  readonly upper = new THREE.Bone();
  readonly lower = new THREE.Bone();
  readonly end = new THREE.Bone();
  readonly target = new THREE.Vector3();
  readonly joint = new THREE.Vector3();
  private direction = new THREE.Vector3();
  private bend = new THREE.Vector3();
  private segment = new THREE.Vector3();
  private rotation = new THREE.Quaternion();

  constructor(
    readonly root: THREE.Object3D,
    readonly origin: THREE.Vector3,
    readonly upperLength: number,
    readonly lowerLength: number,
    readonly pole: THREE.Vector3,
    name: string,
  ) {
    if (!(upperLength > 0 && lowerLength > 0)) throw new Error("IK bones need positive lengths");
    this.upper.name = `${name}.upper`;
    this.lower.name = `${name}.lower`;
    this.end.name = `${name}.end`;
    this.upper.position.copy(origin);
    this.lower.position.y = -upperLength;
    this.end.position.y = -lowerLength;
    root.add(this.upper);
    this.upper.add(this.lower);
    this.lower.add(this.end);
  }

  solve(target: THREE.Vector3) {
    this.direction.subVectors(target, this.origin);
    const rawDistance = this.direction.length();
    if (rawDistance < 1e-7) this.direction.copy(DOWN);
    else this.direction.multiplyScalar(1 / rawDistance);
    const distance = THREE.MathUtils.clamp(rawDistance,
      Math.abs(this.upperLength - this.lowerLength) + 0.001,
      this.upperLength + this.lowerLength - 0.001);
    this.target.copy(this.origin).addScaledVector(this.direction, distance);
    // Project the pole onto the plane perpendicular to the target direction.
    this.bend.copy(this.pole).addScaledVector(this.direction, -this.pole.dot(this.direction));
    if (this.bend.lengthSq() < 1e-8) {
      this.bend.set(Math.abs(this.direction.x) < 0.8 ? 1 : 0,
        Math.abs(this.direction.x) < 0.8 ? 0 : 1, 0);
      this.bend.addScaledVector(this.direction, -this.bend.dot(this.direction));
    }
    this.bend.normalize();
    const along = (this.upperLength ** 2 - this.lowerLength ** 2 + distance ** 2) / (2 * distance);
    const height = Math.sqrt(Math.max(0, this.upperLength ** 2 - along ** 2));
    this.joint.copy(this.origin).addScaledVector(this.direction, along).addScaledVector(this.bend, height);
    this.segment.subVectors(this.joint, this.origin).normalize();
    this.upper.quaternion.setFromUnitVectors(DOWN, this.segment);
    this.segment.subVectors(this.target, this.joint).normalize();
    this.rotation.setFromUnitVectors(DOWN, this.segment);
    this.lower.quaternion.copy(this.upper.quaternion).invert().multiply(this.rotation);
    // Keep the paw/hand level in root space, independently of knee flexion.
    this.end.quaternion.copy(this.rotation).invert();
  }
}

export type GroundSampler = (x: number, z: number) => number;

/** A stance/swing foot trajectory, solved against the real scene heightfield.
 * Elevated story stages keep a flat support plane instead of reaching down
 * through the stage. Reach limiting also makes steep terrain safe. */
export class FootGait {
  private point = new THREE.Vector3();
  private center = new THREE.Vector3();
  private world = new THREE.Vector3();
  private scale = new THREE.Vector3();
  private inverse = new THREE.Matrix4();
  private groundOffset = 0;

  constructor(
    readonly ik: TwoBoneIK,
    readonly rest: THREE.Vector3,
    readonly phaseOffset: number,
    readonly stride: number,
    readonly lift: number,
  ) {}

  update(cycle: number, moving: number, dt: number, ground?: GroundSampler) {
    const phase = ((cycle + this.phaseOffset) % 1 + 1) % 1;
    const stance = 0.62;
    const swing = Math.max(0, (phase - stance) / (1 - stance));
    // Smooth swing joins stance without a discontinuity at either endpoint.
    const eased = swing * swing * (3 - 2 * swing);
    const forward = phase < stance ? 1 - 2 * phase / stance : -1 + 2 * eased;
    this.point.copy(this.rest);
    this.point.z += forward * this.stride * moving;
    this.point.y += Math.sin(swing * Math.PI) * this.lift * moving;
    let correction = 0;
    if (ground) {
      this.ik.root.getWorldPosition(this.center);
      this.ik.root.getWorldScale(this.scale);
      this.world.copy(this.point).applyMatrix4(this.ik.root.matrixWorld);
      const centerGround = ground(this.center.x, this.center.z);
      if (Math.abs(this.center.y - centerGround) < 10 * this.scale.y) {
        const supportY = ground(this.world.x, this.world.z);
        this.inverse.copy(this.ik.root.matrixWorld).invert();
        this.world.y = supportY;
        this.world.applyMatrix4(this.inverse);
        correction = THREE.MathUtils.clamp(this.world.y, -this.lift, this.lift);
      }
    }
    this.groundOffset += (correction - this.groundOffset) * (1 - Math.exp(-dt * 14));
    this.point.y += this.groundOffset;
    this.ik.solve(this.point);
  }
}
