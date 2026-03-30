# Panel: Image Gallery

## Purpose and scope
The Image Gallery panel is the browsing and selection surface for image assets already present in the image store. It renders image thumbnails in **grid** or **list** modes, supports search filtering, supports keyboard delete/select actions, and keeps selection state synchronized with the Image Viewer panel.

- DOM mount selectors: `[data-image-search]`, `[data-image-view]`, `[data-image-gallery-items]`, `[data-image-gallery-empty]`
- Primary module: `public/InvisibleSupport/src/features/images/gallery.js`
- Supporting modules:  
  - `public/InvisibleSupport/src/features/images/store.js` (source data and deletion)  
  - `public/InvisibleSupport/src/features/images/viewer.js` (selection target and selected-id source)  
  - `public/InvisibleSupport/src/shared/utils.js` (`formatBytes`)  
  - `public/InvisibleSupport/src/shared/ui/notifications.js` (`toast` feedback)

## Initialization and ownership
`init()` binds selectors once, subscribes to store updates, wires view/search inputs, and wires keyboard handlers on the gallery list container. On every store update, the module re-renders the filtered item list and applies selected-item styling based on current viewer selection.

### Selector contract
- `[data-image-search]`: free-text input. `input` events update `query` and trigger render.
- `[data-image-view]`: view-mode toggle buttons, each with `data-image-view="grid"` or `"list"`.
- `[data-image-gallery-items]`: `<ul>` container where thumbnail `<button>` items are generated.
- `[data-image-gallery-empty]`: empty-state element shown when current filter has zero results.

## Grid/list toggle and filtering behavior

### View mode
- Default view mode is `grid`.
- Clicking any `[data-image-view]` button sets `viewMode` to the button’s `data-image-view` value.
- The gallery container toggles CSS modifiers:
  - `image-gallery__items--grid` when `viewMode === 'grid'`
  - `image-gallery__items--list` when `viewMode === 'list'`
- Active toggle button receives `.is-active`; all other view buttons remove `.is-active`.

### Filtering
Filtering is case-insensitive and runs on a normalized `query` from `[data-image-search]`.

An image matches when **any** of the following fields contains the query substring:
- `title`
- `name`
- `type`
- `alt`
- EXIF fields: `make`, `model`, `lensModel`

If filtered output is empty:
- `[data-image-gallery-empty]` is shown (`hidden = false`)
- list container is cleared
- selection sync still runs so stale selection highlighting is removed

## Selection/focus semantics across gallery and viewer

### Selection authority
Selection state is effectively owned by the viewer (`ImageViewer.getSelectedId()`). Gallery uses that selected id to mark thumbnails:
- `.is-selected` class
- `aria-current="true"` on the selected button

### Selection operations
- Mouse click on a thumbnail button: `ImageViewer.selectImage(image.id)` then local selection sync.
- Keyboard on focused thumbnail button:
  - `Enter` or `Space`: selects image in viewer.
  - `Delete`: deletes image from store.

### Cross-panel synchronization
- Viewer emits `imageviewerchange` on `document` when selection changes.
- Gallery listens for `imageviewerchange` and re-runs selection sync, keeping highlight/current state aligned even when selection originates outside gallery interactions.

### Focus continuity on delete
Gallery preserves user focus after deletion via `pendingFocusId`:
1. Compute fallback target in order: next thumbnail → previous thumbnail → search input (`'search'`).
2. Remove image from store.
3. After re-render, apply pending focus:
   - `focusItem(id)` for a remaining thumbnail, or
   - focus `[data-image-search]` if no thumbnails remain.

This applies for both pointer-triggered delete button clicks and keyboard `Delete` actions.

## Rendering and item composition
For each filtered image, gallery creates a `<button class="image-gallery__thumb" data-id="...">` with:
- lazy-load image element (`loading="lazy"`, `decoding="async"`)
- title/name and metadata block
- optional dimension label (`{width}×{height}px`)
- optional file-size label from `Utils.formatBytes(size)`
- inline remove button that calls `ImageStore.removeImage(id)`

If `IntersectionObserver` is available, image `src` is deferred through `data-src` until near viewport (`rootMargin: 120px`, `threshold: 0.1`).

## Error handling and user feedback
On delete failure, module logs to console and triggers error toast via `Notifications.toast(t('errors.persistFailure'), 'error')`.

On delete success, module shows informational toast `notifications.imageRemoved`.

## Engineer validation checklist
- Verify view toggle class changes and `.is-active` behavior for both grid and list.
- Verify filter coverage for metadata fields (including EXIF make/model/lens).
- Verify selection highlight updates when viewer selection changes externally.
- Verify focus fallback order after deletion, especially when deleting first/last/only item.
- Verify empty-state visibility logic under active filters and full-list empty condition.
