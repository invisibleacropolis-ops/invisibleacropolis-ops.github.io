# Invisible Support data flow and persistence

This document traces how the Invisible Support portal moves data between UI features, in-memory stores, GitHub-backed file storage, and JSON manifests.

## Scope traced

- Feature modules under `public/InvisibleSupport/src/features/**`:
  - Documents: `upload.js`, `store.js`, `library-view.js`, `viewer.js`.
  - Images: `upload.js`, `store.js`, `gallery.js`, `viewer.js`.
  - Storage/settings: `storage/ui.js`, `settings/github-settings.js`.
- Shared services:
  - `public/InvisibleSupport/src/shared/services/github.js`
  - `public/InvisibleSupport/src/shared/services/storage-manager.js`
  - `public/InvisibleSupport/src/shared/services/base-store.js` (bridge used by both document/image stores)
- Manifests:
  - `public/InvisibleSupport/storage/documents.json`
  - `public/InvisibleSupport/storage/images.json`

---

## 1) Document upload lifecycle

```mermaid
sequenceDiagram
    title Document upload lifecycle (feature -> store -> GitHub -> manifest)
    participant User
    participant DocUpload as features/documents/upload.js
    participant Storage as shared/services/storage-manager.js
    participant DocStore as features/documents/store.js
    participant BaseStore as shared/services/base-store.js
    participant GitHub as shared/services/github.js
    participant DocManifest as storage/documents.json
    participant UI as DocumentViewer + LibraryView + StorageUI

    User->>DocUpload: Submit form / drop files
    DocUpload->>DocUpload: Validate file list + queue
    DocUpload->>Storage: estimateImpact(size), getSnapshot(), canStore()
    alt quota would be exceeded
        Storage-->>DocUpload: false
        DocUpload-->>User: Inline error + toast (quota exceeded)
    else quota allows upload
        loop each file
            DocUpload->>DocStore: createDocument(file, metadata, progressCb)
            DocStore->>DocStore: readFileAsDataUrl + dataUrlToBase64 + normalizeDocument()
            DocStore->>BaseStore: uploadToGitHub(id, name, base64)
            BaseStore->>GitHub: uploadFile(uploads/documents/{id}/{encodedName})
            GitHub-->>BaseStore: {path, sha, downloadUrl}
            BaseStore-->>DocStore: uploadInfo
            DocStore->>BaseStore: add(documentRecord)
            BaseStore->>Storage: persist('invisibleSupport.documents', serializableItems)
            Storage->>GitHub: writeManifest('storage/documents.json', items, priorSha)
            GitHub->>DocManifest: PUT manifest JSON
            DocManifest-->>GitHub: new sha
            GitHub-->>Storage: sha
            Storage-->>BaseStore: persisted
            BaseStore-->>UI: notify subscribers
        end
        DocUpload-->>User: Success toast + select latest document
    end
```

### Failure branch (user-visible fallback)

- If no files are selected, upload is blocked and the user sees inline + toast feedback.
- If configuration is missing (GitHub owner/repo/token), the upload returns a configuration error and shows a “missing configuration” message.
- If manifest persistence fails after file upload, the UI shows a generic persistence failure error and keeps the progress UI from finishing as success.

---

## 2) Image upload lifecycle

```mermaid
sequenceDiagram
    title Image upload lifecycle (validation-heavy path)
    participant User
    participant ImgUpload as features/images/upload.js
    participant Storage as shared/services/storage-manager.js
    participant ImgStore as features/images/store.js
    participant BaseStore as shared/services/base-store.js
    participant GitHub as shared/services/github.js
    participant ImgManifest as storage/images.json
    participant UI as ImageViewer + ImageGallery + StorageUI

    User->>ImgUpload: Submit image form / drop images
    ImgUpload->>ImgUpload: Build file batch
    loop each file
        ImgUpload->>Storage: estimateImpact/getSnapshot/canStore
        alt quota exceeded
            ImgUpload-->>User: quota exceeded message + stop batch
        else quota available
            ImgUpload->>ImgStore: createImage(file, metadata, progressCb)
            ImgStore->>ImgStore: MIME check + dimensions check
            alt unsupported type or bad dimensions
                ImgStore-->>ImgUpload: throw type/dimensions/max-dimensions
                ImgUpload-->>User: Specific validation message
            else valid image
                ImgStore->>ImgStore: readFileAsDataUrl + normalizeImage()
                ImgStore->>BaseStore: uploadToGitHub(id, name, base64)
                BaseStore->>GitHub: uploadFile(uploads/images/{id}/{encodedName})
                GitHub-->>BaseStore: {path, sha, downloadUrl}
                ImgStore->>BaseStore: add(imageRecord)
                BaseStore->>Storage: persist('invisibleSupport.images', serializableItems)
                Storage->>GitHub: writeManifest('storage/images.json', items, priorSha)
                GitHub->>ImgManifest: PUT manifest JSON
                ImgManifest-->>GitHub: new sha
                GitHub-->>Storage: sha
                Storage-->>BaseStore: persisted
                BaseStore-->>UI: notify subscribers
            end
        end
    end
    ImgUpload-->>User: Success toast + select latest image
```

### Failure branch (user-visible fallback)

- Invalid type, unreadable image, or oversize dimensions return explicit validation messages (not just a generic error).
- If quota is exhausted, the flow exits early and shows storage quota feedback.
- If remote upload/manifest write fails, the user receives persistence failure messaging and no success toast is emitted.

---

## 3) Delete lifecycle for docs/images

```mermaid
sequenceDiagram
    title Delete lifecycle (single item removal in document/image views)
    participant User
    participant ListUI as LibraryView or ImageGallery
    participant Store as DocumentStore or ImageStore
    participant BaseStore as shared/services/base-store.js
    participant GitHub as shared/services/github.js
    participant Storage as shared/services/storage-manager.js
    participant Manifest as documents.json or images.json
    participant OtherUI as Viewer + StorageUI

    User->>ListUI: Click Delete / press Delete key
    ListUI->>ListUI: Compute fallback focus target
    ListUI->>Store: removeDocument(id) / removeImage(id)
    Store->>BaseStore: remove(id)
    BaseStore->>BaseStore: Find item in memory
    alt repoPath exists
        BaseStore->>GitHub: deleteFile(repoPath, sha, message)
        alt GitHub delete fails
            GitHub-->>BaseStore: error
            BaseStore->>BaseStore: warn + continue local flow
        else delete succeeds
            GitHub-->>BaseStore: success
        end
    end
    BaseStore->>Storage: persist(updatedItemsWithoutId)
    Storage->>GitHub: writeManifest(storage/*.json, items, priorSha)
    GitHub->>Manifest: PUT updated manifest
    Manifest-->>GitHub: new sha
    Storage-->>BaseStore: persisted
    BaseStore-->>OtherUI: notify subscribers
    ListUI-->>User: Toast removed + focus next/previous/search
```

### Failure branch (user-visible fallback)

- If remote file deletion fails, removal still continues locally by updating the manifest with the item removed; the user can still see it disappear from UI.
- If the manifest persistence step fails, the list action catches and shows a persistence error toast.
- Keyboard/mouse delete maintains accessibility fallback by shifting focus to neighbor row/item or search input.

---

## 4) Storage accounting lifecycle

```mermaid
sequenceDiagram
    title Storage accounting lifecycle (tracked sizes + meter updates)
    participant Mutation as Upload/Delete/Clear action
    participant BaseStore as shared/services/base-store.js
    participant Storage as shared/services/storage-manager.js
    participant GitHub as shared/services/github.js
    participant DocManifest as storage/documents.json
    participant ImgManifest as storage/images.json
    participant StorageUI as features/storage/ui.js

    Mutation->>BaseStore: add/remove/clearAll
    BaseStore->>Storage: persist(storageKey, serializableItems)
    Storage->>Storage: calculateSize(items)
    Storage->>Storage: buildSnapshot(used, limit, ratio)
    alt ratio >= 100%
        Storage-->>BaseStore: throw quota error (abort persist)
    else within limit
        Storage->>GitHub: writeManifest(mappedPath, items, priorSha)
        alt key is documents
            GitHub->>DocManifest: PUT documents.json
        else key is images
            GitHub->>ImgManifest: PUT images.json
        end
        GitHub-->>Storage: returned sha
        Storage->>Storage: trackedSizes.set(key,size), manifestMeta.set(key,sha)
        Storage-->>StorageUI: notify(snapshot)
        StorageUI->>StorageUI: render meter/warning/modal stats
    end

    Note over GitHub,Storage: GitHub config changes trigger Storage.notify() via subscribe()
```

### Failure branch (user-visible fallback)

- Quota breach is blocked before manifest write; upload forms show quota exceeded feedback.
- Non-config read errors in `StorageManager.read()` degrade to `null`/empty state and reset tracked size to zero, preventing stale over-reporting.
- Storage UI always renders using the latest snapshot and shows warning/exceeded banners as visible guardrails.

---

## 5) Initialization lifecycle from `main.js`

```mermaid
sequenceDiagram
    title Initialization lifecycle from src/main.js
    participant Browser as Browser DOM
    participant Main as src/main.js
    participant Global as window (legacy exports)
    participant Modules as Feature modules
    participant Stores as DocumentStore/ImageStore constructors
    participant Storage as shared/services/storage-manager.js
    participant GitHub as shared/services/github.js
    participant Manifests as documents.json + images.json

    Browser->>Main: Evaluate ES module graph
    Main->>Global: Expose modules on window for legacy compatibility
    Main->>Browser: Check document.readyState
    alt readyState === 'loading'
        Main->>Browser: wait for DOMContentLoaded
        Browser-->>Main: DOMContentLoaded
    else DOM already ready
        Browser-->>Main: continue immediately
    end

    Main->>Modules: init() in fixed order (settings/storage/docs/images/ui)
    Note over Stores,Storage: Store constructors call load() eagerly
    Stores->>Storage: read('invisibleSupport.documents' / 'invisibleSupport.images')
    Storage->>GitHub: readManifest(storage/documents.json | storage/images.json)
    alt manifest exists
        GitHub->>Manifests: GET + decode + parse JSON
        Manifests-->>Stores: item arrays + sha
        Stores-->>Modules: hydrated items + notify subscribers
    else not found / parse issue
        GitHub-->>Storage: null or parse fallback []
        Storage-->>Stores: empty arrays
        Stores-->>Modules: render empty-state UI
    end
```

### Failure branch (user-visible fallback)

- If GitHub is not configured, initial reads throw config errors that are caught by stores, resulting in empty lists instead of app crash.
- If manifests are missing, empty arrays are returned and UI renders empty states (library/gallery/storage counts).
- If manifest JSON is malformed, parse failure falls back to empty array, with app initialization continuing.

---

## Manifest shape notes for engineers

- `storage/documents.json` contains array records with fields such as `id`, `name`, `title`, `type`, `size`, `updatedAt`, `repoPath`, `sha`, `downloadUrl`.
- `storage/images.json` contains array records with fields such as `id`, `name`, `title`, `alt`, `type`, `size`, `width`, `height`, `updatedAt`, `capturedAt`, `exif`, `repoPath`, `sha`, `downloadUrl`.
- Storage accounting currently sums `size` from both arrays; this directly drives quota and warning behavior in the storage meter/modal.
