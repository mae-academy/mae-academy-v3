/** Advanced FSM Explorer — native SVG editor plus pure FSM/K-Map/HDL derivation workspace. */
import { BlockMath, InlineMath } from 'react-katex';
import 'katex/dist/katex.min.css';
import { useEffect, useMemo, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import { createDefaultFSM, generateExcitationTable, generateStateAssignments, generateStateTable, generateVerilog, minimizeExcitationEquations, type FSMDefinition, type FSMEncoding, type FSMKind, type FSMState, type FSMTransition, type FlipFlopKind } from '../utils/fsmEngine';

const NODE_RADIUS = 31;
const PANEL_BORDER = '1px solid #e2e8f0';
const latexSignal = (signal: string) => signal.replace(/([A-Z])(\d+)/, '$1_{$2}');
const transitionLabel = (machine: FSMDefinition, transition: FSMTransition) => `${machine.inputName}=${transition.input}${machine.kind === 'Mealy' ? ` / ${machine.outputName}=${transition.output ?? '0'}` : ''}`;
const inputStyle = { background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: 7, color: '#0f172a', display: 'block', fontSize: 12, marginTop: 6, padding: 8, width: '100%' } as const;
const fieldLabelStyle = { color: '#64748b', display: 'block', fontSize: 10, fontWeight: 850, letterSpacing: '.08em', textTransform: 'uppercase' } as const;

/** Uses the first vacant state name rather than the array length, so deletion cannot recreate a duplicate React key. */
export const nextAvailableStateId = (states: readonly Pick<FSMState, 'id'>[]) => {
  const occupied = new Set(states.map(state => state.id));
  let index = 0;
  while (occupied.has(`S${index}`)) index += 1;
  return `S${index}`;
};

const nextAvailableTransitionId = (transitions: readonly Pick<FSMTransition, 'id'>[]) => {
  const occupied = new Set(transitions.map(transition => transition.id));
  let index = 0;
  while (occupied.has(`t${index}`)) index += 1;
  return `t${index}`;
};

function StateDiagram({ machine, selectedStateId, onMoveState, onSelectState }: { machine: FSMDefinition; selectedStateId: string | null; onMoveState: (stateId: string, x: number, y: number) => void; onSelectState: (stateId: string) => void }) {
  const [dragging, setDragging] = useState<string | null>(null);
  const stateById = useMemo(() => new Map(machine.states.map(state => [state.id, state])), [machine.states]);
  const transitionPath = (transition: FSMTransition) => {
    const from = stateById.get(transition.from); const to = stateById.get(transition.to);
    if (!from || !to) return null;
    if (from.id === to.id) return { d: `M ${from.x - 17} ${from.y - 24} C ${from.x - 52} ${from.y - 84}, ${from.x + 52} ${from.y - 84}, ${from.x + 17} ${from.y - 24}`, labelX: from.x, labelY: from.y - 71 };
    const dx = to.x - from.x; const dy = to.y - from.y; const distance = Math.hypot(dx, dy) || 1;
    const ux = dx / distance; const uy = dy / distance;
    const startX = from.x + ux * NODE_RADIUS; const startY = from.y + uy * NODE_RADIUS;
    const endX = to.x - ux * NODE_RADIUS; const endY = to.y - uy * NODE_RADIUS;
    const reciprocal = machine.transitions.some(other => other.from === to.id && other.to === from.id);
    if (!reciprocal) return { d: `M ${startX} ${startY} L ${endX} ${endY}`, labelX: (startX + endX) / 2, labelY: (startY + endY) / 2 - 9 };
    const direction = from.id.localeCompare(to.id) < 0 ? 1 : -1;
    const controlX = (startX + endX) / 2 - uy * 42 * direction;
    const controlY = (startY + endY) / 2 + ux * 42 * direction;
    return { d: `M ${startX} ${startY} Q ${controlX} ${controlY} ${endX} ${endY}`, labelX: controlX, labelY: controlY - 8 * direction };
  };
  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!dragging) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    onMoveState(dragging, Math.max(NODE_RADIUS + 10, Math.min(550, event.clientX - bounds.left)), Math.max(NODE_RADIUS + 16, Math.min(330, event.clientY - bounds.top)));
  };
  return <svg role="img" aria-label="Interactive FSM state diagram" viewBox="0 0 590 370" onPointerMove={onPointerMove} onPointerUp={() => setDragging(null)} onPointerLeave={() => setDragging(null)} style={{ background: '#fbfdff', border: PANEL_BORDER, borderRadius: 10, display: 'block', height: 'auto', minHeight: 330, touchAction: 'none', width: '100%' }}>
    <defs><marker id="fsm-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M 0,0 L 8,4 L 0,8 Z" fill="#475569" /></marker><pattern id="fsm-grid" width="20" height="20" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r=".8" fill="#cbd5e1" opacity=".58" /></pattern></defs>
    <rect width="590" height="370" fill="url(#fsm-grid)" />
    {machine.transitions.map(transition => {
      const path = transitionPath(transition);
      return path && <g key={transition.id}><path d={path.d} fill="none" stroke="#475569" strokeWidth="1.6" markerEnd="url(#fsm-arrow)" /><rect x={path.labelX - 27} y={path.labelY - 10} width="54" height="18" rx="4" fill="#ffffff" stroke="#e2e8f0" /><text x={path.labelX} y={path.labelY + 3} textAnchor="middle" fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace" fontSize="8" fontWeight="700" fill="#334155">{transitionLabel(machine, transition)}</text></g>;
    })}
    {machine.states.map(state => {
      const selected = state.id === selectedStateId;
      return <g key={state.id} transform={`translate(${state.x} ${state.y})`} onPointerDown={event => { event.stopPropagation(); event.currentTarget.setPointerCapture?.(event.pointerId); onSelectState(state.id); setDragging(state.id); }} style={{ cursor: 'grab' }}>
        {selected && <circle r={NODE_RADIUS + 7} fill="#dbeafe" opacity=".9" />}
        <circle r={NODE_RADIUS} fill="#ffffff" stroke={selected ? '#2563eb' : '#1a2744'} strokeWidth={selected ? '3' : '2'} /><circle r={NODE_RADIUS - 5} fill="none" stroke={selected ? '#93c5fd' : '#dbeafe'} strokeWidth="1" />
        <text y="-2" textAnchor="middle" fill="#0f172a" fontSize="12" fontWeight="850">{state.name}</text>
        {machine.kind === 'Moore' && <text y="13" textAnchor="middle" fill="#2563eb" fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace" fontSize="10" fontWeight="800">{machine.outputName}={state.output}</text>}
      </g>;
    })}
    <text x="14" y="356" fill="#64748b" fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace" fontSize="9">SELECT A STATE · DRAG NODES · BEZIER FOR RECIPROCAL PATHS · SELF-LOOP ROUTING</text>
  </svg>;
}

function CompactTable({ label, children }: { label: string; children: ReactNode }) { return <section aria-label={label} style={{ border: PANEL_BORDER, borderRadius: 10, minWidth: 0, overflow: 'auto' }}>{children}</section>; }

function DerivationSteps({ equations, flipFlop }: { equations: ReturnType<typeof minimizeExcitationEquations>; flipFlop: FlipFlopKind }) {
  return <section aria-label="Derivation Steps" style={{ borderTop: PANEL_BORDER, marginTop: 17, paddingTop: 15 }}>
    <div style={{ color: '#334155', fontSize: 10, fontWeight: 850, letterSpacing: '.1em', textTransform: 'uppercase' }}>Derivation Steps</div>
    <div style={{ color: '#64748b', fontSize: 10, lineHeight: 1.45, margin: '7px 0 10px' }}>Trace every {flipFlop} excitation column from the master table, through its minterms and don’t-cares, to the K-Map minimum.</div>
    <div style={{ display: 'grid', gap: 8 }}>{equations.map((equation, index) => {
      const minterms = equation.minterms.join(',') || '\\varnothing';
      const dontCares = equation.dontCares.join(',') || '\\varnothing';
      return <details key={equation.signal} open={index === 0} style={{ background: '#ffffff', border: '1px solid #dbeafe', borderRadius: 8, padding: '8px 10px' }}>
        <summary style={{ color: '#1e3a8a', cursor: 'pointer', fontSize: 11, fontWeight: 850 }}>Derive <InlineMath math={latexSignal(equation.signal)} /></summary>
        <div style={{ borderTop: '1px solid #eff6ff', color: '#475569', fontSize: 10, lineHeight: 1.5, marginTop: 8, paddingTop: 8 }}><b>1. Excitation analysis.</b> Read the <InlineMath math={latexSignal(equation.signal)} /> column in the excitation matrix.</div>
        <div style={{ color: '#475569', fontSize: 10, lineHeight: 1.5, marginTop: 6 }}><b>2. Required cells.</b> Values of <InlineMath math="1" /> become minterms; values of <InlineMath math="X" /> become don’t-cares.</div>
        <div style={{ overflowX: 'auto' }}><BlockMath math={`${latexSignal(equation.signal)} = \\Sigma m(${minterms}) + d(${dontCares})`} /></div>
        <div style={{ color: '#475569', fontSize: 10, lineHeight: 1.5, marginTop: 2 }}><b>3. K-Map minimization.</b> Adjacent required and don’t-care cells are grouped by the existing QMC/Petrick minimizer.</div>
        <div style={{ color: '#1e3a8a', fontSize: 10, fontWeight: 850, marginTop: 6 }}>4. Final equation</div>
        <div style={{ overflowX: 'auto' }}><BlockMath math={equation.latex} /></div>
      </details>;
    })}</div>
  </section>;
}

/** Functional EDA workspace: click a state, edit its context, then observe every derived result update. */
export function StateMachineExplorer() {
  const [machine, setMachine] = useState<FSMDefinition>(createDefaultFSM);
  const [encoding, setEncoding] = useState<FSMEncoding>('Binary');
  const [flipFlop, setFlipFlop] = useState<FlipFlopKind>('D');
  const [copied, setCopied] = useState(false);
  const [selectedStateId, setSelectedStateId] = useState<string | null>('S0');
  const [transitionTargetId, setTransitionTargetId] = useState('S1');
  const [transitionInput, setTransitionInput] = useState<'0' | '1'>('0');
  const [transitionOutput, setTransitionOutput] = useState<'0' | '1'>('0');
  const assignments = useMemo(() => generateStateAssignments(machine.states, encoding), [machine.states, encoding]);
  const stateTable = useMemo(() => generateStateTable(machine, encoding), [machine, encoding]);
  const excitationTable = useMemo(() => generateExcitationTable(stateTable, flipFlop), [flipFlop, stateTable]);
  const equations = useMemo(() => minimizeExcitationEquations(excitationTable, machine.inputName), [excitationTable, machine.inputName]);
  const verilog = useMemo(() => generateVerilog(machine, encoding), [machine, encoding]);
  const selectedState = machine.states.find(state => state.id === selectedStateId) ?? null;
  const stateWidth = assignments[0]?.code.length ?? 0;
  const updateMachine = (patch: Partial<FSMDefinition>) => setMachine(current => ({ ...current, ...patch }));
  useEffect(() => {
    if (!selectedStateId || !machine.states.some(state => state.id === selectedStateId)) setSelectedStateId(machine.states[0]?.id ?? null);
    if (!machine.states.some(state => state.id === transitionTargetId)) setTransitionTargetId(machine.states.find(state => state.id !== selectedStateId)?.id ?? machine.states[0]?.id ?? '');
  }, [machine.states, selectedStateId, transitionTargetId]);
  const addState = () => {
    const id = nextAvailableStateId(machine.states); const index = Number(id.slice(1));
    setMachine(current => ({ ...current, states: [...current.states, { id, name: id, output: '0', x: 100 + (index % 3) * 170, y: 85 + Math.floor(index / 3) * 160 }] }));
    setSelectedStateId(id); setTransitionTargetId(id);
  };
  const deleteSelectedState = () => {
    if (!selectedState || machine.states.length <= 1) return;
    const remaining = machine.states.filter(state => state.id !== selectedState.id);
    setMachine(current => ({ ...current, states: remaining, transitions: current.transitions.filter(transition => transition.from !== selectedState.id && transition.to !== selectedState.id) }));
    setSelectedStateId(remaining[0]?.id ?? null); setTransitionTargetId(remaining[0]?.id ?? '');
  };
  const updateSelectedState = (patch: Partial<FSMState>) => selectedState && setMachine(current => ({ ...current, states: current.states.map(state => state.id === selectedState.id ? { ...state, ...patch } : state) }));
  const addTransitionFromSelected = () => {
    if (!selectedState || !transitionTargetId) return;
    setMachine(current => ({ ...current, transitions: [...current.transitions.filter(transition => !(transition.from === selectedState.id && transition.input === transitionInput)), { id: nextAvailableTransitionId(current.transitions), from: selectedState.id, to: transitionTargetId, input: transitionInput, output: transitionOutput }] }));
  };
  const moveState = (stateId: string, x: number, y: number) => setMachine(current => ({ ...current, states: current.states.map(state => state.id === stateId ? { ...state, x, y } : state) }));
  const copyVerilog = () => { void navigator.clipboard?.writeText(verilog); setCopied(true); window.setTimeout(() => setCopied(false), 1500); };
  const stateHeaders = [{ id: 'present-state', label: 'PS' }, { id: 'present-code', label: 'Code' }, { id: 'input', label: machine.inputName }, { id: 'next-state', label: 'NS' }, { id: 'next-code', label: 'Code' }, { id: 'output', label: machine.outputName }];

  return <section aria-label="Advanced FSM Explorer" style={{ background: '#ffffff', border: PANEL_BORDER, borderRadius: 14, color: '#0f172a', display: 'grid', gridTemplateColumns: '220px minmax(0, 1fr) minmax(290px, .78fr)', minHeight: 720, overflow: 'hidden' }}>
    <aside style={{ background: '#f8fafc', borderRight: PANEL_BORDER, padding: 16 }}>
      <div style={{ color: '#334155', fontSize: 10, fontWeight: 850, letterSpacing: '.1em', textTransform: 'uppercase' }}>EDA Controls</div>
      <button type="button" onClick={addState} style={{ background: '#ffffff', border: '1px solid #bfdbfe', borderRadius: 7, color: '#1d4ed8', cursor: 'pointer', fontSize: 12, fontWeight: 850, marginTop: 14, padding: '9px 10px', width: '100%' }}>Add State</button>
      {selectedState ? <div style={{ borderTop: PANEL_BORDER, marginTop: 16, paddingTop: 13 }}>
        <div style={{ color: '#2563eb', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 10, fontWeight: 850, letterSpacing: '.08em' }}>SELECTED · {selectedState.name}</div>
        <button type="button" onClick={deleteSelectedState} disabled={machine.states.length <= 1} style={{ background: machine.states.length <= 1 ? '#f1f5f9' : '#fff1f2', border: '1px solid #fecdd3', borderRadius: 7, color: machine.states.length <= 1 ? '#94a3b8' : '#be123c', cursor: machine.states.length <= 1 ? 'not-allowed' : 'pointer', fontSize: 11, fontWeight: 850, marginTop: 9, padding: '8px 9px', width: '100%' }}>Delete State</button>
        {machine.kind === 'Moore' && <label style={{ ...fieldLabelStyle, marginTop: 12 }}>State output<select value={selectedState.output} onChange={event => updateSelectedState({ output: event.target.value as '0' | '1' | 'X' })} style={inputStyle}><option value="0">0</option><option value="1">1</option></select></label>}
        <label style={{ ...fieldLabelStyle, marginTop: 12 }}>Add transition to<select value={transitionTargetId} onChange={event => setTransitionTargetId(event.target.value)} style={inputStyle}>{machine.states.map(state => <option key={state.id} value={state.id}>{state.name}</option>)}</select></label>
        <div style={{ display: 'grid', gap: 6, gridTemplateColumns: machine.kind === 'Mealy' ? '1fr 1fr' : '1fr', marginTop: 8 }}><label style={{ ...fieldLabelStyle, fontSize: 9 }}>Input<select value={transitionInput} onChange={event => setTransitionInput(event.target.value as '0' | '1')} style={{ ...inputStyle, marginTop: 5, padding: 7 }}><option value="0">0</option><option value="1">1</option></select></label>{machine.kind === 'Mealy' && <label style={{ ...fieldLabelStyle, fontSize: 9 }}>Output<select value={transitionOutput} onChange={event => setTransitionOutput(event.target.value as '0' | '1')} style={{ ...inputStyle, marginTop: 5, padding: 7 }}><option value="0">0</option><option value="1">1</option></select></label>}</div>
        <button type="button" onClick={addTransitionFromSelected} style={{ background: '#ffffff', border: '1px solid #dbe3ef', borderRadius: 7, color: '#475569', cursor: 'pointer', fontSize: 11, fontWeight: 850, marginTop: 9, padding: '8px 9px', width: '100%' }}>Add Transition To…</button>
      </div> : <div style={{ color: '#64748b', fontSize: 11, lineHeight: 1.5, marginTop: 14 }}>Select a state node to configure its output and transitions.</div>}
      <label style={{ ...fieldLabelStyle, marginTop: 20 }}>Machine model<select value={machine.kind} onChange={event => updateMachine({ kind: event.target.value as FSMKind })} style={inputStyle}><option>Moore</option><option>Mealy</option></select></label>
      <label style={{ ...fieldLabelStyle, marginTop: 14 }}>Flip-flop<select value={flipFlop} onChange={event => setFlipFlop(event.target.value as FlipFlopKind)} style={inputStyle}><option>D</option><option>T</option><option>JK</option><option>SR</option></select></label>
      <label style={{ ...fieldLabelStyle, marginTop: 14 }}>Encoding<select value={encoding} onChange={event => setEncoding(event.target.value as FSMEncoding)} style={inputStyle}><option>Binary</option><option>Gray</option><option>One-Hot</option></select></label>
      <div style={{ borderTop: PANEL_BORDER, color: '#64748b', fontSize: 10, lineHeight: 1.55, marginTop: 18, paddingTop: 12 }}>State assignment uses <b>{stateWidth}</b> flip-flop{stateWidth === 1 ? '' : 's'}. Unassigned codes are routed as orange <b>X</b> don’t-cares into minimization.</div>
    </aside>
    <main style={{ minWidth: 0, padding: 17 }}>
      <div style={{ alignItems: 'baseline', display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}><div style={{ color: '#334155', fontSize: 10, fontWeight: 850, letterSpacing: '.1em', textTransform: 'uppercase' }}>State diagram</div><div style={{ color: '#64748b', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 10 }}>{machine.kind.toUpperCase()} · {encoding.toUpperCase()}</div></div>
      <StateDiagram machine={machine} selectedStateId={selectedStateId} onMoveState={moveState} onSelectState={setSelectedStateId} />
      <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.15fr)', marginTop: 14 }}>
        <CompactTable label="FSM state table"><div style={{ borderBottom: PANEL_BORDER, color: '#334155', fontSize: 10, fontWeight: 850, letterSpacing: '.09em', padding: '10px 12px', textTransform: 'uppercase' }}>State table</div><table style={{ borderCollapse: 'collapse', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 10, width: '100%' }}><thead><tr>{stateHeaders.map(header => <th key={header.id} style={{ background: '#f8fafc', borderBottom: PANEL_BORDER, color: '#64748b', padding: 7, textAlign: 'left' }}>{header.label}</th>)}</tr></thead><tbody>{stateTable.map((row, index) => <tr key={`${row.presentCode}-${row.input}`} style={{ background: row.unused ? '#fff7ed' : index % 2 ? '#fbfdff' : '#ffffff', color: row.unused ? '#c2410c' : '#334155' }}><td style={{ padding: 7 }}>{row.presentState}</td><td style={{ padding: 7 }}>{row.presentCode}</td><td style={{ padding: 7 }}>{row.input}</td><td style={{ padding: 7 }}>{row.nextState}</td><td style={{ padding: 7 }}>{row.nextCode}</td><td style={{ padding: 7 }}>{row.output}</td></tr>)}</tbody></table></CompactTable>
        <CompactTable label="FSM excitation table"><div style={{ borderBottom: PANEL_BORDER, color: '#334155', fontSize: 10, fontWeight: 850, letterSpacing: '.09em', padding: '10px 12px', textTransform: 'uppercase' }}>{flipFlop} excitation matrix</div><table style={{ borderCollapse: 'collapse', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 10, width: '100%' }}><thead><tr>{['PS', machine.inputName, ...Object.keys(excitationTable[0]?.signals ?? {})].map((header, index) => <th key={`excitation-${index}-${header}`} style={{ background: '#f8fafc', borderBottom: PANEL_BORDER, color: '#64748b', padding: 7, textAlign: 'left' }}>{header}</th>)}</tr></thead><tbody>{excitationTable.map((row, index) => <tr key={`${row.presentCode}-${row.input}`} style={{ background: row.unused ? '#fff7ed' : index % 2 ? '#fbfdff' : '#ffffff', color: row.unused ? '#c2410c' : '#334155' }}><td style={{ padding: 7 }}>{row.presentCode}</td><td style={{ padding: 7 }}>{row.input}</td>{Object.values(row.signals).map((value, signalIndex) => <td key={signalIndex} style={{ padding: 7 }}>{value}</td>)}</tr>)}</tbody></table></CompactTable>
      </div>
    </main>
    <aside style={{ background: '#fbfdff', borderLeft: PANEL_BORDER, minWidth: 0, padding: 16 }}>
      <div style={{ color: '#334155', fontSize: 10, fontWeight: 850, letterSpacing: '.1em', textTransform: 'uppercase' }}>Minimized equations</div>
      <div style={{ color: '#64748b', fontSize: 10, lineHeight: 1.45, margin: '7px 0 12px' }}>Excitation rows are minimized through the K-Map engine; unused encodings remain don’t-cares.</div>
      <div style={{ display: 'grid', gap: 7 }}>{equations.length ? equations.map(equation => <div key={equation.signal} style={{ background: '#ffffff', border: '1px solid #dbeafe', borderRadius: 8, fontSize: 13, overflowX: 'auto', padding: '4px 8px' }}><BlockMath math={equation.latex} /></div>) : <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, color: '#92400e', fontSize: 11, lineHeight: 1.5, padding: 10 }}>The selected encoding exceeds the five-variable K-Map limit. Choose Binary or Gray encoding, or reduce the state count.</div>}</div>
      {equations.length > 0 && <DerivationSteps equations={equations} flipFlop={flipFlop} />}
      <div style={{ alignItems: 'center', display: 'flex', justifyContent: 'space-between', marginTop: 17 }}><div style={{ color: '#334155', fontSize: 10, fontWeight: 850, letterSpacing: '.1em', textTransform: 'uppercase' }}>Generated Verilog</div><button type="button" onClick={copyVerilog} style={{ background: '#ffffff', border: '1px solid #bfdbfe', borderRadius: 6, color: '#1d4ed8', cursor: 'pointer', fontSize: 10, fontWeight: 850, padding: '6px 8px' }}>{copied ? 'Copied' : 'Copy'}</button></div>
      <pre aria-label="Generated Verilog" style={{ background: '#0f172a', borderRadius: 8, color: '#e2e8f0', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 10, lineHeight: 1.45, margin: '9px 0 0', maxHeight: 330, overflow: 'auto', padding: 11, whiteSpace: 'pre' }}><code>{verilog}</code></pre>
      <div style={{ color: '#64748b', fontSize: 10, marginTop: 11 }}><InlineMath math="\\text{3 always blocks: state, next state, output}" /></div>
    </aside>
  </section>;
}
