/* MAE Luminous Technical Atelier: Tab D Academic Analysis renders solver-backed derivations only.
   This view selects an engine trace; all circuit mathematics remains inside the dedicated solvers. */
import { useEffect, useMemo, useState } from 'react';
import type { MNAElement } from '@/v3-simulator/lib/mnaSolver';
import { NodalSolver } from '@/v3-simulator/lib/NodalSolver';
import { MeshSolver } from '@/v3-simulator/lib/MeshSolver';
import { SuperpositionSolver } from '@/v3-simulator/lib/SuperpositionSolver';
import { SourceTransformationSolver } from '@/v3-simulator/lib/SourceTransformationSolver';
import { TheveninSolver } from '@/v3-simulator/lib/TheveninSolver';
import type { AnalysisMethod, AnalysisTrace, NodalNodeLabel } from '@/v3-simulator/lib/analysisTypes';
import { compactMathNumbers } from '@/v3-simulator/lib/analysisFormatting';
import type { MeshGeometry } from '@/v3-simulator/lib/meshGeometry';
import { V3BlockMath, V3Math } from './V3Math';

const METHODS: Array<{ id: AnalysisMethod; label: string }> = [
  { id: 'nodal', label: 'Nodal' },
  { id: 'mesh', label: 'Mesh' },
  { id: 'superposition', label: 'Superposition' },
  { id: 'transform', label: 'Source Xform' },
  { id: 'thevenin', label: 'Thévenin' },
];

type AnalysisColors = { panel: string; panelAlt: string; line: string; text: string; muted: string; primary: string; danger: string };

/* Unified signature gradient + per-step spectrum (blue -> violet -> rose). */
const METHOD_GRADIENT = 'linear-gradient(90deg, #2563eb 0%, #ec4899 100%)';
const STEP_ACCENTS = [
  'linear-gradient(135deg, #2563eb, #60a5fa)',
  'linear-gradient(135deg, #7c3aed, #a78bfa)',
  'linear-gradient(135deg, #ec4899, #fb7185)',
];

export function AnalysisBox({ elements, geometry, nodalNodes = [], colors, standalone = false, onTraceChange }: { elements: MNAElement[]; geometry?: MeshGeometry; nodalNodes?: NodalNodeLabel[]; colors: AnalysisColors; standalone?: boolean; onTraceChange?: (trace: AnalysisTrace) => void }) {
  const [method, setMethod] = useState<AnalysisMethod>('nodal');
  const [targetResistor, setTargetResistor] = useState('');
  const [targetSource, setTargetSource] = useState('');
  const [precision, setPrecision] = useState(4);
  const resistors = elements.filter((element): element is Extract<MNAElement, { type: 'resistor' }> => element.type === 'resistor');
  const sources = elements.filter((element): element is Extract<MNAElement, { type: 'voltage' }> => element.type === 'voltage');
  const trace = useMemo<AnalysisTrace>(() => {
    if (!elements.length) return { method, status: 'unsupported', heading: 'Academic Analysis', steps: [], warning: 'Build a grounded DC circuit to generate a derivation.' };
    if (method === 'nodal') return new NodalSolver(elements, nodalNodes).analyze();
    if (method === 'mesh') return new MeshSolver(elements, geometry).analyze();
    if (method === 'superposition') return new SuperpositionSolver(elements).analyze(targetResistor);
    if (method === 'transform') return new SourceTransformationSolver(elements).analyze(targetSource, targetResistor);
    return new TheveninSolver(elements).analyze(targetResistor);
  }, [elements, geometry, method, nodalNodes, targetResistor, targetSource]);
  useEffect(() => { onTraceChange?.(trace); }, [onTraceChange, trace]);
  const displayMath = (math: string) => compactMathNumbers(math, precision);

  return <section className="rounded-xl border border-slate-200/80 bg-slate-50/70 dark:border-slate-700/60 dark:bg-slate-800/40" style={{ padding: standalone ? '18px 20px 22px' : '12px 15px', borderTop: standalone ? 'none' : `1px solid ${colors.line}` }}>
    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 12 }}><div><div className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-white">{trace.heading}</div>{trace.status === 'ready' && <div style={{ marginTop: 3, color: colors.muted, fontSize: 10 }}>Solver-backed derivation</div>}</div><label style={{ display: 'flex', alignItems: 'center', gap: 6, color: colors.muted, fontSize: 10, fontWeight: 750 }}>DECIMAL PLACES<select value={precision} onChange={(event) => setPrecision(Number(event.target.value))} style={{ border: `1px solid ${colors.line}`, borderRadius: 6, padding: '5px 7px', background: colors.panelAlt, color: colors.text, fontSize: 10 }}>{[0, 1, 2, 3, 4, 5, 6].map((digits) => <option key={digits} value={digits}>{digits}</option>)}</select></label></div>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>{METHODS.map((item) => { const sel = method === item.id; return <button key={item.id} onClick={() => setMethod(item.id)} style={{ border: sel ? '1px solid transparent' : `1px solid ${colors.line}`, background: sel ? METHOD_GRADIENT : colors.panelAlt, color: sel ? '#fff' : colors.muted, borderRadius: 8, padding: '7px 12px', fontSize: 10.5, fontWeight: 750, cursor: 'pointer', boxShadow: sel ? '0 1px 3px rgba(2, 6, 23, 0.15)' : 'none', transition: 'background .15s ease' }}>{item.label}</button>; })}</div>
    {(method === 'superposition' || method === 'transform' || method === 'thevenin') && <div style={{ display: 'grid', gap: 5, marginBottom: 10 }}><label style={{ display: 'grid', gap: 3, color: colors.muted, fontSize: 9, fontWeight: 800 }}>TARGET LOAD / BRANCH<select value={targetResistor} onChange={(event) => setTargetResistor(event.target.value)} style={{ border: `1px solid ${colors.line}`, borderRadius: 5, padding: 5, background: colors.panelAlt, color: colors.text, fontSize: 10 }}><option value="">Automatic first resistor</option>{resistors.map((item) => <option key={item.id} value={item.id}>{item.id} · {item.resistance} Ω</option>)}</select></label>{method === 'transform' && <label style={{ display: 'grid', gap: 3, color: colors.muted, fontSize: 9, fontWeight: 800 }}>SOURCE / RESISTOR PAIR<select value={targetSource} onChange={(event) => setTargetSource(event.target.value)} style={{ border: `1px solid ${colors.line}`, borderRadius: 5, padding: 5, background: colors.panelAlt, color: colors.text, fontSize: 10 }}><option value="">Automatic first voltage source</option>{sources.map((item) => <option key={item.id} value={item.id}>{item.id} · {item.voltage} V</option>)}</select></label>}</div>}
    {trace.warning && <div role="status" style={{ color: trace.status === 'error' ? colors.danger : colors.muted, fontSize: 10, lineHeight: 1.45, marginBottom: 8 }}>{trace.warning}</div>}
    <div style={{ display: 'grid', gap: 14, gridTemplateColumns: standalone ? 'repeat(auto-fit, minmax(300px, 1fr))' : '1fr' }}>{trace.steps.map((step, index) => { const tone = STEP_ACCENTS[index % STEP_ACCENTS.length]; const full = standalone && /matrix|solution/i.test(step.title); return <article key={`${step.title}-${index}`} className="rounded-xl border border-slate-200/80 bg-slate-50/70 dark:border-slate-700/60 dark:bg-slate-800/40" style={{ minWidth: 0, gridColumn: full ? '1 / -1' : undefined }}><div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 8 }}><span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 24, height: 24, padding: '0 6px', borderRadius: 8, background: tone, color: '#fff', fontSize: 11, fontWeight: 800, boxShadow: '0 1px 2px rgba(2, 6, 23, 0.18)' }}>{index + 1}</span><div style={{ color: colors.text, fontSize: 11, fontWeight: 800 }}>{step.title}</div></div><div className="custom-scrollbar w-full overflow-x-auto" style={{ maxWidth: '100%', color: colors.text, fontSize: 12, paddingBlock: 4 }}><div className="min-w-max pr-2">{method === 'nodal' || method === 'mesh' ? <V3BlockMath math={displayMath(step.math)} /> : <V3Math math={displayMath(step.math)} />}</div></div>{step.prose && <div style={{ color: colors.muted, fontSize: 10, lineHeight: 1.5, marginTop: 6 }}>{step.prose}</div>}</article>; })}</div>
  </section>;
}
