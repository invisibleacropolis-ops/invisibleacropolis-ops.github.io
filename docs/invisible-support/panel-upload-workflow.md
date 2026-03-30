# Panel: Upload workflow

## 1) Panel purpose
The Upload workflow panel is the document-ingest entry point on the Invisible Support home page. It accepts manual file selection and drag/drop input, stages files in a queue, uploads each file, and then pushes the resulting document records into shared document state so Asset Library and Document Viewer can immediately reflect the new uploads.

In concrete terms, this panel coordinates:
- upload UI state (`pendingFiles`, progress, inline feedback),
- client-side constraints (input presence, queue dedupe, storage-capacity pre-check),
- store-level record creation (`DocumentStore.createDocument`), and
- persistence via GitHub-backed manifests and upload paths through shared services.

## 2) DOM anchors and selectors
Primary anchors for this panel are:

- `#upload-workflow` (panel heading)
- `#document-upload-form` (form root)
- `[data-dropzone]` (drag/drop region)
- `[data-file-input]` (native file input)
- `[data-upload-queue]` (queue container)
- `[data-queue-list]` (queue list element)
- `[data-upload-progress]` (progress block)
- `[data-upload-feedback]` (inline feedback channel)

Related queue/progress selectors used by the controller:
- `[data-queue-summary]`, `[data-queue-empty]`, `[data-queue-clear]`
- `[data-progress-fill]`, `[data-progress-label]`, `.upload-progress__bar`

Accessibility-related attributes in this panel include:
- `role="region"` + `aria-label="Upload dropzone"` on the dropzone,
- `aria-live="polite"` on the queue section,
- `role="progressbar"` with `aria-valuemin/max/now` on the progress bar,
- `role="alert"` on upload feedback.

## 3) Owning modules/files
### Primary owner
- `InvisibleSupport/src/features/documents/upload.js`

### Direct dependencies in the upload flow
- `InvisibleSupport/src/features/documents/store.js`
- `InvisibleSupport/src/shared/services/storage-manager.js`
- `InvisibleSupport/src/shared/services/github.js`
- `InvisibleSupport/src/shared/utils.js`

### Integration targets updated after success
- `InvisibleSupport/src/features/documents/viewer.js` (selection handoff)
- `InvisibleSupport/src/features/documents/library-view.js` (row focus handoff)

## 4) Initialization path
1. App bootstrap calls `init()` for the documents upload module.
2. `init()` in `upload.js` is idempotent (`initialized` guard) and exits if `#document-upload-form` is missing.
3. During initialization it resolves all panel-scoped selectors, then binds:
   - submit/reset handlers,
   - file-input change handler,
   - queue remove/clear handlers,
   - dragenter/dragover/dragleave/dragend/drop handlers.
4. After binding completes, `initialized = true` prevents duplicate listener registration.

Operational assumption: this module expects the upload form markup to exist before `init()` executes and to retain its `data-*` selector contract.

## 5) User interactions
### A) Browse flow (`[data-file-input]`)
1. User chooses one or many files from native picker.
2. `change` handler calls `addFiles()`.
3. `addFiles()` deduplicates by key (`name + size + lastModified`) and appends new files to `pendingFiles`.
4. `renderQueue()` updates queue rows, summary text, empty state, and clear-button state.
5. User submits form, `processFiles()` runs against queued files.

### B) Drag/drop flow (`[data-dropzone]`)
1. `dragenter`/`dragover` prevent default and apply `is-dragover` visual state.
2. `dragleave`/`dragend` clear the visual state.
3. `drop` prevents default, removes `is-dragover`, queues dropped files with `addFiles()`, then auto-starts upload when queue is non-empty (`processFiles(pendingFiles)`).

### C) Queue management
- Per-item remove action: delegated click on `[data-queue-remove]` calls `removeFromQueue(key)`.
- Clear queue: `[data-queue-clear]` calls `clearQueue()`.
- Reset form: native reset triggers `hideProgress()`, clears inline feedback, and empties queue.
- During active upload (`isUploading`), queue remove/clear actions are disabled.

### D) Submit/upload execution
- `submit` prevents default and uploads either:
  - queued files (`pendingFiles`) if present, or
  - current native input files (`fileInput.files`) otherwise.

## 6) State model
### In-memory UI state (upload controller)
- `pendingFiles: File[]` — queued files awaiting upload.
- `pendingKeys: Set<string>` — dedupe keys for queue integrity.
- `isUploading: boolean` — disables mutating queue actions and gates UI behavior.
- Cached DOM refs for progress/feedback/queue rendering.

### Derived UI state
- Queue summary text from file count + `Utils.formatBytes(totalSize)`.
- Progress percentage computed globally across multiple files and within-file read progress.
- Disabled state for queue clear/remove actions while uploading.

### Persisted state (post-upload)
- Document records are persisted via `StorageManager.persist('invisibleSupport.documents', items)`.
- Manifest writes land at `storage/documents.json` in GitHub-backed storage.
- Binary payload upload path resolves under `uploads/documents/<id>/<encodedName>`.

## 7) Function inventory
### `upload.js` (panel controller)
- `init()` — binds DOM, listeners, and drag/drop support.
- `addFiles(fileList)` — normalizes + dedupes queue additions.
- `renderQueue()` — queue DOM reconciliation + summary/empty-state controls.
- `processFiles(fileList)` *(async)* — end-to-end upload orchestration, progress, toast + inline feedback, success handoff.
- `clearQueue()`, `removeFromQueue(key)` — queue mutation helpers.
- `updateProgress(percent, label)`, `hideProgress()` — progress UI lifecycle.
- `showFeedback(message, tone)`, `resetFeedback()` — inline feedback channel.

### `documents/store.js` (document creation)
- `createDocument(file, extras, progressCallback)` *(async)*:
  1. Validates `file instanceof File`.
  2. Reads file to data URL (`Utils.readFileAsDataUrl`) with progress callback.
  3. Converts to base64 (`Utils.dataUrlToBase64`).
  4. Normalizes metadata (`normalizeDocument`).
  5. Uploads content via inherited `uploadToGitHub`.
  6. Persists updated record list with `add()`.

### `base-store.js` and services in the handoff chain
- `BaseResourceStore.uploadToGitHub()` enforces GitHub config and executes `GitHubIntegration.uploadFile`.
- `BaseResourceStore.add()` persists next item set via `StorageManager.persist`.
- `StorageManager.persist()` checks quota, writes manifest through `GitHubIntegration.writeManifest`, and throws normalized `quota` / `persist` errors.
- `GitHubIntegration` provides config checks and GitHub contents API operations.

## 8) Events and cross-panel integration
After successful uploads:
- Upload module emits user-facing toast + inline success feedback.
- Upload module resets form + queue state.
- Upload module calls `DocumentViewer.selectDocument(lastDoc.id)` so the most recent upload is selected in viewer context.
- Upload module schedules `LibraryView.focusRow(lastDoc.id)` to move focus/highlight into the library table.
- Store subscribers (library/viewer) receive updated document list once `DocumentStore.add()` persists and notifies.

The result is immediate panel-to-panel synchronization without requiring a page refresh.

## 9) Failure modes and UX fallbacks
### Missing GitHub configuration
- Condition: token/owner/repo not configured.
- Origin: config enforcement in GitHub service / base store.
- User impact: upload stops; inline feedback + error toast show missing-configuration message.

### Unsupported files / invalid payload shape
- Browser-level gating: file input `accept` limits chooser to known extensions.
- Runtime gating: non-`File` values are rejected by `createDocument()` with `invalid` error.
- User impact: upload is blocked and surfaced as validation/upload error.

### Storage quota exceeded
- Pre-check: upload controller calls `StorageManager.canStore(estimateImpact(size))` before each file.
- Persist check: `StorageManager.persist()` also guards final manifest write.
- User impact: quota exceeded message appears; upload is aborted.

### Upload/persist request errors
- Any GitHub request/write failure is normalized to `persist` or `request` pathway and surfaced through panel feedback + toast.
- Upload loop exits early on first failed file; remaining queue entries are not uploaded in that run.

### Empty selection
- Submitting with no queued/native files triggers immediate selection error feedback and toast.

## 10) Security and privacy notes
- GitHub token is managed by shared GitHub config service and sent as bearer auth headers for API calls; this panel does not directly manipulate token fields.
- Uploaded filenames and metadata (title/description/size/type/timestamps) become part of persisted manifest data.
- Progress and feedback messages may reveal filenames in UI text; this is expected product behavior for operator visibility.
- Queue dedupe key includes filename, size, and `lastModified` in-memory only.

## 11) Test checklist
Use this focused checklist when validating panel behavior:

1. **Browse upload path**
   - Select one allowed file, submit, verify progress/feedback success.
2. **Drag/drop upload path**
   - Drop one or more files into dropzone, verify auto-start and progress updates.
3. **Queue operations**
   - Add multiple files, remove one row, clear queue, verify summary/empty state.
4. **Reset behavior**
   - Add files + start interaction, press Reset, verify queue cleared and progress hidden.
5. **Cross-panel handoff**
   - After successful upload, confirm library list updates and viewer selection follows last uploaded item.
6. **Missing config failure**
   - Clear GitHub token and attempt upload; verify inline + toast error.
7. **Unsupported/invalid upload attempt**
   - Attempt disallowed extension from picker/drop where possible; verify failure messaging.
8. **Quota failure**
   - Set low storage limit and upload file larger than remaining quota; verify abort + quota message.
9. **Network/request failure simulation**
   - Force failing GitHub response (invalid token/repo) and verify upload error handling.

## 12) Known gaps / TODOs
- The UI copy references clipboard paste, but this module currently implements browse + drag/drop only.
- Upload execution short-circuits on first per-file failure; there is no partial-success summary for remaining queued files.
- Validation of accepted types relies mainly on input `accept` and downstream file handling rather than an explicit allowlist in `upload.js`.
- No retry/backoff policy is implemented for transient GitHub request failures.
