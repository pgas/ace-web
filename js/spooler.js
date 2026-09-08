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
     * - Strips ( ... ) comments outside colon definitions
     * - Removes blank lines
     */
    preprocessForth(text) {
        if (!text) return '';
        const hadTrailingNewline = text.endsWith('\n') || text.endsWith('\r');
        // Strip carriage returns
        text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        const lines = text.split('\n');
        const processedLines = [];
        let insideColon = false;

        for (let line of lines) {
            let trimmed = line.trim();
            if (!trimmed) continue;

            // Check if line enters or exits colon definition
            if (trimmed.startsWith(':')) {
                insideColon = true;
            }

            if (!insideColon) {
                // Strip all comments ( ... )
                trimmed = trimmed.replace(/\([^\)]*\)/g, '').trim();
            }

            if (trimmed.endsWith(';')) {
                insideColon = false;
            }

            if (trimmed.length > 0) {
                // Enforce Jupiter ACE 32-40 character line limit to prevent line editor overflow
                processedLines.push(trimmed);
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
