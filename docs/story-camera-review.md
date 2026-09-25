# Tanuki and Oni camera review

Start Vite from PowerShell with `npm run dev -- --host 127.0.0.1`, then open
`http://127.0.0.1:5173/src/pages/kakuriyo.html` in Playwright.

Load `scripts/review-story-cameras.tool.js` with the Playwright tool's `filename`
argument. It instruments the actual Vite module response in the review browser;
it does not replace the story, scenery, renderer, or camera with test doubles.

Run these callbacks through `browser_run_code_unsafe` in separate calls:

```js
async (page) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  return page.__cameraReview.start('Digit2');
}
```

```js
async (page) => page.__cameraReview.capture([8, 16, 35, 47])
```

```js
async (page) => page.__cameraReview.capture([58, 59, 60, 61, 65])
```

```js
async (page) => {
  const frames = await page.__cameraReview.capture([72, 85, 94, 102]);
  return { frames, checks: await page.__cameraReview.finish() };
}
```

Repeat with `Digit4`, using ascending times such as
`[8, 18, 27, 36, 47]` and `[58, 66, 85, 94, 97]`.
Inspect the PNGs returned by `capture`, including the bridge approaches and
reunion. Real story updates run at 1/60 second; checks sample every 0.1 second.
They check finite camera coordinates, ground clearance, lead framing, camera
distance, and eight horizontal body rays against castle/village geometry.
These rays are a regression check, not full mesh collision detection. Visual
inspection is still required for limbs, foliage, and momentary artifacts.
`finish` also checks natural completion and exact restoration of foliage matrices.

For continuous screenshot capture, use the separate screen-export helper
described in `playwright-screen-export.md`. Long synchronous review steps can
time out its background captures; the explicit checkpoint PNGs remain the
primary visual evidence for this review.

After review, stop any screen-export session, remove the response instrumentation
with `await page.unroute('**/src/yokai/main.ts*')`, and reload. Normal playback uses
keys **2** (tanuki), **4** (oni), and **Escape** (exit).
