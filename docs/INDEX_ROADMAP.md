# Index Execution Roadmap

This roadmap sequences implementation work for the 3D index so external engineers can execute in parallel with clear ownership, dependencies, and rollback expectations.

## Phase 1 — Foundation

**Scope:** design tokens, experience state machine hardening, and IA schema contract stability.

- **Owner role:** Frontend Platform Engineer (with Data Contract Engineer support).
- **Dependencies:**
  - Existing style token baseline in `src/ui/styles/tokens.css`.
  - Current experience state machine (`src/ui/experienceState.ts`).
  - `pages.json` generator + parser contract (`scripts/generate-pages-json.cjs`, `src/data/pages.ts`).
- **Estimate:** 1.5 weeks.
- **Definition of done:**
  - Token naming and usage map documented, and all top-level UI modules consume shared tokens.
  - Experience state transitions validated for guided/explorer/accessibility + consent persistence.
  - IA schema validation errors are explicit and deterministic in both generator and runtime parser.
  - Regeneration path (`npm run generate:pages`) produces stable ordered output with schema parity.
- **Rollback strategy:**
  - Keep prior token values behind a tagged CSS snapshot and revert imports to previous token file revision.
  - Revert `createExperienceStateMachine` reducer/action changes to previously known state contract.
  - Restore previous `IA_CONTRACT` defaults and `parseEntry` validation semantics if runtime loads regress.

## Phase 2 — Core UX

**Scope:** hero overlay behavior, onboarding flow consistency, and navigation hub reliability.

- **Owner role:** UX Engineer (with Interaction Engineer support).
- **Dependencies:**
  - Phase 1 state machine persistence guarantees.
  - Existing UI modules: `src/ui/heroOverlay.ts`, `src/ui/onboardingModal.ts`, `src/ui/navigationHub.ts`.
  - Shared component styles in `src/ui/styles/components.css`.
- **Estimate:** 2 weeks.
- **Definition of done:**
  - Hero overlay CTA impression/click paths are deterministic and lock state interactions are documented.
  - Onboarding modal supports consent/skip/never-show paths with accurate state sync.
  - Navigation hub has resilient fallback + retry handling for `pages.json` failures.
  - Keyboard navigation and focus trap behavior are validated for trigger/panel lifecycle.
- **Rollback strategy:**
  - Feature-flag new hero/onboarding interaction handlers and switch back to prior overlay entry path.
  - Revert modal and nav hub event wiring to previous stable handler set.
  - Preserve fallback UI strings and retry behavior from last known-good commit for quick cherry-pick.

## Phase 3 — Immersion + Optimization

**Scope:** adaptive quality controls and guided tour enhancements.

- **Owner role:** Rendering Engineer (with Experience Designer support).
- **Dependencies:**
  - Quality tier infrastructure in `src/index.ts` and `src/effects/postprocessing.ts`.
  - Experience controls and state hooks in `src/ui/experienceControls.ts` and `src/ui/experienceState.ts`.
  - Existing guided interaction entry points (hero overlay + onboarding).
- **Estimate:** 2 weeks.
- **Definition of done:**
  - Automatic quality tier selection and runtime adaptation are measurable and do not break manual overrides.
  - Guided tour path introduces deterministic highlights and can be entered/exited without state desync.
  - Render metrics event stream remains stable while dynamic quality shifts occur.
  - Performance pass shows no new severe FPS regressions on low/medium tiers.
- **Rollback strategy:**
  - Disable adaptive quality loop and pin to user-selected/manual tier.
  - Guard guided tour entry behind a toggle and default to existing guided mode behaviors.
  - Revert postprocessing quality-tier mutations to static preset application.

## Phase 4 — Measurement + Hardening

**Scope:** analytics coverage, accessibility verification, and release QA hardening.

- **Owner role:** QA + Observability Engineer.
- **Dependencies:**
  - Analytics event map in `src/telemetry/analytics.ts`.
  - Session tracking path in `src/ui/sessionDepthTracker.ts`.
  - Accessibility criteria in `docs/INDEX_PRODUCT_SPEC.md` and runtime controls in `src/ui/*`.
- **Estimate:** 1.5 weeks.
- **Definition of done:**
  - Core events (`cta_*`, `mode_selected`, `link_interaction`, `session_depth`) are emitted and validated.
  - Accessibility acceptance criteria are executed with pass/fail evidence for keyboard-only and reduced-motion scenarios.
  - Build + pages generation + smoke workflow is documented as release gate.
  - Regression checklist captures navigation, pointer-lock consent, and runtime error states.
- **Rollback strategy:**
  - Route analytics providers to no-op provider if downstream ingestion causes runtime overhead/errors.
  - Revert to prior accessibility-safe defaults (guided/accessibility) if explorer onboarding regresses.
  - Freeze release on last passing QA baseline and revert only high-risk deltas.

## Cross-phase execution notes

- Complete phases in order; Phase 3 and 4 can overlap only after Phase 2 definition-of-done is met.
- Any schema change to `PageEntry` must update generator + runtime parser in the same ticket.
- Every phase should include before/after notes in docs for external implementation engineers.
