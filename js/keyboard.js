/**
 * Jupiter ACE Keyboard Subsystem
 * 
 * Matrix consists of 8 half-rows read via port 0xFE:
 * Port 0 (0xFEFE): Shift, Symbol Shift, Z, X, C
 * Port 1 (0xFDFE): A, S, D, F, G
 * Port 2 (0xFBFE): Q, W, E, R, T
 * Port 3 (0xF7FE): 1, 2, 3, 4, 5
 * Port 4 (0xEFFE): 0, 9, 8, 7, 6
 * Port 5 (0xDFFE): P, O, I, U, Y
 * Port 6 (0xBFFE): Enter, L, K, J, H
 * Port 7 (0x7FFE): Space, Symbol Shift, M, N, B
 */

export class AceKeyboard {
    constructor() {
        this.ports = new Uint8Array(8);
        this.activeKeyTimers = new Map();
        this.clear();
        this.jupiterLayout = false;
        this.graphicsMode = false;

        this.keyPressMap = this.buildKeyMap();
        this.setupDomListeners();
    }

    clear() {
        this.ports.fill(0xff);
        if (this.activeKeyTimers) {
            this.activeKeyTimers.clear();
        }
    }

    tick() {
        if (!this.activeKeyTimers || this.activeKeyTimers.size === 0) return;
        for (const [key, item] of this.activeKeyTimers) {
            item.frames--;
            if (item.frames <= 0) {
                for (const [p, m] of item.mapping) {
                    this.releaseKey(p, m);
                }
                this.activeKeyTimers.delete(key);
            }
        }
    }

    readPort(portIndex) {
        if (portIndex >= 0 && portIndex < 8) {
            return this.ports[portIndex];
        }
        return 0xff;
    }

    read(address) {
        // High byte address >> 8 determines which row(s) to scan
        const h = (address >> 8) & 0xff;
        let val = 0xff;
        for (let i = 0; i < 8; i++) {
            if (((h >> i) & 1) === 0) {
                val &= this.ports[i];
            }
        }
        return val;
    }

    pressKey(port1, mask1, port2 = -1, mask2 = 0xff) {
        if (port1 >= 0 && port1 < 8) {
            this.ports[port1] &= mask1;
        }
        if (port2 >= 0 && port2 < 8) {
            this.ports[port2] &= mask2;
        }
    }

    releaseKey(port1, mask1, port2 = -1, mask2 = 0xff) {
        if (port1 >= 0 && port1 < 8) {
            this.ports[port1] |= ~mask1 & 0xff;
        }
        if (port2 >= 0 && port2 < 8) {
            this.ports[port2] |= ~mask2 & 0xff;
        }
    }

    buildKeyMap() {
        // Map keyboard Key / Code -> [ [port1, mask1], [port2, mask2] ]
        // Port 0, 0xfd is Symbol Shift; Port 0, 0xfe is Caps Shift
        const SYM = [0, 0xfd];
        const SHIFT = [0, 0xfe];

        return {
            // Letters
            'a': [[1, 0xfe]], 'b': [[7, 0xf7]], 'c': [[0, 0xef]], 'd': [[1, 0xfb]],
            'e': [[2, 0xfb]], 'f': [[1, 0xf7]], 'g': [[1, 0xef]], 'h': [[6, 0xef]],
            'i': [[5, 0xfb]], 'j': [[6, 0xf7]], 'k': [[6, 0xfb]], 'l': [[6, 0xfd]],
            'm': [[7, 0xfd]], 'n': [[7, 0xfb]], 'o': [[5, 0xfd]], 'p': [[5, 0xfe]],
            'q': [[2, 0xfe]], 'r': [[2, 0xf7]], 's': [[1, 0xfd]], 't': [[2, 0xef]],
            'u': [[5, 0xf7]], 'v': [[7, 0xef]], 'w': [[2, 0xfd]], 'x': [[0, 0xf7]],
            'y': [[5, 0xef]], 'z': [[0, 0xfb]],

            // Digits
            '0': [[4, 0xfe]], '1': [[3, 0xfe]], '2': [[3, 0xfd]], '3': [[3, 0xfb]],
            '4': [[3, 0xf7]], '5': [[3, 0xef]], '6': [[4, 0xef]], '7': [[4, 0xf7]],
            '8': [[4, 0xfb]], '9': [[4, 0xfd]],

            // Control
            'Enter': [[6, 0xfe]],
            ' ': [[7, 0xfe]],
            'Backspace': [SHIFT, [4, 0xfe]], // Shift + 0 = Delete / Backspace
            'Delete': [SHIFT, [4, 0xfe]],
            'Escape': [SHIFT, [7, 0xfe]],    // Shift + Space = BREAK
            'Shift': [SHIFT],

            // Shifted Symbols & Punctuation
            ':': [SYM, [0, 0xfb]], // Sym + Z
            ';': [SYM, [5, 0xfd]], // Sym + O
            '"': [SYM, [5, 0xfe]], // Sym + P
            '=': [SYM, [6, 0xfb]], // Sym + K
            '+': [SYM, [6, 0xfb]], // Sym + K
            '-': [SYM, [6, 0xf7]], // Sym + J
            '*': [SYM, [7, 0xf7]], // Sym + B
            '/': [SYM, [7, 0xef]], // Sym + V
            '<': [SYM, [2, 0xf7]], // Sym + R
            '>': [SYM, [2, 0xef]], // Sym + T
            '(': [SYM, [4, 0xfb]], // Sym + 8
            ')': [SYM, [4, 0xfd]], // Sym + 9
            ',': [SYM, [7, 0xfb]], // Sym + N
            '.': [SYM, [7, 0xfd]], // Sym + M
            '?': [SYM, [0, 0xef]], // Sym + C
            '!': [SYM, [3, 0xfe]], // Sym + 1
            '@': [SYM, [3, 0xfd]], // Sym + 2
            '#': [SYM, [3, 0xfb]], // Sym + 3
            '$': [SYM, [3, 0xf7]], // Sym + 4
            '%': [SYM, [3, 0xef]], // Sym + 5
            '^': [SYM, [6, 0xef]], // Sym + H
            '&': [SYM, [4, 0xef]], // Sym + 6
            '_': [SYM, [4, 0xfe]], // Sym + 0
            '[': [SYM, [5, 0xef]], // Sym + Y
            ']': [SYM, [5, 0xf7]], // Sym + U

            // Cursor arrows (Shift + 5, 6, 7, 8)
            'ArrowLeft': [SHIFT, [3, 0xef]],
            'ArrowDown': [SHIFT, [4, 0xf7]],
            'ArrowUp': [SHIFT, [4, 0xef]],
            'ArrowRight': [SHIFT, [4, 0xfb]],

            // Function keys
            'F1': [SHIFT, [3, 0xfe]], // Delete line (Shift+1)
            'F4': [SHIFT, [3, 0xf7]], // Inverse video (Shift+4)
            'F9': [SHIFT, [4, 0xfd]], // Graphics mode (Shift+9)
        };
    }

    setupDomListeners() {
        if (typeof window === 'undefined') return;

        window.addEventListener('keydown', (e) => {
            // Ignore keystrokes when typing in textareas or inputs
            if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) {
                return;
            }

            let key = e.key;

            // Handle Shift key separately (hold until keyup)
            if (key === 'Shift') {
                this.pressKey(0, 0xfe);
                e.preventDefault();
                return;
            }

            // Shifted uppercase letter
            if (key.length === 1 && key >= 'A' && key <= 'Z') {
                const lower = key.toLowerCase();
                const letterMap = this.keyPressMap[lower] || [];
                const fullMap = [[0, 0xfe], ...letterMap];
                for (const [p, m] of fullMap) {
                    this.pressKey(p, m);
                }
                // Auto-release after 3 Ace frames (~60ms normal, ~15ms in 4x Turbo)
                // This prevents runaway ROM key-repeat in Turbo mode while guaranteeing 50Hz interrupt sampling
                this.activeKeyTimers.set(key, { mapping: fullMap, frames: 3 });
                e.preventDefault();
                return;
            }

            const mapping = this.keyPressMap[key] || this.keyPressMap[key.toLowerCase()];
            if (mapping) {
                for (const [p, m] of mapping) {
                    this.pressKey(p, m);
                }
                this.activeKeyTimers.set(key, { mapping, frames: 3 });
                e.preventDefault();
            }
        });

        window.addEventListener('keyup', (e) => {
            if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) {
                return;
            }

            let key = e.key;
            if (key === 'Shift') {
                this.releaseKey(0, 0xfe);
                e.preventDefault();
                return;
            }

            if (this.activeKeyTimers.has(key)) {
                const item = this.activeKeyTimers.get(key);
                for (const [p, m] of item.mapping) {
                    this.releaseKey(p, m);
                }
                this.activeKeyTimers.delete(key);
            }

            if (key.length === 1 && key >= 'A' && key <= 'Z') {
                this.releaseCharacter(key);
                e.preventDefault();
                return;
            }

            const mapping = this.keyPressMap[key] || this.keyPressMap[key.toLowerCase()];
            if (mapping) {
                for (const [p, m] of mapping) {
                    this.releaseKey(p, m);
                }
                e.preventDefault();
            }
        });
    }

    pressCharacter(ch) {
        const isUpper = ch >= 'A' && ch <= 'Z';
        const lower = ch.toLowerCase();

        if (isUpper) {
            // Press Shift + lower letter
            this.pressKey(0, 0xfe); // Caps shift
        }
        if (this.keyPressMap[lower]) {
            for (const [p, m] of this.keyPressMap[lower]) {
                this.pressKey(p, m);
            }
        } else if (this.keyPressMap[ch]) {
            for (const [p, m] of this.keyPressMap[ch]) {
                this.pressKey(p, m);
            }
        }
    }

    releaseCharacter(ch) {
        const isUpper = ch >= 'A' && ch <= 'Z';
        const lower = ch.toLowerCase();

        if (isUpper) {
            this.releaseKey(0, 0xfe);
        }
        if (this.keyPressMap[lower]) {
            for (const [p, m] of this.keyPressMap[lower]) {
                this.releaseKey(p, m);
            }
        } else if (this.keyPressMap[ch]) {
            for (const [p, m] of this.keyPressMap[ch]) {
                this.releaseKey(p, m);
            }
        }
    }
}
