// Small allocation-light vector + noise toolkit for the CPU-side procedural forms.

export type V3 = [number, number, number];
export const TAU = Math.PI * 2;

export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
export const madd = (a: V3, b: V3, s: number): V3 => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
export const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = (a: V3) => Math.hypot(a[0], a[1], a[2]);
export const dist = (a: V3, b: V3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
export const norm = (a: V3): V3 => scale(a, 1 / (len(a) || 1));
export const lerp3 = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const clamp = (x: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, x));
export const mix = (a: number, b: number, t: number) => a + (b - a) * t;
export const ease = (x: number) => { const t = clamp(x); return t * t * (3 - 2 * t); };
export const damp = (current: number, goal: number, rate: number, dt: number) => goal + (current - goal) * Math.exp(-rate * dt);

/** Rodrigues rotation of v around unit axis k. */
export const rotate = (v: V3, k: V3, angle: number): V3 => {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const kv = cross(k, v);
  const kd = dot(k, v) * (1 - c);
  return [v[0] * c + kv[0] * s + k[0] * kd, v[1] * c + kv[1] * s + k[1] * kd, v[2] * c + kv[2] * s + k[2] * kd];
};

/** Two unit vectors perpendicular to n (and each other). */
export const basis = (n: V3): [V3, V3] => {
  const e1 = norm(cross(n, Math.abs(n[1]) < .9 ? [0, 1, 0] : [1, 0, 0]));
  return [e1, cross(n, e1)];
};

export const bezier = (a: V3, b: V3, c: V3, d: V3, t: number): V3 => {
  const u = 1 - t;
  const w0 = u * u * u, w1 = 3 * u * u * t, w2 = 3 * u * t * t, w3 = t * t * t;
  return [
    a[0] * w0 + b[0] * w1 + c[0] * w2 + d[0] * w3,
    a[1] * w0 + b[1] * w1 + c[1] * w2 + d[1] * w3,
    a[2] * w0 + b[2] * w1 + c[2] * w2 + d[2] * w3,
  ];
};

/** Uniform Catmull-Rom through knots, `per` samples per span. */
export const catmull = (knots: V3[], per: number): V3[] => {
  const out: V3[] = [];
  const k = (i: number) => knots[Math.min(knots.length - 1, Math.max(0, i))];
  for (let i = 0; i < knots.length - 1; i++) {
    const p0 = k(i - 1), p1 = k(i), p2 = k(i + 1), p3 = k(i + 2);
    for (let s = 0; s < per; s++) {
      const t = s / per, t2 = t * t, t3 = t2 * t;
      const f = (j: number) => .5 * ((2 * p1[j]) + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3);
      out.push([f(0), f(1), f(2)]);
    }
  }
  out.push(knots[knots.length - 1]);
  return out;
};

const hashI = (i: number, j: number, k: number) => {
  let h = Math.imul(i, 0x27d4eb2d) ^ Math.imul(j, 0x165667b1) ^ Math.imul(k, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/** Smooth 3D value noise in [-1, 1]. */
export const noise3 = (x: number, y: number, z: number) => {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const n = (a: number, b: number, c: number) => hashI(xi + a, yi + b, zi + c);
  const x00 = mix(n(0, 0, 0), n(1, 0, 0), u), x10 = mix(n(0, 1, 0), n(1, 1, 0), u);
  const x01 = mix(n(0, 0, 1), n(1, 0, 1), u), x11 = mix(n(0, 1, 1), n(1, 1, 1), u);
  return mix(mix(x00, x10, v), mix(x01, x11, v), w) * 2 - 1;
};

/** Deterministic PRNG (mulberry32) so branch structure is stable within one opening. */
export const rng = (seed: number) => {
  let a = (Math.floor(seed) ^ 0x9e3779b9) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
