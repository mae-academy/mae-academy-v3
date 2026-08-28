import { useEffect, useMemo, useState } from 'react';
import type { MNAElement } from '../lib/mnaSolver';
import { NodalSolver } from '../lib/NodalSolver';
import { MeshSolver } from '../lib/MeshSolver';
import { SuperpositionSolver } from '../lib/SuperpositionSolver';
import { SourceTransformationSolver } from '../lib/SourceTransformationSolver';
import { TheveninSolver } from '../lib/TheveninSolver';
import type { AnalysisMethod, AnalysisTrace, NodalNodeLabel } from '../lib/analysisTypes';
import { compactMathNumbers } from '../lib/analysisFormatting';
import type { MeshGeometry } from '../lib/meshGeometry';
import { V3BlockMath, V3Math } from './V3Math';

const METHODS: Array<{ id: AnalysisMethod; label: string }> = [
  { id: 'nodal', label: 'Nodal' }, { id: 'mesh', label: 'Mesh' }, { id: 'superposition', label: 'Superposition' }, { id: 'transform', label: 'Source Xform' }, { id: 'thevenin', label: 'Thévenin' },
];

export function AnalysisBox({ elements, geometry, nodalNodes = [], colors, standalone = false, onTraceChange }: { elements: MNAElement[]; geometry?: MeshGeometry; nodalNodes?: NodalNodeLabel[]; colors: { panel: string; panelAlt: string; line: string; text: string; muted: string; primary: string; danger: string }; standalone?: boolean; onTraceChange?: (trace: AnalysisTrace) => void }) {
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
  return <section style={{ borderTop: standalone ? 'none' : `1px solid ${colors.line}`, padding: standalone ? '18px 20px 22px' : '12px 15px' }}>
    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 12 }}><div><div style={{ color: colors.muted, fontSize: 9, fontWeight: 800, letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: 3 }}>Phase 3 · Academic Analysis</div><div style={{ color: colors.text, fontSize: standalone ? 16 : 11, fontWeight: 800 }}>{trace.heading}</div></div><label style={{ display: 'flex', alignItems: 'center', gap: 6, color: colors.muted, fontSize: 10, fontWeight: 750 }}>DECIMAL PLACES<select value={precision} onChange={(event) => setPrecision(Number(event.target.value))} style={{ border: `1px solid ${colors.line}`, borderRadius: 6, padding: '5px 7px', background: colors.panelAlt, color: colors.text, fontSize: 10 }}>{[0, 1, 2, 3, 4, 5, 6].map((digits) => <option key={digits} value={digits}>{digits}</option>)}</select></label></div>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 12 }}>{METHODS.map((item) => <button key={item.id} onClick={() => setMethod(item.id)} style={{ border: `1px solid ${method === item.id ? colors.primary : colors.line}`, background: method === item.id ? `${colors.primary}15` : colors.panelAlt, color: method === item.id ? colors.primary : colors.muted, borderRadius: 6, padding: '6px 9px', fontSize: 10, fontWeight: 800, cursor: 'pointer' }}>{item.label}</button>)}</div>
    {(method === 'superposition' || method === 'transform' || method === 'thevenin') && <div style={{ display: 'grid', gap: 5, marginBottom: 10 }}>
      <label style={{ display: 'grid', gap: 3, color: colors.muted, fontSize: 9, fontWeight: 800 }}>TARGET LOAD / BRANCH<select value={targetResistor} onChange={(event) => setTargetResistor(event.target.value)} style={{ border: `1px solid ${colors.line}`, borderRadius: 5, padding: 5, background: colors.panelAlt, color: colors.text, fontSize: 10 }}><option value="">Automatic first resistor</option>{resistors.map((item) => <option key={item.id} value={item.id}>{item.id} · {item.resistance} Ω</option>)}</select></label>
      {method === 'transform' && <label style={{ display: 'grid', gap: 3, color: colors.muted, fontSize: 9, fontWeight: 800 }}>SOURCE / RESISTOR PAIR<select value={targetSource} onChange={(event) => setTargetSource(event.target.value)} style={{ border: `1px solid ${colors.line}`, borderRadius: 5, padding: 5, background: colors.panelAlt, color: colors.text, fontSize: 10 }}><option value="">Automatic first voltage source</option>{sources.map((item) => <option key={item.id} value={item.id}>{item.id} · {item.voltage} V</option>)}</select></label>}
    </div>}
    {trace.warning && <div style={{ color: trace.status === 'error' ? colors.danger : colors.muted, fontSize: 10, lineHeight: 1.45, marginBottom: 8 }}>{trace.warning}</div>}
    <div style={{ display: 'grid', gap: 12, gridTemplateColumns: standalone ? 'repeat(auto-fit, minmax(300px, 1fr))' : '1fr' }}>{trace.steps.map((step, index) => <article key={`${step.title}-${index}`} style={{ minWidth: 0, border: `1px solid ${colors.line}`, borderRadius: 9, background: colors.panelAlt, padding: '12px 14px', gridColumn: standalone && /matrix|solution/i.test(step.title) ? '1 / -1' : undefined }}><div style={{ color: colors.primary, fontSize: 10, fontWeight: 850, marginBottom: 6 }}>{step.title}</div><div className="custom-scrollbar w-full overflow-x-auto" style={{ maxWidth: '100%', color: colors.text, fontSize: 12, paddingBlock: 4 }}><div className="min-w-max pr-2">{method === 'nodal' || method === 'mesh' ? <V3BlockMath math={displayMath(step.math)} /> : <V3Math math={displayMath(step.math)} />}</div></div>{step.prose && <div style={{ color: colors.muted, fontSize: 10, lineHeight: 1.5, marginTop: 6 }}>{step.prose}</div>}</article>)}</div>
  </section>;
}
