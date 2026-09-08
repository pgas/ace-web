# Jupiter ACE Web Emulator

A pure client-side browser-based JavaScript/HTML5 emulator for the **Jupiter ACE** microcomputer (1982, Cantab / Jupiter Cantab Ltd), running native Forth.

Zero build step, zero dependencies, runs directly in any modern web browser.

![Jupiter ACE Web](images/ace_logo.png)

---

## Features

- **Accurate Z80 Microprocessor**: Fully cycle-budgeted (65,000 T-states per 50Hz frame at 3.25 MHz) with 50Hz maskable interrupts (`0x0038`).
- **Memory Architecture**:
  - 8 KB ROM (Ace Forth kernel with 142 built-in words).
  - Configurable RAM: 3 KB base unexpanded, 19 KB (with 16 KB expansion pack, default), or 48 KB full expansion.
  - Complete hardware address mirroring (front-door/back-door video RAM, user character RAM, 4-way page 1 mirroring).
- **Video & Display**:
  - 256×192 native pixel canvas with 32×24 character grid.
  - Crisp black-on-white solid retro display with authentic case bezel and brand stripes.
  - Direct mouse text selection and clipboard copying.
- **Audio Subsystem**:
  - 1-bit speaker simulation with Web Audio API.
  - Single-pole IIR DC-blocker filter ($y[n] = x[n] - x[n-1] + 0.995 \cdot y[n-1]$) for pop-free retro sound.
- **Tape Storage (`.TAP`)**:
  - High-level ROM trap emulation (`0xED 0xFC` fast load, `0xED 0xFD` fast save).
  - Drag-and-drop support for `.tap` files.
  - Case- and punctuation-insensitive matching.
  - Bundled with the classic game **Tut-Tut** (`examples/tut-tut.tap`).
- **Forth Source Spooler**:
  - File uploader (`.fth`, `.txt`, `.forth`, `.ace`) and clipboard paste modal.
  - Automatic comment stripping (`( ... )` outside colon definitions) to prevent Ace ROM `ERROR 4`.
  - Paced keyboard feeding (key down, key up, and compilation delays) with automatic Turbo speedup.
- **Keyboard & Turbo Debouncing**:
  - Full Jupiter ACE 8-port keyboard matrix (`0xFEFE`..`0x7FFE`).
  - Active key frame limiter preventing ROM auto-repeat runaway in 4x Turbo mode.
- **Developer & Agent Integration**:
  - **HUD Debugger**: Live register inspector (PC, SP, AF, BC, DE, HL, IX, IY, flags), Forth system variables (`BASE`, `FRAMES`, `STKBOT`, `DICT`, `ERR_NO`), memory hex dump, and dictionary browser.
  - **Model Context Protocol (MCP)**: Bundled Python MCP server (`mcp/mcp_ace_server.py`) and browser automation bridge (`window.__ace`).

---

## Quick Start

### 1. Run Local Server
You can run any static web server in this directory:
```bash
python3 -m http.server 8085
```
or
```bash
npx serve .
```

### 2. Open in Browser
Navigate to **[http://localhost:8085](http://localhost:8085)**.

---

## Project Structure

```
ace-web/
├── index.html            # Main UI shell & retro case layout
├── package.json          # Project metadata & npm scripts
├── README.md             # Documentation
├── css/
│   └── style.css         # Authentic Jupiter ACE case styling & layout
├── images/
│   └── ace_logo.png      # Authentic Jupiter ACE logo
├── examples/             # Bundled demo files
│   ├── tut-tut.tap       # Complete Tut-Tut game tape
│   ├── forth.txt         # Standard Forth utilities
│   ├── dc.fth            # Forth Disassembler
│   └── tor.fth           # Tower of Hanoi demo
├── js/                   # Core emulator ES6 modules
│   ├── main.js           # Frame loop coordinator & emulator instance
│   ├── rom.js            # Embedded 8KB ROM (with Base64 fallback)
│   ├── z80.js            # Z80 CPU engine with custom ED FC/FD tape traps
│   ├── memory.js         # 64KB address space & hardware mirroring
│   ├── video.js          # Canvas 2D display renderer
│   ├── audio.js          # Web Audio API 1-bit speaker & DC filter
│   ├── keyboard.js       # 8-port Ace matrix & key debounce
│   ├── tape.js           # .TAP binary reader/writer & ROM hooks
│   ├── spooler.js        # Forth source file uploader & preprocessor
│   ├── debugger.js       # In-browser HUD debugger & dictionary walker
│   └── mcp_bridge.js     # window.__ace agent automation API
├── mcp/
│   └── mcp_ace_server.py # Model Context Protocol server for AI agents
├── roms/
│   └── ace.rom           # Original 8KB Jupiter ACE ROM
└── tests/
    └── test_emulator.js  # Headless test suite
```

---

## Key Keyboard Mappings

| Modern Key | Jupiter ACE Mapping |
| :--- | :--- |
| **Enter** | Enter |
| **Space** | Space |
| **Backspace** / **Delete** | Shift + 0 (Delete) |
| **Escape** | Shift + Space (BREAK) |
| **F1** | Shift + 1 (Delete Line) |
| **F4** | Shift + 4 (Inverse Video) |
| **F9** | Shift + 9 (Graphics Mode) |
| **Arrow Left / Down / Up / Right** | Shift + 5, 6, 7, 8 |

---

## License

GNU General Public License v2.0 or later (GPL-2.0-or-later).
Based on the Jupiter ACE hardware architecture (Cantab Ltd) and battle-tested Z80 emulation cores.
