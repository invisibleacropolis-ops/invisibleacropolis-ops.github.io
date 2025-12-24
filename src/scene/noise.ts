import { hash2D } from "./random.ts";

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const smoothstep = (t: number) => t * t * (3 - 2 * t);

// Quintic smoothstep for smoother terrain
const smootherstep = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);

export const valueNoise2D = (x: number, z: number, seed: number) => {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const x1 = x0 + 1;
  const z1 = z0 + 1;

  const sx = smoothstep(x - x0);
  const sz = smoothstep(z - z0);

  const n00 = hash2D(x0, z0, seed);
  const n10 = hash2D(x1, z0, seed);
  const n01 = hash2D(x0, z1, seed);
  const n11 = hash2D(x1, z1, seed);

  const ix0 = lerp(n00, n10, sx);
  const ix1 = lerp(n01, n11, sx);

  return lerp(ix0, ix1, sz);
};

export const fbm2D = (
  x: number,
  z: number,
  seed: number,
  octaves = 4,
  lacunarity = 2,
  gain = 0.5,
) => {
  let amplitude = 0.5;
  let frequency = 1;
  let sum = 0;
  let max = 0;

  for (let i = 0; i < octaves; i += 1) {
    sum += valueNoise2D(x * frequency, z * frequency, seed + i * 1013) * amplitude;
    max += amplitude;
    amplitude *= gain;
    frequency *= lacunarity;
  }

  return max === 0 ? 0 : sum / max;
};

/**
 * Ridged multifractal noise - creates sharp mountain ridges
 */
export const ridgedNoise2D = (
  x: number,
  z: number,
  seed: number,
  octaves = 4,
  lacunarity = 2,
  gain = 0.5,
) => {
  let amplitude = 0.5;
  let frequency = 1;
  let sum = 0;
  let max = 0;

  for (let i = 0; i < octaves; i += 1) {
    let n = valueNoise2D(x * frequency, z * frequency, seed + i * 1013);
    // Create ridges by taking absolute value and inverting
    n = 1 - Math.abs(n * 2 - 1);
    n = n * n; // Sharpen the ridges
    sum += n * amplitude;
    max += amplitude;
    amplitude *= gain;
    frequency *= lacunarity;
  }

  return max === 0 ? 0 : sum / max;
};

/**
 * Domain warping - distorts coordinates for more organic terrain
 */
export const warpedFbm2D = (
  x: number,
  z: number,
  seed: number,
  warpStrength = 2,
  octaves = 4,
) => {
  // First pass: get warp offsets
  const warpX = fbm2D(x * 0.3, z * 0.3, seed + 100, 2, 2, 0.5) * warpStrength;
  const warpZ = fbm2D(x * 0.3, z * 0.3, seed + 200, 2, 2, 0.5) * warpStrength;

  // Second pass: sample with warped coordinates
  return fbm2D(x + warpX, z + warpZ, seed, octaves, 2, 0.5);
};

/**
 * Smoothstep function for blending regions
 */
export const smoothBlend = (edge0: number, edge1: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return smootherstep(t);
};

/**
 * Multi-layer terrain height sampler with realistic distribution
 * Returns height with: 50% flat, 30% hills, 20% mountains
 */
export const sampleRealisticTerrain = (
  x: number,
  z: number,
  seed: number,
  maxHeight: number,
) => {
  // Region mask determines terrain type (low frequency for large regions)
  const regionNoise = fbm2D(x * 0.015, z * 0.015, seed, 3, 2, 0.5);

  // Add some warping to make regions more organic
  const warpX = fbm2D(x * 0.01, z * 0.01, seed + 500, 2, 2, 0.5) * 8;
  const warpZ = fbm2D(x * 0.01, z * 0.01, seed + 600, 2, 2, 0.5) * 8;
  const warpedRegion = fbm2D((x + warpX) * 0.015, (z + warpZ) * 0.015, seed, 3, 2, 0.5);

  // Blend between noise sources
  const region = (regionNoise + warpedRegion) * 0.5;

  // Calculate blend factors for terrain types
  // 0.0 - 0.5 = flat (50%)
  // 0.5 - 0.8 = hills (30%) 
  // 0.8 - 1.0 = mountains (20%)
  const flatFactor = 1 - smoothBlend(0.35, 0.55, region);
  const hillFactor = smoothBlend(0.4, 0.6, region) * (1 - smoothBlend(0.7, 0.85, region));
  const mountainFactor = smoothBlend(0.75, 0.9, region);

  // Calculate heights for each terrain type
  // Flat: very gentle variation
  const flatHeight = fbm2D(x * 0.08, z * 0.08, seed + 1000, 2, 2, 0.4) * 0.15;

  // Hills: rolling hills with medium variation
  const hillBase = warpedFbm2D(x * 0.04, z * 0.04, seed + 2000, 3, 3);
  const hillDetail = fbm2D(x * 0.12, z * 0.12, seed + 2100, 3, 2, 0.45) * 0.3;
  const hillHeight = (hillBase * 0.7 + hillDetail) * 0.4;

  // Mountains: ridged noise for peaks
  const mountainBase = ridgedNoise2D(x * 0.025, z * 0.025, seed + 3000, 4, 2.2, 0.55);
  const mountainDetail = fbm2D(x * 0.08, z * 0.08, seed + 3100, 3, 2, 0.4) * 0.25;
  const mountainHeight = (mountainBase * 0.85 + mountainDetail * 0.15);

  // Combine all terrain types
  const height = (
    flatHeight * flatFactor +
    hillHeight * hillFactor +
    mountainHeight * mountainFactor
  ) * maxHeight;

  return height;
};

/**
 * Returns terrain type at position (0 = flat, 1 = hills, 2 = mountains)
 */
export const getTerrainType = (x: number, z: number, seed: number): number => {
  const region = fbm2D(x * 0.015, z * 0.015, seed, 3, 2, 0.5);

  if (region < 0.5) return 0; // flat
  if (region < 0.8) return 1; // hills
  return 2; // mountains
};
