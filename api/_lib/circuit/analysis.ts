import type { CircuitDescription, Diagnostic } from '../../../shared/circuit/protocol';
import type { CircuitComponent, CircuitWire } from '../../../shared/circuit/circuitTypes';
import type { AnalysisTrace, NodalNodeLabel } from '../../../shared/circuit/analysisTypes';
import type { MeshGeometry } from '../../../shared/circuit/meshGeometry';
import type { ParsedSolveRequest } from '../../circuit/schema';
import { compileDcTopology, netLookupFromNets } from './engine/compileDc';
import { NodalSolver } from './engine/NodalSolver';
import { MeshSolver } from './engine/MeshSolver';
import { SuperpositionSolver } from './engine/SuperpositionSolver';
import { SourceTransformationSolver } from './engine/SourceTransformationSolver';
import { TheveninSolver } from './engine/TheveninSolver';

type AnalysisRequest = Extract<ParsedSolveRequest, { analysisType: 'analysis' }>;

/** Academic derivation (nodal / mesh / superposition / source transformation / Thévenin) of the DC circuit, plus the netlist it was derived from. */
export function runAnalysis(circuit: CircuitDescription, request: AnalysisRequest, components: CircuitComponent[]): Record<string, unknown> {
  const diagnostics: Diagnostic[] = [];
  const wires: CircuitWire[] = circuit.wires.map(([id, fromComp, fromTerm, toComp, toTerm]) => ({ id, fromComp, fromTerm, toComp, toTerm, path: [], routing: 'orthogonal' as const }));
  const elements = compileDcTopology(components, wires, netLookupFromNets(circuit.nodes));
  const nodalNodes = (request.nodalNodes ?? []).map((item): NodalNodeLabel => ({ ...item, centroid: [0, 0] }));
  let trace: AnalysisTrace;
  if (!elements.length) {
    trace = { method: request.method, status: 'unsupported', heading: 'Academic Analysis', steps: [], warning: 'Build a grounded DC circuit to generate a derivation.' };
  } else {
    switch (request.method) {
      case 'nodal': trace = new NodalSolver(elements, nodalNodes).analyze(); break;
      case 'mesh': trace = new MeshSolver(elements, request.geometry as MeshGeometry | undefined).analyze(); break;
      case 'superposition': trace = new SuperpositionSolver(elements).analyze(request.targetResistor ?? ''); break;
      case 'transform': trace = new SourceTransformationSolver(elements).analyze(request.targetSource ?? '', request.targetResistor ?? ''); break;
      case 'thevenin': trace = new TheveninSolver(elements).analyze(request.targetResistor ?? ''); break;
    }
  }
  return { ok: trace.status !== 'error', diagnostics, elements, trace };
}
