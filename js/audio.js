/**
 * Jupiter ACE Audio Subsystem (Web Audio API)
 * 
 * Emulates the 1-bit internal speaker:
 * - IN on even port resets speaker diaphragm to 0
 * - OUT on even port sets speaker diaphragm to 1
 * - 44,100 Hz sample rate / 50 Hz frame = 882 samples/frame
 * - 65,000 CPU cycles per frame
 * - Single-pole DC blocker IIR filter (y[n] = x[n] - x[n-1] + 0.995 * y[n-1])
 */

export class AceAudio {
    constructor() {
        this.sampleRate = 44100;
        this.samplesPerFrame = Math.floor(this.sampleRate / 50); // 882
        this.cyclesPerFrame = 65000;

        this.audioCtx = null;
        this.speakerPos = 0; // 0 or 1
        this.lastSpeakerCycles = 0;

        this.frameBuffer = new Float32Array(this.samplesPerFrame);
        this.dcPrevX = 0;
        this.dcPrevY = 0;

        this.volume = 0.25;
        this.nextPlayTime = 0;
        this.enabled = true;
    }

    init() {
        if (!this.audioCtx && typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)) {
            const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
            this.audioCtx = new AudioCtxClass({ sampleRate: this.sampleRate });
            this.nextPlayTime = this.audioCtx.currentTime + 0.05;
        }
        if (this.audioCtx && this.audioCtx.state === 'suspended') {
            this.audioCtx.resume();
        }
    }

    setSpeaker(pos, currentCycles) {
        if (currentCycles < this.lastSpeakerCycles) {
            this.lastSpeakerCycles = 0;
        }
        if (currentCycles > this.cyclesPerFrame) {
            currentCycles = this.cyclesPerFrame;
        }

        const lastSample = Math.floor((this.lastSpeakerCycles * this.samplesPerFrame) / this.cyclesPerFrame);
        const currentSample = Math.floor((currentCycles * this.samplesPerFrame) / this.cyclesPerFrame);

        const val = this.speakerPos ? 0.15 : -0.15;
        const end = Math.min(currentSample, this.samplesPerFrame);
        for (let i = lastSample; i < end; i++) {
            this.frameBuffer[i] = val;
        }

        this.speakerPos = pos ? 1 : 0;
        this.lastSpeakerCycles = currentCycles;
    }

    endFrame() {
        if (!this.enabled) return;

        // Fill remaining samples in this frame with current speaker state
        const lastSample = Math.floor((this.lastSpeakerCycles * this.samplesPerFrame) / this.cyclesPerFrame);
        const val = this.speakerPos ? 0.15 : -0.15;
        for (let i = lastSample; i < this.samplesPerFrame; i++) {
            this.frameBuffer[i] = val;
        }

        // Apply DC blocker filter to eliminate pops and DC offset
        let prevX = this.dcPrevX;
        let prevY = this.dcPrevY;
        for (let i = 0; i < this.samplesPerFrame; i++) {
            const x = this.frameBuffer[i];
            const y = x - prevX + 0.995 * prevY;
            prevX = x;
            prevY = y;
            this.frameBuffer[i] = y * this.volume;
        }
        this.dcPrevX = prevX;
        this.dcPrevY = prevY;

        this.lastSpeakerCycles = 0;

        // Queue audio buffer to AudioContext
        if (this.audioCtx && this.audioCtx.state === 'running') {
            const audioBuf = this.audioCtx.createBuffer(1, this.samplesPerFrame, this.sampleRate);
            audioBuf.copyToChannel(this.frameBuffer, 0);

            const source = this.audioCtx.createBufferSource();
            source.buffer = audioBuf;
            source.connect(this.audioCtx.destination);

            const now = this.audioCtx.currentTime;
            if (this.nextPlayTime < now) {
                this.nextPlayTime = now + 0.02; // Small lead buffer to prevent underruns
            }

            source.start(this.nextPlayTime);
            this.nextPlayTime += audioBuf.duration;
        }
    }
}
