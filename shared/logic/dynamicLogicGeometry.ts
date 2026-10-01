/**
 * Dynamic Logic Design geometry — pure, React-free layout contract.
 *
 * ══════════════════════════════════════════════════════════════════════
 * EXPANDABLE-SLOT PIN MODEL
 * ══════════════════════════════════════════════════════════════════════
 *
 * Every pin sits at an integer multiple of GRID (25px) — exact grid dot.
 *
 * Pin slots, numbered from the centre outward:
 *
 *   Odd  N: slots −⌊N/2⌋ … 0 … +⌊N/2⌋  (includes y=0)
 *   Even N: slots ±1, ±2 … ±N/2          (y=0 stays OPEN → 3rd pin drops
 *                                           cleanly to centre without shifting
 *                                           any existing terminal)
 *   slot k  →  y = k × GRID
 *
 *   N=1 : [0]
 *   N=2 : [−25, +25]          ← y=0 open for 3-input expansion
 *   N=3 : [−25,   0, +25]     ← 3rd pin fills centre slot
 *   N=4 : [−50, −25, +25, +50]
 *   N=5 : [−50, −25,   0, +25, +50]
 *
 * ══════════════════════════════════════════════════════════════════════
 * COMPACT GATE BODY SIZING
 * ══════════════════════════════════════════════════════════════════════
 *
 * halfH = outerPinY(N) + GRID/2   (12.5px arc overhang beyond outermost pin)
 *
 *   N=2 : outerPin=25, halfH=37.5, bodyHeight= 75  ← compact, proportional
 *   N=3 : outerPin=25, halfH=37.5, bodyHeight= 75  ← same body, centre pin added
 *   N=4 : outerPin=50, halfH=62.5, bodyHeight=125
 *   N=8 : outerPin=100,halfH=112.5,bodyHeight=225
 *
 * ══════════════════════════════════════════════════════════════════════
 * IC BLOCK BODY SIZING (separate from gates)
 * ══════════════════════════════════════════════════════════════════════
 *
 * bodyHalfHeight = outerPinY(N) + GRID  (full 25px symmetric padding each side)
 *
 *   N=2 : halfH=50  → topClear=25px, botClear=25px  ✓ symmetric
 *   N=4 : halfH=75  → topClear=25px, botClear=25px  ✓ symmetric
 */

import type { CircuitWire } from './circuitTypes';

/** Canvas snap lattice. Every terminal coordinate MUST be an exact multiple of this. */
export const GRID = 25;

export const SCALABLE_LOGIC_GATE_TYPES = new Set(['gate-and', 'gate-or', 'gate-nand', 'gate-nor', 'gate-xor', 'gate-xnor']);
export const DYNAMIC_GATE_MIN_INPUTS = 2;
export const DYNAMIC_GATE_MAX_INPUTS = 8;

/** Pitch between adjacent occupied slots = 1 GRID unit (25 px). */
export const DYNAMIC_PIN_PITCH = GRID;
export const DYNAMIC_BASE_PADDING = GRID;
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

export const LOGIC_SYMBOL_GRID_UNIT = GRID;
export type LogicSymbolPin = { id: string; x: number; y: number; type: 'input' | 'output'; side: 'left' | 'right' | 'top' | 'bottom' };
export type LogicBlockLayout = { width: number; height: number; bodyHalfWidth: number; bodyHalfHeight: number; pins: LogicSymbolPin[] };

export const isScalableLogicGate = (type: string) => SCALABLE_LOGIC_GATE_TYPES.has(type);

export const inputCountForGate = (type: string, value: unknown) => {
  const maximum = isScalableLogicGate(type) ? DYNAMIC_GATE_MAX_INPUTS : 4;
  return Math.max(DYNAMIC_GATE_MIN_INPUTS, Math.min(maximum, Math.round(Number(value) || DYNAMIC_GATE_MIN_INPUTS)));
};

export const gateInputIdsFor = (type: string, value: unknown) => GATE_INPUT_IDS.slice(0, inputCountForGate(type, value));

/**
 * Absolute Y of the outermost pin for N inputs.
 *   N=1→0  N=2→25  N=3→25  N=4→50  N=5→50  …
 */
const outerPinY = (N: number): number => Math.ceil(N / 2) * GRID;

/**
 * Expandable-slot pin Y-coordinates for N pins.
 *
 * • Odd  N → fills slots −⌊N/2⌋ … 0 … +⌊N/2⌋ (includes centre y=0).
 * • Even N → fills slots ±1 … ±N/2, skipping centre so y=0 remains open
 *            for the next pin to arrive at exactly y=0.
 *
 * Every value is an exact integer multiple of GRID (25).
 */
export const slotPinsFor = (N: number): readonly number[] => {
  if (N <= 1) return [0];
  if (N % 2 === 0) {
    const half = N / 2;
    const neg = Array.from({ length: half }, (_, i) => -(half - i) * GRID);
    const pos = Array.from({ length: half }, (_, i) => (i + 1) * GRID);
    return [...neg, ...pos];
  }
  const half = Math.floor(N / 2);
  return Array.from({ length: N }, (_, i) => (i - half) * GRID);
};

/**
 * Alias kept for backward-compatibility. Delegates to slotPinsFor().
 */
export const centeredPinAxisFor = (count: number, _pitch = DYNAMIC_PIN_PITCH): readonly number[] =>
  slotPinsFor(count);

/**
 * Pin Y-coordinates for IC block side-pins using the same slot model,
 * so that block terminals are always symmetric and on exact grid dots.
 */
export const logicSymbolPinAxisFor = (count: number): readonly number[] =>
  slotPinsFor(count);

export const logicBlockGeometryFor = (inputCount: number, outputCount: number): LogicBlockGeometry => {
  const height = Math.max(GRID * 2, DYNAMIC_BASE_PADDING + Math.max(inputCount, outputCount) * DYNAMIC_PIN_PITCH);
  return { width: 100, height, bodyHeight: height - 14 };
};

const pinGroupsFor = (type: string, inputs: string[], outputs: string[]) => {
  let left = [...inputs]; let right = [...outputs]; let top: string[] = []; let bottom: string[] = []; let bottomOutputs: string[] = [];
  const takeInputs  = (p: (pin: string) => boolean) => { const s = left.filter(p);  left  = left.filter(pin => !p(pin));  return s; };
  const takeOutputs = (p: (pin: string) => boolean) => { const s = right.filter(p); right = right.filter(pin => !p(pin)); return s; };
  if (type === 'logic-mux' || type === 'logic-demux') bottom = takeInputs(pin => pin.startsWith('s') || pin === 'en');
  else if (type === 'logic-decoder') { bottom = takeInputs(pin => pin.startsWith('s') || pin === 'en'); left = []; }
  else if (type === 'logic-alu-4bit') { bottom = takeInputs(pin => pin.startsWith('op') || pin === 'cin'); bottomOutputs = takeOutputs(pin => pin === 'cout' || pin === 'zero'); }
  else if (['logic-half-adder','logic-full-adder','logic-half-subtractor','logic-full-subtractor','logic-nbit-adder'].includes(type)) { top = takeInputs(pin => pin === 'cin'); bottomOutputs = takeOutputs(pin => pin === 'cout' || pin === 'carry' || pin === 'borrow' || pin === 'bout'); }
  else if (type === 'logic-ram-16x8') bottom = takeInputs(pin => pin === 'we' || pin === 'oe' || pin === 'clk' || pin === 'cs');
  else if (type === 'logic-rom-16x8') bottom = takeInputs(pin => pin === 'oe' || pin === 'cs');
  else if (type === 'logic-nbit-register') bottom = takeInputs(pin => pin === 'clear');
  else if (type === 'logic-frequency-divider') bottom = takeInputs(pin => pin === 'reset');
  return { left, right, top, bottom, bottomOutputs };
};

export const logicBlockLayoutFor = (type: string, inputs: string[], outputs: string[]): LogicBlockLayout => {
  const groups = pinGroupsFor(type, inputs, outputs);
  const maxVertical   = Math.max(groups.left.length, groups.right.length, 1);
  const maxHorizontal = Math.max(groups.top.length, groups.bottom.length + groups.bottomOutputs.length, 1);

  // Block body: exactly GRID (25px) symmetric top & bottom padding around outermost pin.
  // → topClearance === bottomClearance === GRID for every pin count.
  const bodyHalfHeight = type === 'logic-clock' ? 20 : Math.max(GRID * 2, outerPinY(maxVertical)   + GRID);
  const bodyHalfWidth  = type === 'logic-clock' ? 20 : Math.max(GRID * 2, outerPinY(maxHorizontal) + GRID);

  // Clock is a compact 40×40 source: body ±20 plus a 30px lead puts its pin on the 50px grid column.
  const lead = type === 'logic-clock' ? 30 : LOGIC_SYMBOL_GRID_UNIT;
  const bottomAxis = slotPinsFor(groups.bottom.length + groups.bottomOutputs.length);
  const pins: LogicSymbolPin[] = [
    ...groups.left.map((id, i)  => ({ id, type: 'input'  as const, side: 'left'   as const, x: -bodyHalfWidth - lead, y: slotPinsFor(groups.left.length)[i]  })),
    ...groups.right.map((id, i) => ({ id, type: 'output' as const, side: 'right'  as const, x:  bodyHalfWidth + lead, y: slotPinsFor(groups.right.length)[i] })),
    ...groups.top.map((id, i)   => ({ id, type: 'input'  as const, side: 'top'    as const, x: slotPinsFor(groups.top.length)[i], y: -bodyHalfHeight - lead })),
    ...groups.bottom.map((id, i) => ({ id, type: 'input' as const, side: 'bottom' as const, x: bottomAxis[i],                     y:  bodyHalfHeight + lead })),
    ...groups.bottomOutputs.map((id, i) => ({ id, type: 'output' as const, side: 'bottom' as const, x: bottomAxis[groups.bottom.length + i], y: bodyHalfHeight + lead })),
  ];
  return { width: 2 * (bodyHalfWidth + lead), height: 2 * (bodyHalfHeight + lead), bodyHalfWidth, bodyHalfHeight, pins };
};

/** Returns the true SVG body intersection for an external pin lead. */
export const logicBodyBoundaryForPin = (type: string, pin: LogicSymbolPin, layout: LogicBlockLayout): readonly [number, number] => {
  const { bodyHalfWidth: w, bodyHalfHeight: h } = layout;
  if (type === 'logic-mux'  && pin.side === 'bottom') return [pin.x, h - (0.19 * h * (pin.x + w) / w)];
  if (type === 'logic-demux' && pin.side === 'bottom') return [pin.x, 0.62 * h + (0.19 * h * (pin.x + w) / w)];
  if (type === 'logic-alu-4bit' && pin.side === 'left' && Math.abs(pin.y) <= 0.34 * h) {
    return [-w + 17 * (1 - Math.abs(pin.y) / (0.34 * h)), pin.y];
  }
  if (pin.side === 'left')   return [-w, pin.y];
  if (pin.side === 'right')  return [w,  pin.y];
  if (pin.side === 'top')    return [pin.x, -h];
  return [pin.x, h];
};

const clampToOptions = (value: unknown, options: readonly number[], fallback: number) => {
  const candidate = Math.round(Number(value));
  return options.includes(candidate) ? candidate : fallback;
};
export const selectorCountFor    = (value: unknown) => clampToOptions(value, SELECTOR_COUNT_OPTIONS, 2);
export const bitWidthFor         = (value: unknown) => clampToOptions(value, BIT_WIDTH_OPTIONS, 4);
export const selectorPinIdsFor   = (sc: unknown) => Array.from({ length: selectorCountFor(sc) }, (_, i) => `s${i}`);
export const dataPinIdsFor       = (sc: unknown) => Array.from({ length: 2 ** selectorCountFor(sc) }, (_, i) => `d${i}`);
export const decoderOutputPinIdsFor = (sc: unknown) => Array.from({ length: 2 ** selectorCountFor(sc) }, (_, i) => `y${i}`);
export const bitPinIdsFor        = (prefix: string, bw: unknown) => Array.from({ length: bitWidthFor(bw) }, (_, i) => `${prefix}${i}`);
export const isSelectorScalableLogic  = (type: string) => type === 'logic-mux' || type === 'logic-decoder' || type === 'logic-demux' || type === 'logic-encoder';
export const isBitScalableLogic       = (type: string) => type === 'logic-nbit-adder' || type === 'logic-nbit-register';
export const isDynamicallyScalableLogic = (type: string) => isScalableLogicGate(type) || isSelectorScalableLogic(type) || isBitScalableLogic(type);
export type DynamicScaleConfig = { key: 'inputCount' | 'selectorCount' | 'bitWidth'; label: string; unitLabel: string; options: readonly number[] };
export const dynamicScaleConfigFor = (type: string): DynamicScaleConfig | null => {
  if (isScalableLogicGate(type))     return { key: 'inputCount',    label: 'Input Count',    unitLabel: 'inputs',    options: [2, 3, 4, 5, 6, 7, 8] };
  if (isSelectorScalableLogic(type)) return { key: 'selectorCount', label: 'Selector Count', unitLabel: 'selectors', options: SELECTOR_COUNT_OPTIONS };
  if (isBitScalableLogic(type))      return { key: 'bitWidth',      label: 'Bit Width',      unitLabel: 'bits',      options: BIT_WIDTH_OPTIONS };
  return null;
};
export const normalizeDynamicScaleValue = (type: string, value: unknown) => {
  const config = dynamicScaleConfigFor(type);
  if (!config) return value;
  if (config.key === 'inputCount')    return inputCountForGate(type, value);
  if (config.key === 'selectorCount') return selectorCountFor(value);
  return bitWidthFor(value);
};

export const dynamicGateGeometryFor = (type: string, value: unknown): DynamicGateGeometry => {
  const inputCount = inputCountForGate(type, value);
  // Compact body sizing: outerPinY + GRID/2 = 12.5px arc overhang past outermost pin.
  // This is constant for every N, so the body only grows when N crosses a threshold:
  //   N=2,3 → halfH=37.5, bodyH= 75   (compact — fits 2 or 3 inputs without stretching)
  //   N=4,5 → halfH=62.5, bodyH=125
  //   N=6,7 → halfH=87.5, bodyH=175
  //   N=8   → halfH=112.5,bodyH=225
  const halfH      = outerPinY(inputCount) + GRID / 2; // 12.5px constant overhang
  const bodyHeight = halfH * 2;
  const height     = bodyHeight + GRID * 2;             // + 1 grid lead top & bottom
  return {
    inputCount,
    width:    GRID * 4,   // 100px total bounding width  (inputX=-50 … outputX=+50)
    height,
    bodyHeight,
    inputX:  -GRID * 2,  // -50: left terminal column, on grid
    outputX:  GRID * 2,  //  +50: right terminal column, on grid
    inputY:  slotPinsFor(inputCount),
  };
};

/** Removes every edge that touches a terminal no longer registered by the resized component. */
export const pruneWiresForTerminalSet = (wires: CircuitWire[], componentId: string, allowedTerminalIds: ReadonlySet<string>) =>
  wires.filter(wire =>
    (wire.fromComp !== componentId || allowedTerminalIds.has(wire.fromTerm))
    && (wire.toComp !== componentId || allowedTerminalIds.has(wire.toTerm))
  );
