# Architecture

## Runtime entry point

`index.html` mounts the full-screen canvas and minimal UI overlay, then loads the module entry
point at `/src/index.ts`. This module is responsible for creating the renderer, scene graph,
post-processing pipeline, and bootstrapping async content such as link labels.

## Module overview

### `/src/index.ts`
* Creates the Three.js renderer, scene, and camera.
* Builds the world graph (terrain, valleys, roads, water, props, sky, weather) using a shared
  deterministic seed.
* Configures post-processing (bloom + anti-aliasing) and runtime controls (FPS movement, debug
  stats).
* Loads link labels via `createLinks()` and wires up pointer interaction effects.

### `/src/data/pages.ts`
* Fetches `/pages.json` from the `public/` directory.
* Validates the payload as an array of page entries.
* Exposes the `PageEntry` type and `loadPages()` helper for scene modules.

### `/src/scene/*`
* **`terrain.ts`**: Generates the heightfield mesh and provides `heightAt()` for world placement.
* **`valleys.ts`**: Adds carved valley bands layered over the terrain.
* **`roads.ts`**: Builds spline roads using the same seed so they stay aligned with terrain.
* **`water.ts`**: Creates animated water and river splines.
* **`props.ts`**: Drops ambient props (rocks, foliage, etc.) tied to the world seed.
* **`sky.ts`**: Generates the shader-driven sky dome and star field.
* **`links.ts`**: Builds ring-distributed label meshes from `pages.json`.
* **`palette.ts`**: Shared color palette for terrain and props.

### `/src/interaction/*` and `/src/effects/*`
* **`interaction/raycast.ts`**: Pointer raycasting for hover + click detection.
* **`effects/hoverGlow.ts`**: Time-based emissive glow tween on hover.
* **`effects/rayBurst.ts`**: Burst of rays on hover for feedback.
* **`effects/postprocessing.ts`**: Bloom + anti-aliasing composer setup.
* **`effects/weather.ts`**: Fog + optional rain streaks.

### `/src/controls/*`
* **`controls/fps.ts`**: WASD + pointer-lock FPS navigation with terrain-aware height.

## Data flow

1. **Startup**: `index.html` loads `/src/index.ts`.
2. **World build**: `index.ts` constructs the renderer, scene, camera, and world meshes using
   `WORLD_SEED` and palette values.
3. **Async content**: `createLinks()` loads `pages.json` through `loadPages()` and fetches the
   font JSON. It returns label meshes organized in a group.
4. **Interaction wiring**: `createRaycast()` attaches pointer listeners to the renderer canvas
   and fires hover/click callbacks for link labels.
5. **FX timing**: `createHoverGlow()` and `createRayBurst()` are ticked each frame in the main
   animation loop (`animate`).
6. **Render loop**: `animate()` updates water, sky, weather, controls, link visibility, and
   post-processing before rendering the frame.

This flow keeps all scene state centralized in `index.ts`, while scene-specific logic lives in
modules under `src/scene`, and user interaction/FX are isolated in `src/interaction` and
`src/effects`.
