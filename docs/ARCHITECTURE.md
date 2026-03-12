# Architecture

## Entry Point

The application entry point is **`src/index.ts`**. This module orchestrates the entire scene lifecycle:
1.  **Initialization**: Sets up the Three.js `WebGLRenderer`, `Scene`, `Camera`, and `PostProcessing` pipeline.
2.  **Asset Loading**: Loads global configuration and settings from `localStorage`.
3.  **World Generation**: Calls generators for Terrain, Props, Links, and Sky.
4.  **Animation Loop**: Runs the render loop, updating controls, physics/effects, and the composited render pass.

## Module Structure

### `/src/scene` (World Content)
-   **`terrain-heightmap.ts`**: Generates a terrain mesh from a heightmap image, applying a height-based vertex color gradient.
-   **`props.ts`**: Manages the `PropsManager`, which procedurally places trees and rocks on the terrain using parameterized density and clustering.
-   **`links.ts`**: Creates 3D text meshes for navigation links, distributed in geometric patterns (Ring, Square, Random).
-   **`sky.ts`**: Renders the atmospheric sky dome and star field shader.

### `/src/effects` (Visuals)
-   **`postprocessing.ts`**: Configures the `EffectComposer` with a selective UnrealBloomPass and SMAA/FXAA.
-   **`weather.ts`**: Manages scene Fog and Rain particle effects.
-   **`proximityEffect.ts`**: Changes object colors based on distance to the camera (used for Links).
-   **`rayBurst.ts`**: A camera-attached particle effect.

### `/src/controls`
-   **`fps.ts`**: Implements "Fly" style FPS controls with pointer lock for navigation.

### `/src/dev`
-   **`devPanel.ts`**: Implements the `lil-gui` overlay for runtime configuration.

## Data Flow

1.  **Settings Load**: On startup, `index.ts` loads `DevSettings` (Terrain config, Props config, Bloom settings) from `localStorage` or defaults.
2.  **Generation**: `generateWorld()` is called with these settings.
    -   It creates the **Terrain** mesh.
    -   It passes the terrain's `heightAt(x,z)` function to the **Props** and **Links** generators so objects sit correctly on the ground.
3.  **Render Loop**:
    -   `controls.update()` moves the camera.
    -   `weather.update()` animates rain/fog.
    -   `postProcessing.render()` draws the scene + bloom to the canvas.
4.  **Runtime Updates**:
    -   Changing a setting in the **Dev Panel** triggers a callback in `index.ts`, which calls `generateWorld()` again to rebuild the affected parts of the scene asynchronously.

## Rendering Quality Management

Quality policy is centralized across:
- **`src/effects/postprocessing.ts`** for declarative `QUALITY_PRESETS` and post-process knobs.
- **`src/index.ts`** for hardware-based default selection, user override handling, and runtime degradation/recovery.
- **`src/ui/experienceControls.ts`** for the user-facing quality selector.

### Control Loop Responsibilities

1. **Default tier selection** (startup): derives a quality tier from hardware and network hints.
2. **Manual override** (UI): users can force `Low/Medium/High/Ultra`; this persists in local storage.
3. **Dynamic guardrail** (runtime): in auto mode only, sustained low FPS progressively disables expensive effects before lowering tier.
4. **Observability emission**: render metrics are published as structured `CustomEvent` payloads for diagnostics.

This separation keeps quality policy deterministic, visible, and easy for external engineering teams to audit or tune.
