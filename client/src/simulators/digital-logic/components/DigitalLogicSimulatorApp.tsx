import { DigitalLogicSimulatorHome } from './pages/Home';
import { LogicAnalyzer } from '@/simulators/digital-logic/components/pages/LogicAnalyzer';
import { KMapMinimizer } from '@/simulators/digital-logic/components/pages/KMapMinimizer';
import { UniversalSynthesis } from '@/simulators/digital-logic/components/pages/UniversalSynthesis';
import { TimingWaveforms } from '@/simulators/digital-logic/components/pages/TimingWaveforms';
import { StateMachineExplorer } from '@/simulators/digital-logic/components/pages/StateMachineExplorer';
import { RemoteDesEngine } from '@/simulators/digital-logic/remote/remoteDesEngine';
import { useEffect, useState } from 'react';
import { useSimulatorSeo } from '@/seo/useSimulatorSeo';
import { useTranslation } from 'react-i18next';
import { useLocale } from '@/contexts/LocaleContext';
import SimulationPageHeader from '@/components/SimulationPageHeader';
import { SegmentedControl } from '@/components/common/templates';

/**
 * Luminous Technical Atelier: Power Electronics-style white segmented controls;
 * active segment carries the brand gradient while the workspace remains mounted.
 */
type DigitalLogicTool = 'schematic' | 'analyzer' | 'kmap' | 'synthesis' | 'timing' | 'state-machine';

const createDigitalLogicEngine = () => new RemoteDesEngine();
const initialDigitalLogicTool = (tools: ReadonlyArray<{ id: DigitalLogicTool; label: string }>): DigitalLogicTool => {
  if (typeof window === 'undefined') return 'schematic';
  const requested = new URLSearchParams(window.location.search).get('tool');
  return tools.some(tool => tool.id === requested) ? requested as DigitalLogicTool : 'schematic';
};

/** Digital Logic Design owns a separate cloned workspace, state tree, and solver instance. */
export function DigitalLogicSimulatorApp() {
  const { t } = useTranslation('simulators');
  const { copy } = useLocale();
  const DIGITAL_LOGIC_TOOLS: ReadonlyArray<{ id: DigitalLogicTool; label: string }> = [
    { id: 'schematic', label: t('digital.schematicWorkspace', 'Schematic Workspace') },
    { id: 'analyzer', label: t('digital.logicAnalyzer', 'Logic Analyzer') },
    { id: 'kmap', label: t('digital.kmapMinimizer', 'K-Map Minimizer') },
    { id: 'synthesis', label: t('digital.universalSynthesis', 'Universal Synthesis') },
    { id: 'timing', label: t('digital.timingWaveforms', 'Timing Waveforms') },
    { id: 'state-machine', label: t('digital.stateMachineExplorer', 'State Machine Explorer') },
  ];
  const shellTitle = copy.collections.simulations.cards.find((card) => card.code === "S.07")?.title ?? "Digital Logic Design";
  const [activeTool, setActiveTool] = useState<DigitalLogicTool>(() => initialDigitalLogicTool(DIGITAL_LOGIC_TOOLS));
  // Each mode gets its own title/meta/docs; the active mode is mirrored into ?tool= so it is linkable and canonical.
  useSimulatorSeo(`dl-${activeTool === 'state-machine' ? 'fsm' : activeTool}`);
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get('tool') === activeTool) return;
    url.searchParams.set('tool', activeTool);
    window.history.replaceState(window.history.state, '', url);
  }, [activeTool]);
  const activeLabel =DIGITAL_LOGIC_TOOLS.find(tool => tool.id === activeTool)?.label ?? t('digital.labTitle', 'Digital Logic Lab');
  return <div className="v3-simulator-root simulator-theme-b" data-simulator-theme="b">
    <SimulationPageHeader
      title={shellTitle}
      tools={DIGITAL_LOGIC_TOOLS}
      activeTool={activeTool}
      onSelectTool={(id) => setActiveTool(id as DigitalLogicTool)}
      showBack={false}
      showTitle={true}
      showToolNavigation={false}
    />

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
