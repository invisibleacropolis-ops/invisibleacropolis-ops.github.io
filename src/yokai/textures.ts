import * as THREE from "three";

/**
 * The texture forge of Kakuriyo. Every surface pattern is painted onto a
 * canvas at load time — layered grain, shaded tiles, beveled stone,
 * coursed thatch — so the world stays asset-free while its surfaces read
 * as material, not fill color.
 */

type Painter = (ctx: CanvasRenderingContext2D, size: number) => void;

const makeTexture = (size: number, paint: Painter, repeat = 1): THREE.CanvasTexture => {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  paint(ctx, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat, repeat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
};

let seedState = 1234;
const rand = () => {
  seedState = (seedState * 1664525 + 1013904223) >>> 0;
  return seedState / 0x100000000;
};

/** Soft translucent blotches — the base of most weathered materials. */
const blotch = (
  ctx: CanvasRenderingContext2D,
  size: number,
  count: number,
  color: string,
  alpha: number,
  radiusMin: number,
  radiusMax: number
) => {
  for (let i = 0; i < count; i += 1) {
    const x = rand() * size;
    const y = rand() * size;
    const r = radiusMin + rand() * (radiusMax - radiusMin);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.globalAlpha = alpha * (0.5 + rand() * 0.5);
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  ctx.globalAlpha = 1;
};

/** Vertical wood grain: banded tone, wavy fibres in three shades, knots. */
export const woodTexture = (base = "#8a5a40", streak = "#6b4028") =>
  makeTexture(512, (ctx, s) => {
    // Banded base: vertical planks of slightly different warmth
    const bands = 6;
    for (let b = 0; b < bands; b += 1) {
      ctx.fillStyle = base;
      ctx.fillRect((b / bands) * s, 0, s / bands + 1, s);
      ctx.fillStyle = `rgba(255, 220, 180, ${0.05 + rand() * 0.07})`;
      if (b % 2 === 0) ctx.fillRect((b / bands) * s, 0, s / bands + 1, s);
    }
    blotch(ctx, s, 26, "#5a3826", 0.1, 30, 110);

    // Fibres in three tones
    const tones = [streak, "#7d4c34", "#9c6a4a"];
    for (let i = 0; i < 110; i += 1) {
      ctx.strokeStyle = tones[i % 3]!;
      ctx.globalAlpha = 0.22 + rand() * 0.3;
      ctx.lineWidth = 0.8 + rand() * 1.8;
      const x = rand() * s;
      const wobble = 6 + rand() * 16;
      ctx.beginPath();
      ctx.moveTo(x, -8);
      ctx.bezierCurveTo(
        x + (rand() - 0.5) * wobble, s * 0.33,
        x + (rand() - 0.5) * wobble, s * 0.66,
        x + (rand() - 0.5) * wobble * 0.6, s + 8
      );
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Knots with rings
    for (let i = 0; i < 6; i += 1) {
      const x = rand() * s;
      const y = rand() * s;
      for (let ring = 3; ring >= 0; ring -= 1) {
        ctx.strokeStyle = streak;
        ctx.globalAlpha = 0.25 + ring * 0.08;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.ellipse(x, y, 3 + ring * 3.4, 6 + ring * 5, (rand() - 0.5) * 0.4, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;

    // Plank seams
    ctx.strokeStyle = "#4a2e1e";
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = 2;
    for (let b = 1; b < bands; b += 1) {
      const x = (b / bands) * s + (rand() - 0.5) * 3;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, s);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  });

/** Kawara roof tiles: shaded, hue-jittered scallops in staggered courses. */
export const roofTexture = (base = "#4b5d73", shadow = "#2f3c4c", edge = "#77899e") =>
  makeTexture(512, (ctx, s) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, s, s);
    const rows = 8;
    const cols = 8;
    const rh = s / rows;
    const cw = s / cols;

    for (let r = 0; r < rows; r += 1) {
      const offset = (r % 2) * cw * 0.5;
      // Deep shadow where the next course overlaps
      const rowShade = ctx.createLinearGradient(0, r * rh, 0, (r + 1) * rh);
      rowShade.addColorStop(0, "rgba(255,255,255,0.06)");
      rowShade.addColorStop(0.7, "rgba(0,0,0,0)");
      rowShade.addColorStop(1, "rgba(0,0,0,0.38)");
      ctx.fillStyle = rowShade;
      ctx.fillRect(0, r * rh, s, rh);

      for (let c = -1; c <= cols; c += 1) {
        const cx = c * cw + offset + cw / 2;
        const cy = r * rh + rh * 0.82;
        // Each tile is its own shaded dome
        const tile = ctx.createRadialGradient(cx - cw * 0.14, cy - rh * 0.5, 2, cx, cy, cw * 0.62);
        const jitter = Math.floor((rand() - 0.5) * 22);
        tile.addColorStop(0, `rgba(${142 + jitter}, ${158 + jitter}, ${178 + jitter}, 0.5)`);
        tile.addColorStop(0.75, "rgba(0,0,0,0)");
        tile.addColorStop(1, "rgba(0,0,0,0.28)");
        ctx.fillStyle = tile;
        ctx.beginPath();
        ctx.arc(cx, cy, cw * 0.52, Math.PI, 0);
        ctx.fill();
        // Rim line + thin sun-catch highlight
        ctx.strokeStyle = shadow;
        ctx.lineWidth = 2.6;
        ctx.beginPath();
        ctx.arc(cx, cy, cw * 0.5, Math.PI, 0);
        ctx.stroke();
        ctx.strokeStyle = edge;
        ctx.globalAlpha = 0.7;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(cx, cy, cw * 0.44, Math.PI * 1.15, Math.PI * 1.75);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
  });

/** Castle plaster: soft blotched lime-wash with rain streaks and grime. */
export const plasterTexture = (base = "#f3efe4") =>
  makeTexture(256, (ctx, s) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, s, s);
    blotch(ctx, s, 30, "#ddd5c2", 0.16, 18, 70);
    blotch(ctx, s, 16, "#ffffff", 0.14, 14, 50);
    // Rain streaks bleeding downward
    for (let i = 0; i < 14; i += 1) {
      const x = rand() * s;
      const len = 30 + rand() * 90;
      const streak = ctx.createLinearGradient(0, 0, 0, len);
      streak.addColorStop(0, "rgba(150, 142, 120, 0.16)");
      streak.addColorStop(1, "rgba(150, 142, 120, 0)");
      ctx.save();
      ctx.translate(x, rand() * s * 0.4);
      ctx.fillStyle = streak;
      ctx.fillRect(-1.4, 0, 2.8, len);
      ctx.restore();
    }
    // Fine tooth
    for (let i = 0; i < 700; i += 1) {
      const v = 226 + Math.floor(rand() * 24);
      ctx.fillStyle = `rgba(${v - 6}, ${v - 8}, ${v - 18}, 0.22)`;
      ctx.fillRect(rand() * s, rand() * s, 1.6, 1.6);
    }
  });

/** Ishigaki: fitted stones with bevel light, individual tone, and moss. */
export const stoneWallTexture = (base = "#9a988c", seam = "#5c5a50", lit = "#b6b4a6") =>
  makeTexture(512, (ctx, s) => {
    ctx.fillStyle = seam;
    ctx.fillRect(0, 0, s, s);
    const rows = 5;
    const rh = s / rows;
    for (let r = 0; r < rows; r += 1) {
      let x = -(rand() * 40);
      while (x < s) {
        const w = 56 + rand() * 80;
        const jitterY = (rand() - 0.5) * 10;
        const y0 = r * rh + jitterY + 3;
        const y1 = (r + 1) * rh + jitterY - 3;

        // Each stone: its own tone, then a bevel
        const tone = rand();
        const fill = tone > 0.66 ? lit : tone > 0.33 ? base : "#8b897d";
        ctx.fillStyle = fill;
        ctx.beginPath();
        const xa = x + rand() * 7;
        const xb = x + w - rand() * 7;
        ctx.moveTo(xa, y0 + rand() * 4);
        ctx.lineTo(xb, y0 + (rand() - 0.5) * 6);
        ctx.lineTo(xb - rand() * 6, y1 + (rand() - 0.5) * 6);
        ctx.lineTo(xa + rand() * 5, y1 - rand() * 4);
        ctx.closePath();
        ctx.fill();

        // Bevel: sun edge above-left, shade below-right
        ctx.strokeStyle = "rgba(255, 252, 235, 0.4)";
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.moveTo(xa + 2, y1 - 4);
        ctx.lineTo(xa + 2, y0 + 3);
        ctx.lineTo(xb - 3, y0 + 3);
        ctx.stroke();
        ctx.strokeStyle = "rgba(30, 28, 20, 0.42)";
        ctx.beginPath();
        ctx.moveTo(xb - 2, y0 + 4);
        ctx.lineTo(xb - 2, y1 - 2);
        ctx.lineTo(xa + 3, y1 - 2);
        ctx.stroke();

        // Moss creeping from the seams
        if (rand() < 0.4) {
          const mossX = xa + rand() * (xb - xa);
          const mossY = y1 - 4;
          const g = ctx.createRadialGradient(mossX, mossY, 0, mossX, mossY, 8 + rand() * 10);
          g.addColorStop(0, "rgba(94, 124, 70, 0.5)");
          g.addColorStop(1, "rgba(94, 124, 70, 0)");
          ctx.fillStyle = g;
          ctx.fillRect(mossX - 18, mossY - 18, 36, 36);
        }
        x += w;
      }
    }
  });

/** Thatch in courses: horizontal bands, dense strokes, tip shadows. */
export const thatchTexture = (base = "#a98a58", dark = "#7d5f38", light = "#cbb078") =>
  makeTexture(512, (ctx, s) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, s, s);
    const courses = 6;
    const ch = s / courses;
    for (let c = 0; c < courses; c += 1) {
      // Course shading: each bundle shadows the one below
      const shade = ctx.createLinearGradient(0, c * ch, 0, (c + 1) * ch);
      shade.addColorStop(0, "rgba(60, 42, 20, 0.34)");
      shade.addColorStop(0.35, "rgba(0,0,0,0)");
      shade.addColorStop(1, "rgba(255, 232, 180, 0.1)");
      ctx.fillStyle = shade;
      ctx.fillRect(0, c * ch, s, ch);

      // Straw
      for (let i = 0; i < 240; i += 1) {
        ctx.strokeStyle = rand() > 0.5 ? dark : light;
        ctx.globalAlpha = 0.3 + rand() * 0.45;
        ctx.lineWidth = 1.1 + rand() * 1.3;
        const x = rand() * s;
        const y = c * ch + rand() * ch * 0.5;
        const len = ch * (0.5 + rand() * 0.6);
        const lean = (rand() - 0.5) * 8;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + lean, y + len);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  });

/** Shoji paper: backlit panes, paper fibre, double timber lattice. */
export const shojiTexture = (paper = "#f6f0df", frame = "#584032") =>
  makeTexture(256, (ctx, s) => {
    ctx.fillStyle = paper;
    ctx.fillRect(0, 0, s, s);
    const cells = 4;
    const cell = s / cells;
    // Warm inner light per pane
    for (let cy = 0; cy < cells; cy += 1) {
      for (let cx = 0; cx < cells; cx += 1) {
        const gx = cx * cell + cell / 2;
        const gy = cy * cell + cell / 2;
        const g = ctx.createRadialGradient(gx, gy, 2, gx, gy, cell * 0.7);
        g.addColorStop(0, "rgba(255, 224, 168, 0.32)");
        g.addColorStop(1, "rgba(255, 224, 168, 0)");
        ctx.fillStyle = g;
        ctx.fillRect(cx * cell, cy * cell, cell, cell);
      }
    }
    // Paper fibre
    for (let i = 0; i < 260; i += 1) {
      ctx.strokeStyle = `rgba(190, 172, 140, ${0.1 + rand() * 0.14})`;
      ctx.lineWidth = 0.7;
      const x = rand() * s;
      const y = rand() * s;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (rand() - 0.5) * 14, y + (rand() - 0.5) * 6);
      ctx.stroke();
    }
    // Double lattice
    ctx.strokeStyle = frame;
    for (let i = 0; i <= cells; i += 1) {
      const p = (i / cells) * s;
      ctx.lineWidth = 9;
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.moveTo(p, 0);
      ctx.lineTo(p, s);
      ctx.moveTo(0, p);
      ctx.lineTo(s, p);
      ctx.stroke();
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = "#2e2018";
      ctx.beginPath();
      ctx.moveTo(p + 5, 0);
      ctx.lineTo(p + 5, s);
      ctx.moveTo(0, p + 5);
      ctx.lineTo(s, p + 5);
      ctx.stroke();
      ctx.strokeStyle = frame;
    }
    ctx.globalAlpha = 1;
  });

/** Meadow mottle: blades in three greens, patchy tone, rare wildflowers. */
export const grassTexture = () =>
  makeTexture(
    512,
    (ctx, s) => {
      ctx.fillStyle = "#f0f2ec";
      ctx.fillRect(0, 0, s, s);
      blotch(ctx, s, 26, "#dbe6cf", 0.3, 40, 130);
      blotch(ctx, s, 20, "#f8f5e6", 0.26, 30, 90);
      const tones = ["#d5e3c2", "#e2ecd2", "#c9dcc0"];
      for (let i = 0; i < 3600; i += 1) {
        ctx.strokeStyle = tones[i % 3]!;
        ctx.globalAlpha = 0.35 + rand() * 0.4;
        ctx.lineWidth = 1.2;
        const x = rand() * s;
        const y = rand() * s;
        const len = 4 + rand() * 8;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + (rand() - 0.5) * 3, y - len);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      // The occasional wildflower
      for (let i = 0; i < 26; i += 1) {
        ctx.fillStyle = rand() > 0.5 ? "rgba(255, 214, 228, 0.85)" : "rgba(255, 252, 235, 0.85)";
        const x = rand() * s;
        const y = rand() * s;
        ctx.beginPath();
        ctx.arc(x, y, 1.6 + rand() * 1.2, 0, Math.PI * 2);
        ctx.fill();
      }
    },
    48
  );

/** Still paddy water: sky-mirror gradient, seedling rows with reflections. */
export const paddyTexture = (water = "#b7d4c9", sprout = "#4e8f3e") =>
  makeTexture(256, (ctx, s) => {
    // The water mirrors the sky: brighter at the top of each tile
    const mirror = ctx.createLinearGradient(0, 0, 0, s);
    mirror.addColorStop(0, "#cfe3d8");
    mirror.addColorStop(0.5, water);
    mirror.addColorStop(1, "#9fc2b6");
    ctx.fillStyle = mirror;
    ctx.fillRect(0, 0, s, s);
    // Faint ripple lines
    for (let i = 0; i < 12; i += 1) {
      ctx.strokeStyle = "rgba(255, 255, 255, 0.14)";
      ctx.lineWidth = 1;
      const y = rand() * s;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(s * 0.3, y + 3, s * 0.7, y - 3, s, y + 1);
      ctx.stroke();
    }
    // Seedlings in rows, each with its watery reflection
    for (let r = 0; r < 6; r += 1) {
      for (let c = 0; c < 9; c += 1) {
        const x = (c / 9) * s + 6 + (rand() - 0.5) * 5;
        const y = (r / 6) * s + 10 + (rand() - 0.5) * 4;
        ctx.strokeStyle = sprout;
        ctx.lineWidth = 1.8;
        for (const lean of [-3, 0, 3]) {
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + lean, y - 9 - rand() * 4);
          ctx.stroke();
        }
        // Reflection smudge
        ctx.strokeStyle = "rgba(78, 143, 62, 0.3)";
        ctx.beginPath();
        ctx.moveTo(x, y + 2);
        ctx.lineTo(x, y + 8);
        ctx.stroke();
      }
    }
  });

/** Radial glow for lantern halos and other soft lights. */
let glowTexture: THREE.CanvasTexture | null = null;
export const getGlowTexture = (): THREE.CanvasTexture => {
  if (!glowTexture) {
    glowTexture = makeTexture(128, (ctx, s) => {
      const g = ctx.createRadialGradient(s / 2, s / 2, 2, s / 2, s / 2, s / 2);
      g.addColorStop(0, "rgba(255, 240, 200, 0.9)");
      g.addColorStop(0.35, "rgba(255, 220, 150, 0.35)");
      g.addColorStop(1, "rgba(255, 210, 130, 0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, s, s);
    });
  }
  return glowTexture;
};
