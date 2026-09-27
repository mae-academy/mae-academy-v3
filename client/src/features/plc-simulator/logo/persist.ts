import {
  isBlockType,
  type BlockParams,
  type ConnectorRef,
  type LogoBlock,
  type LogoProgram,
  type PinName,
  type Sink,
  type SinkTarget,
  type TimeValue,
  type WireIn,
} from './engine/types';

/** File envelope of an exported LOGO! circuit program (`.logo` / `.lsc`). */
export const LOGO_FILE_FORMAT = 'mae-logo-0ba4';
export const LOGO_MAGIC_HEADER = 'MAE_LOGO_BIN:';
const VERSION = 1;

export type ParseResult = { readonly ok: true; readonly program: LogoProgram } | { readonly ok: false; readonly reason: string };

function encodeBase64(str: string): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(str, 'utf-8').toString('base64');
  }
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function decodeBase64(b64: string): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(b64, 'base64').toString('utf-8');
  }
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

export function serializeProgram(program: LogoProgram): string {
  const rawJson = JSON.stringify({ format: LOGO_FILE_FORMAT, version: VERSION, program });
  return `${LOGO_MAGIC_HEADER}${encodeBase64(rawJson)}`;
}

class ShapeError extends Error {}

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> => typeof value === 'object' && value !== null && !Array.isArray(value);

function integer(value: unknown, what: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) throw new ShapeError(`${what} must be an integer`);
  return value;
}

const PIN_NAMES: readonly PinName[] = ['1', '2', '3', '4', 'Trg', 'S', 'R', 'En', 'Inv', 'Cnt', 'Dir'];
const TIME_KEYS = ['T', 'TH', 'TL', 'T!', 'T!L'] as const;

function parseRef(value: unknown, what: string): ConnectorRef {
  if (!isRecord(value)) throw new ShapeError(`${what}: connector expected`);
  switch (value.kind) {
    case 'hi':
    case 'lo':
    case 'x':
      return { kind: value.kind };
    case 'digital-input':
    case 'digital-output':
    case 'digital-flag':
      return { kind: value.kind, index: integer(value.index, `${what}.index`) };
    case 'block-output':
      return { kind: 'block-output', blockId: integer(value.blockId, `${what}.blockId`) };
    default:
      throw new ShapeError(`${what}: unknown connector kind`);
  }
}

function parseWire(value: unknown, what: string): WireIn {
  if (!isRecord(value)) throw new ShapeError(`${what}: wire expected`);
  const ref = parseRef(value.ref, what);
  return value.invert === true ? { ref, invert: true } : { ref };
}

function parseTime(value: unknown, what: string): TimeValue {
  if (!isRecord(value)) throw new ShapeError(`${what}: time expected`);
  const base = value.base;
  if (base !== 's' && base !== 'm' && base !== 'h') throw new ShapeError(`${what}: timebase must be s, m or h`);
  return { base, value: integer(value.value, `${what}.value`) };
}

function parseParams(value: unknown, what: string): BlockParams {
  if (value === undefined) return {};
  if (!isRecord(value)) throw new ShapeError(`${what}: params expected`);
  const params: { -readonly [K in keyof BlockParams]: BlockParams[K] } = {};
  for (const key of TIME_KEYS) if (value[key] !== undefined) params[key] = parseTime(value[key], `${what}.${key}`);
  if (value.On !== undefined) params.On = integer(value.On, `${what}.On`);
  if (value.Off !== undefined) params.Off = integer(value.Off, `${what}.Off`);
  if (value.Par !== undefined) {
    if (value.Par !== 'RS' && value.Par !== 'SR') throw new ShapeError(`${what}.Par must be RS or SR`);
    params.Par = value.Par;
  }
  return params;
}

function parseBlock(value: unknown, index: number): LogoBlock {
  const what = `blocks[${index}]`;
  if (!isRecord(value)) throw new ShapeError(`${what}: block expected`);
  if (!isBlockType(value.type)) throw new ShapeError(`${what}: unknown block type`);
  if (!isRecord(value.inputs)) throw new ShapeError(`${what}: inputs expected`);
  const inputs: Partial<Record<PinName, WireIn>> = {};
  for (const [pin, wire] of Object.entries(value.inputs)) {
    const name = PIN_NAMES.find((candidate) => candidate === pin);
    if (!name) throw new ShapeError(`${what}: unknown input ${pin}`);
    inputs[name] = parseWire(wire, `${what}.${pin}`);
  }
  return {
    id: integer(value.id, `${what}.id`),
    type: value.type,
    inputs,
    params: parseParams(value.params, `${what}.params`),
    retentive: value.retentive === true,
    ...(value.protected === true ? { protected: true } : {}),
  };
}

function parseSink(value: unknown, index: number): Sink {
  const what = `sinks[${index}]`;
  if (!isRecord(value) || !isRecord(value.target)) throw new ShapeError(`${what}: sink expected`);
  const kind = value.target.kind;
  if (kind !== 'digital-output' && kind !== 'digital-flag') throw new ShapeError(`${what}: target must be a Q or an M`);
  const target: SinkTarget = { kind, index: integer(value.target.index, `${what}.target.index`) };
  return { target, source: parseRef(value.source, `${what}.source`) };
}

/** Shape check only; wiring, loops and the memory budget are checked by `compileProgram`. */
export function parseProgram(text: string): ParseResult {
  let jsonText = text.trim();

  if (jsonText.startsWith(LOGO_MAGIC_HEADER)) {
    const payload = jsonText.slice(LOGO_MAGIC_HEADER.length).trim();
    try {
      jsonText = decodeBase64(payload);
    } catch {
      return { ok: false, reason: 'corrupted encoded payload' };
    }
  } else if (!jsonText.startsWith('{') && /^[A-Za-z0-9+/=\r\n]+$/.test(jsonText)) {
    try {
      const decoded = decodeBase64(jsonText);
      if (decoded.trim().startsWith('{')) {
        jsonText = decoded;
      }
    } catch {
      // not base64, fall through to JSON.parse
    }
  }

  let root: unknown;
  try {
    root = JSON.parse(jsonText);
  } catch {
    return { ok: false, reason: 'not valid program data' };
  }
  try {
    if (!isRecord(root) || root.format !== LOGO_FILE_FORMAT) throw new ShapeError(`not a ${LOGO_FILE_FORMAT} file`);
    if (root.version !== VERSION) throw new ShapeError(`unsupported version ${String(root.version)}`);
    const program = root.program;
    if (!isRecord(program) || !Array.isArray(program.blocks) || !Array.isArray(program.sinks)) throw new ShapeError('program expected');
    return {
      ok: true,
      program: {
        name: typeof program.name === 'string' ? program.name.slice(0, 16) : '',
        blocks: program.blocks.map(parseBlock),
        sinks: program.sinks.map(parseSink),
      },
    };
  } catch (error) {
    if (error instanceof ShapeError) return { ok: false, reason: error.message };
    throw error;
  }
}
