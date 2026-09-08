/**
 * Jupiter ACE Video & Canvas Display Subsystem
 * 
 * Screen dimensions:
 * - 32 columns x 24 rows = 768 characters
 * - 256 x 192 pixels native resolution (8x8 pixel font)
 * - Video RAM: 0x2400 - 0x26FF (768 bytes)
 * - Character Generator RAM: 0x2C00 - 0x2FFF (128 characters x 8 bytes)
 * - Character byte bit 7 (0x80): Inverted video
 * - Character byte bits 0-6 (0x7F): Character index (0-127)
 */

export class AceVideo {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
        
        this.cols = 32;
        this.rows = 24;
        this.width = 256;
        this.height = 192;

        // Native 256x192 canvas buffer
        this.offscreenCanvas = document.createElement('canvas');
        this.offscreenCanvas.width = this.width;
        this.offscreenCanvas.height = this.height;
        this.offscreenCtx = this.offscreenCanvas.getContext('2d');

        this.imageData = this.offscreenCtx.createImageData(this.width, this.height);
        this.pixels = new Uint32Array(this.imageData.data.buffer);

        // Colors (RGBA little-endian Uint32 format: 0xAABBGGRR)
        // Solid white background and crisp black ink as requested
        this.colBlack = 0xff000000;  // Pure solid black ink
        this.colWhite = 0xffffffff;  // Pure solid white background
        this.colSelect = 0xffd06030; // Selection highlight

        // Fill initial pixel buffer with solid white
        this.pixels.fill(this.colWhite);
        this.offscreenCtx.putImageData(this.imageData, 0, 0);
        this.ctx.fillStyle = '#ffffff';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Previous VRAM snapshot: initialize with -1 so all cells render on frame 0
        this.vramOld = new Int16Array(this.cols * this.rows);
        this.vramOld.fill(-1);

        // Text selection state
        this.selecting = false;
        this.selStart = null; // { col, row }
        this.selEnd = null;   // { col, row }

        this.setupSelectionListeners();
    }

    setColors(blackHex = '#000000', whiteHex = '#ffffff') {
        // Helper to convert hex to 0xAABBGGRR
        const parse = (hex) => {
            const c = parseInt(hex.replace('#', ''), 16);
            const r = (c >> 16) & 0xff;
            const g = (c >> 8) & 0xff;
            const b = c & 0xff;
            return (0xff << 24) | (b << 16) | (g << 8) | r;
        };
        this.colBlack = parse(blackHex);
        this.colWhite = parse(whiteHex);
        this.vramOld.fill(-1); // Force redraw
    }

    setupSelectionListeners() {
        const getCell = (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width - 1));
            const y = Math.max(0, Math.min(e.clientY - rect.top, rect.height - 1));
            const col = Math.floor((x / rect.width) * this.cols);
            const row = Math.floor((y / rect.height) * this.rows);
            return { col, row };
        };

        let mouseDownPos = null;
        let startCell = null;
        let isDragging = false;

        this.canvas.addEventListener('mousedown', (e) => {
            if (e.button === 0) {
                mouseDownPos = { x: e.clientX, y: e.clientY };
                startCell = getCell(e);
                isDragging = false;
            }
        });

        window.addEventListener('mousemove', (e) => {
            if (!mouseDownPos) return;
            if ((e.buttons & 1) === 0) {
                mouseDownPos = null;
                isDragging = false;
                return;
            }

            const dx = e.clientX - mouseDownPos.x;
            const dy = e.clientY - mouseDownPos.y;
            if (!isDragging && Math.hypot(dx, dy) >= 4) {
                isDragging = true;
                this.selecting = true;
                this.selStart = startCell;
            }

            if (isDragging) {
                this.selEnd = getCell(e);
                this.vramOld.fill(-1);
            }
        });

        window.addEventListener('mouseup', (e) => {
            if (e.button === 0 && mouseDownPos) {
                if (!isDragging) {
                    // Clicking without dragging removes selection
                    this.clearSelection();
                } else {
                    this.selEnd = getCell(e);
                    if (this.selStart && this.selEnd &&
                        this.selStart.col === this.selEnd.col &&
                        this.selStart.row === this.selEnd.row) {
                        this.clearSelection();
                    } else {
                        this.vramOld.fill(-1);
                    }
                }
                mouseDownPos = null;
                isDragging = false;
                this.selecting = false;
            }
        });
    }

    clearSelection() {
        this.selStart = null;
        this.selEnd = null;
        this.vramOld.fill(-1);
    }

    isCellSelected(col, row) {
        if (!this.selStart || !this.selEnd) return false;
        const idx = row * this.cols + col;
        const startIdx = this.selStart.row * this.cols + this.selStart.col;
        const endIdx = this.selEnd.row * this.cols + this.selEnd.col;
        const min = Math.min(startIdx, endIdx);
        const max = Math.max(startIdx, endIdx);
        return idx >= min && idx <= max;
    }

    getSelectedText(vram) {
        if (!this.selStart || !this.selEnd) return '';
        const startIdx = this.selStart.row * this.cols + this.selStart.col;
        const endIdx = this.selEnd.row * this.cols + this.selEnd.col;
        const min = Math.min(startIdx, endIdx);
        const max = Math.max(startIdx, endIdx);

        let result = '';
        for (let i = min; i <= max; i++) {
            const c = vram[i] & 0x7f;
            // Standard ASCII mapping for Jupiter Ace chars 32..126
            const ch = (c >= 32 && c <= 126) ? String.fromCharCode(c) : ' ';
            result += ch;
            if (i % this.cols === (this.cols - 1)) {
                result += '\n';
            }
        }
        return result.trimEnd();
    }

    render(vram, charRam, forceRefresh = false) {
        let dirty = forceRefresh;

        for (let r = 0; r < this.rows; r++) {
            for (let c = 0; c < this.cols; c++) {
                const idx = r * this.cols + c;
                const charByte = vram[idx];
                const selected = this.isCellSelected(c, r);

                if (!dirty && this.vramOld[idx] === charByte && !this.selecting) {
                    continue;
                }

                dirty = true;
                this.vramOld[idx] = charByte;

                let inv = (charByte & 0x80) !== 0;
                if (selected) inv = !inv;
                const charCode = charByte & 0x7f;
                const charOffset = charCode * 8;

                // Render 8x8 bitmap
                const pxBaseX = c * 8;
                const pxBaseY = r * 8;

                for (let py = 0; py < 8; py++) {
                    let pattern = charRam[charOffset + py];
                    if (inv) pattern ^= 0xff;

                    const rowOffset = (pxBaseY + py) * this.width + pxBaseX;
                    for (let px = 0; px < 8; px++) {
                        const bit = (pattern & (0x80 >> px)) !== 0;
                        this.pixels[rowOffset + px] = bit ? this.colBlack : this.colWhite;
                    }
                }
            }
        }

        if (dirty) {
            this.offscreenCtx.putImageData(this.imageData, 0, 0);
            this.ctx.imageSmoothingEnabled = false;
            this.ctx.drawImage(this.offscreenCanvas, 0, 0, this.canvas.width, this.canvas.height);
        }
    }
}
