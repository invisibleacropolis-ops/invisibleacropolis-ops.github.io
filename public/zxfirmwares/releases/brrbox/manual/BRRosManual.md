# BRR-OS Manual

**The living handbook for BRR-OS: what it is, where it came from, how it works, how to work on it, and where it is going.**

| | |
|---|---|
| Firmware version | **v0.9** (the shaper). Host-tested; ran in the owner's emulator as `v0.9-build1`; **not yet run on a unit** |
| Manual revision | r1, 2026-11-11 |
| Target | M-VAVE SMK-37 Pro (also Elite and MKE-P37 by `--model`) |
| Licence | GPL-3.0-only (see [LICENSING.md](LICENSING.md)) |
| Owner | the project owner decides direction, GUI vision and every hardware action |

Who this is for:

- **Engineers and agents joining the project** read Parts I-IV. Part I is required reading before you touch anything, and §4 (the ground rules) is not optional.
- **Users and testers** read [Part V, the User Guide](#part-v-user-guide).

How this document relates to the others:

| Document | What it holds | When this manual and it disagree |
|---|---|---|
| this manual | the map: orientation, architecture, process, roadmap, user guide | the code wins, then DESIGN.md; fix this manual |
| [docs/DESIGN.md](docs/DESIGN.md) | every design decision with its measurements, section by section (§1-19) | the code wins; DESIGN.md gets updated |
| [docs/CONTROLS.md](docs/CONTROLS.md) | every control, page and knob, with ranges and defaults | the code wins |
| [docs/INSTALL.md](docs/INSTALL.md) | backup, install, recovery, bring-up checklist | INSTALL.md is authoritative for anything touching a unit |
| [docs/LIBRARY.md](docs/LIBRARY.md) | encoding samples; the SVB4 format | |
| [README.md](README.md) | the public summary | |
| [LICENSING.md](LICENSING.md) | which file comes from where, under which licence | authoritative |

This manual summarises the others and links to them. It repeats a fact only when you need it to find your way. **Measured numbers are quoted with where they were measured.** Anything not yet measured on a unit is marked *unmeasured on hardware*.

---

## Contents

- [Part I: Orientation](#part-i-orientation)
  - [1. What BRR-OS is](#1-what-brr-os-is)
  - [2. The hardware](#2-the-hardware)
  - [3. Lineage: where the code came from](#3-lineage-where-the-code-came-from)
  - [4. Ground rules (safety, hardware, licensing, git)](#4-ground-rules)
  - [5. Glossary](#5-glossary)
- [Part II: The code](#part-ii-the-code)
  - [6. Repository map](#6-repository-map)
  - [7. Building, testing, packaging](#7-building-testing-packaging)
  - [8. Architecture in one page](#8-architecture-in-one-page)
  - [9. Subsystem guide](#9-subsystem-guide)
  - [10. Memory and flash](#10-memory-and-flash)
  - [11. Budgets and how they are measured](#11-budgets-and-how-they-are-measured)
  - [12. Coding conventions](#12-coding-conventions)
  - [13. Testing](#13-testing)
  - [14. Recipes](#14-recipes)
- [Part III: Working in parallel](#part-iii-working-in-parallel)
  - [15. Workstreams](#15-workstreams)
  - [16. Shared resources and conflict hotspots](#16-shared-resources-and-conflict-hotspots)
  - [17. Ledgers (claim before you use)](#17-ledgers)
  - [18. Definition of done](#18-definition-of-done)
  - [19. Handoff protocol](#19-handoff-protocol)
- [Part IV: Where we are headed](#part-iv-where-we-are-headed)
  - [20. Roadmap](#20-roadmap)
  - [21. Locked decisions](#21-locked-decisions)
  - [22. The GUI graphics format (locked)](#22-the-gui-graphics-format-locked)
  - [23. Open questions](#23-open-questions)
  - [24. Known issues, risks, and what is untested on hardware](#24-known-issues-risks-and-what-is-untested-on-hardware)
- [Part V: User Guide](#part-v-user-guide)
- [Appendix A: Version history](#appendix-a-version-history)
- [Appendix B: Register map](#appendix-b-register-map)
- [Appendix C: How to maintain this document](#appendix-c-how-to-maintain-this-document)

---

# Part I: Orientation

## 1. What BRR-OS is

BRR-OS is a bare-metal replacement firmware for the M-VAVE SMK-37 Pro, a 37-key MIDI keyboard with pads, knobs, faders and a colour screen. It turns the keyboard into a **four-track sampling groovebox with a tracker-style sequencer**. Everything plays from a sample library compiled into the firmware, in our own codec.

The design in one line, from DESIGN.md: **a register file, one event list and one clock, all locked to the codec's own sample grid.**

What makes it unusual:

1. **One clock.**
   - The codec's 8 kHz sample (0.125 ms) is the atom of time. Notes, locks, retrigs, table rows and LFO steps land on any sample.
   - Every other unit is a power of two of it.
   - At this resolution the sequencer is also a synthesis tool: audio-rate retrigs, tables and LFOs.
2. **Samples as oscillators.**
   - About two minutes of audio sits in flash as **SVB4**: a 4-bit BRR-style core at 8 kHz, plus side information that rebuilds 4-16 kHz ("the air").
   - Every voice is a small decoder reading flash directly, with random access.
3. **Four tracks, four machines:** TAPE (synced loops), MULTI (polyphonic sampler), GRAN (granular) and WAVE (wavetable). Eight voices are shared between them.
4. **A per-track channel strip.** Each track has its own matched filter, shaper, compressor, multi-effect, reverb and rebuilt highs, followed by a master bus.
5. **An Elektron/tracker hybrid sequencer:**
   - parameter locks and conditional trigs;
   - tables and commands;
   - 8 patterns, 8 scenes and a song;
   - Yamaha QX-style live recording, which keeps your human timing as a residual you can dial in or out (FEEL).
6. **Kits as bits.** A typical complete kit is about 1.4 KB, stored in a power-cut-safe log in the data area.

What it deliberately is not:

- no Bluetooth;
- no USB audio;
- no serial console;
- no vendor DSP library.

The space goes to sound, sequencing and samples.

**Status at v0.9:**

- All engine, sequencer, store and UI code runs in a host simulation with unit tests.
- It type-checks cleanly against the real board layer for all six packages.
- It ran in the owner's emulator.
- It has **not** been built with the JieLi toolchain on this branch's last change, and it has **not** run on a physical unit. Every CPU and latency figure in this manual is a host or cross-compile measurement.

## 2. The hardware

| Part | Detail | Notes for engineers |
|---|---|---|
| SoC | JieLi **AC791N** (AC79 family, "WL82" in the UBOOT tool), **pi32v2** cores, **dual core** | Core 0 runs everything. Core 1 is an optional accelerator, *beta* (§9.12). |
| CPU speed / FPU throughput | *unmeasured on hardware* | All our maths is single-precision float. If the FPU is slow, the CPU figure in the header shows it first (INSTALL §5). |
| SRAM | about 578 KB, split into **plain RAM 40 KiB + pool 392 KiB** (the boundary moves in `app.ld`; v0.5 moved it) | §10 |
| Flash | 1 MiB SPI NOR, XIP (code and samples run and read straight from flash). JEDEC id `0xEB6014` (tested unit) or `0x856014` | §10 for the map. Programming or erasing stops XIP, so code that runs then must be in RAM (§12). |
| Audio out | DAC at **24 MHz / 544 = 44,117.647 Hz** | 375 DAC frames = exactly 68 core samples = 272 wide samples |
| Screen | ST7789-class **240x240 RGB565** on SPI1, **write-only** (no read-back), **no framebuffer** | Today 12 MHz SPI (`LCD_BAUD 4`, source clock 60 MHz, divider `BAUD+1`). A full frame is 77 ms. Targets: 30 MHz (`LCD_BAUD 1`) best, 20 MHz (`LCD_BAUD 2`) next (§20). |
| Pad LEDs | on the same SPI1, at baud 8 (6.7 MHz) | Any LCD speed change must keep the LED transfers at their own divider. |
| Keys | 37, velocity; scanned at 10 kHz over 16 columns (about 1.6 ms a pass), edges stamped in clock samples | key latency *unmeasured on hardware* |
| Pads | 16 (2x8), velocity and pressure (`pad_vel` is our one addition to the board layer) | |
| Knobs | 8 endless encoders | |
| Faders | 4 | track levels |
| Wheels | pitch (WARP), mod (scene amount) | |
| Buttons | SEQ, CHORD, PARA, FADER BANK, GLOBE, PATCH, KNOB BANK, FX, BT, SEQ PLAY, SEQ REC, NOTE REPEAT, SCALE, OCT-/OCT+, `<` `>` | Roles in §9.15 and Part V |
| USB | full-speed device: MIDI, plus the update protocol (SysEx) | VID/PID is the pid.codes **test id**: it must be replaced before any public release (§24) |
| TRS MIDI | out only on this board family; **no MIDI IN** (PH8 is a key-matrix row) | |

The three models differ in identity and small board details, which the board layer handles. Packages carry the model's identity (`SMK-37 Pro_9xx`, `SMK-37 Elite_9xx`, `MKE-P37_9xx`) so the stock updater accepts a return to stock.

## 3. Lineage: where the code came from

```
M-VAVE stock firmware (closed)                    M-VAVE smk37_open (2025-26, reference only, not used)
        |                                                 app GPLv3 + SDK linking exception,
        |  reverse-engineered by the community            libfm1_engine.a binary (Pro/Elite only),
        v                                                 JieLi 2.5.3 Windows toolchain
FM-1 custom firmware work (X0X, Melodee, Jangada: the second-core worker)
        |
        v
Felucca (Leo Kuroshita / Hügelton Instruments, GPL-3.0): bare-metal FM-1 OS, HAL, loader, USB, OTA
        |
        +-- smk37 branch / fm1-to-smk37 port kit (genkigenki): the SMK-37 hardware layer
        |
        v
BRR-OS (this repo): our engine, sequencer, codec, store, UI on Felucca's SMK-37 layer
```

**What we use from Felucca.** About 7,100 lines (code plus tools), used unchanged except where marked:

- `firmware/hal/`, `firmware/loader/`, `crt0.S`, `app.ld`;
- `usb.c` (one change: the app's USB strings), `ota.c`, `ota_hw.c`, `storage_hw.c`, `lcd.c`, `libc.c`;
- the packager and installer tools (`fm1pkg_make.py`, `lz4blk.py`, `fm1_install.py`, `get_toolchain.sh`);
- `build.py`, which is adapted from Felucca's.

**What is ours.** About 9,800 lines of firmware and tools, plus about 2,400 lines of tests (counted at v0.9):

- every `os_*.c` / `os_*.h`;
- `svbrr_*`;
- the encoder (`tools/encoder/`) and the library tools;
- `gen_font.py`;
- every test.

LICENSING.md has the exact table.

**Why we have not rewritten the Felucca layer from scratch** (the owner asked):

- It is the part that is proven on real SMK-37 units: boot, update loader, flash guard, the boot-loop guard, the crash screen and recovery.
- Rewriting it buys nothing for the sound and risks bricking. Its known limits (the LCD driver at 12 MHz, no framebuffer) can be lifted one piece at a time.
- **The LCD driver (`lcd.c`) is the first piece we expect to replace**, for the GUI (§20, §22).
- M-VAVE's official open release is useful as **reference only**:
  - Its board code confirms the same pins and the same 12 MHz LCD setting.
  - Its engine is a binary library licensed for their hardware.
  - It uses a different (Windows) toolchain.
  - **Nothing from it is copied into this repo** (§4).

**Probing a unit with a reverse-engineering tool** (the owner asked):

- It is possible in principle over the UBOOT protocol.
- It is not needed for current work, and it is a hardware action. The owner does it, against a backed-up unit, or not at all.

## 4. Ground rules

These are standing instructions from the owner. They bind every engineer and every agent. **If a task seems to need breaking one, stop and ask the owner.**

### 4.1 Flash: never write these ranges

| Range | What | Why |
|---|---|---|
| `0x00000-0x03FFF` | boot head | brick |
| `0xC0000-0xC1FFF` | Bluetooth pairing and **this unit's key and pad calibration** (trimdata at `0xC1000`) | exists only on that unit |
| `0xF4000-0xFDFFF` | stock resources (USRRES) | needed to go back to stock |
| `0xFF000-0xFFFFF` | key_mac | unit-specific |

`firmware/hal/fm1_flash_map.h` enforces these with `FL_GUARD` and `_Static_assert`s. **Never weaken those asserts or the guard.**

Our own regions have rules too:

- **Presets live only in FL_DATA `0x9D000-0xBAFFF`.**
- **The user sample area FL_SMP (USRFLASH) `0xC2000-0xE9FFF` is reserved for user samples.** It is not for presets, caches, logs or anything else. The owner wants that budget kept whole.

### 4.2 Pins

- **Never drive PB1** (charger; an 8 s reset line).
- **Never configure PH8 as UART RX.** It is a key-matrix row, which is why there is no TRS MIDI IN.
- **Never make PA9, PH6, PH8 or PH9 outputs** (the matrix rows).
- **Keep PC9 analog.**
- All register access stays inside `firmware/hal/`. `tools/build.py` checks this.

### 4.3 Hardware actions

- **The owner performs every hardware action:** flashing, installing, UBOOT, dumps, probes.
- Agents and engineers **never run installers or flash tools against a unit**, and never script one to run unattended.
- You may prepare packages, scripts and instructions.
- **A verified full flash backup comes first**, before the first install on any unit: two 1 MiB dumps with the same SHA-256 and `trimdat` at `0xC1224` (INSTALL §1).
- **Packages carry the model identity.** Never build a package that claims another model's identity.

### 4.4 Licensing and provenance

- Everything here is GPL-3.0-only. New files get `/* SPDX-License-Identifier: GPL-3.0-only */`.
- **No vendor material in the repo:** no stock firmware dumps, no disassembly, no decompiled code, nothing from `libfm1_engine.a`, and no code copied from M-VAVE's `smk37_open`. Reading it to confirm a hardware fact is fine; copying is not.
- The three JieLi SDK binaries in each package (`uboot.boot`, `cfg_tool.bin`, `cfg/eq_cfg_hw.bin`, Apache-2.0) are read from your SDK checkout at build time, checked by SHA-256, and never committed.
- Changes to Felucca files are marked in place, and LICENSING.md is updated.

### 4.5 Privacy

- The owner's contact details are private. Never put them in code, commits, packages, issues or anything sent to an outside service.

### 4.6 Git

- **Commit or push only when the owner asks.** Branch first if on the default branch.
- Commit messages end with:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: [private session URL omitted]
  ```
  (agents in other sessions use their own session line).
- PR descriptions end with `🤖 Generated with [Claude Code](https://claude.com/claude-code)` and the session URL.
- Never commit `build/`, `__pycache__/`, dumps, SDK files or packages.

### 4.7 Engineering ethic (how this project works)

- **Phases, each dialled in and measured before the next.** A feature is done when it is measured against a reference, not when it compiles.
- **Report measured numbers, with where they were measured.** Never present a guess as a figure. Mark device-dependent numbers as *unmeasured on hardware*.
- **Off means bit-identical.** A new feature that is off must leave the scripted session's audio bit-identical to the previous version (the shaper at WET 0 does).
- **Smallest code that does the job.** Flash, RAM and CPU are all tight (§11).
- **The owner owns the GUI vision.** UI work follows the owner's specs and image references. Do not redesign pages unasked.

## 5. Glossary

| Term | Meaning |
|---|---|
| **core sample, the atom** | one sample of the 8 kHz core clock, 0.125 ms. The unit of all timing |
| **block** | 16 core samples, 2 ms: the codec block and the control block (coefficients and the resolver run here) |
| **side frame** | 128 core samples, 16 ms: one set of high-band energies |
| **keyframe** | 512 core samples, 64 ms: a random-access point; in WAVE, a wavetable frame |
| **wide** | the 32 kHz domain (4 samples per core sample): WAVE and every track's air |
| **half** | half of the DAC buffer: 128 frames at 44.1 kHz = 2.9 ms. The engine renders one half per audio interrupt |
| **bpb** | codec blocks per beat; `BPM = 30000 / bpb` (150 BPM = 200) |
| **WARP** | the pitch wheel: it scales the upsamplers' step, so tempo, pitch and the grid all bend together like tape |
| **register** | one of a track's 96 bytes (0-127) that define its sound and behaviour |
| **base / eff** | `base[]` is what the knobs set; `eff[]` is what plays: `eff = modulators(lock(scenes(base)))` |
| **lock (p-lock)** | a LOCK event: a register value on a step. A **trigless lock** is a step with locks and no note |
| **scene** | a mask plus values for any registers of any tracks, brought in at an amount. Eight per kit; they stack |
| **machine** | a track's sound source: TAPE, MULTI, GRAN, WAVE |
| **strip** | a track's filter plus drive after the machine |
| **the air** | a track's rebuilt 4-16 kHz, made from its own 2-4 kHz band and the sample's side info (`os_hf.c`) |
| **response contract** | the rule that every linear stage before the air's tap tells the air what it did to the spectrum |
| **residual / off** | a live-recorded note's distance from its grid step (Q12 fraction of a step), shown in 1/384 of a beat (PPQ 384, Yamaha QX1) |
| **FEEL / WIN / VFL / GRV** | how much residual plays, which notes get it, velocity feel, groove source |
| **pocket** | a learned groove: per-slot average residuals (LRN), or a TAPE loop's onsets (TK1-4) |
| **table** | a tiny pattern clocked by the tick (TSP) instead of steps |
| **voice budget** | 8 voices shared by all tracks; a sounding mono track counts as one |
| **choke / steal** | a voice faded out in 1 ms to make room |
| **sound** | one track's registers, stored as a delta from its machine's frozen template |
| **kit** | everything that plays: four sounds, 8 patterns, 8 tables, 8 scenes, the song, tempo, master bus |
| **TPL_V1** | the frozen per-machine register templates that sounds are stored against. Never edited |
| **vault** | our log-structured, power-cut-safe store in FL_DATA |
| **chunk / generation / LAST** | vault units: a CRC'd piece of a record; one save of a record; the flag that makes it count |
| **FL_DATA / FL_SMP (USRFLASH)** | the 120 KiB data area (presets) / the 160 KiB user-sample area (reserved) |
| **SVB4 / SVBRR** | our sample codec, version 4 |
| **onset map** | per-sample transient positions from the encoder; used by TAPE slices and TK grooves |
| **UBOOT** | JieLi's USB-disk recovery mode (`WL82 UBOOT1.00`) |
| **.fwsc** | an update package for the stock-compatible update path |
| **Felucca** | the GPL bare-metal OS whose hardware layer we build on |
| **pool** | the 392 KiB SRAM section for big buffers (`.pool`) |

---

# Part II: The code

## 6. Repository map

```
brr-os/
├── BRRosManual.md          this file
├── README.md, LICENSE, LICENSES/, LICENSING.md
├── build.sh                convenience wrapper
├── docs/
│   ├── DESIGN.md           decisions + measurements, §1-19 (read §3, §4, §6 first)
│   ├── CONTROLS.md         every control
│   ├── INSTALL.md          backup / install / recovery / bring-up
│   ├── LIBRARY.md          sample encoding, SVB4 format
│   └── screens.png         rendered screens from the host sim
├── firmware/
│   ├── app.ld, crt0.S      (Felucca) link map: plain RAM 40 KiB / pool 392 KiB, entry
│   ├── hal/                (Felucca SMK-37 layer) registers, pins, flash map + guard, audio, LCD SPI, input, timers, core 1
│   ├── loader/             (Felucca) the update loader
│   └── src/
│       ├── os.c            THE translation unit: includes every other .c in a fixed order
│       ├── os_core.h       shared types, OS_VERSION, stubs
│       ├── os_regs.c       register file, machine definitions, COMMON registers, resolver, scenes data
│       ├── os_flt.c        matched SVF design, the air's filter copy, flt_slot_gain (response contract)
│       ├── os_hf.c         each track's air, the 375-phase resampler, master bus
│       ├── os_tfx.c        each track's multi-effect + reverb
│       ├── os_fx.c/.h      shared effect primitives
│       ├── os_mod.c        envelopes, LFOs, routes
│       ├── os_mach.c       voices, voice budget, the four machines, the strip
│       ├── os_shp.c        each track's waveshaper / wavefolder
│       ├── os_seq.c        events, heap, clock, scheduler, patterns, song, scenes, feel, recording
│       ├── os_store.c      preset codec: SOUND, KIT
│       ├── os_engine.c     the render loop, buses, the two-core split
│       ├── os_audio.c      the audio interrupt glue, record latency
│       ├── os_vault.c      the flash store (ring of chunks)
│       ├── os_ui.c         views, pages (PAGES), gestures, screen and pad LEDs
│       ├── os_font.c, os_font_data.h   the bitmap font (tools/gen_font.py)
│       ├── os_main.c       boot, main loop, splash
│       ├── svbrr_dec.c/.h, svbrr_tables.h   the SVB4 decoder
│       └── lcd.c libc.c usb.c ota.c ota_hw.c storage_hw.c   (Felucca)
├── library/
│   ├── library.svbr        the default library (345.5 KB)
│   ├── manifest.json, onsets.json, spec.example.json
├── tests/                  host tests (§13)
└── tools/
    ├── build.py            the firmware build + checks (adapted from Felucca)
    ├── typecheck.sh        six-package type-check with host clang (no JieLi toolchain needed)
    ├── get_toolchain.sh    fetch the JieLi Linux toolchain (Felucca)
    ├── fm1pkg_make.py, lz4blk.py, fm1_install.py   packaging and installing (Felucca) — owner use only on units
    ├── encoder/            the SVB4 encoder (codec.py, svbrr*.py, vbrr.py, rangecoder.py, ext.py)
    ├── encode_library.py   WAVs / spec -> library.svbr
    ├── analyse_library.py  onset maps
    ├── make_library_h.py   library -> build/gen/os_library.h (needed by every build and test)
    └── gen_font.py
```

Line counts at v0.9:

| Area | Lines |
|---|---|
| `firmware/src` | about 10,300, of which about 8,000 are ours (the rest is Felucca's `usb.c`, `ota*.c`, `storage_hw.c`, `lcd.c`, `libc.c`) |
| `tests` | about 2,400 |
| `tools` | about 3,100 |

The biggest files are `usb.c` (Felucca), then `os_ui.c`, `os_mach.c`, `os_seq.c` and `os_regs.c`.

## 7. Building, testing, packaging

### 7.1 One-time setup

```sh
# host tests and type-check need only gcc, clang, python3
pip install numpy scipy numba          # for the encoder (only if you encode samples)
python3 tools/make_library_h.py        # build/gen/os_library.h: required by builds and tests

# the real firmware build (Linux x86-64; Docker on a Mac)
tools/get_toolchain.sh                 # JieLi toolchain -> ~/.jieli
git clone --depth 1 --branch AC79NN_SDK_V1.2.1_2023-12-13 https://gitee.com/Jieli-Tech/fw-AC79_AIoT_SDK.git ~/fw-AC79_AIoT_SDK
export JIELI_TOOLCHAIN=~/.jieli/toolchain AC79_SDK=~/fw-AC79_AIoT_SDK
```

### 7.2 The everyday loop

```sh
sh tests/run_tests.sh          # every unit test + the scripted session (ASan/UBSan) + the two-core check
sh tools/typecheck.sh          # the six packages, -Wall, against the real board layer: must say "all six clean"
```

Both must pass before you hand off anything (§18).

### 7.3 Firmware packages

```sh
python3 tools/build.py                   # build/brros-smk37.fwsc        (Pro; also Starrykey 37 Play)
python3 tools/build.py --model elite     # build/brros-smk37-elite.fwsc
python3 tools/build.py --model mke       # build/brros-smk37-mke.fwsc
python3 tools/build.py --cpu2            # build/brros-smk37-cpu2.fwsc   (second core, beta)
python3 tools/build.py --release 1.0     # identity <model>_910, splash "v1.0"
```

`build.py` refuses to produce a package unless all of these hold:

- the entry stub is in place;
- code that runs from RAM makes no calls;
- the core-1 wait loop calls only its job (in a `--cpu2` build), or nothing of core 1 is built (the default);
- the image fits the app slot (619,520 B) and the RAM headroom is kept (8 KB in the pool);
- all register access stays inside `firmware/hal/`.

**Never bypass these checks.**

The splash shows `OS_VERSION`. It defaults to the value in `os_core.h` (`v0.9`), or `vX.Y` with `--release X.Y`. Bump the default in `os_core.h` when a version lands.

### 7.4 The sample library

```sh
python3 tools/encode_library.py library/spec.example.json      # or: --wav a.wav b.wav --bpm 120
python3 tools/analyse_library.py                               # onsets
python3 tools/make_library_h.py                                # -> build/gen/os_library.h
```

At q 18 the codec averages about 160 KB per minute, so the 350 KB budget holds about 2 minutes. Each sample costs about 30 B of bookkeeping plus 5 B per onset. See LIBRARY.md.

### 7.5 Packaging a source handoff

```sh
cd .. && zip -r brr-os-vX.Y.zip brr-os -x 'brr-os/build/*' -x '*/__pycache__/*'
```

## 8. Architecture in one page

### 8.1 The data model

```
            knobs / faders / wheels / MIDI ──┐
                                             ▼
   ┌──────────── per track (x4) ────────────────────────────────────────────────┐
   │ base[96] ──scenes(amounts, stacked)──► ──locks(step events, tables)──►     │
   │          ──modulators(ENV1/LFO1 per voice, ENV2/LFO2 per track)──► eff[96] │
   └─────────────────────────────────────────────────────────────────────────────┘
   kit = 4 sounds + 8 patterns (4 lists each) + 8 tables + 8 scenes + song + tempo + master
   all 40 lists share one event heap of 10,240 x 8-byte events
```

### 8.2 The signal path, per track

```
machine (voices, M/S if spread)
  -> [shaper PRE] -> strip: filter (matched SVF) + DRV -> [shaper POST]
  -> low cut -> compressor -> multi-effect -> reverb -> level / pan ──► core bus (8 kHz)
                                                     └─► the air (rebuilt 4-16 kHz, 32 kHz) ─► air bus
WAVE renders at 32 kHz ─────────────────────────────────────────────────────► wide bus
core bus  ──Hermite + 3.9 kHz LP──┐
wide+air  ──375-phase resampler───┴─► master: AIR shelf, WID, GLU comp, CEL 1 ms look-ahead limiter ─► DAC 44.1 kHz
```

The shaper is one function called at one of two points (POS register), not two copies.

### 8.3 Time, per audio interrupt (one half, 2.9 ms)

1. **Core 0, control.**
   - The voice budget (`vb_enforce`).
   - Pattern changes and the song.
   - Grooves.
2. **The tracks render, event-driven.**
   - Each track renders straight to the next sample where something is due (event, step boundary, retrig, table row, release, block), then handles it.
   - Each half needs 22-24 core samples (up to 64 with WARP at 2x).
   - The resolver runs per block and whenever an event writes a register.
   - With `--cpu2`, some tracks render on core 1, chosen by last half's measured cost.
3. **Core 0 sums the buses,** upsamples (everything is read 12 core samples late: 5 for the resampler look-ahead, 7 for the air) and runs the master bus.

The main loop (outside the interrupt) runs the UI at up to about 60 Hz. When the transport has been stopped and silent for 1 s, it runs `vault_idle` (erase-ahead).

### 8.4 Boot

`os_main.c`:

1. The board layer comes up.
2. The splash shows `OS_VERSION`.
3. The engine initialises (the resampler table is computed at boot, with no libm).
4. `if (flash_ok && vault_mount() == VT_OK) vault_kit_load(0);`, so the last saved kit comes back.
5. The STEP view appears.

Felucca's boot-loop guard sends two crashes within 30 s straight to UBOOT. The crash screen shows the vector, PC and RA for 4 s.

## 9. Subsystem guide

Each entry: what it does, its files and key symbols, its invariants (break these and something subtle fails), its tests and its DESIGN.md section.

### 9.1 The clock and the render loop — `os_engine.c`, `os_audio.c`, `os_regs.c` constants

- **Constants:**
  - `CORE_SR 8000`, `BLK 16`, `SIDE_SHIFT` (128), `WIDE 4`;
  - `UPS_STEP = 68/375`, `MAXCORE 64`, `DUE_MAX 24`;
  - half = `HALF_FRAMES 128`.
- **Invariants:**
  - All timing is in core samples, with no rescaling between units (shifts only).
  - A beat is whole blocks.
  - Synced TAPE reads at exactly rate 1 (an integer read; it cannot drift).
  - Anything added to the chain that delays must be compensated, so every offset stays a whole clock sample. The air has its 7, the shaper its 11 (dry delayed to match).
- **Live recording** subtracts the output latency (`REC_LAT_FRAMES`, a guess of 16, plus the limiter's look-ahead) from the heard time. *Unmeasured on hardware* (INSTALL §5).
- **Tests:** `host_sim.c` (the whole session), `timing.txt`.
- **DESIGN** §3.

### 9.2 The register file and resolver — `os_regs.c`

- **Size:** `NREG 96` per track. Registers 0-7 are the machine's own (page A), defined per machine in its `mach_def` (`TA_*`, `MU_*`, `GR_*`, `WA_*`). From 8 up are the `COMMON` definitions (`reg_def {lab, fmt, def, max, list}`).
- **Formats:** `RF_*` sets how a value is shown (Hz, ms, list, semitones and so on). `reg_label(eff, mach, r)` gives the label; the shaper's A/B labels depend on its model.
- **Resolver:** `eff = modulators(lock(scenes(base)))`. Scenes are applied oldest first with symmetric rounding. Locks win over scenes.
- **Invariants:**
  - Every register is one byte, 0..127; bipolar ones are centred on 64.
  - Register numbers are **engine identity**: they are stored in presets (by gap coding against TPL_V1) and in LOCK events. **Never renumber an existing register.**
  - New registers take spare numbers (Appendix B, §17).
- **DESIGN** §4; register map in Appendix B.

### 9.3 Machines and voices — `os_mach.c`

- **Machines:**

  | Machine | Voices | How it plays |
  |---|---|---|
  | TAPE | mono | synced loop: phase × loop length; GAT; SLC onset slices |
  | MULTI | 6 by default | starts at keyframe offsets; MAP CHR or KIT |
  | GRAN | mono, 8 grains | one decode head fills a 256 ms ring, grains are taps into it |
  | WAVE | 4 by default | a keyframe is a wavetable frame; two frames decoded per track; FRM morph; 32 kHz |

- **Voices:**
  - Each track owns `POLY_MAX 8` voice slots, so a track can render on either core.
  - `VOICES 8` are shared by all tracks.
  - Per track: `R_VOI` with a soft choke (`pv_alloc`: oldest releasing, else oldest; a 1 ms fade, envelope state 4).
  - Globally: `vb_enforce` at the start of every half on core 0, with the same order across all tracks. A note always sounds at once; the budget may run over for one half, never longer. Mono tracks are never choked.
  - Counters: `vb_steals`, `vb_chokes`.
- **Anti-aliasing when pitched up:** two one-pole filters at 3.2 kHz/rate above rate 1.02.
- **Spread (SPR):** the track renders M/S.
- **Invariants:**
  - No track touches another track's voices during a half; cross-track decisions happen only in `vb_enforce`.
  - A steal fades; it never restarts a voice.
- **Tests:** `voice_unit.c` (4,000 halves of random notes).
- **DESIGN** §5, §15.

### 9.4 The filter — `os_flt.c` (design), `os_mach.c` (strip)

- One analog prototype (LP/BP/HP 12 dB/oct, 20 Hz-20 kHz, Q 0.5-17), realised twice:
  - On the core: a magnitude-matched TPT SVF (Vicanek-style), designed every 0.5 ms, with gliding coefficients. Filter FM at 100 Hz or more switches to the bilinear map per sample.
  - On the air: the same prototype at 32 kHz after the un-filter.
- **DRV:** `x/√(1+x²)` with ADAA.
- **The response contract:** any linear stage between a voice and the air's tap either realises itself on the air (as the filter does) or declares its magnitude (`flt_slot_gain`, `tx_slots`). **New stages must honour this** (§14.4).
- **Tests:** `flt_unit.c`.
- **DESIGN** §12.

### 9.5 The shaper — `os_shp.c` (v0.9)

- **Chain:**

  | Stage | Detail |
  |---|---|
  | tone | one-pole LP (STN) |
  | drive | ×INP |
  | up | 2× with a 23-tap half-band (`SH_UP[12]`, even taps plus the centre) |
  | bias | +BIA |
  | model | 9 models with ADAA |
  | down | 23-tap compensating decimator (`SH_DN[23]`: 1/cos passband, half-sample advance) |
  | DC blocker | 0.9961 |
  | level match | AGC per block, about 50 ms, gain 0.01..4 |
  | WET mix | dry delayed `SH_DELAY` 11 samples |

- **Models:** TAPE TUBE CLIP FOLD CHEB XOVR RECT BITS POLY. A and B mean different things per model (`SHP_AB`). XOVR and RECT post-scale by 1/drive. BITS is deliberately not anti-aliased.
- **POST:** the shaper sets `t->shw` (its wet share), and the air blends its filter and un-filter toward bypass by that share.
- **Switching:** WET 0 is off and costs nothing (bit-identical). On: 4 blocks warm and unheard, then a 4-block fade. Off: a fade with frozen parameters.
- **State:** `sh_t shp[NTRACK]` in `.pool` (3,008 B). Entry points: `sh_block(k)` per block, `sh_run(k, x, xs, n)`.
- **Tests:** `shp_unit.c`; `host_demos.c` `demo_shape`.
- **DESIGN** §18.

### 9.6 The modulators — `os_mod.c`

- One envelope and one LFO implementation, used five times:
  - AMP, ENV1 and LFO1 per voice;
  - ENV2 and LFO2 per track.
- Each modulator has a coefficient set (from registers, per block) and a state.
- **Routes, not a matrix:** one target and a squared depth per source.
- **Per-sample targets:** pitch, tune, cutoff, level, pan and the WAVE frame. Others are driven at the block, through the resolver.
- **Invariants:**
  - The phase uses a 32-bit fraction (no 64-bit maths).
  - A synced FREE LFO's phase is the song position.
  - A source nothing uses does not run.
- **Tests:** `mod_unit.c` (30 checks).
- **DESIGN** §13.

### 9.7 Per-track effects — `os_tfx.c`, `os_fx.c`

- **Multi-effect:** an allpass chain (DIS, 6 stages) into a modulated delay line.
  - TIM decides the character: phaser, flanger, chorus or synced delay. It glides, so turning it morphs.
  - Stereo modes ST or PING.
  - Memory: two 2 s lines as 8-bit block float (one scale per codec block) plus a 16-bit 64 ms head. 36 KB a track.
- **Reverb:** a 4-line Householder FDN with pre-delay, DIF allpasses, DMP and MOD. DCY 127 freezes; GAT gates on the clock. 10 KB a track.
- Both run at 8 kHz, before the air, so tails get their highs back.
- **Response contract:** the multi-effect declares its response (`tx_slots`). **The reverb's damping is not yet declared** (§24).
- **Tests:** `fx_unit.c`.
- **DESIGN** §11.

### 9.8 The air, buses, master — `os_hf.c`

- **Per track:**
  - 2-4 kHz to complex baseband;
  - copy-up to six slots with one 32-entry carrier table (Schroeder phases);
  - noise that tiles flat;
  - free stereo from the 90° twin;
  - targets from each voice's side frame at its playback rate;
  - the un-filter, then the filter's 32 kHz copy (blended by the shaper's POST share).
- **Resampler:** 375 phases, 188 stored, built at boot.
- **Master:** AIR, WID, GLU, CEL. The master chorus, flanger and reverb are compiled out (`OS_MASTER_FX`).
- **Invariants:**
  - The air plays 7 core samples ahead; the rest of the mix waits 7.
  - Any new linear stage before the tap must honour the contract (§9.4).
- **DESIGN** §10.

### 9.9 The SVB4 decoder — `svbrr_dec.c` (device), `tools/encoder/` (PC)

- **Format:**
  - 8 kHz predictive core, 0-4 bits per 2 ms block;
  - static rANS, 32-bit integer only;
  - 64 ms seeded keyframes;
  - 16 ms side frames with a per-sample 45 dB window offset (in a spare directory byte, so older libraries play unchanged);
  - onset maps.
- **Invariants:**
  - The decoder reads flash directly and is random-access at keyframes.
  - **Format changes need a version and must keep old libraries playing.**
- LIBRARY.md has the format.

### 9.10 The sequencer — `os_seq.c`

- **Events** are 8 bytes:
  ```c
  typedef struct { uint8_t step, kind; int16_t off; uint8_t a, b, c, d; } ev_t;
  ```
  The kinds are NOTE, LOCK and CMD (DESIGN §6).
- **Lists:** 40 lists (8 patterns × 4 tracks, plus 8 tables) are slices of **one heap** `seq_heap` of `EV_HEAP 10,240` events, in fixed order: pattern-major, then the tables.
  - Use `evl_insert` and `evl_delete`, and `evl_clear` to empty a list.
  - **Never set a list's `n` directly.** That orphans heap events; this bug was found and fixed in the tests.
  - `heap_shift` moves events with plain loops. **The device libc has no `memmove`.**
- **Patterns:** each has `pat_hdr {stp[4], spd[4], bars}` (bars 0 = AUTO). A cued pattern or the song's next one enters on the exact sample the playing one ends; every track then restarts at step 1.
  - Functions: `pat_len`, `pat_enter`, `pat_end`, `seq_pat_select`.
  - `trk_pos` is relative to `os.pat_p0`.
  - Trig conditions count passes and keep counting while the same pattern repeats.
- **Song:** `seq_song[64]`; a row is pattern (3 bits) | repeats − 1 (5 bits).
- **Scenes:** `scene_on`, `scene_off`, `scene_amount`, `scene_clear`.
- **Commands:** R (retrig), C (cut), T (table), H (hop), K (kill), N (transpose). Times are `2^(b/16)` samples. Planned: O, P, S, L, X.
- **Feel:** each note is stored as grid step + residual; FEEL, WIN, VFL and GRV apply at playback. Retro capture always keeps the last notes played.
- **Invariants:**
  - Heap edits happen only in the main loop, under the engine lock (`ENGINE_LOCKED` in `os_ui.c`, interrupts off).
  - Locks belong to their step and apply before any note on it.
- **Tests:** `seq_unit.c`, `scene_ui_unit.c`.
- **DESIGN** §6, §7, §15.

### 9.11 Presets as bits — `os_store.c`

- **Bit stream:** exp-Golomb, plus a field coder: `0` same, `10` + delta, `11` + raw.
- **SOUND:** the machine (2 bits) plus the registers that differ from `TPL_V1[mach]`.
- **KIT:**
  - header (tempo, master);
  - four sounds and their pockets;
  - 8 pattern headers and 32 lists;
  - 8 tables;
  - 8 scenes (`scn_ref`: each value predicted from its track's own);
  - the song.
- **Two passes:** a dry pass validates everything and changes nothing; then the write pass. A broken record never half-loads.
- **Streaming:** a windowed writer (`bw_t` lo/hi) and a fetching reader (`br_t`, fetch/cache). No record is ever whole in RAM.
- **`ST_VER 1`.** Records carry the format version.
- **Invariant: `TPL_V1` is frozen.** If defaults change, add `TPL_V2` and keep V1 for old records; `store_unit.c` fails when the defaults and V1 part ways. (V1 was regenerated once, for NREG 96, before any unit had saved anything. That will not happen again.)
- **Tests:** `store_unit.c` (round trips, truncation, 3,000 bit flips).
- **DESIGN** §16.

### 9.12 The vault — `os_vault.c`

- **Constants:**

  | Constant | Value |
  |---|---|
  | area | FL_DATA |
  | `VT_SEC` | 4 KiB |
  | `VT_HDR` | 28 B |
  | `VT_MAGIC` | 0x5642 |
  | `VT_NIDX` | 384 index entries |
  | `VT_AHEAD` | 3 |
  | `VT_PIECE` | 1 KB window |
  | owner record | `VT_OWN 0x7E` |

- **Return codes:** `VT_OK`, `BUSY`, `FULL`, `EIO`, `NONE`, `FOREIGN`, `BIG`.
- **API:** `vault_mount`, `put`/`put_src`, `del`, `open`/`get`, `idle`, `format`, `space`; plus `vault_kit_save`/`load` (64 slots) and `vault_sound_save`/`load` (128 slots).
- **Rules:**
  - A chunk never crosses a sector.
  - Payload first, header last.
  - A record counts only when its LAST chunk exists.
  - Ring rule: the sector after the head never holds live data.
  - A torn relocation is finished in place at boot (`vt_can_finish`).
  - An erase while playing is refused before any byte is written (dry-run plan, `VT_BUSY`).
  - Foreign data is untouched until `vault_format` (the owner's double SHIFT+PLAY).
- **Tests:** `vault_unit.c` on `host_nor.h`, a simulated NOR with power cuts by `longjmp`. It ran 6,000 random operations and 2,150 to 4,000 power cuts with no record torn.
- **Unmeasured on hardware:** how long erase and program keep interrupts off (does a save while playing click?).
- **DESIGN** §17.

### 9.13 Two cores — `os_engine.c`, `hal/fm1_cpu1.*`

- Core 1 is a worker that does one job at a time for core 0, inside the audio interrupt.
- Its wait loop runs from RAM.
- Each job carries a check word. A wrong check word, or a job not done within 4 ms, disables core 1 until power-off.
- The split is chosen by last half's measured cost. It is skipped when the handover (about 100 µs) costs more than it saves.
- **Invariant: everything must work on core 0 alone.** On some units core 1 misreads RAM.
- **Test:** the two-core output must match one core within 1 LSB (`run_tests.sh`, `-DOS_HOST_DUAL`).
- **DESIGN** §14.

### 9.14 Flash access — `storage_hw.c` (Felucca), `hal/fm1_flash*.h`

- Every write goes through the guard (`FL_GUARD`).
- Sources for program operations, and DMA sources, must be in RAM, not XIP flash. The vault's owner string is copied to RAM for this reason.
- `storage_hw.c` releases the stock mapping's end marker before the first erase in USRFLASH (`st_stock_release`). **Read it before starting the user-samples work.**

### 9.15 The UI — `os_ui.c`, `os_font.c`, `lcd.c`

- **Views:**

  | View | Button | Shows |
  |---|---|---|
  | V_STEP | SEQ | the pads are 16 steps |
  | V_ROLL | CHORD | piano roll, 16 steps × 2 octaves |
  | V_LANE | PARA | one register's locks across the steps |
  | V_LIST | FADER BANK | the event list (tracker rows) |
  | V_PERF | GLOBE | scenes and patterns; GLOBE again: mutes, FILL (pad 7), CAP (pad 8) |
  | V_MACH | PATCH | machine and sample, all registers |

  BT is SHIFT; SCALE is CLR.
- **Renderers:** a cell grid (STEP, ROLL, LANE, PERF, MACH; the pad LEDs are the same cell functions at 2×8) and a row list (LIST). The register strip (8 knobs of the current page) is always on screen.
- **Pages:** `PAGES[NPAGE=12][8]`, A MACH to L SHAP. `ui_find(r)` finds a register's knob, so tests survive layout changes.
- **The one gesture:** whatever you hold is what the knobs edit (DESIGN §8).
- **Drawing:** dirty cells only, by signature (`sig[512]`). The text strip (`txt_strip`, 7,680 B) is in the pool; `lcd_fillbuf` is 480 B. There is no framebuffer: the panel is write-only and RAM cannot hold 115 KB.
- **Cost:** about 18 KB of code plus 0.7 KB of constants; the `ui` struct is 2,328 B.
- **PERF state:** `perf_pg`, `scn_last`, `scn_latch`, `scn_was`, `scn_lat_amt`, `wheel_last`. Scene pads must not be marked `pad_used` on press, or taps never register (a fixed bug).
- **Saving:** `ui_kit_save` on SHIFT+PLAY. Its messages are listed in Part V.
- **The GUI is being redesigned** (§20, §22). Treat the current views as working scaffolding: keep them working, do not polish them unasked.
- **Tests:** `scene_ui_unit.c`; `host_sim.c` drives the real gestures and writes `screen_*.rgb565`.

### 9.16 USB, update, recovery — `usb.c`, `ota.c`, `ota_hw.c`, `loader/`

- **USB:** a MIDI device polled from TIMER5 at 2 kHz (no USB interrupt). MIDI in goes to a ring the audio ISR drains; MIDI out comes from a ring it fills.
- **Updates:** the M-UPGRADE update entry is compatible with the stock and Felucca/SLOOP installers.
- **UBOOT:** SysEx `F0 22 24 35 7D F7`, or hold OCT- and OCT+ for 5 s.
- **Today MIDI is wired for the keys only.** MIDI in/out "at the edges" is on the roadmap.

## 10. Memory and flash

### 10.1 Flash map (1 MiB)

| Range | Size | Region | Who writes it |
|---|---|---|---|
| `0x00000-0x03FFF` | 16 KiB | boot head | **never** |
| `0x04000-0x9CFFF` | 619,520 B | app: code + library + constants | the update loader only |
| `0x9D000-0xBAFFF` | 120 KiB | **FL_DATA**: the vault (presets) | `os_vault.c` |
| `0xBB000-0xBFFFF` | 20 KiB | update staging | `ota.c` |
| `0xC0000-0xC1FFF` | 8 KiB | CAL: BT pairing, **key and pad calibration** (trimdata `0xC1000`) | **never** |
| `0xC2000-0xE9FFF` | 160 KiB | **FL_SMP / USRFLASH**: reserved for user samples | nothing yet (roadmap) |
| `0xEA000-0xEAFFF` | 4 KiB | stock tag | the guard allows only the exact whole-sector op |
| `0xEB000-0xF3FFF` | | outside every write window | not written |
| `0xF4000-0xFDFFF` | 40 KiB | USRRES stock resources | **never** |
| `0xFF000-0xFFFFF` | 4 KiB | key_mac | **never** |

Inside the app slot today: about 82 KB of code, the 345.5 KB library, 4.6 KB of onset maps, plus constants (templates, font, tables). **About 150 KB is free** (DESIGN §9; `tools/build.py` prints the exact figure).

### 10.2 SRAM

| Section | Size | Use (v0.9) | Free |
|---|---|---|---|
| plain RAM | 40 KiB | about 27 KB: globals, state, UI, 8 scenes (3.2 KB), audio buffers, stack | about 13 KB, which the stack must share |
| `.pool` | 392 KiB | about 382 KB (below) | about 19 KB; **the build requires 8 KB to stay free, so about 11 KB can be allocated** |

What the pool holds:

| Item | Size |
|---|---|
| per-track delay lines (4 × 36 KB) and reverbs (4 × 10 KB) | 189 KB |
| the event heap | 80 KB |
| GRAN rings | 16 KB |
| WAVE frames | 8 KB |
| resampler table | 24 KB |
| buses | 14 KB |
| the four tracks' air | 7.9 KB |
| voices | 12.4 KB |
| vault index + window | 7.5 + 1 KB |
| shapers | 3 KB |
| upsamplers | 3 KB |
| text strip | 7.7 KB |
| the update protocol's buffers | |

**RAM is the scarcest resource on the project.** Any feature that wants more than a few KB must say where the RAM comes from (§17).

## 11. Budgets and how they are measured

| Budget | Now (v0.9) | How to measure |
|---|---|---|
| App slot | about 150 KB free of 619,520 B | `tools/build.py` prints it |
| Code: engine | 63.5 KB | cross-compiled `-Os` rv32imfc size of the engine objects (method in DESIGN §9) |
| Code: whole app | 81.7 KB text | build output |
| Pool | about 382 / 392 KiB | build output; the 8 KB headroom is enforced |
| Plain RAM | about 27 / 40 KiB | build output |
| CPU, host | about 30 µs per 2.9 ms half for the full session | `host_sim` timing |
| CPU, device | *unmeasured on hardware* | the header's CPU figure; INSTALL §5 |
| Library | 345.5 / 350 KB | `encode_library.py` |
| Sound quality | regression: solo 2.35 dB, mix 2.30 dB, kit 4.68 dB envelope error per band | the offline harness against the original audio (DESIGN §10-12). Changes to the core or the air must not make these worse without the owner's sign-off |

Costs of features, measured on the host (DESIGN has the detail):

| Feature | Cost |
|---|---|
| filter on in all four tracks | about +0.4× the engine |
| all effects on in all four tracks | about +1.3× |
| shaper | 27-91 ns a sample |
| every modulator live on every track | about +25 % |

## 12. Coding conventions

1. **One translation unit.**
   - `os.c` `#include`s every `.c` in a fixed order. Everything is `static`; there is no linker-level API.
   - **Include order is a dependency order.** A new module goes where its dependencies are already included.
   - All names share one namespace, so **prefix every symbol with your module's prefix**:

     | Module | Prefix |
     |---|---|
     | voices | `pv_`, `vb_` |
     | shaper | `sh_` |
     | sequencer | `seq_`, `pat_`, `evl_`, `scene_` |
     | store | `st_`, `bw_`, `br_` |
     | vault | `vault_`, `vt_` |
     | UI | `ui_` |
     | air | `hf_` |
     | effects | `tx_` |
     | filter | `flt_` |

2. **No libm, no malloc, no 64-bit division, no `memmove`, no `size_t` on the device.** Write loops. The device libc (`libc.c`) is tiny. Use the in-house fast exp, sine and tables (for example FOLD's degree-9 sine), computed at boot or in constants.
3. **Single-precision float** in DSP. Guard against cancellation (write `u²/(√(1+u²)+1)`, not `√(1+u²)−1`).
4. **Big buffers go in `.pool`** with the section attribute the existing ones use. Small state goes in plain RAM. Count every byte in §17.
5. **RAM sources for flash and DMA.** Anything passed to a flash program or LCD DMA must be in RAM. Code that runs while flash is busy must be in RAM and must make no calls (`build.py` checks).
6. **Engine lock.** The main loop's edits to shared engine state (the heap, scenes, register base, the transport) happen inside `ENGINE_LOCKED(...)` (defined at the top of `os_ui.c`: interrupts off around the statement through `fm1__lock` / `fm1__unlock`), or an explicit `fm1__lock()` pair. Only the main loop writes the event heap, so main-loop reads need no lock. Keep locked sections short. The audio interrupt must never wait on the UI.
7. **No hidden time.** The audio interrupt does bounded work. Anything slow (erases, big edits) runs in the main loop, at a person's pace, or is refused while playing (the vault does this).
8. **Off is free and bit-identical.** A feature at its off setting costs nothing and changes no output.
9. **Comments explain the why and give the measured numbers.** File header comments describe the module. Keep them true (v0.9 fixed `os_regs.c`'s stale header).
10. **Register access only in `firmware/hal/`.** The firmware talks to hardware through `fm1_*` / `smk_*` inline functions.
11. **Felucca files:** change only when needed, mark each change in place, and note it in LICENSING.md.
12. **Docs move with code:**
    - a DESIGN.md section for any design decision, with measurements;
    - CONTROLS.md for any control change;
    - this manual's changelog and any section it touches.

## 13. Testing

Everything runs on the host. Tests `#include` the firmware sources directly with host stubs (`tests/host_stubs.h`). Build flags:

```
-DBOARD_SMK37=1 -I. -I../firmware/src -I../firmware/hal -I../build/gen
```

| Test | Covers |
|---|---|
| `flt_unit.c` | matched filter design against the prototype |
| `fx_unit.c` | multi-effect and reverb |
| `mod_unit.c` | 30 checks: stage times, rates, sync at every tempo, song lock, modes, shapes, ENV2 gate, per-voice ENV1 |
| `voice_unit.c` | the voice limit, soft steals, the global budget over 4,000 random halves |
| `seq_unit.c` | the heap, patterns, the pattern end, the song, conditions across repeats, scenes |
| `scene_ui_unit.c` | PERF gestures: tap, hold, pressure, wheel, CLR, writing |
| `store_unit.c` | SOUND and KIT round trips, sizes, truncations, bit flips, the TPL_V1 freeze check |
| `vault_unit.c` + `host_nor.h` | the vault on a simulated NOR: random operations against a model, fill, foreign data, power cuts everywhere |
| `shp_unit.c` | the shaper: aliasing against an alias-free reference, the 2-4 kHz band, level match, delay match, switching |
| `host_sim.c` | a scripted 34 s session through the real UI gestures: kit, chords, cloud, live recording with human timing, FEEL sweeps, grooves, scenes on the wheel, saving with SHIFT+PLAY into a simulated flash and loading as a boot would. Writes `sim.wav`, `screen_*.rgb565`, `timing.txt` |
| `host_demos.c` | audio-rate demos (retrig, table, FM, AM, comb) and the shaper's models |
| `run_tests.sh` | all of the above under ASan/UBSan, plus the two-core split against one core (at most 1 LSB) |
| `tools/typecheck.sh` | six packages, `-Wall`, clean |

**Regression discipline:**

- When a feature is off, `sim.wav` must stay bit-identical to the previous version. Keep a copy of the previous `sim.wav` and compare.
- When a change is meant to alter the sound, measure it against the reference (the offline harness, or the test's own alias-free or 48 kHz reference) and record the numbers in DESIGN.md.

## 14. Recipes

### 14.1 Add a register and a knob

1. **Claim a number** in the register ledger (§17). The spare numbers are 91-95, plus 26 and 39 (named placeholders).
2. Add it to the enum in `os_regs.c` and give it a `COMMON` entry (`{lab, fmt, def, max, list}`).
3. **Its default must equal `TPL_V1`'s value for that number** (0 for every spare). Otherwise:
   - add `TPL_V2`;
   - bump `ST_VER`;
   - keep V1 decoding.

   `store_unit.c` will tell you.
4. Consume it in the engine: per block via `eff[]`, or per sample via the modulation bus if it is a modulation target.
5. Put it on a page in `PAGES` (`os_ui.c`) **only if the owner asked**.
6. Tests: a unit test, plus `ui_find` if the session uses it. `run_tests.sh` and `typecheck.sh` must pass.

### 14.2 Add a knob page

- Edit `NPAGE`, the `P_*` enum, `PAGES` and `PAGE_NAME`.
- KNOB BANK cycles through them automatically.
- Update CONTROLS.md.

### 14.3 Add a machine

- Add a `mach_def` (name, poly, page A's 8 `reg_def`s) and a `MA_*`.
- Add its position law in `os_mach.c`.
- Add its `TPL_V1` row. This **is** a store-format change: a new machine needs `MA_N` > 4, and the SOUND header has a 2-bit machine field. Plan a format version first.

### 14.4 Add a per-track effect stage

1. Choose its point in the chain (§8.2).
2. Decide its contract: realise it on the air, or declare `|H(slot)|²` like `tx_slots`.
3. Account for its delay: compensate the dry, or the air's alignment.
4. Put its state in the pool, and claim the bytes.
5. Make WET or MIX 0 cost nothing and stay bit-identical.
6. Measure it against a 48 kHz reference.

The shaper (§9.5) is the template.

### 14.5 Add a sequencer command

- Commands are a letter plus arguments in a CMD event.
- Add the letter to the interpreter in `os_seq.c` and the label to the LIST editor.
- Store: CMD fields are already generic, so no format change is needed unless a new event kind is added.
- Planned letters: O, P, S, L, X (DESIGN §6). Claim the letter (§17).

### 14.6 Change the store format

- Never change how an existing version decodes.
- Bump `ST_VER`, branch on the record's version, and keep the old decoder.
- Add round-trip and backward tests in `store_unit.c`.
- Vault chunks carry a format version too. A vault-level change needs a migration plan agreed with the owner, because units in the field hold real kits.

### 14.7 Add a test

- Put `tests/<name>_unit.c` alongside the others, with the same flags, `#include`-ing the firmware files it needs.
- Its last line of output is the summary that `run_tests.sh` prints.
- Add it to the loop in `run_tests.sh`.
- If it needs flash, use `host_nor.h`.

### 14.8 Prepare a hardware experiment (for the owner to run)

1. Build a separate, clearly named package (for example a `--diag` build, or a held-button boot mode).
2. Ensure it writes nothing outside the windows, and nothing at all if it does not need to.
3. Write the exact steps, what to look for and what to report, in the form of INSTALL §5.
4. Hand it to the owner. Never run it.

---

# Part III: Working in parallel

## 15. Workstreams

The roadmap (§20) splits into workstreams that can proceed at the same time. Each has an owner (an agent or engineer, assigned by the project owner), its main files, and its boundaries.

| # | Workstream | Main files | Status / gate | Must not touch without coordination |
|---|---|---|---|---|
| **W1** | **Device bring-up and measurement**: the screen-speed test mode (12/15/20/30/60 MHz with error-revealing patterns), CPU, latency, erase timing, core-1 health | new `os_diag.c` (proposed), `lcd.c`, `os_main.c` boot hook, INSTALL.md | ready to prepare; **every run is the owner's** | the HAL's pin and flash code |
| **W2** | **GUI platform**: the locked graphics format (§22) — palette, tiles, sprites, the widget kit with dirty rectangles, the new LCD driver (window writes, DMA, higher SPI) | new `os_gfx.c` (proposed), `lcd.c` (replacement), `tools/` asset converter | can start on the format and converter; the driver's speed waits on W1's result | `os_ui.c` behaviour (W3), the RAM ledger |
| **W3** | **Sequencer pages and GUI refresh**: the layered control model between the engine and the new views (piano roll, XOX and more) | `os_ui.c` split into modules | **waits for the owner's spec and image references.** Until then, refactors only on request | engine and store formats |
| **W4** | **User samples and Slices**: the PC encoder's waveform overview, the user-sample record, the USRFLASH store, Slices with a zoomable waveform and playhead | `tools/encoder/`, `encode_library.py`, a new USRFLASH store (sharing vault ideas, **not** the vault's area), `os_mach.c` (slices), the W2 widgets | format design can start now (§22.5); the UI waits for W2/W3 | FL_DATA, the protected ranges |
| **W5** | **Engine and DSP**: the remaining commands (O, P, S, L, X), the reverb damping in the response contract, a sidechain (page J slot), per-grain side info for GRAN, true stereo air (optional), MIDI in/out at the edges | `os_seq.c`, `os_tfx.c`, `os_hf.c`, `usb.c` edges | ready | register numbers and pages via the ledgers |
| **W6** | **Tooling, CI, docs**: a CI script running `run_tests.sh`, `typecheck.sh` and (if a toolchain is available) `build.py`; the `sim.wav` regression diff; keeping this manual true | `tools/`, `tests/`, docs | ready | |

## 16. Shared resources and conflict hotspots

Because everything compiles as one unit and the budgets are tight, these are where parallel work collides:

| Hotspot | Why | Rule |
|---|---|---|
| `os_regs.c` enums and `COMMON` | register numbers are stored identity | claim in the register ledger first; append, never renumber |
| `PAGES` / `NPAGE` in `os_ui.c` | the owner's layout | pages change only by the owner's request |
| `TPL_V1`, `NREG`, `ST_VER` | the store format | frozen. A change goes through §14.6 and the owner |
| `os.c` include order | dependency order and the single namespace | add your include in one line with a comment; rebase carefully |
| `.pool` and plain RAM | about 11 KB allocatable in the pool, about 13 KB plain | claim in the RAM ledger before you allocate |
| App slot flash | about 150 KB free; the library may grow | claim large tables (fonts, sprites, palettes) in the flash ledger |
| `run_tests.sh` test list | everyone adds tests | append one line each |
| `lcd.c` / SPI1 | W1 and W2 both want it; the pad LEDs share the bus | W2 owns the driver; W1's test mode goes through W2's interface, or lands first and is absorbed |
| The audio interrupt's time | every DSP addition | measure host ns a sample; report before and after |
| Docs (DESIGN.md numbering, this manual) | everyone writes | DESIGN sections are appended with the next number; this manual's sections are edited in place, with a changelog line |

**Branching:**

- One branch per workstream task (`w2/palette`, `w5/cmd-slide`).
- Small and frequent merges, made by the owner or on their instruction.
- Rebase onto the latest before handing off.
- Never merge a branch that fails §18.

## 17. Ledgers

Claim here, in the same change that uses the resource. Remove the claim if the work is abandoned.

### 17.1 Registers (per track, 0-95)

| Number(s) | Name | Owner / workstream | Status |
|---|---|---|---|
| 0-25, 27-38, 40-90 | (see Appendix B) | — | in use |
| 26 | `R_SND` | — | spare placeholder, template 0 |
| 39 | `R_E8` | — | spare placeholder, template 0; its `---` label is used as the blank label |
| 91-95 | — | — | spare, template 0 |

### 17.2 RAM

| Claim | Section | Bytes | Owner | Status |
|---|---|---|---|---|
| (headroom the build requires) | pool | 8,192 | build | fixed |
| free | pool | about 11,000 | — | |
| free | plain | about 13,000 (stack shares it) | — | |

### 17.3 Flash (app slot)

| Claim | Bytes | Owner | Status |
|---|---|---|---|
| free | about 150,000 | — | |

### 17.4 Sequencer command letters

| Letter | Meaning | Status |
|---|---|---|
| R C T H K N | retrig, cut, table, hop, kill, transpose | in use |
| O P S L X | offset, slide, speed, stutter, send | planned (W5) |

### 17.5 Vault record types

| Type | Use | Status |
|---|---|---|
| `ST_SOUND` 1, `ST_KIT` 2 | presets | in use |
| `VT_OWN` 0x7E | owner record | in use |

## 18. Definition of done

A change is done when **all** of these hold:

1. `sh tests/run_tests.sh` passes: "all passed", the two-core split within 1 LSB.
2. `sh tools/typecheck.sh` says "all six clean".
3. If the JieLi toolchain is available: `python3 tools/build.py` (and `--cpu2`) succeeds with its checks, and you report the size and RAM changes.
4. **Off is bit-identical:** with the feature off, `sim.wav` matches the previous version's.
5. **Measured:**
   - cost (host ns a sample, or µs a half);
   - code bytes and RAM bytes;
   - quality against a reference where it applies.

   The numbers go into DESIGN.md.
6. Docs updated:
   - DESIGN.md (decision and numbers);
   - CONTROLS.md (if any control changed);
   - this manual (the sections touched, the ledgers, the changelog);
   - README.md's summary, if the feature is user-visible.
7. §4 respected:
   - no protected range;
   - no pin rule broken;
   - no vendor material;
   - no hardware action taken;
   - USRFLASH untouched by anything but user samples.
8. A handoff note (§19).

## 19. Handoff protocol

Every task ends with a short note: in the PR, or as a file under `docs/handoff/` if the owner prefers. It covers:

- **What changed:** files, behaviour, formats.
- **Numbers:** cost, bytes, quality. Say where each was measured.
- **Ledger claims made.**
- **What is untested on hardware**, and the exact owner test, if one is needed (INSTALL §5 style).
- **Open questions** for the owner.
- **Next step**, if there is a natural one.

When you pick up a workstream:

1. Read this manual's Part I.
2. Read the subsystem entries you will touch, and their DESIGN sections.
3. Run the two checks in §7.2 on a clean tree **before** changing anything, so you know the baseline is green.

---

# Part IV: Where we are headed

## 20. Roadmap

Ordered as agreed with the owner. Done items are kept for context.

| # | Item | State |
|---|---|---|
| 1 | One clock (v0.3), the air (v0.4), per-track effects (v0.5), the matched filter (v0.6), modulators (v0.7) | **done** |
| 2 | Kits, patterns, scenes, song, presets as bits, the vault (v0.8) | **done** |
| 3 | A shaper on every track (v0.9) | **done** |
| 4 | **Screen speed:** find the fastest reliable SPI clock for the panel. Target 30 MHz (`LCD_BAUD 1`), fallback 20 MHz (`LCD_BAUD 2`), today 12 MHz. Proposed method: a test mode entered by holding a button at boot, cycling 12/15/20/30/60 MHz with patterns that reveal errors (fine checkerboards, gradients, alternating full fills), plus a diagnostics page. The owner runs it on the unit; the result becomes the default | **next**, W1, proposed to the owner, not yet accepted |
| 5 | **GUI platform:** the locked graphics format (§22), widget kit (playheads and meters first), the new LCD driver | W2 |
| 6 | **Sequencer pages and GUI refresh** to the owner's vision: layered control between engine and views; piano roll, XOX and more; Elektron MK1-like simplicity in full colour, with handheld-style sprite animation used consistently | W3, **waits on the owner's spec** |
| 7 | **Slices** (on a machine) with a zoomable waveform, playhead and markers, using baked waveform overviews | W4 + W2 |
| 8 | **User samples in USRFLASH** (160 KiB), one record per sample: audio + onsets + overview | W4 |
| 9 | Remaining sequencer commands O, P, S, L, X; MIDI in/out at the edges; sidechain; GRAN per-grain side info; the reverb damping in the contract | W5 |
| 10 | Device measurements: CPU, `REC_LAT_FRAMES`, key timing, erase and program interrupt-off times, core-1 health | W1, the owner's runs |
| 11 | Replace Felucca pieces where we outgrow them: the LCD driver first; then only what a feature needs | as needed |
| 12 | Release hygiene: our own USB VID/PID, release identity `--release`, a user-facing manual | before any public release |

## 21. Locked decisions

Do not reopen these without the owner.

1. **One clock.** The 8 kHz core sample is the tick. Every unit is a power of two. Tempo is blocks per beat.
2. **The register file.** One byte per register; one resolver `eff = modulators(lock(scenes(base)))`; pages are a table separate from the engine.
3. **Four tracks, four machines, eight shared voices.**
4. **Per-track air**, and the response contract for everything before it.
5. **Presets:**
   - presets live only in FL_DATA, in the vault;
   - **USRFLASH is for user samples only**;
   - TPL_V1 is frozen; formats are versioned and old records keep loading.
6. **No vendor libraries, no vendor material in the repo.** We build on Felucca's GPL layer.
7. **Everything works on one core.** The second core only accelerates.
8. **The shaper is one function at a switchable point (PRE/POST)**, not two copies.
9. **The GUI graphics format** in §22.
10. **Off is free.** Features cost nothing when off, and the sound stays bit-identical.

## 22. The GUI graphics format (locked)

Agreed with the owner, to be built in W2. The goal:

- a simple, Elektron MK1-like interface in full colour;
- consistent, handheld-style sprite animation throughout;
- waveform displays where they help (slices, zoom, playhead);
- everything cheap enough for a write-only panel with no framebuffer.

### 22.1 Palette

- **256 colours, organised as 16 banks × 16.**
- Stored in RAM as RGB565: 512 B. It can be edited at run time for themes, flashes and colour cycling.
- Sprites and tiles store **4-bit pixels plus a bank number**, so a palette swap is just a bank change.
- Larger art may use the **8-bit full palette**.
- **Index 0 is transparent** in sprites.

### 22.2 Backgrounds

- **8×8-pixel tiles** (4-bit: 32 B each).
- A screen is a **30×30 tile map**: 900 B a screen.
- Tiles live in flash. Maps are small enough to keep several.

### 22.3 Sprites

- **8, 16 or 32 px square**, 4-bit, any number of frames.
- **Integer scaling.**
- Used for icons, animated indicators, profile-style pixel art (32×32) and the like.

### 22.4 Drawing model (the planned approach; W2 confirms it against the measured SPI clock)

- **No framebuffer:** RAM cannot hold 115 KB, and the panel cannot be read back.
- Drawing composes each dirty rectangle line by line (tiles, then sprites, then widgets) into a small line buffer, and sends it with a window write.
- A **widget kit:**
  - dirty rectangles;
  - a **per-frame pixel budget**, so animation never starves audio or input;
  - **playheads and meters first.**
- Today's dirty-cell signatures (§9.15) are the starting point.
- Cost model: at 12 MHz a pixel costs 1.33 µs and a full frame 77 ms. At 30 MHz both are 2.5× faster. Animation is planned in pixels per frame against the measured clock (§20 item 4).

### 22.5 Waveform overviews (baked by the PC encoder)

- **Content:** min/max (optionally RMS) per **256 core samples** (32 ms), plus coarser **×4 levels** for zoom.
- **Source:** computed from the **decoded 8 kHz audio**, so the picture is what plays, aligned to the 16-sample codec blocks.
- **Storage:** an **optional, versioned section per sample**. Old libraries without it still play; the UI then shows no waveform, or computes a coarse one.
- **User samples** use one record per sample: **audio + onsets + overview**.

### 22.6 Grid images

A coded format of 32×32 pixels with 4-bit pixels and a bank (512 B plus a byte) for pixel-art images, such as profiles and kit icons. It is the sprite format at size 32. No new decoder is needed.

## 23. Open questions

Owner decisions are marked (owner).

1. **Screen-test mode:** go ahead with it as proposed (§20 item 4)? (owner)
2. The sequencer page model: layers, which views, how they map onto the engine's lists and registers. (owner spec, W3)
3. Which machine gets Slices first: TAPE (already has onset slices), or a new mode on MULTI? (owner)
4. The user-sample workflow: how samples get onto the unit (the update path, UBOOT, or a SysEx transfer), and the record format's details. (W4 proposal, owner decision)
5. Whether to spend RAM on true stereo air (about 2× the air's cost) or per-voice WAVE frames (about 8 KB). Both are deferred.
6. The theme and palette content, and the sprite set's art style. (owner image references)
7. MIDI scope: clock in/out? CC mapping to registers? (owner)

## 24. Known issues, risks, and what is untested on hardware

**Untested or unmeasured on a unit:**

- Everything. v0.9 has not run on hardware. Device CPU load, FPU throughput and the 30 µs-per-half host figure's device equivalent are all unknown.
- `REC_LAT_FRAMES` (16) is a guess; key-scan timing too.
- How long erases and page programs keep interrupts off, so whether a save while playing clicks.
- How the stock firmware treats a data area BRR-OS has taken over (restore it from the backup if needed).
- The second core on any given unit (some misread RAM; the driver then disables core 1).
- The maximum reliable LCD SPI clock.

**Known limitations (by design, for now):**

- The ping-pong delay's left side carries some of the right's echo highs: the air is built mono and steered by image gains.
- The reverb's damping is not declared to the response contract.
- WAVE voices morph only within the track's loaded frame pair.
- LFO square and saw are not band-limited, so they alias at audio rate.
- The master chorus, flanger and reverb are compiled out (`OS_MASTER_FX`).
- **The USB VID/PID is the pid.codes test id (0x1209/0x0001).** It must be replaced before any public release.

**Risks to watch:**

- **RAM.** About 11 KB allocatable in the pool. The GUI's line buffers, palette and maps and W4's buffers must come out of it, or something must shrink (for example the event heap or the delay lines). Raise early.
- **CPU on the device.** If the FPU is slow, the per-track effects and the air are the big costs. Every DSP change reports its cost.
- **The data area** is the stock firmware's settings area. BRR-OS refuses to touch foreign data without the owner's double SHIFT+PLAY.

---

# Part V: User Guide

*For players and testers. Engineers: this is also the shortest tour of the instrument.*

## V.1 Before you install

**Read [docs/INSTALL.md](docs/INSTALL.md) completely.** The one thing you must not skip:

- **Back up the whole flash first.** Two dumps, the same SHA-256, kept in two places.
- Your unit's key and pad calibration exists only on your unit.

Then install the package for **the model printed on your unit**. To go back, use M-VAVE's own updater with your model's factory package.

If something goes wrong:

| Situation | What to do |
|---|---|
| need recovery | hold **OCT- and OCT+ for 5 s** to reach UBOOT |
| two crashes within 30 s of boot | the unit goes to UBOOT by itself |
| a red crash screen | write down its three numbers |

## V.2 First five minutes

1. **Power on.** The splash shows `BRR-OS v0.9`, then the STEP view.
2. **Press SEQ PLAY.** Track 1 (TAPE) plays its loop. Press again to stop.
3. **Program a beat.**
   - Select track 2 with **BT (SHIFT) + top pad 2**.
   - Play a key to choose the note.
   - Tap pads to place steps; tap a lit pad to clear it.
4. **Make a parameter lock.** Hold a step pad and turn a knob. The value turns blue and a dot marks the step. That step now has its own setting.
5. **Change pages.** **KNOB BANK** steps through the pages A MACH ... L SHAP (SHIFT + KNOB BANK goes back). The bottom strip always shows what the 8 knobs do.
6. **Record live.**
   - Press **SEQ REC**, play along, and press REC again.
   - Your timing is kept exactly. On page K, **FEL** goes from the grid (0 %) through as played (100 %) to exaggerated (150 %).
   - Forgot to record? **SHIFT + REC** captures what you just played.
7. **Perform with scenes.**
   - **GLOBE** opens PERF. The top 8 pads are scenes.
   - **Write a scene:** hold a scene pad and turn knobs.
   - **Use a scene:** tap to latch it at your velocity; hold for momentary (press harder for more). The mod wheel rides the last scene touched.
   - **Patterns:** the bottom pads pick patterns 1-8. A new pattern waits for the current one to end.
8. **Save.** **SHIFT + PLAY** saves the kit. It comes back at power-on.
   - The first time, if the data area holds the stock settings, the screen asks you to press SHIFT + PLAY again within 4 s to erase it.
   - Your backup holds the original.

## V.3 Controls cheat sheet

| Control | Does |
|---|---|
| SEQ / CHORD / PARA / FADER BANK / GLOBE / PATCH | views: STEP / ROLL (piano roll) / LANE (one register's locks) / LIST (tracker rows) / PERF (scenes, patterns; again: mutes, FILL, capture) / MACH (machine and sample) |
| KNOB BANK | knob pages A MACH, B FILT, C AMP, D ENV1, E ENV2, F LFO1, G LFO2, H FX, I VERB, J AIR, K FEEL, L SHAP |
| FX | this track's FX page, then VERB, then MASTER, then back. SHIFT + FX: all effects in or out |
| BT | SHIFT |
| SHIFT + top pads 1-4 | select track |
| SEQ PLAY / SHIFT + PLAY | play-stop / save the kit |
| SEQ REC / SHIFT + REC | record arm / retro capture |
| NOTE REPEAT (hold) | FILL |
| SCALE (hold) + pad | clear the step (in PERF: clear a scene) |
| OCT- / OCT+ | octave; both for 5 s: UBOOT |
| `<` `>` | step pages (LIST: scroll; MACH: sample bank) |
| hold step + knob | parameter lock |
| hold keys + tap step | stamp a chord |
| SHIFT + knob | make that register the LANE |
| faders 1-4 | track levels |
| pitch wheel | WARP: everything faster or slower together, like tape |
| mod wheel | the last scene's amount |
| SHIFT + PATCH | second core on or off (cpu2 package only) |

Every knob, range and default is in [docs/CONTROLS.md](docs/CONTROLS.md).

**Messages you may see when saving:**

| Message | Meaning |
|---|---|
| `KIT n SAVED, n KB FREE` | done |
| `STOP TO SAVE (NEEDS AN ERASE)` | stop the transport and save again |
| `STOP RECORDING TO SAVE` | leave REC first |
| `STORE FULL` | the data area is full |
| `OTHER DATA IN STORE: SHIFT+PLAY ERASES` | another firmware's data is there; press again within 4 s, stopped, to erase it |

## V.4 Tester checklist

Run [INSTALL.md §5 (bring-up checklist)](docs/INSTALL.md) on a new unit or a new version. The checks that matter most right now:

1. **Boot and views:** no crash screen; all six views; pad LEDs match the screen.
2. **CPU figure** in the header with all four tracks busy (a full MULTI chord, a dense GRAN cloud, shapers on). Report the highest number you see. If it goes past about 70 %, report it.
3. **Timing:** record a tight part. In LIST, are notes consistently early or late? Report the offset.
4. **Save while playing:** do you hear a click? Report it.
5. **Power off after a save:** does the whole kit come back?
6. **Shaper (page L):** WET up and turn MOD; INP should change character, not loudness. A low-passed note folded PRE is dark, POST bright.
7. **Screen:** any tearing, wrong colours, or garbage? (This matters for the coming screen-speed work.)
8. **cpu2 package (optional):** does the header show `%2`? Does it ever say `NOT ANSWERING`?

## V.5 Reporting a bug

Include:

- **Version** (splash) and **package** file name.
- **Model** printed on the unit.
- What you did, step by step, from power-on if possible.
- What you expected, and what happened.
- The **crash screen's three numbers**, if any.
- The **CPU figure** at the time.
- A phone recording of the sound or the screen, if it is audible or visible.
- Whether the data area had been taken over (you saved at least once).

---

## Appendix A: Version history

| Version | What it added | DESIGN |
|---|---|---|
| v0.2 | the first measured baseline: the engine and sequencer on a 4 ms tick (30.5 µs a half) | §3 (for comparison) |
| v0.3 | **one clock:** the 8 kHz core sample as the tick, event-driven render, exact-ratio upsamplers, WARP; 19.2 µs a half (v0.2: 30.5) | §3 |
| v0.4 | **the air per track**, submix (spread, low cut, compressor), master bus (AIR, WID, GLU, CEL limiter); mix error 5.1 to 2.3 dB | §10 |
| v0.5 | **per-track multi-effect and reverb**; RAM boundary to 40 / 392 KiB | §11 |
| v0.6 | **the matched filter** in two halves, the response contract, the anti-aliased drive | §12 |
| v0.7 | **the modulators** (AMP, ENV1, ENV2, LFO1, LFO2), the page table | §13 |
| v0.8 | **kits:** 8 shared voices with VOI, the event heap, 8 patterns with headers, the song, 8 stacking scenes with pad gestures; **presets as bits**; **the vault** | §15-17 |
| v0.9 | **the shaper** (9 models, PRE/POST, 2x ADAA, level match), page L; register file to 96 | §18 |

## Appendix B: Register map

Per track. Labels are as shown on screen. Page letters are the current `PAGES` table.

| # | Label | Page | Meaning | # | Label | Page | Meaning |
|---|---|---|---|---|---|---|---|
| 0-7 | machine | A | the machine's 8 (below) | 48 | SIZ | I | reverb size |
| 8 | CUT | B | cutoff | 49 | DCY | I | decay (127 freeze) |
| 9 | RES | B | resonance | 50 | DMP | I | damping |
| 10 | TYP | B | OFF LP BP HP | 51 | PRE | I | pre-delay |
| 11 | FEN | B | ENV2 to cutoff | 52 | MOD | I | modulation (`R_RMD`) |
| 12-15 | ATK DEC SUS REL | C | AMP envelope | 53 | DIF | I | diffusion |
| 16 | RT2 (`R_LFR`) | G | LFO2 rate | 54 | GAT | I | gate |
| 17 | LD2 (`R_LFD`) | G | LFO2 depth | 55 | REV | I | reverb level |
| 18 | LT2 (`R_LFT`) | G | LFO2 target | 56 | RNG (`R_ARN`) | C | AMP range |
| 19 | SH2 (`R_LFS`) | G | LFO2 shape | 57-63 | AT1 DE1 SU1 RE1 RG1 ET1 ED1 | D | ENV1 |
| 20 | TBL | K | table | 64-71 | AT2 DE2 SU2 RE2 RG2 ET2 ED2 FLT | E | ENV2 |
| 21 | TSP | K | table speed | 72-78 | RT1 MU1 SH1 MD1 PH1 LT1 LD1 | F | LFO1 |
| 22 | STP | K | track length (pattern's) | 79-81 | MU2 MD2 PH2 | G | LFO2 multiplier, mode, phase |
| 23 | SPD | K | track speed (pattern's) | 82 | VOI | C | voice limit |
| 24 | LEV | C | level | 83 | MOD (`R_SMD`) | L | shaper model |
| 25 | PAN | C | pan | 84 | INP (`R_SIN`) | L | shaper drive |
| 26 | (`R_SND`) | — | **spare** | 85 | A (`R_SA`) | L | model parameter A |
| 27 | DRV | B | drive | 86 | B (`R_SB`) | L | model parameter B |
| 28 | FEL | K | feel | 87 | BIA (`R_SBI`) | L | bias |
| 29 | WIN | K | window | 88 | LPF (`R_STN`) | L | tone before the shaper |
| 30 | VFL | K | velocity feel | 89 | POS (`R_SPS`) | L | PRE / POST |
| 31 | GRV | K | groove | 90 | WET (`R_SMX`) | L | wet (0 off) |
| 32 | WID | J | air width | 91-95 | — | — | **spare** |
| 33 | AIR | J | air amount | | | | |
| 34 | TLT | J | air tilt | | | | |
| 35 | TON | J | air tonality | | | | |
| 36 | SPR | J | voice spread | | | | |
| 37 | CMP | B | compressor | | | | |
| 38 | LOC | B | low cut | | | | |
| 39 | (`R_E8`) | — | **spare** | | | | |
| 40-47 | TIM FBK DEP RAT DIS COL PNG MIX | H | multi-effect | | | | |

Page A per machine:

| Machine | Registers 0-7 |
|---|---|
| TAPE | SMP STR LEN PIT DIR SLC GAT SYN |
| MULTI | SMP MAP PIT TUN STR LEN RVS LOP |
| GRAN | SMP POS SCN SIZ DEN PIT SPR JIT |
| WAVE | SMP FRM CYC SCN DET PIT TUN GLD |

Shaper models (MOD) and the names of A / B:

| Model | A / B |
|---|---|
| TAPE | KNE / DRK |
| TUBE | ASY / SAG |
| CLIP | KNE / SPL |
| FOLD | SHP / FLD |
| CHEB | HRM / FND |
| XOVR | GAP / SFT |
| RECT | FUL / --- |
| BITS | BIT / RAT |
| POLY | EVN / ODD |

## Appendix C: How to maintain this document

- **It is a living document.** Whoever changes the code updates the sections it touches, in the same change.
- **Changelog.** Add a line below, and bump the revision in the header table.
- **When this manual disagrees with the code, the code is right.** Fix the manual. If you find a disagreement you cannot resolve, add it to §23 and tell the owner.
- **Keep it a map.** Detail and measurements belong in DESIGN.md and CONTROLS.md; link to them.
- **Ledgers (§17)** are claimed in the change that uses the resource.
- **New workstreams** get a row in §15. When a roadmap item is done, mark it in §20, move it to Appendix A, and update §24.

### Document changelog

| Rev | Date | Change |
|---|---|---|
| r1 | 2026-11-11 | First edition, at v0.9. With it: `OS_VERSION` default to v0.9; `tools/typecheck.sh` added; stale counts fixed in README.md (96 registers, 12 pages), INSTALL.md (first-boot version, FEL on page K) and the `os_regs.c` header |
