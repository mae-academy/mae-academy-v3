/**
 * Non-blocking Arduino UNO runtime: virtual pin bank, serial port, and a cooperative scheduler.
 * Compiled sketches are generators; delay() yields a sleep request instead of blocking the browser thread.
 */
import { ArduinoRuntimeError, helpers, toBase, toStr, type StrKind } from "./arduinoHelpers";
import type { CompiledSketch, LcdState } from "@shared/code/arduinoTypes";
import { LcdController } from "./arduinoLcd";

export type ArduinoSpeed = 0.5 | 1 | 2 | "instant";
export type RunStatus = "idle" | "running" | "paused" | "error";
export type PinMode = "UNSET" | "INPUT" | "OUTPUT" | "INPUT_PULLUP";

export const PIN_COUNT = 20; // D0-D13 + A0-A5 (14-19)
export const PWM_PINS: readonly number[] = [3, 5, 6, 9, 10, 11];
export const ANALOG_BASE = 14;

export interface PinSnapshot {
  mode: PinMode;
  level: 0 | 1;
  /** 0-255 duty cycle when the last write was analogWrite(), otherwise null. */
  pwm: number | null;
}

export interface HardwareSnapshot {
  status: RunStatus;
  pins: PinSnapshot[];
  /** Digital pins (0-13) that have been read or configured as inputs by the sketch. */
  digitalInputs: number[];
  /** Analog channels (0-5) the sketch has read via analogRead(). */
  analogInputs: number[];
  inputLevels: Record<number, 0 | 1>;
  analogValues: Record<number, number>;
  txCount: number;
  rxCount: number;
  baud: number | null;
  timeMs: number;
  lcd: LcdState;
}

export interface RuntimeHandlers {
  onSnapshot: (snapshot: HardwareSnapshot) => void;
  onSerialOut: (text: string, timeMs: number) => void;
  onError: (message: string) => void;
}

type Request = { kind: "sleep"; us: number } | { kind: "slice" };

const BUDGET = 20000;
const SLICE_MS = 8;
const POLL_COST_US = 40;

const newPin = (): PinSnapshot => ({ mode: "UNSET", level: 0, pwm: null });

const schedule = (fn: () => void): void => {
  if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => fn());
  else setTimeout(fn, 16);
};

export class ArduinoRuntime {
  /** Loop-iteration budget consumed by transpiled loops; exhausting it yields to the event loop. */
  b = BUDGET;

  private handlers: RuntimeHandlers;
  private status: RunStatus = "idle";
  private speed: ArduinoSpeed = 1;
  private pins: PinSnapshot[] = Array.from({ length: PIN_COUNT }, newPin);
  private digitalRegs = new Set<number>();
  private analogRegs = new Set<number>();
  private inputLevels = new Map<number, 0 | 1>();
  private touchedInputs = new Set<number>();
  private analogValues = new Map<number, number>();
  /** Echo pulse width (us) a mounted ranging sensor returns on each pin; survives Reset like the other stimuli. */
  private echoPulses = new Map<number, number>();
  private rx: number[] = [];
  private txCount = 0;
  private rxCount = 0;
  private baud: number | null = null;
  private seed = 1;
  private readonly lcd = new LcdController();

  private main: Iterator<Request, void, unknown> | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private clockBase = 0;
  private anchor = 0;
  private wakeAt: number | null = null;
  private dirty = false;
  private disposed = false;

  constructor(handlers: RuntimeHandlers) {
    this.handlers = handlers;
  }

  get currentStatus(): RunStatus {
    return this.status;
  }

  // --- lifecycle ---------------------------------------------------------
  load(sketch: CompiledSketch): void {
    this.halt();
    this.resetHardware();
    this.main = sketch.instantiate(this, helpers).main() as Iterator<Request, void, unknown>;
    this.clockBase = 0;
    this.wakeAt = null;
    this.setStatus("paused");
  }

  start(): void {
    if (this.status === "running" || !this.main) return;
    this.anchor = performance.now();
    this.setStatus("running");
    this.schedule(0);
  }

  pause(): void {
    if (this.status !== "running") return;
    this.clockBase = this.nowUs();
    this.clearTimer();
    this.setStatus("paused");
  }

  reset(): void {
    this.halt();
    this.resetHardware();
    this.setStatus("idle");
  }

  dispose(): void {
    this.disposed = true;
    this.halt();
  }

  setSpeed(speed: ArduinoSpeed): void {
    if (speed === this.speed) return;
    if (this.status === "running") {
      this.clockBase = this.nowUs();
      this.anchor = performance.now();
      this.speed = speed;
      this.clearTimer();
      this.schedule(0);
    } else this.speed = speed;
  }

  // --- external stimuli --------------------------------------------------
  setDigitalInput(pin: number, level: 0 | 1): void {
    this.inputLevels.set(pin, level);
    this.touchedInputs.add(pin);
    this.markDirty();
  }

  setAnalogInput(channel: number, value: number): void {
    this.analogValues.set(channel, Math.max(0, Math.min(1023, Math.round(value))));
    this.markDirty();
  }

  /** Sets the HIGH pulse width `pulseIn(pin, HIGH)` measures on `pin` (an HC-SR04 echo line); null removes the sensor. */
  setEchoPulse(pin: number, us: number | null): void {
    if (us === null) this.echoPulses.delete(pin);
    else this.echoPulses.set(pin, Math.max(0, Math.round(us)));
  }

  sendSerial(text: string): void {
    for (let i = 0; i < text.length; i++) this.rx.push(text.charCodeAt(i) & 255);
    if (text.length > 0) this.rxCount++;
    this.markDirty();
  }

  // --- scheduler ---------------------------------------------------------
  /** Sleep/yield requests are single-element arrays so transpiled code can `yield*` them without generator helpers. */
  slice(): Request[] {
    this.b = BUDGET;
    return [{ kind: "slice" }];
  }

  delay(ms: number): Request[] {
    return [{ kind: "sleep", us: ms * 1000 }];
  }

  delayUs(us: number): Request[] {
    return [{ kind: "sleep", us }];
  }

  private nowUs(): number {
    if (this.status === "running" && this.speed !== "instant") return this.clockBase + (performance.now() - this.anchor) * 1000 * this.speed;
    return this.clockBase;
  }

  private advanceTo(t: number): void {
    const n = this.nowUs();
    if (n < t) this.clockBase += t - n;
  }

  private schedule(ms: number): void {
    this.clearTimer();
    this.timer = setTimeout(this.pump, Math.max(0, ms));
  }

  private clearTimer(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  private halt(): void {
    this.clearTimer();
    this.main = null;
    this.wakeAt = null;
  }

  private readonly pump = (): void => {
    this.timer = null;
    if (this.status !== "running" || !this.main) return;
    const started = performance.now();
    try {
      if (this.wakeAt !== null) {
        const remaining = this.wakeAt - this.nowUs();
        if (remaining > 200 && this.speed !== "instant") {
          this.schedule(remaining / (1000 * (this.speed as number)));
          return;
        }
        this.advanceTo(this.wakeAt);
        this.wakeAt = null;
      }
      for (;;) {
        const step = this.main.next();
        if (step.done) {
          this.setStatus("idle");
          return;
        }
        const req = step.value;
        if (req.kind === "sleep") {
          const target = this.nowUs() + req.us;
          if (this.speed === "instant") this.advanceTo(target);
          else {
            this.wakeAt = target;
            this.schedule(req.us / (1000 * this.speed));
            this.markDirty();
            return;
          }
        } else if (this.speed !== "instant") {
          this.schedule(0);
          this.markDirty();
          return;
        }
        if (performance.now() - started > SLICE_MS) {
          this.schedule(0);
          this.markDirty();
          return;
        }
      }
    } catch (err) {
      this.clearTimer();
      this.main = null;
      this.setStatus("error");
      this.handlers.onError(err instanceof ArduinoRuntimeError || err instanceof Error ? err.message : String(err));
    }
  };

  // --- snapshot ----------------------------------------------------------
  private setStatus(status: RunStatus): void {
    this.status = status;
    this.markDirty();
  }

  private markDirty(): void {
    if (this.dirty || this.disposed) return;
    this.dirty = true;
    schedule(() => {
      this.dirty = false;
      if (!this.disposed) this.handlers.onSnapshot(this.snapshot());
    });
  }

  snapshot(): HardwareSnapshot {
    return {
      status: this.status,
      pins: this.pins.map(p => ({ ...p })),
      digitalInputs: Array.from(this.digitalRegs).sort((a, b) => a - b),
      analogInputs: Array.from(this.analogRegs).sort((a, b) => a - b),
      inputLevels: Object.fromEntries(this.inputLevels) as Record<number, 0 | 1>,
      analogValues: Object.fromEntries(this.analogValues),
      txCount: this.txCount,
      rxCount: this.rxCount,
      baud: this.baud,
      timeMs: Math.floor(this.nowUs() / 1000),
      lcd: this.lcd.snapshot(),
    };
  }

  private resetHardware(): void {
    this.pins = Array.from({ length: PIN_COUNT }, newPin);
    this.digitalRegs.clear();
    this.analogRegs.clear();
    this.rx = [];
    this.baud = null;
    this.b = BUDGET;
    this.clockBase = 0;
    this.seed = 1;
    this.lcd.reset();
    this.markDirty();
  }

  // --- Arduino API (called by transpiled code) ---------------------------
  private poll(): void {
    if (this.speed === "instant") this.clockBase += POLL_COST_US;
  }

  private pin(n: number): PinSnapshot | null {
    return Number.isInteger(n) && n >= 0 && n < PIN_COUNT ? this.pins[n] : null;
  }

  pinMode(n: number, mode: number): void {
    const p = this.pin(n);
    if (!p) return;
    p.mode = mode === 1 ? "OUTPUT" : mode === 2 ? "INPUT_PULLUP" : "INPUT";
    p.pwm = null;
    if (p.mode !== "OUTPUT") {
      if (n < ANALOG_BASE) this.digitalRegs.add(n);
      if (!this.touchedInputs.has(n)) this.inputLevels.set(n, p.mode === "INPUT_PULLUP" ? 1 : 0);
    } else p.level = 0;
    this.markDirty();
  }

  digitalWrite(n: number, value: number): void {
    const p = this.pin(n);
    if (!p) return;
    if (p.mode === "OUTPUT") {
      p.level = value ? 1 : 0;
      p.pwm = null;
    } else if (p.mode !== "UNSET") {
      // Writing to an input toggles the internal pull-up, as on real hardware.
      p.mode = value ? "INPUT_PULLUP" : "INPUT";
      if (!this.touchedInputs.has(n)) this.inputLevels.set(n, value ? 1 : 0);
    }
    this.markDirty();
  }

  digitalRead(n: number): number {
    this.poll();
    const p = this.pin(n);
    if (!p) return 0;
    if (p.mode === "OUTPUT") return p.level;
    if (n < ANALOG_BASE && !this.digitalRegs.has(n)) {
      this.digitalRegs.add(n);
      if (!this.inputLevels.has(n)) this.inputLevels.set(n, p.mode === "INPUT_PULLUP" ? 1 : 0);
      this.markDirty();
    }
    return this.inputLevels.get(n) ?? (p.mode === "INPUT_PULLUP" ? 1 : 0);
  }

  analogWrite(n: number, value: number): void {
    const p = this.pin(n);
    if (!p) return;
    const duty = Math.max(0, Math.min(255, Math.trunc(value)));
    if (p.mode === "UNSET" || p.mode === "INPUT") p.mode = "OUTPUT";
    if (PWM_PINS.includes(n)) {
      p.pwm = duty;
      p.level = duty >= 128 ? 1 : 0;
    } else {
      p.pwm = null;
      p.level = duty >= 128 ? 1 : 0;
    }
    this.markDirty();
  }

  analogRead(n: number): number {
    this.poll();
    const ch = n >= ANALOG_BASE ? n - ANALOG_BASE : n;
    if (ch < 0 || ch > 5) return 0;
    if (!this.analogRegs.has(ch)) {
      this.analogRegs.add(ch);
      if (!this.analogValues.has(ch)) this.analogValues.set(ch, 512);
      this.markDirty();
    }
    return this.analogValues.get(ch) ?? 0;
  }

  /**
   * Times a pulse on `pin`. Only a sensor stimulus can produce one: with nothing mounted, or a pulse longer than the
   * timeout, it returns 0 exactly as the real call does. A measured pulse advances the simulated clock by its width.
   */
  pulseIn(n: number, level: number, timeoutUs: number): number {
    this.poll();
    const us = level ? this.echoPulses.get(n) : undefined;
    if (!us || us > timeoutUs) {
      this.clockBase += timeoutUs; // the real call blocks until it gives up
      return 0;
    }
    this.clockBase += us;
    return us;
  }

  millis(): number {
    this.poll();
    return Math.floor(this.nowUs() / 1000) >>> 0;
  }

  micros(): number {
    this.poll();
    return Math.floor(this.nowUs()) >>> 0;
  }

  randomSeed(n: number): void {
    this.seed = n >>> 0 || 1;
  }

  random(lo: number, hi: number): number {
    if (hi <= lo) return lo;
    // mulberry32
    this.seed = (this.seed + 0x6d2b79f5) >>> 0;
    let t = this.seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    const r = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    return lo + Math.floor(r * (hi - lo));
  }

  /** Turns the LCD's V0 contrast trimmer (0..1). */
  setLcdContrast(value: number): void {
    this.lcd.setContrast(value);
    this.markDirty();
  }

  // --- LiquidCrystal / LiquidCrystal_I2C ---------------------------------
  lcdInit(kind: "p" | "i", args: number[]): void {
    this.lcd.init(kind, args);
    this.markDirty();
  }

  lcdBegin(cols: number, rows: number): void {
    this.lcd.begin(cols, rows);
    // LiquidCrystal::begin() configures every interface line as an output.
    for (const n of this.lcd.outputPins) {
      const p = this.pin(n);
      if (p && p.mode !== "OUTPUT") {
        p.mode = "OUTPUT";
        p.level = 0;
        p.pwm = null;
      }
    }
    this.markDirty();
  }

  lcdClear(): void {
    this.lcd.clear();
    this.markDirty();
  }

  lcdHome(): void {
    this.lcd.home();
    this.markDirty();
  }

  lcdSetCursor(col: number, row: number): void {
    this.lcd.setCursor(col, row);
    this.markDirty();
  }

  lcdPrint(v: unknown, kind: StrKind, fmt: number): number {
    const n = this.lcd.print(v, kind, fmt);
    this.markDirty();
    return n;
  }

  lcdWrite(code: number): number {
    const n = this.lcd.write(code);
    this.markDirty();
    return n;
  }

  lcdCursor(on: boolean): void {
    this.lcd.setCursorVisible(on);
    this.markDirty();
  }

  lcdBlink(on: boolean): void {
    this.lcd.setBlink(on);
    this.markDirty();
  }

  lcdDisplay(on: boolean): void {
    this.lcd.setDisplay(on);
    this.markDirty();
  }

  lcdBacklight(on: boolean): void {
    this.lcd.setBacklight(on);
    this.markDirty();
  }

  lcdScroll(dir: number): void {
    this.lcd.scroll(dir);
    this.markDirty();
  }

  lcdAutoscroll(on: boolean): void {
    this.lcd.setAutoscroll(on);
  }

  lcdDirection(leftToRight: boolean): void {
    this.lcd.setDirection(leftToRight);
  }

  lcdCreateChar(slot: number, rows: number[]): void {
    this.lcd.createChar(slot, rows);
    this.markDirty();
  }

  // --- Serial ------------------------------------------------------------
  serialBegin(baud: number): void {
    this.baud = baud;
    this.markDirty();
  }

  serialPrint(v: unknown, kind: StrKind, fmt: number, newline: boolean): number {
    let text: string;
    if (kind === "f") text = toStr(v, "f", fmt > 0 ? fmt : 2);
    else if (kind === "i" && fmt > 1) text = toBase(Number(v), fmt);
    else text = toStr(v, kind);
    if (newline) text += "\r\n";
    if (text.length > 0) {
      this.txCount++;
      this.handlers.onSerialOut(text, Math.floor(this.nowUs() / 1000));
      this.markDirty();
    }
    return text.length;
  }

  serialAvailable(): number {
    this.poll();
    return this.rx.length;
  }

  serialRead(): number {
    this.poll();
    return this.rx.shift() ?? -1;
  }

  serialPeek(): number {
    return this.rx[0] ?? -1;
  }

  serialParseInt(): number {
    while (this.rx.length > 0 && !(this.rx[0] === 45 || (this.rx[0] >= 48 && this.rx[0] <= 57))) this.rx.shift();
    let out = "";
    while (this.rx.length > 0 && (this.rx[0] === 45 || (this.rx[0] >= 48 && this.rx[0] <= 57))) out += String.fromCharCode(this.rx.shift() as number);
    return parseInt(out, 10) | 0 || 0;
  }

  serialParseFloat(): number {
    while (this.rx.length > 0 && !(this.rx[0] === 45 || this.rx[0] === 46 || (this.rx[0] >= 48 && this.rx[0] <= 57))) this.rx.shift();
    let out = "";
    while (this.rx.length > 0 && (this.rx[0] === 45 || this.rx[0] === 46 || (this.rx[0] >= 48 && this.rx[0] <= 57))) out += String.fromCharCode(this.rx.shift() as number);
    const n = parseFloat(out);
    return Number.isNaN(n) ? 0 : n;
  }

  /** Reads up to `terminator` (consumed, not returned); -1 reads everything available. */
  serialReadString(terminator: number): string {
    let out = "";
    while (this.rx.length > 0) {
      const c = this.rx.shift() as number;
      if (c === terminator) break;
      out += String.fromCharCode(c);
    }
    return out;
  }
}
