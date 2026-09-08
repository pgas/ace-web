/**
 * Jupiter ACE Tape Subsystem (.TAP format)
 * 
 * Supports reading and writing standard Jupiter ACE cassette tape images.
 * Integrates with custom Z80 traps:
 * - ED FC : tape_load_p
 * - ED FD : tape_save_p
 */

export class AceTape {
    constructor(memory) {
        this.memory = memory;
        this.tapeData = null;       // Uint8Array of current .TAP
        this.tapePos = 0;
        this.filename = '';
        this.loadHeader = true;
        this.saveHeader = true;
        this.onStatusChange = null; // Callback for UI messages
    }

    notify(message, type = 'info') {
        if (this.onStatusChange) {
            this.onStatusChange({
                filename: this.filename,
                pos: this.tapePos,
                total: this.tapeData ? this.tapeData.length : 0,
                message,
                type
            });
        }
    }

    attach(filename, arrayBuffer) {
        this.filename = filename;
        this.tapeData = new Uint8Array(arrayBuffer);
        this.tapePos = 0;
        this.loadHeader = true;
        this.saveHeader = true;
        this.notify(`Attached tape "${filename}" (${this.tapeData.length} bytes)`);
    }

    detach() {
        this.filename = '';
        this.tapeData = null;
        this.tapePos = 0;
        this.loadHeader = true;
        this.saveHeader = true;
        this.notify('Tape detached');
    }

    rewind() {
        this.tapePos = 0;
        this.loadHeader = true;
        this.saveHeader = true;
        this.notify('Tape rewound to start');
    }

    isEof() {
        return !this.tapeData || this.tapePos >= this.tapeData.length;
    }

    extractString(bytes, offset, maxLen = 10) {
        let str = '';
        for (let i = 0; i < maxLen; i++) {
            const b = bytes[offset + i];
            if (b >= 33 && b <= 126) {
                str += String.fromCharCode(b);
            }
        }
        return str.trim();
    }

    /**
     * Trap 0xED 0xFC: Fast Tape Load
     * @param {number} destAddr Destination in Ace memory
     * @param {number} reqLen Requested length of bytes
     * @param {number} flagByte Block flag
     * @returns {boolean} True if load succeeded, false on error or EOF
     */
    tapeLoad(destAddr, reqLen, flagByte) {
        if (!this.tapeData) {
            this.notify('No tape attached. Please drag & drop a .tap file.', 'error');
            return false;
        }

        if (this.isEof()) {
            this.notify('End of tape reached. Rewinding.', 'info');
            this.rewind();
            return false;
        }

        if (this.loadHeader) {
            // Read requested filename from Ace PAD workspace (9985 + 1 = 9986 / 0x2702)
            const requestedRaw = this.extractString(this.memory.mem, 9986, 10);
            const reqNorm = requestedRaw.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
            this.notify(`Searching for file: "${requestedRaw || '*'}"`);

            // Read block length (2 bytes little-endian)
            if (this.tapePos + 2 > this.tapeData.length) return false;
            const blockLen = this.tapeData[this.tapePos] | (this.tapeData[this.tapePos + 1] << 8);
            this.tapePos += 2;

            const dataLen = blockLen - 1; // Last byte is checksum
            const toRead = Math.min(dataLen, reqLen);

            // Copy header into memory (byte by byte through writeByte to handle mirroring)
            for (let i = 0; i < toRead; i++) {
                this.memory.writeByte(destAddr + i, this.tapeData[this.tapePos + i]);
            }

            // Extract found filename from header (starts at destAddr + 1)
            const foundRaw = this.extractString(this.memory.mem, destAddr + 1, 10);
            const foundNorm = foundRaw.replace(/[^A-Za-z0-9]/g, '').toUpperCase();

            this.tapePos += dataLen;
            this.tapePos++; // Skip checksum

            // Case-insensitive & punctuation-insensitive matching (e.g. 'tut-tut' matches 'TUTTUT')
            const matches = (!reqNorm) || (reqNorm === foundNorm) || (foundNorm.indexOf(reqNorm) !== -1) || (reqNorm.indexOf(foundNorm) !== -1);

            if (!matches) {
                this.notify(`Skipping non-matching file: "${foundRaw}"`);
                // Skip following data block on tape
                if (this.tapePos + 2 <= this.tapeData.length) {
                    const dataBlockLen = this.tapeData[this.tapePos] | (this.tapeData[this.tapePos + 1] << 8);
                    this.tapePos += 2 + dataBlockLen;
                }
                return true; // Return true so Ace ROM continues scanning without tape error
            }

            // Sync requested name in sysvar buffer (0x2302) with found header name (destAddr + 1)
            // so the Ace ROM's strict byte-by-byte compare at 0x1AAA succeeds regardless of user typing!
            for (let i = 0; i < 10; i++) {
                this.memory.writeByte(0x2302 + i, this.memory.readByte(destAddr + 1 + i));
            }

            this.notify(`Found file: "${foundRaw}"`);
            this.loadHeader = false;
            return true;
        } else {
            // Reading data block for matched file
            if (this.tapePos + 2 > this.tapeData.length) return false;
            const blockLen = this.tapeData[this.tapePos] | (this.tapeData[this.tapePos + 1] << 8);
            this.tapePos += 2;

            const dataLen = blockLen - 1;
            const toRead = Math.min(dataLen, reqLen);

            for (let i = 0; i < toRead; i++) {
                this.memory.writeByte(destAddr + i, this.tapeData[this.tapePos + i]);
            }

            this.tapePos += dataLen;
            this.tapePos++; // Skip checksum

            this.notify(`Load complete (${toRead} bytes into 0x${destAddr.toString(16).toUpperCase()})`, 'success');
            this.loadHeader = true;
            return true;
        }
    }

    /**
     * Trap 0xED 0xFD: Fast Tape Save
     * @param {number} srcAddr Source memory address
     * @param {number} blockLen Length of block
     */
    tapeSave(srcAddr, blockLen) {
        // Build block: [length: 2 bytes] [payload] [checksum: 1 byte]
        const block = new Uint8Array(2 + blockLen + 1);
        const totalLen = blockLen + 1;
        block[0] = totalLen & 0xff;
        block[1] = (totalLen >> 8) & 0xff;

        let checksum = 0;
        for (let i = 0; i < blockLen; i++) {
            const byte = this.memory.readByte(srcAddr + i);
            block[2 + i] = byte;
            checksum ^= byte;
        }
        block[2 + blockLen] = checksum;

        // Append to current tape data
        if (!this.tapeData) {
            this.tapeData = block;
            this.tapePos = block.length;
            this.filename = 'export.tap';
        } else {
            const combined = new Uint8Array(this.tapeData.length + block.length);
            combined.set(this.tapeData, 0);
            combined.set(block, this.tapeData.length);
            this.tapeData = combined;
            this.tapePos = combined.length;
        }

        this.notify(`Saved block (${blockLen} bytes)`, 'success');
    }

    exportBlob() {
        if (!this.tapeData) return null;
        return new Blob([this.tapeData], { type: 'application/octet-stream' });
    }
}
