# Index Analytics Contract

This document defines the analytics contract for the index experience (`src/index.ts`) and its UI modules.

## Goals

The instrumentation in this repo captures:

1. First meaningful paint (UI + scene ready).
2. CTA impressions and clicks.
3. Mode selection (`guided`, `explorer`, `accessibility`).
4. Link interaction success/failure.
5. Session depth (pages visited and dwell time).

## Architecture

Analytics is routed through a provider abstraction so vendor implementations remain decoupled from product code.

- Core abstraction: `src/telemetry/analytics.ts`
- Runtime usage: `src/index.ts`
- Session depth helper: `src/ui/sessionDepthTracker.ts`

### Provider model

`AnalyticsClient` fans each event to zero or more providers:

- `createWindowEventAnalyticsProvider()` emits `CustomEvent` for observers.
- `createDataLayerAnalyticsProvider()` pushes events into `window.dataLayer` when available.
- `createConsoleAnalyticsProvider()` logs to console (enabled in debug usage).

This allows adding Segment, Rudderstack, GA, Snowplow, or internal pipelines later without changing feature modules.

---

## Event Contract

All events include the event-specific payload fields listed below.

### 1) `first_meaningful_paint`

Emitted once during initialization after UI modules are created and after world/scene initialization finishes.

Payload:

- `appStartMs: number` — `performance.now()` at app bootstrap.
- `uiReadyMs: number` — timestamp when interactive UI controls were mounted.
- `sceneReadyMs: number` — timestamp when scene was initialized and ready to render.
- `meaningfulPaintMs: number` — `sceneReadyMs - appStartMs`.
- `qualityTier: string` — active quality tier.
- `qualitySource: "auto" | "manual"` — source of quality selection.

### 2) `cta_impression`

Emitted when hero overlay CTA buttons are first shown to user.

Payload:

- `ctaId: string` — CTA identifier (`enter`, `explore`).
- `placement: string` — location (`hero-overlay`).

### 3) `cta_click`

Emitted when a hero overlay CTA is clicked.

Payload:

- `ctaId: string` — CTA identifier (`enter`, `explore`).
- `placement: string` — location (`hero-overlay`).

### 4) `mode_selected`

Emitted whenever user changes mode via hero overlay or experience controls.

Payload:

- `mode: "guided" | "explorer" | "accessibility"`
- `previousMode: "guided" | "explorer" | "accessibility"`
- `source: "hero-overlay" | "experience-controls"`

### 5) `link_interaction`

Emitted for interactions with world links and navigation hub links.

Payload:

- `url: string` — destination URL.
- `origin: "world-link" | "navigation-hub"`
- `status: "success" | "failure"`
- `reason?: string` — optional failure reason.

### 6) `session_depth`

Emitted when page visits are recorded and when session is being hidden/unloaded.

Payload:

- `pagesVisited: number` — total number of recorded visits in session.
- `uniquePagesVisited: number` — unique paths visited in session.
- `dwellTimeMs: number` — elapsed time since session start.
- `currentPath: string` — current/last path recorded.

---

## Instrumentation Map

- `src/index.ts`
  - Bootstraps analytics client/providers.
  - Emits `first_meaningful_paint`.
  - Emits CTA impression/click + mode selections.
  - Emits `link_interaction` for world and navigation hub links.
  - Integrates session depth tracker and records page visits.
- `src/ui/heroOverlay.ts`
  - Adds CTA impression callback fired once per CTA when shown.
- `src/ui/experienceControls.ts`
  - Includes mode change source for attribution.
- `src/ui/navigationHub.ts`
  - Exposes link click callback with page metadata for analytics.
- `src/ui/sessionDepthTracker.ts`
  - Tracks dwell and recorded page visits.

## Guidance for external analytics engineers

- Prefer adding vendors by implementing `AnalyticsProvider` only.
- Keep event names and payload fields backward compatible.
- If payloads evolve, add optional fields before changing/removing existing keys.
- Use `window` event provider for QA and browser-based contract verification.
- Use dataLayer provider when GTM/GA integrations are present.
