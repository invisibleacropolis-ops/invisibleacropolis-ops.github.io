# Castle precinct and navigation review

The castle keeps its original world centre and gate anchor. Its shared layout defines the courtyard, dry garden, forecourt, tea pavilion, shrine, terraced ramp, veranda, entrance hall, reception and scroll room. Upper floors remain exterior scenery.

## Architecture and navigation

`castleLayout.ts` owns the coordinates, surfaces, blockers and authored A* graph. `castle.ts` constructs the visible architecture and reserves its ground before planting. `castleVisits.ts` joins nearby roaming areas to the graph with terrain/obstacle checks and a bounded grid search where direct approaches are obstructed. Shrine and village blockers come from their actual mesh bounds; transparent effects do not block movement.

Small visitors can enter the rooms. Deer and the oni use outdoor destinations. Visiting animals choose two stops and retrace a safe connector home; the oni continues patrolling. Visitor roots and articulated feet share the castle surface sampler. Named ambient actors pause when hidden for a story.

The oni tale retains its actor paths and gate anchor. Two camera offsets now stay outside the expanded wall, with the homeward shot recovering its previous meadow framing after leaving the castle.

## Repeating verification

- `npm run verify:castle` exercises the production layout, A*, surface sampler and movement at 120, 60, 24, 4 and 1 fps. It checks eligible routes, blocked entrances, continuous surfaces, accurate arrival and returning home.
- `npm run verify:kami` exercises all eight real articulated models and IK against terrain.
- `npx tsc --noEmit` and `npm run build` check types and the production bundle.
- With the local Vite page open in Playwright, run `scripts/review-castle.tool.js`. Call `page.__castleReview.surfaces()` and `page.__castleReview.simulate(1000, .25)`; inspect `failures` (must be empty), visits and return counts. A separate 350-second run at `1/60` checks normal frame steps. This adapter instruments only the local HTTP response, not the shipped app.
- Use the existing `scripts/review-story-cameras.tool.js` for Digit4; run through 98 seconds and call `finish()`. It checks framing, actor clearance, natural completion and exact foliage restoration.

## Evidence from this implementation

- 122 production routes and more than 234,000 sampled surface positions pass.
- 485 raycasts against actual rendered walking surfaces agree with the movement sampler within three world units.
- A 1,000-second browser run at 4 fps completed trips for all seven visitors without sampled mesh collisions or floor errors; all six non-patrol visitors returned home. A separate 350-second run at 60 fps was also clear.
- The oni story passed 960 sampled camera checks, naturally completed, and restored foliage. Closest measured camera-to-subject distance: approximately 244 world units.
- Local images in `.captures/` cover the exterior, entry, both furnished rooms, pavilion, shrine, garden and story shots. Images stay local and are excluded from the production build.
- Before the final small decorative refinements, fresh-scene measurements at camera `(2800,1000,-2600)` looking at `(2050,460,-1400)` were 4,868 versus 5,405 draw calls and 1,544,894 versus 1,568,740 triangles across the complete multipass frame. Median of five synchronous render samples was 35.0 versus 34.7 ms. These short local samples are a comparison, not a hardware-independent FPS guarantee.

No dependencies were added and no deployment was performed. Existing unrelated scene and story edits were retained.
