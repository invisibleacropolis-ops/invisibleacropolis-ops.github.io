# invisibleacropolis-ops.github.io

A navigable WebGL world built with [Vite](https://vitejs.dev/), TypeScript, and [three.js](https://threejs.org/), served at [invisibleacropolis-ops.github.io](https://invisibleacropolis-ops.github.io). The main page is a 3D scene where monuments act as portals — each one links to a standalone demo page (galaxy, cloth sim, fluid, flow field, procedural city, and more).

## Running locally

```sh
npm install
npm run dev
```

Append `?debug` to the URL to reveal the stats panel and lil-gui dev panel on the main page.

## Build

```sh
npm run build
```

This runs three steps in order:

1. `scripts/generate-pages-json.cjs` — scans the repo for `.html` files (excluding `index.html`) and writes `public/pages.json`, the manifest the 3D world reads to place monuments and build navigation.
2. `vite build` — bundles the main app into `dist/`.
3. `scripts/copy-static-pages.cjs` — copies the root-level demo HTML pages (plus the non-HTML assets listed in `EXTRA_ASSETS`) into `dist/`. **This step is required**: Vite only bundles the entries in `vite.config.ts`, so without it every demo link 404s on GitHub Pages.

Preview the production build with `npm run preview`.

## Deployment

`.github/workflows/deploy.yml` runs on every push to `main` (or manually via workflow dispatch): it runs `npm run build` and deploys `dist/` to GitHub Pages.

## Adding a new demo page

1. Drop a self-contained HTML file at the repo root (e.g. `my-demo.html`). It is picked up automatically — `pages.json` gets an entry with the page's `<title>` and default metadata, and the build copies it into `dist/`.
2. Optionally add an entry to the `IA_CONTRACT` map in `scripts/generate-pages-json.cjs` to control its description, category, nav group, priority, status badge, icon, and audience. Pages without an entry land in the "Labs" group marked "Unclassified".
3. If the page references local non-HTML assets (scripts, styles, directories), add them to `EXTRA_ASSETS` in `scripts/copy-static-pages.cjs` so they're copied into `dist/`.
