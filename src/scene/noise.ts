import { hash2D } from "./random.ts";

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const smoothstep = (t: number) => t * t * (3 - 2 * t);

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
