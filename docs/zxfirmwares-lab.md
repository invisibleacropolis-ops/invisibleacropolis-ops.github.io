# ZXFirmwares Lab publication

Owner-approved public destination: `/zxfirmwares/`.

- Main OS workspace: [/zxfirmwares/projects/](/zxfirmwares/projects/)
- Shared actual CPU/SoC emulator: [/zxfirmwares/emulator/](/zxfirmwares/emulator/)
- Retained research tools: [/zxfirmwares/](/zxfirmwares/)

The home-page directory registers **ZXFirmwares Lab** at `/zxfirmwares/projects/`. Existing page entries and experiences are preserved. Vite copies this self-contained app unchanged from `public/zxfirmwares/`; the root-only static-page copier must not try to rebuild it.

## Artifact identity / scope

Reviewed implementation: ZXFirmwares source revision `83882bd652a8441d1f851d473411739fb1cbf424` (source repository stays private; shipped client JavaScript/WASM and documentation are public). The public directory contains exactly **41 files**, including `SHA256SUMS` for the other40, original project-created bring-up code, the actual pinned MIT fm1-emu browser CPU/SMK-37 SoC and full emulator/Rust-runtime notices. No blanket open-source licence is assigned to the Lab's project code.

No vendor firmware/ROM, original private dashboard/transcript, Android APK, signing secret, supplied music, encoded personal pack, personal report, imported OS build or science/runtime installation is included. User-imported builds stay in a browser worker; project notes remain in that browser unless explicitly exported. Storage is same-origin and unencrypted, not a secret vault or a Git commit. Exported reports can contain guest console/filenames and should be reviewed before sharing.

The original `ZXOS` counter/console fixture is a **diagnostic, not a completed operating system**. Run/CPU0-step, controls, console/RAM/LCD and isolated readiness tests work; full custom-OS acceptance, target real-time/hardware validation and live browser audio are not claimed. No device API or firmware writer is provided.

## Build / update boundary

`npm run build` followed by `npm run verify:zxfirmwares` checks exact file membership/hashes, runtime notices/imports, original diagnostic identity, navigation and byte-for-byte Vite pass-through. The deployment workflow runs this guard **before uploading Pages output**. This host does not fetch the private source, run audio experiments, receive private repository tokens or synchronize arbitrary build folders.

For updates: first review a new explicitly allowlisted source artifact, then replace only `public/zxfirmwares/`, update this receipt, run host build/verification and browser checks. Review any boundary/fixture changes deliberately rather than broadening the copier. Main pushes deploy the whole existing host through its normal Pages workflow.
