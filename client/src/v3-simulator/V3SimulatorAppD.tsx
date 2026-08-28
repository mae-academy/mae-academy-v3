import { V3Home } from './pages/Home';
import { evaluateTabDStaticMna, TabDSimulationEngine } from './lib/tabDSimulation';

/** Tab D reuses the exact Tab B visual component tree with an isolated solver instance. */
export function V3SimulatorAppD() {
  return <div className="v3-simulator-root simulator-theme-b" data-simulator-theme="b"><V3Home createSimulationEngine={() => new TabDSimulationEngine()} createStaticMna={evaluateTabDStaticMna} tabDUiRefinement /></div>;
}
