/**
 * Code context analyzer: reads an Arduino sketch and decides which peripheral sensors it is talking to, so the canvas can
 * mount (and wire) the right module without the user placing anything. Deterministic and synchronous: it works on the
 * comment-stripped source with lexical heuristics (identifier tokens, resolved pin constants, signature formulas), never
 * on a network round trip, so a pasted sketch mounts its sensor in the same frame.
 *
 * Name matching is token based (`lightLevel`, `LIGHT_LEVEL` -> light, level), so `traffic_lights` or `template` do not
 * trip the LDR / temperature rules the way substring matching would.
 */
import type { AnalogSensorKind } from "./sensorModels";

export interface SensorContext {
  /** Analog channel (0-5) -> the sensor its readings are interpreted as. Channels with no sensor evidence are absent (a plain potentiometer). */
  analog: Record<number, Exclude<AnalogSensorKind, "pot">>;
  /** Digital pin of the PIR output, or null when the sketch has no motion sensor. */
  pir: number | null;
  /** Digital pin of the FC-51 output, or null. */
  ir: number | null;
  /** HC-SR04 trigger / echo pins, or null. */
  ultrasonic: { trig: number; echo: number } | null;
}

export const EMPTY_SENSOR_CONTEXT: SensorContext = { analog: {}, pir: null, ir: null, ultrasonic: null };

export const DEFAULT_PINS = { ultrasonicTrig: 9, ultrasonicEcho: 10, pir: 2, ir: 3, ldrChannel: 0, lm35Channel: 1 } as const;

const ANALOG_BASE = 14;

// --- lexical helpers ------------------------------------------------------------------------------------------------

/** Blanks comments and string literals, keeping newlines so offsets and line counts survive. */
export function stripNoise(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, " "))
    .replace(/\/\/[^\n]*/g, m => " ".repeat(m.length))
    .replace(/"(?:\\.|[^"\\\n])*"/g, m => `"${" ".repeat(Math.max(0, m.length - 2))}"`);
}

/** `lm35Pin` -> [lm35, pin]; `LIGHT_LEVEL` -> [light, level]; `pirState` -> [pir, state]. */
export function nameTokens(name: string): string[] {
  return name
    .replace(/_/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
}

const hasAny = (tokens: string[], words: ReadonlySet<string>): boolean => tokens.some(t => words.has(t));

/** Names that identify a photoresistor reading when they sit on the analogRead itself (`lightPin`, `int light = analogRead(A0)`). */
const LDR_WORDS = new Set(["ldr", "light", "lux", "photoresistor", "photocell", "photo", "luminosity", "daylight"]);
/** Sketch-wide evidence for a lone anonymous channel: unambiguous words, or `light` qualified as a measurement (`lightLevel`). */
const LDR_GLOBAL_WORDS = new Set(["ldr", "lux", "photoresistor", "photocell", "photo", "luminosity", "daylight", "dark", "darkness", "night", "dusk"]);
const LIGHT_QUALIFIERS = new Set(["level", "intensity", "value", "sensor", "reading", "threshold", "amount"]);
const LM35_WORDS = new Set(["lm35", "temp", "temperature", "celsius", "tempc", "degc", "thermometer"]);
const PIR_WORDS = new Set(["pir", "motion", "intruder", "intrusion", "hcsr501"]);
const IR_WORDS = new Set(["ir", "obstacle", "avoidance", "infrared", "fc51"]);
const TRIG_WORDS = new Set(["trig", "trigger"]);
const ECHO_WORDS = new Set(["echo"]);
const SONAR_WORDS = new Set(["ultrasonic", "sonar", "hcsr04"]);

/** The sketch derives degrees Celsius from a 5 V / 10-bit reading: x*5/1023*100, mV/10, x*0.488, x*500/1023. */
const LM35_FORMULA = [
  /5(?:\.0*)?\s*\/\s*1023(?:\.0*)?\s*\)?\s*\*\s*100(?:\.0*)?(?![\d.])/,
  /(?:mv|millivolts?)\w*\s*\/\s*10(?:\.0*)?(?![\d.])/i,
  /500(?:\.0*)?\s*\/\s*1023|0\.488\d*/,
];
/** Speed-of-sound constants a ranging sketch converts echo time with. */
const SONIC_CONSTANT = /(?<![\d.])0\.034\d*|(?<![\d.])58\.2(?![\d])|sound_?speed|speed_?of_?sound/i;

// --- constants ---------------------------------------------------------------------------------------------------------

interface Const {
  name: string;
  value: number;
  /** Declared `const` or `#define`: a fixed pin number rather than a variable that happens to start at 0. */
  fixed: boolean;
}

function parseValue(text: string, known: Map<string, number>): number | undefined {
  const t = text.trim();
  if (/^\d+$/.test(t)) return Number(t);
  const a = /^A([0-7])$/.exec(t);
  if (a) return ANALOG_BASE + Number(a[1]);
  if (t === "LED_BUILTIN") return 13;
  return known.get(t);
}

function collectConsts(code: string): Const[] {
  const out: Const[] = [];
  const known = new Map<string, number>();
  const add = (name: string, raw: string, fixed: boolean): void => {
    const value = parseValue(raw, known);
    if (value === undefined) return;
    known.set(name, value);
    out.push({ name, value, fixed });
  };
  const defineRe = /^[ \t]*#define[ \t]+(\w+)[ \t]+([^\s/]+)/gm;
  const declRe = /(?:^|[;{}\s])((?:static\s+|const\s+|volatile\s+|unsigned\s+)*)(?:int|byte|uint8_t|short|long|char)\s+(\w+)\s*=\s*([\w]+)\s*[;,]/g;
  for (const m of Array.from(code.matchAll(defineRe))) add(m[1], m[2], true);
  for (const m of Array.from(code.matchAll(declRe))) add(m[2], m[3], /\bconst\b/.test(m[1]));
  return out;
}

// --- call sites --------------------------------------------------------------------------------------------------------

interface Call {
  fn: string;
  /** Raw first argument text. */
  arg: string;
  /** Variable receiving the result (`int v = analogRead(A0);`), if any. */
  lhs: string | null;
}

function collectCalls(code: string, fns: string[]): Call[] {
  const re = new RegExp(`(?:(\\w+)\\s*=\\s*(?:\\([^()]*\\)\\s*)?)?\\b(${fns.join("|")})\\s*\\(\\s*([^,()]*)`, "g");
  return Array.from(code.matchAll(re), m => ({ fn: m[2], arg: m[3].trim(), lhs: m[1] ?? null }));
}

const isIdent = (s: string): boolean => /^[A-Za-z_]\w*$/.test(s);

// --- analysis ----------------------------------------------------------------------------------------------------------

export function analyzeSensorContext(source: string): SensorContext {
  const code = stripNoise(source);
  const consts = collectConsts(code);
  const constMap = new Map(consts.map(c => [c.name, c.value]));
  const pinArgNames = new Set(Array.from(code.matchAll(/\b(?:pinMode|digitalRead|digitalWrite|analogRead|pulseIn|pulseInLong)\s*\(\s*(\w+)/g), m => m[1]));
  /** Constants that really are pin numbers: fixed at compile time, or passed to a pin function (not `int motionDetected = 0`). */
  const pinConsts = consts.filter(c => c.fixed || pinArgNames.has(c.name));
  const resolve = (arg: string): number | undefined => parseValue(arg, constMap);
  const identifiers = new Set(code.match(/[A-Za-z_]\w*/g) ?? []);
  const allTokens = Array.from(identifiers).flatMap(nameTokens);
  const tokensOf = (...names: (string | null)[]): string[] => names.flatMap(n => (n ? nameTokens(n) : []));
  const nameHas = (name: string, words: ReadonlySet<string>): boolean => hasAny(nameTokens(name), words);

  const claimed = new Set<number>();
  const claim = (pin: number): number => {
    claimed.add(pin);
    return pin;
  };
  const firstFree = (preferred: number, fallbacks: number[], taken: Set<number>): number => [preferred, ...fallbacks].find(p => !taken.has(p)) ?? preferred;
  const digitalConst = (words: ReadonlySet<string>): number | undefined => pinConsts.find(c => c.value >= 0 && c.value <= 13 && !claimed.has(c.value) && nameHas(c.name, words))?.value;

  const pulseCalls = collectCalls(code, ["pulseIn", "pulseInLong"]);
  const digitalReads = collectCalls(code, ["digitalRead"]);
  const analogReads = collectCalls(code, ["analogRead"]);
  const digitalWrites = collectCalls(code, ["digitalWrite"]);

  // --- HC-SR04 ---
  let ultrasonic: SensorContext["ultrasonic"] = null;
  const sonicByName = hasAny(allTokens, SONAR_WORDS) || (hasAny(allTokens, TRIG_WORDS) && hasAny(allTokens, ECHO_WORDS)) || (allTokens.includes("duration") && allTokens.includes("distance"));
  if (pulseCalls.length > 0 || sonicByName || SONIC_CONSTANT.test(code)) {
    const echoArg = pulseCalls.map(c => resolve(c.arg)).find((p): p is number => p !== undefined && p >= 0 && p <= 13);
    const echo = echoArg ?? digitalConst(ECHO_WORDS) ?? DEFAULT_PINS.ultrasonicEcho;
    const written = digitalWrites.map(c => resolve(c.arg)).filter((p): p is number => p !== undefined && p >= 0 && p <= 13 && p !== echo);
    const trigNamed = pinConsts.find(c => c.value >= 0 && c.value <= 13 && c.value !== echo && nameHas(c.name, TRIG_WORDS))?.value;
    const trig = trigNamed ?? (written.length === 1 ? written[0] : firstFree(DEFAULT_PINS.ultrasonicTrig, [11, 12, 8, 7], new Set([echo])));
    ultrasonic = { trig: claim(trig), echo: claim(echo) };
  }

  // --- digital presence sensors ---
  const digitalSensor = (words: ReadonlySet<string>, fallback: number): number | null => {
    if (!hasAny(allTokens, words)) return null;
    const named = digitalConst(words);
    if (named !== undefined) return claim(named);
    const reads = digitalReads.filter(c => !(resolve(c.arg) !== undefined && claimed.has(resolve(c.arg) as number)));
    const byName = reads.find(c => hasAny(tokensOf(isIdent(c.arg) ? c.arg : null, c.lhs), words));
    const byNamePin = byName ? resolve(byName.arg) : undefined;
    if (byNamePin !== undefined && byNamePin <= 13) return claim(byNamePin);
    const pins = Array.from(new Set(reads.map(c => resolve(c.arg)).filter((p): p is number => p !== undefined && p >= 0 && p <= 13)));
    if (pins.length === 1) return claim(pins[0]);
    return claim(firstFree(fallback, [4, 5, 6, 7, 8], claimed));
  };
  const pir = digitalSensor(PIR_WORDS, DEFAULT_PINS.pir);
  const ir = digitalSensor(IR_WORDS, DEFAULT_PINS.ir);

  // --- analog sensors: classify each channel the sketch reads ---
  const analog: SensorContext["analog"] = {};
  const channels = new Map<number, string[]>();
  for (const call of analogReads) {
    const v = resolve(call.arg);
    if (v === undefined) continue;
    const ch = v >= ANALOG_BASE ? v - ANALOG_BASE : v;
    if (ch < 0 || ch > 5) continue;
    channels.set(ch, [...(channels.get(ch) ?? []), ...tokensOf(isIdent(call.arg) ? call.arg : null, call.lhs)]);
  }
  // A channel named through a pin constant (`const int ldrPin = A0;`) is evidence even when read via the constant alone.
  for (const c of consts) {
    if (c.value < ANALOG_BASE || c.value > ANALOG_BASE + 5) continue;
    const ch = c.value - ANALOG_BASE;
    if (channels.has(ch)) channels.set(ch, [...channels.get(ch)!, ...nameTokens(c.name)]);
  }
  const unclassified: number[] = [];
  for (const [ch, tokens] of Array.from(channels.entries())) {
    if (hasAny(tokens, LM35_WORDS) || tokens.some(t => t.includes("lm35"))) analog[ch] = "lm35";
    else if (hasAny(tokens, LDR_WORDS) || tokens.some(t => t.includes("ldr"))) analog[ch] = "ldr";
    else unclassified.push(ch);
  }
  // Fallback for a lone anonymous channel (`int raw = analogRead(A0);`): the rest of the sketch decides what it measures.
  if (unclassified.length === 1) {
    const flat = code.replace(/\s+/g, " ");
    const lm35 = hasAny(allTokens, LM35_WORDS) || LM35_FORMULA.some(re => re.test(flat));
    const ldr = hasAny(allTokens, LDR_GLOBAL_WORDS) || Array.from(identifiers).some(id => {
      const t = nameTokens(id);
      return t.includes("light") && hasAny(t, LIGHT_QUALIFIERS);
    });
    if (lm35 !== ldr) analog[unclassified[0]] = lm35 ? "lm35" : "ldr";
  }

  return { analog, pir, ir, ultrasonic };
}

/** Stable string form of a context, for memoising downstream work without re-rendering on every keystroke. */
export const sensorContextKey = (ctx: SensorContext): string => JSON.stringify([Object.entries(ctx.analog).sort(), ctx.pir, ctx.ir, ctx.ultrasonic]);
