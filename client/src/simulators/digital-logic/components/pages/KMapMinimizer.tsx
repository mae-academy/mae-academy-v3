/**
 * Luminous Technical Atelier — white academic analysis panel with blue/pink signals,
 * compact Boolean controls, and KaTeX as the only formula-rendering surface.
 */
import { BlockMath, InlineMath } from 'react-katex';
import 'katex/dist/katex.min.css';
import { useEffect, useMemo, useState } from 'react';
import { createKMapTopology, layoutKMapGroups } from '@/simulators/digital-logic/components/kmapGeometry';
import { solveKMap, type KMapVariableCount } from '@/simulators/digital-logic/engine/kmapSolver';
import { evaluateAst, parseBooleanExpression } from '@/simulators/digital-logic/engine/logicEngine';

type KMapCellState = '0' | '1' | 'X';
type KMapDefinitionMode = 'terms' | 'expression';

const VARIABLE_SETS: Record<KMapVariableCount, string[]> = {
  2: ['A', 'B'],
  3: ['A', 'B', 'C'],
  4: ['A', 'B', 'C', 'D'],
  5: ['A', 'B', 'C', 'D', 'E'],
};
const CELL_WIDTH = 68;
const CELL_HEIGHT = 56;
const HEADER_WIDTH = 34;
const HEADER_HEIGHT = 29;
const GROUP_COLORS = ['#2563eb', '#7c3aed', '#db2777', '#0891b2', '#ea580c'];

const initialStates = (variableCount: KMapVariableCount): KMapCellState[] => {
  const values = Array<KMapCellState>(2 ** variableCount).fill('0');
  const active = variableCount === 2 ? [0, 1, 3] : variableCount === 3 ? [0, 1, 2, 3] : [0, 1, 2, 3, 8, 9, 10, 11];
  active.forEach(index => { values[index] = '1'; });
  return values;
};

const nextState = (state: KMapCellState): KMapCellState => state === '0' ? '1' : state === '1' ? 'X' : '0';
const compactMinterms = (values: readonly number[]) => values.length ? values.join(', ') : '\\varnothing';
const listFromStates = (states: readonly KMapCellState[], state: KMapCellState) => states.flatMap((value, index) => value === state ? [index] : []);
const listInput = (values: readonly number[]) => values.join(', ');
const contextFromMinterm = (minterm: number, variables: readonly string[]) => Object.fromEntries(variables.map((variable, index) => [variable, Boolean(minterm & (1 << (variables.length - index - 1)))]));

const parseTerms = (source: string, variableCount: KMapVariableCount, label: string): number[] => {
  if (!source.trim()) return [];
  const maximum = 2 ** variableCount - 1;
  const values = source.split(',').map(value => value.trim()).filter(Boolean).map(value => {
    if (!/^\d+$/.test(value)) throw new Error(`${label} must use comma-separated whole numbers.`);
    const term = Number(value);
    if (term > maximum) throw new Error(`${label} accepts indices from 0 to ${maximum} for this map.`);
    return term;
  });
  return Array.from(new Set(values)).sort((left, right) => left - right);
};

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

const FormulaStat = ({ label, math }: { label: string; math: string }) => <div style={{ border: '1px solid #e2e8f0', borderRadius: 10, background: '#f8fafc', minWidth: 0, padding: '9px 11px' }}>
  <div style={{ color: '#64748b', fontSize: 9, fontWeight: 850, letterSpacing: '.12em', textTransform: 'uppercase' }}>{label}</div>
  <div style={{ color: '#0f172a', fontSize: 13, marginTop: 4, overflowX: 'auto' }}><InlineMath math={math} /></div>
</div>;

/** React adapter over the pure QMC/Petrick and overlay geometry modules. */
export function KMapMinimizer() {
  const [variableCount, setVariableCount] = useState<KMapVariableCount>(4);
  const [cellStates, setCellStates] = useState<KMapCellState[]>(() => initialStates(4));
  const [mintermInput, setMintermInput] = useState(() => listInput(listFromStates(initialStates(4), '1')));
  const [dontCareInput, setDontCareInput] = useState('');
  const [expressionInput, setExpressionInput] = useState('');
  const [definitionMode, setDefinitionMode] = useState<KMapDefinitionMode>('terms');
  const [lastExpressionLatex, setLastExpressionLatex] = useState<string | null>(null);
  const [inputError, setInputError] = useState<string | null>(null);
  const debouncedMinterms = useDebouncedValue(mintermInput, 300);
  const debouncedDontCares = useDebouncedValue(dontCareInput, 300);
  const debouncedExpression = useDebouncedValue(expressionInput, 300);
  const topology = useMemo(() => createKMapTopology(variableCount), [variableCount]);
  const variables = VARIABLE_SETS[variableCount];
  const metrics = useMemo(() => ({ cellWidth: CELL_WIDTH, cellHeight: CELL_HEIGHT, cornerRadius: 15 }), []);

  const applyStates = (next: KMapCellState[]) => {
    setCellStates(next);
    setMintermInput(listInput(listFromStates(next, '1')));
    setDontCareInput(listInput(listFromStates(next, 'X')));
    setDefinitionMode('terms');
    setExpressionInput('');
    setLastExpressionLatex(null);
    setInputError(null);
  };

  useEffect(() => {
    if (definitionMode !== 'terms') return;
    try {
      const minterms = parseTerms(debouncedMinterms, variableCount, 'Minterms');
      const dontCares = parseTerms(debouncedDontCares, variableCount, 'Don’t-cares');
      const overlap = minterms.find(term => dontCares.includes(term));
      if (overlap !== undefined) throw new Error(`Minterm ${overlap} cannot also be a don’t-care.`);
      const next = Array<KMapCellState>(2 ** variableCount).fill('0');
      minterms.forEach(term => { next[term] = '1'; });
      dontCares.forEach(term => { next[term] = 'X'; });
      setCellStates(next);
      setInputError(null);
    } catch (error) {
      setInputError(error instanceof Error ? error.message : 'Invalid K-Map definition.');
    }
  }, [debouncedDontCares, debouncedMinterms, definitionMode, variableCount]);

  useEffect(() => {
    if (definitionMode !== 'expression') return;
    try {
      const parsed = parseBooleanExpression(debouncedExpression);
      const unsupportedVariable = parsed.variables.find(variable => !variables.includes(variable));
      if (unsupportedVariable) throw new Error(`Variable ${unsupportedVariable} is outside the selected ${variableCount}-variable map.`);
      const next = Array<KMapCellState>(2 ** variableCount).fill('0');
      topology.cells.forEach(cell => { next[cell.minterm] = evaluateAst(parsed.ast, contextFromMinterm(cell.minterm, variables)) ? '1' : '0'; });
      setCellStates(next);
      setMintermInput(listInput(listFromStates(next, '1')));
      setDontCareInput('');
      setLastExpressionLatex(parsed.latex);
      setInputError(null);
    } catch (error) {
      setInputError(error instanceof Error ? error.message : 'Invalid Boolean expression.');
    }
  }, [debouncedExpression, definitionMode, topology, variableCount, variables]);

  const minterms = useMemo(() => listFromStates(cellStates, '1'), [cellStates]);
  const dontCares = useMemo(() => listFromStates(cellStates, 'X'), [cellStates]);
  const solution = useMemo(() => solveKMap({ variables, minterms, dontCares }), [variables, minterms, dontCares]);
  const groups = useMemo(() => layoutKMapGroups(
    solution.selectedPrimeImplicants.map(implicant => ({ id: implicant.pattern, coveredMinterms: implicant.sourceTerms })),
    topology,
    metrics,
  ), [metrics, solution.selectedPrimeImplicants, topology]);
  const sourceMath = `F(${variables.join(',')}) = \\Sigma m(${compactMinterms(minterms)})${dontCares.length ? ` + d(${compactMinterms(dontCares)})` : ''}`;
  const academicDefinition = definitionMode === 'expression' && lastExpressionLatex ? `F = ${lastExpressionLatex}` : sourceMath;

  const switchVariableCount = (nextCount: 2 | 3 | 4) => {
    setVariableCount(nextCount);
    applyStates(initialStates(nextCount));
  };
  const toggleCell = (minterm: number) => applyStates(cellStates.map((state, index) => index === minterm ? nextState(state) : state));
  const resetMap = () => applyStates(initialStates(variableCount));
  const clearMap = () => applyStates(Array<KMapCellState>(2 ** variableCount).fill('0'));
  const rowLabel = variables.slice(0, topology.rowBits).join('');
  const columnLabel = variables.slice(topology.rowBits, topology.rowBits + topology.columnBits).join('');

  return <section aria-label="K-Map Minimizer" style={{ border: '1px solid #e2e8f0', borderRadius: 14, background: '#ffffff', color: '#0f172a', overflow: 'hidden', boxShadow: '0 10px 28px rgba(15, 23, 42, .08)' }}>
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.08fr) minmax(280px, .92fr)', gap: 18, padding: 22 }}>
      <div>
        <label htmlFor="kmap-expression" style={{ display: 'block', marginBottom: 8, color: '#334155', fontSize: 11, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase' }}>Boolean expression</label>
        <input id="kmap-expression" value={expressionInput} onChange={event => { setDefinitionMode('expression'); setExpressionInput(event.target.value); }} spellCheck={false} aria-describedby="kmap-definition-hint kmap-definition-error" placeholder="e.g. A' + B'C" style={{ width: '100%', boxSizing: 'border-box', border: `1px solid ${inputError ? '#fda4af' : '#cbd5e1'}`, borderRadius: 10, outline: 'none', padding: '12px 13px', color: '#0f172a', background: inputError ? '#fff8f8' : '#ffffff', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 15, fontWeight: 700, transition: 'border-color 160ms ease' }} />
        <div style={{ alignItems: 'center', color: '#64748b', display: 'flex', fontSize: 10, fontWeight: 800, gap: 8, letterSpacing: '.08em', margin: '11px 0', textTransform: 'uppercase' }}><span style={{ flex: 1, height: 1, background: '#e2e8f0' }} />or define cells<span style={{ flex: 1, height: 1, background: '#e2e8f0' }} /></div>
        <label htmlFor="kmap-minterms" style={{ display: 'block', marginBottom: 8, color: '#334155', fontSize: 11, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase' }}>Minterms · <InlineMath math="\\Sigma m" /></label>
        <input id="kmap-minterms" value={mintermInput} onChange={event => { setDefinitionMode('terms'); setExpressionInput(''); setLastExpressionLatex(null); setMintermInput(event.target.value); }} spellCheck={false} aria-describedby="kmap-definition-hint kmap-definition-error" placeholder="e.g. 0, 1, 3, 7" style={{ width: '100%', boxSizing: 'border-box', border: `1px solid ${inputError ? '#fda4af' : '#cbd5e1'}`, borderRadius: 10, outline: 'none', padding: '12px 13px', color: '#0f172a', background: inputError ? '#fff8f8' : '#ffffff', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 15, fontWeight: 700, transition: 'border-color 160ms ease' }} />
        <label htmlFor="kmap-dont-cares" style={{ display: 'block', margin: '12px 0 8px', color: '#334155', fontSize: 11, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase' }}>Don’t-cares · <InlineMath math="d" /></label>
        <input id="kmap-dont-cares" value={dontCareInput} onChange={event => { setDefinitionMode('terms'); setExpressionInput(''); setLastExpressionLatex(null); setDontCareInput(event.target.value); }} spellCheck={false} aria-describedby="kmap-definition-hint kmap-definition-error" placeholder="optional: e.g. 2, 6" style={{ width: '100%', boxSizing: 'border-box', border: `1px solid ${inputError ? '#fda4af' : '#cbd5e1'}`, borderRadius: 10, outline: 'none', padding: '12px 13px', color: '#0f172a', background: inputError ? '#fff8f8' : '#ffffff', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 15, fontWeight: 700, transition: 'border-color 160ms ease' }} />
        <div role="group" aria-label="Variable count" style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 7, marginTop: 12 }}>
          <span style={{ color: '#64748b', fontSize: 10, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase' }}>Map variables</span>
          {([2, 3, 4] as const).map(count => {
            const active = count === variableCount;
            return <button key={count} type="button" onClick={() => switchVariableCount(count)} aria-label={`Select ${count}-variable K-Map`} aria-pressed={active} style={{ border: `1px solid ${active ? '#bfdbfe' : '#dbe3ef'}`, borderRadius: 7, background: active ? '#eff6ff' : '#ffffff', color: active ? '#1d4ed8' : '#475569', cursor: 'pointer', fontSize: 11, fontWeight: 800, minWidth: 52, padding: '6px 9px', transition: 'background 160ms cubic-bezier(.23, 1, .32, 1), color 160ms cubic-bezier(.23, 1, .32, 1)' }}><InlineMath math={`${count}\\text{-Var}`} /></button>;
          })}
          <button type="button" onClick={resetMap} style={{ border: '1px solid #dbe3ef', borderRadius: 7, background: '#ffffff', color: '#475569', cursor: 'pointer', fontSize: 11, fontWeight: 800, padding: '6px 9px' }}>Reset example</button>
          <button type="button" onClick={clearMap} style={{ border: '1px solid #dbe3ef', borderRadius: 7, background: '#ffffff', color: '#475569', cursor: 'pointer', fontSize: 11, fontWeight: 800, padding: '6px 9px' }}>Clear map</button>
        </div>
        <p id="kmap-definition-hint" style={{ margin: '8px 0 0', color: '#64748b', fontSize: 11, lineHeight: 1.5 }}>Use <strong>*, +, ^, ~, !</strong> and postfix <strong>'</strong> or <strong>′</strong>, or enter comma-separated indices. Cell clicks cycle <strong>0 → 1 → X</strong>. Input synchronizes after 300 ms.</p>
        {inputError && <p id="kmap-definition-error" role="alert" style={{ margin: '8px 0 0', color: '#be123c', fontSize: 12, fontWeight: 700 }}>Invalid K-Map Definition — {inputError}</p>}
      </div>
      <div style={{ minHeight: 156, border: '1px solid #dbeafe', borderRadius: 10, background: '#f8fbff', padding: '8px 12px', overflowX: 'auto' }}>
        <div style={{ color: '#2563eb', fontSize: 9, fontWeight: 850, letterSpacing: '.13em', textTransform: 'uppercase' }}>K-Map → academic notation</div>
        <div style={{ color: '#0f172a', fontSize: 15, marginTop: 1 }}><BlockMath math={academicDefinition} /></div>
        <div style={{ borderTop: '1px solid #dbeafe', color: '#64748b', fontSize: 10, lineHeight: 1.45, marginTop: 1, paddingTop: 8 }}>Quine–McCluskey extracts prime implicants; Petrick resolves the least-cost cover.</div>
      </div>
    </div>

    <div style={{ padding: '0 22px 22px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(240px, .72fr)', gap: 12, alignItems: 'stretch' }}>
        <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, background: '#fbfdff', padding: 15, overflowX: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 13 }}>
            <div style={{ color: '#334155', fontSize: 10, fontWeight: 850, letterSpacing: '.11em', textTransform: 'uppercase' }}>Gray-code map</div>
            <div style={{ color: '#64748b', fontSize: 11 }}><InlineMath math={`${rowLabel}\\,/\\,${columnLabel}`} /></div>
          </div>
          <div style={{ display: 'inline-block', minWidth: HEADER_WIDTH + topology.columns * CELL_WIDTH }}>
            <div style={{ position: 'relative', paddingLeft: HEADER_WIDTH, paddingTop: HEADER_HEIGHT }}>
              <svg aria-hidden="true" viewBox={`0 0 ${topology.columns * CELL_WIDTH} ${topology.rows * CELL_HEIGHT}`} style={{ pointerEvents: 'none', position: 'absolute', left: HEADER_WIDTH, top: HEADER_HEIGHT, zIndex: 2, overflow: 'visible', width: topology.columns * CELL_WIDTH, height: topology.rows * CELL_HEIGHT }}>
                {groups.map((group, groupIndex) => <g key={group.id}>
                  {group.rects.map((rect, rectIndex) => <path key={`${group.id}-${rectIndex}`} d={rect.path} fill={GROUP_COLORS[groupIndex % GROUP_COLORS.length]} fillOpacity={0.065} stroke={GROUP_COLORS[groupIndex % GROUP_COLORS.length]} strokeOpacity={0.9} strokeWidth={2.4} />)}
                  {group.bridges.map((bridge, bridgeIndex) => <line key={`${group.id}-bridge-${bridgeIndex}`} x1={bridge.from.x} y1={bridge.from.y} x2={bridge.to.x} y2={bridge.to.y} stroke={GROUP_COLORS[groupIndex % GROUP_COLORS.length]} strokeWidth={2} strokeDasharray="5 4" />)}
                </g>)}
              </svg>
              <div style={{ position: 'absolute', left: 0, top: 0, width: HEADER_WIDTH, height: HEADER_HEIGHT, display: 'grid', placeItems: 'center', color: '#94a3b8', fontSize: 9 }}><InlineMath math={`${rowLabel}/${columnLabel}`} /></div>
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${topology.columns}, ${CELL_WIDTH}px)`, position: 'absolute', left: HEADER_WIDTH, top: 0, height: HEADER_HEIGHT }}>
                {topology.columnGrayCodes.map(code => <div key={code} style={{ display: 'grid', placeItems: 'center', color: '#475569', fontSize: 11, fontWeight: 800 }}><InlineMath math={code} /></div>)}
              </div>
              <div style={{ display: 'grid', gridTemplateRows: `repeat(${topology.rows}, ${CELL_HEIGHT}px)`, position: 'absolute', left: 0, top: HEADER_HEIGHT, width: HEADER_WIDTH }}>
                {topology.rowGrayCodes.map(code => <div key={code} style={{ display: 'grid', placeItems: 'center', color: '#475569', fontSize: 11, fontWeight: 800 }}><InlineMath math={code} /></div>)}
              </div>
              <div role="grid" aria-label={`${variableCount}-variable Karnaugh map`} style={{ display: 'grid', gridTemplateColumns: `repeat(${topology.columns}, ${CELL_WIDTH}px)`, gridTemplateRows: `repeat(${topology.rows}, ${CELL_HEIGHT}px)`, position: 'relative', zIndex: 1 }}>
                {topology.cells.map(cell => {
                  const state = cellStates[cell.minterm];
                  const active = state === '1';
                  const dontCare = state === 'X';
                  return <button key={cell.minterm} type="button" role="gridcell" onClick={() => toggleCell(cell.minterm)} aria-label={`Minterm ${cell.minterm}, value ${state}. Click to change value.`} title={`m${cell.minterm} = ${state}`} style={{ alignItems: 'center', background: active ? '#eff6ff' : dontCare ? '#fdf4ff' : '#ffffff', border: '1px solid #dce6f2', color: active ? '#1d4ed8' : dontCare ? '#a21caf' : '#64748b', cursor: 'pointer', display: 'flex', flexDirection: 'column', fontSize: 17, fontWeight: 850, justifyContent: 'center', minWidth: 0, padding: 0, position: 'relative', transition: 'background 160ms ease, color 160ms ease' }}>
                    <InlineMath math={state === 'X' ? '\\mathrm{X}' : state} />
                    <span style={{ bottom: 4, color: active ? '#60a5fa' : dontCare ? '#d8b4fe' : '#94a3b8', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 8, fontWeight: 700, position: 'absolute', right: 5 }}><InlineMath math={`m_{${cell.minterm}}`} /></span>
                  </button>;
                })}
              </div>
            </div>
          </div>
        </div>

        <aside aria-label="K-Map cover summary" style={{ border: '1px solid #e2e8f0', borderRadius: 12, background: '#f8fafc', padding: 15 }}>
          <div style={{ color: '#2563eb', fontSize: 9, fontWeight: 850, letterSpacing: '.13em', textTransform: 'uppercase' }}>Cover analysis</div>
          <div style={{ color: '#0f172a', fontSize: 14, fontWeight: 800, marginTop: 7 }}>Selected implicants</div>
          <p style={{ color: '#64748b', fontSize: 11, lineHeight: 1.5, margin: '6px 0 13px' }}>Each colored contour is one term in the selected minimum cover. <InlineMath math="X" /> cells may expand a group but are not required outputs.</p>
          <div style={{ display: 'grid', gap: 9 }}>
            <FormulaStat label="Active minterms" math={`\\Sigma m(${compactMinterms(minterms)})`} />
            <FormulaStat label="Don’t-cares" math={`d(${compactMinterms(dontCares)})`} />
            <FormulaStat label="Hardware cost" math={`${solution.hardwareCost.terms}\\,\\text{terms},\\;${solution.hardwareCost.literals}\\,\\text{literals}`} />
          </div>
          <div style={{ borderTop: '1px solid #e2e8f0', marginTop: 13, paddingTop: 11 }}>
            <div style={{ color: '#64748b', fontSize: 9, fontWeight: 850, letterSpacing: '.1em', textTransform: 'uppercase' }}>SOP terms</div>
            {solution.selectedPrimeImplicants.length ? <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>{solution.selectedPrimeImplicants.map((implicant, index) => <div key={implicant.pattern} style={{ alignItems: 'center', borderLeft: `3px solid ${GROUP_COLORS[index % GROUP_COLORS.length]}`, color: '#0f172a', display: 'flex', gap: 8, minWidth: 0, padding: '4px 7px' }}><span style={{ color: '#64748b', fontSize: 10, fontWeight: 850 }}>{index + 1}</span><span style={{ fontSize: 13, overflowX: 'auto' }}><InlineMath math={implicant.latex} /></span></div>)}</div> : <p style={{ color: '#64748b', fontSize: 11, margin: '8px 0 0' }}>Set one or more cells to <InlineMath math="1" /> to form a cover.</p>}
          </div>
        </aside>
      </div>

      <section aria-label="Simplified expression" style={{ border: '1px solid #dbeafe', borderRadius: 12, background: 'linear-gradient(100deg, #f8fbff 0%, #fff8fc 100%)', marginTop: 14, overflow: 'hidden' }}>
        <div style={{ borderBottom: '1px solid #dbeafe', color: '#2563eb', fontSize: 9, fontWeight: 850, letterSpacing: '.13em', padding: '10px 14px', textTransform: 'uppercase' }}>Simplified expression · Sum of Products</div>
        <div style={{ color: '#0f172a', fontSize: 21, minHeight: 68, overflowX: 'auto', padding: '12px 16px' }}><BlockMath math={`F = ${solution.latex}`} /></div>
      </section>
    </div>
  </section>;
}
