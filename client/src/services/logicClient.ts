import type { CircuitComponent, CircuitWire } from '@shared/logic/circuitTypes';
import type { DesWireState, LogicState } from '@shared/logic/desTypes';
import type { ExcitationRow, FlipFlopKind, FSMDefinition, FSMEncoding, FSMEquation, StateAssignment, StateTableRow } from '@shared/logic/fsmTypes';
import type { KMapProblem, KMapSolution } from '@shared/logic/kmapTypes';
import type { SynthesisDerivation, SynthesisMode } from '@shared/logic/synthesisTypes';
import type { TimingEvaluation, TimingEvaluationOptions, Waveform } from '@shared/logic/timingTypes';
import type { TruthTableRow } from '@shared/logic/logicEngine';

const ENDPOINT = '/api/logic/solve';

/** Wire format of one request; the server validates it against api/logic/schema.ts. */
export type LogicRequestBody = Record<string, unknown> & { op: string };
export type LogicResponseBody = Record<string, unknown> & { v?: number; ok?: boolean; error?: string; ms?: number };
export type LogicTransport = (body: LogicRequestBody, signal?: AbortSignal) => Promise<LogicResponseBody>;

export class LogicEngineError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

/** The engine understood the request and rejected its content (bad expression, unsupported form...). */
export class LogicEvaluationError extends Error {}

/** POSTs one request to the serverless engine. */
export const evaluateLogicRemote: LogicTransport = async (body, signal) => {
  let response: Response;
  try {
    response = await fetch(ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal });
  } catch (error) {
    if ((error as { name?: string }).name === 'AbortError') throw error;
    throw new LogicEngineError('Cannot reach the simulation engine');
  }
  if (!response.ok) {
    throw new LogicEngineError(
      response.status === 429 ? 'Simulation rate limit reached' : response.status === 403 ? 'The simulation engine refused this request' : `Simulation engine error (${response.status})`,
      response.status,
    );
  }
  return (await response.json()) as LogicResponseBody;
};

let transport: LogicTransport = evaluateLogicRemote;
/** Test seam: route requests through an in-process handler. Pass `null` to restore the network. */
export const setLogicTransport = (next: LogicTransport | null): void => {
  transport = next ?? evaluateLogicRemote;
};

async function call<T>(body: LogicRequestBody, signal?: AbortSignal): Promise<T> {
  const response = await transport(body, signal);
  if (response.ok === false) throw new LogicEvaluationError(response.error ?? 'The engine rejected the request');
  return response as unknown as T;
}

export const solveKMapRemote = async (problem: KMapProblem, signal?: AbortSignal): Promise<KMapSolution> =>
  (await call<{ solution: KMapSolution }>({ op: 'kmap', variables: [...problem.variables], minterms: [...problem.minterms], dontCares: [...(problem.dontCares ?? [])] }, signal)).solution;

export const deriveSynthesisRemote = async (expression: string, mode: SynthesisMode, signal?: AbortSignal): Promise<SynthesisDerivation> =>
  (await call<{ derivation: SynthesisDerivation }>({ op: 'synthesis', expression, mode }, signal)).derivation;

export const truthTableRemote = (expression: string, signal?: AbortSignal) =>
  call<{ variables: string[]; rows: TruthTableRow[]; minterms: number[]; maxterms: number[] }>({ op: 'truth-table', expression }, signal);

export interface FsmAnalysis {
  assignments: StateAssignment[];
  stateTable: StateTableRow[];
  excitationTable: ExcitationRow[];
  equations: FSMEquation[];
  verilog?: string;
}
export const analyzeFsmRemote = (machine: FSMDefinition, encoding: FSMEncoding, flipFlop: FlipFlopKind, hdl = false, signal?: AbortSignal) =>
  call<FsmAnalysis>({ op: 'fsm', machine, encoding, flipFlop, hdl }, signal);

export const evaluateTimingRemote = async (expression: string, inputTracks: readonly Waveform[], clock: Waveform, options: TimingEvaluationOptions = {}, signal?: AbortSignal): Promise<TimingEvaluation> =>
  (await call<{ evaluation: TimingEvaluation }>({ op: 'timing', expression, inputTracks, clock, options }, signal)).evaluation;

export interface DesSnapshotWire {
  time: number;
  terminalVoltages: Record<string, number>;
  wireCurrents: Record<string, number>;
  componentPowered: Record<string, boolean>;
  componentIntensity: Record<string, number>;
  warnings: { code: string; message: string }[];
  converged: boolean;
  status?: 'settled' | 'oscillating';
}
export type DesOp = { t: 'toggle'; id: string } | { t: 'drive'; id: string; value: LogicState } | { t: 'step'; dt: number };
export interface DesResult {
  state: DesWireState;
  snapshot: DesSnapshotWire;
  wires: Record<string, LogicState>;
  pins: Record<string, LogicState>;
  events: [string, LogicState, number][];
  ms?: number;
}
const slimCircuit = (components: readonly CircuitComponent[], wires: readonly CircuitWire[]) => ({
  components: components.map(({ id, type, x, y, rotation, flipH, flipV, label, props }) => ({ id, type, x, y, rotation, flipH, flipV, label, props: stripProps(props) })),
  wires: wires.map(({ id, fromComp, fromTerm, toComp, toTerm }) => ({ id, fromComp, fromTerm, toComp, toTerm })),
});
/** Only JSON primitives cross the wire (the schema rejects nested values). */
const stripProps = (props: Record<string, unknown>) => Object.fromEntries(Object.entries(props).filter(([, v]) => v === null || ['string', 'number', 'boolean'].includes(typeof v)));

export const runDesRemote = (components: readonly CircuitComponent[], wires: readonly CircuitWire[], state: DesWireState | null, ops: readonly DesOp[], signal?: AbortSignal) =>
  call<DesResult>({ op: 'des', ...slimCircuit(components, wires), state, ops: [...ops] }, signal);

export const runMixedRemote = (engine: 'tab-d' | 'ideal', components: readonly CircuitComponent[], wires: readonly CircuitWire[], steps = 2, dt = 1e-3, signal?: AbortSignal) =>
  call<{ snapshot: DesSnapshotWire }>({ op: 'mixed', engine, ...slimCircuit(components, wires), steps, dt }, signal);
