# ZXFirmwares Lab publication

Owner-approved public destination: `/zxfirmwares/`.

- Main OS workspace: [/zxfirmwares/projects/](/zxfirmwares/projects/)
- Shared actual CPU/SoC emulator: [/zxfirmwares/emulator/](/zxfirmwares/emulator/)
- Retained research tools: [/zxfirmwares/](/zxfirmwares/)

The home-page directory registers **ZXFirmwares Lab** at `/zxfirmwares/projects/`. Existing page entries and experiences are preserved. Vite copies this self-contained app unchanged from `public/zxfirmwares/`; the root-only static-page copier must not try to rebuild it.

## Current Projects workflow — agent imports / popup records / organized sources

Owner requested removing public bulk workspace import while retaining the agent pipeline, moving record inputs into a popup, and removing misfiled BRRbox code documents. Workspace/container/snapshot-open pickers are no longer rendered; complete backup export and the ordinary Create Project form remain. **Create Record** mounts a native modal with focus/Escape/Cancel/error handling. Generated code/build/config resources now belong to directory-grouped **Sources**, not Documents or overview Project Records. Conservative local-cache/import migration preserves every original ID, attachment, blob, version, notebook and session; historical private snapshots remain immutable, with no remote deletion/upload.

The agent pipeline retains full validation and explicit storage choice, adds sorted/category/folder/checksum reports, path-exact category overrides, preflight before reads and local CLI dry-run/report output. Repository-only procedure: source `docs/AGENT_PROJECT_IMPORT.md`; non-rendered page comments point agents there. Static JavaScript is public, so this is a workflow boundary, not an authentication claim. One generic `project-files.js` module expands61→62files/61digests; no imported code/media/project backup/report/credential/capability is added to the public artifact. Approved Block appearance and unrelated runtime/controllers remain unchanged.

Local105host checks and26browser scenarios pass. Source push43007648569/PR43007657062 and companion43007657129 are green; push/PR static artifacts are byte-identical. Runtime/WASM, firmware, theme tokens/fonts and unrelated client files remain byte-identical to the prior live release. The actual private BRRbox graph was independently fetched/verified: **93** generated source documents reclassified, document records99→6, all121records/125artifactIDs/118blobs and25,567,766original bytes preserved; all3versions unchanged. Actual119private GETs,0Auth calls,0writes/no mocks; source download/reload/360px/modal keyboard flow passes. This does not claim to inspect or overwrite the owner's existing browser profile.

## Prior visual alignment — Invisible Support

Owner requested purely visual styling across all ZXFirmwares pages. Reference is canonical **https://invisibleacropolis-ops.github.io/InvisibleSupport/** (capitalized): exact near-black #05080a, blue-grey #425f72 hairlines, cyan accents, Silkscreen400/700 Latin/Latin-ext, square corners/no shadows. Shared late `support-theme.css` applies the foundation to all3page shells, dynamic project/ingestion pages and all research tabs, with high-contrast ROYGBIV category/action/data tones. Fonts are byte-identical/self-hosted, full SIL OFL1.1 notice bundled; no external font service or Support app edits.

Visual-only contract pins all29controller modules (app.js changes only reversible chart font/paint), original page DOMs excluding the one added style link, original layout styles/Tailwind config, fonts and existing release bytes. Guest LCD pixels are not recoloured/filtered. Existing labels/keyboard/controls/storage/firmware/runtime workflows unchanged. Local100host and24browser scenarios pass; hosted PR42800440996 and companion42800441103 pass for sourced942ac5. Scope expands55→61files/60digests solely for shared CSS and5font/licence assets. Desktop/mobile previews compare actual computed body/font/border/accent exactly with the live reference; no overflow/errors. Live functional/theme checks repeat after deployment.

## Normal BRRbox project / build access

Owner rejected long private snapshot links and explicitly requested the firmware in the normal project build area. **[/zxfirmwares/projects/#/brrbox/builds](/zxfirmwares/projects/#/brrbox/builds)** is now a normal registry entry. Builds/Versions automatically fetches the reviewed firmware into the existing Version Library, checks every size/hash and commits atomically. No special URL, sign-in, file picker, browser storage injection or import action. Existing matching private versions are reused; notebook/profile/resources/runs are preserved. Corruption/conflicting build labels fail visibly without partial installation or overwrite; no cloud writes or automatic Run.

Narrow owner-requested public release exception: mapped XIP447112B, Pro FWSC651202B, corresponding-source ZIP722189B and pinned release descriptor. Firmware and corresponding source contain the default compiled sample bank; original WAVs/PNGs/full archive/private project backups/account credentials/capabilities stay private. Source ZIP contains required GPL-3.0/Apache notices and reviewed code/build inputs/SDK packaging binaries, not the private12MB source/media bundle. No blanket licence change for other Lab code; source repo remains private. New normal-page actual firmware browser test, corrupt-download atomicity/retry and legacy-notebook migration pass. Source/PR42756464597/42756469619 and companion42756469510 green: **96host/23browser +86SoC/8runtime**. Reset also clears stale load acknowledgement before asynchronous work.

## Artifact identity / scope

Reviewed implementation: ZXFirmwares source revision `e6d302323c154ce81460abdd21b645cfaaf846ee` (functional implementation `b9ef387`; later test-only fix selects styled action links on the now-button-free Projects landing page) (source repository stays private; shipped client JavaScript/WASM and documentation are public). The public directory contains exactly **62 reviewed client/release/font files**, including `SHA256SUMS` for the other61, original project-created bring-up code, the actual pinned MIT fm1-emu browser CPU/SMK-37 SoC and full emulator/Rust-runtime notices. No blanket open-source licence is assigned to the Lab's project code.

Only the named BRRbox development release and corresponding source are included as the explicit new exception. No unrelated vendor ROM, original private dashboard/transcript, Android APK, signing secret, original recordings, private personal pack/report/project backup or science/runtime installation is included. User-imported builds stay in a browser worker; project files/metadata remain in that browser unless explicitly connected to Invisible Support or exported. Create Project defaults to the existing private DB after owner sign-in; no legacy content uploads automatically. Storage is same-origin and unencrypted, not a secret vault or a Git commit. Exported reports can contain guest console/filenames and should be reviewed before sharing.

The original `ZXOS` counter/console fixture is a **diagnostic, not a completed operating system**. Run/CPU0-step, controls, console/RAM/LCD and isolated readiness tests work; full custom-OS acceptance, target real-time/hardware validation and live browser audio are not claimed. No device API or firmware writer is provided.

## SMK-37 Pro control-surface update

SMK-37 Pro is explicitly the primary/default product; FM-1 uses the same PI32 CPU with a separate board/input profile, not assumed interchangeable firmware or save layout. Both profiles pass the original readiness image and independent input-routing tests. Raw XIP builds only; particular OS/stock/community images and FWSC/ELF loading are not blanket-certified.

The Lab now includes a generated85-control SMK SVG surface matching the owner's front-panel drawing (37keys/16pads/18buttons/8encoders/4faders/2wheels), large selected-control inspector, gestures/pressure/velocity/zoom, actual guest LCD mirror and separate FM-1 controls. Original photograph/EXIF is not included. Geometry comes from the drawing; electrical IDs/ranges come from the pinned model. An original218-byte PI32 MMIO probe demonstrates representative surface→model→guest GPIO/ADC→RAM readback, not just UI highlights. No full OS or exhaustive hardware/calibration/timing claim.

Surface validation was70 host groups/11 browser scenarios. The project-container release was74 host groups/14 browser scenarios plus86 SoC/8 runtime tests. Create Project/shared-storage adds two client modules beyond that48-file boundary:92 host groups and19 real browser scenarios validate ingestion and existing behavior. Cloud API-contract tests are synthetic, not authenticated production storage acceptance; no user database/content is published.

## OS project containers / Version Library / durable debug

Each project now hosts identification/profile revisions, categorized research/conversations/documents/images/links/roadmaps/plans/manuals, immutable firmware-version/file metadata and debug-session containers. Browser-local IndexedDB stores selected file bytes and committed log chunks; **not background cloud/Git sync, encrypted storage or permanent archival**; explicitly connected projects use Invisible Support as described below. Persistent-storage protection is opt-in; complete project backup/restore validates hashes, ownership and immutable IDs atomically. The legacy notebook JSON is not a complete file/session backup.

Load OS uses a committed expiring one-use ticket; the emulator checks project/version/file ownership, firmware SHA256/settings and the actual worker WASM identity, then focuses the heading only after runtime/storage acknowledgement. Reset preserves version attribution. Unload ejects the runtime/cached input but leaves versions and logs intact. Explicit guest-console/model/lifecycle/snapshot recording is sequenced, checksummed and auto-checkpointed; unflushed tails, console gaps, caps and save failures are reported honestly with recovery export. This is not Android logcat or a full instruction trace. User-imported content remains local/private-cloud and outside this public repository/artifact.

The public host serves61 reviewed client/release/font files. It receives no private repository token, arbitrary user imports, original recordings/images, debug data, browser database or backup export.

## Create Project / Invisible Support private storage

Projects Library → **Create Project** opens identity/knowledge/file/folder ingestion, editable categories, optional source/firmware archive and explicit hash/byte review. **Import Project** is now prominent in the library. Both file-import entry points recognize complete project containers before the legacy notes-only1MB cap, route them into complete-project review (96MiB bound), preserve existing notes and do not upload/write merely on file selection. Legacy notes-only size/schema limits remain enforced. It also imports complete prepared project JSON and lists/opens private cloud snapshots. Default binary/media destination is the existing Invisible Support Supabase project `guoyqsfvqllyhlsrknml`, private bucket `invisible-support-assets`, owner-protected `public.assets` and existing magic-link session. No new DB/schema/policies, service key, portal rewrite or external JS CDN. Only the existing publishable key is shipped. CSP adds that specific API origin and local blob media.

Original binary objects are uploaded without overwrite, authenticated-read back and SHA256/size/owner checked; private metadata-only project snapshot commits last. IndexedDB is a complete working cache, with existing16MiB/file and64MiB payload bounds. Explicit snapshot capture, not automatic multi-device merging; local-only choice remains available. Session/account/storage failure never becomes fake success. Staged objects may remain for verified retry; no remote deletion is automatic. The same underlying portal can delete shared assets, so independent complete backups remain essential. Signing out does not erase local caches/exports.

Media subpages support native audio/video controls without autoplay and raster-only image previews; scripts/source documents remain inert. Original source/media/prepared containers stay outside this public checkout. The agent has now completed the real live form/folder submission using a dedicated confirmed ingestion identity in the existing backend. Original uploads/read-back and fresh-browser database restore were verified without network mocks. No owner import action is required.

## Project-specific private access links

`#/share/<encoded-private-link>` opens a chosen stored project directly, without a login or import form. The private signed manifest authorizes only that project's original-file URLs; backend/bucket/owner/project/asset paths and every original hash/size are validated before the atomic cache commit. The link is removed from the address bar after loading. No public bucket/policy change, unrelated-data access or portal-session replacement. Original objects stay in the existing private storage. Shared working copies retain source provenance; local edits are not silently represented as remote saves. Access links/credentials are private and excluded from this repository/artifact. Tests include actual complete source-folder form upload and a fresh browser with107real DB GETs, no Auth calls/headers or writes.

## Functional UI cleanup

Owner requested functional-only presentation. Removed page mottos, hero copy, narrative banners and repeated explanatory/disclaimer paragraphs across Projects, ingestion, Emulator and research tools. Controls, field names, metadata, numeric results/limits and actionable status/errors remain. Expanded metadata is now folded by default. Existing project records/documents, validation, storage and emulator behavior are preserved. Full root control-ID set retained; a static/UI regression checks the copy boundary and actual controls.

## Explicit shared snapshot updates

A newer private project link can add compiled versions/resources to an existing shared working copy. Project fields must match except the source-snapshot pointer, with the same source owner; immutable rows still conflict-check and commit atomically. Local extra resources/runs remain; local notebook/profile edits reject rather than being overwritten. Ordinary backup restore remains strict. This does not grant remote writes or add background merging. Final source/PR42721365708/42721371089 and companion42721371131 passed (93host/20browser checks). At that earlier release, only the50-file client artifact was published. The later normal-BRRbox release exception is described above; other private source/media/receipts remain in the existing project storage.

## Full firmware worker checks

Worker scheduling now yields after at most16 existing upstream quanta or6ms (plus the final quantum), avoiding a nested-timer delay per20k instructions. CPU/SoC/WASM and virtual clock semantics are unchanged. Actual high-bit registers display as unsigned eight-digit hex, covered by real PI32 instruction tests. Real privately stored firmware passed Version Library→acknowledged Load OS→Run→LCD→Pause→Unload with original-byte/ID/run attribution preserved. On the local phone browser, the same2.2virtual-second boot improved from89.4s to18.2s wall time; not a general performance or hardware claim. Other private firmware/source/media remain outside this host; only the explicitly reviewed BRRbox release is now included.

## Build / update boundary

`npm run build` followed by `npm run verify:zxfirmwares` checks exact61-file membership/60 hashes, self-hosted font/licence/theme identity and the pinned BRRbox release/source bundle, runtime notices/imports, original diagnostic and MMIO probe identity,85-control SVG, explicit target profiles, navigation and byte-for-byte Vite pass-through. The deployment workflow runs this guard **before uploading Pages output**. This host does not fetch the private source, run audio experiments, receive private repository tokens or synchronize arbitrary build folders.

For updates: first review a new explicitly allowlisted source artifact, then replace only `public/zxfirmwares/`, update this receipt, run host build/verification and browser checks. Review any boundary/fixture changes deliberately rather than broadening the copier. Main pushes deploy the whole existing host through its normal Pages workflow.
