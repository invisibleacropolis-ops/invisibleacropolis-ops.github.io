# Panel: Repository storage

## Purpose
The **Repository storage** panel configures GitHub repository connectivity for Invisible Support persistence and sets a soft storage quota used by the storage manager before writes are attempted.

## UI selectors (`index.html`)
The settings controller binds to the following selectors:

- `[data-github-settings]` (form root)
- `[data-github-owner]` (GitHub org/user input)
- `[data-github-repo]` (repository name input)
- `[data-github-branch]` (branch input, defaults to `main` when blank)
- `[data-github-limit]` (storage limit input, MB)
- `[data-github-token]` (personal access token input)
- `[data-github-test]` (test connection button)
- `[data-github-feedback]` (inline feedback target)

## Module ownership
- **Owner module:** `public/InvisibleSupport/src/features/settings/github-settings.js`

## Service dependencies
- `shared/services/github.js` (implemented at `public/InvisibleSupport/src/shared/services/github.js`)
- `shared/services/storage-manager.js` (implemented at `public/InvisibleSupport/src/shared/services/storage-manager.js`)
- `shared/ui/notifications.js` (implemented at `public/InvisibleSupport/src/shared/ui/notifications.js`)

## Save flow
1. Submit handler prevents default form POST and clears existing inline feedback.
2. `owner` and `repo` are trimmed and required; missing values produce `errors.githubValidation` inline error.
3. `branch` is trimmed and falls back to `main` when empty.
4. `storageLimitMb` is included only when numeric and `> 0`.
5. `token` is included only when non-empty after trim.
6. `GitHubIntegration.updateConfig(payload)` persists merged config to localStorage.
7. On success:
   - token input is cleared in the UI,
   - inline success message uses `notifications.githubConfigSaved`,
   - success toast is shown via Notifications.
8. On failure:
   - error is logged to console,
   - inline error uses `errors.githubRequestFailed`.

### Validation expectations
- Required fields: owner + repo.
- Optional fields: branch, token, storage limit.
- Storage limit accepts positive numeric MB values only.
- Config sanitization in the GitHub service enforces:
  - trimmed strings,
  - fallback defaults,
  - positive storage limit with default fallback (`200 MB`).

### Token handling expectations
- Token is entered as `type="password"` in the panel.
- Token is intentionally not repopulated into the input during `populate()`; it is always reset to an empty string.
- On save, token is included only when explicitly provided.
- Persisted token lives in the GitHub config object in localStorage (`invisibleSupport.githubConfig`) and is used to build `Authorization: Bearer ...` headers for API calls.

## Test-connection flow
1. Clicking `[data-github-test]` clears existing feedback and disables the button to prevent duplicate requests.
2. The module calls `GitHubIntegration.testConnection()`.
3. `testConnection()` requires complete config (`owner`, `repo`, `token`) and performs a `GET` to `https://api.github.com/repos/{owner}/{repo}`.
4. On success:
   - inline success message uses `notifications.githubTestSuccess`,
   - success toast is displayed.
5. On failure:
   - if thrown error has `code === 'config'`, UI shows `errors.githubConfigMissing`,
   - otherwise UI shows `notifications.githubTestFailure`,
   - error toast is displayed.
6. Finally, the button is re-enabled.

## Storage limit conversion and warnings
- Storage limit is configured in MB and converted to bytes by `getStorageLimitBytes()`:
  - `bytes = storageLimitMb * 1024 * 1024`
- `storage-manager` tracks aggregate `size` values across manifests and computes:
  - `ratio = used / limit`
  - warning state when `ratio >= 0.8` and `< 1.0`
  - exceeded state when `ratio >= 1.0`
- Before persisting, `storage-manager.persist()` rejects writes when exceeded and throws `errors.quotaExceeded` with `code = 'quota'`.
- Storage snapshots are published to subscribers whenever tracked usage or GitHub config changes.

## Privacy and security notes
- **Local persistence:** GitHub config (including token) is stored in browser localStorage. This is convenient but not secure against XSS or local machine compromise.
- **Transport:** API calls use HTTPS to `api.github.com` and attach bearer token only when present.
- **UI exposure minimization:** token field is password-masked and intentionally cleared after save and populate.
- **Operational guidance:**
  - prefer fine-scoped GitHub PATs with minimal permissions,
  - rotate tokens periodically,
  - avoid shared browser profiles for privileged tokens,
  - treat localStorage as sensitive and clear credentials during support/offboarding.
