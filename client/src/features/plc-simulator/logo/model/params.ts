import { msToUnits } from '@shared/logo/time';
import { BLOCK_SPECS, type LogoProgram, type NumericParamKey, type TimeBase } from '@shared/logo/types';
import { INITIAL_BLOCK_STATE, type BlockState } from '@shared/logo/state';

/** One editable parameter as parameter-assignment mode lists it. */
export interface ParamView {
  readonly blockId: number;
  readonly key: NumericParamKey;
  readonly kind: 'time' | 'count';
  /** Time params: timebase units; count params: the threshold. */
  readonly value: number;
  readonly base: TimeBase | null;
  /** Live actual value: `Ta` in timebase units, or `Cnt`. */
  readonly actual: number;
}

/** Every parameter visible in parameter-assignment mode (`+` protection), in block order. */
export function paramViews(program: LogoProgram, stateOf: (blockId: number) => BlockState = () => INITIAL_BLOCK_STATE): ParamView[] {
  const views: ParamView[] = [];
  for (const block of [...program.blocks].sort((a, b) => a.id - b.id)) {
    if (block.protected) continue;
    const spec = BLOCK_SPECS[block.type];
    const state = stateOf(block.id);
    for (const key of spec.timeParams) {
      const time = block.params[key];
      if (!time) continue;
      views.push({ blockId: block.id, key, kind: 'time', value: time.value, base: time.base, actual: msToUnits(state.ta, time.base) });
    }
    for (const key of spec.countParams) {
      views.push({ blockId: block.id, key, kind: 'count', value: block.params[key] ?? 0, base: null, actual: state.cnt });
    }
  }
  return views;
}
