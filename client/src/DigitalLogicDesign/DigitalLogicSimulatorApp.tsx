import { DigitalLogicSimulatorHome } from './pages/Home';
import { LogicAnalyzer } from './pages/LogicAnalyzer';
import { KMapMinimizer } from './pages/KMapMinimizer';
import { UniversalSynthesis } from './pages/UniversalSynthesis';
import { TimingWaveforms } from './pages/TimingWaveforms';
import { StateMachineExplorer } from './pages/StateMachineExplorer';
import { DiscreteEventLogicEngine } from './lib/desLogicCore';
import { useState } from 'react';

/**
 * Luminous Technical Atelier: Power Electronics-style white segmented controls;
 * active segment carries the brand gradient while the workspace remains mounted.
 */
type DigitalLogicTool = 'schematic' | 'analyzer' | 'kmap' | 'synthesis' | 'timing' | 'state-machine';

const DIGITAL_LOGIC_TOOLS: ReadonlyArray<{ id: DigitalLogicTool; label: string }> = [
  { id: 'schematic', label: 'Schematic Workspace' },
  { id: 'analyzer', label: 'Logic Analyzer' },
  { id: 'kmap', label: 'K-Map Minimizer' },
  { id: 'synthesis', label: 'Universal Synthesis' },
  { id: 'timing', label: 'Timing Waveforms' },
  { id: 'state-machine', label: 'State Machine Explorer' },
];
const createDigitalLogicEngine = () => new DiscreteEventLogicEngine();
const initialDigitalLogicTool = (): DigitalLogicTool => {
  if (typeof window === 'undefined') return 'schematic';
  const requested = new URLSearchParams(window.location.search).get('tool');
  return DIGITAL_LOGIC_TOOLS.some(tool => tool.id === requested) ? requested as DigitalLogicTool : 'schematic';
};

/** Digital Logic Design owns a separate cloned workspace, state tree, and solver instance. */
export function DigitalLogicSimulatorApp() {
  const [activeTool, setActiveTool] = useState<DigitalLogicTool>(initialDigitalLogicTool);
  const activeLabel = DIGITAL_LOGIC_TOOLS.find(tool => tool.id === activeTool)?.label ?? 'Digital Logic Lab';
  return <div className="v3-simulator-root simulator-theme-b" data-simulator-theme="b">
    <section aria-label="Digital Logic Lab tools" style={{ overflow: 'hidden', marginBottom: 24, border: '1px solid #e5e7eb', borderRadius: 14, background: '#ffffff', boxShadow: '0 2px 4px rgba(15, 23, 42, .06)' }}>
      <div role="tablist" aria-label="Digital Logic Lab tools" style={{ display: 'flex', minWidth: 760, background: '#ffffff' }}>
        {DIGITAL_LOGIC_TOOLS.map(tool => {
          const active = tool.id === activeTool;
          return <button key={tool.id} id={`digital-logic-tab-${tool.id}`} role="tab" aria-selected={active} aria-controls={`digital-logic-panel-${tool.id}`} onClick={() => setActiveTool(tool.id)} style={{ flex: '1 1 0', minHeight: 72, border: 'none', borderLeft: tool.id === 'schematic' ? 'none' : '1px solid #e5e7eb', color: active ? '#ffffff' : '#475569', background: active ? 'linear-gradient(100deg, #2563eb 0%, #8b5cf6 52%, #f43f5e 100%)' : '#ffffff', boxShadow: active ? '0 6px 16px rgba(37, 99, 235, .16)' : 'none', fontSize: 14, fontWeight: active ? 800 : 650, whiteSpace: 'nowrap', cursor: 'pointer', transition: 'background 160ms cubic-bezier(.23, 1, .32, 1), color 160ms cubic-bezier(.23, 1, .32, 1)' }}>{tool.label}</button>;
        })}
      </div>
    </section>

    <div id="digital-logic-panel-schematic" role="tabpanel" aria-labelledby="digital-logic-tab-schematic" style={{ display: activeTool === 'schematic' ? 'block' : 'none' }}>
      <DigitalLogicSimulatorHome createSimulationEngine={createDigitalLogicEngine} tabDUiRefinement digitalLogicOnly />
    </div>
    {activeTool === 'analyzer' && <section id="digital-logic-panel-analyzer" role="tabpanel" aria-labelledby="digital-logic-tab-analyzer"><LogicAnalyzer /></section>}
    {activeTool === 'kmap' && <section id="digital-logic-panel-kmap" role="tabpanel" aria-labelledby="digital-logic-tab-kmap"><KMapMinimizer /></section>}
    {activeTool === 'synthesis' && <section id="digital-logic-panel-synthesis" role="tabpanel" aria-labelledby="digital-logic-tab-synthesis"><UniversalSynthesis /></section>}
    {activeTool === 'timing' && <section id="digital-logic-panel-timing" role="tabpanel" aria-labelledby="digital-logic-tab-timing"><TimingWaveforms /></section>}
    {activeTool === 'state-machine' && <section id="digital-logic-panel-state-machine" role="tabpanel" aria-labelledby="digital-logic-tab-state-machine"><StateMachineExplorer /></section>}
  </div>;
}
