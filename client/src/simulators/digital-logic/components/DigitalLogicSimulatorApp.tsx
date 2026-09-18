import { DigitalLogicSimulatorHome } from './pages/Home';
import { LogicAnalyzer } from '@/simulators/digital-logic/components/pages/LogicAnalyzer';
import { KMapMinimizer } from '@/simulators/digital-logic/components/pages/KMapMinimizer';
import { UniversalSynthesis } from '@/simulators/digital-logic/components/pages/UniversalSynthesis';
import { TimingWaveforms } from '@/simulators/digital-logic/components/pages/TimingWaveforms';
import { StateMachineExplorer } from '@/simulators/digital-logic/components/pages/StateMachineExplorer';
import { DiscreteEventLogicEngine } from '@/simulators/digital-logic/engine/desLogicCore';
import { useState } from 'react';
import SimulationPageHeader from '@/components/SimulationPageHeader';
import SegmentedControl from '@/components/ui/SegmentedControl';

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
    <div className="mb-8">
      <h1 className="mae-display text-center font-extrabold tracking-tight text-slate-900 dark:text-white mt-6 mb-12 text-5xl md:text-6xl">
        Digital Logic Design
      </h1>
      <div className="flex justify-center overflow-x-auto pb-1">
        <div className="mx-auto w-full min-w-max max-w-5xl">
          <SegmentedControl
            options={DIGITAL_LOGIC_TOOLS.map(tool => ({ label: tool.label, value: tool.id }))}
            value={activeTool}
            onChange={setActiveTool}
            size="lg"
            fullWidth
            aria-label="Digital Logic workspace section"
          />
        </div>
      </div>
    </div>

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
