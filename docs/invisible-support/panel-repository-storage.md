# Panel: Repository storage

## Purpose
Configure GitHub repository connection details and monitor storage usage for document/image persistence.

## Primary anchors
- Heading: `#repo-storage`
- Module owners: `public/InvisibleSupport/src/features/settings/github-settings.js`, `public/InvisibleSupport/src/features/storage/ui.js`

## Owning modules
- Primary: `src/features/settings/github-settings.js`, `src/features/storage/ui.js`
- Supporting: `src/features/documents/store.js`, `src/features/images/store.js`

## Engineer notes
- Validate owner/repo/branch/token settings save and load paths.
- Verify storage meter state updates after upload/delete.
- Confirm warning/limit behavior appears in UI when storage thresholds are crossed.
