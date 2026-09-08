/**
 * Jupiter ACE Keyboard Subsystem
 * 
 * Matrix consists of 8 half-rows read via port 0xFE:
 * Port 0 (0xFEFE): Caps Shift (bit 0), Symbol Shift (bit 1), Z (bit 2), X (bit 3), C (bit 4)
 * Port 1 (0xFDFE): A (bit 0), S (bit 1), D (bit 2), F (bit 3), G (bit 4)
 * Port 2 (0xFBFE): Q (bit 0), W (bit 1), E (bit 2), R (bit 3), T (bit 4)
 * Port 3 (0xF7FE): 1 (bit 0), 2 (bit 1), 3 (bit 2), 4 (bit 3), 5 (bit 4)
 * Port 4 (0xEFFE): 0 (bit 0), 9 (bit 1), 8 (bit 2), 7 (bit 3), 6 (bit 4)
 * Port 5 (0xDFFE): P (bit 0), O (bit 1), I (bit 2), U (bit 3), Y (bit 4)
 * Port 6 (0xBFFE): Enter (bit 0), L (bit 1), K (bit 2), J (bit 3), H (bit 4)
 * Port 7 (0x7FFE): Space (bit 0), Symbol Shift (bit 1), M (bit 2), N (bit 3), B (bit 4)
 */

export class AceKeyboard {
    constructor() {
        this.ports = new Uint8Array(8);
        this.heldKeys = new Set();          // Keys currently in active matrix
        this.physicallyDown = new Set();   // Keys physically held down
        this.virtualKeys = new Set();       // Programmatic / Spooler / MCP keys
        this.minHoldFrames = new Map();     // Prevents fast taps from being missed by 50Hz interrupt

        this.clear();
        this.keyPressMap = this.buildKeyMap();
        this.setupDomListeners();
    }

    clear() {
        this.ports.fill(0xff);
        this.heldKeys.clear();
        this.physicallyDown.clear();
        this.virtualKeys.clear();
        this.minHoldFrames.clear();
    }

    tick() {
        if (this.minHoldFrames.size === 0) return;
        let changed = false;
        for (const [keyId, frames] of this.minHoldFrames) {
            if (frames <= 1) {
                this.minHoldFrames.delete(keyId);
                if (!this.physicallyDown.has(keyId)) {
                    this.heldKeys.delete(keyId);
                    changed = true;
                }
            } else {
                this.minHoldFrames.set(keyId, frames - 1);
            }
        }
        if (changed) {
            this.updateMatrix();
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

    updateMatrix() {
        this.ports.fill(0xff);

        // 1. Apply programmatically pressed keys (Spooler, MCP, buttons)
        for (const vk of this.virtualKeys) {
            const mapping = this.getCharMapping(vk);
            if (mapping) {
                for (const [p, m] of mapping) {
                    this.ports[p] &= m;
                }
            }
        }

        // 2. Apply physically held keys
        for (const keyId of this.heldKeys) {
            const mapping = this.resolveKeyId(keyId);
            if (mapping) {
                for (const [p, m] of mapping) {
                    this.ports[p] &= m;
                }
            }
        }
    }

    resolveKeyId(keyId) {
        if (keyId.startsWith('Key') && keyId.length === 4) {
            const letter = keyId[3].toLowerCase();
            return this.keyPressMap[letter] || null;
        }
        if (keyId.startsWith('Digit') && keyId.length === 6) {
            const digit = keyId[5];
            return this.keyPressMap[digit] || null;
        }

        if (this.keyPressMap[keyId]) {
            return this.keyPressMap[keyId];
        }
        const lower = keyId.toLowerCase();
        if (this.keyPressMap[lower]) {
            return this.keyPressMap[lower];
        }

        return null;
    }

    getCharMapping(ch) {
        if (!ch) return null;
        if (ch === '\n' || ch === 'Enter') return [[6, 0xfe]];
        if (ch === ' ') return [[7, 0xfe]];
        if (ch === 'Shift') return [[0, 0xfe]];

        // Uppercase letters -> Shift + lowercase letter
        if (ch.length === 1 && ch >= 'A' && ch <= 'Z') {
            const lowerMap = this.keyPressMap[ch.toLowerCase()];
            if (lowerMap) {
                return [[0, 0xfe], ...lowerMap];
            }
        }

        if (this.keyPressMap[ch]) {
            return this.keyPressMap[ch];
        }
        const lower = ch.toLowerCase();
        if (this.keyPressMap[lower]) {
            return this.keyPressMap[lower];
        }
        return null;
    }

    pressCharacter(ch) {
        this.virtualKeys.add(ch);
        this.updateMatrix();
    }

    releaseCharacter(ch) {
        this.virtualKeys.delete(ch);
        this.updateMatrix();
    }

    buildKeyMap() {
        const SYM = [0, 0xfd];
        const SHIFT = [0, 0xfe];

        return {
            // Letters (Port 0: Z X C, Port 1: A S D F G, Port 2: Q W E R T, Port 5: P O I U Y, Port 6: L K J H, Port 7: M N B)
            'a': [[1, 0xfe]], 'b': [[7, 0xf7]], 'c': [[0, 0xef]], 'd': [[1, 0xfb]],
            'e': [[2, 0xfb]], 'f': [[1, 0xf7]], 'g': [[1, 0xef]], 'h': [[6, 0xef]],
            'i': [[5, 0xfb]], 'j': [[6, 0xf7]], 'k': [[6, 0xfb]], 'l': [[6, 0xfd]],
            'm': [[7, 0xfd]], 'n': [[7, 0xfb]], 'o': [[5, 0xfd]], 'p': [[5, 0xfe]],
            'q': [[2, 0xfe]], 'r': [[2, 0xf7]], 's': [[1, 0xfd]], 't': [[2, 0xef]],
            'u': [[5, 0xf7]], 'v': [[7, 0xef]], 'w': [[2, 0xfd]], 'x': [[0, 0xf7]],
            'y': [[5, 0xef]], 'z': [[0, 0xfb]],

            // Digits (Port 3: 1 2 3 4 5, Port 4: 0 9 8 7 6)
            '0': [[4, 0xfe]], '1': [[3, 0xfe]], '2': [[3, 0xfd]], '3': [[3, 0xfb]],
            '4': [[3, 0xf7]], '5': [[3, 0xef]], '6': [[4, 0xef]], '7': [[4, 0xf7]],
            '8': [[4, 0xfb]], '9': [[4, 0xfd]],

            // Control
            'Enter': [[6, 0xfe]],
            'NumpadEnter': [[6, 0xfe]],
            ' ': [[7, 0xfe]],
            'Space': [[7, 0xfe]],
            'Backspace': [SHIFT, [4, 0xfe]], // Shift + 0 = Delete / Backspace
            'Delete': [SHIFT, [4, 0xfe]],
            'Escape': [SHIFT, [7, 0xfe]],    // Shift + Space = BREAK
            'Shift': [SHIFT],
            'ShiftLeft': [SHIFT],
            'ShiftRight': [SHIFT],

            // Shifted Symbols & Punctuation (Jupiter Ace native Symbol Shift combinations)
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

            // Native Cursor arrows: Shift + 5 (Left), 6 (Down), 7 (Up), 8 (Right)
            'ArrowLeft': [SHIFT, [3, 0xef]],
            'ArrowRight': [SHIFT, [4, 0xfb]],
            'ArrowUp': [SHIFT, [4, 0xf7]],
            'ArrowDown': [SHIFT, [4, 0xef]],

            // Function keys
            'F1': [SHIFT, [3, 0xfe]], // Delete line (Shift+1)
            'F4': [SHIFT, [3, 0xf7]], // Inverse video (Shift+4)
            'F9': [SHIFT, [4, 0xfd]], // Graphics mode (Shift+9)
        };
    }

    setupDomListeners() {
        if (typeof window === 'undefined') return;

        window.addEventListener('keydown', (e) => {
            if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) {
                return;
            }

            // Prevent default page scrolling / browser behavior on game keys
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Tab', 'Backspace'].includes(e.key)) {
                e.preventDefault();
            }

            // Discard browser OS auto-repeat to prevent double-character triggering
            // Native Jupiter Ace ROM handles its own repeat timing at 50 Hz
            if (e.repeat) {
                return;
            }

            const id = (e.key && e.key.length === 1 && !e.code.startsWith('Key') && !e.code.startsWith('Digit'))
                ? e.key
                : (e.code || e.key);

            this.physicallyDown.add(id);
            this.heldKeys.add(id);
            this.minHoldFrames.set(id, 2); // Minimum 2 frames (40ms) to ensure 50Hz interrupt sampling
            this.updateMatrix();
        });

        window.addEventListener('keyup', (e) => {
            if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) {
                return;
            }

            const id1 = e.code || e.key;
            const id2 = e.key;

            this.physicallyDown.delete(id1);
            if (id2) this.physicallyDown.delete(id2);

            // If minimum hold elapsed, release immediately
            if (!this.minHoldFrames.has(id1) && (!id2 || !this.minHoldFrames.has(id2))) {
                this.heldKeys.delete(id1);
                if (id2) this.heldKeys.delete(id2);
                this.updateMatrix();
            }
        });

        // Window blur -> release all keys
        window.addEventListener('blur', () => {
            this.clear();
        });
    }
}
