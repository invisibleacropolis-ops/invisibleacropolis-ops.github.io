# Rendering Pipeline

The application uses a custom render loop to achieve its stylized look.

## Post-Processing
**Module**: `src/effects/postprocessing.ts`

We avoid the standard `renderer.render()` in favor of `postProcessing.render()`, which manages two `EffectComposer` passes:

1.  **Bloom Pass**:
    -   The scene is rendered with all non-blooming objects masked to black.
    -   An `UnrealBloomPass` is applied to generate the glow.
    -   **Selective Bloom**: Only objects in `BLOOM_LAYER` (Layer 1) contribute to the bloom.
2.  **Composite Pass**:
    -   The standard scene is rendered.
    -   The Bloom texture is additively blended on top.
    -   **Anti-Aliasing**: SMAA or FXAA is applied as a final pass.

## Wireframes & Materials
-   Most objects use `MeshBasicMaterial` with `wireframe: true`.
-   **Vertex Colors**: The Terrain uses vertex coloring to create smooth gradients along the wireframe lines.
-   **Fog**: `scene.fog` (Exp2) is used to fade distant objects into the background color. *Note: Fog density must be tuned carefully to scene scale to avoid washing out colors.*

## Performance
-   **LOD**: Terrain uses a basic LOD system (not fully detailed in current implementation but supported by architecture).
-   **Instancing**: Trees and Rocks use `THREE.InstancedMesh` to render thousands of objects with single draw calls per geometry type.

## Quality Presets and Budgets

The renderer exposes four quality tiers (`low`, `medium`, `high`, `ultra`) from `src/effects/postprocessing.ts`.

| Tier | Target TTI | Target Frame Time | Memory Budget | Post FX |
| --- | --- | --- | --- | --- |
| Low | 2600ms | 25ms (~40 FPS) | 700 MB | Bloom reduced, no AA, rain disabled |
| Medium | 2200ms | 20ms (~50 FPS) | 1000 MB | Moderate bloom, FXAA, rain disabled |
| High | 1800ms | 16.7ms (60 FPS) | 1400 MB | Full bloom, SMAA, rain enabled |
| Ultra | 1600ms | 14ms (~71 FPS) | 2200 MB | Strong bloom, SMAA, rain enabled |

### Runtime Heuristic + Dynamic Degradation

`src/index.ts` chooses an initial quality tier by inspecting:
- `navigator.deviceMemory`
- `navigator.hardwareConcurrency`
- `navigator.connection.effectiveType`
- `navigator.connection.saveData`

The runtime monitor smooths frame times and degrades in this order when sustained FPS falls below budget in auto mode:
1. Disable rain updates/visibility.
2. Disable bloom pass compositing.
3. Drop tier from `ultra -> high -> medium -> low`.

When performance recovers for a sustained window, it re-enables bloom/rain and climbs back up toward the selected target tier.

### Observability Hook

A structured event is emitted every ~1s:
- Event name: `render-metrics`
- Payload: FPS, frame time, draw calls, primitive counts, object counts, visible link count, quality tier/source, and toggled effects.

This enables external telemetry collectors to subscribe with:
```ts
window.addEventListener("render-metrics", (event) => {
  const metrics = (event as CustomEvent).detail;
  // forward to analytics / logs
});
```
