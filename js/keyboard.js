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
        this.activeKeys = new Map();        // Keyed by e.code: { mapping, usesSymShift, frames, released, active }
        this.shiftKeys = new Set();         // e.code for active shift keys ('ShiftLeft', 'ShiftRight')
        this.virtualKeys = new Set();       // Programmatic / Spooler / MCP keys
        this.heldKeys = new Set();          // Compatibility set for headless tests & direct control

        this.onCopy = null;                 // Callback for Cmd+C / Ctrl+C
        this.onPaste = null;                // Callback for Cmd+V / Ctrl+V

        this.clear();
        this.keyPressMap = this.buildKeyMap();
        this.setupDomListeners();
    }

    clear() {
        this.ports.fill(0xff);
        this.activeKeys.clear();
        this.shiftKeys.clear();
        this.virtualKeys.clear();
        this.heldKeys.clear();
    }

    tick() {
        let changed = false;

        for (const [code, item] of this.activeKeys) {
            item.frames++;

            // If key was physically released and completed minimum 3-frame hold for ROM sampling
            if (item.released && item.frames >= 3) {
                this.activeKeys.delete(code);
                changed = true;
                continue;
            }

            let shouldBeActive = false;
            if (item.frames <= 3) {
                // Initial tap pulse: 3 frames (60ms) to ensure 50Hz interrupt sampling
                shouldBeActive = true;
            } else if (item.frames <= 45) {
                // Initial repeat delay: 42 frames (~850-900ms pause)
                shouldBeActive = false;
            } else {
                // Paced repeat: 16-frame cycle (320ms = ~3.1 chars/sec)
                const cycle = (item.frames - 46) % 16;
                shouldBeActive = cycle < 3;
            }

            if (item.active !== shouldBeActive) {
                item.active = shouldBeActive;
                changed = true;
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

        // 1. Apply programmatically pressed keys (Spooler, MCP)
        for (const vk of this.virtualKeys) {
            const mapping = this.getCharMapping(vk);
            if (mapping) {
                for (const [p, m] of mapping) {
                    this.ports[p] &= m;
                }
            }
        }

        // 2. Check if any active user key uses Symbol Shift
        let hasSymShift = false;
        for (const item of this.activeKeys.values()) {
            if (item.active && item.usesSymShift) {
                hasSymShift = true;
                break;
            }
        }

        if (!hasSymShift) {
            for (const keyId of this.heldKeys) {
                const mapping = this.resolveKeyId(keyId);
                if (mapping && mapping.some(m => m[0] === 0 && m[1] === 0xfd)) {
                    hasSymShift = true;
                    break;
                }
            }
        }

        // 3. Physical Shift (Caps Shift = Port 0 bit 0)
        // ONLY apply Caps Shift if NOT suppressed by Symbol Shift!
        if (this.shiftKeys.size > 0 && !hasSymShift) {
            this.ports[0] &= 0xfe;
        }

        // 4. Apply active user keys from DOM
        for (const item of this.activeKeys.values()) {
            if (item.active && item.mapping) {
                for (const [p, m] of item.mapping) {
                    this.ports[p] &= m;
                }
            }
        }

        // 5. Apply heldKeys (used by headless tests & direct control)
        for (const keyId of this.heldKeys) {
            const mapping = this.resolveKeyId(keyId);
            if (mapping) {
                for (const [p, m] of mapping) {
                    this.ports[p] &= m;
                }
            }
        }
    }

    resolveKey(code, key) {
        // 1. Prioritize explicit symbol / special key match by key character (e.g. '*', '+', ':', '(', ')')
        if (key && this.keyPressMap[key]) {
            return this.keyPressMap[key];
        }

        // 2. Letters: KeyA -> 'a'
        if (code && code.startsWith('Key') && code.length === 4) {
            const letter = code[3].toLowerCase();
            return this.keyPressMap[letter] || null;
        }

        // 3. Digits: Digit8 -> '8' (if key was not a shifted symbol above)
        if (code && code.startsWith('Digit') && code.length === 6) {
            const digit = code[5];
            return this.keyPressMap[digit] || null;
        }

        // 4. Code direct match (ArrowLeft, Backspace, Enter, Space, Delete, Escape, F-keys)
        if (code && this.keyPressMap[code]) {
            return this.keyPressMap[code];
        }

        // 5. Fallback by key
        if (key && this.keyPressMap[key.toLowerCase()]) {
            return this.keyPressMap[key.toLowerCase()];
        }

        return null;
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
            '\'': [SYM, [4, 0xf7]], // Sym + 7
            '`': [SYM, [1, 0xfe]], // Sym + A
            '~': [SYM, [1, 0xfe]], // Sym + A
            '=': [SYM, [6, 0xfd]], // Sym + L
            '+': [SYM, [6, 0xfb]], // Sym + K
            '-': [SYM, [6, 0xf7]], // Sym + J
            '*': [SYM, [7, 0xf7]], // Sym + B
            '/': [SYM, [7, 0xef]], // Sym + V
            '\\': [SYM, [1, 0xfb]], // Sym + D
            '|': [SYM, [1, 0xfd]], // Sym + S
            '<': [SYM, [2, 0xf7]], // Sym + R
            '>': [SYM, [2, 0xef]], // Sym + T
            '(': [SYM, [4, 0xfb]], // Sym + 8
            ')': [SYM, [4, 0xfd]], // Sym + 9
            '{': [SYM, [1, 0xf7]], // Sym + F
            '}': [SYM, [1, 0xef]], // Sym + G
            ',': [SYM, [7, 0xfb]], // Sym + N
            '.': [SYM, [7, 0xfd]], // Sym + M
            '?': [SYM, [0, 0xef]], // Sym + C
            '!': [SYM, [3, 0xfe]], // Sym + 1
            '@': [SYM, [3, 0xfd]], // Sym + 2
            '#': [SYM, [3, 0xfb]], // Sym + 3
            '£': [SYM, [0, 0xf7]], // Sym + X
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

            // Command-C / Ctrl-C: Copy text without sending 'C' to Jupiter Ace
            if ((e.metaKey || e.ctrlKey) && (e.key === 'c' || e.key === 'C' || e.code === 'KeyC')) {
                e.preventDefault();
                if (this.onCopy) {
                    this.onCopy();
                }
                return;
            }

            // Command-V / Ctrl-V: Paste Forth code without sending 'V' to Jupiter Ace
            if ((e.metaKey || e.ctrlKey) && (e.key === 'v' || e.key === 'V' || e.code === 'KeyV')) {
                e.preventDefault();
                if (this.onPaste) {
                    this.onPaste();
                }
                return;
            }

            // Let other system hotkeys pass through
            if (e.metaKey || e.ctrlKey) {
                return;
            }

            // Prevent default browser scrolling / actions on navigation & space
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Tab', 'Backspace'].includes(e.key)) {
                e.preventDefault();
            }

            // Discard browser OS auto-repeat events; repeat pacing is managed deliberately in tick()
            if (e.repeat) {
                return;
            }

            // Modifier keys
            if (e.key === 'Shift' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
                const code = e.code || 'ShiftLeft';
                this.shiftKeys.add(code);
                this.updateMatrix();
                return;
            }

            if (['Alt', 'AltLeft', 'AltRight', 'Control', 'ControlLeft', 'ControlRight', 'Meta', 'MetaLeft', 'MetaRight'].includes(e.key) ||
                ['AltLeft', 'AltRight', 'ControlLeft', 'ControlRight', 'MetaLeft', 'MetaRight'].includes(e.code)) {
                return;
            }

            const code = e.code || e.key;
            const mapping = this.resolveKey(e.code, e.key);
            if (!mapping) {
                return;
            }

            const usesSymShift = mapping.some(m => m[0] === 0 && m[1] === 0xfd);

            // Release any other character key to prevent matrix jamming
            for (const [existingCode] of this.activeKeys) {
                if (existingCode !== code) {
                    this.activeKeys.delete(existingCode);
                }
            }

            this.activeKeys.set(code, {
                mapping,
                usesSymShift,
                frames: 0,
                released: false,
                active: true
            });

            this.updateMatrix();
        });

        window.addEventListener('keyup', (e) => {
            if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) {
                return;
            }

            // Modifier keys
            if (e.key === 'Shift' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
                this.shiftKeys.delete(e.code || 'ShiftLeft');
                this.shiftKeys.delete('ShiftLeft');
                this.shiftKeys.delete('ShiftRight');
                this.updateMatrix();
                return;
            }

            const code = e.code || e.key;
            if (this.activeKeys.has(code)) {
                const item = this.activeKeys.get(code);
                if (item.frames >= 3) {
                    this.activeKeys.delete(code);
                } else {
                    item.released = true;
                }
                this.updateMatrix();
            }
        });

        // Window blur -> release all keys
        window.addEventListener('blur', () => {
            this.clear();
        });
    }
}
