/**
 * Luminous Technical Atelier — Universal NAND/NOR Synthesis page.
 * Responsive dark/light theme adherence, De Morgan derivations, and direct canvas loading.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { LayoutGrid } from 'lucide-react';
import { KatexMath } from '@/components/ui/KatexMath';
import { SegmentedControl, StudioButton, type SegmentedOption } from '@/components/common/templates';
import type { CircuitComponent, CircuitWire } from '@shared/logic/circuitTypes';
import type { CircuitPlacementMode } from '@/simulators/digital-logic/models/circuitExpressionExtractor';
import type { SynthesisMode } from '@shared/logic/synthesisTypes';
import { synthesisDiagramToCircuit } from '@/simulators/digital-logic/models/circuitExpressionExtractor';
import { deriveSynthesisRemote } from '@/services/logicClient';
import { useRemoteQuery as useLogicQuery } from '@/lib/useRemoteQuery';
import {
  astToOverlineLatex,
  generateTruthTable,
  MAX_LOGIC_ANALYZER_VARIABLES,
  parseBooleanExpression,
} from '@shared/logic/logicEngine';

const EXAMPLES: Record<SynthesisMode, string> = {
  NAND: 'A*B + C*D',
  NOR: '(A+B)*(C+D)',
};

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs, value]);
  return debounced;
}

export interface UniversalSynthesisProps {
  expression?: string;
  onExpressionChange?: (expression: string) => void;
  /** Injects the synthesized universal-gate schematic into the live canvas. */
  onLoadCircuit?: (components: CircuitComponent[], wires: CircuitWire[], mode: CircuitPlacementMode) => void;
}

const ARCHITECTURE_OPTIONS: ReadonlyArray<SegmentedOption<SynthesisMode>> = [
  { value: 'NAND', label: 'All-NAND Synthesis', 'aria-label': 'Convert to All-NAND' },
  { value: 'NOR', label: 'All-NOR Synthesis', 'aria-label': 'Convert to All-NOR' },
];

/** Pedagogical Universal Synthesis page over the derivation engine. */
export function UniversalSynthesis({ expression: controlledExpr, onExpressionChange, onLoadCircuit }: UniversalSynthesisProps) {
  const [mode, setMode] = useState<SynthesisMode>('NAND');
  const [expression, setExpression] = useState(controlledExpr ?? EXAMPLES.NAND);
  const debouncedExpression = useDebouncedValue(expression, 300);

  useEffect(() => {
    if (controlledExpr !== undefined && controlledExpr !== expression) {
      setExpression(controlledExpr);
    }
  }, [controlledExpr, expression]);

  // The derivation runs on the serverless engine; the last good answer stays on screen while a newer one loads or fails.
  const query = useLogicQuery(`${mode}|${debouncedExpression}`, signal => deriveSynthesisRemote(debouncedExpression, mode, signal));
  const error = query.error;
  const lastValid = query.data;

  const chooseMode = (nextMode: SynthesisMode) => {
    if (nextMode === mode) return;
    setMode(nextMode);
    if (expression === EXAMPLES[mode]) {
      setExpression(EXAMPLES[nextMode]);
      onExpressionChange?.(EXAMPLES[nextMode]);
    }
  };

  const loadToCanvas = (placement: CircuitPlacementMode = 'replace') => {
    if (error || !lastValid) {
      toast.error('Fix the synthesis source before loading it onto the canvas.');
      return;
    }
    try {
      const circuit = synthesisDiagramToCircuit(lastValid.diagram);
      if (!onLoadCircuit) {
        toast.info('Open the schematic workspace to load this circuit.');
        return;
      }
      onLoadCircuit(circuit.components, circuit.wires, placement);
      toast.success(`${placement === 'replace' ? 'Loaded' : 'Appended'} all-${lastValid.mode} circuit on the canvas`);
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : 'Unable to build the synthesized circuit.');
    }
  };

  const handleExpressionChange = (val: string) => {
    setExpression(val);
    onExpressionChange?.(val);
  };

  const canonicalAlternative = useMemo(() => {
    if (!error) return null;
    try {
      const parsed = parseBooleanExpression(expression);
      if (parsed.variables.length > 0 && parsed.variables.length <= MAX_LOGIC_ANALYZER_VARIABLES) {
        const rows = generateTruthTable(parsed.ast, parsed.variables);
        const literal = (variable: string, complemented: boolean) => (complemented ? `${variable}'` : variable);
        const canonical = mode === 'NAND'
          ? rows.filter((row) => row.value).map((row) => parsed.variables.map((v) => literal(v, !row.context[v])).join('')).join(' + ')
          : rows.filter((row) => !row.value).map((row) => `(${parsed.variables.map((v) => literal(v, row.context[v])).join(' + ')})`).join('');
        if (canonical && canonical !== expression) {
          return {
            label: mode === 'NAND' ? 'Convert to Canonical SOP' : 'Convert to Canonical POS',
            expr: canonical,
            latex: astToOverlineLatex(parseBooleanExpression(canonical).ast),
          };
        }
      }
    } catch {
      return null;
    }
    return null;
  }, [error, expression, mode]);

  return (
    <section
      aria-label="Universal Synthesis"
      className="overflow-hidden rounded-xl border border-slate-200/80 bg-white/95 text-slate-900 shadow-sm dark:border-slate-800 dark:bg-slate-900/90 dark:text-white"
    >
      <div className="p-5">
        {/* Architecture Conversion Buttons Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 pb-4 dark:border-slate-800/80">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mr-1">
              Target Universal Architecture
            </span>
            <SegmentedControl<SynthesisMode>
              options={ARCHITECTURE_OPTIONS}
              value={mode}
              onChange={chooseMode}
              size="sm"
              aria-label="Target Universal Architecture"
            />
          </div>
          <StudioButton
            onClick={() => loadToCanvas('replace')}
            disabled={Boolean(error)}
            title="Place the synthesized universal-gate schematic on the canvas for live simulation"
            className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold"
          >
            <LayoutGrid className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
            <span>Load Circuit to Canvas</span>
          </StudioButton>
        </div>
        <p id="synthesis-hint" className="mt-3 text-xs text-slate-500 dark:text-slate-400">
          All-NAND accepts Sum of Products (SOP); All-NOR accepts Product of Sums (POS).
        </p>

        {error && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <p
              id="synthesis-error"
              role="alert"
              className="text-xs font-bold text-rose-600 dark:text-rose-400"
            >
              Invalid Synthesis Source — {error}
            </p>
            {canonicalAlternative && (
              <button
                type="button"
                onClick={() => handleExpressionChange(canonicalAlternative.expr)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-violet-300 bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-800 transition-colors hover:bg-violet-100 dark:border-violet-700/50 dark:bg-violet-950/40 dark:text-violet-200 dark:hover:bg-violet-950/70 cursor-pointer"
              >
                <span>{canonicalAlternative.label}:</span>
                <KatexMath math={canonicalAlternative.latex} />
              </button>
            )}
          </div>
        )}

        {/* Direct De Morgan Derivation Steps */}
        <div className="mt-5">
          <div className="mb-4 flex items-center gap-2">
            <div className="h-0.5 w-8 bg-gradient-to-r from-blue-500 via-purple-500 to-rose-500" />
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
              Pedagogical Derivation
            </div>
          </div>
          <ol className="grid gap-3 list-none p-0 m-0">
            {(lastValid?.steps ?? []).map((step, index) => (
              <li key={step.title} className="grid grid-cols-[28px_minmax(0,1fr)] gap-3">
                <div className="flex flex-col items-center">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-blue-200 bg-blue-50 text-[10px] font-bold text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300">
                    {index + 1}
                  </span>
                  {index < (lastValid?.steps.length ?? 0) - 1 && (
                    <span className="w-px flex-1 bg-slate-200 dark:bg-slate-800 my-1" />
                  )}
                </div>
                <article className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-3 dark:border-slate-800 dark:bg-slate-950/40">
                  <div className="flex items-center justify-between">
                    <h3 className="m-0 text-xs font-bold text-slate-900 dark:text-white">{step.title}</h3>
                  </div>
                  <div className="mt-2 overflow-x-auto rounded-lg border-l-2 border-blue-500 bg-white/80 py-1.5 pl-3 pr-2 text-sm text-slate-900 shadow-2xs dark:bg-slate-900/60 dark:text-white">
                    <KatexMath math={step.latexEquation} displayMode />
                  </div>
                </article>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
