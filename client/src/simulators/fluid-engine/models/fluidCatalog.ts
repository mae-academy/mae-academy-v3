import type { FluidComponentCategory, FluidComponentDefinition, FluidPort } from '@shared/fluid/fluidTypes';
import { VALVE_TABLES, type ValveEnvelope, type ValvePortKey } from '@shared/fluid/engine/valveTables';
import { TIME_DELAY, CHECK_VALVE_HEIGHT, CHECK_VALVE_WIDTH, CYLINDER, CYLINDER_BARREL_HEIGHT, CYLINDER_BARREL_WIDTH, END_CAP_LENGTH, LOGIC_VALVE_HEIGHT, LOGIC_VALVE_WIDTH, ONE_WAY_FLOW_CONTROL_HEIGHT, ONE_WAY_FLOW_CONTROL_WIDTH, PORT_STUB_LENGTH, ROTARY_HOUSING_DIAMETER, VALVE_SQUARE_SIZE } from './fluidGrid';

export * from './fluidGrid';

/**
 * Pneumatic component catalog (ISO 1219 symbols, ISO 5599 port numbering).
 * All geometry is symbol-centred on the 20px canvas grid; port positions are grid nodes.
 */
export interface FluidParameter {
  key: string;
  label: string;
  unit?: string;
  kind: 'number' | 'select';
  defaultValue: number | string;
  options?: string[];
  /** Bounds of a number field; the inspector clamps typed values to them. */
  min?: number;
  max?: number;
  /** Shown as a slider beside the number field. */
  slider?: boolean;
  /** Internal geometry (bore, stroke, volume): kept in the part's props with its default, never offered to students. */
  advanced?: boolean;
}

export type FluidProps = Record<string, unknown>;
export type FluidMedium = 'PNEUMATIC' | 'HYDRAULIC';

export interface FluidCatalogEntry extends FluidComponentDefinition {
  description: string;
  /** Media this part appears in (shared parts list both). */
  media: FluidMedium[];
  parameters: FluidParameter[];
  /** Whether ISO port numbers are drawn beside the stubs. */
  portLabels: boolean;
  /** Ports can depend on properties (pilot ports appear with pilot actuation). */
  portsFor: (props: FluidProps) => FluidPort[];
  /** Half-extents used for body hit-testing and selection. */
  boundsFor: (props: FluidProps) => { width: number; height: number; /** x of the box centre when the origin is not the middle of the part. */ centerX?: number };
}

const port = (id: string, isoNumber: string, lettering: string, type: FluidPort['type'], x: number, y: number): FluidPort => ({ id, isoNumber, lettering, type, x, y });

/* ── Valve geometry ── */
/** One envelope chamber. */
export const CELL = VALVE_SQUARE_SIZE;
/** Port columns inside a chamber, from its left edge: 10 / 30 / 50, i.e. −20 / 0 / +20 about the rest chamber's centre. */
const COL = { L: 10, M: 30, R: 50 } as const;
type Col = keyof typeof COL;
export type PortKey = ValvePortKey;
export type CellState = ValveEnvelope;
interface ValveSpec {
  positions: 2 | 3;
  /** Port column and edge inside the rest cell. */
  ports: Partial<Record<PortKey, [Col, 'top' | 'bottom']>>;
  /** Cells left→right. */
  cells: CellState[];
  defaults: { left: string; right: string };
}

type ValveLayout = Pick<ValveSpec, 'ports'>;
/** Newly placed valves are operable out of the box: pushbutton against a return spring, or a pilot on each end of a 3-position valve. */
const defaultOperators = (positions: number) => (positions === 3 ? { left: 'Pneumatic Pilot', right: 'Pneumatic Pilot' } : { left: 'Pushbutton', right: 'Spring Return' });
const threePort: ValveLayout = { ports: { '1': ['L', 'bottom'], '2': ['M', 'top'], '3': ['R', 'bottom'] } };
const fourPort: ValveLayout = { ports: { '1': ['L', 'bottom'], '2': ['R', 'top'], '3': ['R', 'bottom'], '4': ['L', 'top'] } };
const fivePort: ValveLayout = { ports: { '1': ['M', 'bottom'], '2': ['R', 'top'], '3': ['R', 'bottom'], '4': ['L', 'top'], '5': ['L', 'bottom'] } };

/** Port placement per valve; the envelopes (flow paths) come from the shared engine tables. */
const VALVE_LAYOUTS: Record<string, ValveLayout> = {
  'valve-2-2-nc': { ports: { '1': ['M', 'bottom'], '2': ['M', 'top'] } },
  'valve-2-2-no': { ports: { '1': ['M', 'bottom'], '2': ['M', 'top'] } },
  'valve-3-2-nc': threePort,
  'valve-3-2-no': threePort,
  'valve-4-2': fourPort,
  'valve-4-3': fourPort,
  'valve-5-2': fivePort,
  'valve-5-3': fivePort,
  /* Hydraulic directional valves share the pneumatic envelopes but return to tank instead of exhausting to atmosphere. */
  'hvalve-3-2-nc': threePort,
  'hvalve-4-2': fourPort,
  'hvalve-4-3': fourPort,
  'hvalve-4-3-float': fourPort,
};

export const VALVE_SPECS: Record<string, ValveSpec> = Object.fromEntries(
  Object.entries(VALVE_LAYOUTS).map(([type, layout]) => [type, { positions: VALVE_TABLES[type].positions, ports: layout.ports, cells: VALVE_TABLES[type].envelopes, defaults: defaultOperators(VALVE_TABLES[type].positions) }]),
);
export const isHydraulicValve = (type: string) => type.startsWith('hvalve-');

/** Manual operators that stay where they are put (toggled by a click); the others are held while pressed. */
export const LATCHING_OPERATORS = ['Hand Lever', 'Detent Lever', 'Solenoid'];

/**
 * Operator choices in the order offered to students. The first nine are the standard set (Solenoid is fourth); the
 * idle-return roller and "None" (an end with no operator) follow. "Spring Centred" is not offered: a 3-position valve
 * always centres, but valves saved with it still load.
 */
export const ACTUATION_OPTIONS = ['Pneumatic Pilot', 'Pushbutton', 'Spring Return', 'Solenoid', 'Hand Lever', 'Detent Lever', 'Foot Pedal', 'Roller', 'Plunger', 'Idle-Return Roller', 'None'];

/** The rest (spring / centred) cell is always the right cell of a 2-position valve and the middle of a 3-position valve. */
export const restCellIndex = (_spec: ValveSpec) => 1;
/**
 * x of a cell's left edge. The symbol's origin is the centre of the REST cell, so the three port columns
 * (−20, 0, +20) are grid points; a 3-position valve is then centred on its origin, a 2-position valve
 * extends 90 to the left and 30 to the right.
 */
export const cellX0 = (spec: ValveSpec, index: number) => -CELL / 2 + (index - restCellIndex(spec)) * CELL;
/** Left and right edge of the strip of envelopes. */
export const valveEdges = (spec: ValveSpec) => ({ left: cellX0(spec, 0), right: cellX0(spec, spec.positions - 1) + CELL });
/** Local position of a port inside cell `index` (edge point of the envelope). */
export const cellPortPoint = (spec: ValveSpec, key: PortKey, index: number): [number, number] => {
  const [col, edge] = spec.ports[key]!;
  return [cellX0(spec, index) + COL[col], edge === 'top' ? -CELL / 2 : CELL / 2];
};

/**
 * How far the strip can slide beyond its rest extents: spool offset is 1 − envelope, so a 2-position valve only ever moves
 * right (0 … +1 square) and a 3-position valve both ways (−1 … +1).
 */
export const valveTravel = (spec: ValveSpec) => ({ left: spec.positions > 2 ? CELL : 0, right: CELL });
/**
 * Fixed x of a pilot terminal: one actuator beyond the furthest the sliding cap can reach on that side. The pin therefore
 * never ends up under the moving body, and a rigid lead of at most one square always joins it to the cap.
 */
export const pilotPinX = (spec: ValveSpec, side: 'left' | 'right') => {
  const edges = valveEdges(spec);
  const travel = valveTravel(spec);
  return side === 'left' ? edges.left - travel.left - END_CAP_LENGTH : edges.right + travel.right + END_CAP_LENGTH;
};

const isPilot = (props: FluidProps, side: 'actuationLeft' | 'actuationRight') => props[side] === 'Pneumatic Pilot';
const actuated = (props: FluidProps, side: 'actuationLeft' | 'actuationRight') => (props[side] ?? 'None') !== 'None';

function valvePorts(type: string, props: FluidProps): FluidPort[] {
  const spec = VALVE_SPECS[type];
  const rest = restCellIndex(spec);
  const result: FluidPort[] = [];
  (Object.keys(spec.ports) as PortKey[]).forEach(key => {
    const [x] = cellPortPoint(spec, key, rest);
    const y = spec.ports[key]![1] === 'top' ? -CELL / 2 - PORT_STUB_LENGTH : CELL / 2 + PORT_STUB_LENGTH;
    const kind: FluidPort['type'] = key === '1' ? 'PRESSURE' : key === '2' || key === '4' ? 'WORKING' : 'EXHAUST';
    const lettering = { '1': 'P', '2': spec.ports['4'] ? 'B' : 'A', '3': isHydraulicValve(type) ? 'T' : 'R', '4': 'A', '5': 'S' }[key];
    result.push(port(`p${key}`, key, lettering, kind, x, y));
  });
  const edges = valveEdges(spec);
  const hasFour = Boolean(spec.ports['4']);
  if (isPilot(props, 'actuationLeft')) result.push(port('pilotL', hasFour ? '14' : '12', hasFour ? 'Z' : 'Y', 'PILOT', pilotPinX(spec, 'left'), 0));
  if (isPilot(props, 'actuationRight')) result.push(port('pilotR', hasFour ? '12' : '10', hasFour ? 'Y' : 'Z', 'PILOT', pilotPinX(spec, 'right'), 0));
  return result;
}

const valveBounds = (type: string, props: FluidProps) => {
  const spec = VALVE_SPECS[type];
  const edges = valveEdges(spec);
  // A pilot's terminal sits at the end of the cap's travel, so the box has to reach it.
  const left = isPilot(props, 'actuationLeft') ? pilotPinX(spec, 'left') : edges.left - (actuated(props, 'actuationLeft') ? END_CAP_LENGTH : 0);
  const right = isPilot(props, 'actuationRight') ? pilotPinX(spec, 'right') : edges.right + (actuated(props, 'actuationRight') ? END_CAP_LENGTH : 0);
  return { width: right - left, height: CELL, centerX: (left + right) / 2 };
};

const valveParams = (spec: ValveSpec): FluidParameter[] => [
  { key: 'actuationLeft', label: 'Left Actuation', kind: 'select', defaultValue: spec.defaults.left, options: ACTUATION_OPTIONS },
  { key: 'actuationRight', label: 'Right Actuation', kind: 'select', defaultValue: spec.defaults.right, options: ACTUATION_OPTIONS },
  { key: 'initialState', label: 'Valve Initial State', kind: 'select', defaultValue: 'Rest position', options: ['Rest position', 'Actuated position'] },
];

/** The parameters a student may change; internal geometry stays in the props at its default. */
export const editableParameters = (parameters: FluidParameter[]): FluidParameter[] => parameters.filter(parameter => !parameter.advanced);
/** A typed number held inside the parameter's bounds (and 0 for a blank / invalid entry, then clamped). */
export const clampParameter = (parameter: FluidParameter, value: number): number => {
  const finite = Number.isFinite(value) ? value : Number(parameter.defaultValue);
  return Math.min(parameter.max ?? Infinity, Math.max(parameter.min ?? -Infinity, finite));
};

const DEFAULT_PROPS = (params: FluidParameter[]): FluidProps => Object.fromEntries(params.map(p => [p.key, p.defaultValue]));

const valveEntry = (type: string, name: string, isoCode: string, description: string): FluidCatalogEntry => {
  const hydraulic = isHydraulicValve(type);
  const spec = VALVE_SPECS[type];
  const parameters = valveParams(spec);
  return {
    type, category: 'VALVE_DCV', name, isoCode, description, parameters, portLabels: true, media: [hydraulic ? 'HYDRAULIC' : 'PNEUMATIC'],
    width: spec.positions * CELL, height: CELL,
    ports: valvePorts(type, DEFAULT_PROPS(parameters)),
    portsFor: props => valvePorts(type, props),
    boundsFor: props => valveBounds(type, props),
  };
};

const fixed = (
  type: string, category: FluidComponentCategory, name: string, isoCode: string, description: string,
  width: number, height: number, ports: FluidPort[], parameters: FluidParameter[] = [],
  extra: Partial<FluidCatalogEntry> = {},
): FluidCatalogEntry => ({ type, category, name, isoCode, description, width, height, ports, parameters, media: ['PNEUMATIC'], portLabels: false, portsFor: () => ports, boundsFor: () => ({ width, height }), ...extra });

const pressure: FluidParameter = { key: 'pressure', label: 'Operating Pressure', unit: 'bar', kind: 'number', defaultValue: 6, min: 0 };
const flow: FluidParameter = { key: 'flowRate', label: 'Flow Rate', unit: 'L/min', kind: 'number', defaultValue: 60 };
/** Vessel volume of a reservoir or time-delay chamber, in cm³ (the engine's `volume` property). */
const vesselVolume = (defaultValue: number): FluidParameter => ({ key: 'volume', label: 'Reservoir Volume', unit: 'cm³', kind: 'number', defaultValue, min: 10, max: 100000 });
/** Both service units are always drawn with their lubricator: the option stays in the props (with its default) but is never offered. */
const lubricator: FluidParameter = { key: 'lubricator', label: 'Lubricator', kind: 'select', defaultValue: 'With Lubricator', options: ['With Lubricator', 'Without Lubricator'], advanced: true };
/** Main shut-off of the service unit: ON passes the supply, OFF blocks it and vents the line downstream. */
const shutoff: FluidParameter = { key: 'shutoff', label: 'Main Shut-off', kind: 'select', defaultValue: 'ON', options: ['ON', 'OFF'] };
const setpoint: FluidParameter = { key: 'setpoint', label: 'Set Pressure', unit: 'bar', kind: 'number', defaultValue: 6, min: 0 };
/** Property names below are the ones the engine reads (shared/fluid/engine/componentSolvers.ts). */
const switching: FluidParameter = { key: 'switchingPressure', label: 'Switching Pressure', unit: 'bar', kind: 'number', defaultValue: 4.5, min: 0 };
const cracking = (defaultValue: number): FluidParameter => ({ key: 'crackingPressure', label: 'Cracking Pressure', unit: 'bar', kind: 'number', defaultValue, min: 0 });
/** A relief valve is adjusted by its set pressure, which is the engine's cracking pressure. */
const reliefSetting = (defaultValue: number): FluidParameter => ({ ...cracking(defaultValue), label: 'Set Pressure' });
/** Throttle opening: 1 % is the engine's own floor (the valve is never fully shut). */
const opening: FluidParameter = { key: 'openingPercentage', label: 'Throttle Opening', unit: '%', kind: 'number', defaultValue: 100, min: 1, max: 100, slider: true };
const ratedSpeed = (defaultValue: number): FluidParameter => ({ key: 'speed', label: 'Rated Speed', unit: 'rpm', kind: 'number', defaultValue });
const bore: FluidParameter = { key: 'bore', label: 'Bore', unit: 'mm', kind: 'number', defaultValue: 25, advanced: true };
const stroke: FluidParameter = { key: 'stroke', label: 'Stroke', unit: 'mm', kind: 'number', defaultValue: 100, advanced: true };
const CUSHION_OPTIONS = ['None', 'Fixed - rear', 'Fixed - both', 'Adjustable - rear', 'Adjustable - both'];
const cushioning: FluidParameter = { key: 'cushioning', label: 'End-Position Cushioning', kind: 'select', defaultValue: 'None', options: CUSHION_OPTIONS };
const inOut = (half: number) => [port('in', '1', 'P', 'PRESSURE', -half, 0), port('out', '1', 'P', 'PRESSURE', half, 0)];
const regPorts = [port('p1', '1', 'P', 'PRESSURE', 0, 60), port('p2', '2', 'A', 'WORKING', 0, -60)];

/**
 * Composite 0Z1: pressure source (lower left) feeds the simple FRL; the 2/2 NC shut-off valve (0S1) stands directly above the FRL,
 * port 1 fed from the FRL outlet, and port 2 leaves to the right as the supply bus. x = 0 is the source's centre, y = 0 the FRL/source
 * centreline; the whole group is then shifted by (shiftX, shiftY) so port 2 lies on the grid and the origin is the box centre.
 */
export const SERVICE_UNIT = (() => {
  const spec = VALVE_SPECS['valve-2-2-nc'];
  const edges = valveEdges(spec);
  const travel = valveTravel(spec);
  const pad = 5;
  const sourceX = 0, sourceStub = 40;
  const frlX = 108, frlHalf = 60, frlOutX = frlX + frlHalf + 20;
  const valveX = frlX, valveY = -110;
  const port1Y = valveY + CELL / 2 + PORT_STUB_LENGTH, port2Y = valveY - CELL / 2 - PORT_STUB_LENGTH;
  const leverRight = valveX + edges.right + END_CAP_LENGTH + travel.right;
  const right = Math.max(leverRight, frlOutX) + pad;
  const left = -17.3 - pad;
  const top = port2Y - pad;
  const bottom = 50 + pad;
  const shiftX = -(right % 20);
  const shiftY = 50;
  const half = Math.max(-(top + shiftY), bottom + shiftY);
  return { pad, sourceX, sourceStub, frlX, frlHalf, frlOutX, valveX, valveY, port1Y, port2Y, outletX: right, left, right, top, bottom, shiftX, shiftY, half };
})();

/**
 * Composite 0Z1 hydraulic power unit: pump over a suction filter and the tank, relief valve (P on the delivery line, T to the tank),
 * and a 2/2 shut-off valve in the delivery line whose port 2 leaves to the right as the supply bus. Origin and shift as for SERVICE_UNIT.
 */
export const HYDRAULIC_POWER_UNIT = (() => {
  const spec = VALVE_SPECS['valve-2-2-nc'];
  const edges = valveEdges(spec);
  const travel = valveTravel(spec);
  const pad = 5;
  const reliefX = 150, valveX = 300, valveY = -120;
  const port1Y = valveY + CELL / 2 + PORT_STUB_LENGTH, port2Y = valveY - CELL / 2 - PORT_STUB_LENGTH;
  const filterY = 90, tankTop = 190, tankBottom = 225, fluidY = 200, tankLeft = -50, tankRight = 200;
  const right = valveX + edges.right + END_CAP_LENGTH + travel.right + pad;
  const left = tankLeft - pad;
  const top = port2Y - pad;
  const bottom = tankBottom + pad;
  const shiftX = -(right % 20);
  const shiftY = -40;
  const half = Math.max(-(top + shiftY), bottom + shiftY);
  return { pad, reliefX, valveX, valveY, port1Y, port2Y, filterY, tankTop, tankBottom, fluidY, tankLeft, tankRight, outletX: right, left, right, top, bottom, shiftX, shiftY, half };
})();

export const FLUID_CATALOG: FluidCatalogEntry[] = [
  /* ── Supply & service ── */
  fixed('air-reservoir', 'SUPPLY', 'Air Reservoir', '0Z1', 'Dedicated accumulation volume: its pressure charges and discharges over time.', 120, 60,
    [port('left', '1', 'P', 'PRESSURE', -80, 0), port('right', '2', 'A', 'WORKING', 80, 0)], [vesselVolume(1000)]),
  fixed('pressure-source', 'SUPPLY', 'Pressure Source', '0X1', 'Direct supply port.', 40, 40,
    [port('out', '1', 'P', 'PRESSURE', 40, 0)], [pressure], { media: ['PNEUMATIC', 'HYDRAULIC'] }),
  fixed('frl-detailed', 'SUPPLY', 'Air Service Unit (Detailed)', '0Z1', 'Filter, regulator, gauge and lubricator in series.', 360, 180, inOut(180), [lubricator, setpoint]),
  fixed('frl-simplified', 'SUPPLY', 'Air Service Unit (Simple)', '0Z1', 'Simplified FRL symbol.', 120, 60, inOut(80), [lubricator, setpoint]),
  fixed('service-unit', 'SUPPLY', 'Main Service Unit (0Z1)', '0Z1', 'Pressure source, simplified FRL and 2/2 shut-off valve with detented lever (0S1) in series; the supply bus leaves at port 2.', SERVICE_UNIT.right - SERVICE_UNIT.left, 2 * SERVICE_UNIT.half,
    [port('out', '2', 'A', 'WORKING', SERVICE_UNIT.outletX + SERVICE_UNIT.shiftX, SERVICE_UNIT.port2Y + SERVICE_UNIT.shiftY)], [pressure, shutoff, setpoint],
    { boundsFor: () => ({ width: SERVICE_UNIT.right - SERVICE_UNIT.left, height: 2 * SERVICE_UNIT.half, centerX: (SERVICE_UNIT.left + SERVICE_UNIT.right) / 2 + SERVICE_UNIT.shiftX }) }),

  /* ── Directional control valves ── */
  valveEntry('valve-2-2-nc', '2/2 Valve', '1V1', '2/2-way directional control valve, normally closed.'),
  valveEntry('valve-2-2-no', '2/2 Valve, NO', '1V1', '2/2-way directional control valve, normally open.'),
  valveEntry('valve-3-2-nc', '3/2 Valve', '1V1', '3/2-way directional control valve, normally closed.'),
  valveEntry('valve-3-2-no', '3/2 Valve, NO', '1V1', '3/2-way directional control valve, normally open.'),
  valveEntry('valve-4-2', '4/2 Valve', '1V1', '4/2-way directional control valve.'),
  valveEntry('valve-5-2', '5/2 Valve', '1V1', '5/2-way directional control valve.'),
  valveEntry('valve-5-3', '5/3 Valve, Closed Center', '1V1', '5/3-way directional control valve, all ports blocked in mid position.'),

  /* ── Non-return, logic and flow control valves (ISO 1219 §3) ── */
  fixed('check-valve', 'VALVE_LOGIC', 'Check Valve', '1V1', 'Non-return valve: free flow 1 to 2, blocked 2 to 1.', CHECK_VALVE_WIDTH, CHECK_VALVE_HEIGHT,
    [port('p1', '1', 'A', 'WORKING', -60, 0), port('p2', '2', 'B', 'WORKING', 60, 0)], [], { media: ['PNEUMATIC', 'HYDRAULIC'], portLabels: true }),
  fixed('check-valve-spring', 'VALVE_LOGIC', 'Check Valve (Spring)', '1V1', 'Spring-loaded non-return valve.', CHECK_VALVE_WIDTH, CHECK_VALVE_HEIGHT,
    [port('p1', '1', 'A', 'WORKING', -60, 0), port('p2', '2', 'B', 'WORKING', 60, 0)], [cracking(0.2)],
    { media: ['PNEUMATIC', 'HYDRAULIC'], portLabels: true }),
  fixed('shuttle-valve', 'VALVE_LOGIC', 'Shuttle Valve (OR)', '1V1', 'Outputs when either inlet is pressurised.', LOGIC_VALVE_WIDTH, LOGIC_VALVE_HEIGHT,
    [port('x', '1', 'X', 'PRESSURE', -80, 0), port('y', '1', 'Y', 'PRESSURE', 80, 0), port('out', '2', 'A', 'WORKING', 0, -60)], [],
    { media: ['PNEUMATIC', 'HYDRAULIC'], portLabels: true }),
  fixed('dual-pressure-valve', 'VALVE_LOGIC', 'Dual-Pressure Valve (AND)', '1V1', 'Outputs only when both inlets are pressurised.', LOGIC_VALVE_WIDTH, LOGIC_VALVE_HEIGHT,
    [port('x', '1', 'X', 'PRESSURE', -80, 0), port('y', '1', 'Y', 'PRESSURE', 80, 0), port('out', '2', 'A', 'WORKING', 0, -60)], [],
    { media: ['PNEUMATIC', 'HYDRAULIC'], portLabels: true }),
  fixed('quick-exhaust', 'VALVE_LOGIC', 'Quick Exhaust Valve', '1V1', 'Vents the working line directly through port 3.', LOGIC_VALVE_WIDTH, LOGIC_VALVE_HEIGHT,
    [port('p1', '1', 'P', 'PRESSURE', -80, 0), port('p2', '2', 'A', 'WORKING', 0, -60), port('p3', '3', 'R', 'EXHAUST', 0, 60)], [],
    { portLabels: true }),
  fixed('flow-control', 'VALVE_FLOW', 'Throttle Valve', '1V1', 'Adjustable throttle valve.', 80, 40,
    [port('in', '1', 'A', 'WORKING', -40, 0), port('out', '2', 'B', 'WORKING', 40, 0)], [opening],
    { media: ['PNEUMATIC', 'HYDRAULIC'], portLabels: true }),
  fixed('flow-control-oneway', 'VALVE_FLOW', 'One-Way Flow Control Valve', '1V1', 'Throttle check valve: choked in one direction, free return.', ONE_WAY_FLOW_CONTROL_WIDTH, ONE_WAY_FLOW_CONTROL_HEIGHT,
    [port('in', '1', 'A', 'WORKING', -80, 0), port('out', '2', 'B', 'WORKING', 80, 0)], [opening],
    { media: ['PNEUMATIC', 'HYDRAULIC'], portLabels: true }),

  /* On-delay timer: throttle + check valve, reservoir and a pilot-operated 3/2 NC valve in one housing. */
  fixed('time-delay-valve', 'VALVE_FLOW', 'Time Delay Valve (NC)', '1V1', 'On-delay timer: 1 → 2 opens a set time after pressure arrives on pilot port 12.', TIME_DELAY.width, TIME_DELAY.height,
    [port('p1', '1', 'P', 'PRESSURE', TIME_DELAY.p1, PORT_STUB_LENGTH * 2), port('p2', '2', 'A', 'WORKING', TIME_DELAY.p2, -PORT_STUB_LENGTH * 2), port('p3', '3', 'R', 'EXHAUST', TIME_DELAY.p3, PORT_STUB_LENGTH * 2), port('z12', '12', 'Z', 'PILOT', TIME_DELAY.pilotX, 0)],
    [{ ...opening, defaultValue: 20 }, vesselVolume(500)],
    { media: ['PNEUMATIC', 'HYDRAULIC'], portLabels: false, boundsFor: () => ({ width: TIME_DELAY.width, height: TIME_DELAY.height, centerX: TIME_DELAY.centerX }) }),

  /* ── Pressure control valves (ISO 1219 §4) ── */
  fixed('regulator-nr', 'VALVE_PRESSURE', 'PRV (Non-relieving)', '0V1', 'Adjustable pressure regulating valve, non-relieving.', VALVE_SQUARE_SIZE, VALVE_SQUARE_SIZE, regPorts, [setpoint],
    { portLabels: true }),
  fixed('regulator-relieving', 'VALVE_PRESSURE', 'PRV (Relieving)', '0V1', 'Adjustable pressure regulating valve with relief vent port 3.', VALVE_SQUARE_SIZE, VALVE_SQUARE_SIZE,
    [...regPorts, port('p3', '3', 'R', 'EXHAUST', 20, 60)], [setpoint], { portLabels: true }),
  fixed('sequence-ext', 'VALVE_PRESSURE', 'Sequence Valve (Ext. Pilot)', '1V1', 'Opens when the external pilot signal on port 12 reaches the set pressure.', VALVE_SQUARE_SIZE, VALVE_SQUARE_SIZE,
    [...regPorts, port('z12', '12', 'Y', 'PILOT', -60, 0)], [switching], { portLabels: true }),
  fixed('pressure-relief', 'VALVE_PRESSURE', 'Pressure Relief Valve', '0V1', 'In-line sequence / relief valve that dumps to exhaust.', VALVE_SQUARE_SIZE, VALVE_SQUARE_SIZE,
    [port('p1', '1', 'P', 'PRESSURE', 0, 60)], [reliefSetting(8)], { portLabels: true }),
  fixed('sequence-combo', 'VALVE_PRESSURE', 'Sequence Valve + Check', '1V1', 'Sequence valve with a non-return valve in parallel bypass.', 200, 120, regPorts, [switching],
    { portLabels: true }),

  /* ── Linear actuators (ISO 1219 §5.1) ── */
  fixed('cylinder-single', 'ACTUATOR', 'Single-Acting Cylinder', '1A1', 'Spring-return cylinder.', CYLINDER_BARREL_WIDTH + 2 * CYLINDER.flangeWidth, CYLINDER_BARREL_HEIGHT + 2 * CYLINDER.flange,
    [port('a', '', 'A', 'WORKING', -CYLINDER.portX, CYLINDER_BARREL_HEIGHT / 2 + PORT_STUB_LENGTH)], [bore, stroke], { media: ['PNEUMATIC', 'HYDRAULIC'] }),
  fixed('cylinder-double', 'ACTUATOR', 'Double-Acting Cylinder', '1A1', 'Powered extension and retraction.', CYLINDER_BARREL_WIDTH + 2 * CYLINDER.flangeWidth, CYLINDER_BARREL_HEIGHT + 2 * CYLINDER.flange,
    [port('a', '', 'A', 'WORKING', -CYLINDER.portX, CYLINDER_BARREL_HEIGHT / 2 + PORT_STUB_LENGTH), port('b', '', 'B', 'WORKING', CYLINDER.portX, CYLINDER_BARREL_HEIGHT / 2 + PORT_STUB_LENGTH)], [bore, stroke, cushioning], { media: ['PNEUMATIC', 'HYDRAULIC'] }),
  fixed('cylinder-double-rod', 'ACTUATOR', 'Double-Rod Cylinder', '1A1', 'Piston rod through both end caps.', CYLINDER_BARREL_WIDTH + 2 * CYLINDER.flangeWidth, CYLINDER_BARREL_HEIGHT + 2 * CYLINDER.flange,
    [port('a', '', 'A', 'WORKING', -CYLINDER.portX, CYLINDER_BARREL_HEIGHT / 2 + PORT_STUB_LENGTH), port('b', '', 'B', 'WORKING', CYLINDER.portX, CYLINDER_BARREL_HEIGHT / 2 + PORT_STUB_LENGTH)], [bore, stroke, cushioning], { media: ['PNEUMATIC', 'HYDRAULIC'] }),

  /* ── Rotary actuators (ISO 1219 §5.2) ── */
  fixed('air-motor-fixed', 'ACTUATOR', 'Air Motor', '1A1', 'Fixed-capacity air motor, one flow direction.', ROTARY_HOUSING_DIAMETER, ROTARY_HOUSING_DIAMETER,
    [port('in', '', 'A', 'WORKING', 0, -60), port('out', '', 'R', 'EXHAUST', 0, 60)], [ratedSpeed(3000)]),

  /* ── Auxiliary (ISO 1219 §6) ── */
  fixed('exhaust-port', 'AUXILIARY', 'Exhaust Port', '0X1', 'Exhaust to atmosphere, threaded or unthreaded.', 40, 40,
    [port('p', '3', 'R', 'EXHAUST', 0, -20)], [{ key: 'connection', label: 'Connection', kind: 'select', defaultValue: 'Unthreaded', options: ['Unthreaded', 'Threaded'] },
    { key: 'silencer', label: 'Silencer', kind: 'select', defaultValue: 'Without Silencer', options: ['Without Silencer', 'With Silencer'] }]),
  fixed('silencer', 'AUXILIARY', 'Silencer', '0X1', 'Exhaust silencer.', 40, 40, [port('p', '3', 'R', 'EXHAUST', 0, -20)]),
  fixed('pressure-gauge', 'AUXILIARY', 'Pressure Gauge', '0X1', 'Pressure measuring instrument.', 40, 40, [port('p', '1', 'P', 'PRESSURE', 0, 40)], [], { media: ['PNEUMATIC', 'HYDRAULIC'] }),
  fixed('flow-indicator', 'AUXILIARY', 'Visual Flow Indicator', '0X1', 'Visual indicator for flow or pressure.', 80, 40, [port('in', '1', 'P', 'PRESSURE', -40, 0), port('out', '2', 'A', 'WORKING', 40, 0)],
    []),

  /* ── Hydraulic (ISO 1219 fluid conventions: solid energy triangles, tank symbols) ── */
  fixed('hyd-pump', 'SUPPLY', 'Hydraulic Pump (P)', '0P1', 'Fixed-displacement hydraulic pump: a solid triangle points out of the circle at the pressure port P.', 60, 60,
    [port('out', '1', 'P', 'PRESSURE', 0, -60), port('in', '', 'S', 'PRESSURE', 0, 60)], [{ ...pressure, defaultValue: 50 }, flow], { media: ['HYDRAULIC'] }),
  fixed('hyd-pressure-source', 'SUPPLY', 'Hydraulic Pressure Supply', '0X1', 'Direct hydraulic pressure port: a solid triangle (ISO 1219) marks fluid power, where compressed air is drawn open.', 40, 40,
    [port('out', '1', 'P', 'PRESSURE', 40, 0)], [{ ...pressure, defaultValue: 50 }], { media: ['HYDRAULIC'] }),
  fixed('hyd-power-unit', 'SUPPLY', 'Oil Service Unit', '0Z1', 'Pump with suction filter and tank, relief valve and 2/2 shut-off valve in series; the supply bus leaves at port 2.', HYDRAULIC_POWER_UNIT.right - HYDRAULIC_POWER_UNIT.left, 2 * HYDRAULIC_POWER_UNIT.half,
    [port('out', '2', 'A', 'WORKING', HYDRAULIC_POWER_UNIT.outletX + HYDRAULIC_POWER_UNIT.shiftX, HYDRAULIC_POWER_UNIT.port2Y + HYDRAULIC_POWER_UNIT.shiftY)], [{ ...pressure, defaultValue: 50 }, shutoff, reliefSetting(60)],
    { media: ['HYDRAULIC'], boundsFor: () => ({ width: HYDRAULIC_POWER_UNIT.right - HYDRAULIC_POWER_UNIT.left, height: 2 * HYDRAULIC_POWER_UNIT.half, centerX: (HYDRAULIC_POWER_UNIT.left + HYDRAULIC_POWER_UNIT.right) / 2 + HYDRAULIC_POWER_UNIT.shiftX }) }),
  fixed('hyd-tank', 'SUPPLY', 'Hydraulic Tank', '0X1', 'Open oil reservoir: every return line T ends here, below the fluid surface.', 60, 60,
    [port('p', '3', 'T', 'EXHAUST', 0, -40)], [], { media: ['HYDRAULIC'], portLabels: true }),
  fixed('hyd-pressure-relief', 'VALVE_PRESSURE', 'Relief Valve (DBV)', '0V1', 'Direct-acting relief valve: opens at the set pressure and drains to tank through port T.', VALVE_SQUARE_SIZE, VALVE_SQUARE_SIZE,
    [port('p1', '1', 'P', 'PRESSURE', 0, 60), port('t', '3', 'T', 'EXHAUST', 0, -60)], [reliefSetting(60)], { media: ['HYDRAULIC'], portLabels: true }),
  fixed('hyd-reducing-valve', 'VALVE_PRESSURE', 'Pressure Reducing (2-Way)', '0V1', 'Holds its outlet A at the set pressure, whatever the inlet P.', VALVE_SQUARE_SIZE, VALVE_SQUARE_SIZE,
    [port('p1', '1', 'P', 'PRESSURE', 0, 60), port('p2', '2', 'A', 'WORKING', 0, -60)], [{ ...setpoint, defaultValue: 30 }], { media: ['HYDRAULIC'], portLabels: true }),
  fixed('hyd-reducing-valve-3way', 'VALVE_PRESSURE', 'Pressure Reducing (3-Way)', '0V1', 'Reducing valve whose outlet A also relieves to tank through port T when it is overloaded.', VALVE_SQUARE_SIZE, VALVE_SQUARE_SIZE,
    [port('p1', '1', 'P', 'PRESSURE', 0, 60), port('p2', '2', 'A', 'WORKING', 0, -60), port('t', '3', 'T', 'EXHAUST', 20, 60)], [{ ...setpoint, defaultValue: 30 }], { media: ['HYDRAULIC'], portLabels: true }),
  valveEntry('hvalve-3-2-nc', '3/2 Valve, NC', '1V1', '3/2-way directional control valve, normally closed, with tank port T.'),
  valveEntry('hvalve-4-2', '4/2 Valve', '1V1', '4/2-way directional control valve (P, T, A, B).'),
  valveEntry('hvalve-4-3', '4/3 Valve, Closed', '1V1', '4/3-way directional control valve, all ports blocked in the neutral position.'),
  valveEntry('hvalve-4-3-float', '4/3 Valve, Float', '1V1', '4/3-way directional control valve: A and B open to tank in the neutral position, P blocked.'),
  fixed('hyd-motor', 'ACTUATOR', 'Hydraulic Motor', '1A1', 'Fixed-displacement hydraulic motor.', ROTARY_HOUSING_DIAMETER, ROTARY_HOUSING_DIAMETER,
    [port('in', '', 'A', 'WORKING', 0, -60), port('out', '', 'B', 'WORKING', 0, 60)], [ratedSpeed(1500), { key: 'directions', label: 'Flow Directions', kind: 'select', defaultValue: 'Single direction', options: ['Single direction', 'Both directions'] }], { media: ['HYDRAULIC'] }),
];

const LIBRARY_GROUPS: Record<FluidMedium, Array<{ title: string; types: string[] }>> = {
  PNEUMATIC: [
    { title: 'Energy & Preparation', types: ['pressure-source', 'air-reservoir', 'frl-simplified', 'service-unit', 'pressure-gauge', 'exhaust-port'] },
    { title: 'Actuators', types: ['cylinder-single', 'cylinder-double', 'cylinder-double-rod', 'air-motor-fixed'] },
    /** One card per base valve: normally closed / open is the Initial State in the inspector. */
    { title: 'Directional Control Valves', types: ['valve-2-2-nc', 'valve-3-2-nc', 'valve-4-2', 'valve-5-2', 'valve-5-3'] },
    { title: 'Logic & Flow Control', types: ['shuttle-valve', 'dual-pressure-valve', 'check-valve', 'check-valve-spring', 'flow-control', 'flow-control-oneway', 'quick-exhaust', 'time-delay-valve'] },
    { title: 'Pressure Control Valves', types: ['regulator-nr', 'regulator-relieving', 'pressure-relief'] },
  ],
  HYDRAULIC: [
    { title: 'Power Supply & Tank', types: ['pressure-gauge', 'hyd-pump', 'hyd-pressure-source', 'hyd-tank', 'hyd-power-unit'] },
    { title: 'Actuators', types: ['cylinder-single', 'cylinder-double', 'cylinder-double-rod', 'hyd-motor'] },
    { title: 'Directional Control Valves', types: ['hvalve-4-2', 'hvalve-4-3', 'hvalve-4-3-float', 'hvalve-3-2-nc'] },
    { title: 'Logic & Flow Control', types: ['shuttle-valve', 'dual-pressure-valve', 'check-valve', 'check-valve-spring', 'flow-control', 'flow-control-oneway', 'time-delay-valve'] },
    { title: 'Safety & Pressure Control', types: ['hyd-pressure-relief', 'hyd-reducing-valve', 'hyd-reducing-valve-3way'] },
  ],
};

/** Library items in the shape BaseSchematicCanvas expects (`id` = component type). */
export interface FluidLibraryItem { id: string; name: string; description: string }

export const FLUID_LIBRARY_CATEGORIES: Record<FluidMedium, Record<string, FluidLibraryItem[]>> = {
  PNEUMATIC: libraryFor('PNEUMATIC'),
  HYDRAULIC: libraryFor('HYDRAULIC'),
};

function libraryFor(medium: FluidMedium): Record<string, FluidLibraryItem[]> {
  return Object.fromEntries(LIBRARY_GROUPS[medium].map(group => [group.title, group.types.map(type => FLUID_CATALOG.find(def => def.type === type)!).map(def => ({ id: def.type, name: def.name, description: def.description }))]));
}

export const getFluidDefinition = (type: string) => FLUID_CATALOG.find(def => def.type === type);
/** Defaults that differ once a shared part is used with oil. */
const HYDRAULIC_DEFAULTS: Record<string, FluidProps> = { 'pressure-source': { pressure: 50 } };
/**
 * Supply ends, tanks and instruments are placed without a tag or value on the canvas (the inspector can show them), and take the
 * circuit-0 stem 0X so they never use up 0Z1 of the main service unit.
 */
export const BARE_ON_CANVAS = ['hyd-pump', ...(['pressure-source', 'hyd-pressure-source', 'hyd-tank', 'pressure-gauge', 'exhaust-port', 'silencer', 'flow-indicator'] as const)];
export const defaultFluidProps = (def: FluidCatalogEntry, medium: FluidMedium = 'PNEUMATIC'): FluidProps =>
  ({ ...DEFAULT_PROPS(def.parameters), ...(medium === 'HYDRAULIC' ? HYDRAULIC_DEFAULTS[def.type] : undefined), ...(BARE_ON_CANVAS.includes(def.type) ? { _hideLabel: true, _hideValue: true } : {}) });

/** ISO 1219-2 tag stem: circuit number + letter (P pumps, A actuators, S sensors, V valves, Y solenoids, Z auxiliaries). */
export const fluidLabelPrefix = (type: string): string => {
  const def = getFluidDefinition(type);
  return def ? def.isoCode.replace(/\d+$/, '') : '1Z';
};

/** Circuit (branch) number of a tag: 1 for 1V2, 2 for 2A1, 0 for the energy supply 0Z1; undefined when the tag has no leading number. */
export const circuitOfTag = (label: string): number | undefined => {
  const match = /^(\d+)/.exec(label.trim());
  return match ? Number(match[1]) : undefined;
};

/**
 * Next free tag for a part in ISO 1219-2 order: energy parts live in circuit 0 (0Z1, 0V1, 0P1); every other part is numbered
 * within `branch` (1V1, 1V2, …, then 2V1, 2V2, … once circuit 2 is started).
 */
export const nextFluidTag = (type: string, existingLabels: string[], branch = 1): string => {
  const iso = getFluidDefinition(type)?.isoCode ?? '1Z1';
  const letters = iso.replace(/^\d+/, '').replace(/\d+$/, '');
  const stem = `${iso.startsWith('0') ? 0 : Math.max(1, Math.floor(branch))}${letters}`;
  let max = 0;
  for (const label of existingLabels) {
    const match = label.startsWith(stem) ? /^\d+$/.exec(label.slice(stem.length)) : null;
    if (match) max = Math.max(max, Number(match[0]));
  }
  return `${stem}${max + 1}`;
};

/** Normally-closed / normally-open twin of a consolidated valve, or undefined when the part has none. */
export const INITIAL_STATE_TWINS: Record<string, string> = { 'valve-2-2-nc': 'valve-2-2-no', 'valve-2-2-no': 'valve-2-2-nc', 'valve-3-2-nc': 'valve-3-2-no', 'valve-3-2-no': 'valve-3-2-nc' };
