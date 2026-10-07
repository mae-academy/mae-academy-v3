// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { EndActuator } from './ActuatorCutaways';
import { AXIS, BALL_RADIUS, SEATED_X, THROAT_HALF, THROAT_X } from './CheckValveCutaway';
import { OneWayCore } from './FlowControlCutaways';
import { cutawayTheme, fluidTint } from './cutawayParts';

afterEach(cleanup);
const THEME = cutawayTheme(false);
type P = [number, number];

/** Foot of the perpendicular from `c` to segment a-b, and whether it falls on the segment. */
function contact(c: P, a: P, b: P) {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const t = ((c[0] - a[0]) * dx + (c[1] - a[1]) * dy) / (dx * dx + dy * dy);
  const foot: P = [a[0] + t * dx, a[1] + t * dy];
  return { onSegment: t >= 0 && t <= 1, distance: Math.hypot(c[0] - foot[0], c[1] - foot[1]) };
}

describe('check valve contact mechanics', () => {
  it('plain check: the seated ball touches the 45° bevel itself, not just its edge', () => {
    // upper bevel runs from the throat edge (THROAT_X, AXIS − THROAT_HALF) up at 45° across 24 px
    const { onSegment, distance } = contact([SEATED_X, AXIS], [THROAT_X, AXIS - THROAT_HALF], [THROAT_X + 24, AXIS - THROAT_HALF - 24]);
    expect(onSegment).toBe(true);
    expect(distance).toBeCloseTo(BALL_RADIUS, 6);
  });

  it('one-way bypass: the seated ball is tangent to the 45° cone of both seat halves', () => {
    const tint = fluidTint(0, 'PNEUMATIC');
    const c = render(<svg><OneWayCore opening={20} free={false} left={tint} right={tint} theme={THEME} idPrefix="t" /></svg>).container;
    const ball = c.querySelector('.check-ball')!;
    const centre: P = [Number(ball.getAttribute('cx')), Number(ball.getAttribute('cy'))];
    const seats = Array.from(c.querySelectorAll('.check-seat')).map(seat => seat.getAttribute('points')!.split(' ').map(pair => pair.split(',').map(Number) as P));
    expect(seats).toHaveLength(2);
    for (const points of seats) {
      const cone = [points[4], points[3]]; // bevel from the chamber wall to the throat shoulder
      const { onSegment, distance } = contact(centre, cone[0], cone[1]);
      expect(onSegment).toBe(true);
      expect(distance).toBeCloseTo(Number(ball.getAttribute('r')), 1);
    }
  });
});

describe('roller and detent kinematics', () => {
  const draw = (kind: string, active: boolean) =>
    render(<svg><EndActuator kind={kind} side="left" edgeX={20} tipX={120} active={active} axisY={170} theme={THEME} idPrefix="t" /></svg>).container;
  const dx = (el: Element) => Number(/translate\((-?[\d.]+)px/.exec((el as HTMLElement).style.transform)![1]);

  it('the roller wheel stays tangent to the cam face at rest and when pushed in, with no gap to its yoke or pin', () => {
    for (const kind of ['Roller', 'Idle-Return Roller']) {
      for (const active of [false, true]) {
        const c = draw(kind, active);
        const wheel = c.querySelector('.roller-wheel')!;
        const wheelEdge = Number(wheel.getAttribute('cx')) + Number(wheel.getAttribute('r')) + dx(c.querySelector('.actuator-moving')!);
        expect(Number(c.querySelector('.roller-cam rect')!.getAttribute('x')), `${kind} ${active}`).toBeCloseTo(wheelEdge, 6);
        const yoke = c.querySelector('.roller-yoke')!;
        const pin = c.querySelector('.operator-pin')!;
        const yokeLeft = Number(yoke.getAttribute('x')) + dx(c.querySelector('.actuator-moving')!);
        expect(Number(pin.getAttribute('data-from')), `${kind} ${active}`).toBeGreaterThanOrEqual(yokeLeft);
        expect(Number(pin.getAttribute('data-from'))).toBeLessThanOrEqual(yokeLeft + Number(yoke.getAttribute('width')));
        cleanup();
      }
    }
  });

  it('the detent notch comes under the ball exactly when the lever has rocked, and the ball dips into it', () => {
    const idle = draw('Detent Lever', false);
    const latched = draw('Detent Lever', true);
    const ball = latched.querySelector('.detent-roller')!;
    const pivot: P = [48, 36];
    const numbers = latched.querySelector('.detent-plate')!.getAttribute('d')!.match(/-?\d+(\.\d+)?/g)!.map(Number);
    const apex: P = [numbers[11], numbers[12]]; // M (2), L (2), A (7), then the L to the notch bottom
    const lever = latched.querySelector('.lever-arm') as HTMLElement;
    const angle = (Number(/rotate\((-?[\d.]+)deg/.exec(lever.style.transform)![1]) * Math.PI) / 180;
    const [rx, ry] = [apex[0] - pivot[0], apex[1] - pivot[1]];
    const rotated: P = [rx * Math.cos(angle) - ry * Math.sin(angle), rx * Math.sin(angle) + ry * Math.cos(angle)];
    const ballDir = [Number(ball.getAttribute('cx')) - pivot[0], Number(ball.getAttribute('cy')) - pivot[1]];
    expect(Math.atan2(rotated[1], rotated[0])).toBeCloseTo(Math.atan2(ballDir[1], ballDir[0]), 2); // path coordinates are rounded to 0.01 px
    expect(dx(idle.querySelector('.detent-roller')!)).toBe(0);
    expect(dx(ball)).toBeLessThan(0);
  });
});
