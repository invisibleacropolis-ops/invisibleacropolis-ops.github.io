# Architecture

## Entry point

`index.html` is the runtime entry point for the site. It mounts the full-screen canvas and the minimal UI overlay, then bootstraps the Three.js scene via the module script at `/src/index.ts`.

## Modules

### `/src/index.ts`

* Creates the Three.js renderer, scene, and camera.
* Adds the initial mesh and lighting to make the scene visible immediately.
* Handles resize events and the render loop.
* Uses `loadPages()` to fetch `pages.json` and apply any scene adjustments based on the available page data.

### `/src/data/pages.ts`

* Fetches `/pages.json` from the public directory.
* Parses and validates the payload as an array of page entries.
* Exposes the `PageEntry` type and `loadPages()` helper for scene modules.
