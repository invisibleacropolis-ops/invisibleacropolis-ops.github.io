# ASCII Cloud Layer (3D Vector Glyph Atmospherics)

## Purpose
The ASCII Cloud Layer introduces a living atmospheric stratum to the world scene. It is composed of **3D mesh instances built from vector font glyph shapes**, rendered as translucent, animated cloud bands above the terrain.

This feature is intentionally aesthetic-first:
- glyphs reveal progressively,
- mutate over time,
- drift and breathe in layered motion,
- fade in/out to preserve the "numinous" cloud feeling.

## Entry Points
- `src/scene/asciiClouds.ts`: cloud field module implementation.
- `src/index.ts`: world integration and frame-loop updates.

## Runtime Architecture

### Module API
`createAsciiCloudField(options)` returns:
- `group: THREE.Group` containing all cloud-layer glyph meshes.
- `update(timeSeconds, deltaSeconds)` animation tick called from the main render loop.

### Data Model (per glyph)
Each glyph tracks independent animation channels:
- orbital placement (`radius`, `angle`, `driftSpeed`),
- vertical wave motion (`baseY`, `waveSpeed`, `waveAmplitude`),
- staged reveal (`revealDelay`, `revealDuration`),
- lifecycle and mutation (`lifeStart`, `lifeDuration`, `nextMutationAt`, `mutationCadence`).

This allows non-uniform movement and opacity without requiring particle systems.

### Geometry Strategy
- Glyph meshes are generated via `FontLoader` + `font.generateShapes(...)`, producing vector-based shape geometry.
- Geometries are memoized (`geometryCache`) by glyph/size key to avoid repeated shape tessellation.
- Bounding-box recentering keeps each glyph pivot centered for consistent scaling/rotation.

### Visual Behavior
1. **Formation phase**: glyph opacity ramps in with per-glyph reveal delay.
2. **Cloud life phase**: opacity follows sinusoidal life/breath curves.
3. **Mutation phase**: glyph character swaps at scheduled intervals to create shifting symbolic texture.
4. **Layer drift phase**: parent group rotates slowly, producing macro cloud motion.

## Defaults and Tunables
Current integration values in `src/index.ts`:
- `seed: WORLD_SEED + 77`
- `layerCount: 4`
- `glyphsPerLayer: 84`
- `baseRadius: 1200`
- `glyphSize: 22`
- `verticalSpacing: 115`

Tune these for performance/aesthetic goals:
- Increase `glyphsPerLayer` for denser cloud fields.
- Increase `layerCount` for depth.
- Lower `glyphSize` for finer texture.

## Performance Considerations
- Uses unlit `MeshBasicMaterial` with transparency (`depthWrite: false`) for lightweight rendering.
- Geometry caching avoids excessive allocations during mutation.
- Animation is CPU-driven but bounded (fixed glyph count).
- Bloom is enabled on the cloud group to integrate with the scene's luminous style.

## Integration Notes
- Created after sky initialization and added to `world`.
- Updated every animation frame after sky/weather updates.
- Designed to be independent of terrain regeneration, so world edits do not recreate clouds unless page reloads.

## Validation
Validated with production build (`npm run build`) to ensure type-safe compile/bundle completion.
