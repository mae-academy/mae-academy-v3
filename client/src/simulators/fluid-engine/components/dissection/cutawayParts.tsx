/**
 * Shared drawing kit for the cutaway stages: theme, hatching, animated fluid streams, springs.
 * Moving parts are positioned with CSS `transform`, so the browser animates them on the compositor
 * and a 60 FPS snapshot stream never forces a layout.
 */
import React from 'react';
import type { FluidMedium } from '../../models/fluidCatalog';
import { PRESSURE_SCALE } from '../../models/pressureColors';

export interface CutawayTheme {
  casing: string;
  casingEdge: string;
  hatch: string;
  bore: string;
  /** Polished chrome: rods, shafts. */
  steel: string;
  steelEdge: string;
  /** Precision-ground steel: spool lands, piston heads. */
  ground: string;
  /** Elastomer seals and wipers. */
  seal: string;
  text: string;
  muted: string;
  spring: string;
}

/**
 * Industrial sectional look (Festo FluidSIM): machined metal bodies, ground steel moving parts, black flat springs.
 * The bore stays light in both themes so the blue pressure fill and the black springs always read.
 */
export const cutawayTheme = (isDark: boolean): CutawayTheme => (isDark
  ? { casing: '#374151', casingEdge: '#9CA3AF', hatch: '#4B5563', bore: '#E5E7EB', steel: '#9CA3AF', steelEdge: '#111827', ground: '#6B7280', seal: '#111827', text: '#f8fafc', muted: '#94a3b8', spring: '#000000' }
  : { casing: '#374151', casingEdge: '#1F2937', hatch: '#4B5563', bore: '#F3F4F6', steel: '#9CA3AF', steelEdge: '#1F2937', ground: '#6B7280', seal: '#111827', text: '#172033', muted: '#64748b', spring: '#000000' });

/** Pneumatic pressure fill and the exhaust / atmosphere fill. */
export const PRESSURE_BLUE = '#3B82F6';
export const EXHAUST_GRAY = '#F3F4F6';
/** Vibrant blue of fluid that is flowing (as opposed to merely pressurised). */
export const FLOW_BLUE = '#2563EB';
/** Deep industrial blue of a fully charged accumulation volume (the reservoir and the timer's chamber). */
export const DEEP_BLUE = '#2563EB';

const channels = (hex: string): [number, number, number] => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
/** Linear blend of two #RRGGBB colours: share 0 is `from`, 1 is `to`. */
export function mixColor(from: string, to: string, share: number): string {
  const t = Math.min(1, Math.max(0, share));
  const [a, b] = [channels(from), channels(to)];
  return `#${a.map((value, i) => Math.round(value + (b[i] - value) * t).toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}
/** Colour of a gas volume at `ratio` = P / P_supply: light grey when unpressurised, solid deep blue at the supply pressure. */
export const chargeColor = (ratio: number): string => mixColor(EXHAUST_GRAY, DEEP_BLUE, ratio);

/** Outline weight of every machined part. */
export const EDGE_WIDTH = 1.5;

export const SANS = 'inherit';

/** Spring-loaded / spool style: slides a part with a hardware-accelerated transform. */
export const slideStyle = (dx: number, dy = 0, ms = 150): React.CSSProperties => ({
  transform: `translate(${dx}px, ${dy}px)`,
  transition: `transform ${ms}ms cubic-bezier(0.4, 0, 0.2, 1)`,
  willChange: 'transform',
});

export interface FluidTint {
  fill: string;
  opacity: number;
}

/**
 * Fill of a cavity: solid industrial blue (hydraulic: the working-pressure red) while it holds pressure, darker with
 * more pressure; light grey while it is open to exhaust or tank; nothing while it is simply empty.
 */
export function fluidTint(bar: number, medium: FluidMedium, vented = false): FluidTint {
  if (bar > 0.01) {
    const scale = PRESSURE_SCALE[medium];
    const share = Math.min(1, bar / scale.working);
    return { fill: medium === 'PNEUMATIC' ? PRESSURE_BLUE : bar >= scale.working ? scale.high : scale.low, opacity: 0.6 + 0.4 * share };
  }
  if (vented) return { fill: EXHAUST_GRAY, opacity: 1 };
  return { fill: 'transparent', opacity: 0 };
}

/** One-time defs: casing hatch and the stream animation (switched off for reduced-motion users). */
export function CutawayDefs({ id, theme }: { id: string; theme: CutawayTheme }) {
  return (
    <defs>
      <pattern id={`${id}-hatch`} width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="8" height="8" fill={theme.casing} />
        <line x1="0" y1="0" x2="0" y2="8" stroke={theme.hatch} strokeWidth="1.2" />
      </pattern>
      <style>{`
        @keyframes cutaway-flow { to { stroke-dashoffset: -14; } }
        .cutaway-stream { animation: cutaway-flow 0.6s linear infinite; }
        @media (prefers-reduced-motion: reduce) { .cutaway-stream { animation: none; } }
      `}</style>
    </defs>
  );
}

export const hatchFill = (id: string) => `url(#${id}-hatch)`;

type Point = [number, number];

/** Colour of the moving dashes of a stream; the dark underlay keeps them readable on blue, grey or metal. */
export const STREAM_COLOR = '#FFFFFF';
const STREAM_UNDERLAY = '#0B1E4A';

/** Polyline with every inner corner replaced by a quadratic curve of up to `radius` px, so streams bend instead of snapping. */
export function roundedPath(points: Point[], radius: number): string {
  if (points.length < 3 || radius <= 0) return points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'} ${x} ${y}`).join(' ');
  const parts = [`M ${points[0][0]} ${points[0][1]}`];
  for (let i = 1; i < points.length - 1; i += 1) {
    const [px, py] = points[i - 1];
    const [x, y] = points[i];
    const [nx, ny] = points[i + 1];
    const before = Math.hypot(x - px, y - py) || 1;
    const after = Math.hypot(nx - x, ny - y) || 1;
    const d1 = Math.min(radius, before / 2);
    const d2 = Math.min(radius, after / 2);
    parts.push(`L ${x - ((x - px) / before) * d1} ${y - ((y - py) / before) * d1}`, `Q ${x} ${y} ${x + ((nx - x) / after) * d2} ${y + ((ny - y) / after) * d2}`);
  }
  parts.push(`L ${points[points.length - 1][0]} ${points[points.length - 1][1]}`);
  return parts.join(' ');
}

/** A flowing stream: dashes travel along the path from its first point to its last, ending in an arrowhead. */
export function FlowStream({ points, color = STREAM_COLOR, active = true, width = 4, radius = 8 }: { points: Point[]; color?: string; active?: boolean; width?: number; radius?: number }) {
  if (!active || points.length < 2) return null;
  const path = roundedPath(points, radius);
  const [px, py] = points[points.length - 2];
  const [x, y] = points[points.length - 1];
  const length = Math.hypot(x - px, y - py) || 1;
  const ux = (x - px) / length;
  const uy = (y - py) / length;
  const size = 9;
  const bx = x - ux * size;
  const by = y - uy * size;
  const nx = -uy * size * 0.5;
  const ny = ux * size * 0.5;
  return (
    <g className="cutaway-flow" pointerEvents="none">
      <path d={path} fill="none" stroke={STREAM_UNDERLAY} strokeOpacity={0.85} strokeWidth={width + 3} strokeLinecap="round" strokeLinejoin="round" />
      <path className="cutaway-stream" d={path} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" strokeDasharray="8 6" />
      <polygon points={`${x},${y} ${bx + nx},${by + ny} ${bx - nx},${by - ny}`} fill={color} stroke={STREAM_UNDERLAY} strokeWidth={1} />
    </g>
  );
}

/** Zig-zag coil from (0,0) to (length,0); scale it with `scaleX` to compress or stretch the spring. */
export function springPath(length: number, coils: number, amplitude: number): string {
  const lead = 8;
  const span = length - 2 * lead;
  const points = [`0,0`, `${lead},0`];
  for (let i = 0; i < coils * 2; i += 1) points.push(`${lead + (span * (i + 0.5)) / (coils * 2)},${i % 2 === 0 ? -amplitude : amplitude}`);
  points.push(`${length - lead},0`, `${length},0`);
  return `M ${points.join(' L ')}`;
}

/** Spring anchored at a fixed wall; its free end follows `length`, animated by a CSS scale. */
export function AnchoredSpring({ anchorX, y, length, reference, direction, coils = 6, amplitude = 12, minScale = 0.12, ms = 150, theme }: {
  anchorX: number;
  y: number;
  length: number;
  /** Drawn length the path is built at; the live length is applied as a scale. */
  reference: number;
  /** 1 grows to the right of the wall, -1 to the left. */
  direction: 1 | -1;
  coils?: number;
  amplitude?: number;
  /** Smallest scale the spring is squeezed to (its solid height, as a share of `reference`). */
  minScale?: number;
  /** Duration of the length animation, so it can follow a part that moves faster than a valve spool. */
  ms?: number;
  theme: CutawayTheme;
}) {
  const scale = Math.max(minScale, length / reference) * direction;
  return (
    <g style={{ transform: `translate(${anchorX}px, ${y}px) scaleX(${scale})`, transformOrigin: '0 0', transformBox: 'view-box', transition: `transform ${ms}ms cubic-bezier(0.4, 0, 0.2, 1)` }}>
      <path d={springPath(reference, coils, amplitude)} fill="none" stroke={theme.spring} strokeWidth={2.5} strokeLinejoin="miter" strokeLinecap="butt" vectorEffect="non-scaling-stroke" />
    </g>
  );
}

/** Port tag with its live pressure, placed outside the casing. */
export function PortTag({ x, y, label, bar, theme, anchor = 'middle', below = false }: {
  x: number;
  y: number;
  label: string;
  bar: number;
  theme: CutawayTheme;
  anchor?: 'start' | 'middle' | 'end';
  /** Put the value under the label instead of above. */
  below?: boolean;
}) {
  return (
    <g fontFamily={SANS} textAnchor={anchor} pointerEvents="none">
      <text x={x} y={y} fontSize={15} fontWeight={700} fill={theme.text}>{label}</text>
      <text x={x} y={below ? y + 16 : y - 16} fontSize={11} fill={theme.muted}>{bar.toFixed(1)} bar</text>
    </g>
  );
}

/** Steel part with an outline. */
export const steelProps = (theme: CutawayTheme) => ({ fill: theme.steel, stroke: theme.steelEdge, strokeWidth: EDGE_WIDTH });
/** Precision-ground part (spool land, piston head). */
export const groundProps = (theme: CutawayTheme) => ({ fill: theme.ground, stroke: theme.steelEdge, strokeWidth: EDGE_WIDTH });

export interface CutawayStageProps {
  medium: FluidMedium;
  theme: CutawayTheme;
  /** Distinguishes the pattern ids when several stages are on screen. */
  idPrefix?: string;
}

/**
 * Piston head spanning the whole bore, in ground steel, with two elastomer seal rings that sit proud of its rim
 * so the sealing boundary against the barrel wall is visible.
 */
export function PistonHead({ x, y0, y1, width, theme }: { x: number; y0: number; y1: number; width: number; theme: CutawayTheme }) {
  return (
    <g>
      <rect className="piston-head" x={x} y={y0} width={width} height={y1 - y0} {...groundProps(theme)} />
      {[x + 3, x + width - 8].map(ringX => (
        <rect key={ringX} className="piston-seal" x={ringX} y={y0 - 1.5} width={5} height={y1 - y0 + 3} rx={1.5} fill={theme.seal} />
      ))}
    </g>
  );
}

/**
 * Rod guide: a ground-steel bearing sleeve pressed into the end cap on both sides of the rod, and a dark wiper ring at
 * the outer face. `x0` is the inner end of the bearing, `direction` points to the outside of the cylinder.
 */
export function RodBearing({ x0, length, direction, rodY0, rodY1, theme }: { x0: number; length: number; direction: 1 | -1; rodY0: number; rodY1: number; theme: CutawayTheme }) {
  const x = direction === 1 ? x0 : x0 - length;
  const sleeve = 5;
  const wiperX = direction === 1 ? x + length - 4 : x;
  return (
    <g className="rod-bearing" data-direction={direction}>
      {[rodY0 - sleeve - 1, rodY1 + 1].map(y => (
        <g key={y}>
          <rect x={x} y={y} width={length} height={sleeve} {...groundProps(theme)} />
          <rect className="rod-wiper" x={wiperX} y={y} width={4} height={sleeve} fill={theme.seal} />
        </g>
      ))}
    </g>
  );
}
