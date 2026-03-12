# Pages Index Data

## Overview
`public/pages.json` is generated at build time by `scripts/generate-pages-json.cjs`. The script
walks the repository, discovers HTML files, and produces an ordered IA contract for top-level
destinations (excluding `index.html`).

This contract is consumed in two places:
- `src/ui/navigationHub.ts` renders grouped, text-based destination navigation.
- `src/scene/links.ts` renders 3D world labels from the exact same priority-sorted source.

Because both systems share `src/data/pages.ts`, visual and textual navigation remain synchronized.

## IA Contract Schema
The output JSON is an array of objects with the following shape:

```json
[
  {
    "title": "Interactive 3D Nebula Galaxy",
    "url": "/galaxy.html",
    "description": "Interactive 3D galaxy scene with cinematic controls.",
    "category": "Showcase",
    "navGroup": "Start here",
    "priority": 10,
    "statusBadge": "Featured",
    "iconToken": "🌌",
    "audience": "All visitors"
  }
]
```

Field details:
- `title`: Human-readable destination title.
- `url`: Root-relative URL path.
- `description`: Short explanation shown in textual navigation.
- `category`: Domain classification (e.g., `GPU Compute`, `Rendering Research`).
- `navGroup`: One of `Start here`, `Workflows`, `Reference`, or `Labs`.
- `priority`: Lower number means higher prominence. This drives both overlay and 3D link order.
- `statusBadge`: Lifecycle badge (`Featured`, `Stable`, `Beta`, etc.).
- `iconToken`: Lightweight symbol/emoji for quick visual scanning.
- `audience`: Intended user persona for the destination.

## Generation steps

1. `scripts/generate-pages-json.cjs` walks the repo, skipping `.git/`, `node_modules/`, and
   `public/`.
2. Each `.html` file is evaluated against exclude lists.
3. Title is read from `<title>` (fallback: filename humanization).
4. Metadata is resolved from the IA contract mapping in the generator.
5. Entries are sorted by `priority` (then `url`) and written to `public/pages.json`.

## Commands

```sh
npm run generate:pages
npm run build
```

## Excluding files
The script always skips `index.html`. You can exclude additional files with `PAGES_EXCLUDE`.

Example:

```sh
PAGES_EXCLUDE="experimental.html,legacy/old-demo.html" npm run generate:pages
```

## Runtime safety behavior
- `src/data/pages.ts` validates the payload schema at runtime and throws descriptive errors for
  malformed data.
- `src/ui/navigationHub.ts` catches load failures and presents a retryable fallback panel.
- `src/scene/links.ts` catches load failures and gracefully emits no labels instead of crashing.
