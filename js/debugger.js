/**
 * Jupiter ACE In-Browser Debugger & Diagnostics HUD
 * 
 * Provides deep introspection into:
 * - Z80 CPU registers & flags
 * - Forth System Variables (BASE, FRAMES, STKBOT, DICT, ERR_NO)
 * - Forth dictionary linked list
 * - Memory Hex Viewer & Disassembler
 * - Execution stepping (Instruction / Frame)
 */

export class AceDebugger {
    constructor(emulator) {
        this.emu = emulator;
        this.visible = false;
        this.hexAddress = 0x3c00; // Start at system variables by default

        this.aceErrorDescriptions = {
            1: 'Memory full (Out of RAM)',
            2: 'Data stack underflow',
            3: 'Data stack overflow / type error',
            4: 'Compiling word in interpret mode (e.g. top-level comment or IF/THEN outside :)',
            5: 'Redefining an existing word (Use REDEFINE instead)',
            6: 'Variable not found',
            7: 'Control structure mismatch (unpaired IF/THEN or DO/LOOP)',
            8: 'Tape I/O error',
            9: 'Line editor buffer full (>64 chars)',
            255: 'No error (OK)'
        };
    }

    getSysVars() {
        const mem = this.emu.memory;
        const readWord = (addr) => mem.readByte(addr) | (mem.readByte(addr + 1) << 8);
        const readDWord = (addr) => readWord(addr) | (readWord(addr + 2) << 16);

        const base = mem.readByte(15423);
        const frames = readDWord(15403);
        const stkbot = readWord(15415);
        const dict = readWord(15417);
        const errNo = mem.readByte(15421);
        const flags = mem.readByte(15422);

        return {
            BASE: base,
            FRAMES: frames,
            STKBOT: stkbot,
            DICT: dict,
            ERR_NO: errNo,
            ERR_DESC: this.aceErrorDescriptions[errNo] || `Error ${errNo}`,
            FLAGS: flags
        };
    }

    /**
     * Reads the live Jupiter ACE Forth Data Stack directly from RAM
     * Data stack begins at STKBOT + 12 (15415 + 12), with top pointer at 15419 (0x3C3B)
     */
    getForthStack() {
        const mem = this.emu.memory;
        const read16 = (a) => mem.readByte(a) | (mem.readByte(a + 1) << 8);

        const stkbot = read16(15415); // STKBOT at 0x3C37
        const topPtr = read16(15419); // Data stack top pointer at 0x3C3B
        const stackBase = stkbot + 12; // Data stack items begin 12 bytes above STKBOT

        if (topPtr <= stackBase || topPtr > stackBase + 512) {
            return {
                items: [],
                depth: 0,
                tosPtr: topPtr,
                stkbot: stkbot
            };
        }

        const items = [];
        for (let addr = stackBase; addr < topPtr; addr += 2) {
            const uval = read16(addr);
            const sval = uval > 32767 ? uval - 65536 : uval;
            const hex = '0x' + uval.toString(16).padStart(4, '0').toUpperCase();
            let charRep = null;
            if (uval >= 32 && uval <= 126) {
                charRep = String.fromCharCode(uval);
            }
            items.push({
                addr,
                uval,
                sval,
                hex,
                charRep
            });
        }

        return {
            items,
            depth: items.length,
            tosPtr: topPtr,
            stkbot: stkbot
        };
    }

    getRegisters() {
        if (!this.emu.cpu || !this.emu.cpu.getState) return null;
        const s = this.emu.cpu.getState();
        const hex16 = (n) => (n & 0xffff).toString(16).padStart(4, '0').toUpperCase();
        const hex8 = (n) => (n & 0xff).toString(16).padStart(2, '0').toUpperCase();

        const f = s.flags;
        const flagStr = `${f.S ? 'S' : '-'}${f.Z ? 'Z' : '-'}${f.Y ? 'Y' : '-'}${f.H ? 'H' : '-'}${f.X ? 'X' : '-'}${f.P ? 'P' : '-'}${f.N ? 'N' : '-'}${f.C ? 'C' : '-'}`;

        return {
            PC: hex16(s.pc),
            SP: hex16(s.sp),
            AF: `${hex8(s.a)}${hex8((f.S << 7) | (f.Z << 6) | (f.Y << 5) | (f.H << 4) | (f.X << 3) | (f.P << 2) | (f.N << 1) | f.C)}`,
            BC: `${hex8(s.b)}${hex8(s.c)}`,
            DE: `${hex8(s.d)}${hex8(s.e)}`,
            HL: `${hex8(s.h)}${hex8(s.l)}`,
            IX: hex16(s.ix),
            IY: hex16(s.iy),
            Flags: flagStr,
            IFF1: s.iff1,
            IM: s.imode,
            Halted: s.halted
        };
    }

    getMemoryDump(startAddr, length = 128) {
        startAddr = Math.max(0, Math.min(startAddr, 65536 - length));
        const rows = [];
        for (let a = startAddr; a < startAddr + length; a += 16) {
            const hexAddr = a.toString(16).padStart(4, '0').toUpperCase();
            const bytes = [];
            let ascii = '';
            for (let i = 0; i < 16; i++) {
                const b = this.emu.memory.readByte(a + i);
                bytes.push(b.toString(16).padStart(2, '0').toUpperCase());
                ascii += (b >= 32 && b <= 126) ? String.fromCharCode(b) : '.';
            }
            rows.push({ addr: hexAddr, bytes: bytes.join(' '), ascii });
        }
        return rows;
    }

    /**
     * Walks the Forth dictionary linked list starting at DICT (15417 / 0x3C39)
     */
    inspectDictionary(maxWords = 30) {
        const mem = this.emu.memory;
        let dictPtr = mem.readByte(15417) | (mem.readByte(15418) << 8);
        const words = [];

        while (dictPtr > 0x3C40 && dictPtr < 0xFFFF && words.length < maxWords) {
            const lengthByte = mem.readByte(dictPtr);
            const nameLen = lengthByte & 0x3F;
            let name = '';
            for (let i = 0; i < nameLen; i++) {
                const c = mem.readByte(dictPtr + 1 + i) & 0x7F;
                name += String.fromCharCode(c);
            }

            const linkOffset = dictPtr + 1 + nameLen;
            const link = mem.readByte(linkOffset) | (mem.readByte(linkOffset + 1) << 8);

            words.push({
                name,
                addr: '0x' + dictPtr.toString(16).toUpperCase(),
                link: '0x' + link.toString(16).toUpperCase(),
                length: nameLen
            });

            if (link <= 0 || link >= dictPtr) break;
            dictPtr = link;
        }

        return words;
    }
}
