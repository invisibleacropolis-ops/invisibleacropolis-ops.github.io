# Shared systems

This page captures cross-cutting systems used by all panels.

## Core shared dependencies
- `public/InvisibleSupport/src/main.js`
- `public/InvisibleSupport/src/shared/services/github.js`
- `public/InvisibleSupport/src/shared/services/storage-manager.js`
- `public/InvisibleSupport/src/shared/services/base-store.js`
- `public/InvisibleSupport/src/shared/ui/split-pane.js`
- `public/InvisibleSupport/src/shared/ui/notifications.js`
- `public/InvisibleSupport/src/shared/localization/index.js`
- `public/InvisibleSupport/src/shared/infrastructure/event-bus.js`
- `public/InvisibleSupport/src/shared/infrastructure/store.js`

## Engineer notes
- Track initialization order from `main.js` before debugging panel interaction issues.
- Validate shared notifications and split-pane persistence as cross-panel behavior.
- Confirm localization keys resolve for panel labels and dialog titles.
