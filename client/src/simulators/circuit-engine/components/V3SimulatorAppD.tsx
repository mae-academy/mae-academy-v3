import { V3Home } from './pages/Home';
import { RemoteCircuitEngine } from '@/simulators/circuit-engine/engine/RemoteCircuitEngine';

export function V3SimulatorAppD() {
  // The solver runs on the server (POST /api/circuit/solve); the engine below only batches steps and carries its state.
  return <div className="v3-simulator-root simulator-theme-b" data-simulator-theme="b"><V3Home createSimulationEngine={() => new RemoteCircuitEngine()} tabDUiRefinement /></div>;
}
