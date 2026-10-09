/**
 * Virtual HD44780 character LCD (16x2). Models the controller's 40-column DDRAM per line, the display shift register,
 * entry mode (direction / autoscroll) and CGRAM, so LiquidCrystal and LiquidCrystal_I2C sketches behave like hardware:
 * text printed past column 16 is kept off-screen until scrollDisplayLeft() brings it into view.
 */
import type { LcdState, LcdWiring } from "@shared/code/arduinoTypes";
import { toBase, toStr, type StrKind } from "./arduinoHelpers";

export type LcdBufferState = LcdState;

export const LCD_COLS = 16;
export const LCD_ROWS = 2;
/** DDRAM per line on a real HD44780 (addresses 0x00-0x27 and 0x40-0x67). */
const DDRAM_COLS = 40;
const BLANK_ROW = " ".repeat(LCD_COLS);

export const IDLE_LCD: LcdState = {
  enabled: false,
  backlight: false,
  displayOn: true,
  rows: [BLANK_ROW, BLANK_ROW],
  cursor: { row: 0, col: 0 },
  cursorVisible: false,
  blink: false,
  contrast: 0.5,
  customChars: {},
  wiring: null,
};

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, Math.trunc(Number.isFinite(v) ? v : lo)));

export class LcdController {
  private ddram: string[][] = LcdController.blankMemory();
  private wiring: LcdWiring | null = null;
  private enabled = false;
  private backlight = false;
  private displayOn = true;
  private cursorOn = false;
  private blinkOn = false;
  private shift = 0;
  private row = 0;
  private col = 0;
  private leftToRight = true;
  private autoscrollOn = false;
  private custom: Record<number, number[]> = {};
  /** The V0 trimmer is a physical knob: it survives sketch reloads and board resets. */
  private contrast = 0.5;

  private static blankMemory(): string[][] {
    return Array.from({ length: LCD_ROWS }, () => Array.from({ length: DDRAM_COLS }, () => " "));
  }

  reset(): void {
    this.ddram = LcdController.blankMemory();
    this.wiring = null;
    this.enabled = false;
    this.backlight = false;
    this.displayOn = true;
    this.cursorOn = false;
    this.blinkOn = false;
    this.shift = 0;
    this.row = 0;
    this.col = 0;
    this.leftToRight = true;
    this.autoscrollOn = false;
    this.custom = {};
  }

  // --- construction ------------------------------------------------------
  /** `kind` 'p' = LiquidCrystal(rs, [rw,] en, d...), 'i' = LiquidCrystal_I2C(addr, cols, rows). */
  init(kind: "p" | "i", args: number[]): void {
    if (kind === "i") {
      this.wiring = { mode: "i2c", pins: [18, 19], address: args[0] ?? 0x27 };
      // The PCF8574 backpack keeps the backlight transistor off until the sketch calls backlight().
      this.backlight = false;
    } else {
      const n = args.length;
      const en = n === 7 || n === 11 ? args[2] : args[1];
      this.wiring = { mode: "parallel", pins: [args[0], en, ...args.slice(-4)], address: 0 };
      // Backlight A/K is hard-wired to 5V/GND on the parallel module.
      this.backlight = true;
    }
  }

  /** Pins the controller drives: LiquidCrystal.begin() configures every interface line as an output. */
  get outputPins(): number[] {
    return this.wiring?.mode === "parallel" ? this.wiring.pins : [];
  }

  begin(cols: number, rows: number): void {
    void cols;
    void rows;
    this.enabled = true;
    this.displayOn = true;
    this.cursorOn = false;
    this.blinkOn = false;
    this.leftToRight = true;
    this.autoscrollOn = false;
    this.clear();
  }

  // --- commands ----------------------------------------------------------
  clear(): void {
    this.ddram = LcdController.blankMemory();
    this.shift = 0;
    this.row = 0;
    this.col = 0;
    this.leftToRight = true;
  }

  home(): void {
    this.row = 0;
    this.col = 0;
    this.shift = 0;
  }

  setCursor(col: number, row: number): void {
    this.col = clamp(col, 0, DDRAM_COLS - 1);
    this.row = clamp(row, 0, LCD_ROWS - 1);
  }

  setCursorVisible(on: boolean): void {
    this.cursorOn = on;
  }

  setBlink(on: boolean): void {
    this.blinkOn = on;
  }

  setDisplay(on: boolean): void {
    this.displayOn = on;
  }

  setContrast(value: number): void {
    this.contrast = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0.5));
  }

  setBacklight(on: boolean): void {
    this.backlight = on;
  }

  /** dir -1 = scrollDisplayLeft (text moves left), +1 = scrollDisplayRight. */
  scroll(dir: number): void {
    this.shift = (((this.shift - Math.sign(dir)) % DDRAM_COLS) + DDRAM_COLS) % DDRAM_COLS;
  }

  setAutoscroll(on: boolean): void {
    this.autoscrollOn = on;
  }

  setDirection(leftToRight: boolean): void {
    this.leftToRight = leftToRight;
  }

  createChar(slot: number, rows: number[]): void {
    if (!Array.isArray(rows)) return;
    this.custom = { ...this.custom, [clamp(slot, 0, 7) & 7]: Array.from({ length: 8 }, (_, i) => (rows[i] ?? 0) & 31) };
  }

  // --- data --------------------------------------------------------------
  write(code: number): number {
    const ch = String.fromCharCode(Math.trunc(code) & 255);
    // The address counter walks 0x00-0x27 within a line; anything beyond the 40th column is not backed by DDRAM.
    if (this.col >= 0 && this.col < DDRAM_COLS) this.ddram[this.row][this.col] = ch;
    if (this.autoscrollOn) {
      // Entry mode with display shift: the cursor stays put on the glass and the text moves.
      this.shift = (((this.shift + (this.leftToRight ? 1 : -1)) % DDRAM_COLS) + DDRAM_COLS) % DDRAM_COLS;
    }
    this.col += this.leftToRight ? 1 : -1;
    return 1;
  }

  print(v: unknown, kind: StrKind, fmt: number): number {
    let text: string;
    if (kind === "f") text = toStr(v, "f", fmt > 0 ? fmt : 2);
    else if (kind === "i" && fmt > 1) text = toBase(Number(v), fmt);
    else text = toStr(v, kind);
    for (let i = 0; i < text.length; i++) this.write(text.charCodeAt(i));
    return text.length;
  }

  // --- snapshot ----------------------------------------------------------
  snapshot(): LcdState {
    const rows = this.ddram.map(line => {
      let out = "";
      for (let c = 0; c < LCD_COLS; c++) out += line[(c + this.shift) % DDRAM_COLS];
      return out;
    }) as [string, string];
    const inMemory = this.col >= 0 && this.col < DDRAM_COLS;
    const visibleCol = (((this.col - this.shift) % DDRAM_COLS) + DDRAM_COLS) % DDRAM_COLS;
    return {
      enabled: this.enabled,
      backlight: this.backlight,
      displayOn: this.displayOn,
      rows,
      cursor: { row: this.row, col: inMemory && visibleCol < LCD_COLS ? visibleCol : -1 },
      cursorVisible: this.cursorOn,
      blink: this.blinkOn,
      contrast: this.contrast,
      customChars: this.custom,
      wiring: this.wiring,
    };
  }
}
