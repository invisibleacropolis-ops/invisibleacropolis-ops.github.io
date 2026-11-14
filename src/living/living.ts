// The living index: wires the WebGL engine to the page. Destinations become
// attractors in an agent field; labels, the metadata card and the ticker are
// typed out live in response to where the pointer is and what it does.
import { createEngine, type FrameState } from "./engine.ts";
import { MAX_NODES } from "./glsl.ts";

export type LivingController = { refreshRoutes: () => void };

type V3 = [number, number, number];
type Category = "world" | "experiments" | "systems";
type SelectSource = "pointer" | "label" | "directory" | "focus";

type LivingNode = {
  link: HTMLAnchorElement;
  title: string;
  category: Category;
  hue: number;
  kind: number;
  rand: number;
  theta: number;
  lat: number;
  pos: V3;
  sx: number;
  sy: number;
  depth: number;
  visible: boolean;
  activity: number;
  label: HTMLAnchorElement;
  typer: Typer;
  tick: HTMLElement;
};

// ---------------------------------------------------------------- utilities
const STOPS: V3[] = [[1, .07, .14], [1, .38, .03], [1, .85, .1], [.12, 1, .3], [.06, .55, 1], [.22, .16, 1], [.66, .14, 1]];
const spectrum = (x: number): V3 => {
  const s = Math.min(Math.max(x, 0), 1) * 6;
  const i = Math.min(Math.floor(s), 5);
  const f = s - i;
  const k = f * f * (3 - 2 * f);
  return [0, 1, 2].map((c) => STOPS[i][c] + (STOPS[i + 1][c] - STOPS[i][c]) * k) as V3;
};
const css = (x: number) => {
  const [r, g, b] = spectrum(x).map((c) => Math.round(255 * Math.pow(Math.min(1, c * .92 + .08), 1 / 2.2)));
  return `rgb(${r} ${g} ${b})`;
};
const seeded = (value: number) => {
  const r = Math.sin(value * 127.17 + 91.71) * 43758.5453;
  return r - Math.floor(r);
};
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3): V3 => scale(a, 1 / (Math.hypot(a[0], a[1], a[2]) || 1));
const damp = (current: number, goal: number, rate: number, dt: number) => goal + (current - goal) * Math.exp(-rate * dt);

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
    const typing = n < goal;
    const out = this.text.slice(0, n) + (typing ? SCRAMBLE[(Math.random() * SCRAMBLE.length) | 0] : "");
    if (out !== this.last) {
      this.el.textContent = out;
      this.last = out;
    }
    this.el.classList.toggle("is-typing", n !== goal);
  }
}

// -------------------------------------------------------------------- setup
export const createLivingIndex = (canvas: HTMLCanvasElement): LivingController | null => {
  const layer = document.querySelector<HTMLElement>("#node-layer");
  const ticks = document.querySelector<HTMLElement>("#spectrum-ticks");
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
  let engine: ReturnType<typeof createEngine> = null;
  const failed = (error?: unknown) => {
    if (error) console.warn("Living index unavailable", error);
    document.body.classList.add("no-webgl");
    if (fallback) fallback.hidden = false;
  };
  try {
    engine = createEngine(canvas, side);
  } catch (error) {
    failed(error);
    return null;
  }
  if (!engine) {
    failed();
    return null;
  }
  const gpu = engine;

  // ------------------------------------------------------------- motion prefs
  const reduceQuery = matchMedia("(prefers-reduced-motion: reduce)");
  let motionOn = !reduceQuery.matches;
  const syncMotion = () => {
    if (!motionButton) return;
    motionButton.setAttribute("aria-pressed", String(motionOn));
    motionButton.querySelector("b")!.textContent = motionOn ? "ON" : "LOW";
  };
  motionButton?.addEventListener("click", () => { motionOn = !motionOn; syncMotion(); });
  syncMotion();

  // -------------------------------------------------------------------- nodes
  let nodes: LivingNode[] = [];
  let selected: number | null = null;
  let hovered: number | null = null;
  let hoverDwell = 0;
  let labelHover: number | null = null;

  const categoryFor = (link: HTMLAnchorElement): Category => {
    const heading = link.closest(".route-group")?.querySelector("h2");
    return heading?.id === "world-label" ? "world" : heading?.id === "systems-label" ? "systems" : "experiments";
  };

  const refreshRoutes = () => {
    layer?.replaceChildren();
    ticks?.replaceChildren();
    const links = Array.from(document.querySelectorAll<HTMLAnchorElement>("#destinations .route")).slice(0, MAX_NODES);
    const counts: Record<Category, number> = { world: 0, experiments: 0, systems: 0 };
    const seen: Record<Category, number> = { world: 0, experiments: 0, systems: 0 };
    links.forEach((link) => counts[categoryFor(link)]++);
    const offsets: Record<Category, number> = { world: 0, experiments: .9, systems: 2.1 };
    nodes = links.map((link, index) => {
      const category = categoryFor(link);
      const j = seen[category]++;
      const k = counts[category];
      const hue = links.length > 1 ? index / (links.length - 1) : .5;
      const title = (link.querySelector(".route-name")?.textContent?.trim() || link.textContent?.trim() || "UNTITLED").toUpperCase();
      const number = String(index + 1).padStart(2, "0");
      const color = css(hue);
      link.style.setProperty("--node", color);

      const label = document.createElement("a");
      label.className = "node-label";
      label.href = link.href;
      label.style.setProperty("--node", color);
      label.setAttribute("aria-label", `${title}: ${category}`);
      const num = document.createElement("span");
      num.className = "node-num";
      num.textContent = number;
      const name = document.createElement("span");
      name.className = "node-name";
      name.setAttribute("aria-hidden", "true");
      label.append(num, name);
      layer?.append(label);

      const tick = document.createElement("span");
      tick.className = "spectrum-tick";
      tick.style.left = `${hue * 100}%`;
      tick.style.setProperty("--node", color);
      tick.textContent = number;
      ticks?.append(tick);

      const node: LivingNode = {
        link, title, category, hue,
        kind: category === "world" ? 0 : category === "systems" ? 3 : 1 + (j % 2),
        rand: seeded(index + 3.3),
        theta: j * 2.39996 + offsets[category],
        lat: k === 1 ? 0 : (1 - (2 * (j + .5)) / k) * .62,
        pos: [0, 0, 0], sx: 0, sy: 0, depth: 1, visible: false, activity: 0,
        label, typer: new Typer(name, title), tick,
      };
      label.addEventListener("click", (event) => {
        if (selected !== index) { event.preventDefault(); select(index, "label"); }
      });
      label.addEventListener("focus", () => select(index, "focus"));
      label.addEventListener("pointerenter", () => { labelHover = index; });
      label.addEventListener("pointerleave", () => { if (labelHover === index) labelHover = null; });
      tick.addEventListener("pointerenter", () => { labelHover = index; });
      tick.addEventListener("pointerleave", () => { if (labelHover === index) labelHover = null; });
      tick.addEventListener("click", () => select(index, "directory"));
      link.onpointerenter = () => { labelHover = index; };
      link.onpointerleave = () => { if (labelHover === index) labelHover = null; };
      link.onfocus = () => select(index, "directory");
      return node;
    });
    if (selected !== null && selected >= nodes.length) select(null, null);
  };

  const shells: Record<Category, number> = { world: 1.5, experiments: 2.5, systems: 3.35 };
  const spins: Record<Category, number> = { world: .07, experiments: -.04, systems: .025 };
  const layout = (t: number) => {
    nodes.forEach((node, i) => {
      const theta = node.theta + t * spins[node.category] + .12 * Math.sin(t * .21 + i * 1.7);
      const y = node.lat + .07 * Math.sin(t * .33 + i * 1.3);
      const r = shells[node.category] * (1 + .05 * Math.sin(t * .4 + i * 2.1));
      const q = Math.sqrt(Math.max(0, 1 - y * y));
      node.pos = [Math.cos(theta) * q * r, y * r * .8, Math.sin(theta) * q * r];
    });
  };

  // ------------------------------------------------------------------ card
  let cardFrame = 0;
  const hideCard = () => {
    cancelAnimationFrame(cardFrame);
    if (card.root) card.root.hidden = true;
  };
  const showCard = (node: LivingNode, index: number) => {
    const { root, enter, enterLabel, fields } = card;
    if (!root || !enter || !enterLabel || fields.some((f) => !f)) return;
    cancelAnimationFrame(cardFrame);
    const url = new URL(node.link.href);
    const nm = Math.round(700 - node.hue * 300);
    const values = [
      "TITLE", node.title,
      "CLASS", `${node.category.toUpperCase()} / ${String(index + 1).padStart(2, "0")}`,
      "ADDRESS", url.pathname + url.search,
      "BAND", `λ ${nm} NM`,
      "VECTOR", node.pos.map((v) => `${v >= 0 ? "+" : ""}${v.toFixed(2)}`).join(" / "),
    ];
    root.style.setProperty("--node", css(node.hue));
    enter.href = node.link.href;
    enter.setAttribute("aria-label", `Enter ${node.title}`);
    root.hidden = false;
    const pairs: [HTMLElement, string][] = fields.map((el, i) => [el!, values[i]]);
    pairs.push([enterLabel, "ENTER PAGE ↗"]);
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
  card.close?.addEventListener("click", () => select(null, null));

  // ---------------------------------------------------------------- camera
  const cam = { yaw: .7, pitch: .32, dist: 15, goalDist: 8.2, yawVel: 0, pitchVel: 0, aimYaw: null as number | null };
  const FOV = 50 * Math.PI / 180;
  const tanH = Math.tan(FOV / 2);
  let eye: V3 = [0, 0, 1];
  let fwd: V3 = [0, 0, -1];
  let right: V3 = [1, 0, 0];
  let up: V3 = [0, 1, 0];
  const proj = new Float32Array(16);
  const view = new Float32Array(16);
  const updateCamera = (aspect: number) => {
    const cp = Math.cos(cam.pitch);
    eye = [cam.dist * cp * Math.sin(cam.yaw), cam.dist * Math.sin(cam.pitch), cam.dist * cp * Math.cos(cam.yaw)];
    fwd = norm(scale(eye, -1));
    right = norm(cross(fwd, [0, 1, 0]));
    up = cross(right, fwd);
    view.set([right[0], up[0], -fwd[0], 0, right[1], up[1], -fwd[1], 0, right[2], up[2], -fwd[2], 0, -dot(right, eye), -dot(up, eye), dot(fwd, eye), 1]);
    const f = 1 / tanH;
    const near = .05;
    const far = 60;
    const nf = 1 / (near - far);
    proj.set([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
  };
  // NDC of a world point under a given camera basis
  const ndc = (p: V3, e: V3, r: V3, u: V3, f: V3, aspect: number): [number, number, number] => {
    const d = sub(p, e);
    const z = dot(d, f);
    return [dot(d, r) / (z * tanH * aspect), dot(d, u) / (z * tanH), z];
  };

  // --------------------------------------------------------------- pointer
  const pointer = { x: innerWidth / 2, y: innerHeight / 2, inside: false, down: false, dragging: false, downX: 0, downY: 0, downT: 0, lastX: 0, lastY: 0, speed: 0, idle: 0, id: -1 };
  let press = 0;
  const shock = { at: [0, 0, 0] as V3, age: -1 };
  let focusPoint: V3 = [0, 0, 0];

  const pick = (): number | null => {
    let best: number | null = null;
    let bestD = coarse ? 44 : 34;
    nodes.forEach((node, i) => {
      if (!node.visible) return;
      const d = Math.hypot(node.sx - pointer.x, node.sy - pointer.y);
      if (d < bestD) { bestD = d; best = i; }
    });
    return best;
  };

  window.addEventListener("pointermove", (event) => {
    const dx = event.clientX - pointer.lastX;
    const dy = event.clientY - pointer.lastY;
    pointer.speed = Math.max(pointer.speed, Math.hypot(dx, dy) * 60);
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    pointer.lastX = event.clientX;
    pointer.lastY = event.clientY;
    pointer.idle = 0;
    pointer.inside = !(event.target instanceof Node && directory?.contains(event.target));
    if (pointer.down && event.pointerId === pointer.id) {
      if (!pointer.dragging && Math.hypot(event.clientX - pointer.downX, event.clientY - pointer.downY) > 7) pointer.dragging = true;
      if (pointer.dragging) {
        cam.yawVel = -dx * .006 * 60;
        cam.pitchVel = dy * .0045 * 60;
        cam.yaw -= dx * .006;
        cam.pitch = Math.min(1.25, Math.max(-1.25, cam.pitch + dy * .0045));
        cam.aimYaw = null;
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
    canvas.setPointerCapture(event.pointerId);
  });
  const release = (event: PointerEvent) => {
    if (!pointer.down || event.pointerId !== pointer.id) return;
    const held = performance.now() - pointer.downT;
    if (!pointer.dragging && held < 300) {
      const hit = pick();
      if (hit !== null) select(hit, "pointer");
      else {
        shock.at = focusPoint;
        shock.age = 0;
        select(null, null);
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
    cam.goalDist = Math.min(14, Math.max(4.2, cam.goalDist * Math.exp(event.deltaY * .0011)));
  }, { passive: false });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && selected !== null && directory?.hidden !== false) select(null, null);
  });

  // ------------------------------------------------------------- selection
  const select = (index: number | null, source: SelectSource | null) => {
    if (index === selected) return;
    selected = index;
    nodes.forEach((node, i) => {
      node.label.classList.toggle("is-active", i === index);
      node.link.classList.toggle("is-node-active", i === index);
      node.tick.classList.toggle("is-active", i === index);
    });
    if (index === null) { hideCard(); cam.aimYaw = null; return; }
    const node = nodes[index];
    showCard(node, index);
    if (source !== "pointer") cam.aimYaw = Math.atan2(node.pos[0], node.pos[2]);
  };

  // --------------------------------------------------------------- ticker
  const phrases = () => [
    "NOTHING HERE IS MODELED. EVERYTHING IS COMPUTED.",
    `${gpu.agents.toLocaleString("en-US")} AGENTS ROUTING BETWEEN ${nodes.length} ATTRACTORS.`,
    coarse ? "DRAG TO ORBIT · HOLD TO GATHER · TAP TO SHOCK." : "MOVE TO STIR · HOLD TO GATHER · CLICK TO SHOCK · DRAG TO ORBIT.",
    "EVERY DESTINATION OWNS A BAND OF LIGHT · 700 → 400 NM.",
    "WORLDS / EXPERIMENTS / SYSTEMS.",
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
    const n = Math.floor(tick.shown);
    const out = text.slice(0, n);
    if (out !== tick.text) { ticker.textContent = out; tick.text = out; }
  };
  const brandTyper = brand ? new Typer(brand, brand.dataset.text ?? "INVISIBLE ACROPOLIS", 22, 60) : null;

  // ---------------------------------------------------------------- loop
  let width = 0;
  let height = 0;
  let pixelRatio = Math.min(devicePixelRatio || 1, 1.5);
  const resize = () => {
    width = canvas.clientWidth || innerWidth;
    height = canvas.clientHeight || innerHeight;
    gpu.resize(width * pixelRatio, height * pixelRatio);
  };
  new ResizeObserver(resize).observe(canvas);
  resize();

  const nodeData = new Float32Array(MAX_NODES * 4);
  const metaData = new Float32Array((MAX_NODES + 1) * 4);
  const shockData = new Float32Array(4);
  let simTime = 0;
  let clock = 0;
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
    const timeScale = motionOn ? 1 : .35;
    const dt = rawDt * timeScale;
    simTime += dt;

    // adaptive quality
    frameEma = frameEma * .95 + rawDt * 1000 * .05;
    if (frameEma > 24) { slowFor += rawDt; fastFor = 0; } else if (frameEma < 15) { fastFor += rawDt; slowFor = 0; } else { slowFor = fastFor = 0; }
    if (slowFor > 1.5 && quality > .3) {
      quality *= .8; slowFor = 0;
      if (quality < .55 && pixelRatio > 1) { pixelRatio = 1; resize(); }
    }
    if (fastFor > 4 && quality < 1) { quality = Math.min(1, quality * 1.15); fastFor = 0; }
    fpsFrames++; fpsTime += rawDt;
    if (fpsTime > .5) { fps = Math.round(fpsFrames / fpsTime); fpsFrames = 0; fpsTime = 0; }

    // camera
    const prevBasis = { e: eye, r: right, u: up, f: fwd };
    // portrait screens see less horizontally: back the camera off to keep the outer shell in frame
    const fit = Math.min(1.6, Math.max(1, .95 / Math.sqrt(width / Math.max(1, height))));
    cam.dist = damp(cam.dist, cam.goalDist * fit, clock < 4 ? 1.1 : 3.5, rawDt);
    if (!pointer.dragging) {
      cam.yaw += cam.yawVel * rawDt;
      cam.pitch = Math.min(1.25, Math.max(-1.25, cam.pitch + cam.pitchVel * rawDt));
      cam.yawVel = damp(cam.yawVel, motionOn ? .045 : 0, 1.6, rawDt);
      cam.pitchVel = damp(cam.pitchVel, 0, 2.2, rawDt);
      cam.pitch = damp(cam.pitch, .3, .25, rawDt);
      if (cam.aimYaw !== null) {
        let delta = cam.aimYaw - cam.yaw;
        delta = Math.atan2(Math.sin(delta), Math.cos(delta));
        cam.yaw += delta * (1 - Math.exp(-3 * rawDt));
        if (Math.abs(delta) < .01) cam.aimYaw = null;
      }
    }
    const aspect = width / Math.max(1, height);
    updateCamera(aspect);

    // feedback re-projection: slide the old frame with the orbit
    const shift: [number, number] = [0, 0];
    if (clock > .1) {
      for (const offset of [scale(prevBasis.r, 1.5), scale(prevBasis.u, 1.5)]) {
        const q = offset;
        const a = ndc(q, prevBasis.e, prevBasis.r, prevBasis.u, prevBasis.f, aspect);
        const b = ndc(q, eye, right, up, fwd, aspect);
        shift[0] += (b[0] - a[0]) * .25;
        shift[1] += (b[1] - a[1]) * .25;
      }
    }
    const orbitSpeed = Math.hypot(shift[0], shift[1]) / Math.max(rawDt, .001);

    // nodes
    layout(simTime);
    nodes.forEach((node) => {
      const [x, y, z] = ndc(node.pos, eye, right, up, fwd, aspect);
      node.visible = z > .2 && Math.abs(x) < 1.1 && Math.abs(y) < 1.1;
      node.sx = (x + 1) / 2 * width;
      node.sy = (1 - y) / 2 * height;
      node.depth = z;
    });

    // pointer → hover, idle ghost
    pointer.idle += rawDt;
    pointer.speed *= Math.exp(-6 * rawDt);
    const ghost = pointer.idle > 6 && motionOn && !pointer.down;
    if (ghost) {
      pointer.x = width * (.5 + .3 * Math.sin(clock * .23) * Math.cos(clock * .11));
      pointer.y = height * (.5 + .25 * Math.sin(clock * .17 + 1.3));
    }
    const picked = pointer.inside && !pointer.dragging && !ghost ? pick() : null;
    hovered = labelHover ?? picked;
    hoverDwell = hovered !== null ? hoverDwell + rawDt : 0;
    canvas.style.cursor = pointer.dragging ? "grabbing" : picked !== null ? "pointer" : "crosshair";
    const hot = selected ?? (hoverDwell > .35 ? hovered : null);

    const nx = pointer.x / width * 2 - 1;
    const ny = 1 - pointer.y / height * 2;
    const rayD = norm(add(fwd, add(scale(right, nx * tanH * aspect), scale(up, ny * tanH))));
    focusPoint = add(eye, scale(rayD, cam.dist / Math.max(.3, dot(rayD, fwd))));
    const stir = pointer.inside || ghost ? (ghost ? .55 : .2 + Math.min(pointer.speed / 1300, 1.8)) : 0;
    const holding = pointer.down && !pointer.dragging && performance.now() - pointer.downT > 260;
    press = damp(press, holding ? 1 : 0, holding ? 2.5 : 4, rawDt);
    if (shock.age >= 0) { shock.age += dt; if (shock.age > 3) shock.age = -1; }

    // per-node activity + labels
    const intro = clock < 3.2;
    nodes.forEach((node, i) => {
      const active = i === selected || i === hovered;
      node.activity = damp(node.activity, active ? 1 : 0, 6, rawDt);
      nodeData.set([...node.pos, node.activity], i * 4);
      const s = node.category === "world" ? .27 : node.category === "systems" ? .22 : .2;
      metaData.set([node.kind, node.activity, node.rand, s], i * 4);
      const near = !coarse && pointer.inside && !ghost && Math.hypot(node.sx - pointer.x, node.sy - pointer.y) < 150;
      const want = active || near || document.activeElement === node.label || (intro && clock > .4 + i * .08);
      node.typer.update(want && node.visible, rawDt);
      const depthFade = Math.min(1, Math.max(.28, 1.25 - (node.depth - cam.dist + 3.5) / 7));
      node.label.style.transform = `translate3d(${node.sx.toFixed(1)}px, ${node.sy.toFixed(1)}px, 0)`;
      node.label.style.opacity = node.visible ? String(active ? 1 : depthFade) : "0";
      node.label.classList.toggle("is-hover", i === hovered);
      node.tick.classList.toggle("is-hover", i === hovered);
    });
    const coreActivity = press;
    metaData.set([0, coreActivity, .5, .55], nodes.length * 4);
    shockData.set([...shock.at, shock.age]);

    const state: FrameState = {
      time: simTime, dt: Math.max(dt, .0005), proj, view,
      pixelsPerUnit: height * pixelRatio / tanH * .5,
      nodes: nodeData, meta: metaData, count: nodes.length, hot: hot ?? -1,
      rayO: eye, rayD, focus: focusPoint, stir, press, shock: shockData,
      fade: Math.max(.6, (motionOn ? .9 : .8) - Math.min(orbitSpeed * .6, .3)),
      shift, quality,
    };
    try {
      gpu.render(state);
    } catch (error) {
      running = false;
      failed(error);
      return;
    }

    brandTyper?.update(true, rawDt);
    runTicker(rawDt);
    if (telemetry && fpsFrames === 0) {
      const m = Math.floor(clock / 60);
      const s = Math.floor(clock % 60);
      const agentsLive = Math.round(gpu.agents * Math.max(8 / side, Math.round(side * quality) / side));
      telemetry.textContent = `T+${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")} · ${fps} FPS · ${agentsLive.toLocaleString("en-US")} AGENTS · ENERGY ${(stir + press * 2 + (shock.age >= 0 ? 1 : 0)).toFixed(2)}`;
    }
  };

  canvas.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    running = false;
    failed("WebGL context lost");
  });

  const loop = (now: number) => {
    if (!running) return;
    requestAnimationFrame(loop);
    if (document.hidden) { last = now; return; }
    frame(now);
  };
  // ?debug exposes a manual stepper so the field can be inspected headless.
  if (new URLSearchParams(location.search).has("debug")) {
    Object.assign(window, {
      __living: {
        step: (count = 1, ms = 1000 / 60) => {
          for (let i = 0; i < count && running; i++) frame(last + ms);
          return { telemetry: telemetry?.textContent, quality, fps };
        },
        pointer, cam, select: (i: number | null) => select(i, "directory"),
      },
    });
  }

  refreshRoutes();
  requestAnimationFrame(loop);
  return { refreshRoutes };
};
