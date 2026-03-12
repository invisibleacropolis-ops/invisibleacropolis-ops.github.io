# Interactions & Controls

## Experience Modes Overview
**State machine module**: `src/ui/experienceState.ts`

The runtime interaction model now uses a persisted state machine with three explicit modes:

- **Guided mode** (`guided`, default):
  - Camera follows an automated orbital tour.
  - Pointer lock is explicitly disabled.
  - UI overlays/cards remain available for non-FPS exploration.
- **Explorer mode** (`explorer`):
  - Current FPS/pointer-lock behavior.
  - Requires affirmative pointer-lock consent before lock can be requested.
- **Accessibility mode** (`accessibility`):
  - Reduced motion (no sway, lower speed profile).
  - Never uses pointer lock.
  - Adds keyboard turn support via `ArrowLeft` / `ArrowRight`.

Persisted fields (`localStorage` key: `invisible_acropolis_experience_state`):

- `mode`
- `pointerLockConsent`
- `onboardingSeen`
- `neverShowOnboarding`

## Onboarding & Consent UX
**Modules**: `src/ui/onboardingModal.ts`, `src/index.ts`

On startup (unless `neverShowOnboarding` is true), the onboarding modal presents:

1. Keyboard/mouse control instructions for each mode.
2. Pointer-lock consent CTA for Explorer mode.
3. `Skip` flow and `Never show this again` preference.

Behavioral notes:

- Selecting Explorer without prior consent opens onboarding.
- Accepting consent updates state and allows pointer lock request.
- Skipping onboarding can keep user in non-pointer-lock modes.

## Mode Switch Surface
**Module**: `src/ui/experienceControls.ts`

A compact control surface is rendered into `.ui` with:

- Mode toggle buttons (`Guided`, `Explorer`, `Accessibility`).
- Dynamic status text reflecting pointer lock availability.
- On-demand reopening of onboarding/help.

## FPS / Navigation Implementation
**Module**: `src/controls/fps.ts`

The control system now branches by active mode:

- **Guided**:
  - Auto-tour orbit (`guidedAngle`) around scene center.
  - Camera Y gently oscillates for cinematic framing.
- **Explorer**:
  - Existing WASD-relative movement model.
  - Pointer lock allowed only when consent state is true.
  - Flight sway retained for immersive feel.
- **Accessibility**:
  - Reduced speed profile (`accessibility` speed band).
  - No pointer lock.
  - No sway.
  - Keyboard yaw steering for non-mouse navigation.

## Interaction Targets
**Modules**: `src/scene/links.ts`, `src/effects/proximityEffect.ts`, `src/index.ts`

- Proximity highlighting remains active across modes.
- In-world click-through of links continues when pointer lock is active and target raycast intersects a link mesh.
