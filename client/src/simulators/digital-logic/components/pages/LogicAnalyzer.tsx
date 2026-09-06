/**
 * Luminous Technical Atelier — a white academic analysis panel with blue/pink signals,
 * dense but breathable table rhythm, and KaTeX as the only formula-rendering surface.
 */
import { BlockMath, InlineMath } from 'react-katex';
import 'katex/dist/katex.min.css';
import { useEffect, useMemo, useState } from 'react';
import type { ParsedLogicExpression, TruthTableRow } from '@/simulators/digital-logic/engine/logicEngine';
import { canonicalSopFromRows, generateTruthTable, maxtermIndices, mintermIndices, parseBooleanExpression } from '@/simulators/digital-logic/engine/logicEngine';

const INITIAL_EXPRESSION = 'A*B+C';
const parseInitial = () => parseBooleanExpression(INITIAL_EXPRESSION);
const valueColor = (value: boolean) => value ? '#2563eb' : '#64748b';

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

const FormulaStat = ({ label, math }: { label: string; math: string }) => <div style={{ minWidth: 0, border: '1px solid #e2e8f0', borderRadius: 10, background: '#f8fafc', padding: '10px 12px' }}>
  <div style={{ marginBottom: 4, color: '#64748b', fontSize: 9, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase' }}>{label}</div>
  <div style={{ overflowX: 'auto', color: '#0f172a', fontSize: 14 }}><InlineMath math={math} /></div>
</div>;

/** React adapter around the pure compiler. Invalid source never replaces lastValid. */
export function LogicAnalyzer() {
  const [source, setSource] = useState(INITIAL_EXPRESSION);
  const [lastValid, setLastValid] = useState<ParsedLogicExpression>(parseInitial);
  const [parseError, setParseError] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Record<number, boolean>>({});
  const debouncedSource = useDebouncedValue(source, 300);

  useEffect(() => {
    try {
      const parsed = parseBooleanExpression(debouncedSource);
      setLastValid(parsed);
      setParseError(null);
      setOverrides({});
    } catch (error) {
      setParseError(error instanceof Error ? error.message : 'Invalid expression.');
    }
  }, [debouncedSource]);

  const rows = useMemo(() => generateTruthTable(lastValid.ast, lastValid.variables).map(row => ({ ...row, value: overrides[row.index] ?? row.value })), [lastValid, overrides]);
  const minterms = useMemo(() => mintermIndices(rows), [rows]);
  const maxterms = useMemo(() => maxtermIndices(rows), [rows]);
  const mintermMath = `\\Sigma m(${minterms.length ? minterms.join(', ') : '\\varnothing'})`;
  const maxtermMath = `\\Pi M(${maxterms.length ? maxterms.join(', ') : '\\varnothing'})`;

  const toggleOutput = (row: TruthTableRow) => {
    const nextRows = rows.map(current => current.index === row.index ? { ...current, value: !current.value } : current);
    const sop = canonicalSopFromRows(lastValid.variables, nextRows);
    try {
      const parsed = parseBooleanExpression(sop);
      setSource(sop);
      setLastValid(parsed);
      setOverrides({});
      setParseError(null);
    } catch (error) {
      setParseError(error instanceof Error ? error.message : 'Unable to reconstruct SOP.');
    }
  };

  return <section aria-label="Logic Analyzer" style={{ border: '1px solid #e2e8f0', borderRadius: 14, background: '#ffffff', color: '#0f172a', overflow: 'hidden', boxShadow: '0 10px 28px rgba(15, 23, 42, .08)' }}>
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.08fr) minmax(280px, .92fr)', gap: 18, padding: 22 }}>
      <div>
        <label htmlFor="logic-expression" style={{ display: 'block', marginBottom: 8, color: '#334155', fontSize: 11, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase' }}>Boolean expression</label>
        <input id="logic-expression" value={source} onChange={event => setSource(event.target.value)} spellCheck={false} aria-describedby="logic-expression-hint logic-expression-error" style={{ width: '100%', boxSizing: 'border-box', border: `1px solid ${parseError ? '#fda4af' : '#cbd5e1'}`, borderRadius: 10, outline: 'none', padding: '12px 13px', color: '#0f172a', background: parseError ? '#fff8f8' : '#ffffff', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 16, fontWeight: 700, transition: 'border-color 160ms ease' }} />
        <p id="logic-expression-hint" style={{ margin: '7px 0 0', color: '#64748b', fontSize: 11, lineHeight: 1.5 }}>Use <strong>*, +, ^, ~, !</strong>, postfix <strong>'</strong> or <strong>′</strong>, and adjacent variables such as <strong>AB</strong>. Parsing is debounced by 300 ms.</p>
        {parseError && <p id="logic-expression-error" role="alert" style={{ margin: '8px 0 0', color: '#be123c', fontSize: 12, fontWeight: 700 }}>Invalid Expression — {parseError}</p>}
      </div>
      <div style={{ minHeight: 96, border: '1px solid #dbeafe', borderRadius: 10, background: '#f8fbff', padding: '8px 12px', overflowX: 'auto' }}>
        <div style={{ color: '#2563eb', fontSize: 9, fontWeight: 850, letterSpacing: '.13em', textTransform: 'uppercase' }}>AST → academic notation</div>
        <div style={{ marginTop: 4, color: '#0f172a', fontSize: 17 }}><BlockMath math={`F = ${lastValid.latex}`} /></div>
      </div>
    </div>

    <div style={{ padding: '0 22px 22px' }}>
      <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'auto', maxHeight: 440 }}>
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: 13 }}>
          <thead><tr>{lastValid.variables.map(variable => <th key={variable} scope="col" style={{ position: 'sticky', top: 0, zIndex: 1, padding: '11px 14px', borderBottom: '1px solid #cbd5e1', background: '#f8fafc', color: '#475569', fontSize: 10, fontWeight: 850, letterSpacing: '.1em', textAlign: 'center' }}><InlineMath math={variable} /></th>)}<th scope="col" style={{ position: 'sticky', top: 0, zIndex: 1, minWidth: 124, padding: '11px 14px', borderBottom: '1px solid #cbd5e1', borderLeft: '1px solid #e2e8f0', background: '#eef6ff', color: '#1d4ed8', fontSize: 10, fontWeight: 850, letterSpacing: '.1em', textAlign: 'center' }}><InlineMath math="F" /> · click to edit</th></tr></thead>
          <tbody>{rows.map(row => <tr key={row.index}>{lastValid.variables.map(variable => <td key={variable} style={{ padding: '8px 14px', borderBottom: '1px solid #f1f5f9', color: '#475569', fontWeight: 700, textAlign: 'center' }}><InlineMath math={row.context[variable] ? '1' : '0'} /></td>)}<td style={{ padding: 5, borderBottom: '1px solid #f1f5f9', borderLeft: '1px solid #f1f5f9', textAlign: 'center' }}><button type="button" onClick={() => toggleOutput(row)} aria-label={`Toggle output for minterm ${row.index}`} style={{ width: '100%', border: '1px solid #dbeafe', borderRadius: 7, padding: '5px 10px', color: valueColor(row.value), background: row.value ? '#eff6ff' : '#ffffff', fontWeight: 850 }}><InlineMath math={row.value ? '1' : '0'} /></button></td></tr>)}</tbody>
        </table>
      </div>
      <p style={{ margin: '9px 0 15px', color: '#64748b', fontSize: 11, lineHeight: 1.45 }}>Editing an output row reconstructs canonical SOP from all active minterms and reparses it through the same compiler.</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}><FormulaStat label="Canonical SOP" math={mintermMath} /><FormulaStat label="Canonical POS" math={maxtermMath} /></div>
    </div>
  </section>;
}
