/**
 * Jupiter ACE Forth Source Spooler & Comment Preprocessor
 * 
 * Accurately handles text feeding into the Jupiter ACE keyboard buffer:
 * - Strips Forth ( ... ) comments outside colon definitions (which would trigger ERROR 4)
 * - Paces key press (1 frame) and release (1 frame)
 * - Waits 6 frames after Enter to give the Forth interpreter/compiler time to parse the line
 */

export class AceSpooler {
    constructor(keyboard) {
        this.keyboard = keyboard;
        this.queue = [];
        this.state = 'IDLE'; // 'IDLE' | 'PRESS' | 'RELEASE'
        this.waitFrames = 0;
        this.currentChar = null;
        this.onProgress = null; // Callback for UI progress
        this.totalChars = 0;
    }

    isActive() {
        return this.queue.length > 0 || this.state !== 'IDLE';
    }

    /**
     * Preprocesses Forth source:
     * - Strips \ line comments (standard Forth and Ace Forth scripts)
     * - Strips ( ... ) parenthesized comments (which trigger ERROR 4 in Ace interpret mode)
     * - Preserves string literals (." ... ", S" ... ")
     * - Removes empty/blank lines
     */
    preprocessForth(text) {
        if (!text) return '';
        const hadTrailingNewline = text.endsWith('\n') || text.endsWith('\r');
        text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        const lines = text.split('\n');
        const processedLines = [];

        for (let line of lines) {
            let trimmed = line.trim();
            if (!trimmed) continue;

            // Protect Forth string literals (." ... ", S" ... ", ABORT" ... ")
            const strings = [];
            let clean = trimmed.replace(/(\b(?:[.]|S|ABORT)"\s[^"]*")/gi, (m) => {
                strings.push(m);
                return `__FORTH_STR_${strings.length - 1}__`;
            });

            // Strip backslash line comments (\ to end of line)
            clean = clean.replace(/(^|\s)\\(\s.*|$)/, '');

            // Strip parenthesized comments (( ... ))
            clean = clean.replace(/\([^\)]*\)/g, '');

            // Restore string literals
            clean = clean.replace(/__FORTH_STR_(\d+)__/g, (_, idx) => strings[parseInt(idx, 10)]);

            clean = clean.trim();
            if (clean.length > 0) {
                processedLines.push(clean);
            }
        }

        let result = processedLines.join('\n');
        if (hadTrailingNewline && result.length > 0) {
            result += '\n';
        }
        return result;
    }

    spoolText(text, isForth = true) {
        const cleanText = isForth ? this.preprocessForth(text) : text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        this.queue = cleanText.split('');
        this.totalChars = this.queue.length;
        this.state = 'RELEASE';
        this.waitFrames = 2;
    }

    stop() {
        this.queue = [];
        this.state = 'IDLE';
        this.waitFrames = 0;
        if (this.currentChar) {
            this.keyboard.releaseCharacter(this.currentChar);
            this.currentChar = null;
        }
    }

    /**
     * Called once per 50 Hz frame
     */
    tick() {
        if (this.waitFrames > 0) {
            this.waitFrames--;
            return;
        }

        if (this.state === 'PRESS') {
            // Key was held down for 3 frames; now release it
            if (this.currentChar) {
                if (this.currentChar === '\n') {
                    this.keyboard.releaseCharacter('Enter');
                    this.waitFrames = 8; // Extra delay after newline for compilation
                } else {
                    this.keyboard.releaseCharacter(this.currentChar);
                    this.waitFrames = 3;
                }
                this.currentChar = null;
            }
            this.state = 'RELEASE';
        } else if (this.state === 'RELEASE') {
            if (this.queue.length === 0) {
                this.state = 'IDLE';
                if (this.onProgress) this.onProgress(1, 1);
                return;
            }

            // Fetch next character and press it
            this.currentChar = this.queue.shift();
            if (this.currentChar === '\n') {
                this.keyboard.pressCharacter('Enter');
            } else {
                this.keyboard.pressCharacter(this.currentChar);
            }
            this.state = 'PRESS';
            this.waitFrames = 3;

            if (this.onProgress) {
                const completed = this.totalChars - this.queue.length;
                this.onProgress(completed, this.totalChars);
            }
        }
    }
}
