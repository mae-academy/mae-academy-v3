/**
 * Fluid engine data model.
 *
 * The engine is headless: nothing under shared/fluid/engine may import UI code. Pressures are gauge
 * pressures in bar, flow rates in L/min, lengths in metres, time in seconds.
 */

export type EngineMedium = 'AIR' | 'OIL';

/* ── Network description (structural subset of the canvas document) ── */

export interface EngineComponent {
  id: string;
  type: string;
  props: Record<string, unknown>;
}

export interface EngineWire {
  id: string;
  fromComp: string;
  fromTerm: string;
  toComp: string;
  toTerm: string;
}

export interface EngineNetwork {
  components: EngineComponent[];
  wires: EngineWire[];
}

/** A port of a component as a graph node: `${componentId}:${portId}`. */
export type NodeId = string;
export const nodeId = (componentId: string, portId: string): NodeId => `${componentId}:${portId}`;

/* ── Solved state ── */

/** One pipe net: every port joined by wires shares a single pressure. */
export interface FluidNetNode {
  id: string;
  pressure: number;     // In bar (e.g., 0 to 10 bar)
  flowRate: number;     // In L/min
  medium: EngineMedium;
  isExhaust: boolean;   // Open to atmosphere or hydraulic tank line
  connectedPortIds: string[];
}

export interface ValveState {
  /**
   * 0: Rest, 1: Actuated, 2: Center/Neutral (for 3-position).
   * Position 1 is always the envelope selected by the left operator / port 14 (1→4 on 4- and 5-port valves);
   * position 0 is the envelope selected by the right operator / port 12 (1→2).
   */
  position: number;
  spoolOffset: number;  // Visual normalized offset (-1.0 to 1.0)
  latched: boolean;     // Bistable memory flag
  /** Envelope (square) sitting over the ports, counted left to right as drawn. */
  envelope: number;
}

export interface CylinderState {
  stroke: number;       // Normalized position 0.0 (retracted) to 1.0 (extended)
  velocity: number;     // m/s
  force: number;        // Net force in Newtons
  chamberPressureA: number; // bar
  chamberPressureB: number; // bar
}

/** Air motor, hydraulic motor or semi-rotary actuator. */
export interface MotorState {
  /** Shaft speed; negative when a bidirectional unit runs backwards. */
  rpm: number;
  /** Shaft angle in degrees (0–360 for motors, 0–swivel angle for a semi-rotary actuator). */
  angle: number;
}

export interface ReliefState {
  /** The valve is passing flow to exhaust / tank to hold its line at the cracking pressure. */
  open: boolean;
}

export type DiagnosticCode = 'MISSING_RELIEF_VALVE' | 'DEADHEAD_OVERPRESSURE';

export interface EngineDiagnostic {
  code: DiagnosticCode;
  severity: 'warning' | 'error';
  /** The pump the finding is about. */
  componentId: string;
  message: string;
}

/** Travel direction in which an idle-return (one-way trip) roller is depressed. */
export type TriggerDirection = 'EXTEND_ONLY' | 'RETRACT_ONLY';

/** Moving part of a logic / non-return element: shuttle ball, AND spool, quick-exhaust seal, check ball. */
export interface LogicElementState {
  /** Normalized travel, -1.0 to 1.0 (0 = centred / seated). */
  offset: number;
}

/** A storage volume (air reservoir, the chamber of a time-delay valve): its pressure is a state, not an instant consequence of the supply. */
export interface VolumeState {
  /** Gauge pressure of the chamber (bar). */
  pressure: number;
  /** Rate of change of the pressure (bar/s): positive while charging, negative while discharging. */
  rate: number;
  /** Vessel volume (cm³). */
  volumeCm3: number;
  /** Highest supply pressure in the circuit (bar): the line pressure the chamber charges towards. */
  supply: number;
}

export interface EngineSnapshot {
  time: number;
  medium: EngineMedium;
  nets: FluidNetNode[];
  /** Pressure of every port node, keyed by `${componentId}:${portId}`. */
  portPressure: Record<NodeId, number>;
  valves: Record<string, ValveState>;
  cylinders: Record<string, CylinderState>;
  logic: Record<string, LogicElementState>;
  motors: Record<string, MotorState>;
  reliefValves: Record<string, ReliefState>;
  /** Storage volumes (air reservoirs, time-delay chambers), keyed by component id. */
  volumes: Record<string, VolumeState>;
  /** Hydraulic circuit findings (empty for pneumatics). */
  diagnostics: EngineDiagnostic[];
  /** Limit switches, keyed by `${cylinderId}:S1` (retracted) and `${cylinderId}:S2` (extended). */
  sensors: Record<string, boolean>;
}

/* ── Internal connectivity produced by the component solvers ── */

export type Connection =
  /**
   * Free passage in both directions (open valve path, filter, pipe fitting).
   * `conductance` is the flow coefficient Cv ∈ (0, 1] for flow a → b and b → a; omitted means unrestricted.
   * A restricted direction fills or drains a storage volume over time; `free` marks a direction that bypasses the
   * restriction (the check valve of a one-way flow control), which acts instantly.
   */
  | { kind: 'open'; a: NodeId; b: NodeId; conductance?: [number, number]; free?: [boolean, boolean] }
  /** The port is open to atmosphere / tank in the component's current state. */
  | { kind: 'vent'; node: NodeId }
  /**
   * Passage from → to only. `drop` is lost on the way (cracking pressure), `limit` caps the outlet.
   * `firm` marks an element that actively maintains its outlet (regulator) rather than merely
   * letting pressure through and trapping it (check valve).
   */
  | { kind: 'oneWay'; from: NodeId; to: NodeId; drop?: number; limit?: number; firm?: boolean }
  /** Shuttle valve: out = max(inputs). */
  | { kind: 'or'; inputs: [NodeId, NodeId]; out: NodeId }
  /** Dual-pressure valve: out = min(inputs) once both exceed the threshold. */
  | { kind: 'and'; inputs: [NodeId, NodeId]; out: NodeId; threshold: number }
  /** Quick exhaust: supply feeds work; work dumps to atmosphere whenever supply falls below it. */
  | { kind: 'quickExhaust'; supply: NodeId; work: NodeId };

export interface PressureSource {
  node: NodeId;
  pressure: number;
  /**
   * A positive-displacement pump: it only builds pressure against resistance. Given a free path to tank
   * (a tandem centre, a bypass) it pumps round at no pressure instead of holding its set pressure.
   */
  unloads?: boolean;
}
export interface PressureCap { node: NodeId; limit: number }

/* ── Inputs and configuration ── */

export type OperatorSide = 'left' | 'right';
export interface ManualInput { left: boolean; right: boolean }

/** Reed switch / sensor wiring: while the sensor is on, pilot pressure is injected into the given port. */
export interface SensorLink {
  sensorId: string;
  componentId: string;
  portId: string;
  /** Injected pressure in bar; defaults to the nominal system pressure. */
  pressure?: number;
}

export interface EngineConfig {
  /** Auto-detected from the component types when omitted. */
  medium?: EngineMedium;
  /** Fixed integration step in seconds. */
  dt: number;
  /** Source pressure used when a compressor / pump does not specify one. */
  nominalPressure: Record<EngineMedium, number>;
  /** Pressure above which a logic input counts as "on". */
  gateThreshold: number;
  /** Pressure needed on a pilot port to shift a spool (its cracking pressure, 2.5 – 3 bar on real valves). */
  pilotThreshold: number;
  /** Unthrottled piston speed in m/s. */
  idealVelocity: Record<EngineMedium, number>;
  /** Distance from each end of the stroke, in mm, within which the limit switch is made (±3 mm). */
  sensorToleranceMm: number;
  /** Stroke window at each end in which end-position damping acts. */
  cushionZone: number;
  /** Upper bound on valve/pressure relaxation rounds inside one tick. */
  maxRelaxations: number;
  /** How long an idle-return roller holds its valve after the cylinder trips it, in seconds. */
  idleRollerPulse: number;
  /** Time a semi-rotary actuator needs for its full swivel angle at nominal pressure, in seconds. */
  swivelTime: number;
  sensorLinks: SensorLink[];
}

export const DEFAULT_ENGINE_CONFIG: EngineConfig = {
  dt: 0.016,
  nominalPressure: { AIR: 6, OIL: 50 },
  gateThreshold: 0.5,
  pilotThreshold: 3,
  idealVelocity: { AIR: 0.2, OIL: 0.1 },
  sensorToleranceMm: 3,
  cushionZone: 0.1,
  maxRelaxations: 8,
  idleRollerPulse: 0.12,
  swivelTime: 1,
  sensorLinks: [],
};
