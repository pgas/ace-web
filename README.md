# Jupiter ACE Web Emulator

A pure client-side browser-based JavaScript/HTML5 emulator for the **Jupiter ACE** microcomputer (1982, Cantab / Jupiter Cantab Ltd), running native Forth.

Zero build step, zero dependencies, runs directly in any modern web browser.

🎮 **Live Version**: [https://pgas.github.io/ace-web/](https://pgas.github.io/ace-web/)

---

## Acknowledgments

- **Base Implementation**: Translated to pure browser-based JavaScript using AI from [xAce](https://github.com/lawrencewoodman/xAce) by Lawrence Woodman.
- **Z80 Emulation**: Powered by [Z80.js](https://github.com/molly/z80) by Molly Howell (MIT License), an instruction-accurate Zilog Z80 emulator interpreter in JavaScript.
- **Published Online Version**: Available online via GitHub Pages at [https://pgas.github.io/ace-web/](https://pgas.github.io/ace-web/) (Repository: [https://github.com/pgas/ace-web](https://github.com/pgas/ace-web)).

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
  - User tape attachment and tape export/download.
- **Forth Source Spooler**:
  - File uploader (`.fth`, `.txt`, `.forth`, `.ace`) and clipboard paste support.
  - Automatic comment stripping (`( ... )` outside colon definitions) to prevent Ace ROM `ERROR 4`.
  - Paced keyboard feeding (key down, key up, and compilation delays) with automatic Turbo speedup.
- **Keyboard & Gaming Engine**:
  - Full Jupiter ACE 8-port keyboard matrix (`0xFEFE`..`0x7FFE`).
  - Aggregate non-blocking matrix architecture: supports continuous key holds for fast gaming.
  - Calibrated repeat delay and rate for comfortable Forth typing without dropped keys or accidental repeats.
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
├── images/               # Authentic Jupiter ACE logo
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
Based on [xAce](https://github.com/lawrencewoodman/xAce) by Lawrence Woodman and the Jupiter ACE hardware architecture (Cantab Ltd).
Z80 CPU emulation module (`js/z80.js`) is copyright (c) Molly Howell and released under the [MIT License](https://opensource.org/licenses/MIT).
