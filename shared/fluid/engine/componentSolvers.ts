/**
 * Discrete transfer functions of the ISO 1219 components: what each part connects, supplies, vents or
 * limits for a given state, how a spool responds to its operators, and how a piston moves.
 * Everything here is a pure function of its arguments.
 */
import type {
  Connection,
  CylinderState,
  EngineComponent,
  EngineConfig,
  EngineMedium,
  LogicElementState,
  ManualInput,
  MotorState,
  NodeId,
  OperatorSide,
  PressureCap,
  PressureSource,
  SensorLink,
  TriggerDirection,
  ValveState,
} from './types';
import { nodeId } from './types';
import { PILOT_LEFT, PILOT_RIGHT, VALVE_TABLES, envelopeForPosition, valvePortId, valvePortKeys, type ValveTable } from './valveTables';

const BAR = 1e5; // Pa
const EPS = 1e-6;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/** Reads a numeric property; anything missing or not a finite number falls back. */
export function num(props: Record<string, unknown>, key: string, fallback: number): number {
  const raw = props[key];
  const value = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN;
  return Number.isFinite(value) ? value : fallback;
}

export interface SolverContext {
  config: EngineConfig;
  medium: EngineMedium;
  /** Latest pressure estimate of a port (previous relaxation round or previous tick). */
  pressure: (componentId: string, portId: string) => number;
  /** Current engine position (0 rest, 1 actuated, 2 centre) of a directional valve. */
  valvePosition: (componentId: string) => number;
}

/* ───────────────────────── Operators ───────────────────────── */

export const OPERATOR_NONE = 'None';
export const OPERATOR_PILOT = 'Pneumatic Pilot';
const SPRING_OPERATORS = ['Spring Return', 'Spring Centred'];

export const isSpringOperator = (kind: unknown): boolean => SPRING_OPERATORS.includes(String(kind));
export const isPilotOperator = (kind: unknown): boolean => kind === OPERATOR_PILOT;
/** Pushbuttons, levers, pedals, plungers and rollers: driven by a hand or by the machine, not by pressure. */
export const OPERATOR_IDLE_ROLLER = 'Idle-Return Roller';
export const isMechanicalOperator = (kind: unknown): boolean =>
  kind !== undefined && kind !== null && kind !== OPERATOR_NONE && !isSpringOperator(kind) && !isPilotOperator(kind);

/** Property holding the operator kind on each end of a directional valve. */
export const OPERATOR_PROP: Record<OperatorSide, string> = { left: 'actuationLeft', right: 'actuationRight' };
/**
 * Property naming the limit switch (`${cylinderId}:S1` / `:S2`) coupled to an end of a valve.
 * A mechanical operator (roller, plunger) is pushed directly while the switch is made;
 * a pilot-operated end gets pilot pressure instead (reed switch), see `sensorLinksOf`.
 */
export const SENSOR_PROP: Record<OperatorSide, string> = { left: 'leftSensor', right: 'rightSensor' };
const PILOT_PORT: Record<OperatorSide, string> = { left: PILOT_LEFT, right: PILOT_RIGHT };
const SIDES: OperatorSide[] = ['left', 'right'];

/* ───────────────────────── Component behaviours ───────────────────────── */

export interface CylinderMeta {
  /** Port of the piston-side (rear) chamber: pressure here extends the rod. */
  rear: string;
  /** Port of the rod-side (front) chamber; absent on single-acting cylinders. */
  front?: string;
  spring?: boolean;
  throughRod?: boolean;
}

export interface MotorMeta {
  inlet: string;
  outlet: string;
  /** 'motor' turns continuously; 'swivel' is a limited-angle (semi-rotary) actuator. */
  kind: 'motor' | 'swivel';
  /** Whether the unit also runs backwards when the pressure difference reverses. */
  reversible: (props: Record<string, unknown>) => boolean;
  /** Variable-capacity units scale their speed by the `capacityRatio` property. */
  variable?: boolean;
}

export interface VolumeMeta {
  ports: string[];
  defaultCm3: number;
}

interface Behavior {
  ports: string[];
  /** Port that delivers supply pressure. */
  source?: string;
  /** Ports permanently open to atmosphere / tank. */
  exhausts?: string[];
  /** Exhaust ports that vent only while nothing is piped to them (a silencer or restrictor may be fitted instead). */
  openExhausts?: string[];
  cylinder?: CylinderMeta;
  motor?: MotorMeta;
  /** Port of a relief valve whose open / closed state is reported. */
  relief?: string;
  /** Storage volume: the ports that open into the chamber and the vessel volume when the component sets none. */
  volume?: VolumeMeta;
  caps?: (component: EngineComponent) => Array<{ port: string; limit: number }>;
  connections?: (component: EngineComponent, n: (port: string) => NodeId, ctx: SolverContext) => Connection[];
}

const through = (a: string, b: string): Behavior['connections'] => (_c, n) => [{ kind: 'open', a: n(a), b: n(b) }];
const setpoint = (component: EngineComponent) => num(component.props, 'setpoint', Infinity);
const regulated = (inlet: string, outlet: string): Behavior['connections'] => (c, n) => [{ kind: 'oneWay', from: n(inlet), to: n(outlet), limit: setpoint(c), firm: true }];
const relieving = (port: string): Behavior['caps'] => c => [{ port, limit: setpoint(c) }];
/** Relief valves open above their cracking pressure and hold the line there. */
const cracking = (port: string, fallback: number): Behavior['caps'] => c => [{ port, limit: Math.max(0, num(c.props, 'crackingPressure', fallback)) }];

/** Flow coefficient of a throttle: Cv = max(0.01, openingPercentage / 100). */
export const flowCoefficient = (component: EngineComponent): number => clamp(num(component.props, 'openingPercentage', 100) / 100, 0.01, 1);
/** Pilot / inlet pressure at which a sequence valve switches through. */
export const switchingPressure = (component: EngineComponent): number => num(component.props, 'switchingPressure', 4.5);

const BEHAVIORS: Record<string, Behavior> = {
  /* Supply and preparation */
  'pressure-source': { ports: ['out'], source: 'out' },
  'hyd-pump': { ports: ['out', 'in'], source: 'out' },
  // Both ports open into one chamber; its pressure is a state that charges and discharges through any throttle in the line.
  'air-reservoir': { ports: ['left', 'right'], volume: { ports: ['left', 'right'], defaultCm3: 1000 }, connections: through('left', 'right') },
  // Gas-loaded accumulator: one port into a chamber that keeps its pressure when the line is shut off.
  'hyd-accumulator': { ports: ['p'], volume: { ports: ['p'], defaultCm3: 1000 } },
  'hyd-filter': { ports: ['in', 'out'], connections: through('in', 'out') },
  'hyd-cooler': { ports: ['in', 'out'], connections: through('in', 'out') },
  'hyd-tank': { ports: ['p'], exhausts: ['p'] },
  'frl-detailed': { ports: ['in', 'out'], connections: regulated('in', 'out'), caps: relieving('out') },
  'frl-simplified': { ports: ['in', 'out'], connections: regulated('in', 'out'), caps: relieving('out') },
  /**
   * Main service unit 0Z1: supply → FRL → 2/2 shut-off valve. The supply sits on an internal node (`in`); the only piped port
   * is `out`. Shut-off ON (`shutoff` ≠ 'OFF') passes the regulated supply, OFF blocks it and vents the outlet line.
   */
  'service-unit': { ports: ['in', 'out'], source: 'in', connections: (c, n, ctx) => (c.props.shutoff === 'OFF' ? [{ kind: 'vent', node: n('out') }] : regulated('in', 'out')!(c, n, ctx)), caps: relieving('out') },

  /* Pressure control */
  'regulator-nr': { ports: ['p1', 'p2'], connections: regulated('p1', 'p2') },
  'regulator-relieving': { ports: ['p1', 'p2', 'p3'], openExhausts: ['p3'], connections: regulated('p1', 'p2'), caps: relieving('p2') },
  'sequence-ext': {
    ports: ['p1', 'p2', 'z12'],
    // Pilot-operated 3/2 function: 1 → 2 once the pilot reaches the switching pressure, otherwise 2 is vented.
    connections: (c, n, ctx) => (ctx.pressure(c.id, 'z12') >= switchingPressure(c) - EPS ? [{ kind: 'oneWay', from: n('p1'), to: n('p2') }] : [{ kind: 'vent', node: n('p2') }]),
  },
  'sequence-combo': {
    ports: ['p1', 'p2'],
    // In-line: the inlet itself is the sensing line; the parallel check valve lets the return flow bypass.
    connections: (c, n, ctx) => {
      const bypass: Connection = { kind: 'oneWay', from: n('p2'), to: n('p1') };
      return ctx.pressure(c.id, 'p1') >= switchingPressure(c) - EPS ? [{ kind: 'oneWay', from: n('p1'), to: n('p2') }, bypass] : [bypass];
    },
  },
  'pressure-relief': { ports: ['p1'], caps: cracking('p1', 8), relief: 'p1' },
  // Direct-acting relief valve: port T drains to tank, and does so on its own while nothing is piped to it.
  'hyd-pressure-relief': { ports: ['p1', 't'], openExhausts: ['t'], caps: cracking('p1', 60), relief: 'p1' },
  'hyd-reducing-valve': { ports: ['p1', 'p2'], connections: regulated('p1', 'p2'), caps: relieving('p2') },
  'hyd-reducing-valve-3way': { ports: ['p1', 'p2', 't'], openExhausts: ['t'], connections: regulated('p1', 'p2'), caps: relieving('p2') },

  /* Non-return, logic and flow control */
  'check-valve': { ports: ['p1', 'p2'], connections: (_c, n) => [{ kind: 'oneWay', from: n('p1'), to: n('p2') }] },
  'check-valve-spring': { ports: ['p1', 'p2'], connections: (c, n) => [{ kind: 'oneWay', from: n('p1'), to: n('p2'), drop: crackingPressure(c) }] },
  'shuttle-valve': { ports: ['x', 'y', 'out'], connections: (_c, n) => [{ kind: 'or', inputs: [n('x'), n('y')], out: n('out') }] },
  'dual-pressure-valve': { ports: ['x', 'y', 'out'], connections: (_c, n, ctx) => [{ kind: 'and', inputs: [n('x'), n('y')], out: n('out'), threshold: ctx.config.gateThreshold }] },
  'quick-exhaust': { ports: ['p1', 'p2', 'p3'], openExhausts: ['p3'], connections: (_c, n) => [{ kind: 'quickExhaust', supply: n('p1'), work: n('p2') }] },
  // Throttle: the orifice restricts both directions.
  'flow-control': { ports: ['in', 'out'], connections: (c, n) => [{ kind: 'open', a: n('in'), b: n('out'), conductance: [flowCoefficient(c), flowCoefficient(c)] }] },
  // Throttle check valve: in → out goes through the orifice, out → in lifts the check and bypasses it (Cv = 1).
  'flow-control-oneway': { ports: ['in', 'out'], connections: (c, n) => [{ kind: 'open', a: n('in'), b: n('out'), conductance: [flowCoefficient(c), 1], free: [false, true] }] },

  /*
   * On-delay timer (ISO 1219 time-delay valve, NC): the signal on 12 reaches an internal chamber through an adjustable
   * throttle (free return through a check valve); once the chamber holds the pilot cracking pressure the built-in 3/2
   * valve connects 1 → 2, otherwise 2 is vented through 3 and 1 is blocked.
   */
  'time-delay-valve': {
    ports: ['p1', 'p2', 'p3', 'z12', 'chamber'],
    openExhausts: ['p3'],
    volume: { ports: ['chamber'], defaultCm3: 500 },
    connections: (c, n, ctx): Connection[] => [
      { kind: 'open', a: n('z12'), b: n('chamber'), conductance: [flowCoefficient(c), 1], free: [false, true] },
      ctx.pressure(c.id, 'chamber') >= ctx.config.pilotThreshold - EPS ? { kind: 'open', a: n('p1'), b: n('p2') } : { kind: 'open', a: n('p2'), b: n('p3') },
    ],
  },

  /* Actuators */
  'cylinder-single': { ports: ['a'], cylinder: { rear: 'a', spring: true } },
  'cylinder-double': { ports: ['a', 'b'], cylinder: { rear: 'a', front: 'b' } },
  'cylinder-double-rod': { ports: ['a', 'b'], cylinder: { rear: 'a', front: 'b', throughRod: true } },
  'air-motor-fixed': { ports: ['in', 'out'], openExhausts: ['out'], motor: { inlet: 'in', outlet: 'out', kind: 'motor', reversible: () => false } },
  'air-motor-variable': { ports: ['in', 'out'], motor: { inlet: 'in', outlet: 'out', kind: 'motor', variable: true, reversible: props => props.directions === 'Both directions' } },
  'hyd-motor': { ports: ['in', 'out'], motor: { inlet: 'in', outlet: 'out', kind: 'motor', reversible: () => false } },
  'semi-rotary': { ports: ['a', 'b'], motor: { inlet: 'a', outlet: 'b', kind: 'swivel', reversible: () => true } },

  /* Auxiliary */
  'exhaust-port': { ports: ['p'], exhausts: ['p'] },
  silencer: { ports: ['p'], exhausts: ['p'] },
  'pressure-gauge': { ports: ['p'] },
  'flow-indicator': { ports: ['in', 'out'], connections: through('in', 'out') },
};

/** Storage-volume behaviour of a component (reservoir, time-delay chamber), if it has one. */
export const volumeMetaOf = (component: EngineComponent): VolumeMeta | undefined => BEHAVIORS[component.type]?.volume;
/** Vessel volume in litres. */
export const volumeLitres = (component: EngineComponent): number => Math.max(0.001, volumeCm3(component) / 1000);
export const volumeCm3 = (component: EngineComponent): number => Math.max(1, num(component.props, 'volume', volumeMetaOf(component)?.defaultCm3 ?? 1000));

/** Opening pressure of a spring-loaded check valve (bar). */
export const crackingPressure = (component: EngineComponent): number => Math.max(0, num(component.props, 'crackingPressure', 0.2));

export const valveTableOf = (component: EngineComponent): ValveTable | undefined => VALVE_TABLES[component.type];
export const cylinderMetaOf = (component: EngineComponent): CylinderMeta | undefined => BEHAVIORS[component.type]?.cylinder;
export const motorMetaOf = (component: EngineComponent): MotorMeta | undefined => BEHAVIORS[component.type]?.motor;
/** Port of a relief valve, for reporting whether it is open. */
export const reliefPortOf = (component: EngineComponent): string | undefined => BEHAVIORS[component.type]?.relief;
/** Positive-displacement pumps: the supplies that need a relief valve on their line. */
export const isHydraulicPump = (component: EngineComponent): boolean => component.type === 'hyd-pump';

/** Every port id the engine models for a component (unknown types have none). */
export function portsOf(component: EngineComponent): string[] {
  const table = valveTableOf(component);
  if (table) {
    const ports = valvePortKeys(table).map(valvePortId);
    if (isPilotOperator(component.props.actuationLeft)) ports.push(PILOT_LEFT);
    if (isPilotOperator(component.props.actuationRight)) ports.push(PILOT_RIGHT);
    return ports;
  }
  return BEHAVIORS[component.type]?.ports ?? [];
}

export function sourcesOf(component: EngineComponent, ctx: Pick<SolverContext, 'config' | 'medium'>): PressureSource[] {
  const port = BEHAVIORS[component.type]?.source;
  if (!port) return [];
  const nominal = ctx.config.nominalPressure[ctx.medium];
  const pressure = num(component.props, 'pressure', nominal);
  return [{ node: nodeId(component.id, port), pressure: pressure > 0 ? pressure : nominal, unloads: isHydraulicPump(component) }];
}

export interface ExhaustPort {
  node: NodeId;
  /** Vents only while unconnected: piping it to a silencer, restrictor or line makes it an ordinary port. */
  whenUnconnected: boolean;
}

export function exhaustsOf(component: EngineComponent): ExhaustPort[] {
  const table = valveTableOf(component);
  if (table) {
    // Exhaust ports 3 / 5 (hydraulic: the tank line T) drain while nothing is piped to them; piped, they are ordinary ports.
    return valvePortKeys(table).filter(key => key === '3' || key === '5').map(key => ({ node: nodeId(component.id, valvePortId(key)), whenUnconnected: true }));
  }
  const behavior = BEHAVIORS[component.type];
  return [
    ...(behavior?.exhausts ?? []).map(port => ({ node: nodeId(component.id, port), whenUnconnected: false })),
    ...(behavior?.openExhausts ?? []).map(port => ({ node: nodeId(component.id, port), whenUnconnected: true })),
  ];
}

export function capsOf(component: EngineComponent): PressureCap[] {
  return (BEHAVIORS[component.type]?.caps?.(component) ?? [])
    .filter(cap => Number.isFinite(cap.limit))
    .map(cap => ({ node: nodeId(component.id, cap.port), limit: cap.limit }));
}

/** Internal passages of a component in its current state. */
export function connectionsOf(component: EngineComponent, ctx: SolverContext): Connection[] {
  const n = (port: string) => nodeId(component.id, port);
  const table = valveTableOf(component);
  if (table) {
    const envelope = table.envelopes[envelopeForPosition(table, ctx.valvePosition(component.id))];
    return envelope.flows.map(([a, b]): Connection => ({ kind: 'open', a: n(valvePortId(a)), b: n(valvePortId(b)) }));
  }
  return BEHAVIORS[component.type]?.connections?.(component, n, ctx) ?? [];
}

export function detectMedium(components: EngineComponent[]): EngineMedium {
  return components.some(c => c.type.startsWith('hyd-') || c.type.startsWith('hvalve-')) ? 'OIL' : 'AIR';
}

/* ───────────────────────── Directional valves ───────────────────────── */

export function initialValvePosition(table: ValveTable, props: Record<string, unknown>): number {
  if (props.initialState === 'Actuated position') return 1;
  return table.positions === 3 ? 2 : 0;
}

export function valveState(table: ValveTable, props: Record<string, unknown>, position: number): ValveState {
  const envelope = envelopeForPosition(table, position);
  return {
    position,
    envelope,
    // The strip slides so the active envelope sits over the ports, which are drawn on envelope 1.
    spoolOffset: 1 - envelope,
    latched: table.positions === 2 && !isSpringOperator(props.actuationLeft) && !isSpringOperator(props.actuationRight),
  };
}

/** What can push an operator from outside the fluid circuit. */
export interface OperatorSignals {
  manual?: ManualInput;
  /** A limit switch is made. */
  sensorMade: (sensorId: string) => boolean;
  /** The cylinder passed the switch in the given direction within the idle-roller pulse window. */
  sensorTripped: (sensorId: string, direction: TriggerDirection) => boolean;
}

export const triggerDirectionOf = (component: EngineComponent): TriggerDirection =>
  (component.props.triggerDirection === 'RETRACT_ONLY' ? 'RETRACT_ONLY' : 'EXTEND_ONLY');

/** Whether the operator on one end of a valve is currently pushing the spool. */
export function operatorActive(component: EngineComponent, side: OperatorSide, signals: OperatorSignals, ctx: Pick<SolverContext, 'config' | 'pressure'>): boolean {
  const kind = component.props[OPERATOR_PROP[side]];
  if (isPilotOperator(kind)) return ctx.pressure(component.id, PILOT_PORT[side]) >= ctx.config.pilotThreshold;
  if (!isMechanicalOperator(kind)) return false;
  if (signals.manual?.[side]) return true;
  const sensor = component.props[SENSOR_PROP[side]];
  if (typeof sensor !== 'string' || sensor === '') return false;
  // A plain roller is held down for as long as the cam sits on it. An idle-return roller is only
  // depressed while the cam runs over it in its trigger direction; the other way it folds away.
  return kind === OPERATOR_IDLE_ROLLER ? signals.sensorTripped(sensor, triggerDirectionOf(component)) : signals.sensorMade(sensor);
}

/** Reed-switch couplings declared on a valve: each pilot-operated end with a linked limit switch. */
export function sensorLinksOf(component: EngineComponent): SensorLink[] {
  if (!valveTableOf(component)) return [];
  const links: SensorLink[] = [];
  for (const side of SIDES) {
    const sensor = component.props[SENSOR_PROP[side]];
    if (isPilotOperator(component.props[OPERATOR_PROP[side]]) && typeof sensor === 'string' && sensor !== '') {
      links.push({ sensorId: sensor, componentId: component.id, portId: PILOT_PORT[side] });
    }
  }
  return links;
}

/**
 * Next spool position. The left operator selects position 1, the right operator position 0.
 * With no operator active a spring returns the spool to the envelope beside it; three-position
 * valves centre; a two-position valve without springs keeps its last position (bistable memory).
 */
export function resolveValvePosition(table: ValveTable, props: Record<string, unknown>, left: boolean, right: boolean, current: number): number {
  if (table.positions === 3) return left && !right ? 1 : right && !left ? 0 : 2;
  if (left && !right) return 1;
  if (right && !left) return 0;
  if (left && right) return current;
  const springLeft = isSpringOperator(props.actuationLeft);
  const springRight = isSpringOperator(props.actuationRight);
  if (springRight && !springLeft) return 0;
  if (springLeft && !springRight) return 1;
  return current;
}

/* ───────────────────────── Logic elements (moving parts) ───────────────────────── */

/** Travel of the shuttle ball / AND spool / quick-exhaust seal / check ball for the given port pressures. */
export function logicElementState(component: EngineComponent, pressure: (portId: string) => number, config: EngineConfig): LogicElementState | undefined {
  switch (component.type) {
    case 'shuttle-valve': {
      // The ball is pushed towards the lower-pressure inlet and seals it.
      const difference = pressure('x') - pressure('y');
      return { offset: Math.abs(difference) < EPS ? 0 : Math.sign(difference) };
    }
    case 'dual-pressure-valve': {
      const x = pressure('x') > config.gateThreshold;
      const y = pressure('y') > config.gateThreshold;
      return { offset: x === y ? 0 : x ? 1 : -1 };
    }
    case 'quick-exhaust':
      // +1: seal on the exhaust seat (feeding 1 → 2); -1: exhaust path 2 → 3 open.
      return { offset: pressure('p1') > config.gateThreshold && pressure('p1') >= pressure('p2') - EPS ? 1 : -1 };
    case 'time-delay-valve':
      // +1: the chamber has reached the pilot cracking pressure and the built-in 3/2 valve is connecting 1 → 2.
      return { offset: pressure('chamber') >= config.pilotThreshold - EPS ? 1 : 0 };
    case 'check-valve':
    case 'check-valve-spring': {
      const crack = component.type === 'check-valve' ? 0 : crackingPressure(component);
      const delivered = pressure('p1') - crack;
      return { offset: delivered > EPS && delivered >= pressure('p2') - EPS ? 1 : 0 };
    }
    default:
      return undefined;
  }
}

/* ───────────────────────── Storage volumes ───────────────────────── */

/**
 * Fill time constant of a vessel behind a restrictor:  τ = R·C  with R = 1/Cv (Cv ∝ opening %) and C ∝ V,
 *   dP/dt = (P_in − P)/τ,   τ = VOLUME_TIME_CONSTANT · V[litre] / Cv.
 * A 1 L vessel behind a fully open throttle therefore has τ = 1 s; at 20 % it is 5 s.
 */
export const VOLUME_TIME_CONSTANT = 1;

export interface VolumeFeed {
  /** Pressure of the net on the other side of the restrictor (bar). */
  pressure: number;
  cvIn: number;
  timedIn: boolean;
  cvOut: number;
  timedOut: boolean;
}

/**
 * One step of a storage volume's pressure. Every restricted path whose far side is at a different pressure pulls the
 * chamber towards it with weight Cv; the step integrates the resulting first-order system exactly, so it stays stable
 * for any dt. Instant (unrestricted) paths are not handled here: the solver already holds the net at their pressure.
 */
export function stepVolume(pressure: number, feeds: VolumeFeed[], litres: number, dt: number): number {
  let weight = 0;
  let pull = 0;
  for (const feed of feeds) {
    const charging = feed.pressure > pressure + EPS;
    const discharging = feed.pressure < pressure - EPS;
    const cv = charging && feed.timedIn ? feed.cvIn : discharging && feed.timedOut ? feed.cvOut : 0;
    if (cv <= 0) continue;
    const g = Math.max(cv, 0.01);
    weight += g;
    pull += g * feed.pressure;
  }
  if (weight === 0) return pressure;
  const target = pull / weight;
  const next = target + (pressure - target) * Math.exp((-weight * dt) / (VOLUME_TIME_CONSTANT * litres));
  return Math.max(0, next);
}

/**
 * Time for a vessel to climb from `from` to `to` bar behind a throttle of opening `openingPercent`, fed at `supply` bar:
 *   t = −τ · ln((supply − to) / (supply − from)).   Infinity when `to` is not below the supply.
 */
export function chargeTime(supply: number, from: number, to: number, openingPercent: number, volumeCm3Value: number): number {
  if (to <= from) return 0;
  if (supply <= to) return Infinity;
  const cv = clamp(openingPercent / 100, 0.01, 1);
  return (-VOLUME_TIME_CONSTANT * (volumeCm3Value / 1000) / cv) * Math.log((supply - to) / (supply - from));
}

/* ───────────────────────── Cylinders ───────────────────────── */

/** Rod diameter as a fraction of the bore (ISO 15552 sizes are close to 0.4). */
const ROD_RATIO = 0.4;
/** Break-away friction, expressed as pressure on the piston area. */
const FRICTION_BAR = 0.2;
/**
 * Return spring of a single-acting cylinder, as the pressure on the piston area that balances it:
 *   F_spring(x) = F0 + k·x   (x = stroke, 0 … 1)  ⇒  p_spring(x) = PRELOAD + RATE·x.
 * The spring is solid at x = 1 (4 bar-equivalent), so nominal supply (5 – 6 bar) drives the full stroke,
 * while a reduced supply stops the piston part-way, where p_in = p_spring(x).
 */
export const SPRING_PRELOAD_BAR = 1;
export const SPRING_RATE_BAR = 3;
/** Pressure (bar) that balances the return spring at a given stroke. */
export const springPressure = (stroke: number): number => SPRING_PRELOAD_BAR + SPRING_RATE_BAR * clamp(stroke, 0, 1);
/**
 * Stroke at which a pressure `p` (bar) in the working chamber balances the spring: F_air = F_spring(x_eq).
 * Below the preload the piston stays on its rear cap; at or above preload + rate it reaches the front cap.
 */
export const springEquilibriumStroke = (pressureBar: number): number => clamp((pressureBar - SPRING_PRELOAD_BAR) / SPRING_RATE_BAR, 0, 1);
/** A piston this close to its equilibrium is at rest on it. */
const EQUILIBRIUM_TOLERANCE = 1e-3;
/** Net pressure above friction at which the piston reaches its full speed. */
const FULL_SPEED_BAR = 1;
/** Largest share of the stroke covered by one integration slice, and the cap on slices per step. */
const MAX_SLICE = 0.002;
const MAX_SLICES = 64;

export interface CylinderGeometry {
  /** Effective piston area of the rear chamber (m²). */
  areaA: number;
  /** Effective piston area of the rod-side chamber (m²). */
  areaB: number;
  /** Stroke length (m). */
  length: number;
}

export function cylinderGeometry(component: EngineComponent, meta: CylinderMeta): CylinderGeometry {
  const bore = Math.max(1, num(component.props, 'bore', 25)) / 1000;
  const rod = bore * ROD_RATIO;
  const full = (Math.PI / 4) * bore * bore;
  const annulus = (Math.PI / 4) * (bore * bore - rod * rod);
  return { areaA: meta.throughRod ? annulus : full, areaB: annulus, length: Math.max(0.001, num(component.props, 'stroke', 100) / 1000) };
}

export const isCushioned = (component: EngineComponent): boolean => {
  const cushioning = component.props.cushioning;
  return typeof cushioning === 'string' && cushioning !== 'None';
};

export interface CylinderDrive {
  pressureA: number;
  pressureB: number;
  /** The chamber can push its fluid out (to exhaust / tank, or back into a firm supply). A trapped chamber locks the piston. */
  canDischargeA: boolean;
  canDischargeB: boolean;
  /** Flow-control factor α for each direction of travel. */
  throttleExtend: number;
  throttleRetract: number;
}

export interface CylinderOptions {
  idealVelocity: number;
  cushionZone: number;
  cushioned: boolean;
}

/**
 * One integration step of a piston (quasi-static: no inertia).
 *   F = p_A·A_A − p_B·A_B − F_spring(x);  the piston moves when |F| exceeds break-away friction,
 *   v = sign(F) · α · v_ideal · load · damping,   stroke ← clamp(stroke + v·Δt / L, 0, 1).
 */
export function stepCylinder(state: CylinderState, geometry: CylinderGeometry, meta: CylinderMeta, drive: CylinderDrive, options: CylinderOptions, dt: number): CylinderState {
  const pressureB = meta.front ? drive.pressureB : 0;
  const spring = meta.spring ? springPressure(state.stroke) * BAR * geometry.areaA : 0;
  const force = (drive.pressureA * geometry.areaA - pressureB * geometry.areaB) * BAR - spring;
  // The spring alone defines where a spring-return piston rests (F_air = F_spring), so it has no separate break-away band.
  const friction = meta.spring ? 0 : FRICTION_BAR * BAR * geometry.areaA;

  // Speed before end-position damping; zero when the force cannot break the piston away or its
  // exhausting chamber is trapped.
  let free = 0;
  if (Math.abs(force) > friction) {
    const direction = Math.sign(force);
    const canMove = direction > 0 ? !meta.front || drive.canDischargeB : drive.canDischargeA;
    if (canMove) {
      const load = Math.min(1, (Math.abs(force) - friction) / (FULL_SPEED_BAR * BAR * geometry.areaA));
      const alpha = clamp(direction > 0 ? drive.throttleExtend : drive.throttleRetract, 0.01, 1);
      free = direction * alpha * options.idealVelocity * load;
    }
  }

  // End-position damping slows the piston smoothly over the last stretch before the cap it approaches.
  // The damping depends on position, so the step is subdivided until each slice covers at most
  // MAX_SLICE of the stroke: a fast piston then passes the zone exactly like a slow one.
  const floor = options.cushioned ? 0.1 : 0.3;
  const slices = clamp(Math.ceil(Math.abs(free * dt) / geometry.length / MAX_SLICE), 1, MAX_SLICES);
  let stroke = state.stroke;
  for (let slice = 0; slice < slices && free !== 0; slice += 1) {
    const remaining = free > 0 ? 1 - stroke : stroke;
    const damping = remaining < options.cushionZone ? floor + (1 - floor) * (remaining / options.cushionZone) : 1;
    stroke = clamp(stroke + (free * damping * (dt / slices)) / geometry.length, 0, 1);
  }
  // A spring-return piston comes to rest exactly where air and spring balance: it never overshoots that
  // stroke (a coarse step or a short stroke would otherwise ring about it) and settles on it when close.
  if (meta.spring && free !== 0) {
    const equilibrium = springEquilibriumStroke(drive.pressureA);
    if (free > 0) stroke = Math.min(stroke, equilibrium);
    else stroke = Math.max(stroke, equilibrium);
    if (Math.abs(stroke - equilibrium) < EQUILIBRIUM_TOLERANCE) stroke = equilibrium;
  }
  // Mean speed over the step; against an end cap the piston stops, whatever the force.
  const actual = dt > 0 ? ((stroke - state.stroke) * geometry.length) / dt : 0;
  return { stroke, velocity: actual, force, chamberPressureA: drive.pressureA, chamberPressureB: pressureB };
}

/* ───────────────────────── Motors and semi-rotary actuators ───────────────────────── */

export interface MotorDrive {
  pressureIn: number;
  pressureOut: number;
  /** Each port can pass its fluid on (to exhaust / tank or back into a firm supply). */
  canDischargeIn: boolean;
  canDischargeOut: boolean;
  /** Flow coefficient of the supply and return lines for forward (in → out) and reverse running. */
  flowForward: number;
  flowReverse: number;
}

export interface MotorOptions {
  /** Pressure at which the unit reaches its rated speed. */
  nominalPressure: number;
  /** Below this pressure difference a semi-rotary actuator does not move. */
  threshold: number;
  /** Full-swivel time of a semi-rotary actuator at nominal pressure. */
  swivelTime: number;
}

/**
 * One step of a rotary unit.
 *   RPM = (P_in − P_out) / P_nominal × RatedRPM × capacityRatio × Cv
 * A unit only turns if the low-pressure side can discharge; single-direction units never run backwards.
 */
export function stepMotor(component: EngineComponent, meta: MotorMeta, state: MotorState, drive: MotorDrive, options: MotorOptions, dt: number): MotorState {
  const difference = drive.pressureIn - drive.pressureOut;
  const forward = difference > 0;
  const allowed = forward ? drive.canDischargeOut : meta.reversible(component.props) && drive.canDischargeIn;
  const flow = clamp(forward ? drive.flowForward : drive.flowReverse, 0.01, 1);
  const ratio = allowed && options.nominalPressure > 0 ? difference / options.nominalPressure : 0;

  if (meta.kind === 'swivel') {
    const travel = Math.max(1, num(component.props, 'angle', 180));
    const speed = Math.abs(difference) > options.threshold ? clamp(ratio, -1, 1) * flow * (travel / options.swivelTime) : 0; // deg/s
    const angle = clamp(state.angle + speed * dt, 0, travel);
    return { angle, rpm: dt > 0 ? (angle - state.angle) / dt / 6 : 0 };
  }

  const capacity = meta.variable ? clamp(num(component.props, 'capacityRatio', 1), 0, 1) : 1;
  const rpm = ratio * Math.max(0, num(component.props, 'speed', 0)) * capacity * flow;
  const angle = (((state.angle + rpm * 6 * dt) % 360) + 360) % 360;
  return { rpm, angle };
}
