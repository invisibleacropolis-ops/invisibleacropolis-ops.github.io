# World Generation

This project keeps the Three.js scene deterministic so that a given seed always produces the
same terrain, valleys, and road layout. This makes it safe to iterate on visuals without
surprising layout shifts.

## Deterministic seeds

The entry point (`src/index.ts`) defines a single `WORLD_SEED` constant. That seed flows into:

- `createTerrainMesh` (`src/scene/terrain.ts`) for the heightfield.
- `createValleyMesh` (`src/scene/valleys.ts`) for carved bands.
- `createRoads` (`src/scene/roads.ts`) for spline roads.
- `createWater` (`src/scene/water.ts`) for animated water and river splines.

Changing `WORLD_SEED` is the only required knob to regenerate the scene deterministically. The
noise, valley bands, and road curves all derive their pseudo-random values from the same seed,
so rerunning with the same seed always yields the same world.

## Tips for engineers

- Keep the seed stored in a single constant so that animations, roads, and terrain match.
- If you need multiple scenes, derive sub-seeds by hashing the base seed instead of using
  `Math.random()`.
- When adding new generators, accept a `seed` parameter and build on the shared RNG utilities
  in `src/scene/random.ts`.

## Water parameters

`createWater` in `src/scene/water.ts` accepts the following tuning parameters for animation and
color styling:

- `amplitude`: Controls the sine wave height applied in the vertex shader. Higher values
  create larger ripples.
- `speed`: Scales the wave phase progression. Higher values increase the rate of motion.
- `tint`: Base color for the water surface and river strips. Use brighter values for
  emissive-like glow that responds well to bloom.

## Sky parameters

`createSky` in `src/scene/sky.ts` builds a shader-driven sky dome and star field. The following
options are exposed for tuning:

- `radius`: World-space radius of the sky sphere. Increase to ensure it stays behind far
  geometry.
- `topColor` / `bottomColor`: Gradient colors for the daytime sky.
- `nightColor`: Base tone used when the sun dips below the horizon.
- `cloudScale`: Frequency multiplier for the cloud noise field. Higher values produce
  smaller, tighter cloud bands.
- `cloudSpeed`: Rate that the cloud noise scrolls over the sky.
- `cloudIntensity`: Strength of the cloud overlay on the gradient.
- `starCount`: Number of points emitted for the night sky.
- `starSize`: Point size (in screen pixels) used for stars.
- `dayDuration`: Number of seconds for a full day/night cycle; shorter values make the sun
  animate faster.

## Weather parameters

`createWeatherEffects` in `src/effects/weather.ts` supplies lightweight fog and optional rain
streaks:

- `fogColor`: Tint for the scene fog (used by Three.js `FogExp2`).
- `fogDensity`: Exponential fog density; keep low for a light haze.
- `rainEnabled`: Toggles the wireframe rain streak mesh on/off.
- `rainCount`: Number of streak meshes spawned when rain is enabled.
- `rainHeight`: Spawn height for rain drops before they fall.
- `rainSpeed`: Base fall speed; each drop is randomized around this value.
- `rainOpacity`: Material opacity for rain streaks.
- `rainWireframe`: Set to `true` to keep rain streaks as wireframes.
