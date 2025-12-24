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
 * Smoothstep function for blending regions
 */
export const smoothBlend = (edge0: number, edge1: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return smootherstep(t);
};

/**
 * Multi-layer terrain height sampler with realistic distribution
 * Returns height with: 50% flat, 30% hills, 20% mountains
 * 
 * This function uses normalized coordinates (0-1 range) internally
 * to ensure consistent results regardless of world size.
 */
export const sampleRealisticTerrain = (
  x: number,
  z: number,
  seed: number,
  maxHeight: number,
  worldSize: number,
) => {
  // Normalize coordinates to 0-1 range based on world size
  // This ensures terrain features scale properly with world size
  const nx = x / worldSize;
  const nz = z / worldSize;

  // Region mask determines terrain type
  // Use very low frequency for continent-scale regions
  const regionNoise = fbm2D(nx * 8, nz * 8, seed, 4, 2, 0.5);

  // Add warping for organic region shapes
  const warpX = fbm2D(nx * 4, nz * 4, seed + 500, 2, 2, 0.5) * 0.3;
  const warpZ = fbm2D(nx * 4, nz * 4, seed + 600, 2, 2, 0.5) * 0.3;
  const warpedRegion = fbm2D((nx + warpX) * 8, (nz + warpZ) * 8, seed, 4, 2, 0.5);

  // Blend region noise sources
  const region = (regionNoise + warpedRegion) * 0.5;

  // Calculate blend factors for terrain types
  // 0.0 - 0.50 = flat plains (50%)
  // 0.50 - 0.80 = hills and valleys (30%)
  // 0.80 - 1.0 = mountains (20%)
  const flatFactor = 1 - smoothBlend(0.40, 0.55, region);
  const hillFactor = smoothBlend(0.45, 0.60, region) * (1 - smoothBlend(0.70, 0.85, region));
  const mountainFactor = smoothBlend(0.75, 0.88, region);

  // FLAT PLAINS: Very gentle undulation
  const flatHeight = fbm2D(nx * 30, nz * 30, seed + 1000, 2, 2, 0.4) * 0.05;

  // HILLS: Rolling terrain with valleys
  const hillBase = fbm2D(nx * 20, nz * 20, seed + 2000, 4, 2, 0.5);
  const hillDetail = fbm2D(nx * 60, nz * 60, seed + 2100, 3, 2, 0.45) * 0.2;
  // Create valley cuts using absolute noise
  const valleyMask = 1 - Math.pow(Math.abs(fbm2D(nx * 15, nz * 15, seed + 2200, 3, 2, 0.5) * 2 - 1), 0.5) * 0.4;
  const hillHeight = (hillBase * 0.6 + hillDetail) * 0.35 * valleyMask;

  // MOUNTAINS: Ridged noise for dramatic peaks
  const mountainBase = ridgedNoise2D(nx * 12, nz * 12, seed + 3000, 5, 2.2, 0.55);
  const mountainDetail = fbm2D(nx * 40, nz * 40, seed + 3100, 3, 2, 0.4) * 0.15;
  // Add dramatic height multiplier for mountains
  const mountainHeight = Math.pow(mountainBase, 1.3) * 0.9 + mountainDetail;

  // Combine all terrain types with proper weighting
  const combinedHeight = (
    flatHeight * flatFactor +
    hillHeight * hillFactor +
    mountainHeight * mountainFactor
  );

  // Apply maxHeight and ensure mountains are properly tall
  const height = combinedHeight * maxHeight;

  return height;
};

/**
 * Returns terrain type at position (0 = flat, 1 = hills, 2 = mountains)
 */
export const getTerrainType = (x: number, z: number, seed: number, worldSize: number): number => {
  const nx = x / worldSize;
  const nz = z / worldSize;
  const region = fbm2D(nx * 8, nz * 8, seed, 4, 2, 0.5);

  if (region < 0.5) return 0; // flat
  if (region < 0.8) return 1; // hills
  return 2; // mountains
};
