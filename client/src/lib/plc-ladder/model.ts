/**
 * PLC Ladder backend contract.
 * Program and tag initialization stays isolated from parsing, execution, and all UI state.
 */
import type { PlcAoi, PlcCounterValue, PlcDataType, PlcFbdCounterValue, PlcFbdOneShotValue, PlcFbdTimerValue, PlcRuntimeValue, PlcTag, PlcTimerValue } from './types';

export const PLC_DATA_TYPES: Readonly<Record<PlcDataType, { category: 'boolean' | 'integer' | 'float' | 'timer' | 'counter' | 'oneshot'; scalar: boolean }>> = {
  BOOL: { category: 'boolean', scalar: true },
  DINT: { category: 'integer', scalar: true },
  REAL: { category: 'float', scalar: true },
  TIMER: { category: 'timer', scalar: false },
  COUNTER: { category: 'counter', scalar: false },
  FBD_TIMER: { category: 'timer', scalar: false },
  FBD_COUNTER: { category: 'counter', scalar: false },
  FBD_ONESHOT: { category: 'oneshot', scalar: false },
};

const timerValue = (): PlcTimerValue => ({ PRE: 0, ACC: 0, EN: false, TT: false, DN: false });
const counterValue = (): PlcCounterValue => ({ PRE: 0, ACC: 0, CU: false, CD: false, DN: false, OV: false, UN: false });
const fbdTimerValue = (): PlcFbdTimerValue => ({ ...timerValue(), EnableIn: true, TimerEnable: false, Reset: false, EnableOut: true, Status: 0, InstructFault: false, PresetInv: false });
const fbdCounterValue = (): PlcFbdCounterValue => ({ ...counterValue(), EnableIn: true, CUEnable: false, CDEnable: false, Reset: false, EnableOut: true });
const fbdOneShotValue = (): PlcFbdOneShotValue => ({ EnableIn: true, InputBit: false, EnableOut: true, OutputBit: false });

export function clonePlcValue<T extends PlcRuntimeValue>(value: T): T {
  if (Array.isArray(value)) return value.map(item => clonePlcValue(item)) as T;
  if (typeof value === 'object' && value !== null) return structuredClone(value) as T;
  return value;
}

export function initialValueForTag(tag: PlcTag): PlcRuntimeValue {
  const value = tag.defaultValue;
  let base: PlcRuntimeValue;
  if (value !== undefined) base = clonePlcValue(value as PlcRuntimeValue);
  else if (tag.dataType === 'BOOL') base = false;
  else if (tag.dataType === 'DINT' || tag.dataType === 'REAL') base = 0;
  else if (tag.dataType === 'TIMER') base = timerValue();
  else if (tag.dataType === 'COUNTER') base = counterValue();
  else if (tag.dataType === 'FBD_TIMER') base = fbdTimerValue();
  else if (tag.dataType === 'FBD_COUNTER') base = fbdCounterValue();
  else base = fbdOneShotValue();
  const dimension = Number.isInteger(tag.dimension) && (tag.dimension ?? 0) > 0 ? tag.dimension! : 0;
  return dimension ? Array.from({ length: dimension }, () => clonePlcValue(base)) : base;
}

export function createPlcAoi(name = 'PLC Program'): PlcAoi {
  return { name, description: '', tags: [], routines: { Logic: { type: 'ld', content: ';' } } };
}

export function buildPlcState(aoi: PlcAoi): { parameters: Record<string, PlcRuntimeValue>; localTags: Record<string, PlcRuntimeValue> } {
  const parameters: Record<string, PlcRuntimeValue> = {};
  const localTags: Record<string, PlcRuntimeValue> = {};
  for (const tag of aoi.tags) {
    const target = tag.usage === 'local' ? localTags : parameters;
    target[tag.name] = initialValueForTag(tag);
  }
  return { parameters, localTags };
}
