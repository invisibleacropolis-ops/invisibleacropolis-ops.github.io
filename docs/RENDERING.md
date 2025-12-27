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
