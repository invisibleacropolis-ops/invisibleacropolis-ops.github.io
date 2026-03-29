# Data flow and persistence

## Home page lifecycle
1. `main.js` initializes feature modules.
2. Feature stores load persisted manifests/config.
3. Panel UIs subscribe to state and render current data.
4. User actions dispatch updates to stores/services.
5. GitHub/storage services persist changes and trigger UI refresh.

## Persistence surfaces
- GitHub configuration and local settings.
- Document/image manifests.
- Split-pane/collapse layout preferences.

## Engineer notes
- Trace issue paths using the panel docs + shared systems docs together.
- Confirm deletion and upload paths both update manifest + storage indicators.
