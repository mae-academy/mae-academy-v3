/**
 * Luminous Technical Atelier — Karnaugh Map Minimizer.
 * Responsive dark/light theme adherence, QMC/Petrick solver, and KaTeX mathematical notation.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { KatexMath } from '@/components/ui/KatexMath';
import { SegmentedControl, type SegmentedOption, StatusBadge } from '@/components/common/templates';
import { createKMapTopology, layoutKMapGroups } from '@/simulators/digital-logic/components/kmapGeometry';
import { solveKMap, type KMapSolution, type KMapVariableCount } from '@/simulators/digital-logic/engine/kmapSolver';
import { evaluateAst, parseBooleanExpression, type ParsedLogicExpression } from '@/simulators/digital-logic/engine/logicEngine';

type KMapCellState = '0' | '1' | 'X';
type EditableCount = 2 | 3 | 4;

/** Variable names and cell values always change together, so the solver never sees a size mismatch. */
interface KMapState {
  variables: string[];
  cells: KMapCellState[];
}

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
const CELL_WIDTH = 68;
const CELL_HEIGHT = 56;
const HEADER_WIDTH = 34;
const HEADER_HEIGHT = 29;
const GROUP_COLORS = ['#2563eb', '#7c3aed', '#db2777', '#0891b2', '#ea580c'];

const clampCount = (count: number): EditableCount => (Math.max(2, Math.min(4, count)) as EditableCount);
/** The expression's own variables first, then unused letters to fill the requested map size. */
const variablesFor = (count: EditableCount, preferred: readonly string[]) =>
  [...preferred, ...LETTERS.filter(letter => !preferred.includes(letter))].slice(0, count);
const contextFromMinterm = (minterm: number, variables: readonly string[]) =>
  Object.fromEntries(variables.map((variable, index) => [variable, Boolean(minterm & (1 << (variables.length - index - 1)))]));

const exampleState = (count: EditableCount): KMapState => {
  const cells = Array<KMapCellState>(2 ** count).fill('0');
  const active = count === 2 ? [0, 1, 3] : count === 3 ? [0, 1, 2, 3] : [0, 1, 2, 3, 8, 9, 10, 11];
  active.forEach(index => { cells[index] = '1'; });
  return { variables: variablesFor(count, []), cells };
};

const stateFromExpression = (parsed: ParsedLogicExpression, count: EditableCount): KMapState => {
  const variables = variablesFor(count, parsed.variables);
  const cells = Array.from({ length: 2 ** count }, (_, minterm): KMapCellState => (evaluateAst(parsed.ast, contextFromMinterm(minterm, variables)) ? '1' : '0'));
  return { variables, cells };
};

const tryParse = (source: string | undefined): ParsedLogicExpression | null => {
  if (!source || !source.trim()) return null;
  try {
    return parseBooleanExpression(source);
  } catch {
    return null;
  }
};

const nextCellState = (state: KMapCellState): KMapCellState => (state === '0' ? '1' : state === '1' ? 'X' : '0');
const indicesWith = (cells: readonly KMapCellState[], state: KMapCellState) => cells.flatMap((value, index) => (value === state ? [index] : []));

const solveSafely = (map: KMapState): KMapSolution | null => {
  try {
    const maxMinterm = 2 ** map.variables.length;
    const minterms = indicesWith(map.cells, '1').filter(m => m >= 0 && m < maxMinterm);
    const dontCares = indicesWith(map.cells, 'X').filter(m => m >= 0 && m < maxMinterm);
    return solveKMap({ variables: map.variables, minterms, dontCares });
  } catch {
    return null;
  }
};

const VARIABLE_OPTIONS: ReadonlyArray<SegmentedOption<EditableCount>> = [
  { value: 2, label: <KatexMath math="2\text{-Var}" />, 'aria-label': 'Select 2-variable K-Map' },
  { value: 3, label: <KatexMath math="3\text{-Var}" />, 'aria-label': 'Select 3-variable K-Map' },
  { value: 4, label: <KatexMath math="4\text{-Var}" />, 'aria-label': 'Select 4-variable K-Map' },
];

export interface KMapMinimizerProps {
  expression?: string;
  onExpressionChange?: (expression: string) => void;
}

/** React adapter over the pure QMC/Petrick and overlay geometry modules. */
export function KMapMinimizer({ expression, onExpressionChange }: KMapMinimizerProps) {
  const [map, setMap] = useState<KMapState>(() => {
    const parsed = tryParse(expression);
    return parsed ? stateFromExpression(parsed, clampCount(parsed.variables.length)) : exampleState(4);
  });
  // Expressions this map emitted itself must not re-derive (and possibly shrink) the grid.
  const emittedRef = useRef<string | null>(null);
  const parsedExpression = useMemo(() => tryParse(expression), [expression]);
  const variableCount = map.variables.length as KMapVariableCount;
  const topology = useMemo(() => createKMapTopology(variableCount), [variableCount]);
  const metrics = useMemo(() => ({ cellWidth: CELL_WIDTH, cellHeight: CELL_HEIGHT, cornerRadius: 15 }), []);
  const exceedsMap = Boolean(parsedExpression && parsedExpression.variables.length > 4);

  useEffect(() => {
    if (expression === undefined || expression === emittedRef.current) return;
    const parsed = tryParse(expression);
    if (parsed) setMap(stateFromExpression(parsed, clampCount(parsed.variables.length)));
  }, [expression]);

  const solution = useMemo(() => solveSafely(map), [map]);
  const groups = useMemo(() => layoutKMapGroups(
    (solution?.selectedPrimeImplicants ?? []).map(implicant => ({ id: implicant.pattern, coveredMinterms: implicant.sourceTerms })),
    topology,
    metrics,
  ), [metrics, solution, topology]);

  const commitMap = (next: KMapState) => {
    setMap(next);
    const nextSolution = solveSafely(next);
    if (nextSolution && onExpressionChange) {
      emittedRef.current = nextSolution.expression;
      onExpressionChange(nextSolution.expression);
    }
  };

  const switchVariableCount = (count: EditableCount) => {
    const safeCount = clampCount(count);
    if (safeCount === variableCount) return;
    const parsed = parsedExpression;
    commitMap(parsed && parsed.variables.length <= safeCount ? stateFromExpression(parsed, safeCount) : exampleState(safeCount));
  };
  const toggleCell = (minterm: number) => {
    if (minterm < 0 || minterm >= map.cells.length) return;
    commitMap({ variables: map.variables, cells: map.cells.map((state, index) => (index === minterm ? nextCellState(state) : state)) });
  };
  const resetMap = () => commitMap({ ...exampleState(variableCount as EditableCount), variables: map.variables });
  const clearMap = () => commitMap({ variables: map.variables, cells: Array<KMapCellState>(map.cells.length).fill('0') });

  const cellStates = map.cells;
  const rowLabel = map.variables.slice(0, topology.rowBits).join('');
  const columnLabel = map.variables.slice(topology.rowBits, topology.rowBits + topology.columnBits).join('');

  return (
    <section
      aria-label="K-Map Minimizer"
      className="overflow-hidden rounded-xl border border-slate-200/80 bg-white/95 text-slate-900 shadow-sm dark:border-slate-800 dark:bg-slate-900/90 dark:text-white"
    >
      <div className="p-5">
        {/* Clean Controls Bar */}
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 pb-4 dark:border-slate-800/80">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mr-1">
              Variables:
            </span>
            <SegmentedControl<EditableCount>
              options={VARIABLE_OPTIONS}
              value={variableCount as EditableCount}
              onChange={switchVariableCount}
              size="sm"
              aria-label="Variable count"
            />
          </div>

          <div className="flex items-center gap-2">
            {exceedsMap && <StatusBadge variant="warning">K-Map limited to 4 variables</StatusBadge>}
            <span className="hidden sm:inline text-xs text-slate-400 dark:text-slate-500 mr-2">
              Click cell to cycle <KatexMath math={'0 \\to 1 \\to X \\to 0'} />
            </span>
            <button
              type="button"
              onClick={resetMap}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 transition-colors"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={clearMap}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 transition-colors"
            >
              Clear
            </button>
          </div>
        </div>

        {/* Gray-Code Coordinate Grid shifted upward */}
        <div className="overflow-x-auto rounded-xl border border-slate-200/70 p-5 dark:border-slate-800/70 flex flex-col items-center">
          <div className="inline-block" style={{ minWidth: HEADER_WIDTH + topology.columns * CELL_WIDTH }}>
            <div className="relative" style={{ paddingLeft: HEADER_WIDTH, paddingTop: HEADER_HEIGHT }}>
              {/* SVG Groups overlay */}
              <svg
                aria-hidden="true"
                viewBox={`0 0 ${topology.columns * CELL_WIDTH} ${topology.rows * CELL_HEIGHT}`}
                className="pointer-events-none absolute z-2 overflow-visible"
                style={{
                  left: HEADER_WIDTH,
                  top: HEADER_HEIGHT,
                  width: topology.columns * CELL_WIDTH,
                  height: topology.rows * CELL_HEIGHT,
                }}
              >
                {groups.map((group, groupIndex) => (
                  <g key={group.id}>
                    {group.rects.map((rect, rectIndex) => (
                      <path
                        key={`${group.id}-${rectIndex}`}
                        d={rect.path}
                        fill={GROUP_COLORS[groupIndex % GROUP_COLORS.length]}
                        fillOpacity={0.12}
                        stroke={GROUP_COLORS[groupIndex % GROUP_COLORS.length]}
                        strokeOpacity={0.9}
                        strokeWidth={2.4}
                      />
                    ))}
                    {group.bridges.map((bridge, bridgeIndex) => (
                      <line
                        key={`${group.id}-bridge-${bridgeIndex}`}
                        x1={bridge.from.x}
                        y1={bridge.from.y}
                        x2={bridge.to.x}
                        y2={bridge.to.y}
                        stroke={GROUP_COLORS[groupIndex % GROUP_COLORS.length]}
                        strokeWidth={2}
                        strokeDasharray="5 4"
                      />
                    ))}
                  </g>
                ))}
              </svg>

              {/* Top-left coordinate indicator */}
              <div
                className="absolute left-0 top-0 grid place-items-center text-[10px] text-slate-400 font-medium"
                style={{ width: HEADER_WIDTH, height: HEADER_HEIGHT }}
              >
                <KatexMath math={`${rowLabel}/${columnLabel}`} />
              </div>

              {/* Column Gray code headers */}
              <div
                className="absolute left-[34px] top-0 grid"
                style={{
                  gridTemplateColumns: `repeat(${topology.columns}, ${CELL_WIDTH}px)`,
                  height: HEADER_HEIGHT,
                }}
              >
                {topology.columnGrayCodes.map(code => (
                  <div key={code} className="grid place-items-center text-xs font-normal text-slate-700 dark:text-slate-300">
                    <KatexMath math={code} />
                  </div>
                ))}
              </div>

              {/* Row Gray code headers */}
              <div
                className="absolute left-0 top-[29px] grid"
                style={{
                  gridTemplateRows: `repeat(${topology.rows}, ${CELL_HEIGHT}px)`,
                  width: HEADER_WIDTH,
                }}
              >
                {topology.rowGrayCodes.map(code => (
                  <div key={code} className="grid place-items-center text-xs font-normal text-slate-700 dark:text-slate-300">
                    <KatexMath math={code} />
                  </div>
                ))}
              </div>

              {/* Cells grid */}
              <div
                role="grid"
                aria-label={`${variableCount}-variable Karnaugh map`}
                className="relative z-1 grid"
                style={{
                  gridTemplateColumns: `repeat(${topology.columns}, ${CELL_WIDTH}px)`,
                  gridTemplateRows: `repeat(${topology.rows}, ${CELL_HEIGHT}px)`,
                }}
              >
                {topology.cells.map(cell => {
                  const state: KMapCellState = cellStates[cell.minterm] ?? '0';
                  const active = state === '1';
                  const dontCare = state === 'X';
                  return (
                    <button
                      key={cell.minterm}
                      type="button"
                      role="gridcell"
                      onClick={() => toggleCell(cell.minterm)}
                      aria-label={`Minterm ${cell.minterm}, value ${state}. Click to change value.`}
                      title={`m${cell.minterm} = ${state}`}
                      className={`relative flex flex-col items-center justify-center border font-mono text-base font-bold transition-all ${
                        active
                          ? 'border-blue-500/60 bg-blue-50/40 text-blue-600 dark:border-blue-500/50 dark:bg-blue-950/30 dark:text-blue-400'
                          : dontCare
                          ? 'border-purple-500/60 bg-purple-50/40 text-purple-600 dark:border-purple-500/50 dark:bg-purple-950/30 dark:text-purple-400'
                          : 'border-slate-200/80 bg-white text-slate-500 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-400 dark:hover:bg-slate-800/40'
                      }`}
                    >
                      <KatexMath math={state} />
                      <span className="absolute bottom-1 right-1 text-[8px] opacity-70">
                        <KatexMath math={`m_{${cell.minterm}}`} />
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Simplified Expression SOP Card */}
        <section
          aria-label="Simplified expression"
          className="mt-4 overflow-hidden rounded-xl border border-blue-200/80 bg-gradient-to-r from-blue-50/40 via-indigo-50/30 to-purple-50/40 p-4 dark:border-blue-900/40 dark:from-blue-950/30 dark:via-indigo-950/20 dark:to-purple-950/30"
        >
          <div className="flex items-center justify-between">
            <div className="text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
              Simplified Expression · Sum of Products (SOP)
            </div>
            {solution && solution.hardwareCost.terms > 0 && (
              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
                {solution.hardwareCost.terms} terms · {solution.hardwareCost.literals} literals
              </span>
            )}
          </div>
          <div className="mt-2 overflow-x-auto text-lg font-bold text-slate-900 dark:text-white">
            <KatexMath math={`F = ${solution?.latex || '0'}`} displayMode />
          </div>
        </section>
      </div>
    </section>
  );
}
