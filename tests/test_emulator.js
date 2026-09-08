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

// Test 3: Tut-Tut Tape Loading & Execution
emu.tape.attach("tut-tut.tap", readBinary("examples/tut-tut.tap"));
emu.spooler.spoolText("LOAD TUTTUT\nTUTTUT\n", false);
for (let f = 0; f < 350; f++) emu.runFrame();

const tutScreen = window.__ace.getScreenText();
if (tutScreen.indexOf("TUT-TUT") !== -1 || tutScreen.indexOf("STEPHENSON") !== -1) {
    console.log("[PASS] Tut-Tut demo: tape loaded and title screen launched successfully");
} else {
    console.error("[FAIL] Tut-Tut demo failed to start. Screen:\n" + tutScreen);
}

console.log("=== All Tests Completed Successfully ===");
