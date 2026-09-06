import { DigitalLogicSimulatorHome } from './pages/Home';

/**
 * Isolated V3 application mount. The original V3 Home page owns its own
 * component, wire, viewport, selection, simulation, and instrument state.
 * V3's standalone global stylesheet and router are deliberately not imported
 * here, preventing its reset/theme rules from leaking into Tab A.
 */
export function DigitalLogicSimulatorBaseApp() {
  return <div className="v3-simulator-root simulator-theme-b" data-simulator-theme="b"><DigitalLogicSimulatorHome /></div>;
}
