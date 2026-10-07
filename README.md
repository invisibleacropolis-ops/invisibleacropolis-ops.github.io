# invisibleacropolis-ops.github.io

A console-style index and a navigable WebGL world built with [Vite](https://vitejs.dev/), TypeScript, and [three.js](https://threejs.org/), served at [invisibleacropolis-ops.github.io](https://invisibleacropolis-ops.github.io). The main page is a minimal visual directory of every published experience. The Kakuriyo world lives at `/kami.html`; its monuments still link to the standalone demos.

## Running locally

```sh
npm install
npm run dev
```

Append `?debug` to `/kami.html` to reveal the stats panel and lil-gui dev panel in the world. `/kami.html?classic` opens the earlier wireframe world, and `/kami.html?kami` opens the character atelier.

## Build

```sh
npm run build
```

This runs three steps in order:

1. `scripts/generate-pages-json.cjs` — scans the repo for demo `.html` files (excluding the landing and Kami entry pages) and writes `public/pages.json`, the manifest both the landing page and 3D world read for navigation.
2. `vite build` — bundles the landing page, Kami world, and support portals into `dist/`.
3. `scripts/copy-static-pages.cjs` — copies the root-level demo HTML pages (plus the non-HTML assets listed in `EXTRA_ASSETS`) into `dist/`. **This step is required**: Vite only bundles the entries in `vite.config.ts`, so without it every demo link 404s on GitHub Pages.

Preview the production build with `npm run preview`.

## Automatic Playwright screen exports

Use [the screen-export helper](docs/playwright-screen-export.md) alongside an existing Playwright tab to capture one viewport screenshot per second automatically. Run `node scripts/playwright-screen-export.cjs tool-start <label>`, then pass the returned file to Playwright's code tool. Each run gets a separate, git-ignored `.captures/playwright/` folder; filenames contain elapsed timecodes and UTC timestamps. Stop with `page.__screenExport.stop()`, review the sequence, then use the helper's guarded `clean` command. A native Node Playwright API is also provided, including a JSON timing index.

Agent skill: `playwright-screen-export` (installed in the local Codex skills directory) explicitly references this helper. Screenshots sample browser output, not the physical display; a 1 Hz sequence can miss a one-frame glitch.

## Deployment

`.github/workflows/deploy.yml` runs on every push to `main` (or manually via workflow dispatch): it runs `npm run build` and deploys `dist/` to GitHub Pages.

## Adding a new demo page

1. Drop a self-contained HTML file at the repo root (e.g. `my-demo.html`). It is picked up automatically — `pages.json` gets an entry with the page's `<title>` and default metadata, and the build copies it into `dist/`.
2. Optionally add an entry to the `IA_CONTRACT` map in `scripts/generate-pages-json.cjs` to control its description, category, nav group, priority, status badge, icon, and audience. Pages without an entry land in the "Labs" group marked "Unclassified".
3. If the page references local non-HTML assets (scripts, styles, directories), add them to `EXTRA_ASSETS` in `scripts/copy-static-pages.cjs` so they're copied into `dist/`.
