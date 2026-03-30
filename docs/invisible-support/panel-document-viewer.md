# Panel: Document viewer

## Purpose
The Document viewer panel renders a preview for the selected document, exposes document metadata, and provides direct-link workflows (copy/open). It also owns the canonical selected-document state that the Asset library mirrors.

## Primary anchors
- Viewer select control: `[data-viewer-select]`
- Preview surface: `[data-viewer-preview]`
- Metadata card: `[data-viewer-meta]`
- Copy action: `[data-viewer-copy]`
- Open action: `[data-viewer-open]`

## Owning modules
- Primary renderer/controller: `public/InvisibleSupport/src/features/documents/viewer.js`
- Shared document store subscription: `public/InvisibleSupport/src/features/documents/store.js`
- Library synchronization peer: `public/InvisibleSupport/src/features/documents/library-view.js`
- Shared utilities (clipboard + object URL semantics): `public/InvisibleSupport/src/shared/utils.js`
- User notifications: `public/InvisibleSupport/src/shared/ui/notifications.js`

## Selection model and synchronization
The viewer maintains `currentId` as the selected document.

### Synchronization paths
- **Library row to viewer:** `DocumentViewer.selectDocument(id)` is called by library row actions/keyboard handlers.
- **Viewer select to viewer render:** changing `[data-viewer-select]` triggers `renderDocument(doc)` for the chosen ID.
- **Viewer to library rows:** every selection transition emits `documentviewerchange`; the library listens and re-applies row highlight/ARIA.

### Practical result
The dropdown selection, preview content, metadata, and selected table row remain synchronized with one authoritative ID in the viewer module.

## Rendering strategy by file type
`buildPreviewContent(doc)` performs capability detection using MIME type + filename extension, then chooses the best available renderer.

1. **PDF**
   - Fetches resource blob and attempts Adobe Embed SDK rendering.
   - Uses async script loading and readiness gating.
   - If SDK/resource fails, falls back to generic "Preview unavailable" card.

2. **Office docs (`doc/docx/ppt/pptx/xls/xlsx` etc.)**
   - DOCX: attempts inline conversion via Mammoth browser build.
   - Other office types: uses Office Online embed iframe when direct URL exists.
   - Failure path: fallback card.

3. **Images / Video / Audio**
   - Renders native HTML media elements (`img`, `video`, `audio`) using fetched object/blob URL.

4. **Text-like files (`text/*`, json/csv/xml/yaml, common text extensions)**
   - Reads blob text and renders inside `<pre>`.
   - Applies truncation limit (`TEXT_CHAR_LIMIT`) for extremely large files.

5. **Generic binary fallback**
   - Attempts `<object>` rendering when a URL is available.
   - Otherwise uses explicit fallback card.

## Fallback behavior and resilience
- If rendering fails at any stage (network fetch, SDK load, decode), viewer does not crash the panel; it displays a friendly fallback message.
- Async race-safety uses `renderToken` + `currentId` checks so stale async completions do not overwrite newer selections.
- Cache cleanup removes object URLs for documents no longer in the store.

## Metadata and link state (`[data-viewer-meta]`)
When a document is selected, `updateMeta(doc)` hydrates:
- title/name
- filename
- MIME type
- size (formatted)
- relative updated time
- description (conditionally visible)
- link input / copy target / open target URL

When no document is selected (`renderEmpty()` / `resetMeta()`), metadata resets to placeholders, actions are disabled, and preview empty template is shown.

## Direct-link workflows

### Copy link (`[data-viewer-copy]`)
- Click triggers `copyCurrentLink()`.
- Link source precedence: selected document URL, then current link input value.
- Uses `Utils.copyToClipboard(...)` with a **layered clipboard strategy**:
  1. Selection-based copy using the visible `[data-viewer-link]` input.
  2. `navigator.clipboard.writeText(...)` in secure contexts.
  3. Hidden textarea + `document.execCommand('copy')` fallback for older/locked-down contexts.
- Reports success/failure via `Notifications.toast(...)` using localized messages.

#### Why the button can appear to "do nothing"
- In some environments (embedded webviews, stricter browser policies, certain iframe constraints), the async clipboard API can be blocked or behave inconsistently.
- If fallback only targets off-screen elements, some browsers may reject the copy command without user-visible error.
- The viewer now treats the visible link field as the primary copy source, which makes the button behave like a direct "copy this field" control while preserving manual highlight/copy behavior.

### Open in new tab (`[data-viewer-open]`)
- Click handler prevents default and checks `aria-disabled`.
- For current document, fetches document resource and opens resolved URL with `window.open(..., '_blank', 'noopener')`.
- If no resource exists or fetch fails, action no-ops with console warning.

## Store integration details
- `DocumentStore.subscribe(...)` repopulates `[data-viewer-select]` options on every document set change.
- If selected document is deleted/missing, viewer auto-resets to empty state and emits selection change.
- If selected document metadata changes, viewer re-renders the current document to keep preview/meta current.

## Operational notes for outside engineers
- Add new file-type renderers in `buildPreviewContent(...)` before generic fallback so capability precedence remains deterministic.
- Preserve `renderToken` stale-render guard when introducing new async pipelines.
- Keep copy/open behavior tied to resolved resource URLs to avoid stale-link regressions when backend URLs rotate.
