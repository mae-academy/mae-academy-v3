import { loadOf, type ActuatorKind, type ContactType, type LampColor, type LoadKind, type OutputLoad } from '../hardware/devices';
import type { BlockParams, BlockType, ConnectorRef, LogoBlock, Sink, TimeValue, WireIn } from '@shared/logo/types';
import type { BenchInput } from '../scenarios';

/** Compact notation for the preloaded circuit programs; every program is still validated by compileProgram. */

export const ref = {
  I: (index: number): ConnectorRef => ({ kind: 'digital-input', index }),
  Q: (index: number): ConnectorRef => ({ kind: 'digital-output', index }),
  M: (index: number): ConnectorRef => ({ kind: 'digital-flag', index }),
  B: (blockId: number): ConnectorRef => ({ kind: 'block-output', blockId }),
};
export const on = (r: ConnectorRef): WireIn => ({ ref: r });
export const not = (r: ConnectorRef): WireIn => ({ ref: r, invert: true });
export const X: WireIn = { ref: { kind: 'x' } };

/** Seconds timebase literal (`SS:hh`, 10 ms resolution, max 99.99 s). */
export const sec = (seconds: number): TimeValue => ({ base: 's', value: Math.round(seconds * 100) });

export function block(id: number, type: BlockType, inputs: LogoBlock['inputs'], params: BlockParams = {}, retentive = false): LogoBlock {
  return { id, type, inputs, params, retentive };
}

/** Four-input basic function; unused pins stay open (`x`). */
export const gate = (id: number, type: 'AND' | 'OR' | 'NAND' | 'NOR' | 'AND_EDGE' | 'NAND_EDGE', pins: readonly WireIn[]): LogoBlock =>
  block(id, type, { '1': pins[0] ?? X, '2': pins[1] ?? X, '3': pins[2] ?? X, '4': pins[3] ?? X });

export const toQ = (index: number, source: ConnectorRef): Sink => ({ target: { kind: 'digital-output', index }, source });
export const toM = (index: number, source: ConnectorRef): Sink => ({ target: { kind: 'digital-flag', index }, source });

export const dev = (kind: ActuatorKind, contact: ContactType, symbol: string, tag: string, actuated = false): BenchInput => ({
  device: { kind, contact, symbol, tag },
  actuated,
});
export const spare = (index: number): BenchInput => dev('spare', 'NO', `X${index}`, 'Spare');

export const load = (kind: LoadKind, symbol: string, tag: string, color?: LampColor): OutputLoad => ({
  kind,
  symbol,
  tag,
  ...(color ? { color } : kind === 'lamp' ? { color: 'red' } : {}),
});
export const spareLoad = (index: number): OutputLoad => loadOf('none', index);

/** Pads a partial I/O list to the Basic unit's 8 inputs / 4 outputs with spares. */
export const inputs8 = (list: readonly BenchInput[]): BenchInput[] => Array.from({ length: 8 }, (_, i) => list[i] ?? spare(i + 1));
export const loads4 = (list: readonly OutputLoad[]): OutputLoad[] => Array.from({ length: 4 }, (_, i) => list[i] ?? spareLoad(i + 1));
