// The three core archetypes. Each core is redrawn from code every frame, and
// its branches grow out of whatever the core looks like *right now*: petal
// tips, the deforming membrane, the current corners of the rotating cubes.
// A fresh seed on every opening means no two openings branch the same way.
import { palette, type Archetype } from "./color.ts";
import { paint, pointAt, SPRITE, type Sprites, type Strokes } from "./batches.ts";
import {
  add, basis, bezier, catmull, clamp, cross, dist, lerp3, madd, noise3, norm, rng, rotate, scale, sub, TAU, type V3,
} from "./math.ts";

export type FormLeaf = {
  j: number;
  n: number;
  target: V3;     // fully grown position
  pos: V3;        // current tip of the branch
  grow: number;   // 0..1 along the branch
  activity: number;
  rgb: V3;
};

export type FormCore = {
  arch: Archetype;
  pos: V3;
  up: V3;
  out: V3;        // away from the scene centre
  side: V3;
  open: number;   // 0 dormant .. 1 fully branched
  activity: number;
  seed: number;
  anchors: V3[];
  surface?: (dir: V3) => V3;
  leaves: FormLeaf[];
};

const local = (c: FormCore, x: number, y: number, z: number): V3 =>
  add(add(madd(c.pos, c.side, x), scale(c.up, y)), scale(c.out, z));

const ringPts = (center: V3, n: V3, radius: number, count: number, wobble?: (a: number) => number): V3[] => {
  const [e1, e2] = basis(n);
  const pts: V3[] = [];
  for (let i = 0; i <= count; i++) {
    const a = (i / count) * TAU;
    const r = radius * (wobble ? 1 + wobble(a) : 1);
    pts.push(add(center, add(scale(e1, Math.cos(a) * r), scale(e2, Math.sin(a) * r))));
  }
  return pts;
};

// ------------------------------------------------------------------ layout
export const layoutLeaves = (c: FormCore, t: number) => {
  const n = c.leaves.length;
  c.leaves.forEach((leaf, j) => {
    const f = n === 1 ? .5 : j / (n - 1);
    let target: V3;
    if (c.arch.id === "ember") {
      // a flame crown fanning up and out
      const a = (f - .5) * 2.1;
      target = local(c, Math.sin(a) * 1.95, 1.45 + .35 * Math.sin(f * Math.PI), .5 + Math.cos(a) * .9);
    } else if (c.arch.id === "bloom") {
      // a canopy on the outward hemisphere (Fibonacci cap)
      const y = 1 - ((j + .5) / n) * 1.9;
      const th = j * 2.39996 + .6;
      const rr = Math.sqrt(Math.max(0, 1 - y * y));
      const d = norm(add(add(scale(c.side, rr * Math.cos(th) * 1.05), scale(c.up, y * .9 + rr * Math.sin(th) * .35)), scale(c.out, .85 + .5 * rr)));
      target = madd(c.pos, d, 2.4);
    } else {
      // a terminal rack
      const offset = n === 1 ? 0 : ((j % 2) * 2 - 1) * .38;
      target = local(c, offset, (j - (n - 1) / 2) * .62 + (n === 1 ? .3 : 0), 2.3);
    }
    leaf.target = add(target, [Math.sin(t * .4 + j * 1.3) * .05, Math.sin(t * .5 + j * 2.1) * .06, Math.cos(t * .35 + j) * .05]);
  });
};

// -------------------------------------------------------------------- ember
const drawEmber = (c: FormCore, t: number, S: Strokes, P: Sprites) => {
  const { arch, pos, up, out, side, open, activity: a } = c;
  const petals = 7;
  c.anchors.length = 0;
  for (let k = 0; k < petals; k++) {
    const ang = (k / petals) * TAU + t * .12;
    const r = add(scale(side, Math.cos(ang)), scale(out, Math.sin(ang)));
    const tilt = .3 + .55 * open + .1 * Math.sin(t * 1.3 + k);
    const axis = norm(add(scale(up, Math.cos(tilt)), scale(r, Math.sin(tilt))));
    const wdir = norm(cross(axis, r));
    const length = .78 + .18 * Math.sin(t * .9 + k * 1.7) + .25 * a;
    const base = madd(pos, r, .1);
    const pts: V3[] = [];
    const N = 28;
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      const s = (1 - Math.cos(u * TAU)) / 2;
      const width = Math.pow(Math.sin(Math.PI * s), .8) * .2 * (1 - s * .35);
      const flick = noise3(k * 3.1, s * 4 - t * 2.4, u * 2) * .08 * s;
      pts.push(madd(madd(base, axis, s * length), wdir, width * (u < .5 ? 1 : -1) + flick));
    }
    S.path(pts, 1, (u, ink) => {
      const s = (1 - Math.cos(u * TAU)) / 2;
      paint(ink, palette(arch, 1 - s * .95), (.42 + .38 * a) * (1.15 - s * .5), 1.7 - s * .8);
    });
    c.anchors.push(madd(base, axis, length));
  }
  // molten heart: three tilted rings with flickering radii
  for (let ring = 0; ring < 3; ring++) {
    const n = rotate(up, side, .4 + ring * 1.0 + Math.sin(t * .4 + ring) * .25);
    const pts = ringPts(pos, rotate(n, up, t * (.5 + ring * .3)), .14 + ring * .07, 36, (q) => .2 * noise3(q * 2, t * 3, ring));
    S.path(pts, 1, (u, ink) => paint(ink, palette(arch, .7 + .3 * Math.sin(u * TAU * 2 + t)), .55 + .3 * a, 1.4));
  }
  P.add(pos, .55 + .25 * a + .1 * Math.sin(t * 7), palette(arch, .8), .45, SPRITE.glow);
};

const branchEmber = (c: FormCore, leaf: FormLeaf, t: number, S: Strokes, P: Sprites) => {
  const anchor = c.anchors[(leaf.j * 3) % c.anchors.length];
  const L = leaf.target;
  const d0 = norm(sub(anchor, c.pos));
  const c1 = madd(madd(anchor, d0, .8), c.up, .45);
  const c2 = madd(madd(L, c.up, -.4), c.side, .35 * Math.sin(c.seed + leaf.j));
  const N = 36;
  const pts: V3[] = [];
  let prev = anchor;
  for (let i = 0; i <= N; i++) {
    const s = i / N;
    const base = bezier(anchor, c1, c2, L, s);
    const tan = norm(sub(bezier(anchor, c1, c2, L, Math.min(1, s + .02)), prev));
    prev = base;
    const nrm = norm(cross(tan, c.up));
    const bin = cross(tan, nrm);
    const env = Math.sin(Math.PI * s) * (1 + .6 * leaf.activity);
    const sway = Math.sin(s * 7 - t * 2.6 + leaf.j * 1.9 + c.seed) * .12 * env;
    const sway2 = Math.cos(s * 5 - t * 1.9 + leaf.j) * .06 * env;
    pts.push(add(madd(base, nrm, sway), scale(bin, sway2)));
  }
  const glow = .55 + .4 * leaf.activity;
  const tip = S.path(pts, leaf.grow, (u, ink) => paint(ink, palette(c.arch, .1 + .9 * u), glow * (.7 + .3 * u), 3.4 * Math.pow(1 - u, .7) + .7));
  // curling tendrils peel off the main tentacle
  for (const [s0, dirSign] of [[.36, 1], [.64, -1]] as const) {
    const g = clamp((leaf.grow - s0) * 2.4);
    if (g <= 0) continue;
    const i0 = Math.round(s0 * N);
    const start = pts[i0];
    const tan = norm(sub(pts[i0 + 1], pts[i0]));
    const [e1, e2] = basis(tan);
    const spiral: V3[] = [];
    for (let i = 0; i <= 18; i++) {
      const q = i / 18;
      const ang = q * TAU * 1.5 * dirSign + t * 1.3 + c.seed;
      const r = .2 * (1 - q * .85);
      spiral.push(add(madd(start, tan, q * .12), add(scale(e1, Math.cos(ang) * r - r), scale(e2, Math.sin(ang) * r))));
    }
    S.path(spiral, g, (u, ink) => paint(ink, palette(c.arch, .05 + .3 * u), glow * .6, 1.3 - u * .9));
  }
  leaf.pos = tip;
};

// -------------------------------------------------------------------- bloom
const drawBloom = (c: FormCore, t: number, S: Strokes, P: Sprites) => {
  const { arch, pos, activity: a } = c;
  const r0 = .66 * (1 + .1 * a + .04 * Math.sin(t * 1.6));
  const surface = (d: V3): V3 => madd(pos, d, r0 * (1 + .16 * noise3(d[0] * 1.7 + t * .35, d[1] * 1.7, d[2] * 1.7 - t * .2) + .04 * Math.sin(t * 2 + d[1] * 6)));
  c.surface = surface;
  for (let i = 1; i <= 5; i++) {
    const phi = (i / 6) * Math.PI;
    const pts: V3[] = [];
    for (let k = 0; k <= 40; k++) {
      const th = (k / 40) * TAU + t * .1;
      pts.push(surface([Math.sin(phi) * Math.cos(th), Math.cos(phi), Math.sin(phi) * Math.sin(th)]));
    }
    S.path(pts, 1, (_u, ink) => paint(ink, palette(arch, i / 6), .26 + .3 * a, 1.1));
  }
  for (let k = 0; k < 6; k++) {
    const th = (k / 6) * Math.PI + t * .1;
    const pts: V3[] = [];
    for (let i = 0; i <= 32; i++) {
      const phi = (i / 32) * TAU;
      pts.push(surface([Math.sin(phi) * Math.cos(th), Math.cos(phi), Math.sin(phi) * Math.sin(th)]));
    }
    S.path(pts, 1, (u, ink) => paint(ink, palette(arch, .5 + .5 * Math.cos(u * TAU)), .16 + .2 * a, .9));
  }
  // nucleus: a slow 3D Lissajous knot
  const nuc: V3[] = [];
  for (let i = 0; i <= 90; i++) {
    const q = (i / 90) * TAU;
    nuc.push(add(pos, scale([Math.sin(3 * q + t * .7), Math.sin(2 * q + t * .4), Math.sin(5 * q)], .2 * (1 + .25 * a))));
  }
  S.path(nuc, 1, (u, ink) => paint(ink, palette(arch, .55 + .45 * u), .6 + .3 * a, 1.5));
  P.add(pos, .5 + .2 * a, palette(arch, .55), .35, SPRITE.glow);
};

const branchBloom = (c: FormCore, leaf: FormLeaf, t: number, S: Strokes, P: Sprites) => {
  const L = leaf.target;
  const dir = norm(sub(L, c.pos));
  const A = c.surface ? c.surface(dir) : madd(c.pos, dir, .7);
  const rand = rng(c.seed * 31 + leaf.j * 977 + 7);
  const K = 6;
  const knots: V3[] = [];
  for (let k = 0; k <= K; k++) {
    const jit = k === 0 || k === K ? 0 : .28 * Math.sin((Math.PI * k) / K);
    const off: V3 = [(rand() - .5) * 2 * jit, (rand() - .5) * 2 * jit, (rand() - .5) * 2 * jit];
    const drift: V3 = [noise3(k, t * .3, leaf.j) * .05, noise3(k + 9, t * .3, leaf.j) * .05, noise3(k + 19, t * .3, leaf.j) * .05];
    knots.push(add(add(lerp3(A, L, k / K), off), k === 0 || k === K ? [0, 0, 0] : drift));
  }
  const pts = catmull(knots, 6);
  const glow = .6 + .35 * leaf.activity;
  const tip = S.path(pts, leaf.grow, (u, ink) => paint(ink, palette(c.arch, .1 + .8 * u), glow, 2 - 1.2 * u));
  const main = norm(sub(L, A));
  for (let k = 1; k < K; k++) {
    for (let sideI = 0; sideI < 2; sideI++) {
      const chance = rand(), ax: V3 = [rand() - .5, rand() - .5, rand() - .5], angR = rand(), lenR = rand(), forkR = rand(), curlR = rand();
      if (chance > .78) continue;
      const g = clamp((leaf.grow - k / K) * 3);
      if (g <= 0) continue;
      const axis = norm(ax);
      const ang = (.55 + angR * .6) * (sideI ? 1 : -1);
      let tdir = rotate(main, axis, ang);
      const length = (.42 * (1 - k / K) + .16) * (.8 + lenR * .4);
      const start = knots[k];
      const twig: V3[] = [start];
      let p = start;
      for (let i = 1; i <= 6; i++) {
        tdir = rotate(tdir, axis, (curlR - .5) * .35 + Math.sin(t * .8 + k + i) * .03);
        p = madd(p, tdir, length / 6);
        twig.push(p);
      }
      const end = S.path(twig, g, (u, ink) => paint(ink, palette(c.arch, .3 + .6 * u), glow * .7, 1.2 - .7 * u));
      P.add(start, .06 * g, palette(c.arch, .7), .55, SPRITE.glow);
      if (forkR < .55 && g > .6) {
        const fdir = rotate(tdir, axis, ang * .9);
        const fork: V3[] = [end, madd(end, fdir, length * .25), madd(end, rotate(fdir, axis, ang * .3), length * .5)];
        S.path(fork, clamp((g - .6) * 2.5), (u, ink) => paint(ink, palette(c.arch, .8 + .2 * u), glow * .55, .9 - .5 * u));
      }
    }
  }
  leaf.pos = tip;
};

// ------------------------------------------------------------------ circuit
const CUBE: V3[] = [[-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]];
const EDGES = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
const X: V3 = [1, 0, 0];
const Y: V3 = [0, 1, 0];
const Z: V3 = [0, 0, 1];

const drawCircuit = (c: FormCore, t: number, S: Strokes, P: Sprites) => {
  const { arch, pos, up, side, activity: a } = c;
  c.anchors.length = 0;
  const spins: [number, number, number][] = [[t * .42, t * .27, .32], [-t * .3, t * .5, .5], [t * .15, -t * .21, .72 + .06 * a]];
  spins.forEach(([ry, rx, size], ci) => {
    const verts = CUBE.map((v) => add(pos, scale(rotate(rotate(v, Y, ry), X, rx), size)));
    const col = palette(arch, .2 + ci * .32);
    for (const [i, j] of EDGES) S.line(verts[i], verts[j], col, .5 + .3 * a, 1.3);
    if (ci === 2) c.anchors.push(...verts);
  });
  // inner octahedron
  const oct = [X, Y, Z, scale(X, -1), scale(Y, -1), scale(Z, -1)].map((v) => add(pos, scale(rotate(v, Y, -t * .9), .17)));
  const OE = [[0, 1], [0, 2], [0, 4], [0, 5], [3, 1], [3, 2], [3, 4], [3, 5], [1, 2], [2, 4], [4, 5], [5, 1]];
  for (const [i, j] of OE) S.line(oct[i], oct[j], palette(arch, .95), .75, 1.4);
  // HUD ring with ticks and sweeping arcs (horizontal plane)
  const R = 1.12 + .05 * a;
  S.path(ringPts(pos, Y, R, 72), 1, (_u, ink) => paint(ink, palette(arch, .3), .35 + .25 * a, 1));
  for (let k = 0; k < 48; k++) {
    const ang = (k / 48) * TAU + t * .15;
    const dir: V3 = [Math.cos(ang), 0, Math.sin(ang)];
    const long = k % 6 === 0;
    S.line(madd(pos, dir, R), madd(pos, dir, R + (long ? .17 : .06)), palette(arch, long ? .9 : .5), long ? .7 : .4, 1);
  }
  for (let k = 0; k < 3; k++) {
    const a0 = -t * .4 + (k * TAU) / 3;
    const arc: V3[] = [];
    for (let i = 0; i <= 12; i++) {
      const ang = a0 + (i / 12) * .62;
      arc.push(madd(pos, [Math.cos(ang), 0, Math.sin(ang)], 1.34));
    }
    S.path(arc, 1, (u, ink) => paint(ink, palette(arch, .7), .6 + .3 * a, 2.2 - u));
  }
  // vertical scanning ring
  const sy = Math.sin(t * 1.3) * .75;
  S.path(ringPts(madd(pos, up, sy), Y, .95 * Math.sqrt(1 - (sy / 1.1) ** 2), 40), 1, (_u, ink) => paint(ink, palette(arch, .85), .3, 1));
  // corner brackets framing the core
  const B = 1.05, l = .24;
  for (const sx of [-1, 1]) for (const syy of [-1, 1]) {
    const corner = add(madd(pos, side, sx * B), scale(up, syy * B * .8));
    S.line(corner, madd(corner, side, -sx * l), palette(arch, .6), .55 + .3 * a, 1.6);
    S.line(corner, madd(corner, up, -syy * l), palette(arch, .6), .55 + .3 * a, 1.6);
  }
  P.add(pos, .45 + .2 * a, palette(arch, .4), .3, SPRITE.glow);
};

const branchCircuit = (c: FormCore, leaf: FormLeaf, t: number, S: Strokes, P: Sprites) => {
  const L = leaf.target;
  let A = c.anchors[0];
  for (const v of c.anchors) if (dist(v, L) < dist(A, L)) A = v;
  const rand = rng(c.seed * 17 + leaf.j * 131 + 3);
  const perms = [[0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0]];
  const [o0, o1, o2] = perms[Math.floor(rand() * 6)];
  const p1: V3 = [...A]; p1[o0] = A[o0] + (L[o0] - A[o0]) * (.35 + rand() * .3);
  const p2: V3 = [...p1]; p2[o1] = L[o1];
  const p3: V3 = [...p2]; p3[o2] = L[o2];
  const route = [A, p1, p2, p3, L].filter((p, i, arr) => i === 0 || dist(p, arr[i - 1]) > 1e-3);
  // chamfer every corner at 45 degrees
  const pts: V3[] = [route[0]];
  const vias: V3[] = [];
  for (let i = 1; i < route.length - 1; i++) {
    const prev = route[i - 1], cur = route[i], next = route[i + 1];
    const cut = Math.min(.09, dist(prev, cur) / 2, dist(cur, next) / 2);
    pts.push(madd(cur, norm(sub(prev, cur)), cut), madd(cur, norm(sub(next, cur)), cut));
    vias.push(cur);
  }
  pts.push(route[route.length - 1]);
  const glow = .7 + .3 * leaf.activity;
  const tip = S.path(pts, leaf.grow, (u, ink) => paint(ink, palette(c.arch, .15 + .7 * u), glow, 1.6));
  if (leaf.j % 2 === 0) {
    const off: V3 = o0 === 1 ? [.05, 0, 0] : [0, .05, 0];
    S.path(pts.map((p) => add(p, off)), leaf.grow * .97, (u, ink) => paint(ink, palette(c.arch, .5 + .4 * u), glow * .35, .9));
  }
  const cum = S.measure(pts);
  const total = cum[pts.length - 1];
  vias.forEach((v, i) => {
    const at = cum[Math.min(pts.length - 1, 2 * i + 1)] / (total || 1);
    if (leaf.grow > at) P.add(v, .07, palette(c.arch, .9), .8, SPRITE.reticle, i + leaf.j);
  });
  for (let k = 0; k < 2; k++) {
    const s = (t * (.26 + .06 * k + .03 * leaf.j) + k * .5 + leaf.j * .37) % 1;
    if (s > leaf.grow - .03) continue;
    const head = pointAt(pts, S.measure(pts), s);
    const tail = pointAt(pts, S.measure(pts), Math.max(0, s - .05));
    S.line(tail, head, [.75, .7, 1], 0, 2.6, 1, 2.6);
    P.add(head, .07, palette(c.arch, .95), .9, SPRITE.spark, k);
  }
  leaf.pos = tip;
};

// --------------------------------------------------------------- dispatch
export const drawCore = (c: FormCore, t: number, S: Strokes, P: Sprites) => {
  if (c.arch.id === "ember") drawEmber(c, t, S, P);
  else if (c.arch.id === "bloom") drawBloom(c, t, S, P);
  else drawCircuit(c, t, S, P);
};

export const drawBranches = (c: FormCore, t: number, S: Strokes, P: Sprites) => {
  for (const leaf of c.leaves) {
    if (leaf.grow <= .001) {
      leaf.pos = c.pos;
      continue;
    }
    if (c.arch.id === "ember") branchEmber(c, leaf, t, S, P);
    else if (c.arch.id === "bloom") branchBloom(c, leaf, t, S, P);
    else branchCircuit(c, leaf, t, S, P);
    drawLeaf(c, leaf, P);
  }
};

const drawLeaf = (c: FormCore, leaf: FormLeaf, P: Sprites) => {
  const g = leaf.grow;
  const s = (.45 + .55 * g) * (1 + .5 * leaf.activity);
  if (c.arch.id === "ember") {
    P.add(madd(leaf.pos, c.up, .05 * s), .2 * s, leaf.rgb, .85, SPRITE.flame, leaf.j);
    P.add(leaf.pos, .34 * s, leaf.rgb, .35, SPRITE.glow);
  } else if (c.arch.id === "bloom") {
    P.add(leaf.pos, .16 * s, leaf.rgb, .95, SPRITE.bubble, leaf.j);
    P.add(leaf.pos, .3 * s, leaf.rgb, .25, SPRITE.glow);
  } else {
    P.add(leaf.pos, .2 * s, leaf.rgb, .95, SPRITE.reticle, leaf.j);
    P.add(leaf.pos, .26 * s, leaf.rgb, .3, SPRITE.glow);
  }
};
