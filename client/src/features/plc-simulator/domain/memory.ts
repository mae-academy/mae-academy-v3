import { validateAddress } from './address';
import { byteAreaSize, indexedAreaSize, type HardwareProfile } from './hardware';
import {
  WIDTH_BYTES,
  WIDTH_MASK,
  isIndexedArea,
  type AccessWidth,
  type AreaPrefix,
  type ByteAreaPrefix,
  type ByteWidth,
  type IndexedAreaPrefix,
  type ParsedAddress,
} from './types';

export class PlcAddressError extends Error {}
export class PlcAccessError extends Error {}

/** 'program' = user logic (cannot write process-image inputs); 'io' = simulated field I/O. */
export type WriteOrigin = 'program' | 'io';
export type AddressInput = string | ParsedAddress;
export type IndexedField = 'current' | 'preset' | 'status';

export interface MemoryChange {
  readonly area: AreaPrefix;
  /** Byte offset, or instance index for T/C. */
  readonly byte: number;
  readonly bit?: number;
  readonly width: AccessWidth;
  readonly field?: IndexedField;
  /** Unsigned raw values (bit: 0|1). */
  readonly previous: number;
  readonly next: number;
}

/** Receives every committed change batch; a lone write yields a one-element batch. */
export type MemoryListener = (changes: readonly MemoryChange[]) => void;
export type Unsubscribe = () => void;

interface IndexedStore {
  readonly current: Uint16Array;
  readonly preset: Uint16Array;
  readonly status: Uint8Array;
}

export interface MemorySnapshot {
  readonly profileId: string;
  readonly bytes: Partial<Record<ByteAreaPrefix, Uint8Array>>;
  readonly indexed: Partial<Record<IndexedAreaPrefix, IndexedStore>>;
}

const BYTE_AREAS: readonly ByteAreaPrefix[] = ['I', 'Q', 'M', 'V'];
const INDEXED_AREAS: readonly IndexedAreaPrefix[] = ['T', 'C'];

/**
 * Profile-bounded PLC memory image. Multi-byte values are big-endian (S7-200: VW0 = VB0:VB1, MSB first).
 * Single-writer by design (one simulation worker); UI reads via `subscribe` + `version`,
 * which matches React's `useSyncExternalStore(subscribe, () => map.version)`.
 */
export class MemoryMap {
  private readonly bytes: { [P in ByteAreaPrefix]?: Uint8Array } = {};
  private readonly indexed: { [P in IndexedAreaPrefix]?: IndexedStore } = {};
  private readonly listeners = new Set<MemoryListener>();
  private readonly parsedCache = new Map<string, ParsedAddress>();
  private pending: MemoryChange[] | null = null;
  private _version = 0;
  private restored = false;

  constructor(readonly profile: HardwareProfile) {
    for (const p of BYTE_AREAS) {
      const spec = profile.memory[p];
      if (spec) this.bytes[p] = new Uint8Array(byteAreaSize(spec));
    }
    for (const p of INDEXED_AREAS) {
      const spec = profile.memory[p];
      if (!spec) continue;
      const n = indexedAreaSize(spec);
      this.indexed[p] = {
        current: new Uint16Array(n),
        preset: new Uint16Array(n),
        status: new Uint8Array(n),
      };
    }
  }

  /** Monotonic counter bumped once per committed batch. */
  get version(): number {
    return this._version;
  }

  subscribe(listener: MemoryListener): Unsubscribe {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  }

  /** Coalesces all writes inside `fn` into a single notification (use once per scan cycle). */
  transaction<R>(fn: () => R): R {
    const outer = this.pending === null;
    const batch: MemoryChange[] = this.pending ?? [];
    this.pending = batch;
    try {
      return fn();
    } finally {
      if (outer) {
        this.pending = null;
        if (batch.length > 0 || this.restored) {
          this.restored = false;
          this.flush(batch);
        }
      }
    }
  }

  resolve(address: AddressInput): ParsedAddress {
    if (typeof address !== 'string') return address;
    const cached = this.parsedCache.get(address);
    if (cached) return cached;
    const result = validateAddress(address, this.profile);
    if (!result.isValid || !result.parsed) throw new PlcAddressError(result.error);
    this.parsedCache.set(address, result.parsed);
    return result.parsed;
  }

  // ---- bit access -------------------------------------------------------------------------

  /** Bit read; on T/C returns the instance status bit (the T-bit / C-bit used by contacts). */
  readBit(address: AddressInput): boolean {
    const a = this.resolve(address);
    if (isIndexedArea(a.area)) return this.slot(a).status[a.byte] === 1;
    return this.bitLoc(a).value === 1;
  }

  writeBit(address: AddressInput, value: boolean, origin: WriteOrigin = 'program'): void {
    const a = this.resolve(address);
    this.assertWritable(a, origin);
    const next = value ? 1 : 0;
    if (isIndexedArea(a.area)) {
      const status = this.slot(a).status;
      this.assign8(a, 'status', status, a.byte, next);
      return;
    }
    const { buf, mask, value: prev } = this.bitLoc(a);
    if (prev === next) return;
    // Direct masking: OR sets, AND-NOT clears; the rest of the byte is untouched.
    buf[a.byte] = next ? (buf[a.byte] ?? 0) | mask : (buf[a.byte] ?? 0) & ~mask & 0xff;
    this.commit({ area: a.area, byte: a.byte, bit: a.bit, width: 'bit', previous: prev, next });
  }

  // ---- byte / word / dword access (T/C: current value) ------------------------------------

  /** Unsigned raw read. */
  read(address: AddressInput): number {
    const a = this.resolve(address);
    if (isIndexedArea(a.area)) return this.slot(a).current[a.byte] ?? 0;
    if (a.width === 'bit') throw new PlcAddressError(`${this.fmt(a)} is a bit address; use readBit`);
    return this.loadBE(this.store(a), a.byte, WIDTH_BYTES[a.width]);
  }

  /** Two's-complement read (BYTE/INT/DINT semantics). */
  readSigned(address: AddressInput): number {
    const a = this.resolve(address);
    const raw = this.read(a);
    const shift = 32 - (isIndexedArea(a.area) ? 16 : 8 * WIDTH_BYTES[a.width as ByteWidth]);
    return (raw << shift) >> shift;
  }

  /** Writes `value` truncated to the access width (hardware wrap-around behaviour). */
  write(address: AddressInput, value: number, origin: WriteOrigin = 'program'): void {
    const a = this.resolve(address);
    this.assertWritable(a, origin);
    if (!Number.isInteger(value)) throw new RangeError(`Non-integer value ${value}`);
    if (isIndexedArea(a.area)) {
      this.writeIndexedWord(a, 'current', value);
      return;
    }
    if (a.width === 'bit') throw new PlcAddressError(`${this.fmt(a)} is a bit address; use writeBit`);
    const n = WIDTH_BYTES[a.width];
    const buf = this.store(a);
    let masked = (value & WIDTH_MASK[a.width]) >>> 0;
    const prev = this.loadBE(buf, a.byte, n);
    if (prev === masked) return;
    for (let i = n - 1; i >= 0; i--) {
      buf[a.byte + i] = masked & 0xff; // LSB lands in the highest offset (big-endian)
      masked >>>= 8;
    }
    this.commit({ area: a.area, byte: a.byte, width: a.width, previous: prev, next: (value & WIDTH_MASK[a.width]) >>> 0 });
  }

  // ---- timer / counter preset --------------------------------------------------------------

  readPreset(address: AddressInput): number {
    const a = this.indexedOnly(address);
    return this.slot(a).preset[a.byte] ?? 0;
  }

  writePreset(address: AddressInput, value: number, origin: WriteOrigin = 'program'): void {
    const a = this.indexedOnly(address);
    this.assertWritable(a, origin);
    this.writeIndexedWord(a, 'preset', value);
  }

  // ---- lifecycle ---------------------------------------------------------------------------

  /** Structured-clone-safe copy, e.g. for `postMessage` from the simulation worker. */
  snapshot(): MemorySnapshot {
    const bytes: { [P in ByteAreaPrefix]?: Uint8Array } = {};
    const indexed: { [P in IndexedAreaPrefix]?: IndexedStore } = {};
    for (const p of BYTE_AREAS) {
      const b = this.bytes[p];
      if (b) bytes[p] = b.slice();
    }
    for (const p of INDEXED_AREAS) {
      const s = this.indexed[p];
      if (s) indexed[p] = { current: s.current.slice(), preset: s.preset.slice(), status: s.status.slice() };
    }
    return { profileId: this.profile.id, bytes, indexed };
  }

  /**
   * Loads a snapshot produced by {@link snapshot} (the remote engine's result) and notifies once;
   * inside a `transaction` the notification joins the surrounding batch.
   */
  restore(snapshot: MemorySnapshot): void {
    if (snapshot.profileId !== this.profile.id) throw new PlcAddressError('Snapshot belongs to another profile');
    for (const p of BYTE_AREAS) {
      const dst = this.bytes[p];
      const src = snapshot.bytes[p];
      if (dst && src && src.length === dst.length) dst.set(src);
    }
    for (const p of INDEXED_AREAS) {
      const dst = this.indexed[p];
      const src = snapshot.indexed[p];
      if (dst && src && src.current.length === dst.current.length) {
        dst.current.set(src.current);
        dst.preset.set(src.preset);
        dst.status.set(src.status);
      }
    }
    if (this.pending === null) this.flush([]);
    else this.restored = true;
  }

  /** Zeroes all memory (STOP -> RUN cold start) and notifies once. */
  reset(): void {
    for (const p of BYTE_AREAS) this.bytes[p]?.fill(0);
    for (const p of INDEXED_AREAS) {
      const s = this.indexed[p];
      s?.current.fill(0);
      s?.preset.fill(0);
      s?.status.fill(0);
    }
    this.flush([]);
  }

  // ---- internals ---------------------------------------------------------------------------

  private commit(change: MemoryChange): void {
    if (this.pending) this.pending.push(change);
    else this.flush([change]);
  }

  private flush(changes: readonly MemoryChange[]): void {
    this._version++;
    for (const listener of Array.from(this.listeners)) {
      try {
        listener(changes);
      } catch (err) {
        console.error('MemoryMap listener failed', err); // one bad subscriber must not starve others
      }
    }
  }

  private assertWritable(a: ParsedAddress, origin: WriteOrigin): void {
    if (a.area === 'I' && origin === 'program') {
      throw new PlcAccessError(`${this.fmt(a)}: process-image inputs are read-only for the program`);
    }
  }

  private fmt(a: ParsedAddress): string {
    return `${a.area}${a.byte}${a.bit === undefined ? '' : `.${a.bit}`}`;
  }

  private store(a: ParsedAddress): Uint8Array {
    const buf = this.bytes[a.area as ByteAreaPrefix];
    if (!buf) throw new PlcAddressError(`Area ${a.area} not allocated on ${this.profile.model}`);
    return buf;
  }

  private slot(a: ParsedAddress): IndexedStore {
    const s = this.indexed[a.area as IndexedAreaPrefix];
    if (!s) throw new PlcAddressError(`Area ${a.area} not allocated on ${this.profile.model}`);
    return s;
  }

  private indexedOnly(address: AddressInput): ParsedAddress {
    const a = this.resolve(address);
    if (!isIndexedArea(a.area)) throw new PlcAddressError(`${this.fmt(a)} has no preset value`);
    return a;
  }

  private bitLoc(a: ParsedAddress): { buf: Uint8Array; mask: number; value: 0 | 1 } {
    if (a.width !== 'bit' || a.bit === undefined) {
      throw new PlcAddressError(`${this.fmt(a)} is not a bit address`);
    }
    const buf = this.store(a);
    const mask = 1 << a.bit;
    return { buf, mask, value: ((buf[a.byte] ?? 0) & mask) !== 0 ? 1 : 0 };
  }

  private loadBE(buf: Uint8Array, offset: number, n: number): number {
    let v = 0;
    for (let i = 0; i < n; i++) v = ((v << 8) | (buf[offset + i] ?? 0)) >>> 0;
    return v;
  }

  private writeIndexedWord(a: ParsedAddress, field: 'current' | 'preset', value: number): void {
    if (!Number.isInteger(value)) throw new RangeError(`Non-integer value ${value}`);
    const arr = this.slot(a)[field];
    const next = value & 0xffff;
    const prev = arr[a.byte] ?? 0;
    if (prev === next) return;
    arr[a.byte] = next;
    this.commit({ area: a.area, byte: a.byte, width: 'word', field, previous: prev, next });
  }

  private assign8(a: ParsedAddress, field: IndexedField, arr: Uint8Array, i: number, next: number): void {
    const prev = arr[i] ?? 0;
    if (prev === next) return;
    arr[i] = next;
    this.commit({ area: a.area, byte: a.byte, width: 'bit', field, previous: prev, next });
  }
}
