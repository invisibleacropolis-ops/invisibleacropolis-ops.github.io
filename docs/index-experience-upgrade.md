# Index Experience Upgrade Notes

## What changed

- Removed the HTML hero intro/consent shell from `index.html`; runtime now loads directly into the scene.
- Retired guided mode from state and controls; only `explorer` and `accessibility` remain active modes.
- Defaulted pointer-lock consent to enabled so explorer mode is immediate.
- Hardened URL generation in `pages.ts` with `resolveAppUrl()` so destination links respect `import.meta.env.BASE_URL` and stop 404ing on nested deployments.
- Added atmospheric scene accents (orbital ring + beacon constellation) with subtle animation to strengthen depth cues and movement.

## Engineering impact

- State migrations are tolerant of old `guided` values and coerce to `explorer`.
- Existing overlays/onboarding modules are now effectively inert for `index.html` because the HTML no longer mounts those elements.
- Any future destination entries in `public/pages.json` can continue using root-style paths (`/foo.html`); they are normalized at load.

## Validation performed

- Production build passes (`npm run build`).
- Visual check captured using Playwright artifact.
