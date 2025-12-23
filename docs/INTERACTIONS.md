# Interactions

This document covers how link labels are positioned, how hover/click detection works, and
how the hover FX timing is configured.

## Link placement

Link labels are generated in `src/scene/links.ts` by loading `public/pages.json` and building
`TextGeometry` meshes for each page title.

- **Layout**: Each label is positioned on a ring using a configurable `radius`. The angle for
  each label is evenly spaced (`2π / pageCount`).
- **Elevation**: The base Y position uses the `elevation` option with a small sinusoidal
  offset, keeping labels from appearing perfectly flat.
- **Orientation**: Each label uses `mesh.lookAt(0, y, 0)` so the text faces inward toward the
  world center.
- **Metadata**: `mesh.userData.linkUrl` stores the URL, and `userData.baseEmissive` /
  `userData.hoverEmissive` store emissive colors for highlight effects.

## Visibility culling

`links.ts` limits the number of visible labels to reduce clutter:

1. A `THREE.Frustum` is built from the camera view/projection matrix.
2. Labels inside the frustum and within `maxDistance` are collected.
3. Candidates are sorted by distance to the camera.
4. Only the closest `maxVisible` labels (clamped to 2–4) are shown.

This runs every animation frame in `index.ts` via `linksScene.updateVisibility(camera)`.

## Hover and click detection

`src/interaction/raycast.ts` attaches pointer listeners to the renderer canvas:

- **Pointer move**: Updates a `THREE.Raycaster` and checks intersections against label meshes.
- **Hover start**: Sets emissive colors (if enabled), triggers FX hooks, and changes the cursor
  to `pointer`.
- **Hover end**: Resets emissive colors, stops FX hooks, and resets the cursor.
- **Click**: Navigates to `window.location.href = linkUrl` for the intersected label.

## Hover FX timing

Hover-specific effects are centralized in `src/index.ts`:

- **Glow tween** (`createHoverGlow` in `src/effects/hoverGlow.ts`):
  - `duration: 2` seconds to reach the peak emissive intensity.
  - `fadeOutDuration: 0.6` seconds to return to base intensity after hover ends.
  - `baseIntensity: 1` and `peakIntensity: 2.8` define the emissive range.
  - The tween uses an ease-out cubic curve and updates every animation frame.

- **Ray burst** (`createRayBurst` in `src/effects/rayBurst.ts`):
  - `raysPerSecond: 20` controls spawn rate.
  - `maxRays: 80` caps the active ray count.
  - `update(timeSeconds, delta)` is called each frame to advance lifetimes.

These effects start/stop in the hover callbacks passed to `createRaycast()`.
