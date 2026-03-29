# Invisible Support Home Panels Overview

This page is the entry point for the `docs/invisible-support/` documentation set. It maps each Home panel in `public/InvisibleSupport/index.html` to the feature modules that own behavior and state.

## Startup architecture from `public/InvisibleSupport/src/main.js`

### Module imports by layer

`main.js` is a composition root that imports modules in explicit migration layers:

1. **Shared infrastructure**
   - `./shared/utils.js`
   - `./shared/localization/index.js`
   - `./shared/ui/notifications.js`
   - `./shared/infrastructure/event-bus.js`
   - `./shared/infrastructure/store.js`
2. **Services / integrations**
   - `./shared/services/github.js`
   - `./shared/services/storage-manager.js`
3. **Feature slices**
   - Documents: `./features/documents/{store,viewer,library-view,upload}.js`
   - Images: `./features/images/{store,viewer,gallery,upload}.js`
   - Settings + storage UI: `./features/settings/github-settings.js`, `./features/storage/ui.js`
4. **Shared UI component**
   - `./shared/ui/split-pane.js`

### Global exports for legacy compatibility (`window.*`)

During migration away from inline scripts, `main.js` publishes selected modules on `window`:

- `window.Utils`
- `window.Localization`
- `window.Notifications`
- `window.EventBus`
- `window.Store`
- `window.GitHubIntegration`
- `window.StorageManager`
- `window.DocumentStore`
- `window.ImageStore`
- `window.DocumentViewer`
- `window.ImageViewer`
- `window.ImageGallery`
- `window.LibraryView`

After initialization, storage modal helpers are also exported:

- `window.openStorageModal = StorageUI.openModal`
- `window.closeStorageModal = StorageUI.closeModal`

### Initialization order in `init()`

`init()` executes in this exact sequence:

1. `Localization.apply()`
2. `GitHubSettings.init()`
3. `StorageUI.init()`
4. `DocumentViewer.init()`
5. `LibraryView.init()`
6. `UploadController.init()`
7. `ImageViewer.init()`
8. `ImageGallery.init()`
9. `ImageUpload.init()`
10. `SplitPane.init()`
11. `initPanelToggles()`

### DOM readiness guard

Startup is protected by a `DOMContentLoaded` guard:

- If `document.readyState === 'loading'`, register `document.addEventListener('DOMContentLoaded', init)`.
- Otherwise, call `init()` immediately.

This keeps initialization deterministic when scripts load either before or after the DOM is parsed.

### Panel toggle behavior

`initPanelToggles()` binds click handlers to every `[data-panel-toggle]` button.

On click:

1. Resolve nearest `.u-card` ancestor with `btn.closest('.u-card')`.
2. Toggle `.is-collapsed` on that card (`card.classList.toggle('is-collapsed')`).
3. Update button label to `Expand` when collapsed, otherwise `Collapse`.
4. Update `aria-label` to `Expand panel` / `Collapse panel` for accessibility.

The effective collapsed selector is `.u-card.is-collapsed`.

## Panel inventory (from `index.html` heading anchors)

The Home page panel headings and anchor IDs are:

1. **Upload workflow** (`#upload-workflow`)
2. **Repository storage** (`#repo-storage`)
3. **Asset library** (`#asset-library`)
4. **Document viewer** (`#document-viewer`)
5. **Image upload** (`#image-upload-title`)
6. **Image gallery** (`#image-gallery`)
7. **Image viewer** (`#image-viewer`)

## Source-of-truth ownership map (`public/InvisibleSupport/src/features/**`)

| Panel | Heading anchor | Primary owning modules | Related modules |
|---|---|---|---|
| Upload workflow | `#upload-workflow` | `src/features/documents/upload.js` | `src/features/documents/store.js`, `src/features/documents/library-view.js` |
| Repository storage | `#repo-storage` | `src/features/settings/github-settings.js`, `src/features/storage/ui.js` | `src/features/documents/store.js`, `src/features/images/store.js` |
| Asset library | `#asset-library` | `src/features/documents/library-view.js` | `src/features/documents/store.js`, `src/features/documents/upload.js`, `src/features/documents/viewer.js` |
| Document viewer | `#document-viewer` | `src/features/documents/viewer.js` | `src/features/documents/library-view.js`, `src/features/documents/store.js` |
| Image upload | `#image-upload-title` | `src/features/images/upload.js` | `src/features/images/store.js`, `src/features/images/gallery.js` |
| Image gallery | `#image-gallery` | `src/features/images/gallery.js` | `src/features/images/store.js`, `src/features/images/viewer.js` |
| Image viewer | `#image-viewer` | `src/features/images/viewer.js` | `src/features/images/gallery.js`, `src/features/images/store.js` |

## How to navigate this doc set

Use this sequence when onboarding or troubleshooting:

1. [Home panels overview](./home-panels-overview.md)
2. [Panel: Upload workflow](./panel-upload-workflow.md)
3. [Panel: Repository storage](./panel-repository-storage.md)
4. [Panel: Asset library](./panel-asset-library.md)
5. [Panel: Document viewer](./panel-document-viewer.md)
6. [Panel: Image upload](./panel-image-upload.md)
7. [Panel: Image gallery](./panel-image-gallery.md)
8. [Panel: Image viewer](./panel-image-viewer.md)
9. [Shared systems](./shared-systems.md)
10. [Data flow and persistence](./data-flow-and-persistence.md)
11. [Testing and validation](./testing-and-validation.md)
12. [Glossary](./glossary.md)

## Recommended reading paths

- **Feature onboarding:** start with panel docs in UI order, then `shared-systems.md`.
- **Bug triage:** begin with affected panel doc, then `data-flow-and-persistence.md`.
- **Release hardening:** follow `testing-and-validation.md` before merge.
