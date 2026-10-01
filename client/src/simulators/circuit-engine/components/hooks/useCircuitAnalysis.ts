import { useEffect, useMemo, useRef, useState } from 'react';
import type { AnalysisMethod, AnalysisTrace, NodalNodeLabel } from '@shared/circuit/analysisTypes';
import type { CircuitComponent, CircuitWire } from '@shared/circuit/circuitTypes';
import type { MeshGeometry } from '@shared/circuit/meshGeometry';
import type { MNAElement } from '@shared/circuit/mnaTypes';
import { describeCircuit, type NetLookup } from '@shared/circuit/nets';
import type { AnalysisRequest, CircuitDescription } from '@shared/circuit/protocol';
import { CircuitSession, type CircuitTransport, solveRemote } from '@/services/circuitClient';

export interface AnalysisInput {
  components: CircuitComponent[];
  wires: CircuitWire[];
  netLookup?: NetLookup;
  method: AnalysisMethod;
  targetResistor: string;
  targetSource: string;
  nodalNodes: NodalNodeLabel[];
  geometry?: MeshGeometry;
  enabled: boolean;
}

export interface AnalysisState {
  /** The DC netlist the derivation was computed from (parameters only). */
  elements: MNAElement[];
  trace: AnalysisTrace | null;
  pending: boolean;
  error: string | null;
}

const IDLE: AnalysisState = { elements: [], trace: null, pending: false, error: null };
const DEBOUNCE_MS = 120;

/** Only what the mesh solver reads of the canvas: face outlines and branch directions, with the Map flattened for JSON. */
function meshPayload(geometry: MeshGeometry | undefined): AnalysisRequest['geometry'] {
  if (!geometry) return undefined;
  return {
    branches: geometry.branches,
    wires: geometry.graph ? [] : geometry.wires,
    ...(geometry.graph ? { graph: { faces: geometry.graph.faces.map((face) => ({ index: face.index, points: face.points, branchDirections: Array.from(face.branchDirections), branchIds: face.branchIds, signedArea: face.signedArea })), topology: geometry.graph.topology } } : {}),
  };
}

/**
 * Requests the academic derivation of the current schematic from the server. The panel keeps showing the previous result while the
 * next one is computed; a superseded request is aborted, and edits are coalesced for 120 ms.
 */
export function useCircuitAnalysis(input: AnalysisInput, transport: CircuitTransport = solveRemote): AnalysisState {
  const { components, wires, netLookup, method, targetResistor, targetSource, nodalNodes, geometry, enabled } = input;
  const description = useMemo<CircuitDescription | null>(() => (enabled ? describeCircuit(components, wires, netLookup) : null), [components, wires, netLookup, enabled]);
  const circuitKey = useMemo(() => (description ? JSON.stringify(description) : ''), [description]);
  const request = useMemo<Omit<AnalysisRequest, 'v' | 'h' | 'circuit'>>(() => ({
    analysisType: 'analysis', method,
    ...(targetResistor ? { targetResistor } : {}),
    ...(targetSource ? { targetSource } : {}),
    ...(method === 'nodal' ? { nodalNodes: nodalNodes.map(({ node, index, label, color }) => ({ node, index, label, color })) } : {}),
    ...(method === 'mesh' ? { geometry: meshPayload(geometry) } : {}),
  }), [method, targetResistor, targetSource, nodalNodes, geometry]);
  const requestKey = useMemo(() => JSON.stringify(request), [request]);
  const sessionRef = useRef<{ key: string; session: CircuitSession } | null>(null);
  const [state, setState] = useState<AnalysisState>(IDLE);

  useEffect(() => {
    if (!description) { setState(IDLE); return undefined; }
    const controller = new AbortController();
    setState((previous) => ({ ...previous, pending: true }));
    const timer = setTimeout(async () => {
      try {
        if (sessionRef.current?.key !== circuitKey) sessionRef.current = { key: circuitKey, session: new CircuitSession(description, transport) };
        const response = await sessionRef.current.session.send(request, controller.signal);
        if (!controller.signal.aborted) setState({ elements: response.elements, trace: response.trace, pending: false, error: null });
      } catch (error) {
        if (controller.signal.aborted) return;
        setState((previous) => ({ ...previous, pending: false, error: error instanceof Error ? error.message : 'Analysis unavailable' }));
      }
    }, DEBOUNCE_MS);
    return () => { clearTimeout(timer); controller.abort(); };
    // `description` is derived from circuitKey; the key is the stable dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [circuitKey, requestKey, transport]);

  return state;
}
