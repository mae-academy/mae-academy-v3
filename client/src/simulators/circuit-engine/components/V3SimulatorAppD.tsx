import { useEffect } from 'react';
import { publishDocsTool } from '@/components/simulations/toolDocs/activeToolStore';
import { V3Home } from './pages/Home';
import { RemoteCircuitEngine } from '@/simulators/circuit-engine/engine/RemoteCircuitEngine';

export function V3SimulatorAppD() {
  // The studio has a single workspace mode; publish it so the per-tool documentation follows.
  useEffect(() => { publishDocsTool('circuits', 'workspace'); }, []);
  // The solver runs on the server (POST /api/circuit/solve); the engine below only batches steps and carries its state.
  return <div className="v3-simulator-root simulator-theme-b" data-simulator-theme="b"><V3Home createSimulationEngine={() => new RemoteCircuitEngine()} tabDUiRefinement /></div>;
}
