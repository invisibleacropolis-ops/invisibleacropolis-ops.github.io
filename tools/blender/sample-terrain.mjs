// Samples Kakuriyo's own terrain function (src/yokai/terrain.ts heightAt) on
// the grid mountains_build.py works on, so the mountains in Blender rise out
// of exactly the valley the game renders.
//   node tools/blender/sample-terrain.mjs   ->  tools/blender/.cache/terrain.f32
// Row-major float32, rows = z, cols = x, N x N samples over [-EXTENT, EXTENT].
import { mkdirSync, writeFileSync } from "node:fs";
import { build } from "esbuild";

export const N = 1024;
export const EXTENT = 6500;

const bundled = await build({
  stdin: { contents: 'export { heightAt } from "./src/yokai/terrain.ts";', resolveDir: process.cwd() },
  bundle: true, write: false, platform: "node", format: "esm", logLevel: "silent",
});
const { heightAt } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`);
const grid = new Float32Array(N * N);
const step = (2 * EXTENT) / (N - 1);
for (let row = 0; row < N; row++) {
  const z = -EXTENT + row * step;
  for (let col = 0; col < N; col++) grid[row * N + col] = heightAt(-EXTENT + col * step, z);
}
mkdirSync("tools/blender/.cache", { recursive: true });
writeFileSync("tools/blender/.cache/terrain.f32", Buffer.from(grid.buffer));
let lo = Infinity, hi = -Infinity;
for (const h of grid) { lo = Math.min(lo, h); hi = Math.max(hi, h); }
console.log(`terrain.f32: ${N}x${N}, step ${step.toFixed(2)}, range ${lo.toFixed(0)}..${hi.toFixed(0)}`);
