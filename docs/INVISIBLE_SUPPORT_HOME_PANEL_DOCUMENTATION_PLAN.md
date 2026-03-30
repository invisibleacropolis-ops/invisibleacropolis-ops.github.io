# InvisibleSupport Home Page Panel Documentation Plan

## Scope and objective
This plan defines a panel-by-panel documentation rollout for the **Invisible Support Upload Hub** home page (`/invisible-support/`). The goal is to produce engineer-ready documentation that explains:

- every visible panel and subsection on the home page,
- the owning files and modules,
- the event/data flow between UI, stores, and GitHub persistence,
- function-level behavior and dependencies,
- test/check procedures and operational notes for external contributors.

This plan is written to be executed as a documentation workstream (not just a one-off README update).

---

## What is on the Home page (panel inventory)

Observed and source-confirmed panel set:

1. **Upload workflow**
2. **Repository storage**
3. **Asset library**
4. **Document viewer**
5. **Image upload**
6. **Image gallery**
7. **Image viewer**
8. Cross-panel modals/components:
   - Clipboard confirmation modal
   - Storage details modal
   - Split-pane resizers
   - Panel collapse toggles

---

## Source-of-truth file map (by layer)

### Markup and styling
- `invisible-support/index.html`
  - Home page structure, panel DOM, data attributes, modal markup, embedded styles.

### App bootstrap and orchestration
- `invisible-support/src/main.js`
  - Imports all modules and initializes panel features.
  - Wires split panes, collapsible panels, and legacy global exports.

### Documents feature slice
- `invisible-support/src/features/documents/upload.js`
- `invisible-support/src/features/documents/store.js`
- `invisible-support/src/features/documents/library-view.js`
- `invisible-support/src/features/documents/viewer.js`

### Images feature slice
- `invisible-support/src/features/images/upload.js`
- `invisible-support/src/features/images/store.js`
- `invisible-support/src/features/images/gallery.js`
- `invisible-support/src/features/images/viewer.js`

### Settings and storage UI
- `invisible-support/src/features/settings/github-settings.js`
- `invisible-support/src/features/storage/ui.js`

### Shared infrastructure/services
- `invisible-support/src/shared/services/github.js`
- `invisible-support/src/shared/services/storage-manager.js`
- `invisible-support/src/shared/services/base-store.js`
- `invisible-support/src/shared/ui/split-pane.js`
- `invisible-support/src/shared/ui/notifications.js`
- `invisible-support/src/shared/localization/index.js`
- `invisible-support/src/shared/utils.js`
- `invisible-support/src/shared/infrastructure/event-bus.js`
- `invisible-support/src/shared/infrastructure/store.js`

### Storage manifests and static data
- `public/invisible-support/storage/documents.json`
- `public/invisible-support/storage/images.json`

---

## Documentation package to produce

Create a focused documentation set under `docs/invisible-support/`:

1. `docs/invisible-support/home-panels-overview.md`
   - Home page panel map and navigation guide.
2. `docs/invisible-support/panel-upload-workflow.md`
3. `docs/invisible-support/panel-repository-storage.md`
4. `docs/invisible-support/panel-asset-library.md`
5. `docs/invisible-support/panel-document-viewer.md`
6. `docs/invisible-support/panel-image-upload.md`
7. `docs/invisible-support/panel-image-gallery.md`
8. `docs/invisible-support/panel-image-viewer.md`
9. `docs/invisible-support/shared-systems.md`
   - Split panes, modals, localization, notifications, utility contracts.
10. `docs/invisible-support/data-flow-and-persistence.md`
    - End-to-end ingest/read/delete sequence diagrams.
11. `docs/invisible-support/testing-and-validation.md`
    - Repeatable checks and expected results.
12. `docs/invisible-support/glossary.md`

---

## Standard template for each panel document

Every panel doc should follow this fixed structure:

1. **Panel purpose**
2. **DOM anchors and selectors**
   - `id`, `data-*` selectors, ARIA attributes.
3. **Owning modules/files**
   - primary owner and secondary dependencies.
4. **Initialization path**
   - which `init()` runs, when, and ordering assumptions.
5. **User interactions**
   - click/drag/drop/keyboard behaviors and handlers.
6. **State model**
   - in-memory state, persisted state, derived state.
7. **Function inventory**
   - exported API, key private helpers, side effects.
8. **Events and cross-panel integration**
   - calls into other slices, shared services, or globals.
9. **Failure modes and UX fallbacks**
   - network failure, bad config, invalid files, empty states.
10. **Security and privacy notes**
    - token handling, clipboard use, metadata exposure.
11. **Test checklist**
12. **Known gaps / TODOs**

---

## Panel-by-panel engineering outline

### 1) Upload workflow
Document drag-drop + browse flows, progress rendering, validation, and handoff to document store/upload services.

### 2) Repository storage
Document GitHub config lifecycle (owner/repo/branch/token/storage limit), validation, connection test behavior, and persistence.

### 3) Asset library
Document filtering, row actions (view/copy/download/delete), selection synchronization with viewer, and empty-state logic.

### 4) Document viewer
Document render strategy by mime/extension (PDF, Office via embed, media, text fallback, object fallback), direct-link copy/open actions, and select control behavior.

### 5) Image upload
Document supported types, dimensional constraints, progress, metadata collection (title/alt), and creation flow.

### 6) Image gallery
Document list/grid modes, lazy thumbnail behavior, filtering, selection and focus behaviors, and action affordances.

### 7) Image viewer
Document fit/fill/actual zoom controls, metadata panels (EXIF/date/dimensions/type), and direct-link controls.

### 8) Cross-panel shared systems
Document split-pane persistence, collapse toggles, notifications, localization, storage meter/modal, and global compatibility APIs.

---

## End-to-end flow documentation requirements

Produce diagrams (Mermaid) for:

1. **Document upload lifecycle**: UI → validation → store normalization → GitHub upload → manifest update → UI refresh.
2. **Image upload lifecycle**: UI → validation/dimensions/EXIF → upload → manifest update → gallery/viewer update.
3. **Delete lifecycle** for docs/images.
4. **Storage accounting lifecycle**: size estimation, threshold warning, over-limit prevention.
5. **Initialization lifecycle** from `main.js` through all `init()` calls.

---

## Function-level documentation requirements

For each module, capture:

- exported functions and signatures,
- expected inputs/outputs,
- synchronous vs async behavior,
- side effects (DOM updates, localStorage, fetch, clipboard, object URL management),
- error contracts (thrown errors, user-visible toast/inline messages),
- coupling points to other modules.

At minimum, fully document functions used in home-page panel flows.

---

## Test and validation plan

Use repeatable checks suitable for outside engineers:

1. **Static checks/build**
   - install dependencies,
   - run production build.
2. **Manual panel QA checklist**
   - verify each panel renders,
   - verify collapse/expand,
   - verify split-pane drag + keyboard resize,
   - verify empty-state content,
   - verify upload attempts and error messages.
3. **GitHub integration validation**
   - missing config errors,
   - invalid token handling,
   - success path (test connection + manifest writes).
4. **Persistence validation**
   - page refresh state restoration,
   - stored split ratio restoration,
   - storage meter accuracy after upload/delete.
5. **Accessibility checks**
   - keyboard reachability,
   - ARIA labels and dialog behavior,
   - contrast sanity for status text.

Record commands, results, and known environment constraints in `testing-and-validation.md`.

---

## Execution sequence (recommended)

1. **Inventory + selectors pass**: lock panel/selector map from `index.html`.
2. **Init/dependency pass**: map `main.js` initialization order and module ownership.
3. **Documents pass**: upload/store/library/viewer internals.
4. **Images pass**: upload/store/gallery/viewer internals.
5. **Shared systems pass**: GitHub service, storage manager, utilities, split-pane, notifications.
6. **Flow diagrams + error matrix**.
7. **Validation pass**: run build, run manual checks, finalize docs.

---

## Definition of done

Documentation is complete when:

- every Home page panel has a dedicated doc,
- each doc includes selectors, owners, function inventory, data flow, and tests,
- cross-panel dependencies are explicit,
- persistence and GitHub integration are fully covered,
- validation notes include reproducible commands and outcomes,
- external engineers can locate any UI behavior and trace it to source files within 2 clicks.

---

## Notes for future maintainers

- Keep docs colocated by feature domain under `docs/invisible-support/`.
- Update panel docs whenever selectors/data attributes or module exports change.
- Treat `invisible-support/index.html` as the UI contract baseline; update docs in the same PR as panel markup changes.
