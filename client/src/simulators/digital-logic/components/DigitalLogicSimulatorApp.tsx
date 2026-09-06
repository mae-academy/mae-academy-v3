import { DigitalLogicSimulatorHome } from './pages/Home';
import { LogicAnalyzer } from '@/simulators/digital-logic/components/pages/LogicAnalyzer';
import { KMapMinimizer } from '@/simulators/digital-logic/components/pages/KMapMinimizer';
import { UniversalSynthesis } from '@/simulators/digital-logic/components/pages/UniversalSynthesis';
import { TimingWaveforms } from '@/simulators/digital-logic/components/pages/TimingWaveforms';
import { StateMachineExplorer } from '@/simulators/digital-logic/components/pages/StateMachineExplorer';
import { DiscreteEventLogicEngine } from '@/simulators/digital-logic/engine/desLogicCore';
import { useState } from 'react';
import SimulationPageHeader from '@/components/SimulationPageHeader';

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
        <div className="mx-auto flex w-full min-w-max max-w-5xl items-center overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
          {DIGITAL_LOGIC_TOOLS.map((tool) => {
            const active = tool.id === activeTool;
            return (
              <button
                key={tool.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setActiveTool(tool.id as DigitalLogicTool)}
                style={active ? { background: 'linear-gradient(90deg, #2563eb 0%, #7c3aed 50%, #f43f5e 100%)' } : undefined}
                className={`flex-1 border-r border-slate-200 py-3 px-6 text-center text-sm last:border-r-0 transition-colors dark:border-slate-700 ${
                  active
                    ? "text-white font-semibold"
                    : "bg-white hover:bg-slate-50 text-slate-600 hover:text-slate-900 font-medium dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white"
                }`}
              >
                {tool.label}
              </button>
            );
          })}
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
