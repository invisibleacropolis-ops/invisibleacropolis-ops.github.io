// CPU-built geometry streamed to the GPU every frame: anti-aliased screen-space
// stroke segments and camera-facing sprites. Everything is regenerated per
// frame from code, so nothing here is ever "static geometry".
import { clamp, type V3 } from "./math.ts";

export type Ink = { r: number; g: number; b: number; a: number; w: number };
export type Style = (u: number, ink: Ink) => void;

export const STROKE_FLOATS = 13; // a.xyz b.xyz rgb alpha(a,b) width(a,b)
export const SPRITE_FLOATS = 10; // xyz size rgba style seed
export const SPRITE = { glow: 0, bubble: 1, reticle: 2, flame: 3, cloud: 4, spark: 5 } as const;

export const paint = (ink: Ink, c: V3, a: number, w: number) => {
  ink.r = c[0]; ink.g = c[1]; ink.b = c[2]; ink.a = a; ink.w = w;
};

export class Strokes {
  readonly data: Float32Array;
  count = 0;
  private cum = new Float32Array(256);
  private readonly i0: Ink = { r: 1, g: 1, b: 1, a: 1, w: 1 };
  private readonly i1: Ink = { r: 1, g: 1, b: 1, a: 1, w: 1 };
  constructor(readonly capacity: number) {
    this.data = new Float32Array(capacity * STROKE_FLOATS);
  }
  reset() { this.count = 0; }

  seg(a: V3, b: V3, r: number, g: number, bl: number, alphaA: number, alphaB: number, wA: number, wB: number) {
    if (this.count >= this.capacity || (alphaA <= 0 && alphaB <= 0)) return;
    const d = this.data;
    const o = this.count++ * STROKE_FLOATS;
    d[o] = a[0]; d[o + 1] = a[1]; d[o + 2] = a[2];
    d[o + 3] = b[0]; d[o + 4] = b[1]; d[o + 5] = b[2];
    d[o + 6] = r; d[o + 7] = g; d[o + 8] = bl;
    d[o + 9] = alphaA; d[o + 10] = alphaB; d[o + 11] = wA; d[o + 12] = wB;
  }

  line(a: V3, b: V3, c: V3, alpha: number, w: number, alphaB = alpha, wB = w) {
    this.seg(a, b, c[0], c[1], c[2], alpha, alphaB, w, wB);
  }

  /** Cumulative arc length of a polyline (shared scratch buffer). */
  measure(pts: V3[]): Float32Array {
    if (this.cum.length < pts.length) this.cum = new Float32Array(pts.length * 2);
    const cum = this.cum;
    cum[0] = 0;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      cum[i] = cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    }
    return cum;
  }

  /** Draws the first `grow` fraction (by length) of a polyline; returns the tip. */
  path(pts: V3[], grow: number, style: Style): V3 {
    const n = pts.length;
    if (n < 2 || grow <= 0) return pts[0];
    const cum = this.measure(pts);
    const total = cum[n - 1];
    if (total <= 1e-6) return pts[0];
    const goal = clamp(grow) * total;
    let tip = pts[0];
    for (let i = 0; i < n - 1; i++) {
      const c0 = cum[i], c1 = cum[i + 1];
      if (c0 >= goal) break;
      const a = pts[i];
      let b = pts[i + 1];
      let u1 = c1 / total;
      if (c1 > goal) {
        const f = (goal - c0) / ((c1 - c0) || 1);
        b = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
        u1 = goal / total;
      }
      style(c0 / total, this.i0);
      style(u1, this.i1);
      this.seg(a, b, this.i0.r, this.i0.g, this.i0.b, this.i0.a, this.i1.a, this.i0.w, this.i1.w);
      tip = b;
    }
    return tip;
  }
}

/** Point at fraction u (by length) along a polyline. */
export const pointAt = (pts: V3[], cum: Float32Array, u: number): V3 => {
  const n = pts.length;
  const goal = clamp(u) * cum[n - 1];
  for (let i = 0; i < n - 1; i++) {
    if (cum[i + 1] >= goal) {
      const f = (goal - cum[i]) / ((cum[i + 1] - cum[i]) || 1);
      const a = pts[i], b = pts[i + 1];
      return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
    }
  }
  return pts[n - 1];
};

export class Sprites {
  readonly data: Float32Array;
  count = 0;
  constructor(readonly capacity: number) {
    this.data = new Float32Array(capacity * SPRITE_FLOATS);
  }
  reset() { this.count = 0; }
  add(p: V3, size: number, c: V3, alpha: number, style: number, seed = 0) {
    if (this.count >= this.capacity || alpha <= 0 || size <= 0) return;
    const d = this.data;
    const o = this.count++ * SPRITE_FLOATS;
    d[o] = p[0]; d[o + 1] = p[1]; d[o + 2] = p[2]; d[o + 3] = size;
    d[o + 4] = c[0]; d[o + 5] = c[1]; d[o + 6] = c[2]; d[o + 7] = alpha;
    d[o + 8] = style; d[o + 9] = seed;
  }
}
