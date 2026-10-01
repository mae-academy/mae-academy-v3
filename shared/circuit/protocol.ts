import type { AnalysisMethod, AnalysisTrace, NodalNodeLabel } from './analysisTypes';
import type { InstrumentReading, SimulationWarning } from './circuitTypes';
import type { MeshGeometry } from './meshGeometry';
import type { MNAElement } from './mnaTypes';

/** Wire protocol of POST /api/circuit/solve. The schematic travels as electrical topology and parameters only: no coordinates, routing or symbols. */
export const CIRCUIT_PROTOCOL_VERSION = 1;

export type AnalysisType = 'dc' | 'transient' | 'analysis';

export interface ElectricalComponent {
  id: string;
  type: string;
  label?: string;
  props: Record<string, string | number | boolean | null>;
  state?: { isBurned?: boolean };
}

/** [wireId, fromComp, fromTerm, toComp, toTerm] — connectivity only; the id lets per-wire results be attributed on the canvas. */
export type WireLink = [string, string, string, string, string];

/** Electrical nets: node name → member terminal keys ("R1:a"). The ground net is "0"; terminals in no net float. */
export type NetTable = Record<string, string[]>;

export interface CircuitDescription {
  components: ElectricalComponent[];
  wires: WireLink[];
  nodes: NetTable;
}

export interface SolveRequestBase {
  v: typeof CIRCUIT_PROTOCOL_VERSION;
  /** Hash of a circuit the server already holds (returned by an earlier response); omit it and send `circuit` to (re)register. */
  h?: string;
  circuit?: CircuitDescription;
}

export interface DcRequest extends SolveRequestBase { analysisType: 'dc' }

export interface TransientRequest extends SolveRequestBase {
  analysisType: 'transient';
  /** Simulated seconds per step. */
  timeStep: number;
  steps: number;
  /** Opaque engine state echoed from the previous response; omit to start the circuit from rest. */
  state?: unknown;
  /** First call after a schematic edit: ids of the parts whose stored energy / latches survive the edit. */
  retain?: string[];
}

export interface AnalysisRequest extends SolveRequestBase {
  analysisType: 'analysis';
  method: AnalysisMethod;
  targetResistor?: string;
  targetSource?: string;
  nodalNodes?: Array<Pick<NodalNodeLabel, 'node' | 'index' | 'label' | 'color'>>;
  geometry?: MeshGeometry;
}

export type SolveRequest = DcRequest | TransientRequest | AnalysisRequest;

export interface Diagnostic { code: string; message: string; componentId?: string }

export interface PowerSummary {
  /** Total power delivered by sources, W. */
  delivered: number;
  /** Total power absorbed by passive elements, W. */
  absorbed: number;
  byComponent: Record<string, number>;
}

export interface SolveResponseBase {
  v: typeof CIRCUIT_PROTOCOL_VERSION;
  ok: boolean;
  /** Circuit hash to send instead of the circuit from now on. */
  h?: string;
  diagnostics: Diagnostic[];
  /** Server time spent on the request, ms. */
  ms?: number;
}

export interface DcResponse extends SolveResponseBase {
  analysisType: 'dc';
  nodeVoltages: Record<string, number>;
  branchCurrents: Record<string, number>;
  powerSummary: PowerSummary;
}

export interface TransientResponse extends SolveResponseBase {
  analysisType: 'transient';
  /** Simulated seconds the engine actually advanced (it may do less than requested to bound the work). */
  advanced: number;
  time: number;
  converged: boolean;
  nodeVoltages: Record<string, number>;
  terminalVoltages: Record<string, number>;
  branchCurrents: Record<string, number>;
  wireCurrents: Record<string, number>;
  wirePhases: Record<string, number>;
  componentPowered: Record<string, boolean>;
  componentIntensity: Record<string, number>;
  instrumentReadings: Record<string, InstrumentReading>;
  powerSummary: PowerSummary;
  state: unknown;
}

export interface AnalysisResponse extends SolveResponseBase {
  analysisType: 'analysis';
  elements: MNAElement[];
  trace: AnalysisTrace;
}

export type SolveResponse = DcResponse | TransientResponse | AnalysisResponse;

export type { SimulationWarning };
