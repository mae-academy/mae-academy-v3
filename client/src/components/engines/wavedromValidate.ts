/**
 * Strict validation of ```wavedrom fences. The result is a freshly built plain-object copy containing only known keys
 * with checked values; the raw parsed JSON never reaches the library.
 */

export const WAVEDROM_MAX_BYTES = 20 * 1024;
export const WAVEDROM_MAX_SIGNALS = 40;
export const WAVEDROM_MAX_WAVE = 200;
export const WAVEDROM_MAX_DEPTH = 4;
export const WAVEDROM_MAX_NAME = 60;
export const WAVEDROM_MAX_DATA_ITEM = 40;
export const WAVEDROM_MAX_DATA_ITEMS = 64;
export const WAVEDROM_MAX_HSCALE = 4;

export type WaveReason =
  | "tooLarge" | "notJson" | "notObject" | "noSignal" | "tooManySignals" | "badSignal" | "badWave" | "waveTooLong"
  | "badData" | "badKey" | "tooDeep" | "badConfig" | "badName" | "badEdge";

export type WaveCheck = { ok: true; spec: WaveSpec } | { ok: false; reason: WaveReason; detail?: string };

export type WaveItem = WaveLane | WaveGroup | Record<string, never>;
export type WaveGroup = Array<string | WaveItem>;
export interface WaveLane {
  name: string;
  wave: string;
  data?: string[];
  phase?: number;
  period?: number;
  node?: string;
}
export interface WaveSpec {
  signal: WaveGroup;
  config?: { hscale?: number };
  head?: { text?: string; tick?: number; tock?: number };
  foot?: { text?: string; tick?: number; tock?: number };
  edge?: string[];
}

/** Characters of the WaveDrom wave alphabet: clocks p P n N, levels 0 1 x z h l H L, data 2-9 and =, up/down u d, continuation . and gap |. */
const WAVE_CHARS = /^[01xzpPnNhHlL=2-9udZ.|]*$/;
const DANGEROUS = new Set(["__proto__", "constructor", "prototype"]);
const LANE_KEYS = new Set(["name", "wave", "data", "phase", "period", "node"]);
const TOP_KEYS = new Set(["signal", "config", "head", "foot", "edge"]);
const SAFE_TEXT = /^[^<>\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]*$/;

class Reject extends Error {
  constructor(readonly reason: WaveReason, readonly detail?: string) {
    super(reason);
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

function checkKeys(object: Record<string, unknown>, allowed: ReadonlySet<string>): void {
  for (const key of Object.keys(object)) {
    if (DANGEROUS.has(key)) throw new Reject("badKey", key);
    if (!allowed.has(key)) throw new Reject("badKey", key.slice(0, 24));
  }
}

function safeText(value: unknown, max: number, reason: WaveReason): string {
  if (typeof value !== "string" || value.length > max || !SAFE_TEXT.test(value)) throw new Reject(reason, typeof value === "string" ? value.slice(0, 24) : undefined);
  return value;
}

function smallNumber(value: unknown, lo: number, hi: number, reason: WaveReason): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < lo || value > hi) throw new Reject(reason);
  return value;
}

function lane(raw: Record<string, unknown>, counter: { signals: number }): WaveItem {
  checkKeys(raw, LANE_KEYS);
  // `{}` is WaveDrom's spacer row.
  if (Object.keys(raw).length === 0) return {};
  if (++counter.signals > WAVEDROM_MAX_SIGNALS) throw new Reject("tooManySignals");
  const out: WaveLane = { name: safeText(raw.name ?? "", WAVEDROM_MAX_NAME, "badName"), wave: "" };
  const wave = raw.wave ?? "";
  if (typeof wave !== "string") throw new Reject("badWave");
  if (wave.length > WAVEDROM_MAX_WAVE) throw new Reject("waveTooLong");
  if (!WAVE_CHARS.test(wave)) throw new Reject("badWave", wave.replace(/[01xzpPnNhHlL=2-9udZ.|]/g, "").slice(0, 8));
  out.wave = wave;
  if (raw.data !== undefined) {
    const items = typeof raw.data === "string" ? raw.data.split(/\s+/).filter(Boolean) : raw.data;
    if (!Array.isArray(items) || items.length > WAVEDROM_MAX_DATA_ITEMS) throw new Reject("badData");
    out.data = items.map((item) => {
      if (typeof item !== "string" && typeof item !== "number") throw new Reject("badData");
      return safeText(String(item), WAVEDROM_MAX_DATA_ITEM, "badData");
    });
  }
  if (raw.phase !== undefined) out.phase = smallNumber(raw.phase, -8, 8, "badSignal");
  if (raw.period !== undefined) out.period = smallNumber(raw.period, 0.25, 8, "badSignal");
  if (raw.node !== undefined) {
    if (typeof raw.node !== "string" || raw.node.length > WAVEDROM_MAX_WAVE || !/^[A-Za-z0-9.]*$/.test(raw.node)) throw new Reject("badSignal");
    out.node = raw.node;
  }
  return out;
}

function group(raw: unknown[], depth: number, counter: { signals: number }): WaveGroup {
  if (depth > WAVEDROM_MAX_DEPTH) throw new Reject("tooDeep");
  const out: WaveGroup = [];
  raw.forEach((item, index) => {
    if (Array.isArray(item)) out.push(group(item, depth + 1, counter));
    else if (isRecord(item)) out.push(lane(item, counter));
    else if (typeof item === "string" && index === 0) out.push(safeText(item, WAVEDROM_MAX_NAME, "badName"));
    else throw new Reject("badSignal");
  });
  return out;
}

function header(raw: unknown): { text?: string; tick?: number; tock?: number } {
  if (!isRecord(raw)) throw new Reject("badConfig");
  checkKeys(raw, new Set(["text", "tick", "tock"]));
  const out: { text?: string; tick?: number; tock?: number } = {};
  if (raw.text !== undefined) out.text = safeText(raw.text, 80, "badConfig");
  if (raw.tick !== undefined) out.tick = smallNumber(raw.tick, -1000, 1000, "badConfig");
  if (raw.tock !== undefined) out.tock = smallNumber(raw.tock, -1000, 1000, "badConfig");
  return out;
}

export function validateWaveDrom(text: string): WaveCheck {
  const body = text.trim();
  if (new TextEncoder().encode(body).length > WAVEDROM_MAX_BYTES) return { ok: false, reason: "tooLarge" };
  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch {
    return { ok: false, reason: "notJson" };
  }
  if (!isRecord(raw)) return { ok: false, reason: "notObject" };
  try {
    checkKeys(raw, TOP_KEYS);
    if (!Array.isArray(raw.signal) || raw.signal.length === 0) throw new Reject("noSignal");
    const counter = { signals: 0 };
    const signal = group(raw.signal, 1, counter);
    if (counter.signals === 0) throw new Reject("noSignal");
    const spec: WaveSpec = { signal };
    if (raw.config !== undefined) {
      if (!isRecord(raw.config)) throw new Reject("badConfig");
      checkKeys(raw.config, new Set(["hscale"]));
      spec.config = {};
      if (raw.config.hscale !== undefined) spec.config.hscale = Math.round(smallNumber(raw.config.hscale, 1, WAVEDROM_MAX_HSCALE, "badConfig"));
    }
    if (raw.head !== undefined) spec.head = header(raw.head);
    if (raw.foot !== undefined) spec.foot = header(raw.foot);
    if (raw.edge !== undefined) {
      if (!Array.isArray(raw.edge) || raw.edge.length > 40) throw new Reject("badEdge");
      spec.edge = raw.edge.map((edge) => {
        if (typeof edge !== "string" || edge.length > 60 || !/^[A-Za-z0-9.\s~|\-<>+!?*=:/_'"]*$/.test(edge) || /<[A-Za-z0-9]/.test(edge)) throw new Reject("badEdge");
        return edge;
      });
    }
    return { ok: true, spec };
  } catch (error) {
    if (error instanceof Reject) return { ok: false, reason: error.reason, detail: error.detail };
    throw error;
  }
}
