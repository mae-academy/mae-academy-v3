import React, { useState } from 'react';
import { LogicAnalyzer } from '@/simulators/digital-logic/components/pages/LogicAnalyzer';
import { TimingWaveforms } from '@/simulators/digital-logic/components/pages/TimingWaveforms';
import { KMapMinimizer } from '@/simulators/digital-logic/components/pages/KMapMinimizer';
import { UniversalSynthesis } from '@/simulators/digital-logic/components/pages/UniversalSynthesis';
import { StateMachineExplorer } from '@/simulators/digital-logic/components/pages/StateMachineExplorer';
import type { CircuitComponent, CircuitWire, SimulationSnapshot } from '@/simulators/digital-logic/models/circuitTypes';

type DigitalLogicAnalysisMethod = 'truth-table' | 'timing' | 'kmap' | 'synthesis' | 'fsm';

interface MethodItem {
  id: DigitalLogicAnalysisMethod;
  label: string;
  heading: string;
}

const METHODS: MethodItem[] = [
  { id: 'truth-table', label: 'Truth Table & Expressions', heading: 'Truth Table & Boolean Algebra' },
  { id: 'timing', label: 'Timing Waveforms', heading: 'Timing Waveform Analyzer' },
  { id: 'kmap', label: 'K-Map Minimizer', heading: 'Karnaugh Map Minimizer' },
  { id: 'synthesis', label: 'Universal Synthesis', heading: 'Universal NAND/NOR Synthesis' },
  { id: 'fsm', label: 'State Machine', heading: 'Finite State Machine Explorer' },
];

export interface DigitalLogicAnalysisBoxProps {
  colors: {
    panel: string;
    panelAlt: string;
    line: string;
    text: string;
    muted: string;
    primary: string;
    danger: string;
  };
  standalone?: boolean;
  components?: CircuitComponent[];
  wires?: CircuitWire[];
  snapshot?: SimulationSnapshot;
}

export function DigitalLogicAnalysisBox({
  colors,
  standalone = false,
}: DigitalLogicAnalysisBoxProps) {
  const [method, setMethod] = useState<DigitalLogicAnalysisMethod>('truth-table');
  const activeMethod = METHODS.find((m) => m.id === method) ?? METHODS[0];

  return (
    <section
      className="rounded-xl border border-slate-200/80 bg-slate-50/70 dark:border-slate-700/60 dark:bg-slate-800/40"
      style={{
        padding: standalone ? '18px 20px 22px' : '12px 15px',
        borderTop: standalone ? 'none' : `1px solid ${colors.line}`,
      }}
    >
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 10,
          marginBottom: 12,
        }}
      >
        <div>
          <div className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-white">
            {activeMethod.heading}
          </div>
          <div style={{ marginTop: 3, color: colors.muted, fontSize: 10 }}>
            Solver-backed logic derivation and interactive analysis
          </div>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {METHODS.map((item) => {
          const sel = method === item.id;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={sel}
              onClick={() => setMethod(item.id)}
              className={`inline-flex min-h-[36px] items-center justify-center rounded-lg px-4 py-2 text-xs font-medium transition-colors ${
                sel
                  ? 'bg-brand-gradient text-white shadow-sm'
                  : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      <div className="w-full">
        {method === 'truth-table' && (
          <div className="overflow-hidden rounded-lg">
            <LogicAnalyzer />
          </div>
        )}
        {method === 'timing' && (
          <div className="overflow-hidden rounded-lg">
            <TimingWaveforms />
          </div>
        )}
        {method === 'kmap' && (
          <div className="overflow-hidden rounded-lg">
            <KMapMinimizer />
          </div>
        )}
        {method === 'synthesis' && (
          <div className="overflow-hidden rounded-lg">
            <UniversalSynthesis />
          </div>
        )}
        {method === 'fsm' && (
          <div className="overflow-hidden rounded-lg">
            <StateMachineExplorer />
          </div>
        )}
      </div>
    </section>
  );
}
