# Glossary

This glossary defines terms used across the Invisible Support Portal docs and links each concept to the module(s) and selector(s) engineers use most during debugging.

## Panels (Home UI surface areas)

- **Upload workflow panel**
  - Document ingest panel for drag/drop and picker uploads.
  - Heading anchor: `#upload-workflow`
  - Key selectors: `#document-upload-form`, `[data-dropzone]`, `[data-file-input]`, `[data-upload-queue]`, `[data-upload-progress]`
  - Modules: `src/features/documents/upload.js`, `src/features/documents/store.js`

- **Repository storage panel**
  - GitHub configuration and storage quota settings panel.
  - Heading anchor: `#repo-storage`
  - Key selectors: `#github-form`, `#github-owner`, `#github-repo`, `#github-branch`, `#github-token`, `#github-storage-limit`
  - Modules: `src/features/settings/github-settings.js`, `src/shared/services/github.js`

- **Asset library panel**
  - Document table/browse panel with search, select, copy, and delete actions.
  - Heading anchor: `#asset-library`
  - Key selectors: `[data-library-search]`, `[data-library-rows]`, `[data-library-empty]`
  - Modules: `src/features/documents/library-view.js`, `src/features/documents/store.js`

- **Document viewer panel**
  - Selected-document preview, metadata, and link actions.
  - Heading anchor: `#document-viewer`
  - Key selectors: `[data-viewer-select]`, `[data-viewer-preview]`, `[data-viewer-meta]`, `[data-viewer-copy]`, `[data-viewer-open]`
  - Modules: `src/features/documents/viewer.js`, `src/shared/utils.js`

- **Image upload panel**
  - Image ingest panel with metadata capture and progress handling.
  - Heading anchor: `#image-upload-title`
  - Key selectors: `#image-upload-form`, `[data-image-dropzone]`, `[data-image-input]`, `[data-image-feedback]`
  - Modules: `src/features/images/upload.js`, `src/features/images/store.js`

- **Image gallery panel**
  - Searchable/filtered image browse panel with grid/list views.
  - Heading anchor: `#image-gallery`
  - Key selectors: `[data-image-search]`, `[data-image-view]`, `[data-image-gallery-items]`, `[data-image-gallery-empty]`
  - Modules: `src/features/images/gallery.js`, `src/features/images/viewer.js`

- **Image viewer panel**
  - Selected-image preview with fit/zoom, metadata/EXIF, and link actions.
  - Heading anchor: `#image-viewer`
  - Key selectors: `[data-image-canvas]`, `[data-image-fit]`, `[data-image-zoom]`, `[data-image-copy]`, `[data-image-open]`
  - Modules: `src/features/images/viewer.js`, `src/features/images/store.js`

---

## Store/service terminology

- **GitHubIntegration service**
  - API client for config, manifest I/O, and file upload/delete against GitHub.
  - Module: `src/shared/services/github.js`
  - Core concepts: `getConfig`, `updateConfig`, `isConfigured`, `getContents`, `uploadFile`, `writeManifest`, `deleteFile`.

- **StorageManager service**
  - Quota and manifest-path coordinator across resource stores.
  - Module: `src/shared/services/storage-manager.js`
  - Registered key→path map:
    - `invisibleSupport.documents` → `storage/documents.json`
    - `invisibleSupport.images` → `storage/images.json`

- **BaseResourceStore**
  - Shared class for document/image stores (load/hydrate/persist/reconcile/remove).
  - Module: `src/shared/services/base-store.js`
  - Contract terms:
    - `storageKey`: namespace for manifest persistence.
    - `baseUploadPath`: repo upload folder prefix.
    - `hydrate`: reconstruct runtime URLs.
    - `toSerializable`: strips non-manifest fields (for example `blobUrl`).

- **DocumentStore / ImageStore**
  - Feature-specific store adapters built on `BaseResourceStore`.
  - Modules: `src/features/documents/store.js`, `src/features/images/store.js`
  - Typical actions: create/add/remove/get/getAll/subscribe.

- **Reactive store infrastructure**
  - Generic namespaced state helper and event emitters (not the same as resource stores).
  - Module: `src/shared/infrastructure/store.js`

- **Event bus infrastructure**
  - Pub/sub helper for decoupled event coordination.
  - Module: `src/shared/infrastructure/event-bus.js`

---

## Manifest and persistence terms

- **Manifest**
  - JSON array of metadata records persisted in repo storage for a resource type.
  - Paths: `storage/documents.json`, `storage/images.json`.

- **Manifest metadata (`sha`)**
  - Git object SHA used for optimistic updates/replacements in GitHub Contents API writes.
  - Cached by `StorageManager` as part of per-key manifest meta.

- **Serializable record**
  - Persistable record shape stripped of runtime-only fields (for example object URLs).

- **Hydrated record**
  - Runtime record after store reconstruction, usually with `downloadUrl`/`blobUrl` populated.

- **Quota snapshot**
  - Runtime usage state from `StorageManager.getSnapshot()` containing `used`, `limit`, `ratio`, `isWarning`, and `isExceeded`.

---

## Split-pane vocabulary

- **Split pane container**
  - Two-panel horizontal layout root.
  - Selector: `.split-pane[data-split-id]`
  - Module: `src/shared/ui/split-pane.js`

- **Split handle**
  - Draggable/keyboard-operable divider between left/right panes.
  - Selector: `[data-split-handle]`

- **Left ratio (`--split-left`)**
  - CSS custom property that controls the left pane width percentage.

- **Split persistence key**
  - `localStorage` key pattern: `splitPane:<splitId>` (for example `splitPane:doc-split`, `splitPane:img-split`).

- **Clamp bounds**
  - Enforced left ratio minimum/maximum: 15% to 85%.

---

## “Direct link” semantics

In this doc set, a **direct link** means a user-actionable URL for the currently selected asset that can be copied or opened immediately.

- **Document direct link**
  - Source preference in viewer workflow: selected document URL, then current link input value.
  - Actions/selectors: `[data-viewer-copy]`, `[data-viewer-open]`.
  - Module: `src/features/documents/viewer.js`.

- **Image direct link**
  - Source preference in viewer workflow: `blobUrl` first, then `downloadUrl`.
  - Actions/selectors: `[data-image-copy]`, `[data-image-open]`, `[data-image-link]`.
  - Module: `src/features/images/viewer.js`.

- **Copy semantics**
  - Uses `Utils.copyToClipboard(...)` with visible-field selection first, then async clipboard, then hidden-textarea fallback.
  - Success/failure surfaced through `Notifications.toast(...)`.

- **Open semantics**
  - Open actions are disabled when no link exists (`aria-disabled="true"`, inert click behavior).
  - Enabled behavior opens a new browsing context via `window.open(..., '_blank', 'noopener')`.

---

## Key module quick-reference map

- Composition root and init order: `invisible-support/src/main.js`
- Shared UI/services:
  - `invisible-support/src/shared/ui/split-pane.js`
  - `invisible-support/src/shared/ui/notifications.js`
  - `invisible-support/src/shared/services/github.js`
  - `invisible-support/src/shared/services/storage-manager.js`
  - `invisible-support/src/shared/services/base-store.js`
  - `invisible-support/src/shared/utils.js`
- Feature modules:
  - Documents: `invisible-support/src/features/documents/{upload,library-view,viewer,store}.js`
  - Images: `invisible-support/src/features/images/{upload,gallery,viewer,store}.js`
  - Settings/storage UI: `invisible-support/src/features/settings/github-settings.js`, `invisible-support/src/features/storage/ui.js`

## Key selector quick-reference map

- **Panel toggles:** `[data-panel-toggle]`
- **Storage meter:** `[data-storage-meter]`, `[data-storage-progress-bar]`, `[data-storage-manage]`
- **Storage modal:** `#storage-modal`, `[data-storage-clear]`, `[data-storage-cancel]`
- **Toast host:** `[data-toast-stack]`
- **Localization hooks:** `[data-i18n-key]`
- **Clipboard modal placeholder markup:** `#clipboard-confirm` (markup exists; not currently wired in ESM module flow)
