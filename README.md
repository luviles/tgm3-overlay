<div align="center">

# TGM3 Overlay

**Real-time memory visualization overlay for *Tetris: The Grand Master 3* — built for OBS**

![Tauri](https://img.shields.io/badge/Tauri-2.0-orange?style=flat-square)
![React](https://img.shields.io/badge/React-19-149ECA?style=flat-square)
![Rust](https://img.shields.io/badge/backend-Rust-DEA584?style=flat-square)
![Platform](https://img.shields.io/badge/platform-Windows_x64-0078D6?style=flat-square)
![Size](https://img.shields.io/badge/release-~4.4_MB-brightgreen?style=flat-square)

</div>

## About

TGM3 Overlay is a ground-up rewrite of my earlier WinUI 3 tool ([TGM3 Visualizer](https://github.com/luviles/tgm3-visualizer)) in **Tauri 2 + React 19 + Rust**, designed as a fixed **480×1080 side panel**: pair it with the game upscaled to 1440×1080 and you get a clean single-monitor 1920×1080 layout. The rewrite cut the binary from 109 MB to **~4.4 MB** with zero runtime dependencies (no .NET, no VC++ redistributables).

> **Note:** This tool only works when playing on Player 1's side.

## Features

- **Non-intrusive** — read-only memory access at 8 ms intervals; never modifies or injects anything into the game process
- **Auto-attach** — finds the game process on its own and reconnects when the game restarts
- **Account Info** — nickname, decoration points, and personal bests for all modes in both Classic and World control rules
- **Playfield** — real-time board with the game's authentic block sprites, lock-delay gauge, and World-rule move-reset counters

### Easy
Hanabi score with profile-best gauge, **NEW BEST** celebration, section and total clocks, and the credit-roll clock on the 200 clear.

### Master
The deep one. Grade history with adjusted average and promotion invitation, demotion points, live grade with internal-grade engine (points, decay timer), **COOL countdown that freezes at the 70 % judgment** with a cyan burst, REGRET lap flashes, full torikan handling (the 7-minute level-500 limit, exam exemptions, death freezes), the invisible-roll qualification indicators (9 COOLs / internal grade 27), and FADING ROLL! / INVISIBLE ROLL!! credit-roll tracking with the CLEAR!! verdict.

### Sakura
Stage LIMIT alarm (red blink under 10 s, frozen on a last-piece clear), jewel counter, cleared/forfeited stage list, and the **EX-stage unlock ladder** that lights the single tier you earned — 19+ (EX 1-3), all 20 (EX 1-5), or all 20 within 5:00 (EX 1-7) — with a gold flash the moment it unlocks.

### Shirase
20G time attack: torikan countdowns to level 500/1000 with pass celebrations and fail freezes, rising-garbage quota, monochrome-block (IBM) field past level 1000, **LAST SECTION** lap chip after the second checkpoint, and the **BIG BLOCK ROLL!!** credit roll with its CLEAR!! verdict.

### Extras
- **Unified emphasis system** — one blink/flash language (tinted white ↔ tone colour) across every verdict, burst, and alarm
- **Settings** (persisted): per-mode grade-up sound volume/mute, roll-practice playfield visibility, Master section-time column choice
- **Hidden debug mode** — a scripted scenario player that replays 28 design moments (torikan deaths, roll clears, qualification flips) at 0.1×–1× speed without playing the game; used to develop and verify every visual in this README
  *How to open:* click the **⚙ gear → "SETTINGS" title five times** to reveal a DEBUG section, then **OPEN**. While playing: **←/→** switch scenario, **Space** pause, the speed button cycles 1×/0.5×/0.25×/0.1×, **R** restarts, **Esc** exits.
- **116 automated tests** — the calculation core is ported 1:1 from the original C# implementation and locked by regression tests

## Building from source

Prerequisites: [Rust](https://rustup.rs/), Node.js 18+, and the VS Build Tools C++ workload.

```bash
npm install
npm run tauri dev     # dev app
npm run tauri build   # release exe + NSIS installer
```

## Disclaimer

This project is a **fan-made, educational tool** created for personal learning and non-commercial purposes only. It is published for study of real-time process introspection and UI design techniques.

- **TGM3 Overlay is not affiliated with, endorsed by, sponsored by, or connected to** Arika Co., Ltd., the developer and publisher of *Tetris: The Grand Master 3*, nor with The Tetris Company, LLC.
- ***Tetris*** **is a registered trademark of The Tetris Company, LLC.** All game names, terminology, and related imagery referenced by this project are the property of their respective owners. No game assets, executables, or proprietary data are distributed with this repository.
- The tool only **reads** the memory of a locally running game process on the user's own machine. It does not modify the game, does not provide any gameplay advantage, and cannot be used on remote or online systems.
- **Use of this software is entirely at your own risk.** The author assumes no liability for any damage, account action, or other consequences arising from its use.
- If you are a rights holder and have concerns about this project, please contact me and it will be taken down promptly.

## License

This project is licensed under the MIT License.
