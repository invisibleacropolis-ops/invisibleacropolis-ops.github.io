# World Generation

This project keeps the Three.js scene deterministic so that a given seed always produces the
same terrain, valleys, and road layout. This makes it safe to iterate on visuals without
surprising layout shifts.

## Deterministic seeds

The entry point (`src/index.ts`) defines a single `WORLD_SEED` constant. That seed flows into:

- `createTerrainMesh` (`src/scene/terrain.ts`) for the heightfield.
- `createValleyMesh` (`src/scene/valleys.ts`) for carved bands.
- `createRoads` (`src/scene/roads.ts`) for spline roads.

Changing `WORLD_SEED` is the only required knob to regenerate the scene deterministically. The
noise, valley bands, and road curves all derive their pseudo-random values from the same seed,
so rerunning with the same seed always yields the same world.

## Tips for engineers

- Keep the seed stored in a single constant so that animations, roads, and terrain match.
- If you need multiple scenes, derive sub-seeds by hashing the base seed instead of using
  `Math.random()`.
- When adding new generators, accept a `seed` parameter and build on the shared RNG utilities
  in `src/scene/random.ts`.
