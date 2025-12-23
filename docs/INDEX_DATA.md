# Pages Index Data

## Overview
`public/pages.json` is generated at build time by `scripts/generate-pages-json.js`. The script scans the repository for HTML files and produces a list of pages (excluding `index.html`).

## Schema
The output JSON is an array of objects with the following shape:

```json
[
  {
    "title": "string",
    "url": "string"
  }
]
```

- `title`: Derived from the page `<title>` tag when present; otherwise generated from the filename.
- `url`: A root-relative URL for the HTML file (e.g. `/flow-field.html`).

## How it runs
- `npm run build` (or `npm run generate:pages`) executes `scripts/generate-pages-json.js`.
- The script writes the output to `public/pages.json`.

## Excluding files
The script always skips `index.html`. You can also exclude additional HTML files by setting the `PAGES_EXCLUDE` environment variable with a comma-separated list of relative paths or basenames.

Examples:

```sh
PAGES_EXCLUDE="experimental.html,legacy/old-demo.html" npm run build
```
