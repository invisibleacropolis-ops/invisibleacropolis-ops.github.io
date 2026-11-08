# ZXFirmwares Lab publication

Owner-approved public destination: `/zxfirmwares/`.

- Main OS workspace: [/zxfirmwares/projects/](/zxfirmwares/projects/)
- Shared actual CPU/SoC emulator: [/zxfirmwares/emulator/](/zxfirmwares/emulator/)
- Retained research tools: [/zxfirmwares/](/zxfirmwares/)

The home-page directory registers **ZXFirmwares Lab** at `/zxfirmwares/projects/`. Existing page entries and experiences are preserved. Vite copies this self-contained app unchanged from `public/zxfirmwares/`; the root-only static-page copier must not try to rebuild it.

## Artifact identity / scope

Reviewed implementation: ZXFirmwares source revision `08aa5f2f1e8a8bacf5d82918db0abb445157c312` (source repository stays private; shipped client JavaScript/WASM and documentation are public). The public directory contains exactly **45 files**, including `SHA256SUMS` for the other44, original project-created bring-up code, the actual pinned MIT fm1-emu browser CPU/SMK-37 SoC and full emulator/Rust-runtime notices. No blanket open-source licence is assigned to the Lab's project code.

No vendor firmware/ROM, original private dashboard/transcript, Android APK, signing secret, supplied music, encoded personal pack, personal report, imported OS build or science/runtime installation is included. User-imported builds stay in a browser worker; project notes remain in that browser unless explicitly exported. Storage is same-origin and unencrypted, not a secret vault or a Git commit. Exported reports can contain guest console/filenames and should be reviewed before sharing.

The original `ZXOS` counter/console fixture is a **diagnostic, not a completed operating system**. Run/CPU0-step, controls, console/RAM/LCD and isolated readiness tests work; full custom-OS acceptance, target real-time/hardware validation and live browser audio are not claimed. No device API or firmware writer is provided.

## SMK-37 Pro control-surface update

SMK-37 Pro is explicitly the primary/default product; FM-1 uses the same PI32 CPU with a separate board/input profile, not assumed interchangeable firmware or save layout. Both profiles pass the original readiness image and independent input-routing tests. Raw XIP builds only; particular OS/stock/community images and FWSC/ELF loading are not blanket-certified.

The Lab now includes a generated85-control SMK SVG surface matching the owner's front-panel drawing (37keys/16pads/18buttons/8encoders/4faders/2wheels), large selected-control inspector, gestures/pressure/velocity/zoom, actual guest LCD mirror and separate FM-1 controls. Original photograph/EXIF is not included. Geometry comes from the drawing; electrical IDs/ranges come from the pinned model. An original218-byte PI32 MMIO probe demonstrates representative surface→model→guest GPIO/ADC→RAM readback, not just UI highlights. No full OS or exhaustive hardware/calibration/timing claim.

Source validation:70 host groups +11 real headless browser scenarios +86 SoC/8 browser-runtime tests. Artifact adds only the controller/map/generated SVG and original input probe to the original41-file boundary.

## Build / update boundary

`npm run build` followed by `npm run verify:zxfirmwares` checks exact45-file membership/44 hashes, runtime notices/imports, original diagnostic and MMIO probe identity,85-control SVG, explicit target profiles, navigation and byte-for-byte Vite pass-through. The deployment workflow runs this guard **before uploading Pages output**. This host does not fetch the private source, run audio experiments, receive private repository tokens or synchronize arbitrary build folders.

For updates: first review a new explicitly allowlisted source artifact, then replace only `public/zxfirmwares/`, update this receipt, run host build/verification and browser checks. Review any boundary/fixture changes deliberately rather than broadening the copier. Main pushes deploy the whole existing host through its normal Pages workflow.
