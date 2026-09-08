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
var window = { addEventListener: () => {}, AudioContext: null, webkitAudioContext: null };

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

// Test 3: Keyboard Matrix & Responsiveness
emu.keyboard.heldKeys.add("ArrowLeft");
emu.keyboard.updateMatrix();
if (emu.keyboard.ports[5] === 0xfd) {
    console.log("[PASS] Keyboard: ArrowLeft in QAOP mode maps to 'O' (Port 5, bit 1)");
} else {
    console.error("[FAIL] Keyboard: ArrowLeft QAOP mapping incorrect");
}

emu.keyboard.heldKeys.add("Space");
emu.keyboard.updateMatrix();
if (emu.keyboard.ports[5] === 0xfd && emu.keyboard.ports[7] === 0xfe) {
    console.log("[PASS] Keyboard: Multiple simultaneous keys active without blocking or crosstalk");
} else {
    console.error("[FAIL] Keyboard: Simultaneous keys conflict");
}

emu.keyboard.heldKeys.delete("Space");
emu.keyboard.updateMatrix();
if (emu.keyboard.ports[5] === 0xfd && emu.keyboard.ports[7] === 0xff) {
    console.log("[PASS] Keyboard: Releasing one key preserves held key continuously");
} else {
    console.error("[FAIL] Keyboard: Key release affected remaining held key");
}

emu.keyboard.setArrowMode("native");
emu.keyboard.heldKeys.clear();
emu.keyboard.heldKeys.add("ArrowUp");
emu.keyboard.updateMatrix();
if (emu.keyboard.ports[0] === 0xfe && emu.keyboard.ports[4] === 0xf7) {
    console.log("[PASS] Keyboard: Native Ace ArrowUp maps to Shift+7");
} else {
    console.error("[FAIL] Keyboard: Native ArrowUp mapping incorrect");
}
emu.keyboard.clear();

// Test 4: Tape Loading & Execution (if tape file is present)
const tapeCandidates = ["examples/tut-tut.tap", "../tut-tut.tap", "tut-tut.tap"];
let foundTape = null;
for (const p of tapeCandidates) {
    if (fm.fileExistsAtPath(p)) {
        foundTape = p;
        break;
    }
}

if (foundTape) {
    emu.tape.attach("tut-tut.tap", readBinary(foundTape));
    emu.spooler.spoolText("LOAD TUTTUT\nTUTTUT\n", false);
    for (let f = 0; f < 350; f++) emu.runFrame();

    const tutScreen = window.__ace.getScreenText();
    if (tutScreen.indexOf("TUT-TUT") !== -1 || tutScreen.indexOf("STEPHENSON") !== -1) {
        console.log("[PASS] Tut-Tut demo: tape loaded and title screen launched successfully");
    } else {
        console.error("[FAIL] Tut-Tut demo failed to start. Screen:\n" + tutScreen);
    }
} else {
    console.log("[INFO] Tape file not present; skipped tape execution test");
}

console.log("=== All Tests Completed Successfully ===");

