import { describe, expect, it } from "vitest";
import { analyzeSketch, compileSketch } from "../../../../api/_lib/code/arduino/arduinoCompiler";
import { ArduinoRuntime, type HardwareSnapshot } from "./arduinoRuntime";
import { ARDUINO_EXAMPLES } from "./arduinoExamples";

function run(source: string, ms = 60): Promise<HardwareSnapshot> {
  const result = compileSketch(source);
  if (!result.ok) throw new Error(`L${result.error.line}: ${result.error.message}`);
  const errors: string[] = [];
  const rt = new ArduinoRuntime({ onSnapshot: () => undefined, onSerialOut: () => undefined, onError: m => errors.push(m) });
  rt.setSpeed("instant");
  rt.load(result.sketch);
  rt.start();
  return new Promise((resolve, reject) =>
    setTimeout(() => {
      rt.pause();
      const snap = rt.snapshot();
      rt.dispose();
      if (errors.length) reject(new Error(errors.join("; ")));
      else resolve(snap);
    }, ms),
  );
}

const HEAD = `#include <LiquidCrystal.h>
LiquidCrystal lcd(12, 11, 5, 4, 3, 2);
`;
const sketch = (setup: string, loop = "") => `${HEAD}void setup() {\n${setup}\n}\nvoid loop() {\n${loop}\n}\n`;
const pad = (s: string) => s.padEnd(16, " ");

describe("LiquidCrystal compiler", () => {
  it("accepts the spec's Hello World sketch", () => {
    const hello = ARDUINO_EXAMPLES.find(e => e.id === "lcd-hello");
    expect(hello).toBeDefined();
    expect(compileSketch(hello!.source).ok).toBe(true);
  });

  it("rejects the type when its header is not included", () => {
    const r = compileSketch("LiquidCrystal lcd(12, 11, 5, 4, 3, 2);\nvoid setup() {}\nvoid loop() {}");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toMatch(/does not name a type/);
  });

  it("reports a bad constructor arity and unknown LCD methods with a line number", () => {
    const arity = compileSketch("#include <LiquidCrystal.h>\nLiquidCrystal lcd(1, 2, 3);\nvoid setup() {}\nvoid loop() {}");
    expect(arity.ok).toBe(false);
    if (!arity.ok) expect(arity.error).toMatchObject({ line: 2 });
    const method = compileSketch(sketch("lcd.begin(16, 2);\nlcd.explode();"));
    expect(method.ok).toBe(false);
    if (!method.ok) expect(method.error.message).toMatch(/not supported by the LCD simulator/);
  });

  it("does not disturb sketches that never use an LCD", () => {
    for (const ex of ARDUINO_EXAMPLES) expect(compileSketch(ex.source).ok, ex.label).toBe(true);
    expect(analyzeSketch("void setup(){pinMode(9,OUTPUT);} void loop(){}")?.lcd).toBeUndefined();
  });
});

describe("LiquidCrystal runtime", () => {
  it("prints Hello, MAE! on row 0 and Arduino Studio on row 1", async () => {
    const snap = await run(sketch(`lcd.begin(16, 2);\nlcd.print("Hello, MAE!");\nlcd.setCursor(0, 1);\nlcd.print("Arduino Studio");`));
    expect(snap.lcd.enabled).toBe(true);
    expect(snap.lcd.backlight).toBe(true);
    expect(snap.lcd.rows).toEqual([pad("Hello, MAE!"), pad("Arduino Studio")]);
    expect(snap.lcd.cursor).toEqual({ row: 1, col: 14 });
    expect(snap.lcd.wiring).toEqual({ mode: "parallel", pins: [12, 11, 5, 4, 3, 2], address: 0 });
  });

  it("drives the interface pins as outputs after begin()", async () => {
    const snap = await run(sketch("lcd.begin(16, 2);"));
    for (const pin of [12, 11, 5, 4, 3, 2]) expect(snap.pins[pin].mode).toBe("OUTPUT");
    expect(snap.pins[7].mode).toBe("UNSET");
  });

  it("clear() blanks both rows and homes the cursor; home() keeps the text", async () => {
    const cleared = await run(sketch(`lcd.begin(16, 2);\nlcd.print("abc");\nlcd.setCursor(2, 1);\nlcd.print("xyz");\nlcd.clear();`));
    expect(cleared.lcd.rows).toEqual([pad(""), pad("")]);
    expect(cleared.lcd.cursor).toEqual({ row: 0, col: 0 });
    const homed = await run(sketch(`lcd.begin(16, 2);\nlcd.print("abc");\nlcd.home();`));
    expect(homed.lcd.rows[0]).toBe(pad("abc"));
    expect(homed.lcd.cursor).toEqual({ row: 0, col: 0 });
  });

  it("clamps setCursor and formats numbers like Print", async () => {
    const snap = await run(
      sketch(`lcd.begin(16, 2);\nlcd.setCursor(99, 9);\nlcd.print(42);\nlcd.setCursor(0, 0);\nlcd.print(3.14159);\nlcd.print(' ');\nlcd.print(255, HEX);\nlcd.print(' ');\nlcd.print(-7);\nlcd.print(true);\nlcd.write(65);`),
    );
    expect(snap.lcd.rows[0]).toBe(pad("3.14 FF -71A"));
    // column 39 is the last DDRAM cell; the second digit has nowhere to go and is dropped, not wrapped.
    expect(snap.lcd.rows[1]).toBe(pad(""));
  });

  it("keeps text past column 16 off-screen until the display is scrolled", async () => {
    const text = "0123456789ABCDEFGHIJ";
    const still = await run(sketch(`lcd.begin(16, 2);\nlcd.print("${text}");`));
    expect(still.lcd.rows[0]).toBe("0123456789ABCDEF");
    const left = await run(sketch(`lcd.begin(16, 2);\nlcd.print("${text}");\nlcd.scrollDisplayLeft();\nlcd.scrollDisplayLeft();`));
    expect(left.lcd.rows[0]).toBe("23456789ABCDEFGH");
    const back = await run(sketch(`lcd.begin(16, 2);\nlcd.print("${text}");\nlcd.scrollDisplayLeft();\nlcd.scrollDisplayRight();`));
    expect(back.lcd.rows[0]).toBe("0123456789ABCDEF");
  });

  it("tracks cursor, blink, display and backlight flags", async () => {
    const snap = await run(sketch(`lcd.begin(16, 2);\nlcd.cursor();\nlcd.blink();\nlcd.noDisplay();\nlcd.noBacklight();`));
    expect(snap.lcd).toMatchObject({ cursorVisible: true, blink: true, displayOn: false, backlight: false });
    const off = await run(sketch(`lcd.begin(16, 2);\nlcd.cursor();\nlcd.blink();\nlcd.noCursor();\nlcd.noBlink();\nlcd.display();`));
    expect(off.lcd).toMatchObject({ cursorVisible: false, blink: false, displayOn: true });
  });

  it("redraws a counter from loop() with delay()", async () => {
    const snap = await run(
      sketch(`lcd.begin(16, 2);\nlcd.print("Count:");`, `static long n = 0;\nlcd.setCursor(7, 0);\nlcd.print(n++);\ndelay(1000);`),
      80,
    );
    expect(snap.lcd.rows[0].startsWith("Count: ")).toBe(true);
    expect(Number(snap.lcd.rows[0].slice(7).trim())).toBeGreaterThan(5);
  });

  it("stores custom glyphs and writes them by code", async () => {
    const snap = await run(
      sketch(`byte heart[8] = {0, 10, 31, 31, 31, 14, 4, 0};\nlcd.begin(16, 2);\nlcd.createChar(0, heart);\nlcd.setCursor(1, 0);\nlcd.write(byte(0));`),
    );
    expect(snap.lcd.customChars[0]).toEqual([0, 10, 31, 31, 31, 14, 4, 0]);
    expect(snap.lcd.rows[0].charCodeAt(1)).toBe(0);
  });

  it("supports the I2C backpack API and keeps its backlight off until requested", async () => {
    const i2c = (body: string) => `#include <Wire.h>\n#include <LiquidCrystal_I2C.h>\nLiquidCrystal_I2C lcd(0x27, 16, 2);\nvoid setup() {\n${body}\n}\nvoid loop() {}\n`;
    const dark = await run(i2c(`Wire.begin();\nlcd.init();\nlcd.print("Hi");`));
    expect(dark.lcd.backlight).toBe(false);
    expect(dark.lcd.rows[0]).toBe(pad("Hi"));
    expect(dark.lcd.wiring).toEqual({ mode: "i2c", pins: [18, 19], address: 0x27 });
    const lit = await run(i2c(`lcd.init();\nlcd.backlight();\nlcd.setCursor(0, 1);\nlcd.print("lit");`));
    expect(lit.lcd.backlight).toBe(true);
    expect(lit.lcd.rows[1]).toBe(pad("lit"));
  });

  it("keeps the V0 contrast knob position across resets and clamps it", async () => {
    const result = compileSketch(sketch("lcd.begin(16, 2);"));
    if (!result.ok) throw new Error(result.error.message);
    const rt = new ArduinoRuntime({ onSnapshot: () => undefined, onSerialOut: () => undefined, onError: () => undefined });
    expect(rt.snapshot().lcd.contrast).toBe(0.5);
    rt.setLcdContrast(0.8);
    rt.load(result.sketch);
    rt.reset();
    expect(rt.snapshot().lcd.contrast).toBe(0.8);
    rt.setLcdContrast(7);
    expect(rt.snapshot().lcd.contrast).toBe(1);
    rt.dispose();
  });

  it("resets the LCD with the board", async () => {
    const result = compileSketch(sketch(`lcd.begin(16, 2);\nlcd.print("x");`));
    if (!result.ok) throw new Error(result.error.message);
    const rt = new ArduinoRuntime({ onSnapshot: () => undefined, onSerialOut: () => undefined, onError: () => undefined });
    rt.setSpeed("instant");
    rt.load(result.sketch);
    rt.start();
    await new Promise(r => setTimeout(r, 30));
    rt.reset();
    const snap = rt.snapshot();
    rt.dispose();
    expect(snap.lcd.enabled).toBe(false);
    expect(snap.lcd.rows).toEqual([pad(""), pad("")]);
    expect(snap.lcd.wiring).toBeNull();
  });
});

describe("LiquidCrystal pin analysis", () => {
  it("resolves constructor pins through const ints", () => {
    const usage = analyzeSketch(`#include <LiquidCrystal.h>
const int rs = 7, en = 8, d4 = 9, d5 = 10, d6 = 11, d7 = 12;
LiquidCrystal lcd(rs, en, d4, d5, d6, d7);
void setup() { lcd.begin(16, 2); }
void loop() {}`);
    expect(usage?.lcd).toEqual({ mode: "parallel", pins: [7, 8, 9, 10, 11, 12], address: 0 });
  });

  it("understands the RW and I2C constructor forms", () => {
    expect(analyzeSketch("#include <LiquidCrystal.h>\nLiquidCrystal lcd(12, 10, 11, 5, 4, 3, 2);\nvoid setup(){}\nvoid loop(){}")?.lcd?.pins).toEqual([12, 11, 5, 4, 3, 2]);
    expect(analyzeSketch("#include <LiquidCrystal_I2C.h>\nLiquidCrystal_I2C lcd(0x3F, 16, 2);\nvoid setup(){}\nvoid loop(){}")?.lcd).toEqual({ mode: "i2c", pins: [18, 19], address: 0x3f });
  });

  it("falls back to the standard wiring when a pin is not a constant", () => {
    const usage = analyzeSketch(`#include <LiquidCrystal.h>
int rs = analogRead(A0);
LiquidCrystal lcd(rs, 11, 5, 4, 3, 2);
void setup(){}
void loop(){}`);
    expect(usage?.lcd?.pins).toEqual([12, 11, 5, 4, 3, 2]);
  });
});
