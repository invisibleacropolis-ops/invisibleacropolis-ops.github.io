# Panel: Image Viewer

## Purpose and scope
The Image Viewer panel presents the currently selected image with interactive fit/zoom controls, metadata and EXIF details, and direct-link actions (copy/open). It is selection-driven by image ids in the shared image store and emits selection-change events consumed by the gallery.

- DOM mount selectors: `[data-image-viewer]`, `[data-image-canvas]`, `[data-image-preview]`, `[data-image-fit]`, `[data-image-zoom]`, `[data-image-meta]`, `[data-image-exif]`, `[data-image-copy]`, `[data-image-open]`
- Primary module: `public/InvisibleSupport/src/features/images/viewer.js`
- Supporting modules:  
  - `public/InvisibleSupport/src/features/images/store.js` (selected-image lookup + subscription)  
  - `public/InvisibleSupport/src/shared/utils.js` (`formatBytes`, `formatDateTime`, `copyToClipboard`)  
  - `public/InvisibleSupport/src/shared/ui/notifications.js` (copy success/failure toasts)  
  - `public/InvisibleSupport/src/shared/services/github.js` (repo-backed open/download path)

## Initialization and selector contract
`init()` resolves and caches all viewer elements, attaches listeners, subscribes to image store changes, and renders the empty state by default.

### Core selectors
- `[data-image-viewer]`: panel wrapper (layout shell; not directly mutated in viewer module).
- `[data-image-canvas]`: visual canvas region for image display. Receives `data-fit` state.
- `[data-image-preview]`: `<img>` element used to render selected image content.
- `[data-image-fit]`: fit mode buttons (contain/cover/actual).
- `[data-image-zoom]`: range input (25–200 effective clamp).
- `[data-image-meta]`: metadata section wrapper; hidden when no selection.
- `[data-image-exif]`: EXIF section wrapper; hidden when no supported EXIF values.
- `[data-image-copy]`: copy-link action button.
- `[data-image-open]`: open-link action anchor with disabled semantics via `aria-disabled`.

## Selection/focus semantics across gallery and viewer

### Selection flow
- Gallery (or other callers) invokes `selectImage(id)`.
- Viewer resolves image by id using `ImageStore.getImage(id)`.
- If found, `renderImage(image)`; otherwise `renderEmpty()`.

### Selection change event
After any render that affects selection, viewer dispatches:
- `new CustomEvent('imageviewerchange', { detail: { id: currentId } })`

Gallery listens to this event and re-syncs selected thumbnail state.

### Focus behavior
Viewer calls `focusCanvas()` after `renderImage()` and `renderEmpty()`:
- sets `tabindex="-1"` on `[data-image-canvas]`
- programmatically focuses canvas with `preventScroll: true`

This keeps keyboard context anchored in viewer after selection transitions.

## Fit/fill/actual modes and zoom interactions

### Fit modes
`[data-image-fit]` buttons map to `data-image-fit` values:
- `contain` (UI label: Fit)
- `cover` (UI label: Fill)
- `actual` (UI label: Actual)

On mode change (`setFit(nextFit)`):
1. `currentFit` is updated.
2. `[data-image-canvas]` gets `data-fit=nextFit`.
3. Active fit button gets `.is-active`; others are cleared.
4. `applyTransform()` runs.

### Zoom behavior
- Zoom value is clamped to `[25, 200]` in `setZoom()`.
- Slider input/change both update zoom continuously.
- Effective image transform is built as `orientationTransform + scale(zoom/100)`.

### Orientation handling
Viewer reads `image.exif.orientation` (fallback `1`) and applies orientation transforms before scale (e.g., rotation/flips for EXIF orientations 2–8).

### Reset behavior on selection changes
When a new image is rendered:
- zoom resets to `100`
- zoom slider value resets to `100`
- current fit mode is preserved (or defaults to `contain` if unset)

When rendering empty state:
- selection id is cleared
- orientation resets to `1`
- preview image is hidden and transform cleared
- controls/meta are hidden
- fit is reset to `contain`

## EXIF and metadata display rules

### Metadata fields
Viewer writes these fields when image exists:
- Name: `title || name`
- Filename: `name`
- Dimensions: `${width} × ${height}px` when both present, else `—`
- Size: `Utils.formatBytes(size)`
- Type: `type || 'Unknown'`
- Alt text: `alt || '—'`
- Taken:
  1. If `capturedAt` exists, show localized `Utils.formatDateTime(capturedAt)` (fallback to raw capturedAt string if formatter returns `—`).
  2. Else, if EXIF `dateTimeOriginal` exists, show cleaned EXIF date string.
  3. Else `—`.

On empty state, all metadata display fields reset to em dash (`—`).

### EXIF section
EXIF container `[data-image-exif]` is hidden unless at least one supported value is present. Rendered fields (when present):
- Camera (`make + model`)
- Lens (`lensModel`)
- Aperture (`fNumber` as `f/{value}`)
- Shutter (`exposureTime` as `{value}s`)
- ISO (`iso`)
- Focal Length (`focalLength` as `{value}mm`)
- Focal Length (35mm) (`focalLength35mm` as `{value}mm`)
- Software (`software`)

Unsupported/missing values are omitted (not displayed as blank rows).

## Direct-link controls and disabled/open states

### Link source precedence
Current image URL is resolved as:
1. `blobUrl`
2. `downloadUrl`
3. empty string

This value is pushed into the link input (`[data-image-link]`) and into copy/open controls.

### Copy control (`[data-image-copy]`)
- Stores the current URL in `data-copy`.
- On click, `copyCurrentLink()` resolves current URL and attempts `Utils.copyToClipboard(link, linkInput)`.
- Clipboard order prefers selecting the visible `[data-image-link]` field first, then async clipboard, then hidden-textarea fallback.
- Toast outcomes:
  - success → `common.copySuccess` (`success` tone)
  - failure/no link/error → `common.copyFailure` (`error` tone)

### Open control (`[data-image-open]`)
- `href` is set to URL or `#` if unavailable.
- Disabled state is represented by `aria-disabled="true"` when no URL.
- Click handler always calls `preventDefault()` and exits immediately if disabled.
- Enabled/open behavior:
  - If image has `repoPath` and GitHub integration is configured, module downloads file bytes, creates blob URL, and opens new tab to blob URL (revoked after timeout).
  - Otherwise opens `blobUrl || downloadUrl` in a new tab with `noopener`.
- Open failures are logged with warning; no toast is emitted in current implementation.

## Store subscription behavior
Viewer subscribes to `ImageStore` updates:
- If no current selection and store is empty: render empty state.
- If current selection exists but disappears from store: render empty state.
- If current selection still exists: re-render selected image (keeps metadata and URL controls fresh).

## Engineer validation checklist
- Confirm fit mode state reflection on `[data-image-canvas][data-fit]` and active control class.
- Confirm zoom clamp and orientation+scale transform stacking.
- Confirm metadata fallback ordering (`capturedAt` vs `exif.dateTimeOriginal` vs `—`).
- Confirm EXIF container hides when no renderable EXIF fields exist.
- Confirm open-link disabled semantics (`aria-disabled`, `href="#"`, and click no-op).
- Confirm copy/open use latest selected image URL after selection switches.
