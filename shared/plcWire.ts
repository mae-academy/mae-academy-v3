/**
 * Wire codec shared by the browser and the serverless PLC engine (protocol v2). Nothing in here is
 * engine logic: it only packs bytes.
 *
 * Memory travels as one flat image. A diff is a run-length list of the bytes that differ from a
 * base image, so an idle controller (almost all zeros) costs a handful of bytes, and a response
 * carries only the cells the scan really changed.
 */

export const PROTOCOL_VERSION = 2;

export class WireError extends Error {}

// ---- base64 -------------------------------------------------------------------------------------

export function toBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return btoa(binary);
}

export function fromBase64(text: string): Uint8Array {
  const binary = atob(text);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

// ---- varints (LEB128, values below 2^28) ---------------------------------------------------------

function writeVarint(out: number[], value: number): void {
  let v = value;
  while (v >= 0x80) {
    out.push((v & 0x7f) | 0x80);
    v >>>= 7;
  }
  out.push(v);
}

function readVarint(buf: Uint8Array, cursor: { i: number }): number {
  let result = 0;
  for (let shift = 0; shift <= 21; shift += 7) {
    const byte = buf[cursor.i++];
    if (byte === undefined) throw new WireError('truncated varint');
    result |= (byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) return result;
  }
  throw new WireError('varint too long');
}

// ---- diff ---------------------------------------------------------------------------------------

/**
 * Encodes `next` as the bytes that differ from `base`:
 *   varint(total length) { varint(unchanged run) varint(changed run) changed bytes }*
 * Runs are exact (no merging across equal bytes), so a cell the sender did not change is never
 * touched by the receiver. Pass an all-zero `base` for zero-run suppression of a whole image.
 */
export function encodeDiff(base: Uint8Array, next: Uint8Array): Uint8Array {
  if (base.length !== next.length) throw new WireError('diff operands differ in length');
  const n = next.length;
  const out: number[] = [];
  writeVarint(out, n);
  let i = 0;
  while (i < n) {
    let j = i;
    while (j < n && base[j] === next[j]) j++;
    if (j === n) break; // the rest is unchanged: nothing more to say
    let k = j;
    while (k < n && base[k] !== next[k]) k++;
    writeVarint(out, j - i);
    writeVarint(out, k - j);
    for (let p = j; p < k; p++) out.push(next[p]!);
    i = k;
  }
  return Uint8Array.from(out);
}

/** Returns a copy of `base` with the changed runs of `diff` written over it. Bounds-checked. */
export function applyDiff(base: Uint8Array, diff: Uint8Array): Uint8Array {
  const cursor = { i: 0 };
  const total = readVarint(diff, cursor);
  if (total !== base.length) throw new WireError(`diff is for ${total} bytes, expected ${base.length}`);
  const out = base.slice();
  let pos = 0;
  while (cursor.i < diff.length) {
    const skip = readVarint(diff, cursor);
    const length = readVarint(diff, cursor);
    if (length === 0) throw new WireError('empty changed run');
    pos += skip;
    if (pos + length > total || cursor.i + length > diff.length) throw new WireError('diff run out of bounds');
    out.set(diff.subarray(cursor.i, cursor.i + length), pos);
    cursor.i += length;
    pos += length;
  }
  return out;
}

// ---- memory snapshot <-> flat image -------------------------------------------------------------

export interface SnapshotShape {
  readonly profileId: string;
  readonly bytes: Partial<Record<'I' | 'Q' | 'M' | 'V', Uint8Array>>;
  readonly indexed: Partial<Record<'T' | 'C', { readonly current: Uint16Array; readonly preset: Uint16Array; readonly status: Uint8Array }>>;
}

const BYTE_AREAS = ['I', 'Q', 'M', 'V'] as const;
const INDEXED_AREAS = ['T', 'C'] as const;

export function imageSize(shape: SnapshotShape): number {
  let size = 0;
  for (const area of BYTE_AREAS) size += shape.bytes[area]?.length ?? 0;
  for (const area of INDEXED_AREAS) {
    const s = shape.indexed[area];
    if (s) size += s.current.length * 2 + s.preset.length * 2 + s.status.length;
  }
  return size;
}

/** Areas in the fixed order I, Q, M, V, T, C; 16-bit values little-endian. */
export function flattenSnapshot(shape: SnapshotShape): Uint8Array {
  const out = new Uint8Array(imageSize(shape));
  let at = 0;
  for (const area of BYTE_AREAS) {
    const b = shape.bytes[area];
    if (b) {
      out.set(b, at);
      at += b.length;
    }
  }
  for (const area of INDEXED_AREAS) {
    const s = shape.indexed[area];
    if (!s) continue;
    for (const words of [s.current, s.preset]) {
      for (let i = 0; i < words.length; i++) {
        out[at++] = words[i]! & 0xff;
        out[at++] = words[i]! >> 8;
      }
    }
    out.set(s.status, at);
    at += s.status.length;
  }
  return out;
}

/** Rebuilds a snapshot with the area sizes of `template`, filled from `image`. */
export function unflattenSnapshot(template: SnapshotShape, image: Uint8Array): SnapshotShape {
  if (image.length !== imageSize(template)) throw new WireError('memory image has the wrong size');
  let at = 0;
  const bytes: { [P in 'I' | 'Q' | 'M' | 'V']?: Uint8Array } = {};
  for (const area of BYTE_AREAS) {
    const t = template.bytes[area];
    if (t) {
      bytes[area] = image.slice(at, at + t.length);
      at += t.length;
    }
  }
  const indexed: { [P in 'T' | 'C']?: { current: Uint16Array; preset: Uint16Array; status: Uint8Array } } = {};
  for (const area of INDEXED_AREAS) {
    const t = template.indexed[area];
    if (!t) continue;
    const readWords = (count: number): Uint16Array => {
      const words = new Uint16Array(count);
      for (let i = 0; i < count; i++, at += 2) words[i] = image[at]! | (image[at + 1]! << 8);
      return words;
    };
    const current = readWords(t.current.length);
    const preset = readWords(t.preset.length);
    const status = image.slice(at, at + t.status.length);
    at += t.status.length;
    indexed[area] = { current, preset, status };
  }
  return { profileId: template.profileId, bytes, indexed };
}

// ---- canonical JSON (content addressing) --------------------------------------------------------

/** JSON with object keys sorted, so equal programs serialise identically whatever their key order. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
