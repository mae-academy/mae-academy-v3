import React, { useState } from 'react';
import type { EngineSnapshot } from '@shared/fluid/engine/types';
import type { Palette } from '@/simulators/shared/workspace/workspaceTheme';
import type { FluidMedium } from '../../models/fluidCatalog';
import { useFluidT } from '../../i18n/fluidText';
import { CutawayViewer } from '../dissection/CutawayViewer';
import { cutawayKindOf, type CutawayComponent } from '../dissection/cutawayPhysics';
import type { CutawayControl } from '../dissection/cutawayControls';
import { FunctionDiagram, type FunctionDiagramProps } from './FunctionDiagram';
import { emptyTracker } from '../../models/functionDiagram';

export type AnalysisTab = 'cutaway' | 'control' | 'function';

export interface FluidAnalysisPanelProps {
  colors: Palette;
  isDark: boolean;
  medium: FluidMedium;
  snapshot: EngineSnapshot;
  /** The component selected on the canvas, if any. */
  selected: CutawayComponent | undefined;
  /** Content of the "Control circuit" tab (ladder / electrical); a scaffold is shown until a circuit editor is supplied. */
  controlCircuit?: React.ReactNode;
  initialTab?: AnalysisTab;
  /** Sliders under the cutaway of the selected part. */
  cutawayControls?: CutawayControl[];
  /** Recorded telemetry for the displacement-step diagram; the tab shows an empty grid without it. */
  functionDiagram?: Pick<FunctionDiagramProps, 'cylinders' | 'tracker' | 'active' | 'startTag'>;
}

/**
 * Bottom dashboard of the studio: the input control board and "The Dissection Lab". The cutaway shows
 * whichever inspectable component the owner passes as `selected`.
 */
export function FluidAnalysisPanel({ colors, isDark, medium, snapshot, selected, controlCircuit, initialTab = 'cutaway', cutawayControls, functionDiagram }: FluidAnalysisPanelProps) {
  const tr = useFluidT();
  const [tab, setTab] = useState<AnalysisTab>(initialTab);
  const inspectable = selected && cutawayKindOf(selected) ? selected : undefined;

  const tabButton = (id: AnalysisTab, label: string) => {
    const active = tab === id;
    return (
      <button
        key={id}
        type="button"
        role="tab"
        id={`fluid-analysis-tab-${id}`}
        aria-selected={active}
        aria-controls={`fluid-analysis-panel-${id}`}
        data-testid={`analysis-tab-${id}`}
        onClick={() => setTab(id)}
        className={`relative inline-flex h-7.5 cursor-pointer select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] transition-colors duration-200 sm:px-3.5 sm:text-xs ${active ? 'btn-active-brand brand-active-pill font-semibold' : 'font-medium text-slate-600 hover:bg-slate-200/40 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/40 dark:hover:text-white'}`}
      >
        {label}
      </button>
    );
  };

  return (
    <div data-testid="fluid-analysis-panel">
      <div className="px-4 pt-4">
        <div role="tablist" aria-label={tr('analysis.tablist')} className="no-scrollbar inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-full border border-slate-200/80 bg-slate-100/90 p-1 shadow-inner backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/90">
          {tabButton('cutaway', tr('analysis.cutawayTab'))}
          {tabButton('control', tr('analysis.controlTab'))}
          {tabButton('function', tr('analysis.functionTab'))}
        </div>
      </div>

      {tab === 'cutaway' && (
        <div role="tabpanel" id="fluid-analysis-panel-cutaway" aria-labelledby="fluid-analysis-tab-cutaway" style={{ padding: 16 }}>
          {inspectable ? (
            <CutawayViewer component={inspectable} snapshot={snapshot} medium={medium} colors={colors} isDark={isDark} controls={cutawayControls} />
          ) : (
            <div
              data-testid="cutaway-empty"
              style={{ border: `1px dashed ${colors.line}`, borderRadius: 12, padding: '28px 20px', textAlign: 'center', fontSize: 13, color: colors.muted, background: colors.panelAlt }}
            >
              {tr('analysis.empty')}
            </div>
          )}
        </div>
      )}

      {tab === 'control' && (
        <div role="tabpanel" id="fluid-analysis-panel-control" aria-labelledby="fluid-analysis-tab-control" style={{ padding: 16 }}>
          {controlCircuit ?? (
            <div data-testid="control-circuit-scaffold" style={{ border: `1px dashed ${colors.line}`, borderRadius: 12, padding: '28px 20px', textAlign: 'center', fontSize: 13, color: colors.muted, background: colors.panelAlt }}>
              {tr('analysis.controlEmpty')}
            </div>
          )}
        </div>
      )}

      {tab === 'function' && (
        <div role="tabpanel" id="fluid-analysis-panel-function" aria-labelledby="fluid-analysis-tab-function" style={{ padding: 16 }}>
          <FunctionDiagram colors={colors} cylinders={functionDiagram?.cylinders ?? []} tracker={functionDiagram?.tracker ?? emptyTracker()} active={functionDiagram?.active} startTag={functionDiagram?.startTag} />
        </div>
      )}
    </div>
  );
}
