import React from 'react';
import { useFluidT } from '../../i18n/fluidText';
import type { ReservoirAnalysis } from './cutawayPhysics';
import { CutawayDefs, EDGE_WIDTH, FlowStream, SANS, chargeColor, groundProps, hatchFill, type CutawayStageProps, type CutawayTheme } from './cutawayParts';
import { VENTED_BAR, VentArrow } from './FlowControlCutaways';

/** Vessel: a horizontal cylinder closed by two hemispherical domes. Axis height, outer radius and wall thickness. */
export const VESSEL = { cy: 235, radius: 80, wall: 14, left: 230, right: 550 } as const;
const INNER = VESSEL.radius - VESSEL.wall;
/** Gauge: dial centre and radius; the scale runs from 0 to GAUGE_MAX bar over 270°. */
export const GAUGE = { cx: 440, cy: 70, radius: 36 } as const;
export const GAUGE_MAX = 10;
const NEEDLE_START = -135;
const NEEDLE_SPAN = 270;

/** Needle angle (degrees from straight up) for a pressure in bar. */
export const gaugeAngle = (bar: number): number => NEEDLE_START + (Math.min(GAUGE_MAX, Math.max(0, bar)) / GAUGE_MAX) * NEEDLE_SPAN;

/** Closed outline of the vessel (stadium with circular ends) of radius `r` about the axis. */
const vesselPath = (r: number) => {
  const { cy, left, right } = VESSEL;
  return `M ${left} ${cy - r} H ${right} A ${r} ${r} 0 0 1 ${right} ${cy + r} H ${left} A ${r} ${r} 0 0 1 ${left} ${cy - r} Z`;
};

/** Seconds per dash cycle of the inlet stream: the closer the vessel is to the supply, the slower the air moves in. */
export const inflowPeriod = (ratio: number): number => 0.5 / Math.max(0.12, 1 - Math.min(1, Math.max(0, ratio)));

const DOTS = '0.1 15';

/** Dots travelling along a line; their speed is the flow. `reverse` runs them from the end back to the start. */
function DotStream({ d, period, reverse = false }: { d: string; period: number; reverse?: boolean }) {
  const common = { d, fill: 'none', strokeLinecap: 'round' as const, strokeDasharray: DOTS, className: 'reservoir-dots', style: { animationDuration: `${period}s`, animationDirection: reverse ? 'reverse' : 'normal' } };
  return (
    <g pointerEvents="none" data-testid="inlet-dots" data-reverse={reverse}>
      <path {...common} stroke="#0B1E4A" strokeWidth={8} strokeOpacity={0.85} />
      <path {...common} stroke="#FFFFFF" strokeWidth={5} />
    </g>
  );
}

/** Micro gauge; `mark` draws a cracking-pressure tick on the scale. */
export function Gauge({ bar, theme, cx = GAUGE.cx, cy = GAUGE.cy, mark }: { bar: number; theme: CutawayTheme; cx?: number; cy?: number; mark?: number }) {
  const radius = GAUGE.radius;
  const ticks = [0, 2.5, 5, 7.5, 10];
  const point = (angle: number, r: number) => [cx + r * Math.sin((angle * Math.PI) / 180), cy - r * Math.cos((angle * Math.PI) / 180)];
  return (
    <g className="micro-gauge" data-bar={bar.toFixed(2)}>
      <circle cx={cx} cy={cy} r={radius + 5} {...groundProps(theme)} />
      <circle cx={cx} cy={cy} r={radius} fill="#F9FAFB" stroke={theme.steelEdge} strokeWidth={1} />
      {ticks.map(value => {
        const [x0, y0] = point(gaugeAngle(value), radius - 7);
        const [x1, y1] = point(gaugeAngle(value), radius - 1);
        return <line key={value} x1={x0} y1={y0} x2={x1} y2={y1} stroke="#1F2937" strokeWidth={1.5} />;
      })}
      <text x={point(gaugeAngle(0), radius - 14)[0]} y={point(gaugeAngle(0), radius - 14)[1] + 10} textAnchor="middle" fontSize={9} fontFamily={SANS} fill="#374151">0</text>
      <text x={point(gaugeAngle(10), radius - 14)[0]} y={point(gaugeAngle(10), radius - 14)[1] + 10} textAnchor="middle" fontSize={9} fontFamily={SANS} fill="#374151">{GAUGE_MAX}</text>
      <text x={cx} y={cy + 16} textAnchor="middle" fontSize={9} fontFamily={SANS} fill="#374151">bar</text>
      {mark !== undefined && (() => {
        const [x0, y0] = point(gaugeAngle(mark), radius - 9);
        const [x1, y1] = point(gaugeAngle(mark), radius + 2);
        return <line className="gauge-mark" x1={x0} y1={y0} x2={x1} y2={y1} stroke="#D97706" strokeWidth={3} />;
      })()}
      <g className="gauge-needle" data-angle={gaugeAngle(bar).toFixed(1)} style={{ transform: `translate(${cx}px, ${cy}px) rotate(${gaugeAngle(bar)}deg)`, transition: 'transform 200ms cubic-bezier(0.4, 0, 0.2, 1)' }}>
        <polygon points="-2.5,4 2.5,4 0,-27" fill="#DC2626" stroke="#7F1D1D" strokeWidth={0.8} />
      </g>
      <circle cx={cx} cy={cy} r={4} fill="#374151" />
    </g>
  );
}

/**
 * Sectional view of the air reservoir: a welded pressure vessel with hemispherical domes, an inlet on the left, an
 * outlet on the right and a gauge boss on top. The cavity is a gas volume, so it has no level: its colour runs from
 * light grey to solid deep blue in proportion to P_internal / P_supply, and dots enter through the inlet while it charges
 * (slower as it fills) or leave through it, fast, while it discharges.
 */
export function AirReservoirCutaway({ analysis, theme, idPrefix = 'reservoir' }: CutawayStageProps & { analysis: ReservoirAnalysis }) {
  const tr = useFluidT();
  const { cy, radius, wall, left, right } = VESSEL;
  const cavity = vesselPath(INNER);
  const gas = chargeColor(analysis.ratio);
  const inlet = analysis.readings[0].bar;
  const charging = analysis.phase === 'charging';
  const discharging = analysis.phase === 'discharging';
  const tipLeft = left - radius;
  const tipRight = right + radius;
  const inlet0 = 84;
  const hud = [
    [tr('cutaway.reservoir.currentPressure'), `${analysis.pressure.toFixed(1)} bar`],
    [tr('cutaway.reservoir.chargeState'), analysis.state],
    [tr('cutaway.reservoir.volume'), `${Math.round(analysis.volumeCm3)} cm³`],
  ];

  return (
    <svg viewBox="0 0 780 420" role="img" aria-label="Air reservoir cutaway" data-testid="cutaway-reservoir" data-phase={analysis.phase} data-ratio={analysis.ratio.toFixed(3)} data-fill={gas} style={{ width: '100%', height: 'auto', maxHeight: 460, display: 'block', direction: 'ltr' }}>
      <CutawayDefs id={idPrefix} theme={theme} />
      <style>{`
        @keyframes reservoir-dots { to { stroke-dashoffset: -15.1; } }
        .reservoir-dots { animation: reservoir-dots 0.6s linear infinite; }
        @media (prefers-reduced-motion: reduce) { .reservoir-dots { animation: none; } }
      `}</style>
      <clipPath id={`${idPrefix}-cavity`}><path d={cavity} /></clipPath>

      {/* saddle supports */}
      {[300, 480].map(x => (
        <g key={x} className="vessel-saddle">
          <rect x={x - 30} y={cy + radius - 6} width={60} height={22} fill={theme.hatch} stroke={theme.casingEdge} strokeWidth={EDGE_WIDTH} />
          <rect x={x - 42} y={cy + radius + 16} width={84} height={8} {...groundProps(theme)} />
        </g>
      ))}

      {/* gauge stem and boss on top, inlet and outlet nipples welded to the domes */}
      <rect className="gauge-stem" x={GAUGE.cx - 10} y={GAUGE.cy + GAUGE.radius + 4} width={20} height={cy - radius - GAUGE.cy - GAUGE.radius - 4 + 10} fill={theme.hatch} stroke={theme.casingEdge} strokeWidth={EDGE_WIDTH} />
      <rect x={GAUGE.cx - 5} y={GAUGE.cy + GAUGE.radius + 4} width={10} height={cy - radius - GAUGE.cy - GAUGE.radius + 6} fill={chargeColor(analysis.ratio)} />
      {[[tipLeft - 30, tipLeft + 6], [tipRight - 6, tipRight + 30]].map(([x0, x1]) => (
        <rect key={x0} className="port-boss" x={x0} y={cy - 28} width={x1 - x0} height={56} fill={theme.hatch} stroke={theme.casingEdge} strokeWidth={EDGE_WIDTH} />
      ))}

      {/* the shell: machined steel with a hatched section, weld seams where the domes meet the barrel */}
      <path className="vessel-shell" d={vesselPath(radius)} fill={hatchFill(idPrefix)} stroke={theme.casingEdge} strokeWidth={EDGE_WIDTH} />
      <path className="vessel-cavity" d={cavity} fill={theme.bore} />
      <g clipPath={`url(#${idPrefix}-cavity)`}>
        <rect className="gas-fill" x={tipLeft} y={cy - INNER} width={tipRight - tipLeft} height={2 * INNER} fill={gas} />
        <ellipse cx={(left + right) / 2} cy={cy - INNER + 14} rx={(right - left) / 2 + 20} ry={7} fill="#FFFFFF" opacity={0.16} />
      </g>
      <path d={cavity} fill="none" stroke={theme.casingEdge} strokeWidth={EDGE_WIDTH} strokeLinejoin="round" />
      {[left, right].map(x => <line key={x} className="weld-seam" x1={x} x2={x} y1={cy - radius} y2={cy - INNER} stroke={theme.steelEdge} strokeWidth={2} />)}
      {[left, right].map(x => <line key={`b${x}`} x1={x} x2={x} y1={cy + INNER} y2={cy + radius} stroke={theme.steelEdge} strokeWidth={2} />)}

      {/* ports bored through the walls, tinted with the line pressure */}
      <rect className="inlet-bore" x={inlet0 - 8} y={cy - 18} width={tipLeft + wall + 4 - (inlet0 - 8)} height={36} fill={chargeColor(inlet / Math.max(analysis.supply, 0.001))} stroke={theme.casingEdge} strokeWidth={EDGE_WIDTH} />
      <rect className="outlet-bore" x={tipRight - wall - 4} y={cy - 18} width={704 - (tipRight - wall - 4)} height={36} fill={gas} stroke={theme.casingEdge} strokeWidth={EDGE_WIDTH} />
      <rect x={GAUGE.cx - 5} y={cy - radius - 4} width={10} height={wall + 8} fill={gas} />

      {charging && <DotStream d={`M ${inlet0} ${cy} H ${left + 30}`} period={inflowPeriod(analysis.ratio)} />}
      {discharging && <DotStream d={`M ${inlet0} ${cy} H ${left + 30}`} period={0.22} reverse />}
      {discharging && inlet <= VENTED_BAR && <VentArrow x={tipLeft - 54} y={cy} direction={-1} />}
      {charging && <FlowStream points={[[inlet0 - 8, cy], [inlet0 + 12, cy]]} width={3} radius={0} />}

      <Gauge bar={analysis.pressure} theme={theme} />

      <text x={inlet0} y={cy - 36} fontSize={11} fontFamily={SANS} fill={theme.muted}>{tr('cutaway.reservoir.inlet')}</text>
      <text x={704} y={cy - 36} fontSize={11} fontFamily={SANS} fill={theme.muted} textAnchor="end">{tr('cutaway.reservoir.outlet')}</text>
      <text x={GAUGE.cx + GAUGE.radius + 14} y={GAUGE.cy + 4} fontSize={11} fontFamily={SANS} fill={theme.muted}>{tr('cutaway.reservoir.gauge')}</text>

      {/* live read-out */}
      <g data-testid="reservoir-hud" fontFamily={SANS}>
        {hud.map(([label, value], index) => (
          <g key={label} transform={`translate(${96 + index * 210},372)`}>
            <text fontSize={11} fill={theme.muted}>{label}</text>
            <text y={20} fontSize={15} fontWeight={700} fill={theme.text}>{value}</text>
          </g>
        ))}
      </g>
    </svg>
  );
}
