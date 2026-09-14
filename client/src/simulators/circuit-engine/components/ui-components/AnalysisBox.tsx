/* MAE Luminous Technical Atelier: Tab D Academic Analysis renders solver-backed derivations only.
   This view selects an engine trace; all circuit mathematics remains inside the dedicated solvers. */
import { useEffect, useMemo, useState } from 'react';
import type { MNAElement } from '@/simulators/circuit-engine/engine/mnaSolver';
import { NodalSolver } from '@/simulators/circuit-engine/engine/NodalSolver';
import { MeshSolver } from '@/simulators/circuit-engine/engine/MeshSolver';
import { SuperpositionSolver } from '@/simulators/circuit-engine/engine/SuperpositionSolver';
import { SourceTransformationSolver } from '@/simulators/circuit-engine/engine/SourceTransformationSolver';
import { TheveninSolver } from '@/simulators/circuit-engine/engine/TheveninSolver';
import type { AnalysisMethod, AnalysisTrace, NodalNodeLabel } from '@/simulators/circuit-engine/models/analysisTypes';
import { compactMathNumbers } from '@/simulators/circuit-engine/models/analysisFormatting';
import type { MeshGeometry } from '@/simulators/circuit-engine/components/meshGeometry';
import { V3BlockMath, V3Math } from '@/components/ui/V3Math';
import { MESH_LOOP_COLORS } from '@/simulators/circuit-engine/components/analogCanvasGeometry';
import { AcademicNodalDictionary } from '@/simulators/circuit-engine/models/AcademicNodalDictionary';

const METHODS: Array<{ id: AnalysisMethod; label: string }> = [
  { id: 'nodal', label: 'Nodal' },
  { id: 'mesh', label: 'Mesh' },
  { id: 'superposition', label: 'Superposition' },
  { id: 'transform', label: 'Source Xform' },
  { id: 'thevenin', label: 'Thévenin' },
];

type AnalysisColors = { panel: string; panelAlt: string; line: string; text: string; muted: string; primary: string; danger: string };

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
  const meshStepStyle = (title: string) => { if (method !== 'mesh') return undefined; const match = title.match(/(?:Loop|Mesh)\s*(\d+)/i); if (!match) return undefined; return { borderLeft: `3px solid ${MESH_LOOP_COLORS[(parseInt(match[1], 10) - 1) % MESH_LOOP_COLORS.length]}` }; };

  return <section className="rounded-xl border border-slate-200/80 bg-slate-50/70 dark:border-[#1a1d24] dark:bg-[#090a0d]" style={{ padding: standalone ? '18px 20px 22px' : '12px 15px', borderTop: standalone ? 'none' : `1px solid ${colors.line}` }}>
    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 12 }}><div><div className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-white">{trace.heading}</div>{trace.status === 'ready' && <div style={{ marginTop: 3, color: colors.muted, fontSize: 10 }}>Solver-backed derivation</div>}</div><label style={{ display: 'flex', alignItems: 'center', gap: 6, color: colors.muted, fontSize: 10, fontWeight: 750 }}>DECIMAL PLACES<select value={precision} onChange={(event) => setPrecision(Number(event.target.value))} style={{ border: `1px solid ${colors.line}`, borderRadius: 6, padding: '5px 7px', background: colors.panelAlt, color: colors.text, fontSize: 10 }}>{[0, 1, 2, 3, 4, 5, 6].map((digits) => <option key={digits} value={digits}>{digits}</option>)}</select></label></div>
    <div className="mb-4 flex flex-wrap gap-2">{METHODS.map((item) => { const sel = method === item.id; return <button key={item.id} type="button" role="tab" aria-selected={sel} onClick={() => setMethod(item.id)} className={`inline-flex min-h-[36px] items-center justify-center rounded-lg px-4 py-2 text-xs font-medium transition-colors ${sel ? 'bg-brand-gradient text-white shadow-sm' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-[#282d38] dark:bg-[#13161c] dark:text-slate-400 dark:hover:bg-[#1a1d24]'}`}>{item.label}</button>; })}</div>
    {(method === 'superposition' || method === 'transform' || method === 'thevenin') && <div style={{ display: 'grid', gap: 5, marginBottom: 10 }}><label style={{ display: 'grid', gap: 3, color: colors.muted, fontSize: 9, fontWeight: 800 }}>TARGET LOAD / BRANCH<select value={targetResistor} onChange={(event) => setTargetResistor(event.target.value)} style={{ border: `1px solid ${colors.line}`, borderRadius: 5, padding: 5, background: colors.panelAlt, color: colors.text, fontSize: 10 }}><option value="">Automatic first resistor</option>{resistors.map((item) => <option key={item.id} value={item.id}>{new AcademicNodalDictionary(elements).element(item)} · {item.resistance} Ω</option>)}</select></label>{method === 'transform' && <label style={{ display: 'grid', gap: 3, color: colors.muted, fontSize: 9, fontWeight: 800 }}>SOURCE / RESISTOR PAIR<select value={targetSource} onChange={(event) => setTargetSource(event.target.value)} style={{ border: `1px solid ${colors.line}`, borderRadius: 5, padding: 5, background: colors.panelAlt, color: colors.text, fontSize: 10 }}><option value="">Automatic first voltage source</option>{sources.map((item) => <option key={item.id} value={item.id}>{new AcademicNodalDictionary(elements).element(item)} · {item.voltage} V</option>)}</select></label>}</div>}
    {trace.warning && <div role="status" style={{ color: trace.status === 'error' ? colors.danger : colors.muted, fontSize: 10, lineHeight: 1.45, marginBottom: 8 }}>{trace.warning}</div>}
    <div className="flex flex-col">{trace.steps.map((step, index) => (<article key={`${step.title}-${index}`} className="mb-4 rounded-xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-[#1a1d24] dark:bg-[#0d0f12]" style={meshStepStyle(step.title)}><div className="mb-3 flex items-baseline gap-3"><span className="text-[10px] font-bold uppercase tracking-[.14em] text-slate-400 dark:text-slate-500">Step {index + 1}</span><h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{step.title.replace(/^\s*\d+[.):]?\s*/, '')}</h4></div><div className="custom-scrollbar w-full overflow-x-auto" style={{ maxWidth: '100%', color: colors.text, fontSize: 12, paddingBlock: 2 }}><div className="min-w-max pr-2">{method === 'nodal' || method === 'mesh' ? <V3BlockMath math={displayMath(step.math)} /> : <V3Math math={displayMath(step.math)} />}</div></div>{step.prose && <div className="mt-3 text-slate-500 dark:text-slate-400" style={{ fontSize: 11, lineHeight: 1.6 }}>{step.prose}</div>}</article>))}</div>
  </section>;
}
