/**
 * Dynamic Logic Design geometry — pure, React-free layout contract.
 * The canvas snaps final terminal positions to its 25px lattice; this local
 * contract keeps pin pitch and body bounds centered before that projection.
 */

import type { CircuitWire } from './circuitTypes';

export const SCALABLE_LOGIC_GATE_TYPES = new Set(['gate-and', 'gate-or', 'gate-nand', 'gate-nor', 'gate-xor', 'gate-xnor']);
export const DYNAMIC_GATE_MIN_INPUTS = 2;
export const DYNAMIC_GATE_MAX_INPUTS = 8;
export const DYNAMIC_PIN_PITCH = 20;
export const DYNAMIC_BASE_PADDING = 20;
export const SELECTOR_COUNT_OPTIONS = [1, 2, 3] as const;
export const BIT_WIDTH_OPTIONS = [4, 8] as const;
const GATE_INPUT_IDS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;

export type DynamicGateGeometry = {
  inputCount: number;
  width: number;
  height: number;
  bodyHeight: number;
  inputX: number;
  outputX: number;
  inputY: readonly number[];
};

export type LogicBlockGeometry = {
  width: number;
  height: number;
  bodyHeight: number;
};

/** 50/3 local units project to one 25px workspace step at the Digital Logic symbol scale (1.5). */
export const LOGIC_SYMBOL_GRID_UNIT = 50 / 3;
export type LogicSymbolPin = { id: string; x: number; y: number; type: 'input' | 'output'; side: 'left' | 'right' | 'top' | 'bottom' };
export type LogicBlockLayout = { width: number; height: number; bodyHalfWidth: number; bodyHalfHeight: number; pins: LogicSymbolPin[] };

export const isScalableLogicGate = (type: string) => SCALABLE_LOGIC_GATE_TYPES.has(type);

export const inputCountForGate = (type: string, value: unknown) => {
  const maximum = isScalableLogicGate(type) ? DYNAMIC_GATE_MAX_INPUTS : 4;
  return Math.max(DYNAMIC_GATE_MIN_INPUTS, Math.min(maximum, Math.round(Number(value) || DYNAMIC_GATE_MIN_INPUTS)));
};

export const gateInputIdsFor = (type: string, value: unknown) => GATE_INPUT_IDS.slice(0, inputCountForGate(type, value));
export const centeredPinAxisFor = (count: number, pitch = DYNAMIC_PIN_PITCH) => Array.from({ length: count }, (_, index) => (index - (count - 1) / 2) * pitch);
export const logicBlockGeometryFor = (inputCount: number, outputCount: number): LogicBlockGeometry => {
  const height = Math.max(60, DYNAMIC_BASE_PADDING + Math.max(inputCount, outputCount) * DYNAMIC_PIN_PITCH);
  return { width: 100, height, bodyHeight: height - 14 };
};

/** Places even pin counts on odd local grid coordinates so SVG scaling lands on the 25px workspace lattice. */
export const logicSymbolPinAxisFor = (count: number) => Array.from({ length: count }, (_, index) => (index * 2 - (count - 1)) * LOGIC_SYMBOL_GRID_UNIT);
const pinGroupsFor = (type: string, inputs: string[], outputs: string[]) => {
  let left = [...inputs]; let right = [...outputs]; let top: string[] = []; let bottom: string[] = []; let bottomOutputs: string[] = [];
  const takeInputs = (predicate: (pin: string) => boolean) => { const selected = left.filter(predicate); left = left.filter(pin => !predicate(pin)); return selected; };
  const takeOutputs = (predicate: (pin: string) => boolean) => { const selected = right.filter(predicate); right = right.filter(pin => !predicate(pin)); return selected; };
  if (type === 'logic-mux' || type === 'logic-demux') bottom = takeInputs(pin => pin.startsWith('s') || pin === 'en');
  else if (type === 'logic-decoder') { bottom = takeInputs(pin => pin.startsWith('s') || pin === 'en'); left = []; }
  else if (type === 'logic-alu-4bit') { bottom = takeInputs(pin => pin.startsWith('op') || pin === 'cin'); bottomOutputs = takeOutputs(pin => pin === 'cout' || pin === 'zero'); }
  else if (type === 'logic-half-adder' || type === 'logic-full-adder' || type === 'logic-half-subtractor' || type === 'logic-full-subtractor' || type === 'logic-nbit-adder') { top = takeInputs(pin => pin === 'cin'); bottomOutputs = takeOutputs(pin => pin === 'cout' || pin === 'carry' || pin === 'borrow' || pin === 'bout'); }
  else if (type === 'logic-ram-16x8') bottom = takeInputs(pin => pin === 'we' || pin === 'oe' || pin === 'clk' || pin === 'cs');
  else if (type === 'logic-rom-16x8') bottom = takeInputs(pin => pin === 'oe' || pin === 'cs');
  else if (type === 'logic-nbit-register') bottom = takeInputs(pin => pin === 'clear');
  else if (type === 'logic-frequency-divider') bottom = takeInputs(pin => pin === 'reset');
  return { left, right, top, bottom, bottomOutputs };
};

export const logicBlockLayoutFor = (type: string, inputs: string[], outputs: string[]): LogicBlockLayout => {
  const groups = pinGroupsFor(type, inputs, outputs);
  const maxVertical = Math.max(groups.left.length, groups.right.length, 1);
  const maxHorizontal = Math.max(groups.top.length, groups.bottom.length + groups.bottomOutputs.length, 1);
  const bodyHalfHeight = Math.max(50, (maxVertical + 1) * LOGIC_SYMBOL_GRID_UNIT);
  const bodyHalfWidth = Math.max(50, (maxHorizontal + 1) * LOGIC_SYMBOL_GRID_UNIT);
  const lead = LOGIC_SYMBOL_GRID_UNIT;
  const bottomAxis = logicSymbolPinAxisFor(groups.bottom.length + groups.bottomOutputs.length);
  const pins: LogicSymbolPin[] = [
    ...groups.left.map((id, index) => ({ id, type: 'input' as const, side: 'left' as const, x: -bodyHalfWidth - lead, y: logicSymbolPinAxisFor(groups.left.length)[index] })),
    ...groups.right.map((id, index) => ({ id, type: 'output' as const, side: 'right' as const, x: bodyHalfWidth + lead, y: logicSymbolPinAxisFor(groups.right.length)[index] })),
    ...groups.top.map((id, index) => ({ id, type: 'input' as const, side: 'top' as const, x: logicSymbolPinAxisFor(groups.top.length)[index], y: -bodyHalfHeight - lead })),
    ...groups.bottom.map((id, index) => ({ id, type: 'input' as const, side: 'bottom' as const, x: bottomAxis[index], y: bodyHalfHeight + lead })),
    ...groups.bottomOutputs.map((id, index) => ({ id, type: 'output' as const, side: 'bottom' as const, x: bottomAxis[groups.bottom.length + index], y: bodyHalfHeight + lead })),
  ];
  return { width: 2 * (bodyHalfWidth + lead), height: 2 * (bodyHalfHeight + lead), bodyHalfWidth, bodyHalfHeight, pins };
};

/** Returns the true SVG body intersection for an external pin lead. */
export const logicBodyBoundaryForPin = (type: string, pin: LogicSymbolPin, layout: LogicBlockLayout): readonly [number, number] => {
  const { bodyHalfWidth: w, bodyHalfHeight: h } = layout;
  if (type === 'logic-mux' && pin.side === 'bottom') return [pin.x, h - (0.19 * h * (pin.x + w) / w)];
  if (type === 'logic-demux' && pin.side === 'bottom') return [pin.x, 0.62 * h + (0.19 * h * (pin.x + w) / w)];
  if (type === 'logic-alu-4bit' && pin.side === 'left' && Math.abs(pin.y) <= 0.34 * h) {
    const magnitude = Math.abs(pin.y);
    return [-w + 17 * (1 - magnitude / (0.34 * h)), pin.y];
  }
  if (pin.side === 'left') return [-w, pin.y];
  if (pin.side === 'right') return [w, pin.y];
  if (pin.side === 'top') return [pin.x, -h];
  return [pin.x, h];
};

const clampToOptions = (value: unknown, options: readonly number[], fallback: number) => {
  const candidate = Math.round(Number(value));
  return options.includes(candidate) ? candidate : fallback;
};
export const selectorCountFor = (value: unknown) => clampToOptions(value, SELECTOR_COUNT_OPTIONS, 2);
export const bitWidthFor = (value: unknown) => clampToOptions(value, BIT_WIDTH_OPTIONS, 4);
export const selectorPinIdsFor = (selectorCount: unknown) => Array.from({ length: selectorCountFor(selectorCount) }, (_, index) => `s${index}`);
export const dataPinIdsFor = (selectorCount: unknown) => Array.from({ length: 2 ** selectorCountFor(selectorCount) }, (_, index) => `d${index}`);
export const decoderOutputPinIdsFor = (selectorCount: unknown) => Array.from({ length: 2 ** selectorCountFor(selectorCount) }, (_, index) => `y${index}`);
export const bitPinIdsFor = (prefix: string, bitWidth: unknown) => Array.from({ length: bitWidthFor(bitWidth) }, (_, index) => `${prefix}${index}`);
export const isSelectorScalableLogic = (type: string) => type === 'logic-mux' || type === 'logic-decoder' || type === 'logic-demux' || type === 'logic-encoder';
export const isBitScalableLogic = (type: string) => type === 'logic-nbit-adder' || type === 'logic-nbit-register';
export const isDynamicallyScalableLogic = (type: string) => isScalableLogicGate(type) || isSelectorScalableLogic(type) || isBitScalableLogic(type);
export type DynamicScaleConfig = { key: 'inputCount' | 'selectorCount' | 'bitWidth'; label: string; unitLabel: string; options: readonly number[] };
export const dynamicScaleConfigFor = (type: string): DynamicScaleConfig | null => {
  if (isScalableLogicGate(type)) return { key: 'inputCount', label: 'Input Count', unitLabel: 'inputs', options: [2, 3, 4, 5, 6, 7, 8] };
  if (isSelectorScalableLogic(type)) return { key: 'selectorCount', label: 'Selector Count', unitLabel: 'selectors', options: SELECTOR_COUNT_OPTIONS };
  if (isBitScalableLogic(type)) return { key: 'bitWidth', label: 'Bit Width', unitLabel: 'bits', options: BIT_WIDTH_OPTIONS };
  return null;
};
export const normalizeDynamicScaleValue = (type: string, value: unknown) => {
  const config = dynamicScaleConfigFor(type);
  if (!config) return value;
  if (config.key === 'inputCount') return inputCountForGate(type, value);
  if (config.key === 'selectorCount') return selectorCountFor(value);
  return bitWidthFor(value);
};

export const dynamicGateGeometryFor = (type: string, value: unknown): DynamicGateGeometry => {
  const inputCount = inputCountForGate(type, value);
  const height = Math.max(60, DYNAMIC_BASE_PADDING + inputCount * DYNAMIC_PIN_PITCH);
  return {
    inputCount,
    width: 70,
    height,
    bodyHeight: height - 14,
    inputX: -35,
    outputX: 45,
    inputY: centeredPinAxisFor(inputCount),
  };
};

/** Removes every edge that touches a terminal no longer registered by the resized component. */
export const pruneWiresForTerminalSet = (wires: CircuitWire[], componentId: string, allowedTerminalIds: ReadonlySet<string>) => wires.filter(wire => (
  (wire.fromComp !== componentId || allowedTerminalIds.has(wire.fromTerm))
  && (wire.toComp !== componentId || allowedTerminalIds.has(wire.toTerm))
));
