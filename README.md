# Starship HUD Control Panel

## Data sources
- **Telemetry + readouts:** `index.js` generates pseudo-random streams with easing and noise to simulate system metrics. These streams drive the meter readouts, sparklines, and preview readout values.
- **Logs:** Mission log entries are generated from a rotating list of canned phrases in `index.js`.
- **Navigation titles:** The nav list pulls each page title by fetching the target HTML file and reading its `<title>` tag.

## Animation loop
- The runtime uses `requestAnimationFrame` in `index.js` to update readouts, logs, and canvases.
- Expensive canvas drawings (telemetry waveform, radar sweep, sparklines) are throttled to every few frames to reduce workload.
- Motion settings respect `prefers-reduced-motion` by slowing timing, reducing noise, and pausing outline cycling.

## Adding a new page to the navigation list
1. Add the new HTML file to the repo root (for example, `new-scene.html`).
2. Add the filename to the `targetPages` array in `index.js`.
3. Ensure the new file has a descriptive `<title>` so it displays correctly in the nav list.
