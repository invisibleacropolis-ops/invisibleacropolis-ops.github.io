# ZXFirmwares Lab publication

Owner-approved public destination: `/zxfirmwares/`.

- Main OS workspace: [/zxfirmwares/projects/](/zxfirmwares/projects/)
- Shared actual CPU/SoC emulator: [/zxfirmwares/emulator/](/zxfirmwares/emulator/)
- Retained research tools: [/zxfirmwares/](/zxfirmwares/)

The home-page directory registers **ZXFirmwares Lab** at `/zxfirmwares/projects/`. Existing page entries and experiences are preserved. Vite copies this self-contained app unchanged from `public/zxfirmwares/`; the root-only static-page copier must not try to rebuild it.

## Artifact identity / scope

Reviewed implementation: ZXFirmwares source revision `1156e17ca9d1ba81377965ee555cc069816e45f2` (source repository stays private; shipped client JavaScript/WASM and documentation are public). The public directory contains exactly **48 client files**, including `SHA256SUMS` for the other47, original project-created bring-up code, the actual pinned MIT fm1-emu browser CPU/SMK-37 SoC and full emulator/Rust-runtime notices. No blanket open-source licence is assigned to the Lab's project code.

No vendor firmware/ROM, original private dashboard/transcript, Android APK, signing secret, supplied music, encoded personal pack, personal report, imported OS build or science/runtime installation is included. User-imported builds stay in a browser worker; project notes remain in that browser unless explicitly exported. Storage is same-origin and unencrypted, not a secret vault or a Git commit. Exported reports can contain guest console/filenames and should be reviewed before sharing.

The original `ZXOS` counter/console fixture is a **diagnostic, not a completed operating system**. Run/CPU0-step, controls, console/RAM/LCD and isolated readiness tests work; full custom-OS acceptance, target real-time/hardware validation and live browser audio are not claimed. No device API or firmware writer is provided.

## SMK-37 Pro control-surface update

SMK-37 Pro is explicitly the primary/default product; FM-1 uses the same PI32 CPU with a separate board/input profile, not assumed interchangeable firmware or save layout. Both profiles pass the original readiness image and independent input-routing tests. Raw XIP builds only; particular OS/stock/community images and FWSC/ELF loading are not blanket-certified.

The Lab now includes a generated85-control SMK SVG surface matching the owner's front-panel drawing (37keys/16pads/18buttons/8encoders/4faders/2wheels), large selected-control inspector, gestures/pressure/velocity/zoom, actual guest LCD mirror and separate FM-1 controls. Original photograph/EXIF is not included. Geometry comes from the drawing; electrical IDs/ranges come from the pinned model. An original218-byte PI32 MMIO probe demonstrates representative surface→model→guest GPIO/ADC→RAM readback, not just UI highlights. No full OS or exhaustive hardware/calibration/timing claim.

Surface validation was70 host groups/11 browser scenarios. The current project-container release is74 host groups/14 browser scenarios plus86 SoC/8 runtime tests. It adds only three client storage/recording modules beyond the45-file surface boundary; no user database/content is published.

## OS project containers / Version Library / durable debug

Each project now hosts identification/profile revisions, categorized research/conversations/documents/images/links/roadmaps/plans/manuals, immutable firmware-version/file metadata and debug-session containers. Browser-local IndexedDB stores selected file bytes and committed log chunks; **not cloud/Git sync, encrypted storage or permanent archival**. Persistent-storage protection is opt-in; complete project backup/restore validates hashes, ownership and immutable IDs atomically. The legacy notebook JSON is not a complete file/session backup.

Load OS uses a committed expiring one-use ticket; the emulator checks project/version/file ownership, firmware SHA256/settings and the actual worker WASM identity, then focuses the heading only after runtime/storage acknowledgement. Reset preserves version attribution. Unload ejects the runtime/cached input but leaves versions and logs intact. Explicit guest-console/model/lifecycle/snapshot recording is sequenced, checksummed and auto-checkpointed; unflushed tails, console gaps, caps and save failures are reported honestly with recovery export. This is not Android logcat or a full instruction trace. User-imported content remains local and outside this public repository/artifact.

The public host only serves the48 reviewed client assets. It receives no private repository token, imported firmware, document, image, debug data, browser database or backup export.

## Build / update boundary

`npm run build` followed by `npm run verify:zxfirmwares` checks exact48-file membership/47 hashes, runtime notices/imports, original diagnostic and MMIO probe identity,85-control SVG, explicit target profiles, navigation and byte-for-byte Vite pass-through. The deployment workflow runs this guard **before uploading Pages output**. This host does not fetch the private source, run audio experiments, receive private repository tokens or synchronize arbitrary build folders.

For updates: first review a new explicitly allowlisted source artifact, then replace only `public/zxfirmwares/`, update this receipt, run host build/verification and browser checks. Review any boundary/fixture changes deliberately rather than broadening the copier. Main pushes deploy the whole existing host through its normal Pages workflow.
