/**
 * Jupiter ACE Browser Emulator - Main Engine Orchestrator
 */

import { getAceRom } from './rom.js';
import { AceMemory } from './memory.js';
import { createZ80 } from './z80.js';
import { AceVideo } from './video.js';
import { AceAudio } from './audio.js';
import { AceKeyboard } from './keyboard.js';
import { AceTape } from './tape.js';
import { AceSpooler } from './spooler.js';
import { AceDebugger } from './debugger.js';
import { AceMcpBridge } from './mcp_bridge.js';

export class JupiterAceEmulator {
    constructor(canvasElement) {
        this.canvas = canvasElement;
        this.memory = new AceMemory();
        this.video = new AceVideo(this.canvas);
        this.audio = new AceAudio();
        this.keyboard = new AceKeyboard();
        this.tape = new AceTape(this.memory);
        this.spooler = new AceSpooler(this.keyboard);
        this.debugger = new AceDebugger(this);

        this.running = false;
        this.speedMultiplier = 1; // 1 = 100% normal (50 FPS), 4 = Turbo
        this.cyclesPerFrame = 65000; // 3.25 MHz / 50 Hz
        this.currentFrameCycles = 0;
        this.rafId = null;

        // Initialize Z80 CPU
        this.initCpu();

        // Initialize MCP / window.__ace bridge
        this.mcpBridge = new AceMcpBridge(this);

        // Load ROM
        this.boot();
    }

    initCpu() {
        const core = {
            mem_read: (addr) => this.memory.readByte(addr),
            mem_write: (addr, val) => this.memory.writeByte(addr, val),
            io_read: (port) => {
                // Check even port (port & 1 === 0)
                if ((port & 1) === 0) {
                    this.audio.setSpeaker(0, this.currentFrameCycles);
                    return this.keyboard.read(port);
                }
                return 0xff;
            },
            io_write: (port, val) => {
                if ((port & 1) === 0) {
                    this.audio.setSpeaker(1, this.currentFrameCycles);
                }
            },
            tape_load: (hl, de, c) => this.tape.tapeLoad(hl, de, c),
            tape_save: (hl, de) => this.tape.tapeSave(hl, de)
        };

        this.cpu = createZ80(core);
    }

    boot() {
        try {
            const rom = getAceRom();
            this.memory.loadRom(rom);
            this.memory.setRamSize(19); // 19KB extended RAM (default)
            this.reset();
            console.log('[JupiterAce] Booted successfully with 19KB extended RAM');
        } catch (err) {
            console.error('[JupiterAce] Boot failed:', err);
        }
    }

    reset() {
        this.memory.reset();
        this.cpu.reset();
        this.keyboard.clear();
        this.currentFrameCycles = 0;
        this.video.render(this.memory.getVideoRam(), this.memory.getCharRam(), true);
    }

    pause() {
        this.running = false;
        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
            this.rafId = null;
        }
    }

    resume() {
        if (!this.running) {
            this.running = true;
            this.audio.init();
            this.loop();
        }
    }

    getForthStack() {
        return this.debugger.getForthStack();
    }

    stepInstruction() {
        const cycles = this.cpu.run_instruction();
        this.currentFrameCycles += cycles;
        if (this.currentFrameCycles >= this.cyclesPerFrame) {
            this.endFrame();
        }
        this.video.render(this.memory.getVideoRam(), this.memory.getCharRam());
        return cycles;
    }

    endFrame() {
        this.currentFrameCycles = 0;

        // Finish audio frame
        this.audio.endFrame();

        // Advance keyboard auto-release timers
        this.keyboard.tick();

        // Advance Forth source spooler
        this.spooler.tick();

        // 50Hz Maskable Interrupt to Jupiter Ace ROM (IM 1 vector 0x0038)
        this.cpu.interrupt(false, 0x38);

        // Render screen
        this.video.render(this.memory.getVideoRam(), this.memory.getCharRam());
    }

    runFrame() {
        let frameCycles = 0;
        while (frameCycles < this.cyclesPerFrame) {
            const cycles = this.cpu.run_instruction();
            frameCycles += cycles;
            this.currentFrameCycles = frameCycles;
        }
        this.endFrame();
    }

    loop(timestamp) {
        if (!this.running) return;

        const now = timestamp || (typeof performance !== 'undefined' ? performance.now() : Date.now());
        if (!this.lastFrameTime) {
            this.lastFrameTime = now;
            this.lastFpsUpdate = now;
            this.fpsFrames = 0;
        }

        const elapsed = now - this.lastFrameTime;
        const targetFrameTime = 1000 / 50; // 20.0 ms per 50Hz frame

        let framesToAdvance = Math.floor(elapsed / targetFrameTime);
        if (framesToAdvance > 5) {
            framesToAdvance = 5; // Clamp to avoid burst after background tab unfocus
            this.lastFrameTime = now;
        }

        if (framesToAdvance > 0) {
            this.lastFrameTime += framesToAdvance * targetFrameTime;
            const multiplier = this.spooler.isActive() ? 4 : this.speedMultiplier;
            for (let i = 0; i < framesToAdvance * multiplier; i++) {
                this.runFrame();
                this.fpsFrames++;
            }
        }

        // Update live FPS counter once per second
        if (now - this.lastFpsUpdate >= 1000) {
            const actualFps = Math.round((this.fpsFrames * 1000) / (now - this.lastFpsUpdate));
            const fpsEl = typeof document !== 'undefined' ? document.getElementById('fps-counter') : null;
            if (fpsEl) {
                fpsEl.textContent = `${actualFps} FPS`;
            }
            this.fpsFrames = 0;
            this.lastFpsUpdate = now;
        }

        if (typeof requestAnimationFrame !== 'undefined') {
            this.rafId = requestAnimationFrame((ts) => this.loop(ts));
        }
    }
}
