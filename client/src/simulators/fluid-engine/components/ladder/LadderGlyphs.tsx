import React from 'react';
import type { ContactForm, LadderElement, LadderElementKind, TimerMode } from '../../models/relayLadder';

/**
 * DIN EN 61082-1 / IEC 60617 symbols of the current-path diagram. Every glyph is drawn in a local frame centred on (0, 0) with
 * its two terminals on the vertical axis at y = ±24, so the diagram can join them to the conductor above and below.
 */
export const GLYPH_REACH = 24;

export interface LadderTheme {
  isDark: boolean;
  /** Conductor and symbol outline at rest. */
  ink: string;
  /** Faint chrome (empty sites, hints). */
  faint: string;
  /** Energised conductor: current is flowing through it. */
  live: string;
  /** Active relay coil, solenoid or closed contact. */
  active: string;
  /** Selection outline. */
  selection: string;
  surface: string;
}

const GLOW = (color: string) => `drop-shadow(0 0 3px ${color}) drop-shadow(0 0 6px ${color})`;

export interface GlyphState {
  /** The circuit is running: states are drawn. */
  simulating: boolean;
  /** Contacts: current passes; loads: energised. */
  closed: boolean;
  /** +24 V reaches the top terminal. */
  live: boolean;
  /** Pushbuttons: the operator is depressed. */
  operated?: boolean;
  /** Sensors: the signal is forced by hand. */
  forced?: boolean;
}

/** One terminal lead, coloured by whether current flows through it. */
function Lead({ y1, y2, on, theme }: { y1: number; y2: number; on: boolean; theme: LadderTheme }) {
  return <line className={on ? 'ladder-lead ladder-lead-live' : 'ladder-lead'} x1={0} x2={0} y1={y1} y2={y2} stroke={on ? theme.live : theme.ink} strokeWidth={on ? 2 : 1.6} style={on ? { filter: GLOW(theme.live) } : undefined} />;
}

/** Make (NO) or break (NC) contact, drawn between y = -10 and 10; the moving blade swings to the left. */
function ContactBody({ form, stroke, extra }: { form: ContactForm; stroke: string; extra?: React.ReactNode }) {
  const common = { stroke, strokeWidth: 1.8, fill: 'none', strokeLinecap: 'round' as const };
  return (
    <g className={form === 'NC' ? 'contact-nc' : 'contact-no'}>
      {form === 'NO' ? (
        <line x1={0} y1={10} x2={-9} y2={-8} {...common} />
      ) : (
        <>
          {/* break contact: the blade rests against a catch on the upper terminal and carries a cross stroke */}
          <line x1={0} y1={10} x2={-9} y2={-10} {...common} />
          <line className="contact-catch" x1={0} y1={-10} x2={-9} y2={-10} {...common} />
          <line className="contact-cross" x1={-8.2} y1={-1.6} x2={-0.8} y2={1.8} {...common} />
        </>
      )}
      {extra}
    </g>
  );
}

function ContactSymbol({ element, state, theme, extra }: { element: LadderElement; state: GlyphState; theme: LadderTheme; extra?: React.ReactNode }) {
  const form = element.form ?? 'NO';
  const lit = state.simulating && state.closed;
  const stroke = lit ? theme.active : theme.ink;
  return (
    <g style={lit ? { filter: GLOW(theme.active) } : undefined}>
      <Lead y1={-GLYPH_REACH} y2={-10} on={state.simulating && state.live} theme={theme} />
      <Lead y1={10} y2={GLYPH_REACH} on={state.simulating && state.live && state.closed} theme={theme} />
      <ContactBody form={form} stroke={stroke} extra={extra} />
    </g>
  );
}

/**
 * Pushbutton, drawn exactly like the Circuit Lab's pb-no / pb-nc symbols (an open gap between two terminal dots, a bridge bar
 * on a T-stem; the bar drops when pressed), turned on its side for a vertical current path. NO: the bar rests clear of the gap
 * and closes it when pushed. NC: the bar rests across the gap and is pushed away. A detented switch carries a latch notch.
 */
function Pushbutton({ element, state, theme }: { element: LadderElement; state: GlyphState; theme: LadderTheme }) {
  const nc = (element.form ?? 'NO') === 'NC';
  const pressed = Boolean(state.operated);
  const lit = state.simulating && state.closed;
  const stroke = lit ? theme.active : theme.ink;
  const line = { stroke, strokeWidth: 1.5, strokeLinecap: 'round' as const };
  // Circuit Lab geometry (terminals at x = -10 and 10 on the contact axis), then rotated so the axis runs top to bottom.
  const bar = nc ? (pressed ? 10 : 2.5) : (pressed ? -2.5 : -10);
  const stemEnd = nc ? (pressed ? -2 : -10) : (pressed ? -12 : -20);
  return (
    <g style={lit ? { filter: GLOW(theme.active) } : undefined}>
      <Lead y1={-GLYPH_REACH} y2={-10} on={state.simulating && state.live} theme={theme} />
      <Lead y1={10} y2={GLYPH_REACH} on={state.simulating && state.live && state.closed} theme={theme} />
      <g className={`pushbutton-operator ${nc ? 'pb-nc' : 'pb-no'}`} data-pressed={pressed ? 'true' : 'false'} transform="rotate(-90)">
        <circle cx={-10} cy={0} r={2.5} fill={stroke} />
        <circle cx={10} cy={0} r={2.5} fill={stroke} />
        <line className="push-bar" x1={-12} y1={bar} x2={12} y2={bar} {...line} />
        <line className="push-stem" x1={0} y1={bar} x2={0} y2={stemEnd} {...line} />
        {element.detent && <path className="detent-notch" d="M-4,-14 L0,-10 L4,-14" fill="none" stroke={stroke} strokeWidth={1.3} strokeLinejoin="round" />}
      </g>
    </g>
  );
}

/** Timed contact: a contact with the delay bowl on its blade. */
function TimerContact({ element, state, theme }: { element: LadderElement; state: GlyphState; theme: LadderTheme }) {
  const stroke = state.simulating && state.closed ? theme.active : theme.ink;
  return <ContactSymbol element={element} state={state} theme={theme} extra={<path className="timer-bowl" d="M-13,-2 A5,5 0 0 0 -3,-2" fill="none" stroke={stroke} strokeWidth={1.5} strokeLinecap="round" />} />;
}

/**
 * Three-wire proximity sensor: housing with the sensor diamond and an internal switch. Terminal 1 takes +24 V from the path
 * above, terminal 3 goes to 0 V (a stub on the right) and the switched signal leaves on terminal 4 (make) or 2 (break).
 */
function Sensor({ element, state, theme }: { element: LadderElement; state: GlyphState; theme: LadderTheme }) {
  const form = element.form ?? 'NO';
  const lit = state.simulating && state.closed;
  const stroke = lit ? theme.active : theme.ink;
  const text = { fontSize: 8, fill: theme.ink, fontWeight: 600 };
  return (
    <g style={lit ? { filter: GLOW(theme.active) } : undefined}>
      <Lead y1={-GLYPH_REACH} y2={-18} on={state.simulating && state.live} theme={theme} />
      <Lead y1={18} y2={GLYPH_REACH} on={state.simulating && state.live && state.closed} theme={theme} />
      <rect className="sensor-housing" x={-18} y={-18} width={36} height={36} rx={2} fill={theme.surface} stroke={stroke} strokeWidth={1.8} />
      <polygon className="sensor-diamond" points="-10,-14 -5,-9 -10,-4 -15,-9" fill={state.forced || lit ? stroke : 'none'} fillOpacity={0.35} stroke={stroke} strokeWidth={1.4} />
      <g transform="translate(6 0) scale(0.95)">
        <line x1={0} y1={-18} x2={0} y2={-10} stroke={stroke} strokeWidth={1.6} />
        <line x1={0} y1={10} x2={0} y2={18} stroke={stroke} strokeWidth={1.6} />
        <ContactBody form={form} stroke={stroke} />
      </g>
      <line className="sensor-terminal-3" x1={18} y1={9} x2={27} y2={9} stroke={stroke} strokeWidth={1.4} />
      <text x={-4} y={-20} textAnchor="end" {...text}>1</text>
      <text x={-4} y={GLYPH_REACH - 1} textAnchor="end" {...text}>{form === 'NO' ? '4' : '2'}</text>
      <text x={22} y={5.5} textAnchor="middle" {...text}>3</text>
      <text x={29} y={12} textAnchor="start" fontSize={7} fill={theme.ink}>0V</text>
      {state.forced && <text className="forced-badge" x={0} y={-22} textAnchor="middle" fontSize={7} fontWeight={700} fill={theme.active}>F</text>}
    </g>
  );
}

const coilFill = (state: GlyphState, theme: LadderTheme) => (state.simulating && state.closed ? theme.active : theme.surface);

/** DIN relay coil: a plain rectangle between terminals A1 and A2. */
function RelayCoil({ element, state, theme }: { element: LadderElement; state: GlyphState; theme: LadderTheme }) {
  const lit = state.simulating && state.closed;
  const stroke = lit ? theme.active : theme.ink;
  return (
    <g style={lit ? { filter: GLOW(theme.active) } : undefined}>
      <Lead y1={-GLYPH_REACH} y2={-14} on={state.simulating && state.live} theme={theme} />
      <Lead y1={14} y2={GLYPH_REACH} on={lit} theme={theme} />
      <rect className="coil-body" x={-22} y={-14} width={44} height={28} rx={1.5} fill={coilFill(state, theme)} fillOpacity={lit ? 0.2 : 1} stroke={stroke} strokeWidth={1.8} />
      <text className="coil-tag" x={0} y={4} textAnchor="middle" fontSize={12} fontWeight={700} fill={lit ? theme.active : theme.ink}>{element.tag}</text>
      <text x={5} y={-16} fontSize={7} fill={theme.ink}>A1</text>
      <text x={5} y={22} fontSize={7} fill={theme.ink}>A2</text>
    </g>
  );
}

/** Timer coil: a relay coil with a delay cell carrying the hourglass. */
function TimerCoil({ element, state, theme }: { element: LadderElement; state: GlyphState; theme: LadderTheme }) {
  const lit = state.simulating && state.closed;
  const stroke = lit ? theme.active : theme.ink;
  return (
    <g style={lit ? { filter: GLOW(theme.active) } : undefined}>
      <Lead y1={-GLYPH_REACH} y2={-14} on={state.simulating && state.live} theme={theme} />
      <Lead y1={14} y2={GLYPH_REACH} on={lit} theme={theme} />
      <rect className="coil-body" x={-22} y={-14} width={44} height={28} rx={1.5} fill={coilFill(state, theme)} fillOpacity={lit ? 0.2 : 1} stroke={stroke} strokeWidth={1.8} />
      <line x1={-11} y1={-14} x2={-11} y2={14} stroke={stroke} strokeWidth={1.4} />
      <path className="timer-hourglass" d="M-19,-7 H-14 L-19,7 H-14 Z" fill="none" stroke={stroke} strokeWidth={1.3} strokeLinejoin="round" />
      <text className="coil-tag" x={5.5} y={4} textAnchor="middle" fontSize={11} fontWeight={700} fill={lit ? theme.active : theme.ink}>{element.tag}</text>
      <text x={5} y={-16} fontSize={7} fill={theme.ink}>A1</text>
      <text x={5} y={22} fontSize={7} fill={theme.ink}>A2</text>
    </g>
  );
}

/** Valve solenoid: a horizontal coil body with a head carrying two opposing diagonal triangles at its right end. */
function Solenoid({ element, state, theme }: { element: LadderElement; state: GlyphState; theme: LadderTheme }) {
  const lit = state.simulating && state.closed;
  const stroke = lit ? theme.active : theme.ink;
  return (
    <g style={lit ? { filter: GLOW(theme.active) } : undefined}>
      <Lead y1={-GLYPH_REACH} y2={-14} on={state.simulating && state.live} theme={theme} />
      <Lead y1={14} y2={GLYPH_REACH} on={lit} theme={theme} />
      <rect className="coil-body" x={-26} y={-14} width={52} height={28} rx={1.5} fill={coilFill(state, theme)} fillOpacity={lit ? 0.2 : 1} stroke={stroke} strokeWidth={1.8} />
      <line x1={12} y1={-14} x2={12} y2={14} stroke={stroke} strokeWidth={1.4} />
      <polygon className="solenoid-arrow" points="14.5,-11.5 23.5,-11.5 14.5,-1.5" fill={stroke} />
      <polygon className="solenoid-arrow" points="23.5,11.5 14.5,11.5 23.5,1.5" fill={stroke} />
      <text className="coil-tag" x={-7} y={4} textAnchor="middle" fontSize={12} fontWeight={700} fill={lit ? theme.active : theme.ink}>{element.tag}</text>
    </g>
  );
}

/** Draws the symbol of one element; `state` decides the highlighting. */
export function LadderGlyph({ element, state, theme }: { element: LadderElement; state: GlyphState; theme: LadderTheme }) {
  switch (element.kind) {
    case 'sensor': return <Sensor element={element} state={state} theme={theme} />;
    case 'pushbutton': return <Pushbutton element={element} state={state} theme={theme} />;
    case 'relayContact': return <ContactSymbol element={element} state={state} theme={theme} />;
    case 'timerContact': return <TimerContact element={element} state={state} theme={theme} />;
    case 'relayCoil': return <RelayCoil element={element} state={state} theme={theme} />;
    case 'timerCoil': return <TimerCoil element={element} state={state} theme={theme} />;
    case 'solenoid': return <Solenoid element={element} state={state} theme={theme} />;
    default: return null;
  }
}

/** Palette icon: the symbol at rest in its own small viewBox. */
export function LadderGlyphIcon({ kind, form = 'NO', mode = 'on', theme }: { kind: LadderElementKind; form?: ContactForm; mode?: TimerMode; theme: LadderTheme }) {
  const element: LadderElement = { id: 'icon', kind, tag: '', form, mode };
  return (
    <svg aria-hidden="true" width={34} height={30} viewBox="-34 -26 68 52" style={{ display: 'block', overflow: 'visible' }}>
      <LadderGlyph element={element} state={{ simulating: false, closed: false, live: false }} theme={theme} />
    </svg>
  );
}
