/**
 * MAE Academy / Signals & Systems — Tab C Continuous Convolution Scope.
 * Vector SVG implementation adhering to the unified StandardStepPlot architecture.
 * Renders 3 tiers in pure SVG:
 * 1. tau-domain: x(tau) and shifted kernel h(t - tau) with impulse arrows
 * 2. Overlap area: shaded integrand product x(tau)*h(t - tau)
 * 3. t-domain: accumulated output y(t) = integral x(tau)*h(t - tau) dtau
 */
import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  useMemo,
  useCallback,
} from "react";
import { KatexMath } from "@/components/ui/KatexMath";
import {
  continuousConvolutionAt,
  type ContinuousConvolutionResult,
} from "@/features/signals/engines/convolutionEngine";
import {
  evaluateSignal,
  extractImpulseMarkers,
  type SignalNode,
} from "@/features/signals/engines/signalEngine";

type Props = {
  x: SignalNode;
  h: SignalNode;
  isPlaying: boolean;
  speed: number;
  onFrame: (result: ContinuousConvolutionResult) => void;
  onManualReadout: (result: ContinuousConvolutionResult) => void;
};

export type ConvolutionCanvasHandle = {
  setTime: (time: number) => void;
  nudge: (delta: number) => void;
  currentTime: () => number;
};

type Point = { time: number; value: number };

const RANGE = { from: -3, to: 3 };
const PAD = { top: 24, right: 28, bottom: 44, left: 48 };
const TICK_FONT = "'KaTeX_Main', 'KaTeX_Math', 'Times New Roman', serif";
const SCOPE_HEIGHT = 240;

/** Golden autoscale (SignalOperationsLab): symmetric about zero with 25% headroom so peaks never touch the border. */
function goldenYLimit(peak: number): number { return Math.min(20, Math.ceil(Math.max(peak, 1) * 1.25)); }

/** Golden round tick generator (PiecewiseSignalScope.getNiceTicks). */
function getNiceTicks(min: number, max: number, maxTicks = 6): number[] {
  const span = max - min; if (span <= 0) return [min];
  const roughStep = span / maxTicks; const power = Math.pow(10, Math.floor(Math.log10(roughStep))); const norm = roughStep / power;
  const step = norm < 1.5 ? power : norm < 3.5 ? 2 * power : norm < 7.5 ? 5 * power : 10 * power;
  const ticks: number[] = [];
  for (let val = Math.ceil((min - 1e-9) / step) * step; val <= max + step * 0.001; val += step) ticks.push(Math.abs(val) < 1e-9 ? 0 : Number(val.toFixed(6)));
  return ticks;
}

/** Golden frosted-glass pill tooltip shared by every tier. */
function HudPill({ left, top, children }: { left: number; top: number; children: React.ReactNode }) {
  return (
    <div
      className="absolute z-30 pointer-events-none px-3 py-1.5 rounded-xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200/80 dark:border-slate-800 shadow-xl text-xs space-y-1 transition-transform"
      style={{ left: `${left}px`, top: `${top}px` }}
    >
      {children}
    </div>
  );
}
const COLORS = { x: "#2563EB", h: "#E11D48", product: "#7C3AED", output: "#7C3AED" };

/** Splits continuous points into disconnected segments across sharp discontinuities */
function splitDiscontinuities(points: Point[], jumpThreshold = 1.35): Point[][] {
  const segments: Point[][] = [];
  let current: Point[] = [];
  for (let i = 0; i < points.length; i++) {
    const pt = points[i];
    if (i > 0 && Math.abs(pt.value - points[i - 1].value) > jumpThreshold) {
      if (current.length > 1) segments.push(current);
      current = [];
    }
    current.push(pt);
  }
  if (current.length > 1) segments.push(current);
  return segments;
}

/** Generates SVG path string from point segments */
function segmentsToPath(
  segments: Point[][],
  mapX: (t: number) => number,
  mapY: (v: number) => number
): string {
  return segments
    .map((seg) =>
      seg
        .map((pt, idx) => {
          const sx = mapX(pt.time).toFixed(1);
          const sy = mapY(pt.value).toFixed(1);
          return idx === 0 ? `M ${sx} ${sy}` : `L ${sx} ${sy}`;
        })
        .join(" ")
    )
    .join(" ");
}

/** Generates filled polygon path for shaded overlap area */
function shadedAreaPath(
  segments: Point[][],
  mapX: (t: number) => number,
  mapY: (v: number) => number,
  baselineY: number
): string {
  return segments
    .map((seg) => {
      if (!seg.length) return "";
      const startX = mapX(seg[0].time).toFixed(1);
      const endX = mapX(seg[seg.length - 1].time).toFixed(1);
      const curve = seg
        .map((pt) => `L ${mapX(pt.time).toFixed(1)} ${mapY(pt.value).toFixed(1)}`)
        .join(" ");
      return `M ${startX} ${baselineY.toFixed(1)} ${curve} L ${endX} ${baselineY.toFixed(1)} Z`;
    })
    .join(" ");
}

interface SvgScopeProps {
  titleKatex: string;
  xLabelKatex: string;
  amplitude: number;
  height?: number;
  badge?: React.ReactNode;
  hudContent?: (
    hover: { relX: number; relY: number; domainT: number },
    size: { width: number; height: number }
  ) => React.ReactNode;
  children: (props: {
    width: number;
    height: number;
    mapX: (t: number) => number;
    mapY: (v: number) => number;
    zeroY: number;
    hoverT: number | null;
  }) => React.ReactNode;
}

function SvgScopeTier({
  titleKatex,
  xLabelKatex,
  amplitude,
  height = SCOPE_HEIGHT,
  badge,
  hudContent,
  children,
}: SvgScopeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 500, height });
  const [hoverState, setHoverState] = useState<{
    relX: number;
    relY: number;
    domainT: number;
  } | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setSize({ width: rect.width, height: rect.height });
      }
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const plotW = Math.max(10, size.width - PAD.left - PAD.right);
  const plotH = Math.max(10, size.height - PAD.top - PAD.bottom);

  const mapX = useCallback(
    (t: number) => PAD.left + ((t - RANGE.from) / (RANGE.to - RANGE.from)) * plotW,
    [plotW]
  );
  const mapY = useCallback(
    (v: number) => PAD.top + (1 - (v + amplitude) / (2 * amplitude)) * plotH,
    [amplitude, plotH]
  );
  const zeroY = mapY(0);
  const yTicks = useMemo(() => getNiceTicks(-amplitude, amplitude, 6), [amplitude]);

  // Time grid ticks [-3, -2, -1, 0, 1, 2, 3]
  const timeTicks = useMemo(() => {
    const ticks: number[] = [];
    for (let t = RANGE.from; t <= RANGE.to; t += 1) {
      ticks.push(t);
    }
    return ticks;
  }, []);

  const handlePointer = (e: React.PointerEvent<SVGSVGElement>) => {
    const svgRect = e.currentTarget.getBoundingClientRect();
    const relX = e.clientX - svgRect.left;
    const relY = e.clientY - svgRect.top;
    if (
      relX < PAD.left ||
      relX > size.width - PAD.right ||
      relY < PAD.top ||
      relY > size.height - PAD.bottom
    ) {
      setHoverState(null);
      return;
    }
    const domainT = RANGE.from + ((relX - PAD.left) / plotW) * (RANGE.to - RANGE.from);
    setHoverState({
      relX,
      relY,
      domainT: Math.max(RANGE.from, Math.min(RANGE.to, domainT)),
    });
  };

  const handlePointerLeave = () => {
    setHoverState(null);
  };

  return (
    <div
      ref={containerRef}
      className="relative min-h-[240px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-inner dark:border-slate-800 dark:bg-[#07101e]"
      style={{ height }}
    >
      <svg
        className="stem-scope-svg absolute inset-0 h-full w-full select-none cursor-crosshair"
        onPointerMove={handlePointer}
        onPointerLeave={handlePointerLeave}
        onMouseMove={handlePointer}
        onMouseLeave={handlePointerLeave}
      >
        {/* Subtle dashed auxiliary vertical grid lines */}
        {timeTicks.map((t) => {
          if (t === 0) return null;
          const sx = mapX(t);
          return (
            <line
              key={`grid-x-${t}`}
              x1={sx}
              y1={PAD.top}
              x2={sx}
              y2={size.height - PAD.bottom}
              className="stroke-slate-300/40 dark:stroke-slate-700/40"
              strokeDasharray="3,3"
              strokeWidth={1}
            />
          );
        })}

        {/* Amplitude Grid ticks */}
        {yTicks.map((val, idx) => {
          const sy = mapY(val);
          const isZero = val === 0;
          return (
            <g key={`grid-y-${idx}`}>
              <line
                x1={PAD.left}
                y1={sy}
                x2={size.width - PAD.right}
                y2={sy}
                strokeDasharray={isZero ? undefined : "3 3"}
                className={
                  isZero
                    ? "stroke-slate-400 dark:stroke-slate-500"
                    : "stroke-slate-300/40 dark:stroke-slate-700/40"
                }
                strokeWidth={isZero ? "1.5" : "1"}
              />
              {!isZero && (
                <text
                  x={PAD.left - 10}
                  y={sy}
                  textAnchor="end"
                  dominantBaseline="central"
                  style={{ fontFamily: TICK_FONT }}
                  className="fill-slate-600 dark:fill-slate-300 text-[11px] font-medium"
                >
                  {val.toFixed(val % 1 === 0 ? 0 : 1)}
                </text>
              )}
            </g>
          );
        })}

        {/* Zero-Crossing Horizontal Axis (y = 0) */}
        <line
          x1={PAD.left}
          y1={zeroY}
          x2={size.width - PAD.right}
          y2={zeroY}
          className="stroke-slate-400 dark:stroke-slate-500"
          strokeWidth="1.5"
        />

        {/* Zero-Crossing Vertical Axis (x = 0) */}
        <line
          x1={mapX(0)}
          y1={PAD.top}
          x2={mapX(0)}
          y2={size.height - PAD.bottom}
          className="stroke-slate-400 dark:stroke-slate-500"
          strokeWidth="1.5"
        />

        {/* Time Axis numbers */}
        {timeTicks.map((t) => (
          <text
            key={`tick-num-${t}`}
            x={mapX(t)}
            y={size.height - PAD.bottom + 16}
            textAnchor="middle"
            style={{ fontFamily: TICK_FONT }}
            className="fill-slate-600 dark:fill-slate-300 text-[11px] font-medium"
          >
            {t}
          </text>
        ))}

        {/* Active pointer guideline */}
        {hoverState && (
          <line
            x1={mapX(hoverState.domainT)}
            y1={PAD.top}
            x2={mapX(hoverState.domainT)}
            y2={size.height - PAD.bottom}
            className="stroke-slate-400/80 dark:stroke-slate-500/80 stroke-1 stroke-dasharray-[2,2]"
            strokeWidth="1"
            strokeDasharray="2 2"
          />
        )}

        {/* Content Layer */}
        {children({
          width: size.width,
          height: size.height,
          mapX,
          mapY,
          zeroY,
          hoverT: hoverState?.domainT ?? null,
        })}
      </svg>

      {/* Header KaTeX Title */}
      <div className="pointer-events-none absolute left-3 top-2.5 flex items-center gap-2 rounded-md bg-white/90 px-2 py-0.5 text-xs font-bold text-slate-800 backdrop-blur-sm dark:bg-slate-900/90 dark:text-slate-200">
        <KatexMath math={titleKatex} />
      </div>

      {/* Optional Top-Right Badge */}
      {badge && (
        <div className="pointer-events-none absolute right-3 top-2.5 rounded-md border border-slate-200/80 bg-white/95 px-2 py-0.5 text-xs font-semibold text-slate-700 shadow-sm backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/95 dark:text-slate-300">
          {badge}
        </div>
      )}

      {/* Bottom-right Axis KaTeX Symbol */}
      <div className="pointer-events-none absolute bottom-2 right-3 rounded-md bg-white/90 px-1.5 py-0.5 text-xs font-bold text-slate-600 backdrop-blur-sm dark:bg-slate-900/90 dark:text-slate-400">
        <KatexMath math={xLabelKatex} />
      </div>

      {/* Golden Floating HUD */}
      {hoverState && hudContent?.(hoverState, size)}
    </div>
  );
}

export const ConvolutionCanvas = forwardRef<ConvolutionCanvasHandle, Props>(
  function ConvolutionCanvas({ x, h, isPlaying, speed, onFrame, onManualReadout }, ref) {
    const [currentTime, setCurrentTime] = useState(0);
    const timeRef = useRef(0);
    const historyRef = useRef<Point[]>([]);
    const lastAnimTimeRef = useRef(0);
    const animFrameRef = useRef(0);

    const onFrameRef = useRef(onFrame);
    const onManualRef = useRef(onManualReadout);
    onFrameRef.current = onFrame;
    onManualRef.current = onManualReadout;

    // Reset when signals change
    useEffect(() => {
      historyRef.current = [];
      timeRef.current = 0;
      setCurrentTime(0);
      const res = continuousConvolutionAt(x, h, 0);
      onFrameRef.current(res);
      onManualRef.current(res);
    }, [x, h]);

    // Animation playback loop
    useEffect(() => {
      if (!isPlaying) {
        cancelAnimationFrame(animFrameRef.current);
        lastAnimTimeRef.current = 0;
        return;
      }

      const loop = (now: number) => {
        const dt = lastAnimTimeRef.current
          ? Math.min(0.05, (now - lastAnimTimeRef.current) / 1000)
          : 0;
        lastAnimTimeRef.current = now;

        timeRef.current += dt * speed;
        if (timeRef.current > RANGE.to) {
          timeRef.current = RANGE.from;
          historyRef.current = [];
        }

        const res = continuousConvolutionAt(x, h, timeRef.current);
        const lastHist = historyRef.current[historyRef.current.length - 1];
        if (!lastHist || Math.abs(lastHist.time - res.t) > 0.004) {
          historyRef.current.push({ time: res.t, value: res.value });
        }

        setCurrentTime(timeRef.current);
        onFrameRef.current(res);
        animFrameRef.current = requestAnimationFrame(loop);
      };

      animFrameRef.current = requestAnimationFrame(loop);
      return () => {
        cancelAnimationFrame(animFrameRef.current);
        lastAnimTimeRef.current = 0;
      };
    }, [isPlaying, speed, x, h]);

    // External imperative handle
    useImperativeHandle(
      ref,
      () => ({
        setTime: (t) => {
          const clamped = Math.max(RANGE.from, Math.min(RANGE.to, t));
          timeRef.current = clamped;
          setCurrentTime(clamped);
          const res = continuousConvolutionAt(x, h, clamped);
          historyRef.current = [{ time: clamped, value: res.value }];
          onFrameRef.current(res);
          onManualRef.current(res);
        },
        nudge: (delta) => {
          const next = Math.max(RANGE.from, Math.min(RANGE.to, timeRef.current + delta));
          timeRef.current = next;
          setCurrentTime(next);
          const res = continuousConvolutionAt(x, h, next);
          historyRef.current.push({ time: next, value: res.value });
          onFrameRef.current(res);
          onManualRef.current(res);
        },
        currentTime: () => timeRef.current,
      }),
      [x, h]
    );

    // Compute active points for current time
    const result = useMemo(
      () => continuousConvolutionAt(x, h, currentTime),
      [x, h, currentTime]
    );

    // Sample tau-domain signals
    const tauPoints = useMemo(() => {
      const pts: Array<{ time: number; x: number; h: number }> = [];
      const samples = 480;
      for (let i = 0; i <= samples; i++) {
        const tau = RANGE.from + ((RANGE.to - RANGE.from) * i) / samples;
        pts.push({
          time: tau,
          x: evaluateSignal(x, tau),
          h: evaluateSignal(h, currentTime - tau),
        });
      }
      return pts;
    }, [currentTime, h, x]);

    // Peak amplitude for scaling
    const peakAmp = useMemo(() => {
      const maxVal = Math.max(
        1,
        ...tauPoints.map((p) => Math.abs(p.x)),
        ...tauPoints.map((p) => Math.abs(p.h)),
        ...result.points.map((p) => Math.abs(p.product))
      );
      return goldenYLimit(maxVal);
    }, [tauPoints, result.points]);

    // Output y(t) peak amplitude
    const outputPeakAmp = useMemo(() => {
      const maxVal = Math.max(
        1,
        ...historyRef.current.map((p) => Math.abs(p.value)),
        Math.abs(result.value)
      );
      return goldenYLimit(maxVal);
    }, [result.value]);

    // Segments for smooth curves
    const xSegments = useMemo(
      () => splitDiscontinuities(tauPoints.map((p) => ({ time: p.time, value: p.x }))),
      [tauPoints]
    );
    const hSegments = useMemo(
      () => splitDiscontinuities(tauPoints.map((p) => ({ time: p.time, value: p.h }))),
      [tauPoints]
    );
    const productSegments = useMemo(
      () =>
        splitDiscontinuities(
          result.points.map((p) => ({ time: p.tau, value: p.product }))
        ),
      [result.points]
    );
    const historySegments = useMemo(
      () => splitDiscontinuities(historyRef.current),
      [currentTime] // updates with animation
    );

    const impulsesH = useMemo(() => extractImpulseMarkers(h), [h]);

    return (
      <div className="space-y-4">
        {/* Tier 1: Tau-Domain Signals */}
        <SvgScopeTier
          titleKatex="\tau\text{-domain: } x(\tau) \text{ [blue] and } h(t-\tau) \text{ [red]}"
          xLabelKatex="\tau\text{ (s)}"
          amplitude={peakAmp}
          height={SCOPE_HEIGHT}
          hudContent={({ relX, relY, domainT }, size) => {
            const valX = evaluateSignal(x, domainT);
            const valH = evaluateSignal(h, currentTime - domainT);
            const leftPos = Math.min(Math.max(10, relX + 14), size.width - 170);
            const topPos = Math.min(Math.max(10, relY - 45), size.height - 75);
            return (
              <HudPill left={leftPos} top={topPos}>
                <div className="font-serif text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                  <KatexMath math={`\\tau = ${domainT.toFixed(2)}\\text{ s}`} />
                </div>
                <div className="font-serif text-blue-600 dark:text-blue-400 font-semibold flex items-center gap-1.5">
                  <KatexMath math={`x(\\tau) = ${valX.toFixed(2)}`} />
                </div>
                <div className="font-serif text-rose-600 dark:text-rose-400 font-semibold flex items-center gap-1.5">
                  <KatexMath math={`h(t-\\tau) = ${valH.toFixed(2)}`} />
                </div>
              </HudPill>
            );
          }}
        >
          {({ mapX, mapY, zeroY }) => (
            <>
              {/* x(tau) trace */}
              <path
                d={segmentsToPath(xSegments, mapX, mapY)}
                fill="none"
                stroke={COLORS.x}
                strokeWidth={2.4}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {/* h(t - tau) trace */}
              <path
                d={segmentsToPath(hSegments, mapX, mapY)}
                fill="none"
                stroke={COLORS.h}
                strokeWidth={2.4}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {/* Dirac delta impulses */}
              {impulsesH.map((imp, idx) => {
                const sx = mapX(currentTime - imp.at);
                const length = Math.min(50, 24 + Math.abs(imp.area) * 24);
                const sy = zeroY - Math.sign(imp.area || 1) * length;
                return (
                  <g key={`impulse-${idx}`} stroke={COLORS.h} fill={COLORS.h}>
                    <line x1={sx} y1={zeroY} x2={sx} y2={sy} strokeWidth={2.2} />
                    <polygon
                      points={`${sx},${sy} ${sx - 4},${sy + 8} ${sx + 4},${sy + 8}`}
                    />
                  </g>
                );
              })}
            </>
          )}
        </SvgScopeTier>

        {/* Tier 2: Integrand Product & Overlap Area */}
        <SvgScopeTier
          titleKatex="\text{Product \& Overlap Area: } x(\tau)h(t-\tau)"
          xLabelKatex="\tau\text{ (s)}"
          amplitude={peakAmp}
          height={SCOPE_HEIGHT}
          hudContent={({ relX, relY, domainT }, size) => {
            const valX = evaluateSignal(x, domainT);
            const valH = evaluateSignal(h, currentTime - domainT);
            const prod = valX * valH;
            const leftPos = Math.min(Math.max(10, relX + 14), size.width - 190);
            const topPos = Math.min(Math.max(10, relY - 40), size.height - 65);
            return (
              <HudPill left={leftPos} top={topPos}>
                <div className="font-serif text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                  <KatexMath math={`\\tau = ${domainT.toFixed(2)}\\text{ s}`} />
                </div>
                <div className="font-serif text-purple-600 dark:text-purple-400 font-semibold flex items-center gap-1.5">
                  <KatexMath math={`x(\\tau)h(t-\\tau) = ${prod.toFixed(3)}`} />
                </div>
              </HudPill>
            );
          }}
        >
          {({ mapX, mapY, zeroY }) => (
            <>
              {/* Shaded Area Polygon with canonical violet tokens */}
              <path
                d={shadedAreaPath(productSegments, mapX, mapY, zeroY)}
                className="fill-purple-500/20 stroke-purple-600 stroke-[1.5]"
              />
              {/* Product Outline Trace */}
              <path
                d={segmentsToPath(productSegments, mapX, mapY)}
                fill="none"
                stroke={COLORS.product}
                strokeWidth={2.4}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </>
          )}
        </SvgScopeTier>

        {/* Tier 3: Output Accumulation y(t) */}
        <SvgScopeTier
          titleKatex="t\text{-domain Output: } y(t) = \int_{-\infty}^\infty x(\tau)h(t-\tau)\,d\tau"
          xLabelKatex="t\text{ (s)}"
          amplitude={outputPeakAmp}
          height={SCOPE_HEIGHT}
          badge={
            <KatexMath
              math={`t = ${result.t.toFixed(2)}\\text{ s},\\; y(t) = ${result.value.toFixed(3)}`}
            />
          }
          hudContent={({ relX, relY, domainT }, size) => {
            const hist = historyRef.current.find((p) => Math.abs(p.time - domainT) < 0.1);
            const yVal = hist ? hist.value : continuousConvolutionAt(x, h, domainT).value;
            const leftPos = Math.min(Math.max(10, relX + 14), size.width - 160);
            const topPos = Math.min(Math.max(10, relY - 40), size.height - 65);
            return (
              <HudPill left={leftPos} top={topPos}>
                <div className="font-serif text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                  <KatexMath math={`t = ${domainT.toFixed(2)}\\text{ s}`} />
                </div>
                <div className="font-serif text-purple-600 dark:text-purple-400 font-semibold flex items-center gap-1.5">
                  <KatexMath math={`y(t) = ${yVal.toFixed(3)}`} />
                </div>
              </HudPill>
            );
          }}
        >
          {({ mapX, mapY }) => {
            const currentDotX = mapX(result.t);
            const currentDotY = mapY(result.value);
            return (
              <>
                {/* Accumulated Output Trace */}
                <path
                  d={segmentsToPath(historySegments, mapX, mapY)}
                  fill="none"
                  stroke={COLORS.output}
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {/* Current Time Dot */}
                <circle
                  cx={currentDotX}
                  cy={currentDotY}
                  r={5}
                  fill="#F59E0B"
                  stroke="#FFFFFF"
                  strokeWidth={1.5}
                />
              </>
            );
          }}
        </SvgScopeTier>
      </div>
    );
  }
);

export default ConvolutionCanvas;
