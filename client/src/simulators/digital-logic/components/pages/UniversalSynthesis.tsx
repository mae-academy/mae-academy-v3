/**
 * Luminous Technical Atelier — white academic derivation card, restrained signal color,
 * and a read-only schematic generated only from the pure synthesis-engine result.
 */
import { BlockMath, InlineMath } from 'react-katex';
import 'katex/dist/katex.min.css';
import { useEffect, useMemo, useState } from 'react';
import { deriveUniversalSynthesis, type SynthesisDerivation, type SynthesisDiagramNode, type SynthesisMode } from '../../engine/synthesisEngine';

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

interface DiagramPoint { x: number; y: number; node: SynthesisDiagramNode; }

function gateShape(node: SynthesisDiagramNode, x: number, y: number) {
  if (node.kind === 'input') return <><rect x={x - 25} y={y - 12} width="42" height="24" rx="4" fill="#ffffff" stroke="#1a2744" strokeWidth="2" /><text x={x - 4} y={y + 4} textAnchor="middle" fill="#1a2744" fontSize="10" fontWeight="800">{node.label}</text><line x1={x + 17} y1={y} x2={x + 30} y2={y} stroke="#1a2744" strokeWidth="2" /></>;
  if (node.kind === 'output') return <><line x1={x - 30} y1={y} x2={x - 17} y2={y} stroke="#1a2744" strokeWidth="2" /><rect x={x - 17} y={y - 12} width="42" height="24" rx="4" fill="#ffffff" stroke="#1a2744" strokeWidth="2" /><text x={x + 4} y={y + 4} textAnchor="middle" fill="#1a2744" fontSize="10" fontWeight="800">{node.label}</text></>;
  return <>
    <line x1={x - 35} y1={y - 15} x2={x - 22} y2={y - 15} stroke="#1a2744" strokeWidth="2" />
    <line x1={x - 35} y1={y + 15} x2={x - 22} y2={y + 15} stroke="#1a2744" strokeWidth="2" />
    <path d={`M ${x - 22} ${y - 23} H ${x + 2} A 23 23 0 0 1 ${x + 2} ${y + 23} H ${x - 22} Z`} fill="#ffffff" stroke="#1a2744" strokeWidth="2" />
    <circle cx={x + 30} cy={y} r="4" fill="#ffffff" stroke="#1a2744" strokeWidth="2" />
    <line x1={x + 34} y1={y} x2={x + 45} y2={y} stroke="#1a2744" strokeWidth="2" strokeLinecap="round" />
  </>;
}

/** Read-only educational schematic; its topology originates in synthesisEngine, never UI inference. */
function UniversalGateDiagram({ derivation }: { derivation: SynthesisDerivation }) {
  const { diagram } = derivation;
  const points = useMemo(() => {
    const result = new Map<string, DiagramPoint>();
    [0, 1, 2, 3, 4].forEach(layer => {
      const nodes = diagram.nodes.filter(node => node.layer === layer);
      nodes.forEach((node, index) => result.set(node.id, { node, x: 45 + layer * 146, y: 44 + index * 58 }));
    });
    return result;
  }, [diagram.nodes]);
  const height = Math.max(154, ...Array.from(points.values()).map(point => point.y + 42));
  const incomingWires = useMemo(() => diagram.wires.reduce<Map<string, string[]>>((map, wire) => {
    map.set(wire.to, [...(map.get(wire.to) ?? []), wire.from]);
    return map;
  }, new Map()), [diagram.wires]);

  const sourceAnchor = (point: DiagramPoint) => point.node.kind === 'gate' ? { x: point.x + 45, y: point.y } : point.node.kind === 'input' ? { x: point.x + 30, y: point.y } : { x: point.x + 25, y: point.y };
  const targetAnchor = (point: DiagramPoint, wireIndex: number) => {
    if (point.node.kind !== 'gate') return { x: point.x - 30, y: point.y };
    const count = incomingWires.get(point.node.id)?.length ?? 1;
    const offset = count <= 1 ? 0 : count === 2 ? [-15, 15][wireIndex] : ((wireIndex / (count - 1)) * 30 - 15);
    return { x: point.x - 35, y: point.y + offset };
  };

  return <svg role="img" aria-label={`${diagram.mode}-only gate schematic`} viewBox={`0 0 650 ${height}`} style={{ display: 'block', height: 'auto', minWidth: 560, width: '100%' }}>
    <defs><pattern id="synthesis-grid" width="18" height="18" patternUnits="userSpaceOnUse"><path d="M 18 0 L 0 0 0 18" fill="none" stroke="#dbe5ef" strokeWidth=".7" /></pattern></defs>
    <rect width="650" height={height} fill="url(#synthesis-grid)" />
    {diagram.wires.map((wire, index) => {
      const from = points.get(wire.from);
      const to = points.get(wire.to);
      if (!from || !to) return null;
      const source = sourceAnchor(from);
      const target = targetAnchor(to, diagram.wires.slice(0, index).filter(previous => previous.to === wire.to).length);
      const midpoint = source.x + (target.x - source.x) * .48;
      return <path key={`${wire.from}-${wire.to}-${index}`} d={`M ${source.x} ${source.y} H ${midpoint} V ${target.y} H ${target.x}`} fill="none" stroke="#64748b" strokeWidth="1.2" />;
    })}
    {Array.from(points.values()).map(point => <g key={point.node.id}>{gateShape(point.node, point.x, point.y)}</g>)}
    <text x="16" y={height - 12} fill="#64748b" fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace" fontSize="9">READ-ONLY {diagram.mode} IMPLEMENTATION</text>
  </svg>;
}

/** Pedagogical Universal Synthesis page over the pure AST/QMC-independent derivation engine. */
export function UniversalSynthesis() {
  const [mode, setMode] = useState<SynthesisMode>('NAND');
  const [expression, setExpression] = useState(EXAMPLES.NAND);
  const [lastValid, setLastValid] = useState<SynthesisDerivation>(() => deriveUniversalSynthesis(EXAMPLES.NAND, 'NAND'));
  const [error, setError] = useState<string | null>(null);
  const debouncedExpression = useDebouncedValue(expression, 300);

  useEffect(() => {
    try {
      const result = deriveUniversalSynthesis(debouncedExpression, mode);
      setLastValid(result);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to derive this expression.');
    }
  }, [debouncedExpression, mode]);

  const chooseMode = (nextMode: SynthesisMode) => {
    if (nextMode === mode) return;
    setMode(nextMode);
    if (expression === EXAMPLES[mode]) setExpression(EXAMPLES[nextMode]);
  };

  return <section aria-label="Universal Synthesis" style={{ border: '1px solid #e2e8f0', borderRadius: 14, background: '#ffffff', color: '#0f172a', overflow: 'hidden', boxShadow: '0 10px 28px rgba(15, 23, 42, .08)' }}>
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.05fr) minmax(270px, .95fr)', gap: 18, padding: 22 }}>
      <div>
        <label htmlFor="synthesis-expression" style={{ color: '#334155', display: 'block', fontSize: 11, fontWeight: 800, letterSpacing: '.08em', marginBottom: 8, textTransform: 'uppercase' }}>Boolean expression</label>
        <input id="synthesis-expression" value={expression} onChange={event => setExpression(event.target.value)} spellCheck={false} placeholder="e.g. A*B + C*D" aria-describedby="synthesis-hint synthesis-error" style={{ background: error ? '#fff8f8' : '#ffffff', border: `1px solid ${error ? '#fda4af' : '#cbd5e1'}`, borderRadius: 10, boxSizing: 'border-box', color: '#0f172a', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 15, fontWeight: 700, outline: 'none', padding: '12px 13px', width: '100%' }} />
        <div role="group" aria-label="Universal gate type" style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          {(['NAND', 'NOR'] as const).map(candidate => <button key={candidate} type="button" onClick={() => chooseMode(candidate)} aria-pressed={candidate === mode} style={{ background: candidate === mode ? '#eff6ff' : '#ffffff', border: `1px solid ${candidate === mode ? '#bfdbfe' : '#dbe3ef'}`, borderRadius: 7, color: candidate === mode ? '#1d4ed8' : '#475569', cursor: 'pointer', fontSize: 12, fontWeight: 850, padding: '8px 11px' }}>Convert to All-{candidate}</button>)}
        </div>
        <p id="synthesis-hint" style={{ color: '#64748b', fontSize: 11, lineHeight: 1.5, margin: '10px 0 0' }}>All-NAND accepts SOP; All-NOR accepts POS. Use <strong>*, +, ~, !</strong>, or postfix <strong>'</strong>/<strong>′</strong>. The last valid derivation remains visible while the source is corrected.</p>
        {error && <p id="synthesis-error" role="alert" style={{ color: '#be123c', fontSize: 12, fontWeight: 700, margin: '8px 0 0' }}>Invalid Synthesis Source — {error}</p>}
      </div>
      <div style={{ background: '#f8fbff', border: '1px solid #dbeafe', borderRadius: 10, minHeight: 148, overflowX: 'auto', padding: '9px 13px' }}>
        <div style={{ color: '#2563eb', fontSize: 9, fontWeight: 850, letterSpacing: '.13em', textTransform: 'uppercase' }}>Source → universal logic</div>
        <div style={{ color: '#0f172a', fontSize: 16, marginTop: 2 }}><BlockMath math={`F = ${lastValid.originalLatex}`} /></div>
        <div style={{ borderTop: '1px solid #dbeafe', color: '#64748b', fontSize: 10, lineHeight: 1.45, marginTop: 2, paddingTop: 8 }}>The derivation retains the AST grouping, then applies double negation and De Morgan’s law in a traceable sequence.</div>
      </div>
    </div>

    <div style={{ borderTop: '1px solid #eef2f7', padding: '18px 22px 22px' }}>
      <div style={{ alignItems: 'center', display: 'flex', gap: 10, marginBottom: 14 }}><div style={{ background: 'linear-gradient(90deg, #2563eb, #8b5cf6, #f43f5e)', height: 2, width: 36 }} /><div style={{ color: '#334155', fontSize: 10, fontWeight: 850, letterSpacing: '.11em', textTransform: 'uppercase' }}>Pedagogical derivation</div></div>
      <ol style={{ display: 'grid', gap: 12, listStyle: 'none', margin: 0, padding: 0 }}>
        {lastValid.steps.map((step, index) => <li key={step.title} style={{ display: 'grid', gap: 12, gridTemplateColumns: '34px minmax(0, 1fr)' }}>
          <div style={{ alignItems: 'center', alignSelf: 'stretch', display: 'flex', flexDirection: 'column', gap: 5 }}><span style={{ alignItems: 'center', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 999, color: '#1d4ed8', display: 'inline-flex', fontSize: 10, fontWeight: 850, height: 28, justifyContent: 'center', width: 28 }}>{index + 1}</span>{index < lastValid.steps.length - 1 && <span style={{ background: '#dbeafe', flex: 1, width: 1 }} />}</div>
          <article style={{ background: '#fbfdff', border: '1px solid #e2e8f0', borderRadius: 10, minWidth: 0, padding: '12px 14px' }}>
            <h3 style={{ color: '#0f172a', fontSize: 14, fontWeight: 850, margin: 0 }}>{step.title}</h3>
            <p style={{ color: '#64748b', fontSize: 12, lineHeight: 1.5, margin: '5px 0 9px' }}>{step.description}</p>
            <div style={{ borderLeft: '2px solid #bfdbfe', color: '#0f172a', fontSize: 16, overflowX: 'auto', padding: '4px 12px' }}><BlockMath math={step.latexEquation} /></div>
          </article>
        </li>)}
      </ol>

      <section aria-label="Read-only universal gate schematic" style={{ background: '#fbfdff', border: '1px solid #e2e8f0', borderRadius: 12, marginTop: 18, overflowX: 'auto', padding: 15 }}>
        <div style={{ alignItems: 'baseline', display: 'flex', gap: 8, justifyContent: 'space-between', marginBottom: 12 }}><div style={{ color: '#334155', fontSize: 10, fontWeight: 850, letterSpacing: '.11em', textTransform: 'uppercase' }}>Read-only schematic</div><InlineMath math={`\\text{All-}${lastValid.mode}`} /></div>
        <UniversalGateDiagram derivation={lastValid} />
      </section>
    </div>
  </section>;
}
