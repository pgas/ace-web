/**
 * Jupiter ACE Memory Subsystem
 * 
 * Handles 64KB address space with Jupiter ACE hardware mirroring:
 * - 0x0000 - 0x1FFF : 8KB ROM (read-only)
 * - 0x2000 - 0x23FF : Video RAM Front Door (mirrors 0x2400-0x27FF)
 * - 0x2400 - 0x26FF : Video RAM Back Door (screen buffer, 32x24 chars)
 * - 0x2700          : RAM Byte 0 marker
 * - 0x2701 - 0x27FF : Pad workspace
 * - 0x2800 - 0x2BFF : Charset RAM Front Door (mirrors 0x2C00-0x2FFF)
 * - 0x2C00 - 0x2FFF : User Character Set RAM (128 chars x 8 bytes)
 * - 0x3000 - 0x3FFF : 4-way mirrored region (mirrored at +0x000, +0x400, +0x800, +0xC00)
 * - 0x4000 - 0xFFFF : RAM expansion (16KB, 32KB, 48KB)
 */

export class AceMemory {
    constructor() {
        this.mem = new Uint8Array(65536);
        // memattr: 8 banks of 8KB (0: read-only ROM, 1: read/write RAM)
        this.memattr = [0, 1, 1, 1, 1, 1, 1, 1];
        this.ramSizeKb = 19; // Default 19KB (3KB internal + 16KB expansion)
        this.setRamSize(19);
        this.reset();
    }

    setRamSize(kb) {
        this.ramSizeKb = kb;
        // Page 0: always ROM (0)
        // Page 1: always 3KB internal RAM (1)
        // Page 2-3 (0x4000-0x7FFF): 16KB expansion
        // Page 4-7 (0x8000-0xFFFF): 32KB additional expansion
        if (kb <= 3) {
            // Unexpanded (3KB RAM)
            this.memattr = [0, 1, 0, 0, 0, 0, 0, 0];
        } else if (kb <= 19) {
            // 3KB + 16KB expansion (0x4000 - 0x7FFF)
            this.memattr = [0, 1, 1, 1, 0, 0, 0, 0];
        } else if (kb <= 35) {
            // 3KB + 32KB expansion (0x4000 - 0xBFFF)
            this.memattr = [0, 1, 1, 1, 1, 1, 0, 0];
        } else {
            // Full 48KB+ expansion (up to 0xFFFF)
            this.memattr = [0, 1, 1, 1, 1, 1, 1, 1];
        }
    }

    loadRom(romBytes) {
        if (!romBytes || romBytes.length !== 8192) {
            throw new Error(`Invalid ROM size: expected 8192, got ${romBytes ? romBytes.length : 0}`);
        }
        this.mem.set(romBytes, 0);
        this.applyTapePatches();
    }

    applyTapePatches() {
        // Fast tape load patch at 0x18a7: ED FC C9 (custom Z80 opcode ED FC + RET)
        this.mem[0x18a7] = 0xed;
        this.mem[0x18a8] = 0xfc;
        this.mem[0x18a9] = 0xc9;

        // Fast tape save patch at 0x1820: ED FD C9 (custom Z80 opcode ED FD + RET)
        this.mem[0x1820] = 0xed;
        this.mem[0x1821] = 0xfd;
        this.mem[0x1822] = 0xc9;
    }

    reset() {
        // RAM area initialized to 0xFF as on hardware power-on
        this.mem.fill(0xff, 8192, 65536);
        this.applyTapePatches();
    }

    readByte(addr) {
        addr &= 0xffff;
        const page = addr >> 13;
        if (page > 0 && !this.memattr[page]) {
            return 0xff; // Floating bus / unmapped RAM
        }
        return this.mem[addr];
    }

    readWord(addr) {
        const lo = this.readByte(addr);
        const hi = this.readByte(addr + 1);
        return (hi << 8) | lo;
    }

    writeByte(addr, val) {
        addr &= 0xffff;
        val &= 0xff;
        const page = addr >> 13;
        if (!this.memattr[page]) {
            return; // ROM or unmapped RAM
        }

        this.mem[addr] = val;

        // Handle Jupiter Ace hardware mirroring
        if ((addr >= 0x2000 && addr <= 0x23ff) || (addr >= 0x2800 && addr <= 0x2bff)) {
            // Front door -> Back door (+0x400)
            this.mem[addr + 0x400] = val;
        } else if ((addr >= 0x2400 && addr <= 0x27ff) || (addr >= 0x2c00 && addr <= 0x2fff)) {
            // Back door -> Front door (-0x400)
            this.mem[addr - 0x400] = val;
        } else if (addr >= 0x3000 && addr <= 0x3fff) {
            // 4-way mirror in page 1: 0x3000-0x3FFF mirrors every 1KB
            const base = (addr & 0x03ff) + 0x3000;
            this.mem[base] = val;
            this.mem[base + 0x0400] = val;
            this.mem[base + 0x0800] = val;
            this.mem[base + 0x0c00] = val;
        }
    }

    writeWord(addr, val) {
        this.writeByte(addr, val & 0xff);
        this.writeByte(addr + 1, (val >> 8) & 0xff);
    }

    /**
     * Direct pointer / slice access for video display rendering
     */
    getVideoRam() {
        return this.mem.subarray(0x2400, 0x2400 + 768);
    }

    getCharRam() {
        return this.mem.subarray(0x2c00, 0x2c00 + 1024);
    }
}
