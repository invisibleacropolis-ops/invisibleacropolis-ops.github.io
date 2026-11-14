// The living index. Each directory category becomes a core with its own form,
// band of the spectrum, branching language and effects. Browsing a core makes
// it branch out, from its current shape, to the pages it contains. A director
// keeps sequencing momentary effects so the field never settles.
import { createEngine, type FrameState } from "./engine.ts";
import { MAX_CORES, MAX_LEAVES } from "./glsl.ts";
import { Sprites, Strokes } from "./batches.ts";
import { archetypeFor, bandHue, css, spectrum, wavelength } from "./color.ts";
import { drawBranches, drawCore, layoutLeaves, type FormCore, type FormLeaf } from "./forms.ts";
import { Fx, type FxContext, type Projection } from "./fx.ts";
import { add, clamp, cross, damp, dot, madd, norm, scale, sub, TAU, type V3 } from "./math.ts";

export type LivingController = { refreshRoutes: () => void };

const SCRAMBLE = "▓▒░<>/\\|=+*#%01ΛΣΞ";
class Typer {
  private shown = 0;
  private last = "";
  constructor(private readonly el: HTMLElement, public text: string, private readonly inRate = 34, private readonly outRate = 70) {}
  update(want: boolean, dt: number) {
    const goal = want ? this.text.length : 0;
    if (this.shown === goal && this.last.length === goal) return;
    this.shown = goal > this.shown ? Math.min(goal, this.shown + dt * this.inRate) : Math.max(goal, this.shown - dt * this.outRate);
    const n = Math.floor(this.shown);
    const out = this.text.slice(0, n) + (n < goal ? SCRAMBLE[(Math.random() * SCRAMBLE.length) | 0] : "");
    if (out !== this.last) {
      this.el.textContent = out;
      this.last = out;
    }
    this.el.classList.toggle("is-typing", n !== goal);
  }
}

interface Leaf extends FormLeaf {
  link: HTMLAnchorElement;
  title: string;
  hue: number;
  index: number;
  core: Core;
  label: HTMLAnchorElement;
  typer: Typer;
  tick: HTMLElement;
  sx: number;
  sy: number;
  depth: number;
  visible: boolean;
}

interface Core extends Omit<FormCore, "leaves"> {
  key: string;
  name: string;
  index: number;
  base: V3;
  angle: number;
  ring: number;
  leaves: Leaf[];
  label: HTMLButtonElement;
  nameTyper: Typer;
  subTyper: Typer;
  sx: number;
  sy: number;
  depth: number;
  visible: boolean;
  radiusPx: number;
  signatureAt: number;
  wasOpen: boolean;
}

type SelectSource = "pointer" | "label" | "directory" | "focus";

export const createLivingIndex = (canvas: HTMLCanvasElement): LivingController | null => {
  const layer = document.querySelector<HTMLElement>("#node-layer");
  const calloutLayer = document.querySelector<HTMLElement>("#callout-layer");
  const ticks = document.querySelector<HTMLElement>("#spectrum-ticks");
  const cats = document.querySelector<HTMLElement>("#spectrum-cats");
  const directory = document.querySelector<HTMLElement>("#destinations");
  const ticker = document.querySelector<HTMLElement>("#ticker");
  const telemetry = document.querySelector<HTMLElement>("#telemetry");
  const brand = document.querySelector<HTMLElement>("#brand-name");
  const motionButton = document.querySelector<HTMLButtonElement>("#toggle-motion");
  const fallback = document.querySelector<HTMLElement>("#webgl-fallback");
  const card = {
    root: document.querySelector<HTMLElement>("#metadata-card"),
    close: document.querySelector<HTMLButtonElement>("#metadata-close"),
    enter: document.querySelector<HTMLAnchorElement>("#metadata-enter"),
    enterLabel: document.querySelector<HTMLElement>("#metadata-enter-label"),
    fields: ["title-key", "title", "class-key", "class", "address-key", "address", "band-key", "band", "vector-key", "vector"]
      .map((id) => document.querySelector<HTMLElement>(`#metadata-${id}`)),
  };

  const coarse = matchMedia("(pointer: coarse)").matches;
  const side = coarse || innerWidth < 900 ? 256 : 512;
  const strokes = new Strokes(16384);
  const sprites = new Sprites(3072);
  const failed = (error?: unknown) => {
    if (error) console.warn("Living index unavailable", error);
    document.body.classList.add("no-webgl");
    if (fallback) fallback.hidden = false;
  };
  let created: ReturnType<typeof createEngine> = null;
  try {
    created = createEngine(canvas, side, strokes.capacity, sprites.capacity);
  } catch (error) {
    failed(error);
    return null;
  }
  if (!created) {
    failed();
    return null;
  }
  const gpu = created;
  const fx = new Fx(calloutLayer);

  // ------------------------------------------------------------ motion prefs
  let motionOn = !matchMedia("(prefers-reduced-motion: reduce)").matches;
  const syncMotion = () => {
    if (!motionButton) return;
    motionButton.setAttribute("aria-pressed", String(motionOn));
    motionButton.querySelector("b")!.textContent = motionOn ? "ON" : "LOW";
  };
  motionButton?.addEventListener("click", () => { motionOn = !motionOn; syncMotion(); });
  syncMotion();

  // ----------------------------------------------------------- interaction
  let cores: Core[] = [];
  let leaves: Leaf[] = [];
  let pinned: Core | null = null;
  let browsing: Core | null = null;
  let browseIdle = 0;
  let hoverLeaf: Leaf | null = null;
  let hoverCore: Core | null = null;
  let labelLeaf: Leaf | null = null;
  let labelCore: Core | null = null;
  let selected: Leaf | null = null;
  let lastCtx: FxContext | null = null;
  let clock = 0;

  // ------------------------------------------------------------------ card
  let cardFrame = 0;
  const hideCard = () => {
    cancelAnimationFrame(cardFrame);
    if (card.root) card.root.hidden = true;
  };
  const typeCard = (values: string[], color: string, href: string | null, enterText: string) => {
    const { root, enter, enterLabel, fields } = card;
    if (!root || !enter || !enterLabel || fields.some((f) => !f)) return;
    cancelAnimationFrame(cardFrame);
    root.style.setProperty("--node", color);
    enter.hidden = !href;
    if (href) enter.href = href;
    root.hidden = false;
    const pairs: [HTMLElement, string][] = fields.map((el, i) => [el!, values[i]]);
    if (href) pairs.push([enterLabel, enterText]);
    pairs.forEach(([el, value]) => {
      el.replaceChildren();
      el.setAttribute("aria-label", value);
      el.classList.remove("metadata-cursor");
    });
    const steps: ({ el: HTMLElement; ch: string } | null)[] = [];
    pairs.forEach(([el, value], i) => {
      for (const ch of value) steps.push({ el, ch });
      if (i < pairs.length - 1) steps.push(null);
    });
    let cursor = 0;
    let field: HTMLElement | null = null;
    const started = performance.now();
    const type = (now: number) => {
      const goal = Math.min(steps.length, Math.floor((now - started) / 7) + 1);
      while (cursor < goal) {
        const step = steps[cursor++];
        if (!step) continue;
        if (field !== step.el) {
          field?.classList.remove("metadata-cursor");
          field = step.el;
          field.classList.add("metadata-cursor");
        }
        const glyph = document.createElement("span");
        glyph.className = "metadata-glyph";
        glyph.setAttribute("aria-hidden", "true");
        glyph.textContent = step.ch;
        step.el.append(glyph);
      }
      if (cursor < steps.length) cardFrame = requestAnimationFrame(type);
      else field?.classList.remove("metadata-cursor");
    };
    cardFrame = requestAnimationFrame(type);
  };
  const vec = (p: V3) => p.map((v) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}`).join(" / ");
  const showLeafCard = (leaf: Leaf) => {
    const url = new URL(leaf.link.href);
    typeCard([
      "TITLE", leaf.title,
      "CORE", `${leaf.core.name} / ${leaf.core.arch.name}`,
      "ADDRESS", url.pathname + url.search,
      "BAND", `λ ${wavelength(leaf.hue)} NM`,
      "VECTOR", vec(leaf.pos),
    ], css(leaf.rgb), leaf.link.href, "ENTER PAGE ↗");
    card.enter?.setAttribute("aria-label", `Enter ${leaf.title}`);
  };
  const showCoreCard = (core: Core) => {
    const [lo, hi] = core.arch.hue;
    typeCard([
      "CORE", core.name,
      "FORM", core.arch.name,
      "BRANCHES", `${core.leaves.length} ${core.arch.branch}`,
      "BAND", `λ ${wavelength(hi)}–${wavelength(lo)} NM`,
      "VECTOR", vec(core.pos),
    ], css(spectrum(bandHue(core.arch, .55))), null, "");
  };
  card.close?.addEventListener("click", () => clearAll());

  // ------------------------------------------------------------- selection
  const camAim = { yaw: null as number | null };
  const signature = (core: Core) => {
    if (!lastCtx || clock - core.signatureAt < 3.5) return;
    core.signatureAt = clock;
    fx.trigger(core.arch.signature, lastCtx, core);
  };
  const markActive = () => {
    leaves.forEach((l) => {
      const on = l === selected;
      l.label.classList.toggle("is-active", on);
      l.link.classList.toggle("is-node-active", on);
      l.tick.classList.toggle("is-active", on);
    });
    cores.forEach((c) => c.label.classList.toggle("is-pinned", c === pinned));
  };
  const selectLeaf = (leaf: Leaf | null, source: SelectSource | null) => {
    if (leaf === selected) return;
    selected = leaf;
    if (leaf) {
      pinned = leaf.core;
      showLeafCard(leaf);
      fx.lock(() => leaf.pos, `LOCK :: ${leaf.title} :: λ${wavelength(leaf.hue)}NM`, leaf.rgb);
      fx.ripple(leaf.pos, .8);
      if (source !== "pointer") camAim.yaw = Math.atan2(leaf.core.pos[0], leaf.core.pos[2]) + .8;
    } else hideCard();
    markActive();
  };
  const togglePin = (core: Core) => {
    if (pinned === core && !selected) {
      pinned = null;
      hideCard();
      markActive();
      return;
    }
    selected = null;
    pinned = core;
    browsing = core;
    showCoreCard(core);
    signature(core);
    camAim.yaw = Math.atan2(core.pos[0], core.pos[2]) + .8;
    markActive();
  };
  const clearAll = () => {
    pinned = null;
    browsing = null;
    selectLeaf(null, null);
    markActive();
  };

  // ---------------------------------------------------------------- routes
  const refreshRoutes = () => {
    layer?.replaceChildren();
    ticks?.replaceChildren();
    cats?.replaceChildren();
    const keepPinned = pinned?.key;
    const keepSelected = selected?.link.href;
    pinned = browsing = null;
    selected = hoverLeaf = labelLeaf = null;
    hoverCore = labelCore = null;
    cores = [];
    leaves = [];
    const groups = Array.from(document.querySelectorAll<HTMLElement>("#destinations .route-group")).slice(0, MAX_CORES);
    const count = groups.length;
    groups.forEach((group, ci) => {
      const heading = group.querySelector("h2");
      const key = (heading?.id || `group-${ci}`).replace(/-label$/, "");
      const name = (heading?.firstChild?.textContent || key).trim().toUpperCase();
      const arch = archetypeFor(key, ci);
      const ang = Math.PI / 2 + (ci - (count - 1) / 2) * (TAU / Math.max(count, 3));
      const radius = count === 1 ? 0 : 3.3;
      const base: V3 = [Math.cos(ang) * radius, [.35, -.15, .45, 0, .25, -.3][ci % 6], Math.sin(ang) * radius];
      const up: V3 = [0, 1, 0];
      const out: V3 = radius ? norm([base[0], 0, base[2]]) : [0, 0, 1];
      const sideV = cross(up, out);
      const color = css(spectrum(bandHue(arch, .55)));

      const label = document.createElement("button");
      label.type = "button";
      label.className = "core-label";
      label.style.setProperty("--node", color);
      const nameEl = document.createElement("span");
      nameEl.className = "core-name";
      const subEl = document.createElement("span");
      subEl.className = "core-sub";
      label.append(nameEl, subEl);
      layer?.append(label);

      const links = Array.from(group.querySelectorAll<HTMLAnchorElement>(".route"));
      label.setAttribute("aria-label", `${name} core: ${arch.name}, ${links.length} destinations`);
      const core: Core = {
        arch, pos: [...base], base, up, out, side: sideV, open: .14, activity: 0, seed: (Math.random() * 1e9) | 0,
        anchors: [], leaves: [], key, name, index: ci, label, angle: ang, ring: radius,
        nameTyper: new Typer(nameEl, name, 20, 60),
        subTyper: new Typer(subEl, `${arch.name} · ${links.length} ${arch.branch}`, 40, 90),
        sx: 0, sy: 0, depth: 1, visible: false, radiusPx: 0, signatureAt: -10, wasOpen: false,
      };
      label.addEventListener("click", () => togglePin(core));
      label.addEventListener("pointerenter", () => { labelCore = core; });
      label.addEventListener("pointerleave", () => { if (labelCore === core) labelCore = null; });
      label.addEventListener("focus", () => { browsing = core; });

      if (cats) {
        const band = document.createElement("span");
        band.className = "spectrum-cat";
        band.style.left = `${arch.hue[0] * 100}%`;
        band.style.width = `${(arch.hue[1] - arch.hue[0]) * 100}%`;
        band.style.setProperty("--node", color);
        band.textContent = name;
        band.addEventListener("pointerenter", () => { labelCore = core; });
        band.addEventListener("pointerleave", () => { if (labelCore === core) labelCore = null; });
        band.addEventListener("click", () => togglePin(core));
        cats.append(band);
      }

      links.forEach((link, j) => {
        if (leaves.length >= MAX_LEAVES) return;
        const n = links.length;
        const hue = bandHue(arch, (j + .5) / n);
        const rgb = spectrum(hue);
        const title = (link.querySelector(".route-name")?.textContent?.trim() || link.textContent?.trim() || "UNTITLED").toUpperCase();
        const number = String(leaves.length + 1).padStart(2, "0");
        const nodeColor = css(rgb);
        link.style.setProperty("--node", nodeColor);

        const leafLabel = document.createElement("a");
        leafLabel.className = "node-label is-hidden";
        leafLabel.href = link.href;
        leafLabel.style.setProperty("--node", nodeColor);
        leafLabel.setAttribute("aria-label", `${title}, in ${name}`);
        const num = document.createElement("span");
        num.className = "node-num";
        num.textContent = number;
        const nameSpan = document.createElement("span");
        nameSpan.className = "node-name";
        nameSpan.setAttribute("aria-hidden", "true");
        leafLabel.append(num, nameSpan);
        layer?.append(leafLabel);

        const tick = document.createElement("span");
        tick.className = "spectrum-tick";
        tick.style.left = `${hue * 100}%`;
        tick.style.setProperty("--node", nodeColor);
        tick.textContent = number;
        ticks?.append(tick);

        const leaf: Leaf = {
          j, n, target: [...base], pos: [...base], grow: 0, activity: 0, rgb,
          link, title, hue, index: leaves.length, core, label: leafLabel, typer: new Typer(nameSpan, title), tick,
          sx: 0, sy: 0, depth: 1, visible: false,
        };
        leafLabel.addEventListener("click", (event) => {
          if (selected !== leaf) { event.preventDefault(); selectLeaf(leaf, "label"); }
        });
        leafLabel.addEventListener("focus", () => selectLeaf(leaf, "focus"));
        leafLabel.addEventListener("pointerenter", () => { labelLeaf = leaf; });
        leafLabel.addEventListener("pointerleave", () => { if (labelLeaf === leaf) labelLeaf = null; });
        tick.addEventListener("pointerenter", () => { labelLeaf = leaf; });
        tick.addEventListener("pointerleave", () => { if (labelLeaf === leaf) labelLeaf = null; });
        tick.addEventListener("click", () => selectLeaf(leaf, "directory"));
        link.onpointerenter = () => { labelLeaf = leaf; };
        link.onpointerleave = () => { if (labelLeaf === leaf) labelLeaf = null; };
        link.onfocus = () => selectLeaf(leaf, "directory");
        core.leaves.push(leaf);
        leaves.push(leaf);
      });
      cores.push(core);
    });
    pinned = cores.find((c) => c.key === keepPinned) ?? null;
    const again = leaves.find((l) => l.link.href === keepSelected);
    if (again) selectLeaf(again, "directory");
    markActive();
  };

  // ---------------------------------------------------------------- camera
  const cam = { yaw: .55, pitch: .3, dist: 18, zoom: 1, yawVel: 0, pitchVel: 0, target: [0, .1, 0] as V3 };
  const FOV = 50 * Math.PI / 180;
  const tanH = Math.tan(FOV / 2);
  let eye: V3 = [0, 0, 1];
  let fwd: V3 = [0, 0, -1];
  let right: V3 = [1, 0, 0];
  let up: V3 = [0, 1, 0];
  let aspect = 1;
  const proj = new Float32Array(16);
  const view = new Float32Array(16);
  const updateCamera = () => {
    const cp = Math.cos(cam.pitch);
    eye = add(cam.target, [cam.dist * cp * Math.sin(cam.yaw), cam.dist * Math.sin(cam.pitch), cam.dist * cp * Math.cos(cam.yaw)]);
    fwd = norm(sub(cam.target, eye));
    right = norm(cross(fwd, [0, 1, 0]));
    up = cross(right, fwd);
    view.set([right[0], up[0], -fwd[0], 0, right[1], up[1], -fwd[1], 0, right[2], up[2], -fwd[2], 0, -dot(right, eye), -dot(up, eye), dot(fwd, eye), 1]);
    const f = 1 / tanH;
    const near = .05, far = 80, nf = 1 / (near - far);
    proj.set([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
  };
  const ndc = (p: V3, e: V3, r: V3, u: V3, f: V3): [number, number, number] => {
    const d = sub(p, e);
    const z = dot(d, f);
    return [dot(d, r) / (z * tanH * aspect), dot(d, u) / (z * tanH), z];
  };
  let width = 0;
  let height = 0;
  const project = (p: V3): Projection => {
    const [x, y, z] = ndc(p, eye, right, up, fwd);
    return { x: (x + 1) / 2 * width, y: (1 - y) / 2 * height, depth: z, visible: z > .2 && Math.abs(x) < 1.15 && Math.abs(y) < 1.15 };
  };
  const screenPoint = (nx: number, ny: number, depth: number): V3 =>
    add(add(madd(eye, fwd, depth), scale(right, nx * depth * tanH * aspect)), scale(up, ny * depth * tanH));

  // --------------------------------------------------------------- pointer
  const pointer = { x: innerWidth / 2, y: innerHeight / 2, inside: false, down: false, dragging: false, downX: 0, downY: 0, downT: 0, lastX: 0, lastY: 0, speed: 0, idle: 0, id: -1 };
  let press = 0;
  const shock = { at: [0, 0, 0] as V3, age: -1 };
  let focusPoint: V3 = [0, 0, 0];
  const pick = (): [Leaf | null, Core | null] => {
    let leafHit: Leaf | null = null;
    let best = coarse ? 40 : 28;
    for (const l of leaves) {
      if (!l.visible) continue;
      const d = Math.hypot(l.sx - pointer.x, l.sy - pointer.y);
      if (d < best) { best = d; leafHit = l; }
    }
    let coreHit: Core | null = null;
    let bestCore = Infinity;
    for (const c of cores) {
      if (!c.visible) continue;
      const d = Math.hypot(c.sx - pointer.x, c.sy - pointer.y);
      if (d < c.radiusPx * .9 && d < bestCore) { bestCore = d; coreHit = c; }
    }
    return [leafHit, coreHit];
  };

  window.addEventListener("pointermove", (event) => {
    const dx = event.clientX - pointer.lastX;
    const dy = event.clientY - pointer.lastY;
    pointer.speed = Math.max(pointer.speed, Math.hypot(dx, dy) * 60);
    pointer.x = pointer.lastX = event.clientX;
    pointer.y = pointer.lastY = event.clientY;
    pointer.idle = 0;
    pointer.inside = !(event.target instanceof Node && directory?.contains(event.target));
    if (pointer.down && event.pointerId === pointer.id) {
      if (!pointer.dragging && Math.hypot(event.clientX - pointer.downX, event.clientY - pointer.downY) > 7) pointer.dragging = true;
      if (pointer.dragging) {
        cam.yawVel = -dx * .006 * 60;
        cam.pitchVel = dy * .0045 * 60;
        cam.yaw -= dx * .006;
        cam.pitch = clamp(cam.pitch + dy * .0045, -1.2, 1.2);
        camAim.yaw = null;
      }
    }
  }, { passive: true });
  document.addEventListener("pointerleave", () => { pointer.inside = false; });
  canvas.addEventListener("pointerdown", (event) => {
    pointer.down = true;
    pointer.dragging = false;
    pointer.id = event.pointerId;
    pointer.downX = pointer.lastX = pointer.x = event.clientX;
    pointer.downY = pointer.lastY = pointer.y = event.clientY;
    pointer.downT = performance.now();
    pointer.inside = true;
    pointer.idle = 0;
    canvas.setPointerCapture(event.pointerId);
  });
  const release = (event: PointerEvent) => {
    if (!pointer.down || event.pointerId !== pointer.id) return;
    const held = performance.now() - pointer.downT;
    if (!pointer.dragging && held < 300) {
      const [leafHit, coreHit] = pick();
      if (leafHit) {
        if (selected === leafHit) location.assign(leafHit.link.href);
        else selectLeaf(leafHit, "pointer");
      } else if (coreHit) togglePin(coreHit);
      else {
        shock.at = focusPoint;
        shock.age = 0;
        if (lastCtx && cores.length) {
          const near = cores.reduce((a, b) => (Math.hypot(...sub(a.pos, focusPoint)) < Math.hypot(...sub(b.pos, focusPoint)) ? a : b));
          fx.trigger("arc", lastCtx, near, focusPoint);
        }
        clearAll();
      }
    }
    pointer.down = false;
    pointer.dragging = false;
    if (coarse) pointer.inside = false;
  };
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);
  canvas.addEventListener("wheel", (event) => {
    event.preventDefault();
    cam.zoom = clamp(cam.zoom * Math.exp(event.deltaY * .0011), .45, 1.5);
  }, { passive: false });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && directory?.hidden !== false) clearAll();
  });

  // ---------------------------------------------------------------- ticker
  const phrases = () => [
    "NOTHING HERE IS MODELED. EVERYTHING IS COMPUTED.",
    `${cores.length} CORES · EACH GROWS ITS OWN WAY TOWARD ITS PAGES.`,
    cores.map((c) => `${c.arch.name} → ${c.arch.branch}`).join(" · ") + ".",
    coarse ? "TAP A CORE TO BRANCH · TAP A BRANCH TO READ · TAP AGAIN TO ENTER." : "HOVER A CORE TO BRANCH · CLICK TO PIN · HOLD TO GATHER · DRAG TO ORBIT.",
    `${gpu.agents.toLocaleString("en-US")} AGENTS · ${leaves.length} DESTINATIONS · 700 → 400 NM.`,
  ];
  const tick = { index: 0, shown: 0, hold: 0, deleting: false, text: "" };
  const runTicker = (dt: number) => {
    if (!ticker) return;
    const list = phrases();
    const text = list[tick.index % list.length];
    if (!tick.deleting) {
      tick.shown = Math.min(text.length, tick.shown + dt * 42);
      if (tick.shown >= text.length && (tick.hold += dt) > 3.6) tick.deleting = true;
    } else {
      tick.shown = Math.max(0, tick.shown - dt * 95);
      if (tick.shown === 0) { tick.deleting = false; tick.hold = 0; tick.index++; }
    }
    const out = text.slice(0, Math.floor(tick.shown));
    if (out !== tick.text) { ticker.textContent = out; tick.text = out; }
  };
  const brandTyper = brand ? new Typer(brand, brand.dataset.text ?? "INVISIBLE ACROPOLIS", 22, 60) : null;

  // ------------------------------------------------------------------ loop
  let pixelRatio = Math.min(devicePixelRatio || 1, 1.5);
  const resize = () => {
    width = canvas.clientWidth || innerWidth;
    height = canvas.clientHeight || innerHeight;
    gpu.resize(width * pixelRatio, height * pixelRatio);
  };
  new ResizeObserver(resize).observe(canvas);
  resize();

  const coreData = new Float32Array(MAX_CORES * 4);
  const coreHue = new Float32Array(MAX_CORES);
  const leafData = new Float32Array(MAX_LEAVES * 4);
  const slots = new Float32Array(3);
  const shockData = new Float32Array(4);
  const labelY = new Map<Leaf, number>();
  let simTime = 0;
  let last = performance.now();
  let quality = coarse ? .75 : 1;
  let frameEma = 16;
  let slowFor = 0;
  let fastFor = 0;
  let fpsFrames = 0;
  let fpsTime = 0;
  let fps = 60;
  let running = true;

  const frame = (now: number) => {
    const rawDt = Math.min(.05, Math.max(.001, (now - last) / 1000));
    last = now;
    clock += rawDt;
    const dt = rawDt * (motionOn ? 1 : .35);
    simTime += dt;

    frameEma = frameEma * .95 + rawDt * 1000 * .05;
    if (frameEma > 24) { slowFor += rawDt; fastFor = 0; } else if (frameEma < 15) { fastFor += rawDt; slowFor = 0; } else { slowFor = fastFor = 0; }
    if (slowFor > 1.5 && quality > .3) {
      quality *= .8; slowFor = 0;
      if (quality < .55 && pixelRatio > 1) { pixelRatio = 1; resize(); }
    }
    if (fastFor > 4 && quality < 1) { quality = Math.min(1, quality * 1.15); fastFor = 0; }
    fpsFrames++; fpsTime += rawDt;
    if (fpsTime > .5) { fps = Math.round(fpsFrames / fpsTime); fpsFrames = 0; fpsTime = 0; }

    // camera: eases toward the pinned core, otherwise orbits the whole field
    const prev = { e: eye, r: right, u: up, f: fwd, t: [...cam.target] as V3 };
    aspect = width / Math.max(1, height);
    // frame the opened structure: the core plus where its branches are heading
    let goalTarget: V3 = [0, .1, 0];
    if (pinned) {
      let sum: V3 = scale(pinned.pos, 2);
      for (const l of pinned.leaves) sum = add(sum, l.target);
      goalTarget = scale(sum, 1 / (pinned.leaves.length + 2));
    }
    for (let k = 0; k < 3; k++) cam.target[k] = damp(cam.target[k], goalTarget[k], 2, rawDt);
    const fit = Math.min(1.6, Math.max(1, .95 / Math.sqrt(aspect)));
    cam.dist = damp(cam.dist, (pinned ? 7.4 : 12) * fit * cam.zoom, clock < 4 ? 1 : 2.6, rawDt);
    if (!pointer.dragging) {
      cam.yaw += cam.yawVel * rawDt;
      cam.pitch = clamp(cam.pitch + cam.pitchVel * rawDt, -1.2, 1.2);
      cam.yawVel = damp(cam.yawVel, motionOn && !pinned ? .04 : 0, 1.6, rawDt);
      cam.pitchVel = damp(cam.pitchVel, 0, 2.2, rawDt);
      cam.pitch = damp(cam.pitch, .3, .25, rawDt);
      if (camAim.yaw !== null) {
        const delta = Math.atan2(Math.sin(camAim.yaw - cam.yaw), Math.cos(camAim.yaw - cam.yaw));
        cam.yaw += delta * (1 - Math.exp(-2.5 * rawDt));
        if (Math.abs(delta) < .01) camAim.yaw = null;
      }
    }
    updateCamera();
    const shift: [number, number] = [0, 0];
    if (clock > .1) {
      for (const offset of [scale(prev.r, 1.5), scale(prev.u, 1.5)]) {
        const q = add(prev.t, offset);
        const a = ndc(q, prev.e, prev.r, prev.u, prev.f);
        const b = ndc(q, eye, right, up, fwd);
        shift[0] += (b[0] - a[0]) * .25;
        shift[1] += (b[1] - a[1]) * .25;
      }
    }
    const orbitSpeed = Math.hypot(shift[0], shift[1]) / Math.max(rawDt, .001);

    // pointer, idle autopilot
    pointer.idle += rawDt;
    pointer.speed *= Math.exp(-6 * rawDt);
    const ghost = pointer.idle > 6 && motionOn && !pointer.down;
    if (ghost) {
      pointer.x = width * (.5 + .3 * Math.sin(clock * .23) * Math.cos(clock * .11));
      pointer.y = height * (.5 + .25 * Math.sin(clock * .17 + 1.3));
    }
    const [leafHit, coreHit] = pointer.inside && !pointer.dragging && !ghost ? pick() : [null, null];
    hoverLeaf = labelLeaf ?? leafHit;
    hoverCore = labelCore ?? (hoverLeaf ? null : coreHit);
    const engaged = hoverLeaf?.core ?? hoverCore;
    if (engaged) {
      browsing = engaged;
      browseIdle = 0;
    } else if (pointer.idle > 9 && motionOn && !pinned && cores.length) {
      browsing = cores[Math.floor((clock - 9) / 7) % cores.length];
    } else if (browsing && browsing !== pinned) {
      const b = browsing;
      const near = pointer.inside && !ghost && (Math.hypot(pointer.x - b.sx, pointer.y - b.sy) < b.radiusPx * 2.2
        || b.leaves.some((l) => l.visible && Math.hypot(pointer.x - l.sx, pointer.y - l.sy) < 90));
      browseIdle = near ? 0 : browseIdle + rawDt;
      if (browseIdle > .7) browsing = null;
    }
    canvas.style.cursor = pointer.dragging ? "grabbing" : leafHit || coreHit ? "pointer" : "crosshair";

    // cores open and close; each fresh opening gets a new branching seed
    for (const core of cores) {
      // portrait screens pull the ring of cores inward so all of them stay in frame
      const ringScale = clamp(aspect * 1.4, .62, 1) * core.ring;
      core.base[0] = Math.cos(core.angle) * ringScale;
      core.base[2] = Math.sin(core.angle) * ringScale;
      core.pos = add(core.base, [0, .08 * Math.sin(simTime * .5 + core.index * 2), 0]);
      const isEngaged = core === pinned || core === browsing || selected?.core === core || labelCore === core;
      const goal = isEngaged ? 1 : .14;
      if (isEngaged && core.open < .3 && !core.wasOpen) {
        core.seed = (Math.random() * 1e9) | 0;
        core.wasOpen = true;
        signature(core);
      }
      if (!isEngaged && core.open < .2) core.wasOpen = false;
      core.open = damp(core.open, goal, goal > core.open ? 1.5 : 2.4, rawDt);
      core.activity = damp(core.activity, core === hoverCore || core === labelCore || core === pinned ? 1 : 0, 6, rawDt);
      layoutLeaves(core, simTime);
      for (const leaf of core.leaves) {
        leaf.grow = clamp(core.open * 1.45 - (leaf.j / Math.max(1, leaf.n)) * .45);
        leaf.activity = damp(leaf.activity, leaf === selected || leaf === hoverLeaf ? 1 : 0, 7, rawDt);
      }
    }

    // build this frame's geometry
    strokes.reset();
    sprites.reset();
    const ctx: FxContext = { t: simTime, dt, cores, width, height, motion: motionOn, screenPoint, project };
    lastCtx = ctx;
    fx.update(ctx);
    fx.drawWaves(ctx, strokes);
    for (const core of cores) {
      drawCore(core, simTime, strokes, sprites);
      drawBranches(core, simTime, strokes, sprites);
    }
    fx.draw(ctx, strokes, sprites);

    // projections for picking and labels
    for (const core of cores) {
      const pr = project(core.pos);
      core.sx = pr.x; core.sy = pr.y; core.depth = pr.depth; core.visible = pr.visible;
      core.radiusPx = pr.visible ? (height / 2) / (pr.depth * tanH) : 0;
      for (const leaf of core.leaves) {
        const lp = project(leaf.pos);
        leaf.sx = lp.x; leaf.sy = lp.y; leaf.depth = lp.depth;
        leaf.visible = lp.visible && leaf.grow > .55;
      }
    }

    const nx = pointer.x / width * 2 - 1;
    const ny = 1 - pointer.y / height * 2;
    const rayD = norm(add(fwd, add(scale(right, nx * tanH * aspect), scale(up, ny * tanH))));
    focusPoint = add(eye, scale(rayD, cam.dist / Math.max(.3, dot(rayD, fwd))));
    const stir = pointer.inside || ghost ? (ghost ? .5 : .2 + Math.min(pointer.speed / 1300, 1.8)) : 0;
    const holding = pointer.down && !pointer.dragging && performance.now() - pointer.downT > 260;
    press = damp(press, holding ? 1 : 0, holding ? 2.5 : 4, rawDt);
    if (shock.age >= 0) { shock.age += dt; if (shock.age > 3) shock.age = -1; }
    shockData.set([...shock.at, shock.age]);

    coreData.fill(0);
    slots.fill(-1);
    cores.forEach((c, i) => {
      coreData.set([...c.pos, c.open], i * 4);
      coreHue[i] = bandHue(c.arch, .5);
      if (slots[c.arch.slot] < 0) slots[c.arch.slot] = i;
    });
    leafData.fill(0);
    leaves.forEach((l, i) => leafData.set([...l.pos, l.core.index], i * 4));

    const state: FrameState = {
      time: simTime, dt: Math.max(dt, .0005), proj, view,
      pixelsPerUnit: height * pixelRatio / tanH * .5, pxScale: pixelRatio,
      cores: coreData, coreCount: cores.length, coreHue, slots,
      leaves: leafData, leafCount: leaves.length, boost: fx.boost, migrate: fx.migrate,
      rayO: eye, rayD, focus: focusPoint, stir, press, shock: shockData,
      fade: Math.max(.6, (motionOn ? .9 : .8) - Math.min(orbitSpeed * .6, .3)),
      shift, quality, strokes, sprites,
    };
    try {
      gpu.render(state);
    } catch (error) {
      running = false;
      failed(error);
      return;
    }

    // labels
    for (const core of cores) {
      const lp = project(madd(core.pos, core.up, -1.35));
      core.label.style.transform = `translate3d(${lp.x.toFixed(1)}px, ${lp.y.toFixed(1)}px, 0) translateX(-50%)`;
      core.label.style.opacity = lp.visible ? "1" : "0";
      core.nameTyper.update(clock > .4 + core.index * .3 && lp.visible, rawDt);
      core.subTyper.update(core.open > .5 || core.activity > .4, rawDt);
      core.label.classList.toggle("is-open", core.open > .5);
    }
    // relax overlapping leaf labels vertically (screen space, small offsets)
    const shown = leaves.filter((l) => l.visible && l.grow > .82);
    for (const l of shown) labelY.set(l, l.sy);
    for (let pass = 0; pass < 4; pass++) {
      for (let i = 0; i < shown.length; i++) {
        for (let j = i + 1; j < shown.length; j++) {
          const a = shown[i], b = shown[j];
          const ya = labelY.get(a)!, yb = labelY.get(b)!;
          if (Math.abs(a.sx - b.sx) > 150 || Math.abs(ya - yb) >= 19) continue;
          const push = (19 - Math.abs(ya - yb)) / 2 * (ya <= yb ? 1 : -1);
          labelY.set(a, clamp(ya - push, a.sy - 30, a.sy + 30));
          labelY.set(b, clamp(yb + push, b.sy - 30, b.sy + 30));
        }
      }
    }
    for (const leaf of leaves) {
      const show = leaf.visible && leaf.grow > .82;
      const active = leaf === selected || leaf === hoverLeaf;
      leaf.typer.update(show, rawDt);
      leaf.label.style.transform = `translate3d(${leaf.sx.toFixed(1)}px, ${(labelY.get(leaf) ?? leaf.sy).toFixed(1)}px, 0)`;
      leaf.label.style.opacity = show ? String(active ? 1 : clamp(1.3 - (leaf.depth - cam.dist + 3) / 7, .35, 1)) : "0";
      leaf.label.classList.toggle("is-hidden", !show);
      leaf.label.classList.toggle("is-hover", leaf === hoverLeaf);
      leaf.tick.classList.toggle("is-hover", leaf === hoverLeaf);
    }
    brandTyper?.update(true, rawDt);
    runTicker(rawDt);
    if (telemetry && fpsFrames === 0) {
      const m = Math.floor(clock / 60);
      const s = Math.floor(clock % 60);
      const live = Math.round(gpu.agents * Math.max(8 / side, Math.round(side * quality) / side));
      telemetry.textContent = `T+${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")} · ${fps} FPS · ${live.toLocaleString("en-US")} AGENTS · EVENT ${fx.lastEvent}`;
    }
  };

  const loop = (now: number) => {
    if (!running) return;
    requestAnimationFrame(loop);
    if (document.hidden) { last = now; return; }
    frame(now);
  };
  canvas.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    running = false;
    failed("WebGL context lost");
  });

  // ?debug exposes a manual stepper and effect triggers for headless inspection
  if (new URLSearchParams(location.search).has("debug")) {
    Object.assign(window, {
      __living: {
        step: (count = 1, ms = 1000 / 60) => {
          for (let i = 0; i < count && running; i++) frame(last + ms);
          return { telemetry: telemetry?.textContent, quality, fps, strokes: strokes.count, sprites: sprites.count };
        },
        fx: (kind: Parameters<Fx["trigger"]>[0]) => lastCtx && fx.trigger(kind, lastCtx),
        pin: (i: number) => togglePin(cores[i]),
        select: (i: number | null) => selectLeaf(i === null ? null : leaves[i], "directory"),
        browse: (i: number | null) => { browsing = i === null ? null : cores[i]; },
        pointer, cam,
      },
    });
  }

  refreshRoutes();
  requestAnimationFrame(loop);
  return { refreshRoutes };
};
