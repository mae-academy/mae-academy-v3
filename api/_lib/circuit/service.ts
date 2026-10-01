import { z } from 'zod';
import { canonicalJson } from '../../../shared/plcWire';
import { CIRCUIT_PROTOCOL_VERSION, type CircuitDescription, type Diagnostic, type PowerSummary } from '../../../shared/circuit/protocol';
import { terminalKey, type CircuitComponent, type CircuitWire } from '../../../shared/circuit/circuitTypes';
import { getDef } from '../../../shared/circuit/componentDefs';
import type { MNAElement } from '../../../shared/circuit/mnaTypes';
import { SolveRequestSchema, LIMITS, type ParsedSolveRequest } from '../../circuit/schema';
import { compileDcTopology, netLookupFromNets } from './engine/compileDc';
import { MNAError, MNASolver } from './engine/mnaSolver';
import { TabDSimulationEngine, type TabDEngineState } from './engine/analogSimulation';
import { runAnalysis } from './analysis';

/**
 * Bounded least-recently-used cache of validated circuit descriptions, one per isolate. The key is a hash the server computes
 * itself from the circuit it validated, so a client cannot plant content under someone else's hash. A miss is harmless: the
 * client answers the 409 by sending the circuit again.
 */
export class CircuitCache {
  private readonly entries = new Map<string, CircuitDescription>();
  constructor(private readonly max = 32) {}

  get(hash: string): CircuitDescription | undefined {
    const entry = this.entries.get(hash);
    if (entry) { this.entries.delete(hash); this.entries.set(hash, entry); }
    return entry;
  }

  set(hash: string, entry: CircuitDescription): void {
    this.entries.delete(hash);
    this.entries.set(hash, entry);
    while (this.entries.size > this.max) this.entries.delete(this.entries.keys().next().value as string);
  }

  get size(): number { return this.entries.size; }
}

export const defaultCircuitCache = new CircuitCache();

export interface ServeResult {
  readonly status: number;
  readonly body: Record<string, unknown>;
}

/** 128-bit content hash of a validated circuit. */
export async function circuitHash(circuit: unknown): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonicalJson(circuit)));
  return Array.from(new Uint8Array(digest).subarray(0, 16), (b) => b.toString(16).padStart(2, '0')).join('');
}

const toComponents = (description: CircuitDescription): CircuitComponent[] =>
  description.components.map((component) => ({
    id: component.id, type: component.type, label: component.label ?? component.id, x: 0, y: 0, rotation: 0, flipH: false, flipV: false,
    props: { ...component.props }, ...(component.state ? { state: { ...component.state } } : {}),
  }));

const toWires = (description: CircuitDescription): CircuitWire[] =>
  description.wires.map(([id, fromComp, fromTerm, toComp, toTerm]) => ({ id, fromComp, fromTerm, toComp, toTerm, path: [], routing: 'orthogonal' as const }));

const round = (value: number): number => (Number.isFinite(value) && value !== 0 ? Number(value.toPrecision(9)) : value);
const roundRecord = (record: Record<string, number>): Record<string, number> => Object.fromEntries(Object.entries(record).map(([key, value]) => [key, round(value)]));

/** Power per component (W, positive = absorbed) from the MNA netlist of a DC solution. */
export function powerFromElements(elements: MNAElement[], nodeVoltages: Record<string, number>, branchCurrents: Record<string, number>): PowerSummary {
  const v = (node?: string) => (node === undefined || node === '0' ? 0 : nodeVoltages[node] ?? 0);
  const byComponent: Record<string, number> = {};
  for (const element of elements) {
    if (element.isBurned) continue;
    const owner = element.id.split(':')[0];
    const current = branchCurrents[element.id] ?? 0;
    let absorbed = 0;
    if (element.type === 'resistor') absorbed = ((v(element.positive) - v(element.negative)) ** 2) / element.resistance;
    else if (element.type === 'current') absorbed = (v(element.from) - v(element.to)) * element.current;
    else if (element.type === 'current-sense') absorbed = 0;
    else absorbed = (v(element.positive) - v(element.negative)) * current;
    byComponent[owner] = (byComponent[owner] ?? 0) + absorbed;
  }
  return summarize(byComponent);
}

/** Power per component for the two-terminal parts of a transient snapshot (reactive parts included at the instant, multi-terminal parts skipped). */
export function powerFromSnapshot(components: CircuitComponent[], terminalVoltages: Record<string, number>, branchCurrents: Record<string, number>): PowerSummary {
  const byComponent: Record<string, number> = {};
  for (const component of components) {
    if (component.state?.isBurned) continue;
    const terminals = getDef(component.type)?.terminals ?? [];
    const current = branchCurrents[component.id];
    if (terminals.length !== 2 || current === undefined) continue;
    const at = (index: number) => terminalVoltages[terminalKey(component.id, terminals[index].id)] ?? 0;
    // Independent current sources carry their current from `neg` to `pos`; every other two-terminal part carries it into its first terminal.
    byComponent[component.id] = (component.type === 'dc-current' || component.type === 'ac-current' ? at(1) - at(0) : at(0) - at(1)) * current;
  }
  return summarize(byComponent);
}

function summarize(byComponent: Record<string, number>): PowerSummary {
  let delivered = 0; let absorbed = 0;
  for (const power of Object.values(byComponent)) { if (power < 0) delivered -= power; else absorbed += power; }
  return { delivered: round(delivered), absorbed: round(absorbed), byComponent: roundRecord(byComponent) };
}

function runDc(circuit: CircuitDescription): Record<string, unknown> {
  const components = toComponents(circuit);
  const diagnostics: Diagnostic[] = [];
  try {
    const elements = compileDcTopology(components, toWires(circuit), netLookupFromNets(circuit.nodes));
    if (!elements.length) return { ok: true, diagnostics, nodeVoltages: {}, branchCurrents: {}, powerSummary: { delivered: 0, absorbed: 0, byComponent: {} } };
    const result = new MNASolver(elements).solve();
    for (const component of components) if (component.state?.isBurned) result.branchCurrents[component.id] = 0;
    return {
      ok: true, diagnostics,
      nodeVoltages: roundRecord(result.nodeVoltages), branchCurrents: roundRecord(result.branchCurrents),
      powerSummary: powerFromElements(elements, result.nodeVoltages, result.branchCurrents),
    };
  } catch (error) {
    if (error instanceof MNAError) diagnostics.push({ code: error.code, message: error.message });
    else diagnostics.push({ code: 'INVALID_CIRCUIT', message: 'Invalid Circuit: MNA evaluation failed' });
    return { ok: false, diagnostics, nodeVoltages: {}, branchCurrents: {}, powerSummary: { delivered: 0, absorbed: 0, byComponent: {} } };
  }
}

type TransientRequest = Extract<ParsedSolveRequest, { analysisType: 'transient' }>;

function runTransient(circuit: CircuitDescription, request: TransientRequest): Record<string, unknown> {
  const components = toComponents(circuit);
  const engine = new TabDSimulationEngine();
  engine.setCircuit(components, toWires(circuit));
  engine.setNets(netLookupFromNets(circuit.nodes));
  if (request.state) engine.importState(request.state as TabDEngineState, request.retain ? new Set(request.retain) : undefined);

  // Bound the work, not the request: never more than `maxSubsteps` fixed integration steps per call.
  const fixedDt = engine.fixedStep();
  const affordable = Math.max(1, Math.floor((LIMITS.maxSubsteps * fixedDt) / request.timeStep));
  const steps = Math.min(request.steps, affordable);
  const startTime = engine.getTime();
  let snapshot = engine.getSnapshot();
  for (let index = 0; index < steps; index += 1) snapshot = engine.step(Math.max(request.timeStep, fixedDt));

  const diagnostics: Diagnostic[] = snapshot.warnings.map((warning) => ({ code: warning.code, message: warning.message, ...(warning.componentId ? { componentId: warning.componentId } : {}) }));
  return {
    ok: snapshot.converged, diagnostics,
    advanced: round(Math.max(0, engine.getTime() - startTime)),
    time: snapshot.time,
    converged: snapshot.converged,
    nodeVoltages: roundRecord(snapshot.nodeVoltages),
    terminalVoltages: roundRecord(snapshot.terminalVoltages),
    branchCurrents: roundRecord(snapshot.branchCurrents),
    wireCurrents: roundRecord(snapshot.wireCurrents ?? {}),
    wirePhases: roundRecord(snapshot.wirePhases ?? {}),
    componentPowered: snapshot.componentPowered,
    componentIntensity: roundRecord(snapshot.componentIntensity),
    instrumentReadings: snapshot.instrumentReadings,
    powerSummary: snapshot.converged ? powerFromSnapshot(components, snapshot.terminalVoltages, snapshot.branchCurrents) : { delivered: 0, absorbed: 0, byComponent: {} },
    state: engine.exportState(),
  };
}

/** Transport-free request handler: easy to test, and shared by the Vercel function and Express. */
export async function serveSolve(payload: unknown, cache: CircuitCache = defaultCircuitCache): Promise<ServeResult> {
  const version = (payload as { v?: unknown } | null)?.v;
  if (version !== CIRCUIT_PROTOCOL_VERSION) {
    return { status: 400, body: { error: 'version_mismatch', expected: CIRCUIT_PROTOCOL_VERSION, message: 'The simulator was updated; reload the page.' } };
  }
  const parsed = SolveRequestSchema.safeParse(payload);
  if (!parsed.success) return { status: 400, body: { error: 'Invalid request', issues: z.treeifyError(parsed.error) } };
  const request = parsed.data;

  let hash: string;
  let circuit: CircuitDescription | undefined;
  if (request.circuit) {
    circuit = request.circuit as CircuitDescription;
    hash = await circuitHash(circuit);
    cache.set(hash, circuit);
  } else {
    hash = request.h!;
    circuit = cache.get(hash);
    if (!circuit) return { status: 409, body: { v: CIRCUIT_PROTOCOL_VERSION, error: 'need_circuit' } };
  }

  const common = { v: CIRCUIT_PROTOCOL_VERSION, analysisType: request.analysisType, h: hash };
  switch (request.analysisType) {
    case 'dc': return { status: 200, body: { ...common, ...runDc(circuit) } };
    case 'transient': return { status: 200, body: { ...common, ...runTransient(circuit, request) } };
    case 'analysis': return { status: 200, body: { ...common, ...runAnalysis(circuit, request, toComponents(circuit)) } };
  }
}
