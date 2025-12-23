# Interactions

## Link placement

The link labels are generated in `src/scene/links.ts` by loading `public/pages.json` and building `TextGeometry` meshes for each page title.

- **Layout**: Each label is positioned on a ring with a wide radius (`radius` option) so the links surround the world. The angle for each label is evenly spaced (`2π / pageCount`).
- **Elevation**: The base Y position uses the configured `elevation` with a small sinusoidal offset to keep the labels from being perfectly flat.
- **Orientation**: Each label uses `mesh.lookAt(0, y, 0)` so the text faces inward toward the world center.

## Frustum-based visibility

To keep the world uncluttered, visibility is limited to roughly three links at a time:

1. Build a `THREE.Frustum` from the camera view/projection matrix.
2. Collect labels whose bounding volumes intersect the frustum.
3. Sort those candidates by distance to the camera.
4. Mark only the closest `maxVisible` (default `3`) as visible and hide the rest.

This update runs every animation frame so visibility tracks camera motion and the world rotation.

## Hover and click detection

`src/interaction/raycast.ts` uses a `THREE.Raycaster` against the link meshes to detect hover and click events.

- Pointer movement updates the ray and highlights the intersected label by adjusting emissive color.
- Clicking a label navigates to `window.location.href = linkUrl`.
