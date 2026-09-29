/**
 * MAE Academy / Signals & Systems — Tab C Discrete Convolution Scope.
 * Vector SVG 3-tier stem architecture adhering to canonical StandardStepPlot standard:
 * 1. k-domain: Discrete stems for x[k] (blue #2563EB) and shifted reflection h[n - k] (rose #E11D48)
 * 2. Element-wise Product: Discrete stems for x[k] * h[n - k] with active product heads highlighted
 * 3. Output Accumulation: Discrete output sequence y[n] = sum_k x[k]h[n - k] accumulating as shift n increments
 */
import { symmetricYBound } from "@/lib/plotAutoScale";
import { SvgKatexTick } from "@/components/common/templates/SvgKatexTick";
import { useElementSize } from "@/hooks/useElementSize";
import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { Play, Pause, StepForward, Rewind, RotateCcw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { KatexMath } from "@/components/ui/KatexMath";
import {
  StudioSlider,
  StudioButton,
  GradientButton,
  InnerBox,
} from "@/components/common/templates";
import {
  discreteConvolution,
  type DiscreteConvolution,
} from "@/features/signals/engines/convolutionEngine";

export type DiscreteConvolutionScopeProps = {
  x: number[];
  h: number[];
  n?: number;
  onIndexChange?: (n: number) => void;
  className?: string;
  hideControls?: boolean;
};

const PAD = { top: 24, right: 48, bottom: 44, left: 48 };
const COLORS = {
  x: "#2563EB",
  h: "#E11D48",
  product: "#7C3AED",
  productHighlight: "#9333EA",
  output: "#2563EB",
  dimmed: "#94A3B8",
};

interface StemTierProps {
  titleKatex: string;
  xLabelKatex: string;
  yMin: number;
  yMax: number;
  xMin: number;
  xMax: number;
  height?: number;
  activeMarkerX?: number;
  hudContent?: (coords: { width: number; height: number; mapX: (k: number) => number; mapY: (v: number) => number }) => React.ReactNode;
  onPointerMove?: (domainX: number, relX: number, relY: number) => void;
  onPointerLeave?: () => void;
  children: (coords: {
    plotW: number;
    plotH: number;
    mapX: (k: number) => number;
    mapY: (v: number) => number;
    zeroX: number;
    zeroY: number;
  }) => React.ReactNode;
}

function StemScopeTier({
  titleKatex,
  xLabelKatex,
  yMin,
  yMax,
  xMin,
  xMax,
  height = 240,
  activeMarkerX,
  hudContent,
  onPointerMove,
  onPointerLeave,
  children,
}: StemTierProps) {
  const [containerRef, size] = useElementSize<HTMLDivElement>({ width: 500, height });
  const plotW = Math.max(10, size.width - PAD.left - PAD.right);
  const plotH = Math.max(10, size.height - PAD.top - PAD.bottom);

  const mapX = useCallback(
    (k: number) => PAD.left + ((k - xMin) / (xMax - xMin)) * plotW,
    [xMin, xMax, plotW]
  );

  const mapY = useCallback(
    (v: number) => {
      const span = yMax - yMin || 1;
      return PAD.top + plotH - ((v - yMin) / span) * plotH;
    },
    [yMin, yMax, plotH]
  );

  const zeroX = mapX(0);
  const zeroY = mapY(0);

  // Integer ticks for horizontal axis, strictly symmetric about 0
  const xTicks = useMemo(() => {
    const ticks: number[] = [0];
    const span = xMax - xMin;
    const step = span > 24 ? 2 : 1;
    for (let k = step; k <= xMax; k += step) {
      ticks.push(k);
      ticks.unshift(-k);
    }
    return ticks;
  }, [xMin, xMax]);

  // Golden round ticks (PiecewiseSignalScope.getNiceTicks), symmetric about zero
  const yTicks = useMemo(() => {
    const span = yMax - yMin; if (span <= 0) return [0];
    const rough = span / 6; const power = Math.pow(10, Math.floor(Math.log10(rough))); const norm = rough / power;
    const step = norm < 1.5 ? power : norm < 3.5 ? 2 * power : norm < 7.5 ? 5 * power : 10 * power;
    const ticks: number[] = [];
    for (let v = Math.ceil((yMin - 1e-9) / step) * step; v <= yMax + step * 0.001; v += step) ticks.push(Math.abs(v) < 1e-9 ? 0 : Number(v.toFixed(6)));
    return ticks;
  }, [yMin, yMax]);

  const handlePointer = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!onPointerMove) return;
    const svgRect = e.currentTarget.getBoundingClientRect();
    const relX = e.clientX - svgRect.left;
    const relY = e.clientY - svgRect.top;
    const innerWidth = Math.max(10, svgRect.width - PAD.left - PAD.right);
    const domainK = Math.round(xMin + ((relX - PAD.left) / innerWidth) * (xMax - xMin));
    onPointerMove(domainK, relX, relY);
  };

  return (
    <div
      ref={containerRef}
      className="relative min-h-[240px] overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/60 shadow-sm backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/60"
      style={{ height }}
    >
      <svg
        className="stem-scope-svg absolute inset-0 h-full w-full select-none cursor-crosshair"
        onPointerMove={handlePointer}
        onPointerLeave={onPointerLeave}
        onPointerCancel={onPointerLeave}
      >
        {/* Subtle dashed auxiliary vertical grid lines */}
        {xTicks.map((k) => {
          if (k === 0) return null;
          const sx = mapX(k);
          return (
            <line
              key={`grid-x-${k}`}
              x1={sx}
              y1={PAD.top}
              x2={sx}
              y2={size.height - PAD.bottom}
              className="stroke-slate-200/70 dark:stroke-slate-800/70 stroke-[1] stroke-dasharray-[3,3]"
              strokeDasharray="3 3"
              strokeWidth="1"
            />
          );
        })}

        {/* Amplitude Grid ticks & horizontal lines */}
        {yTicks.map((val) => {
          const sy = mapY(val);
          const isZero = val === 0;
          return (
            <g key={`grid-y-${val}`}>
              <line
                x1={PAD.left}
                y1={sy}
                x2={size.width - PAD.right}
                y2={sy}
                strokeDasharray={isZero ? undefined : "3 3"}
                className={
                  isZero
                    ? "stroke-slate-400 dark:stroke-slate-500 stroke-[1.25]"
                    : "stroke-slate-200/70 dark:stroke-slate-800/70 stroke-[1] stroke-dasharray-[3,3]"
                }
                strokeWidth={isZero ? "1.25" : "1"}
              />
              {!isZero && (
                <SvgKatexTick x={PAD.left - 10} y={sy} anchor="end">{val}</SvgKatexTick>
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
          className="stroke-slate-400 dark:stroke-slate-500 stroke-[1.25]"
          strokeWidth="1.25"
        />

        {/* Zero-Crossing Vertical Axis (k = 0) */}
        <line
          x1={zeroX}
          y1={PAD.top}
          x2={zeroX}
          y2={size.height - PAD.bottom}
          className="stroke-slate-400 dark:stroke-slate-500 stroke-[1.25]"
          strokeWidth="1.25"
        />

        {/* Horizontal Axis Numbers */}
        {xTicks.map((k) => (
          <SvgKatexTick key={`tick-x-${k}`} x={mapX(k)} y={size.height - PAD.bottom + 18} anchor="middle" baseline active={k === activeMarkerX}>{k}</SvgKatexTick>
        ))}

        {/* Stems & Waveform Content */}
        {children({ plotW, plotH, mapX, mapY, zeroX, zeroY })}

        {/* Active pointer guideline */}
        {activeMarkerX !== undefined && (
          <line
            x1={mapX(activeMarkerX)}
            y1={PAD.top}
            x2={mapX(activeMarkerX)}
            y2={size.height - PAD.bottom}
            className="stroke-slate-400/80 dark:stroke-slate-500/80 stroke-1 stroke-dasharray-[2,2]"
            strokeWidth="1"
            strokeDasharray="2 2"
          />
        )}
      </svg>

      {/* Header KaTeX Title */}
      <div className="pointer-events-none absolute left-3 top-2.5 flex items-center gap-2 rounded-md bg-white/90 px-2 py-0.5 text-xs font-bold text-slate-800 backdrop-blur-sm dark:bg-slate-900/90 dark:text-slate-200">
        <KatexMath math={titleKatex} />
      </div>

      {/* Bottom-right Axis KaTeX Symbol */}
      <div className="pointer-events-none absolute bottom-0.5 right-2 rounded-md bg-white/90 px-1.5 py-0.5 text-xs font-bold text-slate-600 backdrop-blur-sm dark:bg-slate-900/90 dark:text-slate-400">
        <KatexMath math={xLabelKatex} />
      </div>

      {/* Golden Floating HUD */}
      {hudContent?.({ width: size.width, height: size.height, mapX, mapY })}
    </div>
  );
}

export function DiscreteConvolutionScope({
  x,
  h,
  n: controlledN,
  onIndexChange,
  className = "",
  hideControls = false,
}: DiscreteConvolutionScopeProps) {
  const { t } = useTranslation('simulators');
  const [internalN, setInternalN] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hoverData, setHoverData] = useState<{
    tier: 1 | 2 | 3;
    domainVal: number;
    relX: number;
    relY: number;
  } | null>(null);

  const convResult: DiscreteConvolution = useMemo(() => discreteConvolution(x, h), [x, h]);
  const maxN = Math.max(0, convResult.values.length - 1);
  const n = controlledN !== undefined ? controlledN : internalN;

  const setShift = useCallback(
    (next: number) => {
      const clamped = Math.max(0, Math.min(maxN, Math.round(next)));
      if (controlledN === undefined) {
        setInternalN(clamped);
      }
      onIndexChange?.(clamped);
    },
    [maxN, controlledN, onIndexChange]
  );

  // Playback timer loop
  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      setShift((n + 1) % (maxN + 1));
    }, 850);
    return () => clearInterval(interval);
  }, [isPlaying, n, maxN, setShift]);

  // Determine symmetrical domain bounds for k-axis
  const { kMin, kMax, ampMax } = useMemo(() => {
    const Nx = x.length;
    const Nh = h.length;
    // h[n - k] spans from (n - Nh + 1) to n.
    // Over all n in [0, maxN], min k is -(Nh - 1) and max k is Nx + Nh - 2.
    const minReach = Math.min(0, -(Nh - 1));
    const maxReach = Math.max(Nx - 1, Nx + Nh - 2);
    // Finite support of x[k], h[n-k] and y[n], padded by one sample so stems never touch the frame edge.
    const spanBound = Math.max(Math.abs(minReach), Math.abs(maxReach), 5) + 1;

    // Amplitude peak across x, h, products, and y
    const maxVal = Math.max(
      0,
      ...x.map(Math.abs),
      ...h.map(Math.abs),
      ...convResult.values.map(Math.abs)
    );
    const ampBound = symmetricYBound(maxVal);

    return {
      kMin: -spanBound,
      kMax: spanBound,
      ampMax: ampBound,
    };
  }, [x, h, convResult.values]);

  // Computed data points for current shift n
  const tierData = useMemo(() => {
    const Nx = x.length;
    const Nh = h.length;
    const kPoints: Array<{
      k: number;
      xVal: number;
      hVal: number;
      product: number;
      hasX: boolean;
      hasH: boolean;
      activeProduct: boolean;
    }> = [];

    for (let k = kMin; k <= kMax; k++) {
      const hasX = k >= 0 && k < Nx;
      const xVal = hasX ? x[k] : 0;

      const m = n - k;
      const hasH = m >= 0 && m < Nh;
      const hVal = hasH ? h[m] : 0;

      const product = xVal * hVal;
      const activeProduct = hasX && hasH && product !== 0;

      kPoints.push({
        k,
        xVal,
        hVal,
        product,
        hasX,
        hasH,
        activeProduct,
      });
    }

    return kPoints;
  }, [x, h, n, kMin, kMax]);

  const currentY = convResult.values[n] ?? 0;

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Control Strip & Step Navigation (only shown if not embedded in unified dashboard) */}
      {!hideControls && (
        <InnerBox className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] items-end">
          <StudioSlider
            label={<span>{t('signals.discreteShiftParameter', 'Discrete shift parameter')} <KatexMath math="n" /></span>}
            mathLabel={<span className="text-slate-400 font-normal">(&Delta;n = 1)</span>}
            valueDisplay={
              <span className="font-mono text-xs font-bold px-2.5 py-1 rounded-md bg-blue-50 dark:bg-blue-950/40 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-900/50">
                <KatexMath math={`y[${n}] = ${currentY}`} />
              </span>
            }
            min={0}
            max={maxN}
            step={1}
            value={n}
            onChange={(val) => {
              setIsPlaying(false);
              setShift(val);
            }}
          />

          <div className="flex flex-wrap items-center gap-2">
            <GradientButton
              onClick={() => setIsPlaying(!isPlaying)}
              className="inline-flex items-center gap-1.5 cursor-pointer text-xs"
            >
              {isPlaying ? (
                <>
                  <Pause className="h-3.5 w-3.5" /> {t('signals.pause', 'Pause')}
                </>
              ) : (
                <>
                  <Play className="h-3.5 w-3.5 fill-current" /> {t('signals.autoStep', 'Auto step')}
                </>
              )}
            </GradientButton>

            <StudioButton
              onClick={() => {
                setIsPlaying(false);
                setShift(n - 1);
              }}
              disabled={n <= 0}
              className="inline-flex items-center gap-1 cursor-pointer text-xs"
            >
              <Rewind className="h-3.5 w-3.5" /> {t('signals.prevStep', 'Prev')}
            </StudioButton>

            <StudioButton
              onClick={() => {
                setIsPlaying(false);
                setShift(n + 1);
              }}
              disabled={n >= maxN}
              className="inline-flex items-center gap-1 cursor-pointer text-xs"
            >
              <StepForward className="h-3.5 w-3.5" /> {t('signals.nextStep', 'Next')}
            </StudioButton>

            <StudioButton
              onClick={() => {
                setIsPlaying(false);
                setShift(0);
              }}
              className="inline-flex items-center gap-1 cursor-pointer text-xs"
              title="Reset shift to n = 0"
            >
              <RotateCcw className="h-3.5 w-3.5" /> {t('signals.resetStep', 'Reset')}
            </StudioButton>
          </div>
        </InnerBox>
      )}

      {/* Tier 1: k-domain: x[k] and shifted kernel h[n - k] */}
      <StemScopeTier
        titleKatex="\text{Tier 1: } k\text{-domain: } x[k] \text{ [blue]} \text{ and } h[n-k] \text{ [rose]}"
        xLabelKatex="k"
        yMin={-ampMax}
        yMax={ampMax}
        xMin={kMin}
        xMax={kMax}
        height={240}
        activeMarkerX={hoverData?.tier === 1 ? hoverData.domainVal : undefined}
        onPointerMove={(domainVal, relX, relY) =>
          setHoverData({ tier: 1, domainVal, relX, relY })
        }
        onPointerLeave={() => setHoverData(null)}
        hudContent={({ width, height, mapX }) =>
          hoverData?.tier === 1 && (
            <div
              className="absolute z-30 pointer-events-none px-3 py-1.5 rounded-xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200/80 dark:border-slate-800 shadow-xl text-xs space-y-1 transition-transform"
              style={{
                left: Math.min(width - 160, Math.max(12, mapX(hoverData.domainVal) + 14)),
                top: Math.min(height - 85, Math.max(12, hoverData.relY - 30)),
              }}
            >
              {(() => {
                const k = hoverData.domainVal;
                const vx = k >= 0 && k < x.length ? x[k] : 0;
                const vh = n - k >= 0 && n - k < h.length ? h[n - k] : 0;
                return (
                  <>
                    <div className="font-serif text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
                      <KatexMath math={`k = ${k}`} />
                    </div>
                    <div className="font-serif text-blue-600 dark:text-blue-400 font-semibold flex items-center gap-1.5">
                      <KatexMath math={`x[${k}] = ${vx}`} />
                    </div>
                    <div className="font-serif text-rose-600 dark:text-rose-400 font-semibold flex items-center gap-1.5">
                      <KatexMath math={`h[${n} - (${k})] = ${vh}`} />
                    </div>
                  </>
                );
              })()}
            </div>
          )
        }
      >
        {({ mapX, mapY, zeroY }) => (
          <g>
            {tierData.map(({ k, xVal, hVal, hasX, hasH }) => {
              const sx = mapX(k);
              const xOffset = -2.5;
              const hOffset = 2.5;

              return (
                <g key={`stem-t1-${k}`}>
                  {/* Stem for x[k] (Blue) */}
                  {hasX && xVal !== 0 ? (
                    <g>
                      <line
                        x1={sx + xOffset}
                        y1={zeroY}
                        x2={sx + xOffset}
                        y2={mapY(xVal)}
                        stroke={COLORS.x}
                        strokeWidth={2}
                      />
                      <circle
                        cx={sx + xOffset}
                        cy={mapY(xVal)}
                        r={4.5}
                        fill="#FFFFFF"
                        stroke={COLORS.x}
                        strokeWidth={2}
                      />
                    </g>
                  ) : hasX ? (
                    <circle
                      cx={sx + xOffset}
                      cy={zeroY}
                      r={3.5}
                      fill="transparent"
                      stroke={COLORS.dimmed}
                      strokeWidth={1.5}
                      opacity={0.4}
                    />
                  ) : null}

                  {/* Stem for h[n - k] (Rose) */}
                  {hasH && hVal !== 0 ? (
                    <g>
                      <line
                        x1={sx + hOffset}
                        y1={zeroY}
                        x2={sx + hOffset}
                        y2={mapY(hVal)}
                        stroke={COLORS.h}
                        strokeWidth={2}
                      />
                      <circle
                        cx={sx + hOffset}
                        cy={mapY(hVal)}
                        r={4.5}
                        fill="#FFFFFF"
                        stroke={COLORS.h}
                        strokeWidth={2}
                      />
                    </g>
                  ) : hasH ? (
                    <circle
                      cx={sx + hOffset}
                      cy={zeroY}
                      r={3.5}
                      fill="transparent"
                      stroke={COLORS.dimmed}
                      strokeWidth={1.5}
                      opacity={0.4}
                    />
                  ) : null}
                </g>
              );
            })}
          </g>
        )}
      </StemScopeTier>

      {/* Tier 2: Element-wise Product: x[k] * h[n - k] */}
      <StemScopeTier
        titleKatex={`\\text{Tier 2: Product: } x[k]h[${n}-k] \\quad \\left(\\sum_k = ${currentY}\\right)`}
        xLabelKatex="k"
        yMin={-ampMax}
        yMax={ampMax}
        xMin={kMin}
        xMax={kMax}
        height={240}
        activeMarkerX={hoverData?.tier === 2 ? hoverData.domainVal : undefined}
        onPointerMove={(domainVal, relX, relY) =>
          setHoverData({ tier: 2, domainVal, relX, relY })
        }
        onPointerLeave={() => setHoverData(null)}
        hudContent={({ width, height, mapX }) =>
          hoverData?.tier === 2 && (
            <div
              className="absolute z-30 pointer-events-none px-3 py-1.5 rounded-xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200/80 dark:border-slate-800 shadow-xl text-xs space-y-1 transition-transform"
              style={{
                left: Math.min(width - 160, Math.max(12, mapX(hoverData.domainVal) + 14)),
                top: Math.min(height - 75, Math.max(12, hoverData.relY - 30)),
              }}
            >
              {(() => {
                const k = hoverData.domainVal;
                const vx = k >= 0 && k < x.length ? x[k] : 0;
                const vh = n - k >= 0 && n - k < h.length ? h[n - k] : 0;
                const prod = vx * vh;
                return (
                  <>
                    <div className="font-serif text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                      <KatexMath math={`k = ${k}`} />
                    </div>
                    <div className="font-serif text-purple-600 dark:text-purple-400 font-semibold flex items-center gap-1.5">
                      <KatexMath math={`x[${k}]h[${n} - ${k}] = ${prod}`} />
                    </div>
                  </>
                );
              })()}
            </div>
          )
        }
      >
        {({ mapX, mapY, zeroY }) => (
          <g>
            {tierData.map(({ k, product, activeProduct, hasX, hasH }) => {
              const sx = mapX(k);

              if (product !== 0) {
                const sy = mapY(product);
                return (
                  <g key={`stem-t2-${k}`}>
                    {/* Stem Line */}
                    <line
                      x1={sx}
                      y1={zeroY}
                      x2={sx}
                      y2={sy}
                      stroke={COLORS.product}
                      strokeWidth={2}
                    />

                    {/* Glowing highlight halo if active product */}
                    {activeProduct && (
                      <circle
                        cx={sx}
                        cy={sy}
                        r={8}
                        fill="none"
                        stroke={COLORS.productHighlight}
                        strokeWidth={1.5}
                        opacity={0.65}
                      />
                    )}

                    {/* Circular Marker Head */}
                    <circle
                      cx={sx}
                      cy={sy}
                      r={4.5}
                      fill={activeProduct ? COLORS.product : "#FFFFFF"}
                      stroke={COLORS.product}
                      strokeWidth={2}
                    />

                    {/* Numerical Value Badge */}
                    <SvgKatexTick x={sx} y={product > 0 ? sy - 7 : sy + 14} anchor="middle" baseline>{product}</SvgKatexTick>
                  </g>
                );
              }

              if (hasX || hasH) {
                return (
                  <circle
                    key={`stem-t2-zero-${k}`}
                    cx={sx}
                    cy={zeroY}
                    r={3.5}
                    fill="transparent"
                    stroke={COLORS.dimmed}
                    strokeWidth={1.5}
                    opacity={0.4}
                  />
                );
              }

              return null;
            })}
          </g>
        )}
      </StemScopeTier>

      {/* Tier 3: Accumulation: y[n] = sum_k x[k]h[n - k] */}
      <StemScopeTier
        titleKatex="\text{Tier 3: } n\text{-domain Output: } y[n] = \sum_k x[k]h[n-k]"
        xLabelKatex="n"
        yMin={-ampMax}
        yMax={ampMax}
        xMin={kMin}
        xMax={kMax}
        height={240}
        activeMarkerX={hoverData?.tier === 3 ? hoverData.domainVal : n}
        onPointerMove={(domainVal, relX, relY) =>
          setHoverData({ tier: 3, domainVal, relX, relY })
        }
        onPointerLeave={() => setHoverData(null)}
        hudContent={({ width, height, mapX }) =>
          hoverData?.tier === 3 && (
            <div
              className="absolute z-30 pointer-events-none px-3 py-1.5 rounded-xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200/80 dark:border-slate-800 shadow-xl text-xs space-y-1 transition-transform"
              style={{
                left: Math.min(width - 160, Math.max(12, mapX(hoverData.domainVal) + 14)),
                top: Math.min(height - 75, Math.max(12, hoverData.relY - 30)),
              }}
            >
              {(() => {
                const idx = hoverData.domainVal;
                const val = idx >= 0 && idx < convResult.values.length ? convResult.values[idx] : 0;
                return (
                  <>
                    <div className="font-serif text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                      <KatexMath math={`n = ${idx}`} />
                    </div>
                    <div className="font-serif text-blue-600 dark:text-blue-400 font-semibold flex items-center gap-1.5">
                      <KatexMath math={`y[${idx}] = ${val}`} />
                    </div>
                  </>
                );
              })()}
            </div>
          )
        }
      >
        {({ mapX, mapY, zeroY }) => (
          <g>
            {Array.from({ length: kMax - kMin + 1 }, (_, i) => kMin + i).map((m) => {
              const sx = mapX(m);
              const isDefined = m >= 0 && m < convResult.values.length;
              const val = isDefined ? convResult.values[m] : 0;
              const isCurrent = m === n;
              const isAccumulated = m <= n && isDefined;

              if (isDefined && val !== 0) {
                const sy = mapY(val);

                if (isCurrent) {
                  return (
                    <g key={`stem-t3-${m}`}>
                      {/* Active Current Stem */}
                      <line
                        x1={sx}
                        y1={zeroY}
                        x2={sx}
                        y2={sy}
                        stroke={COLORS.output}
                        strokeWidth={2.5}
                      />
                      {/* Pulsing Target Halo */}
                      <circle
                        cx={sx}
                        cy={sy}
                        r={8.5}
                        fill="none"
                        stroke={COLORS.output}
                        strokeWidth={1.5}
                        opacity={0.5}
                      />
                      {/* Highlighted Stem Head */}
                      <circle
                        cx={sx}
                        cy={sy}
                        r={4.5}
                        fill={COLORS.output}
                        className="stroke-white dark:stroke-slate-900"
                        strokeWidth={2}
                      />
                    </g>
                  );
                }

                if (isAccumulated) {
                  return (
                    <g key={`stem-t3-${m}`}>
                      <line
                        x1={sx}
                        y1={zeroY}
                        x2={sx}
                        y2={sy}
                        stroke={COLORS.output}
                        strokeWidth={1}
                      />
                      <circle
                        cx={sx}
                        cy={sy}
                        r={4}
                        fill={COLORS.output}
                        className="stroke-white dark:stroke-slate-900"
                        strokeWidth={1.5}
                      />
                    </g>
                  );
                }

                // Upcoming sample (m > n)
                return (
                  <g key={`stem-t3-${m}`} opacity={0.45}>
                    <line
                      x1={sx}
                      y1={zeroY}
                      x2={sx}
                      y2={sy}
                      stroke={COLORS.dimmed}
                      strokeWidth={1.5}
                      strokeDasharray="3 3"
                    />
                    <circle
                      cx={sx}
                      cy={sy}
                      r={3.5}
                      fill="transparent"
                      stroke={COLORS.dimmed}
                      strokeWidth={1.5}
                    />
                  </g>
                );
              }

              if (isDefined) {
                // Zero sample inside sequence
                return (
                  <circle
                    key={`stem-t3-zero-${m}`}
                    cx={sx}
                    cy={zeroY}
                    r={3.5}
                    fill="transparent"
                    stroke={m === n ? COLORS.output : COLORS.dimmed}
                    strokeWidth={m === n ? 2 : 1.5}
                    opacity={m === n ? 0.9 : 0.4}
                  />
                );
              }

              return null;
            })}
          </g>
        )}
      </StemScopeTier>
    </div>
  );
}

export default DiscreteConvolutionScope;
