# Panel: Asset library

## Purpose
The Asset library panel is the document table surface that lets support engineers find, select, and manage uploaded document assets. It is responsible for search filtering, row-level actions, and keeping row selection synchronized with the Document viewer panel.

## Primary anchors
- Search input: `[data-library-search]`
- Table rows container: `[data-library-rows]`
- Empty-state container: `[data-library-empty]`

## Owning modules
- Primary renderer/controller: `public/InvisibleSupport/src/features/documents/library-view.js`
- Shared state source: `public/InvisibleSupport/src/features/documents/store.js`
- Viewer integration target: `public/InvisibleSupport/src/features/documents/viewer.js`
- Link copy + format helpers: `public/InvisibleSupport/src/shared/utils.js`
- User-facing feedback: `public/InvisibleSupport/src/shared/ui/notifications.js`

## Data flow and lifecycle
1. `init()` binds DOM references for search, rows, and empty state.
2. The panel subscribes to `DocumentStore.subscribe(...)` so any create/delete/update in the shared store immediately re-renders rows.
3. `render()` clears the row container, applies the current search query filter, toggles `[data-library-empty]`, and rebuilds table rows.
4. Selection CSS/ARIA is re-applied via `syncSelection()` after every render so viewer-driven changes are reflected in the table.

## Search behavior (`[data-library-search]`)
- The search listener lowercases and trims the query.
- Filtering is inclusive across `title`, `name`, `type`, and `description`.
- Empty results keep keyboard focus continuity using the pending-focus mechanism (either back to a sibling row or the search field).

## Selection synchronization (table row ↔ viewer select)
Selection synchronization is bi-directional and event-driven:

- **Library → Viewer:**
  - Clicking a row `View` action calls `DocumentViewer.selectDocument(id)`.
  - Keyboard selection (`Enter`/`Space` on focused row) does the same.
- **Viewer → Library:**
  - The viewer dispatches a global `documentviewerchange` event.
  - The library listens and runs `syncSelection()` to toggle `is-selected`/`aria-selected` on row `<tr data-id>` nodes.
- **Shared source of truth:**
  - The current selection comes from `DocumentViewer.getSelectedId()` when rows are rendered/updated.

This means the table highlight and viewer dropdown (`[data-viewer-select]`) stay aligned even if selection starts from either panel.

## Row actions and side effects
Each row includes four actions with distinct behavior:

### View
- Trigger: `button[data-action="view"]`
- Side effects:
  - Selects document in viewer.
  - Updates table selection state.
  - Stores pending focus target for accessibility continuity.

### Copy link
- Trigger: `button[data-copy]` (value is `downloadUrl || blobUrl`)
- Side effects:
  - Calls `Utils.copyToClipboard(link)`.
  - Shows toast via `Notifications.toast(...)` using localized success/failure messages.

### Download
- Trigger: `<a>` with `download` attribute and target `_blank`.
- Side effects:
  - Browser-native file download/new-tab behavior.
  - If no URL is available, the control is marked disabled (`is-disabled`, `aria-disabled="true"`).

### Delete
- Trigger: `button[data-action="delete"]` or `Delete` key on focused row.
- Side effects:
  - Calls `DocumentStore.removeDocument(id)`.
  - On success: info toast (`notifications.documentRemoved`) and row list refresh through store subscription.
  - On failure: error toast (`errors.persistFailure`) and console error.
  - Focus fallback is chosen before deletion (previous row, next row, otherwise search input).

## Empty-state behavior (`[data-library-empty]`)
- When filtered list is empty, the empty-state node is shown and no rows are mounted.
- On non-empty results, empty-state node is hidden.
- Focus restoration still runs so keyboard users are not stranded after action/filter transitions.

## Accessibility and keyboard support
- Rows are focusable (`tabIndex = -1`) and support keyboard activation.
- Selected rows receive `aria-selected="true"`.
- Delete via keyboard mirrors click behavior for parity.
- Focus management (`pendingFocusTarget`) preserves workflow continuity after select/delete operations.

## Operational notes for outside engineers
- Because rendering is full-row rebuild on each store/search update, custom row-level state should be sourced from store/viewer APIs rather than DOM mutation.
- If adding actions, route user-visible outcomes through `Notifications.toast(...)` to match existing feedback conventions.
- Keep selection updates tied to `documentviewerchange` + `DocumentViewer.getSelectedId()` to avoid split-brain state between panels.
