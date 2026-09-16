import React from 'react';
import { V3Math } from '@/components/ui/V3Math';
import type { MNAElement } from '@/simulators/circuit-engine/engine/mnaSolver';
import { AcademicNodalDictionary } from '@/simulators/circuit-engine/models/AcademicNodalDictionary';

export interface TargetLoadSelectorProps {
  elements: MNAElement[];
  resistors: Extract<MNAElement, { type: 'resistor' }>[];
  targetResistor: string;
  onSelectTarget: (id: string) => void;
  colors?: { panelAlt?: string; line?: string; text?: string; muted?: string };
}

/**
 * Renders the Target Load / Branch selector with strict typography
 * and KaTeX formula presentation for the currently selected load.
 */
export function TargetLoadSelector({
  elements,
  resistors,
  targetResistor,
  onSelectTarget,
}: TargetLoadSelectorProps) {
  const dict = React.useMemo(() => new AcademicNodalDictionary(elements), [elements]);
  const activeResistor = resistors.find((r) => r.id === targetResistor) || resistors[0];

  // Mathematical LaTeX string formatted like R_{3} \cdot 1000 \Omega
  const targetMath = activeResistor
    ? `${dict.element(activeResistor)} \\cdot ${activeResistor.resistance}\\,\\Omega`
    : '\\text{Automatic (First)}';

  return (
    <div className="flex flex-col gap-1.5 mb-3 font-sans">
      <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        <span>TARGET LOAD / BRANCH</span>
        {activeResistor && (
          <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-700 shadow-sm dark:border-[#282d38] dark:bg-[#13161c] dark:text-slate-200">
            <span className="text-[10px] text-slate-400 font-sans">Active:</span>
            <span className="font-sans text-xs">
              <V3Math math={targetMath} />
            </span>
          </span>
        )}
      </div>

      <div className="relative">
        <div className="flex min-h-[38px] items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-sans text-slate-700 shadow-sm transition hover:border-slate-300 dark:border-[#282d38] dark:bg-[#13161c] dark:text-slate-200">
          <div className="flex items-center gap-2">
            <span className="text-slate-400 font-sans text-xs">Selected Load:</span>
            <span className="font-sans font-medium text-slate-800 dark:text-slate-100">
              <V3Math math={targetMath} />
            </span>
          </div>
          <svg className="h-4 w-4 text-slate-400 shrink-0 ml-2" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
          </svg>
        </div>

        {/* Underlying native accessible select element */}
        <select
          value={targetResistor}
          onChange={(e) => onSelectTarget(e.target.value)}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0 font-sans text-slate-700 dark:text-slate-200"
          aria-label="Target load branch"
        >
          <option value="">Automatic first resistor</option>
          {resistors.map((item) => {
            const cleanLabel = dict.element(item).replace(/[\\{}]/g, '').replace(/_/g, '');
            return (
              <option key={item.id} value={item.id}>
                {cleanLabel} ({item.resistance} Ω)
              </option>
            );
          })}
        </select>
      </div>
    </div>
  );
}

export interface DecimalPlacesSelectorProps {
  precision: number;
  onChangePrecision: (precision: number) => void;
}

/**
 * Dropdown for decimal places with global sans-serif styling
 * and KaTeX math wrapping for the selected value.
 */
export function DecimalPlacesSelector({
  precision,
  onChangePrecision,
}: DecimalPlacesSelectorProps) {
  return (
    <div className="relative inline-flex items-center font-sans">
      <div className="flex items-center gap-2 rounded-lg border border-slate-200/90 bg-white px-2.5 py-1 text-xs font-sans text-slate-700 shadow-sm transition hover:border-slate-300 dark:border-[#282d38] dark:bg-[#13161c] dark:text-slate-200">
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          DECIMAL PLACES
        </span>
        <span className="inline-flex items-center font-sans font-medium text-slate-800 dark:text-slate-100">
          <V3Math math={String(precision)} />
        </span>
        <svg className="h-3.5 w-3.5 text-slate-400 ml-0.5" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
      </div>

      <select
        value={precision}
        onChange={(event) => onChangePrecision(Number(event.target.value))}
        className="absolute inset-0 h-full w-full cursor-pointer opacity-0 font-sans text-slate-700 dark:text-slate-200"
        aria-label="Decimal places"
      >
        {[0, 1, 2, 3, 4, 5, 6].map((digits) => (
          <option key={digits} value={digits}>
            {digits} digits
          </option>
        ))}
      </select>
    </div>
  );
}
