import * as THREE from "three";

/**
 * The texture forge of Kakuriyo. Every surface pattern is painted onto a
 * canvas at load time — wood grain, roof tiles, castle stone, thatch,
 * shoji paper — so the world stays asset-free while shedding flat color.
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
  texture.anisotropy = 4;
  return texture;
};

let seedState = 1234;
const rand = () => {
  seedState = (seedState * 1664525 + 1013904223) >>> 0;
  return seedState / 0x100000000;
};

/** Vertical wood grain: base tone with darker streaks and knots. */
export const woodTexture = (base = "#8a5a40", streak = "#6b4028") =>
  makeTexture(256, (ctx, s) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = streak;
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.5;
    for (let i = 0; i < 26; i += 1) {
      const x = rand() * s;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.bezierCurveTo(x + (rand() - 0.5) * 18, s * 0.33, x + (rand() - 0.5) * 18, s * 0.66, x + (rand() - 0.5) * 12, s);
      ctx.stroke();
    }
    ctx.globalAlpha = 0.35;
    for (let i = 0; i < 5; i += 1) {
      ctx.beginPath();
      ctx.ellipse(rand() * s, rand() * s, 4 + rand() * 5, 8 + rand() * 8, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  });

/** Kawara roof tiles: overlapping scalloped rows. */
export const roofTexture = (base = "#4b5d73", shadow = "#39485a", edge = "#5f7288") =>
  makeTexture(256, (ctx, s) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, s, s);
    const rows = 8;
    const cols = 8;
    const rh = s / rows;
    const cw = s / cols;
    for (let r = 0; r < rows; r += 1) {
      const offset = (r % 2) * cw * 0.5;
      ctx.fillStyle = shadow;
      ctx.fillRect(0, r * rh + rh * 0.72, s, rh * 0.28);
      for (let c = -1; c <= cols; c += 1) {
        ctx.strokeStyle = edge;
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.arc(c * cw + offset + cw / 2, r * rh + rh * 0.8, cw * 0.5, Math.PI, 0);
        ctx.stroke();
      }
    }
  });

/** White castle plaster with the faintest weathering. */
export const plasterTexture = (base = "#f3efe4") =>
  makeTexture(128, (ctx, s) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 500; i += 1) {
      const v = 232 + Math.floor(rand() * 20);
      ctx.fillStyle = `rgba(${v - 8}, ${v - 10}, ${v - 18}, 0.25)`;
      ctx.fillRect(rand() * s, rand() * s, 2, 2);
    }
  });

/** Ishigaki: the irregular fitted stone of castle foundations. */
export const stoneWallTexture = (base = "#9a988c", seam = "#6f6d61", lit = "#b3b1a3") =>
  makeTexture(256, (ctx, s) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, s, s);
    const rows = 5;
    const rh = s / rows;
    for (let r = 0; r < rows; r += 1) {
      let x = -(rand() * 30);
      while (x < s) {
        const w = 28 + rand() * 40;
        const jitterY = (rand() - 0.5) * 8;
        ctx.fillStyle = rand() > 0.5 ? base : lit;
        ctx.strokeStyle = seam;
        ctx.lineWidth = 3.4;
        ctx.beginPath();
        // Slightly irregular quad per stone
        ctx.moveTo(x + rand() * 5, r * rh + jitterY);
        ctx.lineTo(x + w - rand() * 5, r * rh + (rand() - 0.5) * 8);
        ctx.lineTo(x + w - rand() * 6, (r + 1) * rh + (rand() - 0.5) * 8);
        ctx.lineTo(x + rand() * 6, (r + 1) * rh + jitterY);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        x += w;
      }
    }
  });

/** Thatched roof: dense vertical straw strokes. */
export const thatchTexture = (base = "#a98a58", dark = "#8a6c40", light = "#c2a570") =>
  makeTexture(256, (ctx, s) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 900; i += 1) {
      ctx.strokeStyle = rand() > 0.5 ? dark : light;
      ctx.globalAlpha = 0.4 + rand() * 0.4;
      ctx.lineWidth = 1.6;
      const x = rand() * s;
      const y = rand() * s;
      const len = 14 + rand() * 22;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (rand() - 0.5) * 5, y + len);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  });

/** Shoji paper: warm white panes in a dark timber lattice. */
export const shojiTexture = (paper = "#f6f0df", frame = "#584032") =>
  makeTexture(128, (ctx, s) => {
    ctx.fillStyle = paper;
    ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = frame;
    ctx.lineWidth = 5;
    const cells = 4;
    for (let i = 0; i <= cells; i += 1) {
      const p = (i / cells) * s;
      ctx.beginPath();
      ctx.moveTo(p, 0);
      ctx.lineTo(p, s);
      ctx.moveTo(0, p);
      ctx.lineTo(s, p);
      ctx.stroke();
    }
  });

/** Meadow mottle: multiplies over the terrain's vertex colors. */
export const grassTexture = () =>
  makeTexture(
    256,
    (ctx, s) => {
      ctx.fillStyle = "#f2f2ee";
      ctx.fillRect(0, 0, s, s);
      for (let i = 0; i < 1600; i += 1) {
        const v = 214 + Math.floor(rand() * 40);
        ctx.fillStyle = `rgba(${v - 14}, ${v}, ${v - 22}, 0.5)`;
        const x = rand() * s;
        const y = rand() * s;
        ctx.fillRect(x, y, 2, 4 + rand() * 5);
      }
    },
    48
  );

/** Still paddy water: pale sky-mirror with seedling rows. */
export const paddyTexture = (water = "#b7d4c9", sprout = "#5f9c4a") =>
  makeTexture(128, (ctx, s) => {
    ctx.fillStyle = water;
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = sprout;
    for (let r = 0; r < 6; r += 1) {
      for (let c = 0; c < 8; c += 1) {
        const x = (c / 8) * s + 6;
        const y = (r / 6) * s + 8;
        ctx.fillRect(x, y, 3, 7);
        ctx.fillRect(x + 3, y - 2, 2, 6);
      }
    }
  });
