/**
 * The occupancy register. Important structures — bridges, pagodas, houses,
 * walls — claim their ground here as circular footprints; anything placed
 * by random scatter (flora, and any future set-dressing) must ask first.
 * Structures are built before planting, so the register is complete by
 * the time seeds fall.
 */

type Zone = { x: number; z: number; r: number };

const zones: Zone[] = [];

/** Claim a circular footprint of the world. */
export const reserve = (x: number, z: number, r: number): void => {
  zones.push({ x, z, r });
};

/** Claim a line of ground (bridges, wall runs) as a chain of discs. */
export const reserveLine = (
  x0: number,
  z0: number,
  x1: number,
  z1: number,
  r: number
): void => {
  const length = Math.hypot(x1 - x0, z1 - z0);
  const steps = Math.max(1, Math.ceil(length / r));
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    zones.push({ x: x0 + (x1 - x0) * t, z: z0 + (z1 - z0) * t, r });
  }
};

/** May a scattered object (with its own radius as margin) stand here? */
export const isFree = (x: number, z: number, margin = 0): boolean => {
  for (const zone of zones) {
    const dx = x - zone.x;
    const dz = z - zone.z;
    const limit = zone.r + margin;
    if (dx * dx + dz * dz < limit * limit) return false;
  }
  return true;
};

/** For tests/tools: how much of the world is spoken for. */
export const zoneCount = (): number => zones.length;
