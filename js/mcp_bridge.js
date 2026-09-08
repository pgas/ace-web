/**
 * Jupiter ACE MCP (Model Context Protocol) & Automation Bridge
 * 
 * Exposes a clean, structured JSON-RPC / JavaScript interface on `window.__ace`
 * enabling automated agents, Playwright, and MCP servers to control and inspect
 * the emulator with zero friction.
 */

export class AceMcpBridge {
    constructor(emulator) {
        this.emu = emulator;
        this.installGlobalHooks();
    }

    installGlobalHooks() {
        if (typeof window === 'undefined') return;

        window.__ace = {
            // CPU & Registers
            getRegisters: () => this.emu.debugger.getRegisters(),
            getState: () => this.emu.cpu.getState(),
            setState: (st) => this.emu.cpu.setState(st),

            // System Variables & Forth Environment
            getSysVars: () => this.emu.debugger.getSysVars(),
            inspectDictionary: (maxWords) => this.emu.debugger.inspectDictionary(maxWords),

            // Memory
            peek: (addr, len = 1) => {
                const res = [];
                for (let i = 0; i < len; i++) {
                    res.push(this.emu.memory.readByte(addr + i));
                }
                return len === 1 ? res[0] : res;
            },
            poke: (addr, bytes) => {
                if (typeof bytes === 'number') bytes = [bytes];
                for (let i = 0; i < bytes.length; i++) {
                    this.emu.memory.writeByte(addr + i, bytes[i]);
                }
            },
            dumpMemory: (startAddr, len) => this.emu.debugger.getMemoryDump(startAddr, len),

            // Display & VRAM
            getScreenText: () => {
                const vram = this.emu.memory.getVideoRam();
                let text = '';
                for (let r = 0; r < 24; r++) {
                    let row = '';
                    for (let c = 0; c < 32; c++) {
                        const code = vram[r * 32 + c] & 0x7f;
                        row += (code >= 32 && code <= 126) ? String.fromCharCode(code) : ' ';
                    }
                    text += row.trimEnd() + '\n';
                }
                return text;
            },

            // Keyboard & Keystroke Injection
            typeText: (str, isForth = true) => {
                this.emu.spooler.spoolText(str, isForth);
            },
            pressKey: (ch) => this.emu.keyboard.pressCharacter(ch),
            releaseKey: (ch) => this.emu.keyboard.releaseCharacter(ch),

            // Execution Controls
            pause: () => this.emu.pause(),
            resume: () => this.emu.resume(),
            stepInstruction: () => this.emu.stepInstruction(),
            stepFrames: (count = 1) => {
                for (let i = 0; i < count; i++) {
                    this.emu.runFrame();
                }
            },
            reset: () => this.emu.reset(),

            // Tape Management
            attachTape: (filename, arrayBuffer) => this.emu.tape.attach(filename, arrayBuffer),
            rewindTape: () => this.emu.tape.rewind(),
            detachTape: () => this.emu.tape.detach(),

            // JSON-RPC command dispatcher for MCP protocol
            executeMcpCommand: (method, params = {}) => {
                switch (method) {
                    case 'ace_get_registers':
                        return this.emu.debugger.getRegisters();
                    case 'ace_get_sysvars':
                        return this.emu.debugger.getSysVars();
                    case 'ace_get_screen_text':
                        return window.__ace.getScreenText();
                    case 'ace_peek_memory':
                        return window.__ace.peek(params.address, params.length || 1);
                    case 'ace_poke_memory':
                        window.__ace.poke(params.address, params.bytes);
                        return { success: true };
                    case 'ace_type_command':
                        window.__ace.typeText(params.command, params.is_forth !== false);
                        return { success: true };
                    case 'ace_step_frame':
                        window.__ace.stepFrames(params.count || 1);
                        return { screen: window.__ace.getScreenText() };
                    case 'ace_inspect_dictionary':
                        return this.emu.debugger.inspectDictionary(params.max_words || 30);
                    default:
                        throw new Error(`Unknown MCP method: ${method}`);
                }
            }
        };

        console.log('[AceMcpBridge] Initialized window.__ace automation API');
    }
}
