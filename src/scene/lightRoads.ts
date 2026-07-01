import * as THREE from "three";

export type LightRoadTarget = {
  position: THREE.Vector3;
  accentColor: string;
};

export type LightRoads = {
  group: THREE.Group;
  update: (time: number) => void;
  dispose: () => void;
};

export type LightRoadsOptions = {
  /** Where the roads radiate from (the temple). */
  origin: THREE.Vector3;
  /** Radius around the origin to start the roads outside of. */
  originClearance?: number;
  targets: LightRoadTarget[];
  heightAt?: (x: number, z: number) => number;
  /** Height above the terrain the roads hover at. */
  hover?: number;
  packetsPerRoad?: number;
  packetSize?: number;
};

/**
 * Wayfinding made of light: each destination gets a faint guide line that
 * follows the terrain from the temple to its monument, with bright energy
 * packets streaming outward along it. From anywhere in the valley you can
 * pick a color and follow it home.
 */
export const createLightRoads = ({
  origin,
  originClearance = 700,
  targets,
  heightAt,
  hover = 14,
  packetsPerRoad = 26,
  packetSize = 26,
}: LightRoadsOptions): LightRoads => {
  const group = new THREE.Group();
  const disposables: Array<{ dispose: () => void }> = [];

  type Road = {
    curve: THREE.CatmullRomCurve3;
    packetPositions: THREE.BufferAttribute;
    packetGeometry: THREE.BufferGeometry;
    speed: number;
    phase: number;
  };
  const roads: Road[] = [];

  targets.forEach((target, index) => {
    const start = origin.clone();
    const end = target.position.clone();
    const flat = end.clone().sub(start);
    flat.y = 0;
    const total = flat.length();
    if (total < originClearance + 1) return;

    // Start just outside the temple footprint, end just short of the monument
    const dir = flat.clone().normalize();
    const from = start.clone().addScaledVector(dir, originClearance);
    const to = end.clone().addScaledVector(dir, -60);

    // Control points draped over the terrain
    const controlCount = 14;
    const controls: THREE.Vector3[] = [];
    for (let i = 0; i <= controlCount; i += 1) {
      const t = i / controlCount;
      const x = THREE.MathUtils.lerp(from.x, to.x, t);
      const z = THREE.MathUtils.lerp(from.z, to.z, t);
      const y = (heightAt ? heightAt(x, z) : 0) + hover;
      controls.push(new THREE.Vector3(x, y, z));
    }
    const curve = new THREE.CatmullRomCurve3(controls);
    const accent = new THREE.Color(target.accentColor);

    // Faint continuous guide line
    const linePoints = curve.getPoints(72);
    const lineGeometry = new THREE.BufferGeometry().setFromPoints(linePoints);
    const lineMaterial = new THREE.LineBasicMaterial({
      color: accent,
      transparent: true,
      opacity: 0.22,
    });
    const line = new THREE.Line(lineGeometry, lineMaterial);
    group.add(line);
    disposables.push(lineGeometry, lineMaterial);

    // Streaming energy packets
    const packetGeometry = new THREE.BufferGeometry();
    const positions = new THREE.BufferAttribute(new Float32Array(packetsPerRoad * 3), 3);
    packetGeometry.setAttribute("position", positions);
    const packetMaterial = new THREE.PointsMaterial({
      color: accent,
      size: packetSize,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const packets = new THREE.Points(packetGeometry, packetMaterial);
    packets.frustumCulled = false;
    group.add(packets);
    disposables.push(packetGeometry, packetMaterial);

    roads.push({
      curve,
      packetPositions: positions,
      packetGeometry,
      speed: 0.028 + (index % 3) * 0.006,
      phase: index * 0.371,
    });
  });

  const sample = new THREE.Vector3();

  const update = (time: number) => {
    for (const road of roads) {
      const positions = road.packetPositions;
      const count = positions.count;
      for (let i = 0; i < count; i += 1) {
        const t = (i / count + time * road.speed + road.phase) % 1;
        road.curve.getPoint(t, sample);
        positions.setXYZ(i, sample.x, sample.y, sample.z);
      }
      positions.needsUpdate = true;
    }
  };

  const dispose = () => {
    disposables.forEach((item) => item.dispose());
    group.removeFromParent();
  };

  return { group, update, dispose };
};
