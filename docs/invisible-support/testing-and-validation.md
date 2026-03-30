# Testing and validation

This runbook is intended for outside engineers validating the Invisible Support Portal in a **writable dev environment** (local clone, branch checkout, and file system write access).

## 1) Static and build checks (exact commands)

Run from repository root (`/workspace/invisibleacropolis-ops.github.io`):

```bash
npm ci
npm run generate:pages
npx tsc --noEmit
npm run build
```

### What each command validates
- `npm ci`
  - Locks dependency graph to `package-lock.json` and ensures deterministic installs before validation.
- `npm run generate:pages`
  - Rebuilds `public/pages.json` via `scripts/generate-pages-json.cjs`.
  - Verifies page index generation required by the app build.
- `npx tsc --noEmit`
  - Type-checks TypeScript source without producing output files.
  - Use this as a static contract check for app modules and import metadata assumptions.
- `npm run build`
  - Executes `npm run generate:pages && vite build`.
  - Produces a production bundle and catches integration/build-time regressions.

### Current baseline note (as of March 30, 2026)
- `npx tsc --noEmit` currently reports:
  - `src/data/pages.ts(69,29): error TS2339: Property 'env' does not exist on type 'ImportMeta'.`
- Treat this as an **existing known issue** unless fixed in your branch. Do not block UI QA on this type-check error alone.

---

## 2) Manual QA checklist

Execute QA in this order to match startup and shared dependency flow from `public/InvisibleSupport/src/main.js`:
1. Repository storage panel (GitHub settings)
2. Upload workflow + Asset library + Document viewer
3. Image upload + Image gallery + Image viewer
4. Shared systems (split panes, storage meter/modal, notifications, localization)

### A) Upload workflow panel
**Selectors:** `#document-upload-form`, `[data-dropzone]`, `[data-file-input]`, `[data-upload-queue]`, `[data-upload-progress]`, `[data-upload-feedback]`.

Checklist:
- [ ] Add files via picker and confirm queue rows appear.
- [ ] Add files via drag/drop and confirm auto-start upload path.
- [ ] Remove one queued file and clear queue; verify summary and empty state update.
- [ ] Start upload and verify progress bar updates plus success/error feedback text.
- [ ] Confirm successful upload pushes selection to Document viewer and focus handoff to library row.

### B) Repository storage panel
**Selectors:** `#github-form`, `#github-owner`, `#github-repo`, `#github-branch`, `#github-token`, `#github-storage-limit`.

Checklist:
- [ ] Save valid owner/repo/branch/token/storage limit.
- [ ] Reload page and confirm values restore from local config.
- [ ] Change storage limit and confirm storage meter recalculates threshold state.

### C) Asset library panel
**Selectors:** `[data-library-search]`, `[data-library-rows]`, `[data-library-empty]`.

Checklist:
- [ ] Search filters rows by title/name/type/description.
- [ ] “View” action updates Document viewer selection.
- [ ] Copy link action emits success/failure toast.
- [ ] Delete action removes row and applies focus fallback (next/previous/search).

### D) Document viewer panel
**Selectors:** `[data-viewer-select]`, `[data-viewer-preview]`, `[data-viewer-meta]`, `[data-viewer-copy]`, `[data-viewer-open]`.

Checklist:
- [ ] Selection changes render preview and metadata.
- [ ] Copy link action copies current resolved link and shows toast.
- [ ] Open link action opens a new tab when enabled and is inert when disabled.
- [ ] Clearing/deleting selected document returns viewer to empty state cleanly.

### E) Image upload panel
**Selectors:** `#image-upload-form`, `[data-image-dropzone]`, `[data-image-input]`, `[data-image-alt]`, `[data-image-progress]`, `[data-image-feedback]`.

Checklist:
- [ ] Picker and drag/drop upload paths both function.
- [ ] Metadata fields (title/alt/captured date) persist into gallery/viewer.
- [ ] Progress and feedback states reset correctly on form reset.

### F) Image gallery panel
**Selectors:** `[data-image-search]`, `[data-image-view]`, `[data-image-gallery-items]`, `[data-image-gallery-empty]`.

Checklist:
- [ ] Grid/list toggles update active state and list class.
- [ ] Search filters by title/name/type/alt and EXIF metadata.
- [ ] Thumbnail selection syncs with Image viewer.
- [ ] Delete from gallery preserves expected focus fallback.

### G) Image viewer panel
**Selectors:** `[data-image-viewer]`, `[data-image-canvas]`, `[data-image-fit]`, `[data-image-zoom]`, `[data-image-meta]`, `[data-image-exif]`, `[data-image-copy]`, `[data-image-open]`.

Checklist:
- [ ] Fit (`contain`/`cover`/`actual`) and zoom controls update canvas transform.
- [ ] Metadata and EXIF sections hide/show correctly.
- [ ] Copy/open actions use current image URL source.
- [ ] Disabled open state (`aria-disabled="true"`) prevents navigation.

### H) Shared systems checklist

#### Split-pane
**Selectors:** `.split-pane[data-split-id]`, `[data-split-handle]`.
- [ ] Drag and keyboard resizing work.
- [ ] Pane ratio persists across reload via `localStorage` key `splitPane:<id>`.

#### Storage meter + modal
**Selectors:** `[data-storage-meter]`, `[data-storage-progress]`, `[data-storage-manage]`, `#storage-modal`, `[data-storage-clear]`.
- [ ] Meter values match actual document/image totals.
- [ ] Warning/exceeded states appear near/over quota.
- [ ] Modal shows used/available/docs/images breakdown.
- [ ] “Clear all” removes persisted manifests and refreshes all dependent panels.

#### Notifications/localization
**Selectors:** `[data-toast-stack]`, `[data-i18n-key]`.
- [ ] Success/error/info toasts appear and dismiss via timer/click/keyboard.
- [ ] Localization apply path updates all marked nodes without breaking placeholders.

---

## 3) GitHub integration validation cases

Use `public/InvisibleSupport/src/shared/services/github.js`, `storage-manager.js`, and feature stores as expected behavior references.

### Case 1: Missing config (no token or owner/repo)
Setup:
1. Open Repository storage panel.
2. Clear token (and optionally owner/repo), save.
3. Attempt document or image upload.

Expected:
- Operation is blocked by configuration guard (`config` error path).
- UI surfaces failure via panel feedback/toast.
- App remains interactive (no crash), with existing in-memory state preserved.

### Case 2: Invalid token / unauthorized request
Setup:
1. Enter owner/repo/branch values that exist.
2. Enter invalid or revoked token.
3. Attempt upload/delete/persist action.

Expected:
- GitHub API call fails (`request`/`persist` pathway).
- User sees actionable failure notification.
- No phantom success rows are left in library/gallery after failure.

### Case 3: Success path (fully valid config)
Setup:
1. Provide valid owner/repo/branch/token.
2. Upload one document and one image.
3. Refresh page.

Expected:
- Manifests are written and reloaded successfully.
- Document and image records rehydrate after reload.
- Viewer/gallery/library states remain synchronized.

---

## 4) Persistence and accessibility checks

### Persistence checks
- [ ] GitHub config persists under `invisibleSupport.githubConfig` and restores on reload.
- [ ] Document manifest persists through `invisibleSupport.documents` → `storage/documents.json`.
- [ ] Image manifest persists through `invisibleSupport.images` → `storage/images.json`.
- [ ] Split-pane positions persist with keys `splitPane:doc-split` and `splitPane:img-split`.
- [ ] Deleting items removes corresponding records and updates storage usage snapshot.

### Accessibility checks
- [ ] All panel collapse buttons (`[data-panel-toggle]`) toggle `aria-label` between expand/collapse.
- [ ] Upload progressbar updates `aria-valuenow` and remains understandable to screen readers.
- [ ] Split-pane handle supports keyboard controls (`Arrow`, `Shift+Arrow`, `Home`, `End`) with `aria-valuenow` updates.
- [ ] Viewer/gallery/list/table keyboard activation works (`Enter`/`Space`), and delete shortcuts do not trap focus.
- [ ] Modal interactions (storage modal) maintain keyboard operability and explicit close/escape path.

---

## 5) Known environment constraints (offline/read-only contexts)

When validating in constrained environments (CI sandboxes, static previews, read-only runners), use these expectations:

### Offline / no network
- GitHub API writes/reads cannot complete.
- Upload, delete, and manifest persistence tests should be marked **blocked by network**.
- UI-only checks (layout, selectors, panel toggles, split-pane drag/keyboard, localization application) remain valid.

### Read-only filesystem
- Commands that write generated/build artifacts (`npm run generate:pages`, `npm run build`) may fail.
- Treat failures as **environmental constraints**, not app defects.

### Browser API limitations
- Clipboard API may be unavailable in insecure/non-browser contexts; fallback copy path may still fail.
- Object URL behavior and file input interactions can be partially unavailable in headless environments.

### Guidance for reporting
For each blocked test, record:
- exact command or action attempted,
- environment constraint (offline/read-only/limited browser API),
- expected behavior under full writable networked environment,
- and whether any unrelated regressions were observed.
