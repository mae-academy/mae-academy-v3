import { z } from 'zod';
import type { CircuitComponent, CircuitWire, SimulationSnapshot } from '../../../shared/logic/circuitTypes';
import { generateTruthTable, maxtermIndices, mintermIndices, parseBooleanExpression } from '../../../shared/logic/logicEngine';
import { LogicRequestSchema, type LogicRequest } from '../../logic/schema';
import { DiscreteEventLogicEngine, type DesWireState, type LogicState } from './desLogicCore';
import { DigitalLogicSimulationEngine } from './digitalLogicSimulation';
import { generateExcitationTable, generateStateAssignments, generateStateTable, generateVerilog, minimizeExcitationEquations } from './fsmEngine';
import { IdealLogicEngine } from './idealLogicEngine';
import { solveKMap } from './kmapSolver';
import { deriveUniversalSynthesis } from './synthesisEngine';
import { evaluateTimingWaveforms } from './timingEngine';

export const LOGIC_PROTOCOL_VERSION = 1;

export interface ServeResult {
  readonly status: number;
  readonly body: Record<string, unknown>;
}

const toCircuit = (request: Extract<LogicRequest, { components: unknown }>): { components: CircuitComponent[]; wires: CircuitWire[] } => ({
  components: request.components.map(c => ({ ...c })),
  wires: request.wires.map(w => ({ ...w, routing: 'orthogonal' as const, path: [[0, 0], [20, 0]] as [number, number][] })),
});

/** The part of a snapshot the browser reads; histories and instrument tables are not produced by these engines. */
const slim = (snapshot: SimulationSnapshot) => ({
  time: snapshot.time,
  terminalVoltages: snapshot.terminalVoltages,
  nodeVoltages: snapshot.nodeVoltages,
  branchCurrents: snapshot.branchCurrents,
  wireCurrents: snapshot.wireCurrents,
  componentPowered: snapshot.componentPowered,
  componentIntensity: snapshot.componentIntensity,
  instrumentReadings: snapshot.instrumentReadings,
  warnings: snapshot.warnings,
  converged: snapshot.converged,
  ...(snapshot.status ? { status: snapshot.status } : {}),
});

function runDes(request: Extract<LogicRequest, { op: 'des' }>) {
  const { components, wires } = toCircuit(request);
  const engine = new DiscreteEventLogicEngine();
  const events: [string, LogicState, number][] = [];
  wires.forEach(w => engine.subscribeToWire(w.id, (value, atNs) => events.push([w.id, value, atNs])));
  if (request.state) engine.importState(components, wires, request.state as DesWireState);
  else engine.setCircuit(components, wires);
  const inputIds = new Set(components.filter(c => c.type === 'digital-input').map(c => c.id));
  for (const op of request.ops) {
    if (op.t !== 'step' && !inputIds.has(op.id)) throw new Error(`Unknown Digital Logic input: ${op.id}`);
    if (op.t === 'step') engine.step(op.dt);
    else if (op.t === 'toggle') engine.toggleDigitalInput(op.id);
    else engine.driveDigitalInput(op.id, op.value);
  }
  return {
    state: engine.exportState(),
    snapshot: slim(engine.getSnapshot()),
    wires: engine.wireLevels(),
    pins: engine.pinLevels(),
    events,
  };
}

function runMixed(request: Extract<LogicRequest, { op: 'mixed' }>) {
  const { components, wires } = toCircuit(request);
  const engine = request.engine === 'ideal' ? new IdealLogicEngine() : new DigitalLogicSimulationEngine();
  engine.setCircuit(components, wires);
  let snapshot = engine.getSnapshot();
  for (let i = 0; i < request.steps; i += 1) snapshot = engine.step(request.dt);
  return { snapshot: slim(snapshot) };
}

function run(request: LogicRequest): Record<string, unknown> {
  switch (request.op) {
    case 'kmap':
      return { solution: solveKMap({ variables: request.variables, minterms: request.minterms, dontCares: request.dontCares }) };
    case 'synthesis':
      return { derivation: deriveUniversalSynthesis(request.expression, request.mode) };
    case 'truth-table': {
      const parsed = parseBooleanExpression(request.expression);
      const rows = generateTruthTable(parsed.ast, parsed.variables);
      return { variables: parsed.variables, rows, minterms: mintermIndices(rows), maxterms: maxtermIndices(rows) };
    }
    case 'fsm': {
      const assignments = generateStateAssignments(request.machine.states, request.encoding);
      const stateTable = generateStateTable(request.machine, request.encoding);
      const excitationTable = generateExcitationTable(stateTable, request.flipFlop);
      return {
        assignments,
        stateTable,
        excitationTable,
        equations: minimizeExcitationEquations(excitationTable, request.machine.inputName),
        ...(request.hdl ? { verilog: generateVerilog(request.machine, request.encoding) } : {}),
      };
    }
    case 'timing':
      return { evaluation: evaluateTimingWaveforms(request.expression, request.inputTracks, request.clock, request.options) };
    case 'des':
      return runDes(request);
    case 'mixed':
      return runMixed(request);
  }
}

/** Transport-free request handler: easy to test, and shared by the Vercel function and Express. */
export function serveLogic(payload: unknown): ServeResult {
  const parsed = LogicRequestSchema.safeParse(payload);
  if (!parsed.success) return { status: 400, body: { error: 'Invalid request', issues: z.treeifyError(parsed.error) } };
  try {
    return { status: 200, body: { v: LOGIC_PROTOCOL_VERSION, ok: true, ...run(parsed.data) } };
  } catch (error) {
    // Parse errors, unsupported forms, unknown input ids: the caller's input, reported as a diagnostic.
    return { status: 200, body: { v: LOGIC_PROTOCOL_VERSION, ok: false, error: error instanceof Error ? error.message : 'Evaluation failed' } };
  }
}
