import React, { useId, useMemo } from 'react';
import { V3Math } from '@/components/ui/V3Math';
import type { Palette } from '@/simulators/shared/workspace/workspaceTheme';
import { useFluidT } from '../../i18n/fluidText';
import { labelToLatex } from '../../models/fluidLabel';
import { cycleView, displacementTrace, sensorMarks, signalLinks, type CycleTracker } from '../../models/functionDiagram';

export interface DiagramCylinder {
  id: string;
  /** ISO reference tag, e.g. `1A1`. */
  label: string;
  /** Position-sensor tags: [retracted (0 %), extended (100 %)], e.g. `1B1` / `1B2`. */
  sensors: [string, string];
}

export interface FunctionDiagramProps {
  colors: Palette;
  cylinders: DiagramCylinder[];
  tracker: CycleTracker;
  /** The simulation is running or paused: the playhead is shown. */
  active?: boolean;
  /** Tag of the start signal that begins step 1 (e.g. `1S1`). */
  startTag?: string;
}

/** Deep industrial blue for the first cylinder, violet for the second, then teal and amber. */
export const LANE_COLORS = ['#2563EB', '#7C3AED', '#0D9488', '#D97706'];
const SIGNAL_COLOR = '#E11D48';
const PLAYHEAD_COLOR = '#F59E0B';

/** One step column is as wide as a lane is tall, so a move across a whole stroke is a 45° ramp. */
export const COLUMN = 84;
export const RISE = 84;
const LEFT = 104;
const RIGHT = 56;
const TOP = 58;
const LANE_GAP = 54;
const BOTTOM = 78;

const html = (x: number, y: number, width: number, height: number, children: React.ReactNode, align: 'left' | 'center' | 'right' = 'center', className?: string) => (
  <foreignObject x={x} y={y} width={width} height={height} className={className} style={{ overflow: 'visible' }}>
    <div style={{ width, height, display: 'flex', alignItems: 'center', justifyContent: align === 'left' ? 'flex-start' : align === 'right' ? 'flex-end' : 'center', whiteSpace: 'nowrap' }}>{children}</div>
  </foreignObject>
);

/**
 * Displacement-step diagram of one sequence cycle: a fixed grid of step lines (1 · 2 · 3 · 4 · 1), one lane per cylinder with
 * straight 45° ramps for strokes and flat dwells, the position switches made at the end of each stroke, arrows from the switch
 * that fires to the stroke it starts, and a playhead that advances while the circuit runs.
 */
export function FunctionDiagram({ colors, cylinders, tracker, active = false, startTag }: FunctionDiagramProps) {
  const tr = useFluidT();
  const markerId = useId().replace(/:/g, '');
  const view = useMemo(() => cycleView(tracker), [tracker]);
  const marks = useMemo(() => sensorMarks(view), [view]);
  const links = useMemo(() => signalLinks(view), [view]);

  const lanes = Math.max(1, cylinders.length);
  const laneTop = (row: number) => TOP + row * (RISE + LANE_GAP);
  const gridHeight = lanes * RISE + (lanes - 1) * LANE_GAP;
  const width = LEFT + view.columns * COLUMN + RIGHT;
  const height = TOP + gridHeight + BOTTOM;
  const x = (column: number) => LEFT + column * COLUMN;
  const rowOf = (cylinderId: string) => Math.max(0, cylinders.findIndex(cylinder => cylinder.id === cylinderId));
  const y = (cylinderId: string, level: number) => laneTop(rowOf(cylinderId)) + RISE - level * RISE;
  const colorOf = (cylinderId: string) => LANE_COLORS[rowOf(cylinderId) % LANE_COLORS.length];
  const tagOf = (cylinderId: string, level: number) => cylinders[rowOf(cylinderId)]?.sensors[level === 1 ? 1 : 0] ?? '';
  const first = view.steps[0]?.moves[0];

  return (
    <div data-testid="function-diagram" data-columns={view.columns} data-complete={view.complete} data-cycle={view.cycleNumber} style={{ overflowX: 'auto' }}>
      <svg role="img" aria-label={tr('analysis.functionTab')} viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', maxWidth: width, height: 'auto', display: 'block', direction: 'ltr' }}>
        <defs>
          <marker id={`${markerId}-arrow`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill={SIGNAL_COLOR} /></marker>
        </defs>

        {/* step grid: line n is the state before step n; the last line closes the cycle */}
        {view.labels.map((label, line) => {
          const edge = line === 0 || line === view.columns;
          return (
            <g key={line} className="step-line" data-line={line}>
              <line x1={x(line)} x2={x(line)} y1={TOP - 14} y2={TOP + gridHeight + 24} stroke={colors.line} strokeWidth={edge ? 1.5 : 1} strokeDasharray={edge ? undefined : '4 4'} />
              {html(x(line) - COLUMN / 2, TOP + gridHeight + 28, COLUMN, 38, (
                <div className="step-label" data-step={label} style={{ textAlign: 'center', lineHeight: 1.15, color: colors.text }}>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{tr('analysis.functionStep')} <V3Math math={String(label)} /></div>
                  {line === view.columns && <div style={{ fontSize: 10, color: colors.muted }}>({tr('analysis.functionCycleComplete')})</div>}
                </div>
              ))}
            </g>
          );
        })}

        {Array.from({ length: lanes }, (_, row) => {
          const cylinder = cylinders[row];
          const top = laneTop(row);
          return (
            <g key={cylinder?.id ?? 'empty'} className="diagram-lane" data-cylinder={cylinder?.id}>
              {[0, 1].map(level => (
                <g key={level}>
                  <line x1={LEFT - 6} x2={x(view.columns)} y1={top + RISE - level * RISE} y2={top + RISE - level * RISE} stroke={colors.line} strokeWidth={1} />
                  <text className="level-label" x={LEFT - 12} y={top + RISE - level * RISE + 4} textAnchor="end" fontSize={11} fill={colors.muted}>{level}</text>
                </g>
              ))}
              {cylinder && html(6, top + RISE / 2 - 12, 56, 24, <span className="lane-label" style={{ color: LANE_COLORS[row % LANE_COLORS.length], fontSize: 16, fontWeight: 700 }}><V3Math math={labelToLatex(cylinder.label)} /></span>, 'left')}
              {cylinder && <text className="axis-title" x={68} y={top + RISE / 2} textAnchor="middle" fontSize={10} fill={colors.muted} transform={`rotate(-90 68 ${top + RISE / 2})`}>{tr('analysis.functionDisplacement')}</text>}
            </g>
          );
        })}

        {/* displacement traces: flat dwells and straight ramps */}
        {cylinders.map(cylinder => {
          const points = displacementTrace(view, cylinder.id).map(([column, level]) => `${x(column).toFixed(1)},${y(cylinder.id, level).toFixed(1)}`).join(' ');
          return <polyline key={cylinder.id} className="displacement-trace" data-cylinder={cylinder.id} points={points} fill="none" stroke={colorOf(cylinder.id)} strokeWidth={3} strokeLinejoin="miter" strokeLinecap="butt" />;
        })}

        {/* signal interlocks: the switch that trips at the end of a step starts the stroke of the next */}
        {links.map((link, index) => {
          const x0 = x(link.line);
          const from = y(link.from.cylinderId, link.from.level);
          const to = y(link.to.cylinderId, link.to.level);
          if (Math.abs(from - to) < 2) return null;
          return <line key={index} className="signal-link" data-line={link.line} x1={x0} x2={x0} y1={from} y2={to} stroke={SIGNAL_COLOR} strokeWidth={1.75} markerEnd={`url(#${markerId}-arrow)`} />;
        })}

        {/* position switches made at the end of each stroke */}
        {marks.map((mark, index) => (
          <g key={index} className="sensor-mark" data-sensor={tagOf(mark.cylinderId, mark.level)}>
            <circle cx={x(mark.line)} cy={y(mark.cylinderId, mark.level)} r={4} fill={SIGNAL_COLOR} />
            {html(x(mark.line) + 6, y(mark.cylinderId, mark.level) + (mark.level === 1 ? -22 : 4), 44, 18, <span style={{ fontSize: 11, color: colors.text }}><V3Math math={labelToLatex(tagOf(mark.cylinderId, mark.level))} /></span>, 'left')}
          </g>
        ))}

        {/* the start signal that begins step 1 */}
        {first && (
          <g className="start-signal">
            <line x1={x(0)} x2={x(0)} y1={TOP - 22} y2={y(first.cylinderId, first.direction === 1 ? 0 : 1)} stroke={SIGNAL_COLOR} strokeWidth={1.75} markerEnd={`url(#${markerId}-arrow)`} />
            {html(x(0) + 6, 2, 150, 20, <span style={{ fontSize: 11, fontWeight: 600, color: SIGNAL_COLOR }}>{startTag ? <V3Math math={labelToLatex(startTag)} /> : null}{startTag ? ' ' : ''}{tr('analysis.functionStart')}</span>, 'left')}
          </g>
        )}

        {view.steps.length === 0 && html(x(0), TOP + gridHeight / 2 - 12, view.columns * COLUMN, 24, <span style={{ fontSize: 12, color: colors.muted }}>{tr(cylinders.length === 0 ? 'analysis.functionEmpty' : 'analysis.functionWaiting')}</span>)}
        {html(width - RIGHT - 130, 2, 130, 20, <span data-testid="function-cycle" style={{ fontSize: 11, color: colors.muted }}>{tr('analysis.functionCycle', { n: view.cycleNumber })}</span>, 'right')}

        {/* playhead */}
        {active && view.playhead !== null && (
          <g className="playhead" data-position={view.playhead.toFixed(3)} style={{ transform: `translateX(${x(view.playhead)}px)`, transition: 'transform 120ms linear' }}>
            <line x1={0} x2={0} y1={TOP - 20} y2={TOP + gridHeight + 8} stroke={PLAYHEAD_COLOR} strokeWidth={2} />
            <path d={`M -6 ${TOP - 28} H 6 L 0 ${TOP - 18} Z`} fill={PLAYHEAD_COLOR} />
          </g>
        )}
      </svg>
    </div>
  );
}
