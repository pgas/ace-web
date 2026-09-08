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
        this.heldKeys = new Set();      // Physical keys currently held down (by code or key)
        this.virtualKeys = new Set();   // Programmatic / Spooler / MCP keys
        this.arrowMode = 'qaop';        // 'qaop' (standard Sinclair/Ace gaming: Q=Up, A=Down, O=Left, P=Right) | 'native' (Shift+5,6,7,8)
        
        this.clear();
        this.keyPressMap = this.buildKeyMap();
        this.setupDomListeners();
    }

    clear() {
        this.ports.fill(0xff);
        this.heldKeys.clear();
        this.virtualKeys.clear();
    }

    setArrowMode(mode) {
        if (mode === 'qaop' || mode === 'native') {
            this.arrowMode = mode;
            this.updateMatrix();
        }
    }

    tick() {
        // Maintained for frame loop hook.
        // Matrix is aggregate and driven by keydown/keyup events so held keys
        // remain continuously active without artificial frame timeouts.
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
        // Check special arrow mapping first
        if (keyId === 'ArrowLeft') {
            return this.arrowMode === 'qaop'
                ? [[5, 0xfd]]                     // 'o' (Left in Tut-Tut & games)
                : [[0, 0xfe], [3, 0xef]];         // Shift + 5 (Ace cursor left)
        }
        if (keyId === 'ArrowRight') {
            return this.arrowMode === 'qaop'
                ? [[5, 0xfe]]                     // 'p' (Right in Tut-Tut & games)
                : [[0, 0xfe], [4, 0xfb]];         // Shift + 8 (Ace cursor right)
        }
        if (keyId === 'ArrowUp') {
            return this.arrowMode === 'qaop'
                ? [[2, 0xfe]]                     // 'q' (Up in Tut-Tut & games)
                : [[0, 0xfe], [4, 0xf7]];         // Shift + 7 (Ace cursor up)
        }
        if (keyId === 'ArrowDown') {
            return this.arrowMode === 'qaop'
                ? [[1, 0xfe]]                     // 'a' (Down in Tut-Tut & games)
                : [[0, 0xfe], [4, 0xef]];         // Shift + 6 (Ace cursor down)
        }

        // Code mappings: KeyA..KeyZ, Digit0..Digit9
        if (keyId.startsWith('Key') && keyId.length === 4) {
            const letter = keyId[3].toLowerCase();
            return this.keyPressMap[letter] || null;
        }
        if (keyId.startsWith('Digit') && keyId.length === 6) {
            const digit = keyId[5];
            return this.keyPressMap[digit] || null;
        }

        // General map lookup (Enter, Space, Backspace, Escape, Shift, punctuation, etc.)
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
        // Map keyboard Key / Code -> [ [port1, mask1], [port2, mask2] ]
        const SYM = [0, 0xfd];
        const SHIFT = [0, 0xfe];

        return {
            // Letters (Port 0: Z X C, Port 1: A S D F G, Port 2: Q W E R T, Port 5: P O I U Y, Port 6: L K J H, Port 7: M N B)
            'a': [[1, 0xfe]], 'b': [[7, 0xef]], 'c': [[0, 0xef]], 'd': [[1, 0xfb]],
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

            // Function keys
            'F1': [SHIFT, [3, 0xfe]], // Delete line (Shift+1)
            'F4': [SHIFT, [3, 0xf7]], // Inverse video (Shift+4)
            'F9': [SHIFT, [4, 0xfd]], // Graphics mode (Shift+9)
        };
    }

    setupDomListeners() {
        if (typeof window === 'undefined') return;

        window.addEventListener('keydown', (e) => {
            // Ignore keystrokes when typing inside inputs or textareas
            if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) {
                return;
            }

            // Prevent default page scrolling / browser behavior on game keys
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Tab', 'Backspace'].includes(e.key)) {
                e.preventDefault();
            }

            // Record primary key identifier
            // Use e.key for punctuation/symbols, e.code for physical letters/arrows/digits
            const id = (e.key && e.key.length === 1 && !e.code.startsWith('Key') && !e.code.startsWith('Digit'))
                ? e.key
                : (e.code || e.key);

            if (!this.heldKeys.has(id)) {
                this.heldKeys.add(id);
                this.updateMatrix();
            }
        });

        window.addEventListener('keyup', (e) => {
            if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) {
                return;
            }

            const id1 = e.code || e.key;
            const id2 = e.key;

            this.heldKeys.delete(id1);
            if (id2) this.heldKeys.delete(id2);
            this.updateMatrix();
        });

        // Window lost focus -> clear all held keys so no keys get stuck
        window.addEventListener('blur', () => {
            this.heldKeys.clear();
            this.updateMatrix();
        });
    }
}
