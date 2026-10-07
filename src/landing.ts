type Vec3 = [number, number, number];
type Page = { title: string; url: string };

const canvas = document.querySelector<HTMLCanvasElement>("#hologram");
const art = document.querySelector<HTMLElement>(".hero-art");
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

if (canvas && art) {
  const context = canvas.getContext("2d");
  if (context) {
    const ctx = context;
    let width = 0;
    let height = 0;
    let frame = 0;
    let animationId = 0;
    let pointerX = 0;
    let pointerY = 0;
    let offsetX = 0;
    let offsetY = 0;

    const normalize = ([x, y, z]: Vec3): Vec3 => {
      const length = Math.hypot(x, y, z);
      return [x / length, y / length, z / length];
    };
    const rotate = ([x, y, z]: Vec3, yaw: number, pitch: number): Vec3 => {
      const cy = Math.cos(yaw), sy = Math.sin(yaw);
      const cx = Math.cos(pitch), sx = Math.sin(pitch);
      const xx = x * cy + z * sy;
      const zz = z * cy - x * sy;
      return [xx, y * cx - zz * sx, y * sx + zz * cx];
    };

    const phi = (1 + Math.sqrt(5)) / 2;
    const baseVertices: Vec3[] = ([
      [-1, phi, 0], [1, phi, 0], [-1, -phi, 0], [1, -phi, 0],
      [0, -1, phi], [0, 1, phi], [0, -1, -phi], [0, 1, -phi],
      [phi, 0, -1], [phi, 0, 1], [-phi, 0, -1], [-phi, 0, 1],
    ] as Vec3[]).map(normalize);
    const faces = [
      [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
      [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
      [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
      [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
    ];
    const vertices = [...baseVertices];
    const midpointCache = new Map<string, number>();
    const midpoint = (a: number, b: number): number => {
      const key = [a, b].sort((x, y) => x - y).join(":");
      const cached = midpointCache.get(key);
      if (cached !== undefined) return cached;
      const first = vertices[a], second = vertices[b];
      const index = vertices.push(normalize([
        (first[0] + second[0]) / 2,
        (first[1] + second[1]) / 2,
        (first[2] + second[2]) / 2,
      ])) - 1;
      midpointCache.set(key, index);
      return index;
    };
    const edges = new Map<string, [number, number]>();
    const addEdge = (a: number, b: number) => {
      const pair: [number, number] = a < b ? [a, b] : [b, a];
      edges.set(pair.join(":"), pair);
    };
    for (const [a, b, c] of faces) {
      const ab = midpoint(a, b), bc = midpoint(b, c), ca = midpoint(c, a);
      for (const [x, y, z] of [[a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]]) {
        addEdge(x, y); addEdge(y, z); addEdge(z, x);
      }
    }

    const random = (seed: number) => {
      const result = Math.sin(seed * 127.1 + 92.7) * 43758.5453;
      return result - Math.floor(result);
    };
    const stars = Array.from({ length: 87 }, (_, i) => ({
      x: random(i + 1),
      y: random(i + 101),
      size: random(i + 404) > .9 ? 1.5 : .7,
      alpha: .12 + random(i + 505) * .36,
    }));

    const line = (a: [number, number], b: [number, number], color: string, weight = 1) => {
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.strokeStyle = color;
      ctx.lineWidth = weight;
      ctx.stroke();
    };
    const circle = (x: number, y: number, radius: number, color: string, weight = 1) => {
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.strokeStyle = color;
      ctx.lineWidth = weight;
      ctx.stroke();
    };
    const arc = (x: number, y: number, radius: number, start: number, end: number, color: string, weight = 1) => {
      ctx.beginPath();
      ctx.arc(x, y, radius, start, end);
      ctx.strokeStyle = color;
      ctx.lineWidth = weight;
      ctx.stroke();
    };

    const render = () => {
      ctx.clearRect(0, 0, width, height);
      const time = reduceMotion.matches ? .35 : frame * .0042;
      offsetX += (pointerX - offsetX) * .035;
      offsetY += (pointerY - offsetY) * .035;
      const cx = width * .51 + offsetX * 14;
      const cy = height * .45 + offsetY * 12;
      const radius = Math.min(width * .29, height * .3, 218);

      for (const star of stars) {
        const x = star.x * width, y = star.y * height;
        ctx.fillStyle = `rgba(167,255,235,${star.alpha})`;
        ctx.fillRect(x, y, star.size, star.size);
      }

      // Orbital graduations and a rotating tracking ring.
      circle(cx, cy, radius * 1.46, "rgba(151,255,230,.10)");
      circle(cx, cy, radius * 1.23, "rgba(151,255,230,.20)");
      circle(cx, cy, radius * 1.02, "rgba(151,255,230,.19)");
      circle(cx, cy, radius * .73, "rgba(151,255,230,.09)");
      for (let i = 0; i < 96; i++) {
        const angle = i * Math.PI * 2 / 96;
        const inner = radius * (i % 8 === 0 ? 1.28 : 1.34);
        const outer = radius * 1.41;
        line(
          [cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner],
          [cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer],
          i % 8 === 0 ? "rgba(193,255,236,.48)" : "rgba(151,255,230,.18)",
          i % 8 === 0 ? 1.2 : .7,
        );
      }
      arc(cx, cy, radius * 1.45, -1.9 + time * .19, -.5 + time * .19, "rgba(221,255,117,.83)", 2);
      arc(cx, cy, radius * 1.45, 1.05 + time * .19, 1.65 + time * .19, "rgba(150,255,231,.62)", 1.5);
      arc(cx, cy, radius * 1.1, 2.3 - time * .32, 4.5 - time * .32, "rgba(150,255,231,.31)", 1);

      // Three tilted circular scans pass behind and in front of the core.
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(-.43 + time * .035);
      ctx.scale(1, .29);
      circle(0, 0, radius * 1.57, "rgba(140,255,229,.23)", 3);
      arc(0, 0, radius * 1.57, .13, 2.13, "rgba(163,255,226,.75)", 4);
      ctx.restore();

      const projected = vertices.map((vertex) => {
        const rotated = rotate(vertex, time * .54 + .32 + offsetX * .15, -.24 + Math.sin(time * .46) * .1 + offsetY * .12);
        const perspective = 2.8 / (2.8 - rotated[2] * .45);
        return { x: cx + rotated[0] * radius * perspective, y: cy + rotated[1] * radius * perspective, z: rotated[2] };
      });
      const sortedEdges = [...edges.values()].sort((first, second) => {
        const a = projected[first[0]].z + projected[first[1]].z;
        const b = projected[second[0]].z + projected[second[1]].z;
        return a - b;
      });
      ctx.shadowBlur = 13;
      ctx.shadowColor = "rgba(127,255,230,.45)";
      for (const [a, b] of sortedEdges) {
        const first = projected[a], second = projected[b];
        const depth = (first.z + second.z) / 2;
        const alpha = depth > 0 ? .5 + depth * .27 : .1 + (depth + 1) * .11;
        line([first.x, first.y], [second.x, second.y], `rgba(151,255,231,${alpha})`, depth > 0 ? 1.35 : .75);
      }
      ctx.shadowBlur = 0;
      for (const point of projected) {
        if (point.z < -.25) continue;
        ctx.beginPath();
        ctx.arc(point.x, point.y, point.z > .5 ? 2 : 1.35, 0, Math.PI * 2);
        ctx.fillStyle = point.z > .65 ? "#ddff75" : "rgba(192,255,237,.8)";
        ctx.fill();
      }

      const coreGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius * .53);
      coreGlow.addColorStop(0, "rgba(222,255,165,.34)");
      coreGlow.addColorStop(.14, "rgba(157,255,229,.18)");
      coreGlow.addColorStop(1, "rgba(157,255,229,0)");
      ctx.fillStyle = coreGlow;
      ctx.beginPath(); ctx.arc(cx, cy, radius * .53, 0, Math.PI * 2); ctx.fill();
      circle(cx, cy, radius * .09, "rgba(221,255,117,.73)", 1.2);
      circle(cx, cy, radius * .035, "rgba(221,255,117,.95)", 1.1);
      line([cx - radius * 1.64, cy], [cx - radius * 1.42, cy], "rgba(221,255,117,.55)");
      line([cx + radius * 1.42, cy], [cx + radius * 1.64, cy], "rgba(221,255,117,.55)");
      line([cx, cy - radius * 1.62], [cx, cy - radius * 1.43], "rgba(221,255,117,.55)");
      line([cx, cy + radius * 1.43], [cx, cy + radius * 1.62], "rgba(221,255,117,.55)");
      frame++;
    };

    const tick = () => {
      render();
      animationId = window.requestAnimationFrame(tick);
    };
    const start = () => {
      window.cancelAnimationFrame(animationId);
      if (document.hidden || reduceMotion.matches) {
        render();
      } else {
        tick();
      }
    };
    const resize = () => {
      const rect = art.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * pixelRatio);
      canvas.height = Math.round(height * pixelRatio);
      ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      start();
    };
    new ResizeObserver(resize).observe(art);
    art.addEventListener("pointermove", (event) => {
      const rect = art.getBoundingClientRect();
      pointerX = (event.clientX - rect.left) / rect.width * 2 - 1;
      pointerY = (event.clientY - rect.top) / rect.height * 2 - 1;
    });
    art.addEventListener("pointerleave", () => { pointerX = 0; pointerY = 0; });
    document.addEventListener("visibilitychange", start);
    reduceMotion.addEventListener("change", start);
  }
}

// Existing destinations render in HTML immediately. The manifest adds any new
// standalone pages after future deployments without delaying the main links.
const grid = document.querySelector<HTMLElement>("#project-grid");
const count = document.querySelector<HTMLElement>("#destination-count");
const experimentCount = document.querySelector<HTMLElement>("#experiment-count");
if (grid) {
  fetch("/pages.json")
    .then((response) => {
      if (!response.ok) throw new Error(`Destination manifest: ${response.status}`);
      return response.json();
    })
    .then((value: unknown) => {
      if (!Array.isArray(value)) return;
      const known = new Set(Array.from(grid.querySelectorAll<HTMLAnchorElement>("a[href]"), (link) => new URL(link.href).pathname));
      for (const item of value as Page[]) {
        if (!item || typeof item.url !== "string" || typeof item.title !== "string") continue;
        const url = new URL(item.url, location.origin);
        if (url.origin !== location.origin || known.has(url.pathname) || url.pathname === "/kami.html") continue;
        known.add(url.pathname);
        const link = document.createElement("a");
        link.className = "route";
        link.href = url.pathname;
        const number = document.createElement("span");
        number.className = "route-number";
        const title = document.createElement("strong");
        title.className = "route-name";
        title.textContent = item.title;
        const arrow = document.createElement("span");
        arrow.className = "route-arrow";
        arrow.setAttribute("aria-hidden", "true");
        arrow.textContent = "↗";
        link.append(number, title, arrow);
        grid.append(link);
      }
      document.querySelectorAll<HTMLElement>(".route-number").forEach((label, index) => {
        label.textContent = String(index + 1).padStart(2, "0");
      });
      if (experimentCount) experimentCount.textContent = String(known.size).padStart(2, "0");
      if (count) count.textContent = `${document.querySelectorAll(".route").length} ROUTES`;
    })
    .catch((error) => console.info("Destination manifest unavailable; built-in links remain visible.", error));
}
