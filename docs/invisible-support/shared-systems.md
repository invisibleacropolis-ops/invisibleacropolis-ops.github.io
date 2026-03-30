# Shared systems

This page documents cross-panel infrastructure in the Invisible Support Portal so outside engineers can quickly understand shared contracts, selectors, persistence, and restoration behavior.

## Split panes

**Source:** `public/InvisibleSupport/src/shared/ui/split-pane.js`

### DOM contract
- Container: `.split-pane[data-split-id]`
- Drag handle inside each pane: `[data-split-handle]`
- Runtime layout variable: container CSS custom property `--split-left`

### Behavior
- `SplitPane.init()` scans all `.split-pane` containers and initializes each once.
- Drag and touch gestures update `--split-left` in real time (clamped from **15%** to **85%**).
- Keyboard support on `[data-split-handle]`:
  - `ArrowLeft` / `ArrowRight`: -/+ 1%
  - `Shift + ArrowLeft` / `Shift + ArrowRight`: -/+ 5%
  - `Home`: 15%
  - `End`: 85%
- Accessibility updates include `aria-valuenow` on the handle as values change.

### Persistence and restoration
- Persisted key pattern: **`splitPane:<splitId>`** in `localStorage`.
  - Example keys from `index.html` panes:
    - `splitPane:doc-split`
    - `splitPane:img-split`
- Values are saved as numeric percentages (rounded to one decimal place).
- On init, if a persisted value exists and is in range, it restores `--split-left` before interaction.
- If `data-split-id` is missing, behavior still works but no persistence occurs.

---

## Storage meter + storage management modal

**Sources:**
- `public/InvisibleSupport/src/features/storage/ui.js`
- `public/InvisibleSupport/src/shared/services/storage-manager.js`
- `public/InvisibleSupport/src/features/documents/store.js`
- `public/InvisibleSupport/src/features/images/store.js`

### DOM contract
- Meter root: `[data-storage-meter]`
- Meter children used by UI rendering:
  - `[data-storage-summary]`
  - `[data-storage-limit]`
  - `[data-storage-progress]`
  - `[data-storage-progress-bar]`
  - `[data-storage-warning]`
  - `[data-storage-manage]`
- Modal root: `#storage-modal`
- Modal data bindings:
  - `[data-storage-used]`
  - `[data-storage-available]`
  - `[data-storage-documents]`
  - `[data-storage-images]`
  - `[data-storage-clear]`
  - `[data-storage-cancel]`

### Behavior
- `StorageUI.init()` caches meter/modal nodes, then subscribes to:
  - storage snapshot updates (`StorageManager.subscribe`)
  - documents collection updates (`DocumentStore.subscribe`)
  - images collection updates (`ImageStore.subscribe`)
- Meter shows used/limit/percent values and warning states:
  - `is-warning` at threshold (near quota)
  - `is-exceeded` at quota breach
- Modal displays per-collection counts + byte usage and supports “clear all stored items”.
- `window.openStorageModal` / `window.closeStorageModal` are exposed from `main.js` for compatibility with older code.

### Persistence keys and restoration
- Resource manifest keys tracked by storage services:
  - **`invisibleSupport.documents`**
  - **`invisibleSupport.images`**
- `StorageManager` maps those keys to manifests:
  - `storage/documents.json`
  - `storage/images.json`
- Restoration flow:
  1. Document and image stores call `load()` at construction.
  2. `StorageManager.read(key)` pulls manifest data from GitHub.
  3. Stores hydrate/sort records and notify subscribers.
  4. Storage meter/modal recompute from live snapshots + collection state.
- If GitHub config is missing, stores safely fall back to empty in-memory state and still notify UI.

---

## Clipboard confirmation modal

**Primary selector target:** `#clipboard-confirm` with close button `[data-close-modal]`.

### Current state of implementation
- The modal markup exists in `public/InvisibleSupport/index.html`.
- In the current ESM code path, copy actions in document/image modules use:
  - `Utils.copyToClipboard(...)`
  - `Notifications.toast(...)`
- There is **no current module wiring** that opens/closes `#clipboard-confirm` or binds `[data-close-modal]` in `src/`.

### Practical implication for engineers
- Clipboard UX is presently toast-based confirmation, not modal-based confirmation.
- If teams want modal confirmation, add explicit event binding in a shared UI controller and define focus-return behavior similarly to `StorageUI`.

---

## Localization

**Source:** `public/InvisibleSupport/src/shared/localization/index.js`

### DOM contract
- Translation selector: `[data-i18n-key]`

### Behavior
- `Localization.apply(root)` traverses the provided root and translates all nodes with `data-i18n-key`.
- Key lookup uses dot-path strings (example: `labels.storageUsed`).
- Placeholder interpolation uses `{token}` replacement via `t(key, replacements)`.
- Inputs/textareas receive translated `placeholder`; other nodes receive `textContent`.

### Locale selection/restoration behavior
- Default locale comes from `document.documentElement.lang`; fallback is `en`.
- `setLocale(locale)` updates in-memory locale and immediately reapplies translations.
- No locale preference persistence key is implemented in this module currently.

---

## Notifications

**Source:** `public/InvisibleSupport/src/shared/ui/notifications.js`

### DOM contract
- Toast host container: `[data-toast-stack]`

### Behavior
- `toast(message, tone, { duration })` appends toast cards into the stack.
- Tone classes and symbols:
  - `success` (`✓`)
  - `error` (`⚠`)
  - `info` (`ℹ`)
- Dismissal paths:
  - auto-hide timer (default 5000 ms)
  - click toast / click dismiss button
  - keyboard (`Enter` / `Space`)
- `inline(target, message, tone)` supports inline error/success messaging for form-like components.

### Persistence
- Notification toasts are transient only (no storage key / no restoration).

---

## State + event infrastructure

**Sources:**
- `public/InvisibleSupport/src/shared/infrastructure/store.js`
- `public/InvisibleSupport/src/shared/infrastructure/event-bus.js`

### Event bus contract (`event-bus.js`)
- `subscribe(event, callback)` → returns unsubscribe function.
- `emit(event, payload)` dispatches to all listeners.
- `once(event, callback)` auto-unsubscribes after first call.
- `clear(event)` and `clearAll()` support teardown.
- Handler exceptions are isolated so one failing listener does not block others.

### Reactive store contract (`store.js`)
- `createStore(initialState, namespace)` returns a Proxy-backed object.
- On property set/delete it emits namespaced events:
  - `${namespace}:${property}` for targeted listeners
  - `${namespace}:change` with `{ property, value, oldValue }`
- Helper subscriptions:
  - `subscribeToProperty(namespace, property, callback)`
  - `subscribeToAny(namespace, callback)`

### Persistence
- This infrastructure layer itself is in-memory/event-only.
- Persistence is implemented by higher-level services (e.g., GitHub config + manifest stores).

---

## Utility contracts (`shared/utils.js`)

**Source:** `public/InvisibleSupport/src/shared/utils.js`

### Object URL lifecycle helpers
- `createObjectUrl(blobOrFile)`
  - Creates URL via `URL.createObjectURL`
  - Registers it in internal `blobRegistry`
- `revokeObjectUrl(url)`
  - Revokes one URL and removes it from the registry
- `revokeAllObjectUrls()`
  - Revokes all tracked URLs and clears registry

**Contract expectation:** callers creating temporary blob URLs should revoke on cleanup to avoid memory leaks.

### Clipboard helper
- `copyToClipboard(text, sourceEl?)`
  1. Preferred direct-field path: select/copy from the visible `sourceEl` when provided
  2. Secondary path: `navigator.clipboard.writeText(text)`
  3. Final fallback path: hidden `<textarea>` + `document.execCommand('copy')`
  4. Restores previous focus/selection range when fallback is used
- Returns `Promise<boolean>` to enforce explicit success/failure handling by callers.

### Persistence/restoration note
- Utils are stateless helpers (no localStorage keys).
- Restoration semantics are limited to UI state restoration (selection range in clipboard fallback).
