import type { FieldIoAdapter } from '../../engine/types';

/** Address of bit `index` (0-based, linear) in an I or Q area: index 9 -> "Q1.1". */
export const bitAddress = (area: 'I' | 'Q', index: number): string => `${area}${index >> 3}.${index & 7}`;

const BIT_ADDRESS = /^I(\d+)\.([0-7])$/i;
const LOGO_ALIAS = /^I(\d+)$/i;

/**
 * The simulated field side of the controller: the switches and pushbuttons wired to the input
 * terminals, and the last output image the CPU latched to its relays.
 *
 * It implements the engine's `FieldIoAdapter`, so the scan cycle samples it in Phase A and hands
 * it the output image in Phase D — the runtime never sees the UI. Inputs are stored as raw levels;
 * whether a physical switch latches or is momentary is the hardware panel's concern.
 */
export class VirtualField implements FieldIoAdapter {
  private readonly levels: Uint8Array;
  private readonly latched: Uint8Array;
  private readonly listeners = new Set<() => void>();
  private revision = 0;

  constructor(
    readonly inputBits: number,
    readonly outputBits: number,
  ) {
    this.levels = new Uint8Array(Math.ceil(inputBits / 8));
    this.latched = new Uint8Array(Math.ceil(outputBits / 8));
  }

  // ---- FieldIoAdapter ---------------------------------------------------------------------

  sampleInputs(image: Uint8Array): void {
    image.set(this.levels.subarray(0, image.length));
  }

  commitOutputs(image: Uint8Array): void {
    this.latched.set(image.subarray(0, this.latched.length));
  }

  // ---- input side -------------------------------------------------------------------------

  getInput(index: number): boolean {
    if (index < 0 || index >= this.inputBits) return false;
    return ((this.levels[index >> 3] ?? 0) & (1 << (index & 7))) !== 0;
  }

  setInput(index: number, value: boolean): void {
    if (index < 0 || index >= this.inputBits) throw new RangeError(`Input ${index} does not exist`);
    const byte = index >> 3;
    const mask = 1 << (index & 7);
    const before = this.levels[byte] ?? 0;
    const after = value ? before | mask : before & ~mask & 0xff;
    if (after === before) return;
    this.levels[byte] = after;
    this.revision += 1;
    this.listeners.forEach((listener) => listener());
  }

  toggleInput(index: number): void {
    this.setInput(index, !this.getInput(index));
  }

  /**
   * Drives an input by address: `I0.5`, or the LOGO! terminal number `I6` (1-based, so `I1` is
   * `I0.0`). Throws `RangeError` for an input this hardware does not have.
   */
  writeInput(address: string, value: boolean): void {
    const text = address.trim();
    const bit = BIT_ADDRESS.exec(text);
    if (bit) {
      this.setInput(Number(bit[1]) * 8 + Number(bit[2]), value);
      return;
    }
    const alias = LOGO_ALIAS.exec(text);
    if (alias) {
      this.setInput(Number(alias[1]) - 1, value);
      return;
    }
    throw new RangeError(`"${address}" is not an input address`);
  }

  /** Releases every input, e.g. when a profile is switched. */
  clearInputs(): void {
    if (!this.levels.some((byte) => byte !== 0)) return;
    this.levels.fill(0);
    this.revision += 1;
    this.listeners.forEach((listener) => listener());
  }

  // ---- output side ------------------------------------------------------------------------

  /** Output relay state as last latched by a scan. */
  getOutput(index: number): boolean {
    if (index < 0 || index >= this.outputBits) return false;
    return ((this.latched[index >> 3] ?? 0) & (1 << (index & 7))) !== 0;
  }

  // ---- change notification (useSyncExternalStore) ---------------------------------------

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => void this.listeners.delete(listener);
  };

  getRevision = (): number => this.revision;
}
