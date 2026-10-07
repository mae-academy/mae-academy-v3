import React from 'react';
import { EDGE_WIDTH, groundProps, steelProps, type CutawayTheme } from './cutawayParts';

/** Colours of the solenoid in section. */
export const COPPER = '#D97706';
const COPPER_DARK = '#92400E';
export const ARMATURE = '#4B5563';

/** Drawn length of a pin before the live length is applied as a scale. */
const PIN_REFERENCE = 400;
const SLIDE = 'transform 150ms cubic-bezier(0.4, 0, 0.2, 1)';

/** Operators drawn outside the end cap; spring and pilot ends live inside the bore and are drawn by the valve itself. */
export const OUTSIDE_ACTUATORS = ['Pushbutton', 'Solenoid', 'Hand Lever', 'Detent Lever', 'Foot Pedal', 'Roller', 'Idle-Return Roller', 'Plunger'] as const;
export const isOutsideActuator = (kind: string): boolean => (OUTSIDE_ACTUATORS as readonly string[]).includes(kind);

/** Overall depth of each housing beyond the end cap, in px (the stage margin must hold it). */
export const ACTUATOR_DEPTH = 90;

interface Props {
  kind: string;
  side: 'left' | 'right';
  /** x of the valve body's outer face on this side. */
  edgeX: number;
  /** x of the spool's end face the actuator pushes on. */
  tipX: number;
  /** The actuator is driving the spool (its end has shifted the spool). */
  active: boolean;
  /** y of the valve axis. */
  axisY: number;
  theme: CutawayTheme;
  idPrefix: string;
}

/**
 * Detent of the lever: a spring-loaded ball presses on the arc of a plate fixed to the lever tail. The plate has a V notch
 * placed so that, once the lever has rocked LEVER_ANGLE, the notch is exactly under the ball: the ball dips into it and holds.
 */
const LEVER_ANGLE = 22;
const DETENT_BALL = { x: 12, y: 13, r: 3.6, dip: 2.5, reach: Math.hypot(12, 13) };
const DETENT_ARC = DETENT_BALL.reach - DETENT_BALL.r;
const DETENT_NOTCH_CENTRE = (Math.atan2(DETENT_BALL.y, DETENT_BALL.x) * 180) / Math.PI + LEVER_ANGLE;
export const detentPlatePath = (pivot: { x: number; y: number }) => {
  const at = (angle: number, radius: number) => `${(pivot.x + radius * Math.cos((angle * Math.PI) / 180)).toFixed(2)} ${(pivot.y + radius * Math.sin((angle * Math.PI) / 180)).toFixed(2)}`;
  const mouth = 16;
  return `M ${pivot.x} ${pivot.y} L ${at(0, DETENT_ARC)} A ${DETENT_ARC} ${DETENT_ARC} 0 0 1 ${at(DETENT_NOTCH_CENTRE - mouth, DETENT_ARC)} L ${at(DETENT_NOTCH_CENTRE, DETENT_ARC - 5)} L ${at(DETENT_NOTCH_CENTRE + mouth, DETENT_ARC)} A ${DETENT_ARC} ${DETENT_ARC} 0 0 1 ${at(100, DETENT_ARC)} Z`;
};

const slide = (dx: number, dy = 0, extra = '') => ({ transform: `translate(${dx}px, ${dy}px)${extra}`, transition: SLIDE });

/**
 * One operator in section, mounted flush on the valve end cap (x = 0 is the cap face, x grows outward). A guide pin
 * runs from the operator through the cap bushing to the end of the spool; its length is the live distance, so the pin
 * always abuts the spool, and the operator's own moving part (button, armature, lever, pedal, roller) shows the stroke.
 */
export function EndActuator({ kind, side, edgeX, tipX, active, axisY, theme, idPrefix }: Props) {
  const direction = side === 'left' ? 1 : -1;
  // x of the spool end, in the actuator's own outward coordinates (negative: inside the valve).
  const tip = (edgeX - tipX) * direction;
  const copper = `${idPrefix}-copper-${side}`;

  /** Pin from outward position `from` to the spool end. */
  const pin = (from: number, width = 10) => (
    <g className="operator-pin" data-from={from} data-tip={tip} data-length={(from - tip).toFixed(1)} style={{ ...slide(from, 0, ` scaleX(${(from - tip) / PIN_REFERENCE})`), transformOrigin: '0 0', transformBox: 'view-box' }}>
      <rect x={-PIN_REFERENCE} y={-width / 2} width={PIN_REFERENCE} height={width} {...steelProps(theme)} vectorEffect="non-scaling-stroke" />
    </g>
  );
  /** Bushing pressed into the cap, flanking the pin. */
  const bushing = (length: number, half = 5) => (
    <g className="cap-bushing">
      {[-1, 1].map(sign => <rect key={sign} x={0} y={sign < 0 ? -half - 8 : half} width={length} height={8} {...groundProps(theme)} />)}
    </g>
  );

  let body: React.ReactNode = null;
  switch (kind) {
    case 'Pushbutton':
    case 'Plunger': {
      const press = active ? 10 : 0;
      body = (
        <g>
          {bushing(22)}
          {pin(30)}
          <g className="actuator-moving" style={slide(-press)}>
            {kind === 'Pushbutton'
              ? <rect x={30} y={-19} width={14} height={38} rx={3} {...groundProps(theme)} />
              : <path d="M 30 -9 H 38 Q 48 -9 48 0 Q 48 9 38 9 H 30 Z" {...groundProps(theme)} />}
          </g>
        </g>
      );
      break;
    }
    case 'Solenoid': {
      const stroke = active ? 16 : 0;
      body = (
        <g data-solenoid={active ? 'energised' : 'off'}>
          <defs>
            <pattern id={copper} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="6" height="6" fill={COPPER} />
              <line x1="0" y1="0" x2="0" y2="6" stroke={COPPER_DARK} strokeWidth="1.6" />
            </pattern>
          </defs>
          {bushing(14)}
          {pin(30)}
          {/* housing, armature tube and the two copper winding sections */}
          <rect className="solenoid-housing" x={0} y={-38} width={76} height={76} fill={theme.hatch} stroke={theme.casingEdge} strokeWidth={EDGE_WIDTH} />
          <rect x={4} y={-13} width={68} height={26} fill={theme.bore} />
          {[-1, 1].map(sign => <rect key={sign} className="solenoid-winding" x={8} y={sign < 0 ? -34 : 17} width={60} height={17} fill={`url(#${copper})`} stroke={COPPER_DARK} strokeWidth={1} />)}
          <g className="solenoid-armature" style={slide(-stroke)}>
            <rect x={34} y={-11} width={34} height={22} fill={ARMATURE} stroke={theme.steelEdge} strokeWidth={EDGE_WIDTH} />
            <line x1={40} x2={40} y1={-11} y2={11} stroke={theme.steelEdge} strokeWidth={1} />
          </g>
          {/* manual override pin at the outer end */}
          <rect className="manual-override" x={76} y={-4} width={8} height={8} {...steelProps(theme)} />
          <rect x={84} y={-8} width={4} height={16} rx={1} {...groundProps(theme)} />
        </g>
      );
      break;
    }
    case 'Hand Lever':
    case 'Detent Lever': {
      const pivot = { x: 48, y: 36 };
      const angle = active ? -LEVER_ANGLE : 0;
      body = (
        <g data-lever={kind === 'Detent Lever' ? 'detent' : 'hand'}>
          {bushing(20)}
          {pin(48)}
          <rect className="lever-bracket" x={28} y={pivot.y + 6} width={60} height={14} fill={theme.hatch} stroke={theme.casingEdge} strokeWidth={EDGE_WIDTH} />
          <g className="lever-arm" style={{ ...slide(0, 0), transform: `translate(${pivot.x}px, ${pivot.y}px) rotate(${angle}deg) translate(${-pivot.x}px, ${-pivot.y}px)`, transformOrigin: '0 0', transformBox: 'view-box' }}>
            {/* rocker arm: clevis at the pin, handle above, tail with the detent plate below the pivot */}
            <rect x={pivot.x - 4} y={-58} width={8} height={pivot.y + 58} {...groundProps(theme)} />
            <circle cx={pivot.x} cy={-62} r={8} {...groundProps(theme)} />
            <circle cx={pivot.x} cy={0} r={3} fill={theme.seal} />
            {kind === 'Detent Lever' && <path className="detent-plate" d={detentPlatePath(pivot)} {...groundProps(theme)} />}
          </g>
          <circle cx={pivot.x} cy={pivot.y} r={5} {...steelProps(theme)} />
          {kind === 'Detent Lever' && (
            <g className="detent-ball">
              <rect x={pivot.x + 22} y={pivot.y + 6} width={16} height={14} fill={theme.hatch} stroke={theme.casingEdge} strokeWidth={EDGE_WIDTH} />
              <path d={`M ${pivot.x + 22} ${pivot.y + 13} H ${pivot.x + 18} L ${pivot.x + 16} ${pivot.y + 9} L ${pivot.x + 14} ${pivot.y + 17} L ${pivot.x + 13} ${pivot.y + 13}`} fill="none" stroke={theme.spring} strokeWidth={1.6} />
              <circle className="detent-roller" cx={pivot.x + DETENT_BALL.x} cy={pivot.y + DETENT_BALL.y} r={DETENT_BALL.r} {...groundProps(theme)} style={{ ...slide(active ? -DETENT_BALL.dip * DETENT_BALL.x / DETENT_BALL.reach : 0, active ? -DETENT_BALL.dip * DETENT_BALL.y / DETENT_BALL.reach : 0) }} />
            </g>
          )}
        </g>
      );
      break;
    }
    case 'Foot Pedal': {
      const angle = active ? 4 : 20;
      body = (
        <g data-pedal={active ? 'down' : 'up'}>
          <rect className="sleeve-bearing" x={0} y={-17} width={30} height={34} fill={theme.hatch} stroke={theme.casingEdge} strokeWidth={EDGE_WIDTH} />
          {bushing(30)}
          {pin(44)}
          <rect x={40} y={26} width={64} height={10} fill={theme.hatch} stroke={theme.casingEdge} strokeWidth={EDGE_WIDTH} />
          <g className="pedal-plate" style={{ transform: `translate(44px, 0px) rotate(${angle}deg)`, transformOrigin: '0 0', transformBox: 'view-box', transition: SLIDE }}>
            <rect x={-4} y={-5} width={60} height={9} rx={2} {...groundProps(theme)} />
          </g>
          <circle cx={44} cy={0} r={4} {...steelProps(theme)} />
        </g>
      );
      break;
    }
    case 'Roller':
    case 'Idle-Return Roller': {
      const travel = active ? 12 : 0;
      const WHEEL = { cx: 56, r: 13 };
      // The cam face is tangent to the wheel at all times: it sits at the wheel's outer edge and rides in with it.
      const camX = WHEEL.cx + WHEEL.r - travel;
      body = (
        <g data-roller={kind}>
          <rect className="sleeve-bearing" x={0} y={-17} width={30} height={34} fill={theme.hatch} stroke={theme.casingEdge} strokeWidth={EDGE_WIDTH} />
          {bushing(30)}
          {pin(38 - travel + 2)}
          <g className="actuator-moving" style={slide(-travel)}>
            <rect className="roller-yoke" x={36} y={-10} width={4} height={20} {...steelProps(theme)} />
            <path d="M 40 -10 H 52 M 40 10 H 52" stroke={theme.steelEdge} strokeWidth={EDGE_WIDTH} fill="none" />
            <circle className="roller-wheel" cx={WHEEL.cx} cy={0} r={WHEEL.r} {...groundProps(theme)} />
            <circle cx={WHEEL.cx} cy={0} r={4} {...steelProps(theme)} />
          </g>
          <g className="roller-cam" data-contact={camX} style={slide(0)}>
            <rect x={camX} y={-30} width={14} height={60} fill={theme.hatch} stroke={theme.casingEdge} strokeWidth={EDGE_WIDTH} />
          </g>
        </g>
      );
      break;
    }
    default:
      body = null;
  }

  return (
    <g className="end-actuator" data-actuator={kind} data-side={side} data-active={active} transform={`translate(${edgeX},${axisY}) scale(${-direction},1)`}>
      {body}
    </g>
  );
}
