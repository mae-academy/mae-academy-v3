/**
 * SIMATIC LOGO! 0BA4 program model (spec §3.2 / §4). A program is a set of numbered blocks wired by
 * connector references, plus the sinks (Q / M) that consume them. There are no named nets: reuse
 * happens by referencing another block's number, exactly as on the device.
 */

export type Bit = 0 | 1;

/** Global address space of a fully expanded system (spec §1.1). */
export const ADDRESS_SPACE = { I: 24, Q: 16, M: 24 } as const;
/** M8 is forced to 1 for the first scan after RUN is entered (spec §3.3). */
export const STARTUP_FLAG = 8;

/** What a block input (or a sink) is wired to. Digital subset of the spec's connector bus. */
export type ConnectorRef =
  | { readonly kind: 'hi' }
  | { readonly kind: 'lo' }
  /** Open connector: resolves to the consuming block's own default (spec §3.2 table). */
  | { readonly kind: 'x' }
  | { readonly kind: 'digital-input'; readonly index: number }
  /** Read-back of a Q: always the value committed by the previous cycle. */
  | { readonly kind: 'digital-output'; readonly index: number }
  /** Flag: double-buffered, reads return the previous cycle's value. */
  | { readonly kind: 'digital-flag'; readonly index: number }
  | { readonly kind: 'block-output'; readonly blockId: number };

/** One wired block input. `invert` is applied on read, per consumer, never on the source. */
export interface WireIn {
  readonly ref: ConnectorRef;
  readonly invert?: boolean;
}

export type GfType = 'AND' | 'AND_EDGE' | 'NAND' | 'NAND_EDGE' | 'OR' | 'NOR' | 'XOR' | 'NOT';
export type SfType =
  | 'ON_DELAY'
  | 'OFF_DELAY'
  | 'ON_OFF_DELAY'
  | 'RETENTIVE_ON_DELAY'
  | 'WIPING_RELAY'
  | 'PULSE_GENERATOR'
  | 'STAIRWAY'
  | 'UP_DOWN_COUNTER'
  | 'LATCHING_RELAY'
  | 'PULSE_RELAY';
export type BlockType = GfType | SfType;

export type PinName = '1' | '2' | '3' | '4' | 'Trg' | 'S' | 'R' | 'En' | 'Inv' | 'Cnt' | 'Dir';

export type TimeBase = 's' | 'm' | 'h';
/**
 * Literal timer parameter (spec §3.4) in the smallest unit of its timebase:
 * `s` = 1/100 s (SS:hh, max 99:99), `m` = seconds (MM:SS, max 99:59), `h` = minutes (HH:MM, max 99:59).
 */
export interface TimeValue {
  readonly base: TimeBase;
  readonly value: number;
}

export type TimeParamKey = 'T' | 'TH' | 'TL' | 'T!' | 'T!L';
export type CountParamKey = 'On' | 'Off';
export type NumericParamKey = TimeParamKey | CountParamKey;

export interface BlockParams {
  readonly T?: TimeValue;
  readonly TH?: TimeValue;
  readonly TL?: TimeValue;
  /** Stairway pre-warning point, measured as time before expiry. */
  readonly 'T!'?: TimeValue;
  /** Stairway pre-warning (off-blink) duration. */
  readonly 'T!L'?: TimeValue;
  readonly On?: number;
  readonly Off?: number;
  /** Pulse relay priority when S = R = 1. */
  readonly Par?: 'RS' | 'SR';
}

export interface LogoBlock {
  /** Block number `B<id>`, assigned in creation order. */
  readonly id: number;
  readonly type: BlockType;
  readonly inputs: Readonly<Partial<Record<PinName, WireIn>>>;
  readonly params: BlockParams;
  /** `R` (true) keeps the dynamic state across a power cycle; `/` (false) resets it. */
  readonly retentive: boolean;
  /** `-` hides the parameters from parameter-assignment mode; default `+` (visible). */
  readonly protected?: boolean;
}

export type SinkTarget =
  | { readonly kind: 'digital-output'; readonly index: number }
  | { readonly kind: 'digital-flag'; readonly index: number };

export interface Sink {
  readonly target: SinkTarget;
  readonly source: ConnectorRef;
}

export interface LogoProgram {
  readonly name: string;
  readonly blocks: readonly LogoBlock[];
  readonly sinks: readonly Sink[];
}

export const EMPTY_PROGRAM: LogoProgram = { name: '', blocks: [], sinks: [] };

// ---- block catalogue ---------------------------------------------------------------------------

export interface BlockSpec {
  readonly family: 'GF' | 'SF';
  /** Short LCD mnemonic, at most 8 characters. */
  readonly label: string;
  readonly title: string;
  readonly pins: readonly PinName[];
  readonly timeParams: readonly TimeParamKey[];
  readonly countParams: readonly CountParamKey[];
  /** Value an `x` connector resolves to (spec §3.2). */
  readonly xDefault: Bit;
  /** Pins that may not be left open. */
  readonly required: readonly PinName[];
}

const GATE4: readonly PinName[] = ['1', '2', '3', '4'];

export const BLOCK_SPECS: Readonly<Record<BlockType, BlockSpec>> = {
  AND: { family: 'GF', label: 'AND', title: 'AND', pins: GATE4, timeParams: [], countParams: [], xDefault: 1, required: [] },
  AND_EDGE: { family: 'GF', label: 'AND-edge', title: 'AND (edge)', pins: GATE4, timeParams: [], countParams: [], xDefault: 1, required: [] },
  NAND: { family: 'GF', label: 'NAND', title: 'NAND', pins: GATE4, timeParams: [], countParams: [], xDefault: 1, required: [] },
  NAND_EDGE: { family: 'GF', label: 'NANDedge', title: 'NAND (edge)', pins: GATE4, timeParams: [], countParams: [], xDefault: 1, required: [] },
  OR: { family: 'GF', label: 'OR', title: 'OR', pins: GATE4, timeParams: [], countParams: [], xDefault: 0, required: [] },
  NOR: { family: 'GF', label: 'NOR', title: 'NOR', pins: GATE4, timeParams: [], countParams: [], xDefault: 0, required: [] },
  XOR: { family: 'GF', label: 'XOR', title: 'XOR', pins: ['1', '2'], timeParams: [], countParams: [], xDefault: 0, required: [] },
  NOT: { family: 'GF', label: 'NOT', title: 'NOT', pins: ['1'], timeParams: [], countParams: [], xDefault: 1, required: ['1'] },
  ON_DELAY: { family: 'SF', label: 'OnDly', title: 'On-delay', pins: ['Trg'], timeParams: ['T'], countParams: [], xDefault: 0, required: [] },
  OFF_DELAY: { family: 'SF', label: 'OffDly', title: 'Off-delay', pins: ['Trg', 'R'], timeParams: ['T'], countParams: [], xDefault: 0, required: [] },
  ON_OFF_DELAY: { family: 'SF', label: 'OnOffDly', title: 'On-/Off-delay', pins: ['Trg'], timeParams: ['TH', 'TL'], countParams: [], xDefault: 0, required: [] },
  RETENTIVE_ON_DELAY: { family: 'SF', label: 'RetOnDly', title: 'Retentive on-delay', pins: ['Trg', 'R'], timeParams: ['T'], countParams: [], xDefault: 0, required: [] },
  WIPING_RELAY: { family: 'SF', label: 'Wiping', title: 'Wiping relay', pins: ['Trg'], timeParams: ['T'], countParams: [], xDefault: 0, required: [] },
  PULSE_GENERATOR: { family: 'SF', label: 'PulseGen', title: 'Asynchronous pulse generator', pins: ['En', 'Inv'], timeParams: ['TH', 'TL'], countParams: [], xDefault: 0, required: [] },
  STAIRWAY: { family: 'SF', label: 'Stairway', title: 'Stairway lighting switch', pins: ['Trg'], timeParams: ['T', 'T!', 'T!L'], countParams: [], xDefault: 0, required: [] },
  UP_DOWN_COUNTER: { family: 'SF', label: 'Counter', title: 'Up/down counter', pins: ['R', 'Cnt', 'Dir'], timeParams: [], countParams: ['On', 'Off'], xDefault: 0, required: [] },
  LATCHING_RELAY: { family: 'SF', label: 'Latch', title: 'Latching relay', pins: ['S', 'R'], timeParams: [], countParams: [], xDefault: 0, required: [] },
  PULSE_RELAY: { family: 'SF', label: 'PulseRel', title: 'Pulse relay', pins: ['Trg', 'S', 'R'], timeParams: [], countParams: [], xDefault: 0, required: [] },
};

export const isBlockType = (value: unknown): value is BlockType => typeof value === 'string' && Object.hasOwn(BLOCK_SPECS, value);

/** Display name of a connector: `I3`, `Q1`, `M8`, `B4`, `hi`, `lo`, `x`. */
export function connectorName(ref: ConnectorRef): string {
  switch (ref.kind) {
    case 'hi':
    case 'lo':
    case 'x':
      return ref.kind;
    case 'digital-input':
      return `I${ref.index}`;
    case 'digital-output':
      return `Q${ref.index}`;
    case 'digital-flag':
      return `M${ref.index}`;
    case 'block-output':
      return `B${ref.blockId}`;
    default: {
      const exhaustive: never = ref;
      return exhaustive;
    }
  }
}

export const sinkName = (target: SinkTarget): string => `${target.kind === 'digital-output' ? 'Q' : 'M'}${target.index}`;

export const sameConnector = (a: ConnectorRef, b: ConnectorRef): boolean => connectorName(a) === connectorName(b);
