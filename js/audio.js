/**
 * Jupiter ACE Audio Subsystem (Web Audio API)
 * 
 * Emulates the 1-bit internal CPU-driven speaker:
 * - IN on even port resets speaker diaphragm to 0
 * - OUT on even port sets speaker diaphragm to 1
 * - Adapts dynamically to host hardware sample rate (e.g. 44.1 kHz, 48 kHz, 96 kHz)
 * - Glitch-free streaming via circular ring buffer and ScriptProcessorNode
 * - Single-pole DC blocker IIR filter (y[n] = x[n] - x[n-1] + 0.995 * y[n-1]) to eliminate DC offsets and pops
 */

export class AceAudio {
    constructor() {
        this.audioCtx = null;
        this.sampleRate = 44100;
        this.samplesPerFrame = Math.round(this.sampleRate / 50);
        this.cyclesPerFrame = 65000;

        this.speakerPos = 0; // 0 or 1
        this.lastSpeakerCycles = 0;

        this.frameBuffer = new Float32Array(this.samplesPerFrame);
        this.dcPrevX = 0;
        this.dcPrevY = 0;

        this.ringBufferSize = 32768;
        this.ringBuffer = new Float32Array(this.ringBufferSize);
        this.readIndex = 0;
        this.writeIndex = 0;

        this.volume = 0.3;
        this.enabled = true;
        this.processor = null;
        this.gainNode = null;
    }

    init() {
        if (typeof window === 'undefined') return;
        const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtxClass) return;

        if (!this.audioCtx) {
            try {
                this.audioCtx = new AudioCtxClass();
                this.sampleRate = this.audioCtx.sampleRate || 44100;
                this.samplesPerFrame = Math.round(this.sampleRate / 50);
                this.frameBuffer = new Float32Array(this.samplesPerFrame);

                // ScriptProcessor for continuous, low-latency audio stream
                const bufferSize = 1024;
                this.processor = this.audioCtx.createScriptProcessor(bufferSize, 0, 1);
                this.processor.onaudioprocess = (e) => {
                    const out = e.outputBuffer.getChannelData(0);
                    if (!this.enabled) {
                        out.fill(0);
                        return;
                    }

                    for (let i = 0; i < out.length; i++) {
                        if (this.readIndex !== this.writeIndex) {
                            out[i] = this.ringBuffer[this.readIndex];
                            this.readIndex = (this.readIndex + 1) % this.ringBufferSize;
                        } else {
                            out[i] = 0;
                        }
                    }
                };

                this.gainNode = this.audioCtx.createGain();
                this.gainNode.gain.value = this.volume;
                this.processor.connect(this.gainNode);
                this.gainNode.connect(this.audioCtx.destination);
                console.log(`[AceAudio] Initialized at ${this.sampleRate} Hz (${this.samplesPerFrame} samples/frame)`);
            } catch (err) {
                console.warn('[AceAudio] Failed to initialize AudioContext:', err);
            }
        }

        if (this.audioCtx && this.audioCtx.state === 'suspended') {
            this.audioCtx.resume().catch(() => {});
        }
    }

    resume() {
        if (!this.audioCtx) {
            this.init();
        } else if (this.audioCtx.state === 'suspended') {
            this.audioCtx.resume().catch(() => {});
        }
    }

    setVolume(vol) {
        this.volume = Math.max(0, Math.min(1, vol));
        if (this.gainNode && this.audioCtx) {
            this.gainNode.gain.setValueAtTime(this.volume, this.audioCtx.currentTime);
        }
    }

    setSpeaker(pos, currentCycles) {
        if (!this.audioCtx && typeof window !== 'undefined') {
            this.init();
        }

        if (currentCycles < this.lastSpeakerCycles) {
            this.lastSpeakerCycles = 0;
        }
        if (currentCycles > this.cyclesPerFrame) {
            currentCycles = this.cyclesPerFrame;
        }

        const lastSample = Math.floor((this.lastSpeakerCycles * this.samplesPerFrame) / this.cyclesPerFrame);
        const currentSample = Math.floor((currentCycles * this.samplesPerFrame) / this.cyclesPerFrame);

        const val = this.speakerPos ? 0.25 : -0.25;
        const end = Math.min(currentSample, this.samplesPerFrame);
        for (let i = lastSample; i < end; i++) {
            this.frameBuffer[i] = val;
        }

        this.speakerPos = pos ? 1 : 0;
        this.lastSpeakerCycles = currentCycles;
    }

    endFrame() {
        if (!this.enabled) return;

        // Fill remaining samples in frame with current speaker state
        const lastSample = Math.floor((this.lastSpeakerCycles * this.samplesPerFrame) / this.cyclesPerFrame);
        const val = this.speakerPos ? 0.25 : -0.25;
        for (let i = lastSample; i < this.samplesPerFrame; i++) {
            this.frameBuffer[i] = val;
        }

        // Apply DC blocker filter
        let prevX = this.dcPrevX;
        let prevY = this.dcPrevY;
        const rBuf = this.ringBuffer;
        const rSize = this.ringBufferSize;
        let wIdx = this.writeIndex;
        let rIdx = this.readIndex;

        for (let i = 0; i < this.samplesPerFrame; i++) {
            const x = this.frameBuffer[i];
            const y = x - prevX + 0.995 * prevY;
            prevX = x;
            prevY = y;

            if (rBuf) {
                rBuf[wIdx] = y;
                wIdx = (wIdx + 1) % rSize;
                if (wIdx === rIdx) {
                    // Buffer overrun: discard oldest sample to preserve real-time low latency
                    rIdx = (rIdx + 1) % rSize;
                }
            }
        }

        this.dcPrevX = prevX;
        this.dcPrevY = prevY;
        this.writeIndex = wIdx;
        this.readIndex = rIdx;
        this.lastSpeakerCycles = 0;
    }
}
