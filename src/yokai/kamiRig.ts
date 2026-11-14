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

  /** Move the chain's root joint (shoulder / hip rides on a moving girdle). */
  setOrigin(origin: THREE.Vector3) {
    this.origin.copy(origin);
    this.upper.position.copy(origin);
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

/** What the gait and the verification need from any IK limb. */
export type Limb = {
  readonly root: THREE.Object3D;
  readonly upper: THREE.Bone;
  readonly lower: THREE.Bone;
  readonly end: THREE.Bone;
  /** The point `end` actually reaches after the last solve (clamped). */
  readonly target: THREE.Vector3;
  solve(target: THREE.Vector3): void;
};

const X_AXIS = new THREE.Vector3(1, 0, 0);

/**
 * A canine leg. The two-bone chain is upper arm + forearm (front) or thigh +
 * shin (hind) and ends at the wrist / hock; a fixed-length pastern or
 * metatarsus then reaches the paw. Its rest direction keeps the wrist and
 * hock where a fox carries them (hock high and behind the paw) and it folds
 * back as the paw lifts, so a swinging paw tucks under like a trotting fox's.
 */
export class DigitigradeLeg implements Limb {
  readonly chain: TwoBoneIK;
  readonly root: THREE.Object3D;
  readonly upper: THREE.Bone;
  readonly lower: THREE.Bone;
  /** Wrist / hock: the chain's end, levelled in root space. */
  readonly wrist: THREE.Bone;
  /** Pastern (front) or metatarsus (hind). */
  readonly cannon = new THREE.Bone();
  /** The paw. */
  readonly end = new THREE.Bone();
  readonly target = new THREE.Vector3();
  readonly cannonLength: number;
  private rise = new THREE.Vector3();
  private joint = new THREE.Vector3();
  private down = new THREE.Vector3();
  private pitch = new THREE.Quaternion();
  private anchored = new THREE.Vector3();
  private toRoot = new THREE.Matrix4();

  constructor(root: THREE.Object3D, readonly options: {
    origin: THREE.Vector3; upperLength: number; lowerLength: number;
    /** Paw -> wrist/hock offset in root space at rest. */
    rise: THREE.Vector3;
    pole: THREE.Vector3;
    /** Paw height at rest and the lift at which the fold is complete. */
    restY: number; liftRange: number;
    /** Fold of the distal segment (radians) at full lift. */
    curl: number;
    name: string;
    /** The girdle (chest or hips bone) the shoulder / hip joint rides on,
     * and the joint's position in that bone's space. World matrices must be
     * current when solving. */
    anchor?: { bone: THREE.Object3D; point: THREE.Vector3 };
  }) {
    this.chain = new TwoBoneIK(root, options.origin, options.upperLength, options.lowerLength, options.pole, options.name);
    this.root = root;
    this.upper = this.chain.upper;
    this.lower = this.chain.lower;
    this.wrist = this.chain.end;
    this.wrist.name = `${options.name}.wrist`;
    this.cannonLength = options.rise.length();
    this.cannon.name = `${options.name}.cannon`;
    this.end.name = `${options.name}.end`;
    this.end.position.y = -this.cannonLength;
    this.wrist.add(this.cannon);
    this.cannon.add(this.end);
  }

  solve(target: THREE.Vector3) {
    const { rise, restY, liftRange, curl } = this.options;
    const fold = THREE.MathUtils.clamp((target.y - restY) / liftRange, 0, 1) * curl;
    const anchor = this.options.anchor;
    if (anchor) {
      this.toRoot.copy(this.root.matrixWorld).invert().multiply(anchor.bone.matrixWorld);
      this.chain.setOrigin(this.anchored.copy(anchor.point).applyMatrix4(this.toRoot));
    }
    this.rise.copy(rise).applyAxisAngle(X_AXIS, fold);
    this.chain.solve(this.joint.copy(target).add(this.rise));
    // The chain's end is level in root space, so the cannon's local frame is
    // root-aligned and can point straight from the wrist/hock to the paw.
    this.down.copy(this.rise).normalize().negate();
    this.cannon.quaternion.setFromUnitVectors(DOWN, this.down);
    this.target.copy(this.chain.target).addScaledVector(this.down, this.cannonLength);
    // Paw level with the root; toes tip down while it is folded.
    this.pitch.setFromAxisAngle(X_AXIS, fold * 0.85);
    this.end.quaternion.copy(this.cannon.quaternion).invert().multiply(this.pitch);
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
  /** Fraction of the stride the paw is on the ground (gait dependent). */
  duty = 0.62;

  constructor(
    readonly ik: Limb,
    readonly rest: THREE.Vector3,
    public phaseOffset: number,
    public stride: number,
    public lift: number,
  ) {}

  /** Smoothed terrain correction under this paw, in root space. */
  get support() { return this.groundOffset; }

  phase(cycle: number) { return ((cycle + this.phaseOffset) % 1 + 1) % 1; }

  /** 0..1 weight on the leg: peaks mid-stance, zero in the air. */
  load(cycle: number) {
    const phase = this.phase(cycle);
    return phase < this.duty ? Math.sin(phase / this.duty * Math.PI) : 0;
  }

  /** Fore-aft paw position, +1 reaching forward ... -1 pushed back. */
  forward(cycle: number) {
    const phase = this.phase(cycle);
    if (phase < this.duty) return 1 - 2 * phase / this.duty;
    const swing = (phase - this.duty) / (1 - this.duty);
    // Smooth swing joins stance without a discontinuity at either endpoint.
    return -1 + 2 * swing * swing * (3 - 2 * swing);
  }

  update(cycle: number, moving: number, dt: number, ground?: GroundSampler) {
    const phase = this.phase(cycle);
    const swing = Math.max(0, (phase - this.duty) / (1 - this.duty));
    this.point.copy(this.rest);
    this.point.z += this.forward(cycle) * this.stride * moving;
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
