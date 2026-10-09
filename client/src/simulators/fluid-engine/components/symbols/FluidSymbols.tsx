import React, { useId } from 'react';
import { CELL, HYDRAULIC_POWER_UNIT, SERVICE_UNIT, VALVE_SPECS, cellPortPoint, cellX0, defaultFluidProps, getFluidDefinition, isHydraulicValve, restCellIndex, valveEdges, type CellState, type FluidCatalogEntry, type FluidMedium, type FluidProps, type PortKey } from '../../models/fluidCatalog';
import {
  ARROW_HALF_WIDTH,
  ARROW_LENGTH,
  CYLINDER,
  CYLINDER_BARREL_HEIGHT,
  CYLINDER_BARREL_WIDTH,
  DASH_PATTERN,
  END_CAP_LENGTH,
  LOGIC_ELEMENT_DIAMETER,
  LOGIC_VALVE_HEIGHT,
  LOGIC_VALVE_WIDTH,
  ONE_WAY_FLOW_CONTROL_HEIGHT,
  ONE_WAY_FLOW_CONTROL_WIDTH,
  PORT_STUB_LENGTH,
  ROTARY_HOUSING_DIAMETER,
  FRL_DIAMOND_SIZE,
  STROKE_SCALE,
  TIME_DELAY,
} from '../../models/fluidGrid';

import { renderComponentCanvasLabel } from '@/components/common/schematic/schematicLabel';

type Pt = [number, number];

/** Canvas-only annotations: limit-switch markers on a cylinder, linked-sensor tags on a valve. */
interface Annotations {
  sensorTags?: [string, string];
  sensorActive?: [boolean, boolean];
  operatorTags?: Partial<Record<'left' | 'right', string>>;
  /** Manual operators currently held / latched: the glyph visibly depresses. */
  operatorPressed?: Partial<Record<'left' | 'right', boolean>>;
  /** Shaft angle of an air motor in degrees (`snapshot.motors[id].angle`): the energy triangle orbits the centre by this much. */
  shaftAngle?: number;
}
/** Limit switches: deep grey at rest, industrial blue when tripped (with a crimson pip). */
const SENSOR_OFF = '#6B7280';
const SENSOR_ON = '#2563EB';
const SENSOR_PIP = '#E11D48';

/** `sw` is the outline width; detail lines and dashed lines are fixed fractions of it (2 / 1.5 / 1). */
interface Ctx { stroke: string; sw: number; hideText?: boolean }

/** outline: bodies, casings, terminals · detail: arrows, T-bars, springs, internal parts · dashed: pilot / sensing lines. */
type Kind = keyof typeof STROKE_SCALE;

function style({ stroke, sw }: Ctx, kind: Kind = 'outline', extra: { strokeDasharray?: string } = {}) {
  return {
    fill: 'none',
    stroke,
    strokeWidth: sw * STROKE_SCALE[kind],
    strokeLinejoin: 'round' as const,
    strokeLinecap: 'round' as const,
    ...(kind === 'dashed' ? { strokeDasharray: DASH_PATTERN } : {}),
    ...extra,
  };
}

const DASH_DOT = '12 4 2 4';

/** The one arrowhead used everywhere: filled, ARROW_LENGTH long, 2 × ARROW_HALF_WIDTH wide, tip at `to`. */
function Arrow({ from, to, ctx }: { from: Pt; to: Pt; ctx: Ctx }) {
  const dx = to[0] - from[0]; const dy = to[1] - from[1];
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len; const uy = dy / len;
  const bx = to[0] - ux * ARROW_LENGTH; const by = to[1] - uy * ARROW_LENGTH;
  const px = -uy * ARROW_HALF_WIDTH; const py = ux * ARROW_HALF_WIDTH;
  return <polygon className="arrowhead" points={`${to[0]},${to[1]} ${bx + px},${by + py} ${bx - px},${by - py}`} fill={ctx.stroke} stroke="none" />;
}

/** A line with an arrowhead at its end. */
const FlowLine = ({ a, b, ctx }: { a: Pt; b: Pt; ctx: Ctx }) => <g><path d={`M ${a[0]} ${a[1]} L ${b[0]} ${b[1]}`} {...style(ctx, 'detail')} /><Arrow from={a} to={b} ctx={ctx} /></g>;

/** Shut-off: the port line ends in a perpendicular T-bar just inside the envelope. */
function Block({ at, ctx }: { at: Pt; ctx: Ctx }) {
  const inward = at[1] < 0 ? 1 : -1;
  const y = at[1] + inward * 10;
  return <path d={`M ${at[0]} ${at[1]} V ${y} M ${at[0] - 7} ${y} H ${at[0] + 7}`} {...style(ctx, 'detail')} />;
}

const Mono = ({ x, y, children, ctx, anchor = 'start', fill, className }: { x: number; y: number; children: React.ReactNode; ctx: Ctx; anchor?: 'start' | 'middle' | 'end'; fill?: string; className?: string }) => ctx.hideText ? null : (
  <text className={className} x={x} y={y} fontSize={13} letterSpacing="0.025em" fill={fill ?? ctx.stroke} textAnchor={anchor} style={{ userSelect: 'none' }}>
    {typeof children === 'string' || typeof children === 'number' ? renderComponentCanvasLabel(String(children)) : children}
  </text>
);

/** How far a pushbutton / plunger travels into its casing when operated. */
export const PRESS_DEPTH = 4;
/** Air motor: housing radius, energy-triangle height and half width; the triangle's apex orbits at R − height − 2 so its base stays inside the housing. */
export const MOTOR = { radius: 30, triangleHeight: 18, triangleHalfWidth: 6 } as const;
export const MOTOR_ORBIT_RADIUS = MOTOR.radius - MOTOR.triangleHeight - 2;
/** Open energy triangle for a motor: apex towards the centre at the orbit radius, base on the housing side; `dir` -1 is the upper one, +1 the lower. */
function MotorTriangle({ dir, angle, ctx, filled }: { dir: 1 | -1; angle: number; ctx: Ctx; filled: boolean }) {
  const apex = dir * MOTOR_ORBIT_RADIUS;
  const base = dir * (MOTOR_ORBIT_RADIUS + MOTOR.triangleHeight);
  return <polygon className="motor-triangle" data-angle={angle} points={`0,${apex} ${-MOTOR.triangleHalfWidth},${base} ${MOTOR.triangleHalfWidth},${base}`} transform={`rotate(${angle})`} {...style(ctx, 'detail')} fill={filled ? ctx.stroke : 'none'} />;
}

/** Height of each operator glyph above the stem axis: its tag sits 12 px above this. */
const OPERATOR_TOP: Record<string, number> = { Pushbutton: 11, 'Hand Lever': 20, 'Detent Lever': 17.1, 'Foot Pedal': 9, Plunger: 8, Roller: 12, 'Idle-Return Roller': 12, Solenoid: 12 };
/** How far the detent lever drops into its notch when latched (tooth tip 9 → notch bottom 13). */
const DETENT_DROP = 4;
/** Operated glyphs take a translucent fill of the line colour. */
const PRESSED_FILL = 0.3;

/**
 * The strip of envelopes slides one square per unit of spool offset. The valve, its caps and the click targets all use
 * this one definition, so what is drawn and what can be clicked can never drift apart.
 */
export const spoolShift = (spoolOffset = 0) => spoolOffset * CELL;
export const SPOOL_TRANSITION = 'transform 150ms cubic-bezier(0.4, 0, 0.2, 1)';
export const spoolSlideStyle = (spoolOffset = 0): React.CSSProperties => ({ transform: `translateX(${spoolShift(spoolOffset)}px)`, transition: SPOOL_TRANSITION });

/* ── Actuation end-caps: drawn outward (+x) from the envelope edge, all END_CAP_LENGTH (30) long, centred on y = 0 ── */
function EndCap({ kind, ctx, pressed = false, hydraulic = false }: { kind: string; ctx: Ctx; pressed?: boolean; hydraulic?: boolean }) {
  const s = style(ctx, 'detail');
  const fill = pressed ? { fill: ctx.stroke, fillOpacity: PRESSED_FILL } : {};
  const d = PRESS_DEPTH;
  const dot = (cx: number, cy: number, r: number) => <circle cx={cx} cy={cy} r={r} fill={ctx.stroke} stroke="none" />;
  switch (kind) {
    // Two parallel guide stems enter the casing; a flat cap closes them at the outer end. Operated, the cap sinks PRESS_DEPTH towards the casing.
    case 'Pushbutton': return <path d={`M 0 -5 H ${24 - (pressed ? d : 0)} M 0 5 H ${24 - (pressed ? d : 0)} M ${24 - (pressed ? d : 0)} -11 H ${30 - (pressed ? d : 0)} V 11 H ${24 - (pressed ? d : 0)} Z`} {...s} {...fill} />;
    // Stem, then a 45° arm ending in a solid knob (a 12 px stem keeps the whole operator inside the 30 px cap length).
    case 'Hand Lever': return <g><path d="M 0 0 H 12.9 L 27 -14.1" {...s} />{dot(27, -14.1, 3)}{pressed && <circle cx={27} cy={-14.1} r={6} {...s} {...fill} />}</g>;
    // The lever with its locking detent: a horizontal stem ends in a V-shaped tooth that rests on a notched seat fixed to the casing.
    // Latched, the whole lever drops so the tooth sits in the bottom of the notch.
    case 'Detent Lever': {
      const drop = pressed ? DETENT_DROP : 0;
      return (
        <g className="detent-lever" data-latched={pressed}>
          <path className="detent-seat" d="M 6 8 H 13 L 17 13 L 21 8 H 28" {...s} />
          <g className="detent-arm" style={{ transform: `translateY(${drop}px)`, transition: 'transform 150ms cubic-bezier(0.4, 0, 0.2, 1)' }}>
            <path d="M 0 0 H 12.9 L 27 -14.1" {...s} />{dot(27, -14.1, 3)}
            <path className="detent-tooth" d="M 17 0 V 3 M 13 3 H 21 L 17 9 Z" {...s} fill={ctx.stroke} />
          </g>
        </g>
      );
    }
    // Angled stem carrying a footplate inclined at 20°.
    case 'Foot Pedal': return <path d="M 0 0 H 8 L 12 -9 L 30 -2.5" {...s} transform={pressed ? `translate(${-d},0)` : undefined} />;
    // Rounded convex cap on a short stem.
    case 'Plunger': {
      const o = pressed ? -d : 0;
      const dome = [[22, -8], [26, -6], [29, -3], [30, 0], [29, 3], [26, 6], [22, 8]].map(([x, y]) => `L ${x + o} ${y}`).join(' ');
      return <path d={`M 0 0 H ${12 + o} M ${12 + o} -8 H ${22 + o} ${dome} H ${12 + o} Z`} {...s} {...fill} />;
    }
    // Symmetrical zig-zag spring: five vertices, four strokes, mirrored about the cap's centre line.
    case 'Spring Return':
    case 'Spring Centred': return <path d="M 0 0 H 3 L 6 -8 L 10.5 8 L 15 -8 L 19.5 8 L 24 -8 L 27 0 H 30" {...s} />;
    // Solenoid: a 20 × 24 rectangle on the push pin carrying the energy triangle, apex towards the valve body; solid for oil, open for air.
    case 'Solenoid': return <g><path d="M 0 0 H 10 M 10 -12 H 30 V 12 H 10 Z" {...s} {...fill} /><polygon className="solenoid-triangle" points="13,0 26,-7 26,7" {...s} fill={hydraulic ? ctx.stroke : 'none'} /></g>;
    // Roller on an inclined arm; the disc is tangent to the arm's end.
    // Depressed by its cam, the whole roller sinks PRESS_DEPTH towards the casing.
    case 'Roller': return <g className="roller" data-pressed={pressed} transform={pressed ? `translate(${-d},0)` : undefined}><path d="M 0 0 H 4 L 16 -5" {...s} /><circle cx={23} cy={-5} r={7} {...s} {...fill} />{dot(23, -5, 1.5)}</g>;
    case 'Idle-Return Roller': return <g className="roller" data-pressed={pressed} transform={pressed ? `translate(${-d},0)` : undefined}><path d="M 0 0 H 4 L 16 -5" {...s} /><circle cx={23} cy={-5} r={7} {...s} {...fill} /><path d="M 10 14 L 30 -8" {...s} /><Arrow from={[10, 14]} to={[30, -8]} ctx={ctx} /></g>;
    // Equilateral triangle (12 px sides) pointing into the casing at the pilot terminal: solid for oil, open for air (ISO 1219).
    case 'Pneumatic Pilot': return <g><polygon className="pilot-triangle" points="0,0 10.39,-6 10.39,6" {...s} fill={hydraulic ? ctx.stroke : 'none'} /><path d="M 10.39 0 H 30" {...s} /></g>;
    default: return null;
  }
}

function PortStub({ p, ctx, edge }: { p: { x: number; y: number }; ctx: Ctx; edge: Pt }) {
  return <path d={`M ${edge[0]} ${edge[1]} L ${p.x} ${p.y}`} {...style(ctx)} />;
}

function Cell({ x0, state, spec, ctx, index, active }: { x0: number; state: CellState; spec: (typeof VALVE_SPECS)[string]; ctx: Ctx; index: number; active: boolean }) {
  const pt = (k: PortKey) => cellPortPoint(spec, k, index);
  return (
    <g>
      <rect x={x0} y={-CELL / 2} width={CELL} height={CELL} {...style(ctx)} fill={active ? ctx.stroke : 'none'} fillOpacity={active ? 0.14 : 0} />
      {state.flows.map(([a, b]) => <FlowLine key={`${a}${b}`} a={pt(a)} b={pt(b)} ctx={ctx} />)}
      {state.blocks.map(k => spec.ports[k] ? <Block key={k} at={pt(k)} ctx={ctx} /> : null)}
    </g>
  );
}

/**
 * Directional valve. Ports, stubs, tank glyphs and labels are static on the grid; the whole strip of envelopes
 * (plus its operators, which are part of the same rigid body) slides inside `valve-envelope-spool` so the active
 * chamber sits over the fixed ports. The origin is the centre of the rest chamber, so every port column is a grid point.
 */
function Valve({ def, props, ctx, activeCell, spoolOffset = 0, operatorTags, operatorPressed }: { def: FluidCatalogEntry; props: FluidProps; ctx: Ctx; activeCell?: number; spoolOffset?: number } & Pick<Annotations, 'operatorTags' | 'operatorPressed'>) {
  const spec = VALVE_SPECS[def.type];
  const edges = valveEdges(spec);
  const ports = def.portsFor(props);
  const hydraulic = isHydraulicValve(def.type);
  const clipBase = useId().replace(/[^a-zA-Z0-9]/g, '');
  return (
    <g>
      <g className="valve-envelope-spool" data-offset={spoolOffset} style={spoolSlideStyle(spoolOffset)}>
        {spec.cells.map((state, i) => <Cell key={i} x0={cellX0(spec, i)} state={state} spec={spec} ctx={ctx} index={i} active={activeCell === i} />)}
        {([['actuationLeft', -1], ['actuationRight', 1]] as const).map(([key, side]) => {
          const kind = String(props[key] ?? 'None');
          if (kind === 'None') return null;
          const pressed = Boolean(operatorPressed?.[side < 0 ? 'left' : 'right']);
          const tag = operatorTags?.[side < 0 ? 'left' : 'right'];
          return (
            <React.Fragment key={key}>
              <g className="valve-end-cap" data-side={side < 0 ? 'left' : 'right'} data-pressed={pressed} transform={`translate(${side < 0 ? edges.left : edges.right},0) scale(${side},1)`}>
                <EndCap kind={kind} ctx={ctx} pressed={pressed} hydraulic={hydraulic} />
              </g>
              {/* The tag belongs to the operator: it rides the sliding strip with its cap, centred 12 px above the glyph, never over a chamber. */}
              {tag && <Mono className="operator-tag" x={side < 0 ? edges.left - END_CAP_LENGTH / 2 : edges.right + END_CAP_LENGTH / 2} y={-(OPERATOR_TOP[kind] ?? 12) - 12} ctx={ctx} anchor="middle">{tag}</Mono>}
            </React.Fragment>
          );
        })}
      </g>
      {/*
        Pilot terminals never move. Each pin sits beyond the furthest its cap can travel, and a rigid lead joins it to the cap.
        The lead is drawn on the sliding strip but clipped at the pin, so it always spans exactly pin → cap, never crosses the
        body, and moves in step with the cap during the slide.
      */}
      {ports.filter(p => p.type === 'PILOT').map(p => {
        const left = p.x < 0;
        const clipId = `${clipBase}${p.id}`;
        const capOuter = left ? edges.left - END_CAP_LENGTH : edges.right + END_CAP_LENGTH;
        const reach = 2 * CELL;
        return (
          <g key={`${p.id}-lead`} className="pilot-lead" data-port={p.id}>
            <clipPath id={clipId}><rect x={left ? p.x : p.x - 2 * reach} y={-10} width={2 * reach} height={20} /></clipPath>
            <g clipPath={`url(#${clipId})`}>
              <g className="pilot-lead-slide" style={spoolSlideStyle(spoolOffset)}>
                <path d={`M ${capOuter} 0 H ${capOuter + (left ? -reach : reach)}`} {...style(ctx, 'detail')} />
              </g>
            </g>
            <circle cx={p.x} cy={0} r={2.5} fill={ctx.stroke} stroke="none" />
          </g>
        );
      })}
      {ports.filter(p => p.type !== 'PILOT').map(p => {
        const edge: Pt = [p.x, p.y < 0 ? -CELL / 2 : CELL / 2];
        return (
          <g key={p.id}>
            <PortStub p={p} ctx={ctx} edge={edge} />
            <Mono x={p.x + 5} y={p.y < 0 ? -CELL / 2 - 8 : CELL / 2 + 18} ctx={ctx}>{hydraulic ? p.lettering : p.isoNumber}</Mono>
          </g>
        );
      })}
      {ports.filter(p => p.type === 'PILOT').map(p => (
        <Mono key={p.id} x={p.x + (p.x < 0 ? 6 : -6)} y={-8} ctx={ctx} anchor={p.x < 0 ? 'start' : 'end'}>{p.isoNumber}</Mono>
      ))}
    </g>
  );
}

const DIAMOND_HALF = FRL_DIAMOND_SIZE / 2;
const LOGIC_ELEMENT_RADIUS = LOGIC_ELEMENT_DIAMETER / 2;

function Diamond({ ctx }: { ctx: Ctx }) {
  return <path className="frl-diamond" d={`M ${-DIAMOND_HALF} 0 L 0 ${-DIAMOND_HALF} L ${DIAMOND_HALF} 0 L 0 ${DIAMOND_HALF} Z`} {...style(ctx)} />;
}

function Gauge({ cx, cy, ctx, r = 15 }: { cx: number; cy: number; ctx: Ctx; r?: number }) {
  const k = r / 15;
  const tail: Pt = [cx - 5 * k, cy + 5 * k];
  const tip: Pt = [cx + 6 * k, cy - 7 * k];
  return <g><circle cx={cx} cy={cy} r={r} {...style(ctx)} /><path d={`M ${tail[0]} ${tail[1]} L ${tip[0]} ${tip[1]}`} {...style(ctx, 'detail')} /><Arrow from={tail} to={tip} ctx={ctx} /></g>;
}

/** Zig-zag spring along the x axis from x0 to x1 at height y: a constant number of coils of constant amplitude. */
function HSpring({ x0, x1, y = 0, n = 5, amp = 8, ctx }: { x0: number; x1: number; y?: number; n?: number; amp?: number; ctx: Ctx }) {
  const lead = Math.min(4, (x1 - x0) / 8);
  const span = x1 - x0 - 2 * lead;
  const pts: string[] = [`${x0},${y}`, `${x0 + lead},${y}`];
  for (let i = 0; i < n; i += 1) pts.push(`${x0 + lead + span * ((i + 0.5) / n)},${y + (i % 2 === 0 ? -amp : amp)}`);
  pts.push(`${x1 - lead},${y}`, `${x1},${y}`);
  return <polyline className="spring-coil" points={pts.join(' ')} {...style(ctx, 'detail')} />;
}

/** Exhaust vent triangle (apex pointing away from the line). */
const Vent = ({ x, y, dir, ctx, kind = 'detail' }: { x: number; y: number; dir: 1 | -1; ctx: Ctx; kind?: Kind }) => (
  <polygon points={`${x - 8},${y} ${x + 8},${y} ${x},${y + dir * 14}`} {...style(ctx, kind)} />
);

const SQUARE_HALF = CELL / 2;

/** Spring-opposed adjustable setting on the right of a 60 px envelope: a 30 px spring plus an oblique adjust arrow. */
function AdjustableSpring({ ctx }: { ctx: Ctx }) {
  return <g><HSpring x0={SQUARE_HALF} x1={SQUARE_HALF + END_CAP_LENGTH} ctx={ctx} n={4} amp={8} /><path d="M 36 18 L 54 -18" {...style(ctx, 'detail')} /><Arrow from={[36, 18]} to={[54, -18]} ctx={ctx} /></g>;
}

/** Dashed sensing / pilot line entering the envelope's left side, ending in a pilot arrowhead on the wall. */
function Sensing({ path, ctx }: { path: string; ctx: Ctx }) {
  return <g><path d={path} {...style(ctx, 'dashed')} /><Arrow from={[-38, 0]} to={[-SQUARE_HALF, 0]} ctx={ctx} /></g>;
}

/** Regulating / sequence envelope: one 60 × 60 square, offset arrow, adjustable spring. */
function PressureEnvelope({ ctx, closedArrow = false }: { ctx: Ctx; closedArrow?: boolean }) {
  const tipY = closedArrow ? -12 : -24;
  return (
    <g>
      <rect className="valve-square" x={-SQUARE_HALF} y={-SQUARE_HALF} width={CELL} height={CELL} {...style(ctx)} />
      <path d={`M -10 24 V ${tipY + ARROW_LENGTH}`} {...style(ctx, 'detail')} />
      <Arrow from={[-10, tipY + ARROW_LENGTH]} to={[-10, tipY]} ctx={ctx} />
      <AdjustableSpring ctx={ctx} />
    </g>
  );
}

/** Port stubs of a vertical pressure valve and its dashed sensing line from the outlet. */
const SENSE_OUTLET = 'M 0 -40 H -40 V 0 H -30';
const SENSE_INLET = 'M 0 40 H -40 V 0 H -30';

const CUSHION_END = (value: unknown) => {
  const v = String(value ?? 'None');
  return { rear: v !== 'None', front: v.endsWith('both'), adjustable: v.startsWith('Adjustable') };
};

/**
 * Cylinder: a 160 × 60 barrel centred on the origin with 6 px end flanges, the piston disc spanning the whole
 * 54 px interior and a rigid 160 px rod on the axis. At 0 % the rod sticks 40 px out of the front cap, at 100 %
 * 120 px. Both working ports leave the bottom edge (x = ±60). The piston/rod assembly translates with the stroke.
 */
const BARREL_HALF = CYLINDER_BARREL_WIDTH / 2;
const BARREL_HALF_HEIGHT = CYLINDER_BARREL_HEIGHT / 2;
const PISTON_HALF_HEIGHT = CYLINDER.interiorHeight / 2;
/** Spring amplitude: the coils touch the interior top and bottom (a 50 px swing inside the 54 px bore). */
const SPRING_AMPLITUDE = PISTON_HALF_HEIGHT - 2;
const PISTON_THICKNESS = 6;
/** Entry triangle seated on the bottom casing line (y = 30) directly above its port: 8 wide, 10 high, apex pointing up into the chamber. */
const ENTRY_TRIANGLE = { tipY: BARREL_HALF_HEIGHT - 10, baseY: BARREL_HALF_HEIGHT, halfBase: 4 } as const;

function Cylinder({ def, props, ctx, extension, medium, sensorTags, sensorActive }: { def: FluidCatalogEntry; props: FluidProps; ctx: Ctx; extension: number; medium: FluidMedium } & Pick<Annotations, 'sensorTags' | 'sensorActive'>) {
  const s = style(ctx);
  const detail = style(ctx, 'detail');
  const single = def.type === 'cylinder-single';
  const dual = def.type === 'cylinder-double-rod';
  const shift = CYLINDER.travel * extension;
  const rest = CYLINDER.pistonRest;
  const cushion = CUSHION_END(props.cushioning);
  const cushionBox = (cx: number, key: string) => (
    <g key={key}>
      <rect x={cx - 4} y={-10} width={8} height={20} {...detail} />
      {cushion.adjustable && <g><path d={`M ${cx - 10} 14 L ${cx + 10} -14`} {...detail} /><Arrow from={[cx - 10, 14]} to={[cx + 10, -14]} ctx={ctx} /></g>}
    </g>
  );
  return (
    <g>
      <rect className="cylinder-barrel" x={-BARREL_HALF} y={-BARREL_HALF_HEIGHT} width={CYLINDER_BARREL_WIDTH} height={CYLINDER_BARREL_HEIGHT} {...s} />
      {/* flanged end caps: tabs protrude above and below the barrel */}
      {[-BARREL_HALF - CYLINDER.flangeWidth, BARREL_HALF].map(x => (
        <rect key={x} className="cylinder-flange" x={x} y={-BARREL_HALF_HEIGHT - CYLINDER.flange} width={CYLINDER.flangeWidth} height={CYLINDER_BARREL_HEIGHT + 2 * CYLINDER.flange} {...s} />
      ))}
      {def.ports.map(p => <path key={p.id} d={`M ${p.x} ${BARREL_HALF_HEIGHT} V ${p.y}`} {...s} />)}
      {/* ISO 1219 fluid-power triangle inside the chamber, above each port and pointing in from it: solid for oil, open for air. */}
      {def.ports.map(p => <polygon key={p.id} className="entry-triangle" data-medium={medium} points={`${p.x},${ENTRY_TRIANGLE.tipY} ${p.x - ENTRY_TRIANGLE.halfBase},${ENTRY_TRIANGLE.baseY} ${p.x + ENTRY_TRIANGLE.halfBase},${ENTRY_TRIANGLE.baseY}`} {...detail} fill={medium === 'HYDRAULIC' ? ctx.stroke : 'none'} />)}
      {/* Limit switches: a bracket above the barrel at each end of the piston travel, where the switch is mounted. */}
      {sensorTags && ([rest, rest + CYLINDER.travel] as const).map((x, end) => {
        const color = sensorActive?.[end] ? SENSOR_ON : SENSOR_OFF;
        return (
          <g key={end} className="cylinder-sensor" data-end={end === 0 ? 'retracted' : 'extended'} data-active={Boolean(sensorActive?.[end])}>
            <path d={`M ${x - 6} -34 V -42 H ${x + 6} V -34`} {...detail} stroke={color} />
            {sensorActive?.[end] && <circle className="sensor-pip" cx={x} cy={-38} r={2} fill={SENSOR_PIP} stroke="none" />}
            <Mono x={x} y={-47} ctx={ctx} anchor="middle" fill={color}>{sensorTags[end]}</Mono>
          </g>
        );
      })}
      {/* Return spring between the piston and the front cap: constant coil count and amplitude, so it compresses without distortion. */}
      {single && <HSpring x0={rest + shift} x1={BARREL_HALF} n={8} amp={SPRING_AMPLITUDE} ctx={ctx} />}
      <g className="piston-rod-assembly" data-stroke={Math.round(extension * 100)} style={{ transform: `translateX(${shift}px)` }}>
        <rect className="piston-disc" x={rest - PISTON_THICKNESS / 2} y={-PISTON_HALF_HEIGHT} width={PISTON_THICKNESS} height={CYLINDER.interiorHeight} fill={ctx.stroke} stroke={ctx.stroke} strokeWidth={ctx.sw * STROKE_SCALE.outline} strokeLinejoin="round" />
        <path className="piston-rod" d={`M ${rest} 0 H ${rest + CYLINDER.rodLength}`} {...s} />
        {dual && <path className="piston-rod" d={`M ${rest} 0 H ${rest - CYLINDER.rodLength}`} {...s} />}
        {!single && cushion.rear && cushionBox(rest - PISTON_THICKNESS / 2 - 4, 'rear')}
        {!single && cushion.front && cushionBox(rest + PISTON_THICKNESS / 2 + 4, 'front')}
      </g>
    </g>
  );
}

/**
 * Non-return seat and ball. The seat is an open V (30° half-angle, vertex at x = -12, opening towards +x); the
 * 16 px ball sits in its mouth exactly tangent to both arms (centre x = vertex + r / sin 30° = 4), so nothing overlaps.
 * The ball's right edge is at x = 12; `lift` slides the ball off its seat.
 */
const SEAT_VERTEX = -12;
const SEAT_ARM = 26;
const SEAT_HALF_ANGLE = Math.PI / 6;
const SEAT_TIP_X = SEAT_VERTEX + SEAT_ARM * Math.cos(SEAT_HALF_ANGLE);
const SEAT_TIP_Y = SEAT_ARM * Math.sin(SEAT_HALF_ANGLE);
const BALL_SEATED_X = SEAT_VERTEX + LOGIC_ELEMENT_RADIUS / Math.sin(SEAT_HALF_ANGLE);
const round1 = (value: number) => Math.round(value * 10) / 10;

function CheckCore({ ctx, lift = 0, kind = 'outline' }: { ctx: Ctx; lift?: number; kind?: Kind }) {
  return (
    <g>
      <path className="check-seat" d={`M ${round1(SEAT_TIP_X)} ${-SEAT_TIP_Y} L ${SEAT_VERTEX} 0 L ${round1(SEAT_TIP_X)} ${SEAT_TIP_Y}`} {...style(ctx, kind)} />
      <circle className="logic-element" cx={BALL_SEATED_X} cy={0} r={LOGIC_ELEMENT_RADIUS} {...style(ctx, kind)} style={{ transform: `translateX(${lift}px)`, transition: 'transform 150ms ease-out' }} />
    </g>
  );
}

/** Adjustable throttle: two pinching arcs around the flow line and an oblique variation arrow. */
function ThrottleGlyph({ cx, cy, k = 1, ctx, kind = 'outline' }: { cx: number; cy: number; k?: number; ctx: Ctx; kind?: Kind }) {
  const a: Pt = [cx - 16 * k, cy + 16 * k];
  const b: Pt = [cx + 16 * k, cy - 16 * k];
  return (
    <g>
      <path d={`M ${cx - 16 * k} ${cy - 12 * k} Q ${cx} ${cy + 6 * k} ${cx + 16 * k} ${cy - 12 * k}`} {...style(ctx, kind)} />
      <path d={`M ${cx - 16 * k} ${cy + 12 * k} Q ${cx} ${cy - 6 * k} ${cx + 16 * k} ${cy + 12 * k}`} {...style(ctx, kind)} />
      <path d={`M ${a[0]} ${a[1]} L ${b[0]} ${b[1]}`} {...style(ctx, 'detail')} />
      <Arrow from={a} to={b} ctx={ctx} />
    </g>
  );
}

/** Travel in px of the moving parts at offset ±1. */
/** H-spool of the AND valve: the left disc ends up exactly under the outlet (x = 0). */
const AND_TRAVEL = 16;
/** Ball of the OR / quick-exhaust valve: from the middle onto a seat (tangent to both arms of the funnel). */
const BALL_TRAVEL = 50.5;
const CHECK_LIFT = 5;

const slide = (dx: number, dy = 0, ms = 150) => ({ transform: `translate(${dx}px,${dy}px)`, transition: `transform ${ms}ms ease-out` });

const AND_DISC_HALF = 13;

/** Outer envelope shared by the AND, OR and quick-exhaust valves: 120 × 60, the size of a 2-chamber valve. */
function LogicEnvelope({ ctx }: { ctx: Ctx }) {
  return <rect className="logic-envelope" x={-LOGIC_VALVE_WIDTH / 2} y={-LOGIC_VALVE_HEIGHT / 2} width={LOGIC_VALVE_WIDTH} height={LOGIC_VALVE_HEIGHT} {...style(ctx)} />;
}

/**
 * Two opposed conical seats, each a pair of lines that start on the inner wall (4 px either side of the inlet axis)
 * and open towards the middle (to ±20 at 30 px from the wall). Used by the shuttle and the quick-exhaust valve alike.
 */
function ConicalSeats({ ctx }: { ctx: Ctx }) {
  const w = LOGIC_VALVE_WIDTH / 2;
  return (
    <path className="conical-seats" d={`M ${-w} -4 L ${-w + 30} -20 M ${-w} 4 L ${-w + 30} 20 M ${w} -4 L ${w - 30} -20 M ${w} 4 L ${w - 30} 20`} {...style(ctx, 'detail')} />
  );
}

/**
 * Time-delay valve (NC), ISO 1219: a dash-dot housing around a pilot chain and a 3/2 valve.
 * Pilot chain, left → right: port 12, a throttle in parallel with a check valve that lets the signal return freely, then a
 * reservoir tee'd off the dashed pilot line, which ends on the valve's pilot cap. The 3/2 valve (1 blocked, 2 → 3 at rest;
 * spring on the right) slides like any directional valve: `spoolOffset` 1 puts the open chamber (1 → 2) over the ports.
 */
function TimeDelayValve({ ctx, spoolOffset = 0, activeCell, hydraulic = false }: { ctx: Ctx; spoolOffset?: number; activeCell?: number; hydraulic?: boolean }) {
  const spec = VALVE_SPECS['valve-3-2-nc'];
  const edges = valveEdges(spec);
  const s = style(ctx);
  const detail = style(ctx, 'detail');
  const dashed = style(ctx, 'dashed');
  const clipId = `${useId().replace(/[^a-zA-Z0-9]/g, '')}pilot`;
  const pin = edges.left - END_CAP_LENGTH;
  const capOuter = pin;
  const junction = pin - 15;
  const reservoir = { x: junction - 11, y: -52, width: 22, height: 38 };
  const throttleX = (TIME_DELAY.left + 10 + junction - 15) / 2;
  const bus = { in: TIME_DELAY.left + 10, out: junction - 15 };
  return (
    <g className="time-delay-valve">
      <rect className="td-housing" x={TIME_DELAY.left} y={-60} width={TIME_DELAY.right - TIME_DELAY.left} height={120} {...s} strokeDasharray={DASH_DOT} />
      {/* external pilot signal 12 */}
      <path d={`M ${TIME_DELAY.pilotX} 0 H ${bus.in}`} {...s} />
      <circle cx={bus.in} cy={0} r={2.5} fill={ctx.stroke} stroke="none" />
      <path d={`M ${bus.in} -20 V 20 M ${bus.out} -20 V 20`} {...dashed} />
      {/* top branch: adjustable throttle */}
      <path d={`M ${bus.in} -20 H ${bus.out}`} {...dashed} />
      <ThrottleGlyph cx={throttleX} cy={-20} k={0.5} ctx={ctx} kind="detail" />
      {/* bottom branch: check valve whose seat faces the reservoir, so only the return flow passes it */}
      <path d={`M ${bus.in} 20 H ${bus.out}`} {...dashed} />
      <g className="td-check" transform={`translate(${throttleX},20) scale(-1,1)`}><CheckCore ctx={ctx} kind="detail" /></g>
      <circle cx={bus.out} cy={0} r={2.5} fill={ctx.stroke} stroke="none" />
      {/* pilot line to the valve, with the reservoir tee'd off it */}
      <path d={`M ${bus.out} 0 H ${pin}`} {...dashed} />
      <circle cx={junction} cy={0} r={2.5} fill={ctx.stroke} stroke="none" />
      <path d={`M ${junction} 0 V ${reservoir.y + reservoir.height}`} {...dashed} />
      <rect className="td-reservoir" x={reservoir.x} y={reservoir.y} width={reservoir.width} height={reservoir.height} rx={reservoir.width / 2} {...s} />
      {/* 3/2 NC valve: the strip, its pilot cap and its return spring slide together; the pilot lead is clipped at the fixed pin */}
      <g className="valve-envelope-spool" data-offset={spoolOffset} style={spoolSlideStyle(spoolOffset)}>
        {spec.cells.map((state, i) => <Cell key={i} x0={cellX0(spec, i)} state={state} spec={spec} ctx={ctx} index={i} active={activeCell === i} />)}
        <g className="valve-end-cap" data-side="right" transform={`translate(${edges.right},0)`}><EndCap kind="Spring Return" ctx={ctx} /></g>
      </g>
      <clipPath id={clipId}><rect x={pin} y={-10} width={2 * CELL} height={20} /></clipPath>
      <g clipPath={`url(#${clipId})`}>
        <g className="pilot-lead-slide" style={spoolSlideStyle(spoolOffset)}>
          <g className="valve-end-cap" data-side="left" transform={`translate(${edges.left},0) scale(-1,1)`}><EndCap kind="Pneumatic Pilot" ctx={ctx} hydraulic={hydraulic} /></g>
          <path d={`M ${capOuter} 0 H ${capOuter - 2 * CELL}`} {...detail} />
        </g>
      </g>
      {([['1', TIME_DELAY.p1, 1], ['2', TIME_DELAY.p2, -1], ['3', TIME_DELAY.p3, 1]] as const).map(([id, x, dir]) => (
        <g key={id}>
          <path d={`M ${x} ${dir * CELL / 2} V ${dir * 2 * PORT_STUB_LENGTH}`} {...s} />
          <Mono x={x + 5} y={dir < 0 ? -CELL / 2 - 8 : CELL / 2 + 18} ctx={ctx}>{id}</Mono>
        </g>
      ))}
      <Mono x={TIME_DELAY.pilotX + 6} y={-8} ctx={ctx}>12</Mono>
    </g>
  );
}

/** Combined air-service unit, always with its lubricator. Enclosure ±160 × (−90 … 70); flow runs left → right through filter, regulator, lubricator. */
function ServiceUnit({ ctx }: { ctx: Ctx }) {
  const s = style(ctx);
  const detail = style(ctx, 'detail');
  return (
    <g>
      <rect x={-160} y={-90} width={320} height={160} {...s} strokeDasharray={DASH_DOT} />
      <path d={`M -180 0 H -140 M -80 0 H -${SQUARE_HALF} M ${SQUARE_HALF} 0 H 80 M 140 0 H 180`} {...s} />
      {/* filter with its automatic-drain float line and drain */}
      <g transform="translate(-110,0)"><Diamond ctx={ctx} /><path d="M 0 -30 V 30" {...style(ctx, 'dashed')} /><path d="M -15 15 H 15" {...detail} /><path d="M 0 30 V 90" {...s} /></g>
      {/* regulator: spring on top, sensing line from the outlet */}
      <rect className="valve-square" x={-SQUARE_HALF} y={-SQUARE_HALF} width={CELL} height={CELL} {...s} />
      <path d="M -22 8 H 22" {...detail} /><Arrow from={[14, 8]} to={[22, 8]} ctx={ctx} />
      <g transform={`translate(0,${-SQUARE_HALF}) rotate(-90)`}><HSpring x0={0} x1={END_CAP_LENGTH + 2} n={4} amp={8} ctx={ctx} /></g>
      <path d="M -10 -38 L 10 -56" {...detail} /><Arrow from={[-10, -38]} to={[10, -56]} ctx={ctx} />
      <path d="M 55 0 V 46 H -14 V 30" {...style(ctx, 'dashed')} /><Arrow from={[-14, 38]} to={[-14, SQUARE_HALF]} ctx={ctx} />
      {/* pressure gauge tapped off the outlet */}
      <circle cx={55} cy={0} r={3} fill={ctx.stroke} stroke="none" /><path d="M 55 0 V -45" {...detail} /><Gauge cx={55} cy={-60} ctx={ctx} />
      <g transform="translate(110,0)"><Diamond ctx={ctx} /><path d="M 0 -30 V 0" {...detail} /></g>
    </g>
  );
}

/** Composite 0Z1: source → simple FRL on one line, the 2/2 shut-off valve stacked above the FRL, all inside a tight ISO dashed boundary. See SERVICE_UNIT. The 0Z1 tag is the canvas instance label, centred above the bounds. */
function MainServiceUnit({ props, ctx, medium, operatorTags, operatorPressed }: { props: FluidProps; ctx: Ctx; medium: FluidMedium; operatorTags: Annotations['operatorTags']; operatorPressed?: Annotations['operatorPressed'] }) {
  const s = style(ctx);
  const on = props.shutoff !== 'OFF';
  const clipBase = useId().replace(/[^a-zA-Z0-9]/g, '');
  const g = SERVICE_UNIT;
  const frlRight = g.frlX + g.frlHalf;
  const stage = (type: string, stageProps: FluidProps, extra: Partial<FluidSymbolProps> = {}) => (
    <FluidSymbol definition={getFluidDefinition(type)!} props={stageProps} stroke={ctx.stroke} strokeWidth={ctx.sw} medium={medium} hideText={ctx.hideText} {...extra} />
  );
  return (
    <g className="service-unit" data-shutoff={on ? 'ON' : 'OFF'} transform={`translate(${g.shiftX},${g.shiftY})`}>
      <rect className="iso-boundary" x={g.left} y={g.top} width={g.right - g.left} height={g.bottom - g.top} fill="none" stroke="#94A3B8" strokeWidth={1.5} strokeDasharray="4 4" />
      <g data-stage="pressure-source" transform={`translate(${g.sourceX},0)`}>{stage('pressure-source', { pressure: props.pressure })}</g>
      {/* The FRL's own stubs overlap its neighbours, so it is cut at the box and the manifold takes over. */}
      <clipPath id={`${clipBase}f`}><rect x={-100} y={-200} width={frlRight + 100} height={400} /></clipPath>
      <g clipPath={`url(#${clipBase}f)`}><g data-stage="frl-simplified" transform={`translate(${g.frlX},0)`}>{stage('frl-simplified', { setpoint: props.setpoint, lubricator: 'With Lubricator' })}</g></g>
      {/* FRL outlet → up → into port 1 (bottom) of the valve; port 2 (top) runs right as the supply bus. */}
      <path className="manifold" d={`M ${frlRight} 0 H ${g.frlOutX} V ${g.port1Y} H ${g.valveX}`} {...s} />
      <path className="manifold" d={`M ${g.valveX} ${g.port2Y} H ${g.outletX}`} {...s} />
      <g data-stage="valve-2-2-nc" transform={`translate(${g.valveX},${g.valveY})`}>
        {stage('valve-2-2-nc', { actuationLeft: 'Spring Return', actuationRight: 'Detent Lever' }, { activeCell: on ? 0 : 1, spoolOffset: on ? 1 : 0, operatorPressed: { right: on }, operatorTags: { right: operatorTags?.right ?? '0S1' } })}
      </g>
    </g>
  );
}

/**
 * Hydraulic power unit: pump (solid triangle) drawing from the tank through a suction filter, a relief valve bridging the
 * delivery line to the tank, and a 2/2 manual shut-off ahead of the outlet at port 2 (switched from the input strip, so it carries no tag). Origin and shift as for the service unit.
 */
function HydraulicPowerUnit({ props, ctx, medium }: { props: FluidProps; ctx: Ctx; medium: FluidMedium }) {
  const s = style(ctx);
  const dashed = style(ctx, 'dashed');
  const on = props.shutoff !== 'OFF';
  const g = HYDRAULIC_POWER_UNIT;
  const stage = (type: string, stageProps: FluidProps, extra: Partial<FluidSymbolProps> = {}) => (
    <FluidSymbol definition={getFluidDefinition(type)!} props={stageProps} stroke={ctx.stroke} strokeWidth={ctx.sw} medium={medium} hideText={ctx.hideText} {...extra} />
  );
  const dot = (cx: number, cy: number) => <circle cx={cx} cy={cy} r={2.5} fill={ctx.stroke} stroke="none" />;
  return (
    <g className="hydraulic-power-unit" data-shutoff={on ? 'ON' : 'OFF'} transform={`translate(${g.shiftX},${g.shiftY})`}>
      <rect className="iso-boundary" x={g.left} y={g.top} width={g.right - g.left} height={g.bottom - g.top} fill="none" stroke="#94A3B8" strokeWidth={1.5} strokeDasharray="4 4" />
      {/* tank: open vessel, suction and return lines end below the fluid surface */}
      <path className="hpu-tank" d={`M ${g.tankLeft} ${g.tankTop} V ${g.tankBottom} H ${g.tankRight} V ${g.tankTop}`} {...s} />
      <path d={`M ${g.tankLeft} ${g.fluidY} H ${g.tankRight}`} {...dashed} opacity={0.6} />
      <g data-stage="hyd-pump">{stage('hyd-pump', { pressure: props.pressure }, { hideText: true })}</g>
      {/* suction line with its filter: diamond across the line, dashed element */}
      <path d={`M 0 60 V ${g.filterY - 30} M 0 ${g.filterY + 30} V ${g.fluidY + 12}`} {...s} />
      <g className="hpu-filter" transform={`translate(0,${g.filterY}) rotate(90)`}>
        <path className="frl-diamond" d="M -30 0 L 0 -30 L 30 0 L 0 30 Z" {...s} /><path d="M 0 -30 V 30" {...dashed} />
      </g>
      {/* delivery: up from the pump, across to the shut-off valve; the relief valve bridges it to the tank */}
      <path className="manifold" d={`M 0 -60 H ${g.valveX}`} {...s} />
      <path className="manifold" d={`M ${g.reliefX} 60 V ${g.fluidY + 12}`} {...s} />
      {dot(g.reliefX, -60)}
      <g data-stage="hyd-pressure-relief" transform={`translate(${g.reliefX},0) rotate(180)`}>{stage('hyd-pressure-relief', { crackingPressure: props.crackingPressure }, { hideText: true })}</g>
      <path className="manifold" d={`M ${g.valveX} ${g.port2Y} H ${g.outletX}`} {...s} />
      <g data-stage="valve-2-2-nc" transform={`translate(${g.valveX},${g.valveY})`}>
        {stage('valve-2-2-nc', { actuationLeft: 'Spring Return', actuationRight: 'Detent Lever' }, { activeCell: on ? 0 : 1, spoolOffset: on ? 1 : 0, operatorPressed: { right: on } })}
      </g>
    </g>
  );
}

function Body({ def, props, ctx, activeCell, spoolOffset, extension, medium, logicOffset = 0, sensorTags, sensorActive, operatorTags, operatorPressed, shaftAngle = 0 }: { def: FluidCatalogEntry; props: FluidProps; ctx: Ctx; activeCell?: number; spoolOffset?: number; extension: number; medium: FluidMedium; logicOffset?: number } & Annotations) {
  const s = style(ctx);
  const detail = style(ctx, 'detail');
  const dashed = style(ctx, 'dashed');
  /** ISO 1219: hydraulic energy triangles are solid, pneumatic ones are open. */
  const solid = medium === 'HYDRAULIC';
  const energy = { ...detail, fill: solid ? ctx.stroke : 'none' };
  switch (def.type) {
    case 'air-reservoir':
      return <g><rect x={-60} y={-30} width={120} height={60} rx={30} {...s} /><path d="M -80 0 H -60 M 60 0 H 80" {...s} /></g>;
    case 'time-delay-valve':
      return <TimeDelayValve hydraulic={solid} ctx={ctx} spoolOffset={logicOffset} activeCell={logicOffset === undefined ? undefined : logicOffset >= 1 ? 0 : 1} />;
    case 'pressure-source':
      return <g><polygon points="-17.3,-20 -17.3,20 17.3,0" {...energy} /><path d="M 17.3 0 H 40" {...s} /></g>;
    case 'regulator-nr':
      return <g><PressureEnvelope ctx={ctx} /><path d="M 0 30 V 60 M 0 -30 V -60" {...s} /><Sensing path={SENSE_OUTLET} ctx={ctx} /></g>;
    case 'regulator-relieving':
      return <g><PressureEnvelope ctx={ctx} /><path d="M 0 30 V 60 M 0 -30 V -60 M 20 30 V 46" {...s} /><Vent x={20} y={46} dir={1} ctx={ctx} />
        <path d="M 12 -6 V 14" {...detail} /><Arrow from={[12, 6]} to={[12, 16]} ctx={ctx} /><Sensing path={SENSE_OUTLET} ctx={ctx} /></g>;
    case 'sequence-ext':
      return <g><PressureEnvelope ctx={ctx} closedArrow /><path d="M 0 30 V 60 M 0 -30 V -60" {...s} /><path d="M -60 0 H -30" {...dashed} /><Arrow from={[-38, 0]} to={[-SQUARE_HALF, 0]} ctx={ctx} /></g>;
    case 'pressure-relief':
      return <g><PressureEnvelope ctx={ctx} closedArrow /><path d="M 0 30 V 60 M 0 -30 V -45" {...s} /><Vent x={0} y={-45} dir={-1} ctx={ctx} /><Sensing path={SENSE_INLET} ctx={ctx} /></g>;
    case 'sequence-combo':
      return (
        <g>
          <rect x={-100} y={-50} width={200} height={100} {...s} strokeDasharray={DASH_DOT} />
          <path d="M 0 60 V 40 M -40 40 H 40 M -40 40 V 30 M -40 -30 V -40 M 40 40 V 12 M 40 -40 V -12 M -40 -40 H 40 M 0 -40 V -60" {...detail} />
          <g transform="translate(-40,0)"><PressureEnvelope ctx={ctx} closedArrow /></g>
          <path d="M -40 40 H -80 V 0 H -70" {...dashed} /><Arrow from={[-78, 0]} to={[-70, 0]} ctx={ctx} />
          <g transform="translate(40,0) rotate(90)"><CheckCore ctx={ctx} kind="detail" /></g>
          <circle cx={0} cy={40} r={2.5} fill={ctx.stroke} stroke="none" /><circle cx={0} cy={-40} r={2.5} fill={ctx.stroke} stroke="none" />
        </g>
      );
    case 'frl-detailed':
      return <ServiceUnit ctx={ctx} />;
    case 'hyd-power-unit':
      return <HydraulicPowerUnit props={props} ctx={ctx} medium={medium} />;
    case 'service-unit':
      return <MainServiceUnit props={props} ctx={ctx} medium={medium} operatorTags={operatorTags} />;
    case 'frl-simplified':
      return (
        <g>
          <rect x={-60} y={-30} width={120} height={60} {...s} />
          <path d="M -80 0 H -60 M 60 0 H 80" {...s} />
          <path d="M -36 -30 V 30" {...dashed} /><path d="M -36 30 V 50" {...s} /><Arrow from={[-36, 42]} to={[-36, 50]} ctx={ctx} />
          <Gauge cx={10} cy={0} ctx={ctx} />
          <path d="M 40 -30 V -18" {...detail} />
        </g>
      );
    case 'cylinder-single':
    case 'cylinder-double':
    case 'cylinder-double-rod':
      return <Cylinder def={def} props={props} ctx={ctx} extension={extension} medium={medium} sensorTags={sensorTags} sensorActive={sensorActive} />;
    case 'air-motor-fixed':
      return <g><circle r={MOTOR.radius} {...s} /><path d="M 0 -30 V -60 M 0 30 V 60 M 30 0 H 50 M 50 -6 V 6" {...s} /><MotorTriangle dir={-1} angle={shaftAngle} ctx={ctx} filled={false} /></g>;
    case 'check-valve': {
      const lift = logicOffset * CHECK_LIFT;
      return <g><path d={`M -60 0 H ${SEAT_VERTEX} M ${BALL_SEATED_X + LOGIC_ELEMENT_RADIUS} 0 H 60`} {...s} /><CheckCore ctx={ctx} lift={lift} /></g>;
    }
    case 'check-valve-spring': {
      // The whole seat-and-ball group sits left of centre so the spring can run to the outlet pin.
      const lift = logicOffset * CHECK_LIFT;
      const shift = -28;
      const ballRight = shift + BALL_SEATED_X + LOGIC_ELEMENT_RADIUS;
      return (
        <g>
          <path d={`M -60 0 H ${shift + SEAT_VERTEX} M 40 0 H 60`} {...s} />
          <g transform={`translate(${shift},0)`}><CheckCore ctx={ctx} lift={lift} /></g>
          <HSpring x0={ballRight + lift} x1={40} n={4} amp={LOGIC_ELEMENT_RADIUS} ctx={ctx} />
        </g>
      );
    }
    case 'shuttle-valve': {
      const dx = logicOffset * BALL_TRAVEL;
      return (
        <g>
          <LogicEnvelope ctx={ctx} />
          <path d="M -80 0 H -60 M 60 0 H 80 M 0 -30 V -60" {...s} />
          <ConicalSeats ctx={ctx} />
          <path d="M 0 -30 V -12" {...detail} />
          <g className="shuttle-ball" data-offset={dx} style={slide(dx)}><circle className="logic-element" cx={0} cy={0} r={LOGIC_ELEMENT_RADIUS} {...detail} /></g>
        </g>
      );
    }
    case 'dual-pressure-valve': {
      // +1: spool pushed right by pressure on the left inlet (left disc under the outlet); -1: the mirror case; 0: centred.
      const dx = logicOffset * AND_TRAVEL;
      return (
        <g>
          <LogicEnvelope ctx={ctx} />
          <path d="M -80 0 H -60 M 60 0 H 80 M 0 -30 V -60" {...s} />
          <path d="M -60 0 H -40 M 40 0 H 60" {...detail} />
          {/* four guide stops: two each side, from the roof and from the floor, leaving a 20 px gate the inlet passes through */}
          <path className="and-stops" d="M -40 -30 V -10 M -40 10 V 30 M 40 -30 V -10 M 40 10 V 30" {...detail} />
          <path d="M 0 -30 V 0" {...detail} />
          <g className="and-spool" data-offset={dx} style={slide(dx)}>
            <path className="logic-element" d={`M -${AND_TRAVEL} 0 H ${AND_TRAVEL} M -${AND_TRAVEL} -${AND_DISC_HALF} V ${AND_DISC_HALF} M ${AND_TRAVEL} -${AND_DISC_HALF} V ${AND_DISC_HALF}`} {...detail} />
          </g>
        </g>
      );
    }
    case 'quick-exhaust': {
      // +1: supplied from port 1 (ball on the right seat); -1: port 1 dropped (ball on the left seat, 2 → 3 open).
      const dx = logicOffset * BALL_TRAVEL;
      return (
        <g>
          <LogicEnvelope ctx={ctx} />
          <path d="M -80 0 H -60 M 0 -30 V -60 M 0 30 V 60" {...s} />
          <ConicalSeats ctx={ctx} />
          <path d="M 0 -30 V -12" {...detail} />
          {/* external pilot: up from port 1, across above the body, down at an angle into the outlet pipe */}
          <path className="pilot-bypass" d="M -70 0 V -48 H -20 L 0 -40" {...dashed} />
          <circle cx={-70} cy={0} r={2.5} fill={ctx.stroke} stroke="none" />
          <Vent x={0} y={36} dir={1} ctx={ctx} />
          <g className="shuttle-ball" data-offset={dx} style={slide(dx)}><circle className="logic-element" cx={0} cy={0} r={LOGIC_ELEMENT_RADIUS} {...detail} /></g>
        </g>
      );
    }
    case 'flow-control':
      return <g><path d="M -40 0 H 40" {...s} /><ThrottleGlyph cx={0} cy={0} ctx={ctx} /></g>;
    case 'flow-control-oneway': {
      const halfW = ONE_WAY_FLOW_CONTROL_WIDTH / 2;
      const halfH = ONE_WAY_FLOW_CONTROL_HEIGHT / 2;
      return (
        <g>
          <rect className="valve-square" x={-halfW} y={-halfH} width={ONE_WAY_FLOW_CONTROL_WIDTH} height={ONE_WAY_FLOW_CONTROL_HEIGHT} {...s} strokeDasharray={DASH_DOT} />
          <path d="M -80 0 H -40 M 40 0 H 80" {...s} />
          {/* shared T-junctions at input 1 and output 2 feed two parallel branches */}
          <path d="M -40 -15 V 15 M 40 -15 V 15" {...detail} />
          {/* top branch: adjustable throttle */}
          <path d="M -40 -15 H 40" {...detail} />
          <ThrottleGlyph cx={0} cy={-15} k={0.55} ctx={ctx} kind="detail" />
          {/* bottom branch: springless check valve, seat on the outlet side, so 1 → 2 is blocked and must take the throttle */}
          <path d={`M -40 15 H ${-(BALL_SEATED_X + LOGIC_ELEMENT_RADIUS)} M ${-SEAT_VERTEX} 15 H 40`} {...detail} />
          <g transform="translate(0,15) scale(-1,1)"><CheckCore ctx={ctx} kind="detail" /></g>
          <circle cx={-40} cy={0} r={2.5} fill={ctx.stroke} stroke="none" /><circle cx={40} cy={0} r={2.5} fill={ctx.stroke} stroke="none" />
        </g>
      );
    }
    case 'hyd-pump':
      return <g><circle r={30} {...s} /><path d="M 0 -30 V -60 M 0 30 V 60" {...s} /><polygon points="0,-24 -9,-8 9,-8" {...energy} fill={ctx.stroke} /></g>;
    case 'hyd-motor':
      return (
        <g>
          <circle r={30} {...s} /><path d="M 0 -30 V -60 M 0 30 V 60 M 30 0 H 50 M 50 -6 V 6" {...s} />
          <polygon points="0,-8 -9,-24 9,-24" {...energy} fill={ctx.stroke} />
          {props.directions === 'Both directions' && <polygon points="0,8 -9,24 9,24" {...energy} fill={ctx.stroke} />}
        </g>
      );
    case 'hyd-tank':
      return <g><path d="M -30 0 V 30 H 30 V 0" {...s} /><path d="M 0 -40 V 14" {...s} /><path d="M -30 12 H 30" {...dashed} opacity={0.6} /></g>;
    case 'hyd-pressure-source':
      // ISO 1219: the energy triangle of a hydraulic supply is always solid.
      return <g><polygon points="-17.3,-20 -17.3,20 17.3,0" {...detail} fill={ctx.stroke} /><path d="M 17.3 0 H 40" {...s} /></g>;
    case 'hyd-pressure-relief':
      return <g><PressureEnvelope ctx={ctx} closedArrow /><path d="M 0 30 V 60 M 0 -30 V -60" {...s} /><Sensing path={SENSE_INLET} ctx={ctx} /></g>;
    case 'hyd-reducing-valve':
      return <g><PressureEnvelope ctx={ctx} /><path d="M 0 30 V 60 M 0 -30 V -60" {...s} /><Sensing path={SENSE_OUTLET} ctx={ctx} /></g>;
    case 'hyd-reducing-valve-3way':
      return (
        <g>
          <PressureEnvelope ctx={ctx} />
          <path d="M 0 30 V 60 M 0 -30 V -60 M 20 30 V 60" {...s} />
          <path d="M 12 -6 V 14" {...detail} /><Arrow from={[12, 6]} to={[12, 16]} ctx={ctx} />
          <Sensing path={SENSE_OUTLET} ctx={ctx} />
        </g>
      );
    case 'exhaust-port': {
      const threaded = props.connection === 'Threaded';
      return <g><path d="M 0 -20 V 0" {...s} /><Vent x={0} y={0} dir={1} ctx={ctx} kind="outline" />{threaded && <rect x={-8} y={14} width={16} height={8} {...detail} />}{props.silencer === 'With Silencer' && <path d="M -5 6 H 5 M -3 11 H 3" {...dashed} />}</g>;
    }
    case 'silencer':
      return <g><path d="M 0 -20 V -4" {...s} /><polygon points="-12,-4 12,-4 0,20" {...s} /><path d="M -7 4 H 7 M -4 11 H 4" {...dashed} /></g>;
    case 'pressure-gauge':
      return <g><Gauge cx={0} cy={0} r={20} ctx={ctx} /><path d="M 0 20 V 40" {...s} /></g>;
    case 'flow-indicator':
      return <g><circle r={18} {...s} /><path d="M -40 0 H -18 M 18 0 H 40" {...s} /><path d="M -9 -9 L 9 9 M -9 9 L 9 -9" {...detail} /></g>;
    default:
      return <Valve def={def} props={props} ctx={ctx} activeCell={activeCell} spoolOffset={spoolOffset} operatorTags={operatorTags} operatorPressed={operatorPressed} />;
  }
}

const isDirectionalValve = (type: string) => Boolean(VALVE_SPECS[type]);

/** Port numbers for components that are not drawn by a dedicated renderer (regulators, sequence valves). */
function PortNumbers({ def, props, ctx }: { def: FluidCatalogEntry; props: FluidProps; ctx: Ctx }) {
  if (!def.portLabels || isDirectionalValve(def.type)) return null;
  const hydraulicOnly = def.media.length === 1 && def.media[0] === 'HYDRAULIC';
  return (
    <g>
      {def.portsFor(props).filter(p => (hydraulicOnly ? p.lettering : p.isoNumber)).map(p => {
        const horizontal = Math.abs(p.x) > Math.abs(p.y);
        return <Mono key={p.id} x={horizontal ? p.x + (p.x < 0 ? 6 : -6) : p.x + 5} y={horizontal ? -8 : p.y < 0 ? p.y + 22 : p.y - 10} ctx={ctx} anchor={horizontal ? (p.x < 0 ? 'start' : 'end') : 'start'}>{hydraulicOnly ? p.lettering : p.isoNumber}</Mono>;
      })}
    </g>
  );
}

export interface FluidSymbolProps {
  definition: FluidCatalogEntry;
  props?: FluidProps;
  stroke: string;
  /** Outline width in px; detail lines are 75 % and dashed lines 50 % of it. */
  strokeWidth?: number;
  medium?: FluidMedium;
  /** Envelope of a directional valve to highlight as energised (`snapshot.valves[id].envelope`). */
  activeCell?: number;
  /** Normalized spool travel of a directional valve (`snapshot.valves[id].spoolOffset`). */
  spoolOffset?: number;
  /** Piston position of a cylinder, 0 retracted … 1 extended (`snapshot.cylinders[id].stroke`). */
  extension?: number;
  /** Normalized travel of a shuttle ball, AND spool, quick-exhaust seal or check ball (`snapshot.logic[id].offset`). */
  logicOffset?: number;
  /** [retract, extend] limit-switch tags drawn above a cylinder; omitted in the library, where no markers are shown. */
  sensorTags?: [string, string];
  /** Whether each limit switch is made (`snapshot.sensors`). */
  sensorActive?: [boolean, boolean];
  /** Tag of the limit switch linked to each end of a directional valve. */
  operatorTags?: Partial<Record<'left' | 'right', string>>;
  /** Manual operators currently held or latched (`bridge.manualInputs[id]`): the glyph sinks and shades. */
  operatorPressed?: Partial<Record<'left' | 'right', boolean>>;
  /** Shaft angle of an air motor in degrees; omitted while the circuit is not live. */
  shaftAngle?: number;
  /** Suppresses every annotation text (port numbers, limit-switch tags) while keeping the drawn geometry. */
  hideText?: boolean;
}

/** ISO 1219 symbol for one component instance, on the 20 px module. */
export function FluidSymbol({ definition, props, stroke, strokeWidth = 2, medium = 'PNEUMATIC', activeCell, spoolOffset, extension = 0, logicOffset, sensorTags, sensorActive, operatorTags, operatorPressed, hideText, shaftAngle }: FluidSymbolProps) {
  const ctx: Ctx = { stroke, sw: strokeWidth, hideText };
  const p = props ?? defaultFluidProps(definition);
  return (
    <g>
      <Body def={definition} props={p} ctx={ctx} activeCell={activeCell} spoolOffset={spoolOffset} extension={extension} medium={medium} logicOffset={logicOffset} sensorTags={sensorTags} sensorActive={sensorActive} operatorTags={operatorTags} operatorPressed={operatorPressed} shaftAngle={shaftAngle} />
      <PortNumbers def={definition} props={p} ctx={ctx} />
    </g>
  );
}
