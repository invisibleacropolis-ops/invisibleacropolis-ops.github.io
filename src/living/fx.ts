// Momentary and ambient effects plus the director that sequences them:
// flames, bubbles, clouds, sparks, ground waves with ripples, lightning arcs,
// reaching tentacles, screen-space scan sweeps and typed lock-on callouts.
import { palette, spectrum, wavelength, type Archetype, type FxKind } from "./color.ts";
import { paint, SPRITE, type Sprites, type Strokes } from "./batches.ts";
import { add, basis, bezier, clamp, dist, ease, lerp3, madd, norm, scale, sub, type V3 } from "./math.ts";

export type FxLeaf = { pos: V3; grow: number; title: string; hue: number };
export type FxCore = { index: number; arch: Archetype; name: string; pos: V3; up: V3; anchors: V3[]; open: number; leaves: FxLeaf[] };
export type Projection = { x: number; y: number; depth: number; visible: boolean };
export type FxContext = {
  t: number;
  dt: number;
  cores: FxCore[];
  width: number;
  height: number;
  motion: boolean;
  screenPoint: (nx: number, ny: number, depth: number) => V3;
  project: (p: V3) => Projection;
};

type Puff = { p: V3; v: V3; age: number; life: number; size: number; size1: number; rgb: V3; alpha: number; style: number; seed: number; kind: "flame" | "bubble" | "cloud" | "spark"; ambient?: boolean };
type Arc = { a: V3; b: V3; age: number; life: number; pts: V3[]; regen: number; rgbA: V3; rgbB: V3 };
type Tentacle = { core: FxCore; target: V3; age: number; life: number; seed: number };
type Lock = { target: () => V3; text: string; rgb: V3; age: number; life: number; el: HTMLElement | null; shown: number };

const rand = Math.random;
const randDir = (): V3 => norm([rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1]);
const pick = <T>(list: T[]): T => list[Math.floor(rand() * list.length)];

const SEQUENCES: FxKind[][] = [
  ["scan", "lock"], ["arc", "ripple"], ["flare", "clouds"], ["migrate", "bubbles"], ["tentacle", "arc"],
  ["clouds", "lock"], ["flare", "arc", "ripple"], ["bubbles", "tentacle"], ["scan", "migrate"], ["lock", "tentacle", "ripple"],
];

export class Fx {
  readonly boost = new Float32Array(3);     // ember, swarm, packet
  readonly migrate = new Float32Array(4);   // from, to, fraction, active
  lastEvent = "IDLE";
  private puffs: Puff[] = [];
  private arcs: Arc[] = [];
  private ripples: { x: number; z: number; age: number; amp: number }[] = [];
  private tentacles: Tentacle[] = [];
  private scans: { age: number; life: number }[] = [];
  private locks: Lock[] = [];
  private queue: { at: number; kind: FxKind }[] = [];
  private nextSequence = 4;
  private migrateLeft = 0;
  private emit = { flame: 0, bubble: 0 };

  constructor(private readonly layer: HTMLElement | null) {}

  private coreFor(ctx: FxContext, id: Archetype["id"]): FxCore | null {
    return ctx.cores.find((c) => c.arch.id === id) ?? (ctx.cores.length ? pick(ctx.cores) : null);
  }

  /** Fire one effect. `at` focuses it on a specific core where that makes sense. */
  trigger(kind: FxKind, ctx: FxContext, at?: FxCore | null, point?: V3) {
    if (!ctx.cores.length) return;
    this.lastEvent = kind.toUpperCase();
    switch (kind) {
      case "flare": {
        const core = at ?? this.coreFor(ctx, "ember")!;
        this.boost[0] = 1;
        for (let i = 0; i < 30; i++) this.spawnFlame(core, true);
        this.ripple(core.pos, .9);
        break;
      }
      case "bubbles": {
        const core = at ?? this.coreFor(ctx, "bloom")!;
        this.boost[1] = 1;
        for (let i = 0; i < 24; i++) this.spawnBubble(core);
        break;
      }
      case "scan": {
        this.scans.push({ age: 0, life: 1.7 });
        this.boost[2] = 1;
        break;
      }
      case "arc": {
        const a = at ?? pick(ctx.cores);
        let b: V3;
        if (point) b = point;
        else {
          const grown = a.leaves.filter((l) => l.grow > .8);
          const others = ctx.cores.filter((c) => c !== a);
          b = grown.length && rand() < .4 ? pick(grown).pos : others.length ? pick(others).pos : madd(a.pos, randDir(), 2);
        }
        const near = ctx.cores.reduce((best, c) => (dist(c.pos, b) < dist(best.pos, b) ? c : best), ctx.cores[0]);
        this.arcs.push({ a: a.pos, b, age: 0, life: .75, pts: [], regen: 0, rgbA: palette(a.arch, .7), rgbB: palette(near.arch, .4) });
        for (let i = 0; i < 6; i++) {
          this.puffs.push({ p: b, v: scale(randDir(), 1.5 + rand() * 2), age: 0, life: .35 + rand() * .3, size: .12, size1: .02, rgb: [1, 1, 1], alpha: .9, style: SPRITE.spark, seed: rand() * 9, kind: "spark" });
        }
        this.ripple(b, .7);
        break;
      }
      case "migrate": {
        const from = this.coreFor(ctx, "bloom")!;
        const others = ctx.cores.filter((c) => c !== from);
        if (!others.length) break;
        const to = at && at !== from ? at : pick(others);
        this.migrate.set([from.index, to.index, .45, 1]);
        this.migrateLeft = 5.5;
        break;
      }
      case "tentacle": {
        const core = at ?? pick(ctx.cores);
        const others = ctx.cores.filter((c) => c !== core);
        const target = point ?? (others.length && rand() < .7
          ? lerp3(core.pos, pick(others).pos, .62)
          : add(core.pos, [rand() * 2 - 1, 1.6 + rand(), rand() * 2 - 1]));
        this.tentacles.push({ core, target, age: 0, life: 3.4, seed: rand() * 100 });
        break;
      }
      case "ripple": {
        this.ripple(point ?? (at ?? pick(ctx.cores)).pos, 1.1);
        break;
      }
      case "clouds": {
        const core = at ?? pick(ctx.cores);
        for (let i = 0; i < 9; i++) this.spawnCloud(core, false);
        break;
      }
      case "lock": {
        const grown: { core: FxCore; leaf: FxLeaf }[] = [];
        ctx.cores.forEach((core) => core.leaves.forEach((leaf) => { if (leaf.grow > .85) grown.push({ core, leaf }); }));
        if (grown.length && rand() < .75) {
          const { core, leaf } = pick(grown);
          this.lock(() => leaf.pos, `LOCK :: ${leaf.title} :: λ${wavelength(leaf.hue)}NM`, palette(core.arch, .8));
        } else {
          const core = at ?? pick(ctx.cores);
          this.lock(() => core.pos, `CORE :: ${core.name} :: ${core.arch.name}`, palette(core.arch, .8));
        }
        break;
      }
    }
  }

  ripple(p: V3, amp: number) {
    this.ripples.push({ x: p[0], z: p[2], age: 0, amp });
    if (this.ripples.length > 8) this.ripples.shift();
  }

  lock(target: () => V3, text: string, rgb: V3) {
    let el: HTMLElement | null = null;
    if (this.layer) {
      el = document.createElement("div");
      el.className = "hud-callout";
      el.style.setProperty("--node", `rgb(${rgb.map((v) => Math.round(255 * Math.pow(clamp(v), 1 / 2.2))).join(" ")})`);
      el.setAttribute("aria-hidden", "true");
      this.layer.append(el);
    }
    this.locks.push({ target, text, rgb, age: 0, life: 3.4, el, shown: 0 });
    if (this.locks.length > 3) this.dropLock(this.locks.shift()!);
  }

  private dropLock(lock: Lock) { lock.el?.remove(); }

  private spawnFlame(core: FxCore, burst: boolean) {
    const anchor = core.anchors.length ? pick(core.anchors) : core.pos;
    const base = lerp3(core.pos, anchor, .3 + rand() * .7);
    this.puffs.push({
      p: add(base, scale(randDir(), .06)), v: add(scale(core.up, (burst ? 1.4 : .7) + rand() * .8), scale(randDir(), burst ? .5 : .15)),
      age: 0, life: (burst ? .8 : .6) + rand() * .6, size: (burst ? .3 : .2) * (.7 + rand() * .6), size1: .03,
      rgb: palette(core.arch, .25 + rand() * .75), alpha: burst ? .85 : .55, style: SPRITE.flame, seed: rand() * 9, kind: "flame",
    });
  }

  private spawnBubble(core: FxCore) {
    const d = randDir();
    this.puffs.push({
      p: madd(core.pos, d, .65), v: add(scale(core.up, .22 + rand() * .3), scale(d, .12)), age: 0, life: 3 + rand() * 2.5,
      size: .05 + rand() * .1, size1: .07 + rand() * .1, rgb: palette(core.arch, rand()), alpha: .8, style: SPRITE.bubble, seed: rand() * 9, kind: "bubble",
    });
  }

  private spawnCloud(core: FxCore, ambient: boolean) {
    const d = randDir();
    d[1] *= .4;
    this.puffs.push({
      p: madd(core.pos, d, 1.1 + rand() * 1.3), v: scale(randDir(), .06), age: 0, life: ambient ? 9 + rand() * 6 : 4 + rand() * 2,
      size: .9 + rand() * .6, size1: 1.8 + rand() * 1.2, rgb: palette(core.arch, rand()), alpha: ambient ? .045 : .09, style: SPRITE.cloud, seed: rand() * 50, kind: "cloud", ambient,
    });
  }

  /** Director + simulation step. */
  update(ctx: FxContext) {
    const { t, dt } = ctx;
    // the director: sequences of effects at irregular intervals
    if (ctx.motion && t > this.nextSequence) {
      let delay = 0;
      for (const kind of pick(SEQUENCES)) {
        this.queue.push({ at: t + delay, kind });
        delay += .7 + rand() * .9;
      }
      this.nextSequence = t + delay + 3 + rand() * 4;
    }
    for (let i = this.queue.length - 1; i >= 0; i--) {
      if (this.queue[i].at <= t) {
        this.trigger(this.queue[i].kind, ctx);
        this.queue.splice(i, 1);
      }
    }
    // ambient emitters tied to each archetype
    for (const core of ctx.cores) {
      if (core.arch.id === "ember") {
        this.emit.flame += dt * (8 + 26 * this.boost[0] + 10 * core.open);
        while (this.emit.flame >= 1) { this.emit.flame--; this.spawnFlame(core, false); }
      } else if (core.arch.id === "bloom") {
        this.emit.bubble += dt * (1.4 + 2 * core.open);
        while (this.emit.bubble >= 1) { this.emit.bubble--; this.spawnBubble(core); }
      }
    }
    const ambientClouds = this.puffs.filter((p) => p.ambient).length;
    if (ambientClouds < 12 && ctx.cores.length) this.spawnCloud(pick(ctx.cores), true);

    for (let i = 0; i < 3; i++) this.boost[i] = Math.max(0, this.boost[i] - dt * .7);
    if (this.migrateLeft > 0) {
      this.migrateLeft -= dt;
      if (this.migrateLeft <= 0) this.migrate[3] = 0;
    }
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i];
      p.age += dt;
      if (p.age >= p.life) {
        if (p.kind === "bubble") {
          this.puffs.push({ p: p.p, v: [0, 0, 0], age: 0, life: .25, size: p.size1 * 1.6, size1: p.size1 * .4, rgb: p.rgb, alpha: .8, style: SPRITE.spark, seed: p.seed, kind: "spark" });
        }
        this.puffs.splice(i, 1);
        continue;
      }
      if (p.kind === "flame") p.v = add(scale(p.v, Math.exp(-1.2 * dt)), [0, 1.6 * dt, 0]);
      if (p.kind === "bubble") p.p = add(p.p, [Math.sin(p.age * 3 + p.seed) * .14 * dt, 0, Math.cos(p.age * 2.6 + p.seed) * .14 * dt]);
      if (p.kind === "spark") p.v = scale(p.v, Math.exp(-4 * dt));
      p.p = madd(p.p, p.v, dt);
    }
    if (this.puffs.length > 900) this.puffs.splice(0, this.puffs.length - 900);
    for (const a of this.arcs) a.age += dt;
    this.arcs = this.arcs.filter((a) => a.age < a.life);
    for (const r of this.ripples) r.age += dt;
    this.ripples = this.ripples.filter((r) => r.age < 5);
    for (const tn of this.tentacles) tn.age += dt;
    this.tentacles = this.tentacles.filter((tn) => tn.age < tn.life);
    for (const s of this.scans) s.age += dt;
    this.scans = this.scans.filter((s) => s.age < s.life);
    for (const l of this.locks) l.age += dt;
    this.locks = this.locks.filter((l) => {
      if (l.age < l.life) return true;
      this.dropLock(l);
      return false;
    });
  }

  waveHeight(x: number, z: number, t: number) {
    let h = .14 * Math.sin(.55 * x + t * .8) * Math.cos(.45 * z - t * .6) + .07 * Math.sin(.8 * (x + z) - t * 1.1);
    for (const r of this.ripples) {
      const d = Math.hypot(x - r.x, z - r.z);
      const k = d - r.age * 3.2;
      h += r.amp * .35 * Math.exp(-k * k * 2.5) * Math.exp(-r.age * .9) * Math.cos(k * 4);
    }
    return h;
  }

  /** Ground waves: a breathing line grid tinted by the nearest core's band. */
  drawWaves(ctx: FxContext, S: Strokes) {
    const Y = -2.75, EXT = 9.5, LINES = 22, SEG = 44;
    const tint = (x: number, z: number): V3 => {
      let best = ctx.cores[0];
      let bd = Infinity;
      for (const c of ctx.cores) {
        const d = Math.hypot(c.pos[0] - x, c.pos[2] - z);
        if (d < bd) { bd = d; best = c; }
      }
      return best ? palette(best.arch, .5) : [.5, .5, .8];
    };
    for (let dir = 0; dir < 2; dir++) {
      for (let i = 0; i < LINES; i++) {
        const fixed = -EXT + (2 * EXT * i) / (LINES - 1);
        const pts: V3[] = [];
        for (let k = 0; k <= SEG; k++) {
          const v = -EXT + (2 * EXT * k) / SEG;
          const x = dir ? fixed : v;
          const z = dir ? v : fixed;
          pts.push([x, Y + this.waveHeight(x, z, ctx.t), z]);
        }
        S.path(pts, 1, (u, ink) => {
          const v = -EXT + 2 * EXT * u;
          const x = dir ? fixed : v;
          const z = dir ? v : fixed;
          const r = Math.hypot(x, z) / EXT;
          const h = Math.abs(this.waveHeight(x, z, ctx.t));
          paint(ink, tint(x, z), .09 * Math.max(0, 1 - r * r) * (1 + h * 5), .9);
        });
      }
    }
  }

  draw(ctx: FxContext, S: Strokes, P: Sprites) {
    const { t } = ctx;
    for (const p of this.puffs) {
      const k = p.age / p.life;
      const size = p.size + (p.size1 - p.size) * k;
      let a = p.alpha;
      if (p.kind === "flame") a *= Math.pow(1 - k, 1.2);
      else if (p.kind === "bubble") a *= clamp(k * 6) * clamp((1 - k) * 12);
      else if (p.kind === "cloud") a *= Math.pow(Math.sin(Math.PI * k), 1.5);
      else a *= 1 - k;
      P.add(p.p, size, p.rgb, a, p.style, p.seed);
    }

    // lightning: re-jagged every 50 ms
    for (const arc of this.arcs) {
      arc.regen -= ctx.dt;
      if (arc.regen <= 0 || !arc.pts.length) {
        arc.regen = .05;
        let pts: V3[] = [arc.a, arc.b];
        for (let level = 0; level < 5; level++) {
          const next: V3[] = [pts[0]];
          for (let i = 1; i < pts.length; i++) {
            const a = pts[i - 1], b = pts[i];
            const d = dist(a, b);
            next.push(madd(lerp3(a, b, .5), randDir(), d * .22), b);
          }
          pts = next;
        }
        arc.pts = pts;
      }
      const env = (1 - arc.age / arc.life) * (.6 + .4 * rand());
      S.path(arc.pts, 1, (u, ink) => paint(ink, lerp3(lerp3(arc.rgbA, arc.rgbB, u), [1, 1, 1], .55), env * 1.4, 2));
      S.path(arc.pts, 1, (u, ink) => paint(ink, lerp3(arc.rgbA, arc.rgbB, u), env * .25, 8));
      P.add(arc.a, .5, arc.rgbA, env * .6, SPRITE.glow);
      P.add(arc.b, .45, arc.rgbB, env * .8, SPRITE.spark, t);
    }

    // reaching tentacles
    for (const tn of this.tentacles) {
      const { core } = tn;
      const k = tn.age;
      const g = k < 1.1 ? ease(k / 1.1) : k > tn.life - 1.1 ? 1 - ease((k - (tn.life - 1.1)) / 1.1) : 1;
      let anchor = core.anchors[0] ?? core.pos;
      for (const v of core.anchors) if (dist(v, tn.target) < dist(anchor, tn.target)) anchor = v;
      const d0 = norm(sub(anchor, core.pos));
      const c1 = madd(anchor, d0, 1);
      const c2 = madd(tn.target, core.up, .8);
      const pts: V3[] = [];
      for (let i = 0; i <= 40; i++) {
        const s = i / 40;
        const base = bezier(anchor, c1, c2, tn.target, s);
        const [e1, e2] = basis(norm(sub(tn.target, anchor)));
        const env = Math.sin(Math.PI * s);
        pts.push(add(base, add(scale(e1, Math.sin(s * 9 - t * 3.2 + tn.seed) * .16 * env), scale(e2, Math.cos(s * 6 - t * 2.4) * .1 * env))));
      }
      const tip = S.path(pts, g, (u, ink) => paint(ink, palette(core.arch, .2 + .8 * u), .75, 4.4 * Math.pow(1 - u, .8) + .5));
      for (let i = 1; i < 8; i++) {
        const idx = Math.round((i / 8) * 40);
        if (i / 8 < g) P.add(pts[idx], .06 * (1 - i / 10), palette(core.arch, .9), .6, SPRITE.glow);
      }
      P.add(tip, .22, palette(core.arch, 1), .7, SPRITE.spark, tn.seed);
    }

    // screen-space sci-fi: scan sweeps
    for (const scan of this.scans) {
      const k = scan.age / scan.life;
      const y = 1 - 2.2 * ease(k);
      const env = Math.sin(Math.PI * clamp(k));
      const depth = 3;
      const col = spectrum(.78);
      S.line(ctx.screenPoint(-1.1, y, depth), ctx.screenPoint(1.1, y, depth), col, .7 * env, 1.2);
      for (let i = 1; i < 8; i++) {
        const yy = y + i * .012;
        S.line(ctx.screenPoint(-1.1, yy, depth), ctx.screenPoint(1.1, yy, depth), col, .1 * env * (1 - i / 8), 1);
      }
      for (let i = -10; i <= 10; i++) {
        const x = i / 10;
        S.line(ctx.screenPoint(x, y, depth), ctx.screenPoint(x, y - (i % 5 === 0 ? .05 : .02), depth), col, .6 * env, 1);
      }
      const b = .92, l = .07;
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
        const c = ctx.screenPoint(sx * b, sy * b, depth);
        S.line(c, ctx.screenPoint(sx * (b - l), sy * b, depth), col, .8 * env, 1.6);
        S.line(c, ctx.screenPoint(sx * b, sy * (b - l * ctx.width / ctx.height), depth), col, .8 * env, 1.6);
      }
    }

    // lock-on callouts: brackets converge, an angular leader, typed text
    for (const lock of this.locks) {
      const target = lock.target();
      const pr = ctx.project(target);
      const fade = clamp((lock.life - lock.age) / .4);
      if (!pr.visible) { if (lock.el) lock.el.style.opacity = "0"; continue; }
      const k = ease(lock.age / .45);
      const sizePx = 110 + (30 - 110) * k;
      const rot = (1 - k) * Math.PI / 4;
      const depth = pr.depth * .97;
      const toN = (x: number, y: number): V3 => ctx.screenPoint((x / ctx.width) * 2 - 1, 1 - (y / ctx.height) * 2, depth);
      for (let q = 0; q < 4; q++) {
        const ang = rot + q * Math.PI / 2 + Math.PI / 4;
        const cx = pr.x + Math.cos(ang) * sizePx * .7071;
        const cy = pr.y + Math.sin(ang) * sizePx * .7071;
        const a1 = ang + Math.PI * .75, a2 = ang - Math.PI * .75;
        const arm = sizePx * .35;
        S.line(toN(cx, cy), toN(cx + Math.cos(a1) * arm, cy + Math.sin(a1) * arm), lock.rgb, .9 * fade, 1.6);
        S.line(toN(cx, cy), toN(cx + Math.cos(a2) * arm, cy + Math.sin(a2) * arm), lock.rgb, .9 * fade, 1.6);
      }
      const ex = pr.x + 26 + 44, ey = pr.y - 26 - 44;
      if (lock.age > .35) {
        const lead = clamp((lock.age - .35) / .3);
        const mid: [number, number] = [pr.x + 26 + 44 * lead, pr.y - 26 - 44 * lead];
        S.line(toN(pr.x + 22, pr.y - 22), toN(mid[0], mid[1]), lock.rgb, .8 * fade, 1.2);
        if (lead >= 1) S.line(toN(ex, ey), toN(ex + 150, ey), lock.rgb, .8 * fade, 1.2);
      }
      if (lock.el) {
        const wantChars = lock.age > .65 ? lock.text.length * clamp((lock.age - .65) / .55) * fade : 0;
        const n = Math.floor(wantChars);
        if (n !== lock.shown) {
          lock.shown = n;
          lock.el.textContent = lock.text.slice(0, n) + (n < lock.text.length && n > 0 ? "▌" : "");
        }
        lock.el.style.transform = `translate3d(${(ex + 4).toFixed(1)}px, ${(ey - 16).toFixed(1)}px, 0)`;
        lock.el.style.opacity = String(fade);
      }
    }
  }
}
