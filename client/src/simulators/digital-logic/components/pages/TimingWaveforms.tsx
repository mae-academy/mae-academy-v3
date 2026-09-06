/** Timing Waveforms — tick-based interactive SVG viewer backed only by the pure timing engine. */
import { BlockMath, InlineMath } from 'react-katex';
import 'katex/dist/katex.min.css';
import { useEffect, useMemo, useState } from 'react';
import { WaveformTrack } from '@/simulators/digital-logic/components/ui-components/WaveformTrack';
import { createClockWaveform, evaluateTimingWaveforms, extendWaveform, type WaveformValue } from '../../engine/timingEngine';
import { parseBooleanExpression } from '@/simulators/digital-logic/engine/logicEngine';

const INITIAL_EXPRESSION = 'A ^ B';
const INITIAL_TICKS = 12;
const TICK_WIDTH = 48;
const TRACK_HEIGHT = 48;
const PLOT_TOP = 28;

const inputValues = (variable: string, tickCount: number): WaveformValue[] => Array.from({ length: tickCount }, (_, tick) => variable === 'A' ? (tick === 3 || tick === 4 || tick === 8 ? 1 : 0) : variable === 'B' ? (tick === 5 || tick === 8 || tick === 9 ? 1 : 0) : 0);

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs, value]);
  return debounced;
}

interface ValidExpression { source: string; latex: string; variables: string[]; }

/** Interactive input tracks and read-only propagated output for Boolean timing study. */
export function TimingWaveforms() {
  const [expression, setExpression] = useState(INITIAL_EXPRESSION);
  const [lastValidExpression, setLastValidExpression] = useState<ValidExpression>(() => {
    const parsed = parseBooleanExpression(INITIAL_EXPRESSION);
    return { source: INITIAL_EXPRESSION, latex: parsed.latex, variables: parsed.variables };
  });
  const [inputData, setInputData] = useState<Record<string, WaveformValue[]>>(() => ({ A: inputValues('A', INITIAL_TICKS), B: inputValues('B', INITIAL_TICKS) }));
  const [tickCount, setTickCount] = useState(INITIAL_TICKS);
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [expressionError, setExpressionError] = useState<string | null>(null);
  const debouncedExpression = useDebouncedValue(expression, 300);

  useEffect(() => {
    try {
      const parsed = parseBooleanExpression(debouncedExpression);
      const next: ValidExpression = { source: debouncedExpression, latex: parsed.latex, variables: parsed.variables };
      setLastValidExpression(next);
      setInputData(current => Object.fromEntries(next.variables.map(variable => [variable, (current[variable] ?? inputValues(variable, tickCount)).slice(0, tickCount)])));
      setExpressionError(null);
    } catch (error) {
      setExpressionError(error instanceof Error ? error.message : 'Invalid timing expression.');
    }
  }, [debouncedExpression, tickCount]);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => setPlayhead(current => (current + 1) % Math.max(1, tickCount)), 550);
    return () => window.clearInterval(timer);
  }, [playing, tickCount]);

  const clock = useMemo(() => createClockWaveform(tickCount), [tickCount]);
  const inputTracks = useMemo(() => lastValidExpression.variables.map(variable => ({ name: variable, type: 'input' as const, data: inputData[variable] ?? inputValues(variable, tickCount) })), [inputData, lastValidExpression.variables, tickCount]);
  const timing = useMemo(() => evaluateTimingWaveforms(lastValidExpression.source, inputTracks, clock, { delayTicks: 1, outputName: 'F' }), [clock, inputTracks, lastValidExpression.source]);
  const plotWidth = Math.max(560, tickCount * TICK_WIDTH);
  const plotHeight = PLOT_TOP + (inputTracks.length + 2) * TRACK_HEIGHT;
  const outputY = PLOT_TOP + (inputTracks.length + 1) * TRACK_HEIGHT;

  const toggleInputTick = (variable: string, tick: number) => setInputData(current => ({
    ...current,
    [variable]: (current[variable] ?? inputValues(variable, tickCount)).map((value, index) => index === tick ? value === 0 ? 1 : 0 : value),
  }));
  const addCycle = () => {
    setTickCount(current => current + 1);
    setInputData(current => Object.fromEntries(Object.entries(current).map(([name, data]) => [name, extendWaveform({ name, type: 'input', data }).data])));
  };
  const reset = () => {
    setTickCount(INITIAL_TICKS);
    setPlayhead(0);
    setPlaying(false);
    setInputData(Object.fromEntries(lastValidExpression.variables.map(variable => [variable, inputValues(variable, INITIAL_TICKS)])));
  };

  return <section aria-label="Timing Waveforms" style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 14, boxShadow: '0 10px 28px rgba(15, 23, 42, .08)', color: '#0f172a', overflow: 'hidden' }}>
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(260px, .85fr)', gap: 18, padding: 22 }}>
      <div>
        <label htmlFor="timing-expression" style={{ color: '#334155', display: 'block', fontSize: 11, fontWeight: 800, letterSpacing: '.08em', marginBottom: 8, textTransform: 'uppercase' }}>Boolean expression</label>
        <input id="timing-expression" value={expression} onChange={event => setExpression(event.target.value)} spellCheck={false} placeholder="e.g. A ^ B" aria-describedby="timing-expression-help timing-expression-error" style={{ background: expressionError ? '#fff8f8' : '#ffffff', border: `1px solid ${expressionError ? '#fda4af' : '#cbd5e1'}`, borderRadius: 10, boxSizing: 'border-box', color: '#0f172a', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 15, fontWeight: 700, outline: 'none', padding: '12px 13px', width: '100%' }} />
        <p id="timing-expression-help" style={{ color: '#64748b', fontSize: 11, lineHeight: 1.5, margin: '8px 0 0' }}>Input tracks are generated from the variables in the expression. Click an input interval to toggle <InlineMath math={'0 \\leftrightarrow 1'} />; output <InlineMath math="F" /> is read-only and delayed by one tick.</p>
        {expressionError && <p id="timing-expression-error" role="alert" style={{ color: '#be123c', fontSize: 12, fontWeight: 700, margin: '8px 0 0' }}>Invalid Timing Expression — {expressionError}</p>}
        <div role="group" aria-label="Timing controls" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 13 }}>
          <button type="button" onClick={() => setPlaying(current => !current)} style={{ background: playing ? '#eff6ff' : '#ffffff', border: '1px solid #bfdbfe', borderRadius: 7, color: '#1d4ed8', cursor: 'pointer', fontSize: 12, fontWeight: 850, padding: '8px 11px' }}>{playing ? 'Pause' : 'Play'}</button>
          <button type="button" onClick={reset} style={{ background: '#ffffff', border: '1px solid #dbe3ef', borderRadius: 7, color: '#475569', cursor: 'pointer', fontSize: 12, fontWeight: 850, padding: '8px 11px' }}>Reset</button>
          <button type="button" onClick={addCycle} style={{ background: '#ffffff', border: '1px solid #dbe3ef', borderRadius: 7, color: '#475569', cursor: 'pointer', fontSize: 12, fontWeight: 850, padding: '8px 11px' }}>Add Cycle</button>
          <span style={{ alignItems: 'center', color: '#64748b', display: 'inline-flex', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 10, fontWeight: 800, padding: '0 4px' }}>{tickCount} TICKS · Δt = 1</span>
        </div>
      </div>
      <div style={{ background: '#f8fbff', border: '1px solid #dbeafe', borderRadius: 10, minHeight: 143, overflowX: 'auto', padding: '9px 13px' }}>
        <div style={{ color: '#2563eb', fontSize: 9, fontWeight: 850, letterSpacing: '.13em', textTransform: 'uppercase' }}>Timing definition → academic notation</div>
        <div style={{ color: '#0f172a', fontSize: 16, marginTop: 1 }}><BlockMath math={`F = ${lastValidExpression.latex}`} /></div>
        <div style={{ borderTop: '1px solid #dbeafe', color: '#64748b', fontSize: 10, lineHeight: 1.45, marginTop: 2, paddingTop: 8 }}>CLK samples regular tick intervals. Light dashed guides descend from each rising edge; output commits one cycle after its evaluated input state.</div>
      </div>
    </div>

    <div style={{ borderTop: '1px solid #eef2f7', padding: '17px 22px 22px' }}>
      <div style={{ alignItems: 'center', display: 'flex', gap: 9, marginBottom: 12 }}><div style={{ background: 'linear-gradient(90deg, #2563eb, #8b5cf6, #f43f5e)', height: 2, width: 32 }} /><div style={{ color: '#334155', fontSize: 10, fontWeight: 850, letterSpacing: '.11em', textTransform: 'uppercase' }}>Tick waveform canvas</div></div>
      <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, display: 'grid', gridTemplateColumns: '94px minmax(0, 1fr)', minHeight: plotHeight + 22, overflow: 'hidden' }}>
        <div aria-label="Waveform labels" style={{ background: '#f8fafc', borderRight: '1px solid #e2e8f0', paddingTop: PLOT_TOP + 1 }}>
          {[clock, ...inputTracks, timing.output].map((track, index) => <div key={track.name} style={{ alignItems: 'center', borderBottom: index === inputTracks.length + 1 ? 'none' : '1px solid #eef2f7', color: track.type === 'output' ? '#1d4ed8' : '#475569', display: 'flex', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12, fontWeight: 850, height: TRACK_HEIGHT, justifyContent: 'center' }}><InlineMath math={track.name} /></div>)}
        </div>
        <div style={{ overflowX: 'auto', position: 'relative' }}>
          <svg role="img" aria-label="Interactive timing waveform canvas" viewBox={`0 0 ${plotWidth} ${plotHeight + 18}`} style={{ display: 'block', height: plotHeight + 18, minWidth: plotWidth, width: plotWidth }}>
            <defs><pattern id="timing-grid" width={TICK_WIDTH} height={TRACK_HEIGHT} patternUnits="userSpaceOnUse"><path d={`M ${TICK_WIDTH} 0 L 0 0 0 ${TRACK_HEIGHT}`} fill="none" stroke="#eef2f7" strokeWidth="1" /></pattern></defs>
            <rect width={plotWidth} height={plotHeight + 18} fill="url(#timing-grid)" />
            {Array.from({ length: tickCount + 1 }, (_, tick) => <text key={`tick-${tick}`} x={tick * TICK_WIDTH + 4} y="14" fill="#94a3b8" fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace" fontSize="9">{tick}</text>)}
            {timing.risingEdges.map(tick => <line key={`edge-${tick}`} x1={tick * TICK_WIDTH} y1="18" x2={tick * TICK_WIDTH} y2={plotHeight} stroke="#94a3b8" strokeDasharray="4 4" strokeWidth="1" />)}
            <line x1={playhead * TICK_WIDTH + TICK_WIDTH / 2} y1="18" x2={playhead * TICK_WIDTH + TICK_WIDTH / 2} y2={plotHeight} stroke="#f43f5e" strokeWidth="1.5" />
            <WaveformTrack waveform={clock} y={PLOT_TOP} tickWidth={TICK_WIDTH} width={plotWidth} />
            {inputTracks.map((track, index) => <WaveformTrack key={track.name} waveform={track} y={PLOT_TOP + (index + 1) * TRACK_HEIGHT} tickWidth={TICK_WIDTH} width={plotWidth} interactive onToggleTick={tick => toggleInputTick(track.name, tick)} />)}
            <WaveformTrack waveform={timing.output} y={outputY} tickWidth={TICK_WIDTH} width={plotWidth} hazards={timing.hazards} />
          </svg>
        </div>
      </div>
      <div style={{ color: '#64748b', display: 'flex', flexWrap: 'wrap', fontSize: 10, gap: 14, marginTop: 10 }}><span><b style={{ color: '#334155' }}>CLK guides</b> · rising edges</span><span><b style={{ color: '#1d4ed8' }}>F</b> · delayed output</span><span><b style={{ color: '#b45309' }}>amber region</b> · detected glitch</span><span><b style={{ color: '#b91c1c' }}>red region</b> · unknown / high impedance</span></div>
    </div>
  </section>;
}
