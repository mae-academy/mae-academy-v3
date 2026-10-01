/**
 * Luminous Technical Atelier — Logic Analyzer and Truth Table Explorer.
 * Responsive dark/light theme adherence and KaTeX formula rendering.
 */
import { useEffect, useMemo, useState } from 'react';
import { KatexMath } from '@/components/ui/KatexMath';
import { StatusBadge } from '@/components/common/templates';
import type { ParsedLogicExpression, TruthTableRow } from '@shared/logic/logicEngine';
import {
  generateTruthTable,
  parseBooleanExpression,
  MAX_LOGIC_ANALYZER_VARIABLES,
} from '@shared/logic/logicEngine';

const INITIAL_EXPRESSION = 'A*B+C';
const parseInitial = () => parseBooleanExpression(INITIAL_EXPRESSION);

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

export interface LogicAnalyzerProps {
  expression?: string;
  onExpressionChange?: (expression: string) => void;
}

/** Pure responsive truth-table view driven by the universal formula bar. */
export function LogicAnalyzer({ expression, onExpressionChange }: LogicAnalyzerProps) {
  const [source, setSource] = useState(expression ?? INITIAL_EXPRESSION);
  const [lastValid, setLastValid] = useState<ParsedLogicExpression>(() => {
    try {
      return parseBooleanExpression(expression ?? INITIAL_EXPRESSION);
    } catch {
      return parseInitial();
    }
  });
  const [overrides, setOverrides] = useState<Record<number, boolean>>({});
  const debouncedSource = useDebouncedValue(source, 300);

  useEffect(() => {
    if (expression !== undefined && expression !== source) {
      setSource(expression);
    }
  }, [expression]);

  useEffect(() => {
    try {
      const parsed = parseBooleanExpression(debouncedSource);
      setLastValid(parsed);
      setOverrides({});
    } catch {
      // Retain lastValid expression when syntax is in-progress
    }
  }, [debouncedSource]);

  const hasExceededVariables = lastValid.variables.length > MAX_LOGIC_ANALYZER_VARIABLES;
  const activeVariables = useMemo(() => {
    return hasExceededVariables
      ? lastValid.variables.slice(0, MAX_LOGIC_ANALYZER_VARIABLES)
      : lastValid.variables;
  }, [hasExceededVariables, lastValid.variables]);

  const rows = useMemo(() => {
    try {
      return generateTruthTable(lastValid.ast, activeVariables).map((row) => ({
        ...row,
        value: overrides[row.index] ?? row.value,
      }));
    } catch {
      return [];
    }
  }, [lastValid.ast, activeVariables, overrides]);

  const toggleOutput = (row: TruthTableRow) => {
    const nextRows = rows.map((current) =>
      current.index === row.index ? { ...current, value: !current.value } : current,
    );
    // Canonical SOP in formula-bar ASCII (A'B'C + …), never LaTeX.
    const onRows = nextRows.filter((current) => current.value);
    const sop = onRows.length
      ? onRows.map((current) => activeVariables.map((variable) => (current.context[variable] ? variable : `${variable}'`)).join('')).join(' + ')
      : '0';
    try {
      const parsed = parseBooleanExpression(sop);
      setSource(sop);
      onExpressionChange?.(sop);
      setLastValid(parsed);
      setOverrides({});
    } catch {
      // Ignore reconstruction error
    }
  };

  return (
    <section
      aria-label="Logic Analyzer"
      className="overflow-hidden rounded-xl border border-slate-200/80 bg-white/95 text-slate-900 shadow-sm dark:border-slate-800 dark:bg-slate-900/90 dark:text-white"
    >
      <div className="p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Interactive Truth Table ({rows.length} rows)
          </div>
          {hasExceededVariables && (
            <StatusBadge variant="danger">
              Maximum 8 input variables (A–H) supported — table bounded to {activeVariables.join(', ')}
            </StatusBadge>
          )}
        </div>

        {/* Left-aligned compact table eliminating horizontal dead margins */}
        <div className="flex justify-start">
          <div className="max-h-[440px] overflow-auto rounded-xl border border-slate-200 dark:border-slate-800">
            <table className="border-separate border-spacing-0 text-xs">
              <thead>
                <tr className="text-slate-700 dark:text-slate-300">
                  <th
                    scope="col"
                    className="sticky top-0 z-10 w-16 border-b border-r border-slate-200 bg-slate-50 p-2 text-center text-xs font-normal text-slate-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400"
                    title="Decimal Row Index"
                  >
                    <KatexMath math="\text{Dec}" />
                  </th>
                  {activeVariables.map((variable) => (
                    <th
                      key={variable}
                      scope="col"
                      className="sticky top-0 z-10 w-16 border-b border-slate-200 bg-slate-50 p-2 text-center text-sm font-normal dark:border-slate-800 dark:bg-slate-950"
                    >
                      <KatexMath math={variable} />
                    </th>
                  ))}
                  <th
                    scope="col"
                    className="sticky top-0 z-10 w-24 border-b border-l border-slate-200 bg-slate-50 p-2 text-center text-sm font-normal text-blue-600 dark:border-slate-800 dark:bg-slate-950 dark:text-blue-400"
                  >
                    <KatexMath math="F" />
                    <span className="sr-only">click to edit</span>
                  </th>
                </tr>
              </thead>
              <tbody className="[&>tr>td]:border-b [&>tr>td]:border-slate-100 dark:[&>tr>td]:border-slate-800/60">
                {rows.map((row) => (
                  <tr
                    key={row.index}
                    className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition-colors"
                  >
                    <td
                      data-minterm-index={row.index}
                      className="border-r border-slate-100 p-2 text-center text-xs tabular-nums text-slate-400 dark:border-slate-800/60 dark:text-slate-500"
                    >
                      <KatexMath math={String(row.index)} />
                    </td>
                    {activeVariables.map((variable) => (
                      <td key={variable} className="p-2 text-center text-xs text-slate-700 dark:text-slate-300">
                        <KatexMath math={row.context[variable] ? '1' : '0'} />
                      </td>
                    ))}
                    <td className="border-l border-slate-100 p-1.5 text-center dark:border-slate-800/60">
                      <button
                        type="button"
                        onClick={() => toggleOutput(row)}
                        aria-label={`Toggle output for minterm ${row.index}`}
                        className={`inline-flex items-center justify-center rounded-full px-2.5 py-0.5 text-xs font-mono font-bold tabular-nums transition-all duration-200 cursor-pointer ${
                          row.value
                            ? 'bg-blue-600 text-white shadow-xs hover:bg-blue-500 active:scale-95'
                            : 'bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 active:scale-95'
                        }`}
                      >
                        {row.value ? '1' : '0'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
