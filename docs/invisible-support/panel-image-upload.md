# Panel: Image upload

## Purpose
The Image upload panel accepts one or more image files, validates each file, uploads the payload to GitHub-backed storage, persists metadata to the image store, and updates related UI surfaces (gallery + viewer). The controller is initialized by `init()` in `invisible-support/src/features/images/upload.js` and binds to form-level data selectors.

## DOM selectors used by the module
`invisible-support/src/features/images/upload.js` queries and controls the following selectors:

- `[data-image-form]` — root form element and event host (`submit`, `reset`).
- `[data-image-dropzone]` — drag-and-drop target with `is-dragover` visual state.
- `[data-image-file-input]` — native file input for selected uploads.
- `[data-image-title]` — optional title metadata input.
- `[data-image-alt]` — optional alt-text metadata input.
- `[data-image-progress]` — progress container visibility toggle and progress status region.
- `[data-image-feedback]` — inline success/error feedback target.

## Module ownership and dependencies

- **Primary module:** `invisible-support/src/features/images/upload.js`
- **Dependencies requested for this panel:**
  - `invisible-support/src/features/images/store.js`
  - `invisible-support/src/shared/services/github.js`
  - `invisible-support/src/shared/utils.js`

Dependency responsibilities in this upload flow:

- `images/upload.js` orchestrates UI state, batch iteration, validation messaging, and success/failure handling.
- `images/store.js` performs file-level validation (type + dimensions), data normalization, and persistence via `BaseResourceStore` upload helpers.
- `shared/services/github.js` enforces repository configuration; missing config throws a typed `config` error that bubbles up to the upload UI.
- `shared/utils.js` reads file payloads as data URLs and emits progress fractions used by the upload progress bar.

## Supported type constraints and dimension checks

### Type constraints (as implemented)
Type validation occurs in `createImage()` in `images/store.js`:

1. It resolves MIME from `file.type`, or falls back to extension-based `guessMimeType()`.
2. It checks support via `isSupportedImageType()`.
3. `isSupportedImageType()` returns `true` for:
   - Explicit allow-list MIME types:
     - `image/jpeg`, `image/png`, `image/webp`, `image/avif`, `image/gif`,
       `image/heic`, `image/heif`, `image/svg+xml`, `image/tiff`
   - **Any MIME beginning with `image/`** (broad fallback acceptance).
4. On failure, it throws an error with `error.code = 'type'`.

### Dimension checks (as implemented)
- `MAX_IMAGE_DIMENSION` is `8192` in both `upload.js` (for messaging) and `store.js` (for enforcement).
- `store.js#getImageDimensions()` loads the file through an `Image` object and reads natural width/height.
- Failure to decode dimensions throws `error.code = 'dimensions'`.
- Images where `width > 8192` or `height > 8192` throw `error.code = 'max-dimensions'`.

## Title/alt metadata behavior
Metadata is captured once per batch from the form:

- `baseTitle = titleInput.value.trim()`
- `baseAlt = altInput.value.trim()`

For each file in a multi-file upload, `upload.js` passes computed extras to `ImageStore.createImage()`:

- Single file:
  - `title`: exact `baseTitle` (if non-empty)
  - `alt`: exact `baseAlt` (if non-empty)
- Multiple files:
  - `title`: `${baseTitle} (${index + 1})`
  - `alt`: `${baseAlt} (${index + 1})`

Normalization defaults in `store.js#normalizeImage()`:

- `title` defaults to the normalized file name when no title is provided.
- `alt` defaults to an empty string when no alt text is provided.

## Progress UI updates and reset behavior

### Progress update lifecycle
The panel uses `updateProgress(percent, label)` and `hideProgress()`:

- During validation phase per file:
  - Percent: `(index / files.length) * 100`
  - Label: localized `upload.validating` message with current file name.
- During file read/upload phase via `Utils.readFileAsDataUrl(file, progressCallback)`:
  - Callback reports fractional progress `p` in `[0, 1]`.
  - UI percent is mapped to batch progress: `((index + p) / files.length) * 100`.
  - Label: localized `upload.progress` with file name + rounded percent.
- On batch success:
  - Progress forced to `100` with summary label.
  - Success feedback shown.
  - Form reset invoked; file input explicitly cleared.
  - Progress auto-hides after `600ms`.

### Reset behavior
`hideProgress()` performs hard reset of progress UI state:

- `progressContainer.hidden = true`
- fill width set to `0%`
- progress bar `aria-valuenow = '0'`
- label set to `upload.waitingImages`

Reset triggers:

- Form `reset` event: clears progress + inline feedback.
- Upload failure path: displays mapped error and immediately hides progress.
- Successful completion: delayed hide after completion state is shown.

## Error mapping to user feedback

Errors raised by `ImageStore.createImage()` and related dependencies are translated by `describeError(file, error)` in `upload.js`:

- `config` → `upload.errorMissingConfiguration`
  - Source: GitHub service `ensureConfigured()` when owner/repo/token are incomplete.
- `type` → `upload.errorUnsupportedImage` (includes file name)
- `max-dimensions` → `upload.errorImageTooLarge` (includes file name + 8192 limit)
- `dimensions` → `upload.errorImageDimensions` (includes file name)
- `quota` → `notifications.storageQuotaExceeded`
- `persist` → `errors.persistFailure`
- default/unknown → `upload.errorUploadFailed` (includes file name)

Feedback surfaces:

- Inline message: `Notifications.inline(feedback, message, tone)` targeting `[data-image-feedback]`.
- Toast message: `Notifications.toast(message, tone)` for global visibility.

Additional non-exception guardrails:

- Empty selection returns `upload.errorSelectImages`.
- Storage pre-check via `StorageManager.canStore()` prevents upload and shows quota error before file read.
- Large-usage warning toast appears once when projected storage ratio reaches `>= 85%`.

## Operational notes for external engineers

- Upload is **fail-fast**: a single file failure stops the remaining batch.
- Progress is **batch-relative**, not per-file only.
- Successful upload of the final file triggers image viewer selection and gallery focus for the last created image.
- The image upload panel relies on localization keys for all end-user strings; testing should verify key presence and language coverage.
