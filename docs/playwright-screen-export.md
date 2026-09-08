# Playwright automatic screen export

The helper `scripts/playwright-screen-export.cjs` rides alongside an **existing Playwright Page**. It does not launch another browser or change the website. It uses Node built-ins and the Page supplied by Playwright, so no additional dependencies are needed.

## Start in the Playwright tool, use the browser normally, stop

Prepare a callback file from PowerShell:

```powershell
node scripts/playwright-screen-export.cjs tool-start tanuki-transformation
```

Pass the returned absolute `filename` to the Playwright tool's `browser_run_code_unsafe` **filename** parameter. This adapter works even when the tool VM disables imports, filesystem access and ordinary timers. It starts capture on the Page supplied by the tool and returns the session folder.

Continue normal browser interaction. Check progress in a later Playwright call:

```js
async (page) => {
  return page.__screenExport.status();
}
```

The first frame is captured immediately. The helper then targets one screenshot per second while you use **that same tab**, including across navigation. Browser actions do not need separate screenshot calls. It captures the viewport with animations left running, not the entire desktop or a stitched full-page image.

Stop and wait for the last in-progress screenshot before reviewing or deleting:

```js
async (page) => {
  return page.__screenExport.stop();
}
```

The stop result includes per-frame metadata. A final timecoded `__stopped.png` acts as the on-disk stop receipt used by the guarded cleaner. Tool mode stores UTC in every filename; it cannot write a JSON index because the tool VM has no filesystem API. Call `stop` before closing the tab so this receipt can be captured. If the tab/process closes first, retain the evidence and inspect the exact folder before manual cleanup.

## Ordinary Node Playwright scripts

The CommonJS helper also supports native Playwright directly, with a JSON index:

```js
const capture = require('./scripts/playwright-screen-export.cjs');
await capture.start(page, { label: 'tanuki-transformation' });
try {
  // Navigate, play the real animation, and inspect normally using page.
} finally {
  console.log(await capture.stop(page));
}
```

The native API exports `start(page, options)`, `status(page)` and `stop(page)`. It runs in a persistent Node process, not inside `page.evaluate()` (the website context). Use either the native API or the tool adapter for a tab, not both. Each supports one active session per page; different tabs can have separate sessions.

## Files and timing

Sessions live under `.captures/playwright/<UTC-start>_<label>_<unique-id>/`, excluded from Git and the production build. Each contains PNGs; native mode also writes `session.json`:

- `tc_00-00-05.012__000005.png`: elapsed hours, minutes, seconds, milliseconds, then an increasing attempt number. Safe on Windows and sortable in sequence.
- Tool mode adds UTC: `tc_00-00-05.012__2026-09-06T23-05-11-732Z__000005.png`.
- Native `session.json` and the tool stop result record capture timestamps, elapsed time, duration, page URL, errors and missed scheduling slots.
- Timecodes describe when each screenshot **started**, not an exact GPU presentation timestamp. Slow captures never overlap; missed slots are reported rather than backfilled with duplicate images.

Defaults: one-second interval, 600 capture attempts, five-second screenshot timeout. The tool adapter adds one final stopped frame. The frame limit stops unattended captures from growing indefinitely; page closure also stops capture. Native settings can be passed to `start`. Shorter intervals add rendering/encoding overhead. A crashed Playwright process can leave an unfinished session; the guarded cleaner will refuse it. Confirm the process has ended and inspect the exact folder before manual cleanup.

## Review and cleanup (PowerShell)

```powershell
node scripts/playwright-screen-export.cjs list
Get-ChildItem -LiteralPath '<exact-session-folder>' -Filter '*.png' | Sort-Object Name
node scripts/playwright-screen-export.cjs clean '<exact-session-folder>'
```

For native sessions, also read `session.json`. Review selected images with the agent's image-view tool. Preserve relevant evidence if an issue needs follow-up. `clean` permanently removes only the exact stopped session named by the caller; it refuses the repository root, capture root, unrecognized folders, sessions without a stop receipt, and directory links. Never use a broad recursive deletion against the workspace.

## Limitations

One frame per second is useful for choreography, VFX progression and regressions, **not proof that a one-frame rendering glitch did not occur**. Browser screenshots may miss physical-display/compositor artifacts just as video recorders can. Capturing itself adds overhead, so compare a capture-free run when investigating performance. Captures can contain whatever private content is visible in the tab; they remain local and are not uploaded by this tool.
