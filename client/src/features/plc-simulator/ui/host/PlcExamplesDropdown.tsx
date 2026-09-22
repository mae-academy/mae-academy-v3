import { BookOpen, ChevronDown } from 'lucide-react';
import { PLC_EXAMPLES, type PlcExample } from './plcExamples';

export interface PlcExamplesDropdownProps {
  currentExampleId?: string | null;
  onSelectExample: (example: PlcExample) => void;
}

export function PlcExamplesDropdown({ currentExampleId, onSelectExample }: PlcExamplesDropdownProps) {
  const activeLabel = PLC_EXAMPLES.find((ex) => ex.id === currentExampleId)?.title ?? 'Custom program';

  return (
    <div
      className="relative inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-slate-200/80 bg-slate-200/60 px-3 text-xs font-medium text-slate-700 transition hover:bg-slate-300/50 dark:border-[#1a1d24] dark:bg-[#13161c] dark:text-slate-300 dark:hover:bg-[#1a1d24]"
      title={`Active: ${activeLabel} (Click to switch example)`}
    >
      <BookOpen className="pointer-events-none h-3.5 w-3.5 shrink-0 text-violet-600 dark:text-violet-400" />
      <span className="pointer-events-none text-xs font-semibold text-slate-800 dark:text-slate-200">Examples</span>
      <ChevronDown className="pointer-events-none h-3 w-3 text-slate-400" />
      <select
        aria-label="Examples library"
        value={currentExampleId ?? ''}
        onChange={(event) => {
          const selected = PLC_EXAMPLES.find((ex) => ex.id === event.target.value);
          if (selected) onSelectExample(selected);
        }}
        className="absolute inset-0 h-full w-full cursor-pointer text-xs opacity-0"
      >
        {(!currentExampleId || !PLC_EXAMPLES.some((ex) => ex.id === currentExampleId)) && (
          <option value="">Custom program</option>
        )}
        {PLC_EXAMPLES.map((ex) => (
          <option key={ex.id} value={ex.id} className="bg-white font-sans text-slate-800 dark:bg-[#13161c] dark:text-slate-200">
            {ex.title}
          </option>
        ))}
      </select>
    </div>
  );
}
