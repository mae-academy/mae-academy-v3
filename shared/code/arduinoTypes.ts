export interface Diagnostic {
  line: number;
  message: string;
}

export interface SketchInstance {
  /** Generator that runs setup() once, then loop() forever, yielding scheduler requests. */
  main: () => Iterator<unknown, void, unknown>;
}
export interface CompiledSketch {
  js: string;
  instantiate: (rt: unknown, helpers: unknown) => SketchInstance;
}
export type CompileResult = { ok: true; sketch: CompiledSketch } | { ok: false; error: Diagnostic };

/** HD44780 16x2 LCD wiring resolved from the sketch's constructor (`LiquidCrystal` or `LiquidCrystal_I2C`). */
export interface LcdWiring {
  mode: "parallel" | "i2c";
  /** Parallel: [RS, E, D4, D5, D6, D7] Arduino pin numbers. I2C: [SDA, SCL] (always A4, A5 on the UNO). */
  pins: number[];
  /** I2C backpack address (e.g. 0x27); 0 for parallel wiring. */
  address: number;
}

/** Live state of the virtual HD44780 16x2 character LCD. */
export interface LcdState {
  /** True once `lcd.begin()` / `lcd.init()` has run. */
  enabled: boolean;
  backlight: boolean;
  /** `display()` / `noDisplay()`: false blanks the glass without touching DDRAM. */
  displayOn: boolean;
  /** Visible 16-character window of each row (after any display shift), padded with spaces. */
  rows: [string, string];
  /** Cursor position within the visible window; `col` is -1 when the cursor is scrolled out of view. */
  cursor: { row: number; col: number };
  cursorVisible: boolean;
  blink: boolean;
  /** V0 contrast trimmer position, 0..1 (about 0.5 is the readable sweet spot). */
  contrast: number;
  /** Custom glyphs (CGRAM) keyed by code 0-7; each is 8 rows of 5 bits. */
  customChars: Record<number, number[]>;
  /** Present once a LiquidCrystal object has been constructed. */
  wiring: LcdWiring | null;
}

export interface PinUsage {
  /** Digital pins (0-13) read as inputs. */
  digitalInputs: number[];
  /** Subset of digitalInputs configured with INPUT_PULLUP. */
  pullups: number[];
  /** Analog channels (0-5) read via analogRead(). */
  analogInputs: number[];
  /** Digital pins (0-13) driven as outputs. */
  outputs: number[];
  /** Set when the sketch constructs a LiquidCrystal / LiquidCrystal_I2C object. */
  lcd?: LcdWiring;
}
