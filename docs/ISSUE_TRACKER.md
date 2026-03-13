# Issue Tracker — Index Roadmap Tickets

Ticket list derived from `docs/INDEX_ROADMAP.md`. Each ticket includes concrete file paths and function/module targets for implementation handoff.

## Phase 1 — Foundation

### IDX-101: Token contract normalization
- **Owner role:** Frontend Platform Engineer
- **Files:**
  - `src/ui/styles/tokens.css`
  - `src/ui/styles/components.css`
  - `src/ui/heroOverlay.ts`
  - `src/ui/experienceControls.ts`
- **Targets:** token variables consumed by UI components (`createHeroOverlay`, controls render styles).
- **Acceptance:** no hard-coded color/spacing values in top-level overlay/control components where token equivalents exist.

### IDX-102: Experience state machine transition audit
- **Owner role:** Interaction Engineer
- **Files:**
  - `src/ui/experienceState.ts`
  - `src/ui/onboardingModal.ts`
  - `src/index.ts`
- **Targets:** `createExperienceStateMachine`, `loadExperienceState`, onboarding `setState`, mode dispatch call sites.
- **Acceptance:** guided/explorer/accessibility transitions + consent semantics are documented and validated against product spec.

### IDX-103: IA schema parity enforcement (generator + runtime)
- **Owner role:** Data Contract Engineer
- **Files:**
  - `scripts/generate-pages-json.cjs`
  - `src/data/pages.ts`
  - `public/pages.json`
- **Targets:** `IA_CONTRACT`, `getContract`, `parseEntry`, `sortPagesByPriority`, `loadPages`.
- **Acceptance:** schema mismatch produces explicit failures; generated output stays stable and sorted.

## Phase 2 — Core UX

### IDX-201: Hero overlay interaction reliability
- **Owner role:** UX Engineer
- **Files:**
  - `src/ui/heroOverlay.ts`
  - `src/index.ts`
  - `src/telemetry/analytics.ts`
- **Targets:** `createHeroOverlay`, `setLocked`, `markInteracted`, CTA analytics integration (`cta_impression`, `cta_click`).
- **Acceptance:** overlay visibility + interaction behavior is deterministic across pointer/keyboard/scroll + mode lock states.

### IDX-202: Onboarding flow completion paths
- **Owner role:** Interaction Engineer
- **Files:**
  - `src/ui/onboardingModal.ts`
  - `src/ui/experienceState.ts`
  - `src/index.ts`
- **Targets:** `createOnboardingModal`, consent handler (`onConsent`), skip + never-show handlers (`onSkip`, `onNeverShow`).
- **Acceptance:** all onboarding exits persist expected state and no stale consent UI is shown.

### IDX-203: Navigation hub resilience and keyboard hardening
- **Owner role:** UI Systems Engineer
- **Files:**
  - `src/ui/navigationHub.ts`
  - `src/data/pages.ts`
  - `src/ui/styles/components.css`
- **Targets:** `createNavigationHub`, `hydrate`, `renderFallback`, focus trap logic, grouped section rendering.
- **Acceptance:** failed `pages.json` fetch shows actionable fallback; keyboard open/close/focus trap passes.

## Phase 3 — Immersion + Optimization

### IDX-301: Adaptive quality policy tuning
- **Owner role:** Rendering Engineer
- **Files:**
  - `src/index.ts`
  - `src/effects/postprocessing.ts`
  - `src/ui/experienceControls.ts`
- **Targets:** `chooseQualityTierFromHardware`, `applyQualityTier`, dynamic quality adjustment loop, composer resize/update helpers.
- **Acceptance:** auto-tier + manual override coexist without oscillation or persistent artifacts.

### IDX-302: Guided tour sequencing integration
- **Owner role:** Experience Designer / Frontend Engineer
- **Files:**
  - `src/ui/heroOverlay.ts`
  - `src/ui/onboardingModal.ts`
  - `src/index.ts`
  - `src/scene/links.ts`
- **Targets:** guided entry actions (`enter`), overlay/onboarding handoff points, link highlight sequencing module.
- **Acceptance:** guided tour can start/exit cleanly and keeps navigation targets synchronized.

## Phase 4 — Measurement + Hardening

### IDX-401: Analytics contract completion
- **Owner role:** Observability Engineer
- **Files:**
  - `src/telemetry/analytics.ts`
  - `src/ui/sessionDepthTracker.ts`
  - `src/index.ts`
- **Targets:** `createAnalyticsClient`, provider wiring, `createSessionDepthTracker`, mode/link event emissions.
- **Acceptance:** required events emit with complete payloads and no runtime exceptions from provider failures.

### IDX-402: Accessibility verification pass
- **Owner role:** Accessibility QA Engineer
- **Files:**
  - `src/ui/experienceControls.ts`
  - `src/ui/navigationHub.ts`
  - `src/ui/onboardingModal.ts`
  - `docs/INDEX_PRODUCT_SPEC.md`
- **Targets:** keyboard access paths, pointer-lock restrictions by mode, onboarding reopenability.
- **Acceptance:** all A11Y acceptance criteria in product spec have test evidence and disposition.

### IDX-403: Release hardening and smoke checklist automation
- **Owner role:** QA Engineer
- **Files:**
  - `docs/DEV_GUIDE.md`
  - `docs/INDEX_PRODUCT_SPEC.md`
  - `package.json`
- **Targets:** build/generate smoke commands, regression checklist, release gate documentation.
- **Acceptance:** release checklist is reproducible by external engineers without tribal knowledge.
