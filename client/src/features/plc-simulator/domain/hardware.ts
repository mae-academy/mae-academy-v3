import type { AccessWidth, AreaPrefix, ByteAreaPrefix, IndexedAreaPrefix } from './types';

export interface Bounds {
  readonly min: number;
  readonly max: number;
}

export interface IndexRange {
  readonly from: number;
  readonly to: number;
}

/** Bit-addressable byte array (I, Q, M, V). `bitCount` is the exact addressable bit boundary. */
export interface ByteAreaSpec {
  readonly kind: 'bytes';
  readonly bitCount: number;
  readonly widths: readonly AccessWidth[];
}

/** Instance-indexed area (T, C). Each instance owns current value, preset value and a status bit. */
export interface IndexedAreaSpec {
  readonly kind: 'indexed';
  readonly ranges: readonly IndexRange[];
}

export type AreaSpecMap = { readonly [P in ByteAreaPrefix]?: ByteAreaSpec } & {
  readonly [P in IndexedAreaPrefix]?: IndexedAreaSpec;
};

export interface ProgramLimits {
  readonly maxNetworks: number;
  readonly maxNodesPerNetwork: number;
  readonly maxGridRows: number;
  readonly maxGridCols: number;
}

export interface HardwareProfile {
  readonly id: string;
  readonly vendor: 'Siemens';
  readonly family: 'LOGO!' | 'S7-200';
  readonly model: string;
  readonly class: 'small' | 'medium' | 'large';
  /** Configurable digital I/O envelope; fixed CPUs use min === max. */
  readonly io: { readonly digitalInputs: Bounds; readonly digitalOutputs: Bounds };
  readonly display: { readonly lcd: boolean; readonly rows: number; readonly cols: number };
  /** Derived from `memory` keys by `defineProfile`; never set manually. */
  readonly allowedPrefixes: readonly AreaPrefix[];
  readonly memory: AreaSpecMap;
  readonly limits: ProgramLimits;
}

export const byteAreaSize = (spec: ByteAreaSpec): number => Math.ceil(spec.bitCount / 8);
export const indexedAreaSize = (spec: IndexedAreaSpec): number =>
  spec.ranges.reduce((n, r) => Math.max(n, r.to + 1), 0);

/** Freezes a profile and derives `allowedPrefixes` so it cannot drift from `memory`. */
export function defineProfile(spec: Omit<HardwareProfile, 'allowedPrefixes'>): HardwareProfile {
  const allowedPrefixes = (Object.keys(spec.memory) as AreaPrefix[]).filter(
    (p) => spec.memory[p] !== undefined,
  );
  return Object.freeze({ ...spec, allowedPrefixes });
}

const ALL_WIDTHS: readonly AccessWidth[] = ['bit', 'byte', 'word', 'dword'];
const range = (from: number, to: number): readonly IndexRange[] => [{ from, to }];

/** LOGO! 0BA8: 8-16 DI (I0.0-I1.7), 4-10 DO (Q0.0-Q1.1), few timers/counters, onboard LCD. */
export const LOGO_0BA8 = defineProfile({
  id: 'LOGO_0BA8',
  vendor: 'Siemens',
  family: 'LOGO!',
  model: 'LOGO! 0BA8',
  class: 'small',
  io: { digitalInputs: { min: 8, max: 16 }, digitalOutputs: { min: 4, max: 10 } },
  display: { lcd: true, rows: 4, cols: 12 },
  memory: {
    I: { kind: 'bytes', bitCount: 16, widths: ALL_WIDTHS },
    Q: { kind: 'bytes', bitCount: 10, widths: ALL_WIDTHS },
    M: { kind: 'bytes', bitCount: 64, widths: ALL_WIDTHS },
    V: { kind: 'bytes', bitCount: 850 * 8, widths: ALL_WIDTHS },
    // Still far fewer than a CPU's 256, but wide enough to reach the on-delay pool (T32+).
    T: { kind: 'indexed', ranges: range(0, 63) },
    C: { kind: 'indexed', ranges: range(0, 31) },
  },
  limits: { maxNetworks: 200, maxNodesPerNetwork: 32, maxGridRows: 8, maxGridCols: 8 },
});

/** S7-200 CPU 224: 14 DI (I0.0-I1.5), 10 DO (Q0.0-Q1.1), M0.0-M31.7, 5 KB V-memory, no LCD. */
export const S7_200_CPU224 = defineProfile({
  id: 'S7_200_CPU224',
  vendor: 'Siemens',
  family: 'S7-200',
  model: 'S7-200 CPU 224',
  class: 'medium',
  io: { digitalInputs: { min: 14, max: 14 }, digitalOutputs: { min: 10, max: 10 } },
  display: { lcd: false, rows: 0, cols: 0 },
  memory: {
    I: { kind: 'bytes', bitCount: 14, widths: ALL_WIDTHS },
    Q: { kind: 'bytes', bitCount: 10, widths: ALL_WIDTHS },
    M: { kind: 'bytes', bitCount: 32 * 8, widths: ALL_WIDTHS },
    V: { kind: 'bytes', bitCount: 5120 * 8, widths: ALL_WIDTHS },
    T: { kind: 'indexed', ranges: range(0, 255) },
    C: { kind: 'indexed', ranges: range(0, 255) },
  },
  limits: { maxNetworks: 256, maxNodesPerNetwork: 64, maxGridRows: 16, maxGridCols: 8 },
});

/** S7-200 CPU 226 + expansion modules: 40 DI (I0.0-I4.7), 32 DO (Q0.0-Q3.7), 10 KB V-memory. */
export const S7_200_CPU226_EXP = defineProfile({
  id: 'S7_200_CPU226_EXP',
  vendor: 'Siemens',
  family: 'S7-200',
  model: 'S7-200 CPU 226 + Expansion',
  class: 'large',
  io: { digitalInputs: { min: 40, max: 40 }, digitalOutputs: { min: 32, max: 32 } },
  display: { lcd: false, rows: 0, cols: 0 },
  memory: {
    I: { kind: 'bytes', bitCount: 40, widths: ALL_WIDTHS },
    Q: { kind: 'bytes', bitCount: 32, widths: ALL_WIDTHS },
    M: { kind: 'bytes', bitCount: 32 * 8, widths: ALL_WIDTHS },
    V: { kind: 'bytes', bitCount: 10240 * 8, widths: ALL_WIDTHS },
    T: { kind: 'indexed', ranges: range(0, 255) },
    C: { kind: 'indexed', ranges: range(0, 255) },
  },
  limits: { maxNetworks: 512, maxNodesPerNetwork: 128, maxGridRows: 32, maxGridCols: 8 },
});

const registry = new Map<string, HardwareProfile>();

/** Registers (or replaces) a profile; enables user-defined CPUs without touching core code. */
export function registerProfile(profile: HardwareProfile): void {
  registry.set(profile.id, profile);
}
export const getProfile = (id: string): HardwareProfile | undefined => registry.get(id);
export const listProfiles = (): readonly HardwareProfile[] => Array.from(registry.values());

[LOGO_0BA8, S7_200_CPU224, S7_200_CPU226_EXP].forEach(registerProfile);
