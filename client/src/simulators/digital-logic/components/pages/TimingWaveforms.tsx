/** Timing Waveforms — tick-based interactive SVG viewer backed by the timing engine. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Play, Pause, RotateCcw, Plus } from 'lucide-react';
import { KatexMath } from '@/components/ui/KatexMath';
import { StudioButton } from '@/components/common/templates';
import { WaveformTrack } from '@/simulators/digital-logic/components/ui-components/WaveformTrack';
import { createClockWaveform, extendWaveform, type WaveformValue } from '@shared/logic/timingTypes';
import { evaluateTimingRemote } from '@/services/logicClient';
import { useRemoteQuery as useLogicQuery } from '@/lib/useRemoteQuery';
import { parseBooleanExpression } from '@shared/logic/logicEngine';

const INITIAL_EXPRESSION = 'A ^ B';
const INITIAL_TICKS = 12;
const TICK_WIDTH = 48;
const TRACK_HEIGHT = 48;
const PLOT_TOP = 52;
const LABEL_WIDTH = 64;

const inputValues = (variable: string, tickCount: number): WaveformValue[] =>
  Array.from({ length: tickCount }, (_, tick) =>
    variable === 'A'
      ? tick === 3 || tick === 4 || tick === 8
        ? 1
        : 0
      : variable === 'B'
      ? tick === 5 || tick === 8 || tick === 9
        ? 1
        : 0
      : 0,
  );

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs, value]);
  return debounced;
}

interface ValidExpression {
  source: string;
  latex: string;
  variables: string[];
}

/** Never throws: an unparsable shared expression (mid-edit or stale) falls back to the demo. */
const initialValidExpression = (source: string | undefined): ValidExpression => {
  for (const candidate of [source, INITIAL_EXPRESSION]) {
    if (!candidate) continue;
    try {
      const parsed = parseBooleanExpression(candidate);
      return { source: candidate, latex: parsed.latex, variables: parsed.variables };
    } catch {
      // try the next candidate
    }
  }
  return { source: INITIAL_EXPRESSION, latex: 'A \\oplus B', variables: ['A', 'B'] };
};

const trackLabelMath = (name: string) => (name.length > 1 ? `\\mathrm{${name}}` : name);

export interface TimingWaveformsProps {
  expression?: string;
  onExpressionChange?: (expression: string) => void;
}

/** Interactive input tracks and read-only propagated output for Boolean timing study. */
export function TimingWaveforms({ expression: controlledExpr, onExpressionChange }: TimingWaveformsProps) {
  const [expression, setExpression] = useState(controlledExpr ?? INITIAL_EXPRESSION);
  const [lastValidExpression, setLastValidExpression] = useState<ValidExpression>(() => initialValidExpression(controlledExpr));
  const [inputData, setInputData] = useState<Record<string, WaveformValue[]>>(() => ({
    A: inputValues('A', INITIAL_TICKS),
    B: inputValues('B', INITIAL_TICKS),
  }));
  const [tickCount, setTickCount] = useState(INITIAL_TICKS);
  const [playhead, setPlayhead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [expressionError, setExpressionError] = useState<string | null>(null);
  const debouncedExpression = useDebouncedValue(expression, 300);

  useEffect(() => {
    if (controlledExpr !== undefined && controlledExpr !== expression) {
      setExpression(controlledExpr);
    }
  }, [controlledExpr]);

  useEffect(() => {
    try {
      const parsed = parseBooleanExpression(debouncedExpression);
      const next: ValidExpression = {
        source: debouncedExpression,
        latex: parsed.latex,
        variables: parsed.variables,
      };
      setLastValidExpression(next);
      setInputData((current) =>
        Object.fromEntries(
          next.variables.map((variable) => [
            variable,
            (current[variable] ?? inputValues(variable, tickCount)).slice(0, tickCount),
          ]),
        ),
      );
      setExpressionError(null);
    } catch (error) {
      setExpressionError(error instanceof Error ? error.message : 'Invalid timing expression.');
    }
  }, [debouncedExpression, tickCount]);

  useEffect(() => {
    if (!playing) return undefined;
    let animationFrameId: number;
    let lastTime = performance.now();

    const sweepSpeed = 1 / 0.55; // ticks per second (continuous sweep matching 550ms per tick)

    const animate = (currentTime: number) => {
      const deltaSeconds = Math.min(0.1, (currentTime - lastTime) / 1000);
      lastTime = currentTime;
      setPlayhead((current) => {
        const next = current + deltaSeconds * sweepSpeed;
        return next >= tickCount ? next % tickCount : next;
      });
      animationFrameId = requestAnimationFrame(animate);
    };

    animationFrameId = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrameId);
  }, [playing, tickCount]);

  const clock = useMemo(() => createClockWaveform(tickCount), [tickCount]);
  const inputTracks = useMemo(
    () =>
      lastValidExpression.variables.map((variable) => ({
        name: variable,
        type: 'input' as const,
        data: inputData[variable] ?? inputValues(variable, tickCount),
      })),
    [inputData, lastValidExpression.variables, tickCount],
  );
  // Timing and hazard analysis runs on the serverless engine; a flat output shows until the first answer.
  const flat = useMemo(() => ({ output: { name: 'F', type: 'output' as const, data: Array<WaveformValue>(tickCount).fill(0) }, risingEdges: [] as number[], hazards: [] as { tick: number; kind: 'static' | 'dynamic'; transientValues: Array<0 | 1> }[] }), [tickCount]);
  const timingQuery = useLogicQuery(
    JSON.stringify([lastValidExpression.source, inputTracks, clock.data]),
    signal => evaluateTimingRemote(lastValidExpression.source, inputTracks, clock, { delayTicks: 1, outputName: 'F' }, signal),
  );
  // Input tracks lag one render behind a variable-set change (the engine then rejects the request): show a flat output meanwhile.
  const timing = !timingQuery.error && timingQuery.data && timingQuery.data.output.data.length === tickCount ? timingQuery.data : flat;
  // Ticks stretch to fill the drawer width; they only fall back to horizontal scroll below TICK_WIDTH.
  const canvasHostRef = useRef<HTMLDivElement>(null);
  const [hostWidth, setHostWidth] = useState(0);
  useEffect(() => {
    const host = canvasHostRef.current;
    if (!host || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(([entry]) => setHostWidth(entry.contentRect.width));
    observer.observe(host);
    return () => observer.disconnect();
  }, []);
  const tickWidth = Math.max(TICK_WIDTH, Math.floor((hostWidth - LABEL_WIDTH) / Math.max(1, tickCount)));
  const plotWidth = tickCount * tickWidth;
  const canvasWidth = LABEL_WIDTH + plotWidth;
  const plotHeight = PLOT_TOP + (inputTracks.length + 2) * TRACK_HEIGHT;
  const outputY = PLOT_TOP + (inputTracks.length + 1) * TRACK_HEIGHT;

  const toggleInputTick = (variable: string, tick: number) =>
    setInputData((current) => ({
      ...current,
      [variable]: (current[variable] ?? inputValues(variable, tickCount)).map((value, index) =>
        index === tick ? (value === 0 ? 1 : 0) : value,
      ),
    }));
  const addCycle = () => {
    setTickCount((current) => current + 1);
    setInputData((current) =>
      Object.fromEntries(
        Object.entries(current).map(([name, data]) => [
          name,
          extendWaveform({ name, type: 'input', data }).data,
        ]),
      ),
    );
  };
  const reset = () => {
    setTickCount(INITIAL_TICKS);
    setPlayhead(0);
    setPlaying(false);
    setInputData(
      Object.fromEntries(
        lastValidExpression.variables.map((variable) => [
          variable,
          inputValues(variable, INITIAL_TICKS),
        ]),
      ),
    );
  };

  const handleExpressionChange = (val: string) => {
    setExpression(val);
    onExpressionChange?.(val);
  };

  const sweepX = playhead * tickWidth;
  const currentTick = Math.min(tickCount - 1, Math.max(0, Math.floor(playhead)));

  const handlePlotClick = (e: React.MouseEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickedTick = Math.max(0, Math.min(tickCount - 1, Math.floor(clickX / tickWidth)));
    setPlayhead(clickedTick);
  };

  return (
    <section
      aria-label="Timing Waveforms"
      className="overflow-hidden rounded-xl border border-slate-200/80 bg-white/95 text-slate-900 shadow-sm dark:border-slate-800 dark:bg-slate-900/90 dark:text-white"
    >
      <div className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/80 pb-4 dark:border-slate-800/80">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mr-1">
              Timing Controls
            </span>
            <div role="group" aria-label="Timing controls" className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPlaying((current) => !current)}
                aria-label={playing ? 'Pause timing simulation' : 'Play timing simulation'}
                className="btn-active-brand inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium cursor-pointer whitespace-nowrap active:scale-95"
              >
                {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                <span>{playing ? 'Pause' : 'Play'}</span>
              </button>
              <StudioButton
                onClick={reset}
                title="Reset timing waveforms"
                aria-label="Reset"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Reset</span>
              </StudioButton>
              <StudioButton
                onClick={addCycle}
                title="Add Cycle"
                aria-label="Add Cycle"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Cycle</span>
              </StudioButton>
            </div>
          </div>
        </div>
        {expressionError && (
          <p
            id="timing-expression-error"
            role="alert"
            className="mt-3 text-xs font-bold text-rose-600 dark:text-rose-400"
          >
            Invalid Timing Expression — {expressionError}
          </p>
        )}
      </div>

      <div className="border-t border-slate-200 p-5 dark:border-slate-800">
        <div className="mb-3 flex items-center gap-2">
          <div className="h-0.5 w-8 bg-gradient-to-r from-blue-500 via-purple-500 to-rose-500" />
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
            Tick Waveform Canvas
          </div>
        </div>
        <div ref={canvasHostRef} className="w-full overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
          <svg
            role="img"
            aria-label="Interactive timing waveform canvas"
            viewBox={`0 0 ${canvasWidth} ${plotHeight + 18}`}
            preserveAspectRatio="xMinYMin meet"
            style={{ width: canvasWidth, height: plotHeight + 18 }}
            className="block"
          >
            {[clock, ...inputTracks, timing.output].map((track, index) => (
              <foreignObject key={`label-${track.name}`} x={0} y={PLOT_TOP + index * TRACK_HEIGHT - TRACK_HEIGHT / 2} width={LABEL_WIDTH} height={TRACK_HEIGHT}>
                <div
                  aria-label={`${track.name} track`}
                  className={`flex h-full items-center justify-center text-sm ${track.type === 'output' ? 'text-blue-600 dark:text-blue-400' : 'text-slate-700 dark:text-slate-300'}`}
                >
                  <KatexMath math={trackLabelMath(track.name)} />
                </div>
              </foreignObject>
            ))}
            <line x1={LABEL_WIDTH} y1={0} x2={LABEL_WIDTH} y2={plotHeight + 18} className="stroke-slate-200 dark:stroke-slate-800" strokeWidth="1" />
            <g transform={`translate(${LABEL_WIDTH}, 0)`}>
              <defs>
                <pattern id="timing-grid" width={tickWidth} height={TRACK_HEIGHT} patternUnits="userSpaceOnUse">
                  <path d={`M ${tickWidth} 0 L 0 0 0 ${TRACK_HEIGHT}`} fill="none" className="stroke-slate-100 dark:stroke-slate-800/50" strokeWidth="1" />
                </pattern>
              </defs>
              <rect
                width={plotWidth}
                height={plotHeight + 18}
                fill="url(#timing-grid)"
                className="cursor-crosshair"
                onClick={handlePlotClick}
              />
              {Array.from({ length: tickCount + 1 }, (_, tick) => (
                <text key={`tick-${tick}`} x={tick * tickWidth + 4} y="14" className="fill-slate-400 font-mono text-[9px]">
                  {tick}
                </text>
              ))}
              {timing.risingEdges.map((tick) => (
                <line
                  key={`edge-${tick}`}
                  x1={tick * tickWidth}
                  y1="18"
                  x2={tick * tickWidth}
                  y2={plotHeight}
                  className="stroke-slate-300 dark:stroke-slate-700"
                  strokeDasharray="4 4"
                  strokeWidth="1"
                />
              ))}
              {/* Continuous sweep line & active indicator */}
              <g className="pointer-events-none">
                <line
                  x1={sweepX}
                  y1="14"
                  x2={sweepX}
                  y2={plotHeight}
                  className="stroke-rose-500 dark:stroke-rose-400"
                  strokeWidth="2"
                />
                <polygon
                  points={`${sweepX - 4},12 ${sweepX + 4},12 ${sweepX},18`}
                  className="fill-rose-500 dark:fill-rose-400"
                />
              </g>
              <WaveformTrack waveform={clock} y={PLOT_TOP} tickWidth={tickWidth} width={plotWidth} />
              {inputTracks.map((track, index) => (
                <WaveformTrack
                  key={track.name}
                  waveform={track}
                  y={PLOT_TOP + (index + 1) * TRACK_HEIGHT}
                  tickWidth={tickWidth}
                  width={plotWidth}
                  interactive
                  onToggleTick={(tick) => toggleInputTick(track.name, tick)}
                />
              ))}
              <WaveformTrack
                waveform={timing.output}
                y={outputY}
                tickWidth={tickWidth}
                width={plotWidth}
                hazards={timing.hazards}
              />
            </g>
          </svg>
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-500 dark:text-slate-400">
          <span>
            <strong className="text-slate-700 dark:text-slate-200">CLK guides</strong> · rising edges
          </span>
          <span>
            <strong className="text-blue-600 dark:text-blue-400">F</strong> · delayed output
          </span>
          <span>
            <strong className="text-purple-600 dark:text-purple-400">purple region</strong> · hazard glitch
          </span>
          <span>
            <strong className="text-rose-600 dark:text-rose-400">red region</strong> · high impedance
          </span>
        </div>
      </div>
    </section>
  );
}
