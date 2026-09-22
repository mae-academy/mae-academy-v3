/** 80x25 text-mode VRAM (BIOS INT 10h) with the standard CGA/EGA/VGA 16-color palette. */

export interface VideoCell {
  char: string;
  /** Foreground hex color (low nibble of attr). */
  fg: string;
  /** Background hex color (high nibble of attr). */
  bg: string;
  /** Raw 8-bit attribute byte. */
  attr: number;
}

export interface VideoState {
  cursorRow: number;
  cursorCol: number;
  cursorVisible: boolean;
  videoMode: number;
  grid: VideoCell[][];
  /** Mode 13h only: append-only pixel log shared between steps; draw entries [0, count). */
  graphics: GraphicsSnapshot | null;
}

export const GFX_WIDTH = 320;
export const GFX_HEIGHT = 200;
export const GRAPHICS_MODE = 0x13;

export interface GraphicsSnapshot {
  /** Each entry is `(y * 320 + x) * 256 + colorIndex`. */
  pixels: readonly number[];
  count: number;
}

export const VIDEO_ROWS = 25;
export const VIDEO_COLS = 80;
export const DEFAULT_ATTR = 0x07;

const VGA_PALETTE_16: readonly string[] = [
  "#000000",
  "#0000AA",
  "#00AA00",
  "#00AAAA",
  "#AA0000",
  "#AA00AA",
  "#AA5500",
  "#AAAAAA",
  "#555555",
  "#5555FF",
  "#55FF55",
  "#55FFFF",
  "#FF5555",
  "#FF55FF",
  "#FFFF55",
  "#FFFFFF",
];

export const VGA_PALETTE: readonly string[] = VGA_PALETTE_16;

/** Default VGA 256-color palette: 16 CGA, 16 grays, then 9 x 24-hue ramps, then 8 black. */
export const VGA_256_PALETTE: readonly string[] = (() => {
  const hex = (r: number, g: number, b: number) =>
    "#" +
    [r, g, b]
      .map(v => Math.round((v * 255) / 63).toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase();
  const palette: string[] = [...VGA_PALETTE_16];
  const grays = [0, 5, 8, 11, 14, 17, 20, 24, 28, 32, 36, 40, 45, 50, 56, 63];
  for (const g of grays) palette.push(hex(g, g, g));
  const groups: Array<[number, number]> = [
    [63, 0], [63, 31], [63, 45],
    [31, 0], [31, 15], [31, 22],
    [18, 0], [18, 9], [18, 13],
  ];
  for (const [hi, lo] of groups) {
    const at = (t: number) => Math.round(lo + ((hi - lo) * t) / 4);
    // Blue -> magenta -> red -> yellow -> green -> cyan -> back toward blue, 4 steps per leg.
    const legs: Array<[number, number, number]> = [];
    for (let t = 0; t < 4; t++) legs.push([at(t), lo, hi]);
    for (let t = 0; t < 4; t++) legs.push([hi, lo, at(4 - t)]);
    for (let t = 0; t < 4; t++) legs.push([hi, at(t), lo]);
    for (let t = 0; t < 4; t++) legs.push([at(4 - t), hi, lo]);
    for (let t = 0; t < 4; t++) legs.push([lo, hi, at(t)]);
    for (let t = 0; t < 4; t++) legs.push([lo, at(4 - t), hi]);
    for (const [r, g, b] of legs) palette.push(hex(r, g, b));
  }
  while (palette.length < 256) palette.push("#000000");
  return palette;
})();

const cellCache = new Map<string, VideoCell>();

export function makeCell(char: string, attr: number): VideoCell {
  const a = attr & 0xff;
  const key = `${char}|${a}`;
  let cell = cellCache.get(key);
  if (!cell) {
    cell = {
      char,
      fg: VGA_PALETTE[a & 0x0f],
      bg: VGA_PALETTE[(a >> 4) & 0x0f],
      attr: a,
    };
    cellCache.set(key, cell);
  }
  return cell;
}

const clamp = (value: number, max: number) => Math.min(Math.max(value, 0), max);

/**
 * Cells and rows are immutable: every write replaces a row, so snapshot() is a cheap
 * 25-element copy that trace steps can retain without cloning 2000 cells per step.
 */
export class VideoMemory {
  cursorRow = 0;
  cursorCol = 0;
  cursorVisible = true;
  videoMode = 3;
  private grid: VideoCell[][] = VideoMemory.blankGrid(DEFAULT_ATTR);
  private cached: VideoState | null = null;
  private framebuffer = new Uint8Array(GFX_WIDTH * GFX_HEIGHT);
  private pixelLog: number[] = [];

  private static blankGrid(attr: number): VideoCell[][] {
    return Array.from({ length: VIDEO_ROWS }, () =>
      new Array<VideoCell>(VIDEO_COLS).fill(makeCell(" ", attr))
    );
  }

  reset(mode: number): void {
    this.videoMode = mode;
    // A mode set always clears the screen; a fresh log detaches earlier snapshots from it.
    this.framebuffer = new Uint8Array(GFX_WIDTH * GFX_HEIGHT);
    this.pixelLog = [];
    this.grid = VideoMemory.blankGrid(DEFAULT_ATTR);
    this.cursorRow = 0;
    this.cursorCol = 0;
    this.cached = null;
  }

  setCursor(row: number, col: number): void {
    this.cursorRow = clamp(row, VIDEO_ROWS - 1);
    this.cursorCol = clamp(col, VIDEO_COLS - 1);
    this.cached = null;
  }

  /** INT 10h AH=0Ch: plot one pixel; only meaningful in mode 13h. */
  plotPixel(x: number, y: number, color: number): void {
    if (this.videoMode !== GRAPHICS_MODE) return;
    if (x < 0 || x >= GFX_WIDTH || y < 0 || y >= GFX_HEIGHT) return;
    const offset = y * GFX_WIDTH + x;
    this.framebuffer[offset] = color & 0xff;
    this.pixelLog.push(offset * 256 + (color & 0xff));
    this.cached = null;
  }

  readPixel(x: number, y: number): number {
    if (x < 0 || x >= GFX_WIDTH || y < 0 || y >= GFX_HEIGHT) return 0;
    return this.framebuffer[y * GFX_WIDTH + x];
  }

  cellAt(row: number, col: number): VideoCell {
    return this.grid[clamp(row, VIDEO_ROWS - 1)][clamp(col, VIDEO_COLS - 1)];
  }

  /** Writes a cell without moving the cursor (INT 10h AH=09h semantics). */
  putCell(row: number, col: number, char: string, attr: number): void {
    if (row < 0 || row >= VIDEO_ROWS || col < 0 || col >= VIDEO_COLS) return;
    const line = this.grid[row].slice();
    line[col] = makeCell(char, attr);
    this.grid[row] = line;
    this.cached = null;
  }

  /** Teletype output: control characters, wrap at column 80, scroll at row 25. */
  teletype(char: string, attr?: number): void {
    const code = char.charCodeAt(0);
    if (code === 0x0d) {
      this.cursorCol = 0;
    } else if (code === 0x0a) {
      this.cursorRow++;
    } else if (code === 0x08) {
      this.cursorCol = Math.max(0, this.cursorCol - 1);
    } else if (code === 0x07) {
      // Bell: no visual effect.
    } else {
      const resolved =
        attr ?? this.cellAt(this.cursorRow, this.cursorCol).attr;
      this.putCell(this.cursorRow, this.cursorCol, char, resolved);
      this.cursorCol++;
      if (this.cursorCol >= VIDEO_COLS) {
        this.cursorCol = 0;
        this.cursorRow++;
      }
    }
    if (this.cursorRow >= VIDEO_ROWS) {
      const attrBlank = this.cellAt(VIDEO_ROWS - 1, 0).attr;
      this.scrollWindow(1, attrBlank, 0, 0, VIDEO_ROWS - 1, VIDEO_COLS - 1, "up");
      this.cursorRow = VIDEO_ROWS - 1;
    }
    this.cached = null;
  }

  /** INT 10h AH=06h/07h: scroll a window; lines === 0 (or >= height) blanks the whole window. */
  scrollWindow(
    lines: number,
    blankAttr: number,
    top: number,
    left: number,
    bottom: number,
    right: number,
    direction: "up" | "down"
  ): void {
    const t = clamp(top, VIDEO_ROWS - 1);
    const b = clamp(bottom, VIDEO_ROWS - 1);
    const l = clamp(left, VIDEO_COLS - 1);
    const r = clamp(right, VIDEO_COLS - 1);
    if (b < t || r < l) return;
    const height = b - t + 1;
    const blank = makeCell(" ", blankAttr);
    const clearing = lines === 0 || lines >= height;
    const source = this.grid;
    const next = this.grid.slice();

    for (let row = t; row <= b; row++) {
      const line = source[row].slice();
      let from: number | null = null;
      if (!clearing) from = direction === "up" ? row + lines : row - lines;
      for (let col = l; col <= r; col++) {
        line[col] =
          from !== null && from >= t && from <= b ? source[from][col] : blank;
      }
      next[row] = line;
    }
    this.grid = next;
    this.cached = null;
  }

  snapshot(): VideoState {
    if (!this.cached) {
      this.cached = {
        cursorRow: this.cursorRow,
        cursorCol: this.cursorCol,
        cursorVisible: this.cursorVisible,
        videoMode: this.videoMode,
        grid: this.grid.slice(),
        graphics:
          this.videoMode === GRAPHICS_MODE
            ? { pixels: this.pixelLog, count: this.pixelLog.length }
            : null,
      };
    }
    return this.cached;
  }
}
