# Data flow and persistence

## Home page lifecycle
1. `main.js` evaluates module imports (shared infrastructure → services → feature slices → shared UI).
2. DOM readiness guard determines whether to run `init()` immediately or defer to `DOMContentLoaded`.
3. `init()` runs the ordered bootstrap chain (`Localization` through panel toggles).
4. Feature stores and views load persisted manifests/config and render current state.
5. User actions dispatch updates to stores/services.
6. GitHub/storage services persist changes and trigger UI refresh.

## Initialization lifecycle

```mermaid
sequenceDiagram
    title Initialization lifecycle
    participant Browser as Browser/DOM
    participant Main as main.js
    participant I18n as Localization
    participant Settings as GitHubSettings
    participant Storage as StorageUI
    participant DocView as DocumentViewer
    participant Library as LibraryView
    participant Upload as UploadController
    participant ImgView as ImageViewer
    participant Gallery as ImageGallery
    participant ImgUpload as ImageUpload
    participant Split as SplitPane
    participant Toggles as initPanelToggles

    Browser->>Main: Load module graph
    Main->>Browser: Check document.readyState
    alt readyState is "loading"
        Main->>Browser: addEventListener('DOMContentLoaded', init)
        Browser-->>Main: DOMContentLoaded
    else DOM already parsed
        Browser-->>Main: continue immediately
    end

    Main->>I18n: Localization.apply()
    Main->>Settings: GitHubSettings.init()
    Main->>Storage: StorageUI.init()
    Main->>DocView: DocumentViewer.init()
    Main->>Library: LibraryView.init()
    Main->>Upload: UploadController.init()
    Main->>ImgView: ImageViewer.init()
    Main->>Gallery: ImageGallery.init()
    Main->>ImgUpload: ImageUpload.init()
    Main->>Split: SplitPane.init()
    Main->>Toggles: initPanelToggles()
    Main->>Browser: window.openStorageModal / closeStorageModal exported
```

## Panel toggle state flow

- `initPanelToggles()` queries all `[data-panel-toggle]` controls.
- Each click handler finds the nearest `.u-card`.
- If no card is found, the handler returns (no-op guard).
- Otherwise the handler toggles `.is-collapsed`, producing selector state `.u-card.is-collapsed`.
- The same event updates control text (`Expand`/`Collapse`) and `aria-label` (`Expand panel`/`Collapse panel`).

## Persistence surfaces
- GitHub configuration and local settings.
- Document/image manifests.
- Split-pane/collapse layout preferences.

## Engineer notes
- Trace issue paths using the panel docs + shared systems docs together.
- Startup bugs are usually one of: wrong init order, DOM-not-ready assumptions, or missing global compatibility exports.
- Confirm deletion and upload paths both update manifest + storage indicators.
