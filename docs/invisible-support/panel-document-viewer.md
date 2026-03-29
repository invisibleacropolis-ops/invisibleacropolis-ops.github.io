# Panel: Document viewer

## Purpose
Render selected document content and expose view/open/copy actions.

## Primary anchors
- Heading: `#document-viewer`
- Module owner: `public/InvisibleSupport/src/features/documents/viewer.js`

## Owning modules
- Primary: `src/features/documents/viewer.js`
- Supporting: `src/features/documents/library-view.js`, `src/features/documents/store.js`

## Engineer notes
- Verify rendering fallback paths for unsupported file types.
- Validate links/actions match selected asset metadata.
- Confirm viewer refreshes correctly after asset mutation.
