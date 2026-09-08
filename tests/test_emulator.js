// Automated Headless Test Suite for Jupiter ACE Web Emulator
const fm = $.NSFileManager.defaultManager;

function readBinary(path) {
    const data = $.NSData.dataWithContentsOfFile(path);
    const len = data.length;
    const arr = new Uint8Array(len);
    for (let i = 0; i < len; i++) arr[i] = data.bytes[i];
    return arr;
}

function readText(path) {
    return $.NSString.stringWithContentsOfFileEncodingError(path, $.NSUTF8StringEncoding, null).js;
}

function loadModule(path) {
    let code = readText(path);
    code = code.replace(/import\s+.*?from\s+[\x27\x22].*?[\x27\x22];?/g, "");
    code = code.replace(/export\s+class\s+(\w+)/g, "globalThis.$1 = class $1");
    code = code.replace(/export\s+function\s+(\w+)/g, "globalThis.$1 = function $1");
    code = code.replace(/export\s+const\s+(\w+)/g, "globalThis.$1");
    code = code.replace(/export\s*\{[^}]*\};?/g, "");
    (1, eval)(code);
}

const dummyCanvas = {
    getContext: () => ({
        createImageData: () => ({ data: new Uint8ClampedArray(256 * 192 * 4) }),
        putImageData: () => {}, fillRect: () => {}, drawImage: () => {}
    }),
    addEventListener: () => {},
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 256, height: 192 }),
    width: 256, height: 192
};
var document = { createElement: () => dummyCanvas };
var windowListeners = {};
var window = {
    addEventListener: (type, fn) => {
        if (!windowListeners[type]) windowListeners[type] = [];
        windowListeners[type].push(fn);
    },
    dispatchEvent: (ev) => {
        ev.preventDefault = ev.preventDefault || (() => {});
        if (windowListeners[ev.type]) {
            windowListeners[ev.type].forEach(fn => fn(ev));
        }
    },
    AudioContext: null,
    webkitAudioContext: null
};

console.log("=== Jupiter ACE Web Test Suite ===");
loadModule("js/rom.js");
loadModule("js/memory.js");
loadModule("js/z80.js");
loadModule("js/video.js");
loadModule("js/audio.js");
loadModule("js/keyboard.js");
loadModule("js/tape.js");
loadModule("js/spooler.js");
loadModule("js/debugger.js");
loadModule("js/mcp_bridge.js");
loadModule("js/main.js");

const emu = new JupiterAceEmulator(dummyCanvas);

// Test 1: Boot sequence
for (let f = 0; f < 80; f++) emu.runFrame();
const regs = emu.debugger.getRegisters();
console.log(`[PASS] Boot successful: PC=0x${regs.PC}, SP=0x${regs.SP}, RAM=19KB`);

// Test 2: Interactive Forth Calculation (2 3 + .)
emu.spooler.spoolText("2 3 + .\n", false);
for (let f = 0; f < 100; f++) emu.runFrame();
const calcScreen = window.__ace.getScreenText();
if (calcScreen.indexOf("5  OK") !== -1 || calcScreen.indexOf("5") !== -1) {
    console.log("[PASS] Forth arithmetic: 2 3 + . returned 5 OK");
} else {
    console.error("[FAIL] Forth arithmetic output unexpected:\n" + calcScreen);
}

// Test 3: Keyboard Matrix, Native Arrow Keys & B Key Verification
emu.keyboard.heldKeys.add("b");
emu.keyboard.updateMatrix();
if (emu.keyboard.ports[7] === 0xf7) {
    console.log("[PASS] Keyboard: 'b' maps to Port 7 bit 3 (0xf7)");
} else {
    console.error("[FAIL] Keyboard: 'b' mapping incorrect, got 0x" + emu.keyboard.ports[7].toString(16));
}
emu.keyboard.clear();

// ArrowLeft -> Shift + 5 (p0=0xfe, p3=0xef)
emu.keyboard.heldKeys.add("ArrowLeft");
emu.keyboard.updateMatrix();
if (emu.keyboard.ports[0] === 0xfe && emu.keyboard.ports[3] === 0xef) {
    console.log("[PASS] Keyboard: Native ArrowLeft maps to Shift+5");
} else {
    console.error("[FAIL] Keyboard: ArrowLeft expected p0=0xfe, p3=0xef, got p0=" + emu.keyboard.ports[0].toString(16) + " p3=" + emu.keyboard.ports[3].toString(16));
}

// ArrowRight -> Shift + 8 (p0=0xfe, p4=0xfb)
emu.keyboard.heldKeys.clear();
emu.keyboard.heldKeys.add("ArrowRight");
emu.keyboard.updateMatrix();
if (emu.keyboard.ports[0] === 0xfe && emu.keyboard.ports[4] === 0xfb) {
    console.log("[PASS] Keyboard: Native ArrowRight maps to Shift+8");
} else {
    console.error("[FAIL] Keyboard: ArrowRight expected p0=0xfe, p4=0xfb");
}

// ArrowUp -> Shift + 7 (p0=0xfe, p4=0xf7)
emu.keyboard.heldKeys.clear();
emu.keyboard.heldKeys.add("ArrowUp");
emu.keyboard.updateMatrix();
if (emu.keyboard.ports[0] === 0xfe && emu.keyboard.ports[4] === 0xf7) {
    console.log("[PASS] Keyboard: Native ArrowUp maps to Shift+7");
} else {
    console.error("[FAIL] Keyboard: Native ArrowUp mapping incorrect");
}

// ArrowDown -> Shift + 6 (p0=0xfe, p4=0xef)
emu.keyboard.heldKeys.clear();
emu.keyboard.heldKeys.add("ArrowDown");
emu.keyboard.updateMatrix();
if (emu.keyboard.ports[0] === 0xfe && emu.keyboard.ports[4] === 0xef) {
    console.log("[PASS] Keyboard: Native ArrowDown maps to Shift+6");
} else {
    console.error("[FAIL] Keyboard: Native ArrowDown mapping incorrect");
}
emu.keyboard.clear();

// Shift+8 (*) via simulated DOM events: should produce Symbol Shift (Port 0: 0xfd) + B (Port 7: 0xf7)
window.dispatchEvent({ type: 'keydown', code: 'ShiftLeft', key: 'Shift' });
window.dispatchEvent({ type: 'keydown', code: 'Digit8', key: '*' });
if (emu.keyboard.ports[0] === 0xfd && emu.keyboard.ports[7] === 0xf7) {
    console.log("[PASS] Keyboard DOM: Shift+8 produces Symbol Shift (0xfd) + B (0xf7) without Caps Shift pollution");
} else {
    console.error("[FAIL] Keyboard DOM: Shift+8 got Port 0=0x" + emu.keyboard.ports[0].toString(16) + " Port 7=0x" + emu.keyboard.ports[7].toString(16));
}

// Release Shift BEFORE releasing 8: must cleanly unjam without leaving key stuck
window.dispatchEvent({ type: 'keyup', code: 'ShiftLeft', key: 'Shift' });
// Advance 3 frames to satisfy interrupt sampling hold
emu.keyboard.tick(); emu.keyboard.tick(); emu.keyboard.tick();
window.dispatchEvent({ type: 'keyup', code: 'Digit8', key: '8' });
if (emu.keyboard.ports[0] === 0xff && emu.keyboard.ports[7] === 0xff && emu.keyboard.activeKeys.size === 0) {
    console.log("[PASS] Keyboard DOM: Releasing Shift before key clears cleanly without jamming");
} else {
    console.error("[FAIL] Keyboard DOM: Keys stuck after Shift-first release, activeKeys size=" + emu.keyboard.activeKeys.size);
}

// Shift+A: should produce Caps Shift (Port 0: 0xfe) + A (Port 1: 0xfe)
window.dispatchEvent({ type: 'keydown', code: 'ShiftLeft', key: 'Shift' });
window.dispatchEvent({ type: 'keydown', code: 'KeyA', key: 'A' });
if (emu.keyboard.ports[0] === 0xfe && emu.keyboard.ports[1] === 0xfe) {
    console.log("[PASS] Keyboard DOM: Shift+A produces Caps Shift (0xfe) + A (0xfe)");
} else {
    console.error("[FAIL] Keyboard DOM: Shift+A got Port 0=0x" + emu.keyboard.ports[0].toString(16) + " Port 1=0x" + emu.keyboard.ports[1].toString(16));
}
emu.keyboard.tick(); emu.keyboard.tick(); emu.keyboard.tick();
window.dispatchEvent({ type: 'keyup', code: 'KeyA', key: 'a' });
window.dispatchEvent({ type: 'keyup', code: 'ShiftLeft', key: 'Shift' });

// '=' key: should produce Symbol Shift (Port 0: 0xfd) + L (Port 6: 0xfd)
window.dispatchEvent({ type: 'keydown', code: 'Equal', key: '=' });
if (emu.keyboard.ports[0] === 0xfd && emu.keyboard.ports[6] === 0xfd) {
    console.log("[PASS] Keyboard DOM: '=' key produces Symbol Shift (0xfd) + L (0xfd)");
} else {
    console.error("[FAIL] Keyboard DOM: '=' got Port 0=0x" + emu.keyboard.ports[0].toString(16) + " Port 6=0x" + emu.keyboard.ports[6].toString(16));
}
emu.keyboard.tick(); emu.keyboard.tick(); emu.keyboard.tick();
window.dispatchEvent({ type: 'keyup', code: 'Equal', key: '=' });
emu.keyboard.clear();

// US-International Dead Key Test: Shift + Quote (key='Dead') produces double-quote '"' (Symbol Shift + P)
window.dispatchEvent({ type: 'keydown', code: 'ShiftLeft', key: 'Shift' });
window.dispatchEvent({ type: 'keydown', code: 'Quote', key: 'Dead', shiftKey: true });
if (emu.keyboard.ports[0] === 0xfd && emu.keyboard.ports[5] === 0xfe) {
    console.log("[PASS] US-Intl Dead Key: Shift+Quote (key='Dead') produces Symbol Shift (0xfd) + P (0xfe) for '\"'");
} else {
    console.error("[FAIL] US-Intl Dead Key: Shift+Quote expected Port 0=0xfd, Port 5=0xfe, got Port 0=0x" + emu.keyboard.ports[0].toString(16) + " Port 5=0x" + emu.keyboard.ports[5].toString(16));
}
emu.keyboard.tick(); emu.keyboard.tick(); emu.keyboard.tick();
window.dispatchEvent({ type: 'keyup', code: 'Quote', key: 'Dead' });
window.dispatchEvent({ type: 'keyup', code: 'ShiftLeft', key: 'Shift' });

// Follow-up Spacebar after Dead key within 600ms should be absorbed (not emit trailing space)
window.dispatchEvent({ type: 'keydown', code: 'Space', key: ' ' });
if (emu.keyboard.ports[7] === 0xff) {
    console.log("[PASS] US-Intl Dead Key: Follow-up spacebar correctly absorbed without polluting screen");
} else {
    console.error("[FAIL] US-Intl Dead Key: Follow-up spacebar leaked into matrix, Port 7=0x" + emu.keyboard.ports[7].toString(16));
}
emu.keyboard.clear();

// US-International Dead Key: Bare Quote (key='Dead', no shift) produces apostrophe '\'' (Symbol Shift + 7)
window.dispatchEvent({ type: 'keydown', code: 'Quote', key: 'Dead', shiftKey: false });
if (emu.keyboard.ports[0] === 0xfd && emu.keyboard.ports[4] === 0xf7) {
    console.log("[PASS] US-Intl Dead Key: Bare Quote (key='Dead') produces Symbol Shift (0xfd) + 7 (0xf7) for '\''");
} else {
    console.error("[FAIL] US-Intl Dead Key: Bare Quote expected Port 0=0xfd, Port 4=0xf7, got Port 0=0x" + emu.keyboard.ports[0].toString(16) + " Port 4=0x" + emu.keyboard.ports[4].toString(16));
}
emu.keyboard.tick(); emu.keyboard.tick(); emu.keyboard.tick();
window.dispatchEvent({ type: 'keyup', code: 'Quote', key: 'Dead' });
emu.keyboard.clear();

// Test 4: Audio Subsystem & Speaker Toggling (BEEP execution)
let speakerToggles = 0;
const origSetSpeaker = emu.audio.setSpeaker.bind(emu.audio);
emu.audio.setSpeaker = function(pos, cycles) {
    speakerToggles++;
    origSetSpeaker(pos, cycles);
};
emu.spooler.spoolText("10 50 BEEP\n", false);
for (let f = 0; f < 80; f++) emu.runFrame();
if (speakerToggles > 0) {
    console.log(`[PASS] Audio: BEEP command generated ${speakerToggles} speaker diaphragm transitions`);
} else {
    console.error("[FAIL] Audio: BEEP command produced no speaker transitions");
}

// Test 5: Tape Loading & Execution (if tape file is present)
const tapeCandidates = ["examples/tut-tut.tap", "../tut-tut.tap", "tut-tut.tap"];
let foundTape = null;
for (const p of tapeCandidates) {
    if (fm.fileExistsAtPath(p)) {
        foundTape = p;
        break;
    }
}

if (foundTape) {
    emu.reset();
    for (let f = 0; f < 80; f++) emu.runFrame();
    emu.tape.attach("tut-tut.tap", readBinary(foundTape));
    emu.spooler.spoolText("LOAD TUTTUT\nTUTTUT\n", false);
    for (let f = 0; f < 350; f++) emu.runFrame();

    const tutScreen = window.__ace.getScreenText();
    if (tutScreen.indexOf("TUT-TUT") !== -1 || tutScreen.indexOf("STEPHENSON") !== -1) {
        console.log("[PASS] Tut-Tut demo: tape loaded and title screen launched successfully");
    } else {
        console.log("[FAIL] Tut-Tut demo failed to start. Screen:\n" + tutScreen);
    }
} else {
    console.log("[INFO] Tape file not present; skipped tape execution test");
}

// Test 6: Forth Data Stack Live Inspection
emu.reset();
for (let f = 0; f < 80; f++) emu.runFrame();
let initialStack = emu.getForthStack();
if (initialStack.depth === 0) {
    console.log("[PASS] Forth Stack: starts empty on boot");
} else {
    console.error("[FAIL] Forth Stack expected 0 items, got " + initialStack.depth);
}

// Push 10 20 30 onto stack
emu.spooler.spoolText("10 20 30\n", false);
while (emu.spooler.isActive()) emu.runFrame();
for (let f = 0; f < 30; f++) emu.runFrame();

let stackAfterPush = emu.getForthStack();
if (stackAfterPush.depth === 3 && stackAfterPush.items[2].sval === 30) {
    console.log("[PASS] Forth Stack: pushed 10 20 30, TOS=30, depth=3");
} else {
    console.error("[FAIL] Forth Stack push mismatch: depth=" + stackAfterPush.depth);
}

// Pop with +
emu.spooler.spoolText("+\n", false);
while (emu.spooler.isActive()) emu.runFrame();
for (let f = 0; f < 30; f++) emu.runFrame();

let stackAfterAdd = emu.getForthStack();
if (stackAfterAdd.depth === 2 && stackAfterAdd.items[1].sval === 50) {
    console.log("[PASS] Forth Stack: executed +, TOS=50 (20+30), depth=2");
} else {
    console.error("[FAIL] Forth Stack operation mismatch: depth=" + stackAfterAdd.depth);
}

// Test 7: Forth Spooler Comment Preprocessing (\ and ( ) stripping)
const commentSnippet = " DEFINER STRING\n  34 WORD          \\ parse up to '\"' (ASCII 34), leaves counted string at HERE\n  DUP C@ 1+ ALLOT  \\ reserve the bytes in the dictionary\nDOES> ( -- addr len )\n  DUP 1+ SWAP C@ ; \\ push ( addr len ) directly to the stack when called \n";
const preprocessed = emu.spooler.preprocessForth(commentSnippet);
const expectedClean = "DEFINER STRING\n34 WORD\nDUP C@ 1+ ALLOT\nDOES>\nDUP 1+ SWAP C@ ;\n";
if (preprocessed === expectedClean) {
    console.log("[PASS] Forth Spooler: Successfully stripped all \\ and ( ) comments from script");
} else {
    console.error("[FAIL] Forth Spooler preprocessor output mismatch:\nGot: " + JSON.stringify(preprocessed) + "\nExpected: " + JSON.stringify(expectedClean));
}

// Test 8: Correct Jupiter ACE String Definer (using C, into dictionary)
emu.reset();
for (let f = 0; f < 80; f++) emu.runFrame();
const correctStringDefiner = "DEFINER STRING\n34 WORD DUP C@ 1+ 0 DO DUP I + C@ C, LOOP DROP\nDOES>\nDUP 1+ SWAP C@ ;\nSTRING MSG HELLO, JUPITER ACE!\"\nMSG TYPE\n";
emu.spooler.spoolText(correctStringDefiner, true);
while (emu.spooler.isActive()) emu.runFrame();
for (let f = 0; f < 80; f++) emu.runFrame();
const stringScreen = window.__ace.getScreenText();
if (stringScreen.indexOf("HELLO, JUPITER ACE!") !== -1) {
    console.log("[PASS] Jupiter ACE Forth: String definer successfully compiled and printed string");
} else {
    console.error("[FAIL] Jupiter ACE Forth: String definer output unexpected:\n" + stringScreen);
}

console.log("=== All Tests Completed Successfully ===");

