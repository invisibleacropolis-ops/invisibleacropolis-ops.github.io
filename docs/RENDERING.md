# Rendering & Post-Processing

This project renders the scene with a post-processing pipeline that adds bloom and anti-aliasing to emphasize the wireframe glow while keeping the environment crisp.

## Post-processing pipeline

The pipeline is created in `src/effects/postprocessing.ts` via `createPostProcessing` and is wired up in `src/index.ts`.

1. **RenderPass**: draws the scene normally.
2. **UnrealBloomPass**: adds glow to emissive wireframe elements.
3. **Anti-aliasing**: either `SMAAPass` (default) or `FXAA` shader pass.

## Effect controls

### Bloom

Bloom parameters live in `src/index.ts` and are passed into `createPostProcessing`:

- `strength`: overall bloom intensity. Tuned to `1.25` to enhance wireframe glow without washing out the terrain.
- `radius`: bloom spread radius. Tuned to `0.5` to keep edges defined.
- `threshold`: brightness cutoff. Tuned to `0.15` to avoid blooming the entire scene.

If the glow looks too strong, reduce `strength` in small increments (e.g. `1.25` → `1.1`). If the glow looks too faint, increase `strength` or lower `threshold` slightly.

### Anti-aliasing

Anti-aliasing is configured via the `antiAlias` option in `createPostProcessing`:

- `"smaa"` (default): higher quality edge smoothing, uses `SMAAPass`.
- `"fxaa"`: cheaper shader pass, useful for lower-end devices.
- `"none"`: disables additional anti-aliasing (renderer-level MSAA still applies).

When using `"fxaa"`, the resolution uniform is updated during resizes to keep edges stable at different pixel ratios.
