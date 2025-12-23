# World Generation

The Three.js scene is deterministic: a single seed drives terrain noise, prop placement, road
curves, and water paths. This makes it safe to iterate on visuals without layout shifts.

## Seed control

`src/index.ts` defines a single `WORLD_SEED` constant. That seed is passed into every generator:

- `createTerrainMesh` (`src/scene/terrain.ts`)
- `createValleyMesh` (`src/scene/valleys.ts`)
- `createRoads` (`src/scene/roads.ts`)
- `createWater` (`src/scene/water.ts`)
- `createProps` (`src/scene/props.ts`)
- `createSky` (`src/scene/sky.ts`)
- `createWeatherEffects` (`src/effects/weather.ts`)

Changing `WORLD_SEED` is the only required knob to regenerate the scene deterministically.
The noise fields, valley bands, prop distribution, and road/water splines all derive from the
same base seed and internal seed offsets.

## Terrain and valley parameters

`createTerrainMesh` options:
- `width` / `depth`: World footprint in world units.
- `segments`: Grid resolution for the heightfield (LOD variants are derived from this).
- `height`: Vertical scale for the heightfield.
- `palette`: Color palette for wireframe shading.

`createValleyMesh` options:
- `width` / `depth` / `segments`: Match the terrain dimensions for alignment.
- `height`: Vertical depth scale for valley bands.
- `palette`: Uses a different palette entry for contrast.

The terrain mesh exposes `heightAt(x, z)` so other generators can conform to surface height.

## Roads

`createRoads` options (`src/scene/roads.ts`):
- `count`: Number of spline road paths.
- `elevation`: Vertical offset above the terrain.
- `heightAt`: Optional callback so roads follow terrain height.
- `width` / `depth` control the placement bounds.

Roads use catmull-rom splines sampled into line segments, and they share the world seed so
layouts stay consistent with terrain changes.

## Water + rivers

`createWater` options (`src/scene/water.ts`):
- `segments`: Mesh resolution for the animated plane.
- `amplitude` / `speed`: Vertex shader wave height and phase speed.
- `tint`: Base emissive-like color for the water surface.
- `elevation`: Offset above the terrain.
- `riverCount` / `riverWidth`: Number and thickness of river strips.
- `heightAt`: Optional callback so river splines ride above the terrain.

The water plane is animated via shader uniforms (`time`, `amplitude`, `speed`) and updated
per frame in the main render loop.

## Props

`createProps` options (`src/scene/props.ts`):
- `width` / `depth`: Sampling bounds.
- `heightAt`: Required callback so trees/bushes/rocks sit on the terrain.
- `palette`: Colors for vegetation and rocks.

Prop sampling is weighted by slope and height, so trees prefer flatter ground while rocks
populate steeper terrain.

## Sky + day/night

`createSky` options (`src/scene/sky.ts`):
- `radius`: Size of the sky dome.
- `topColor` / `bottomColor` / `nightColor`: Gradient colors for day/night.
- `cloudColor` / `cloudScale` / `cloudSpeed` / `cloudIntensity`: Cloud styling.
- `starColor` / `starCount` / `starSize`: Star field tuning.
- `dayDuration`: Length of a full day/night cycle in seconds.

The sky update returns `sunDirection` and `dayFactor`, which `index.ts` uses to drive lighting.

## Weather

`createWeatherEffects` options (`src/effects/weather.ts`):
- `fogColor` / `fogDensity`: Fog parameters for the scene.
- `rainEnabled`: Toggle for rain streak meshes.
- `rainCount` / `rainHeight` / `rainSpeed`: Density and motion of rain.
- `rainOpacity` / `rainColor` / `rainWireframe`: Rain material styling.

When rain is enabled, drops are updated each frame using the elapsed `delta` time.
