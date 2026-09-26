import { useRef, type KeyboardEvent, type PointerEvent } from 'react';
import type { BenchInputState } from '../controller';
import { ACTUATOR_LABEL, contactClosed, isMomentary, type InputDevice, type LoadKind, type OutputLoad } from '../hardware/devices';
import { ACTUATOR, BADGE, CONTACT, LOAD_X } from './geometry';
import { liveFill, wireClass } from './wire';

const KIND_ABBR: Readonly<Record<InputDevice['kind'], string>> = { pushbutton: 'PB', switch: 'SW', limit: 'LS', sensor: 'PIR', spare: 'SPARE' };
const LOAD_ABBR: Readonly<Record<LoadKind, string>> = { lamp: 'LAMP', contactor: 'COIL', beacon: 'BEACON', motor: 'MOTOR', none: 'SPARE' };

const truncate = (text: string, max: number): string => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

const TEXT = 'fill-slate-900 dark:fill-slate-100';
const MUTED = 'fill-slate-500 dark:fill-slate-400';
const OFF_BODY = 'fill-slate-200 stroke-slate-400 dark:fill-slate-800 dark:stroke-slate-600';

/** Gear + short device code. Opens the device-type menu; the actuator itself keeps its own click target. */
export function ConfigBadge({ x, y, code, label, id, onOpen }: { x: number; y: number; code: string; label: string; id: string; onOpen: (anchor: { x: number; y: number }) => void }) {
  const open = (): void => onOpen({ x, y: y + BADGE.h + 4 });
  return (
    <g
      role="button"
      tabIndex={0}
      aria-haspopup="menu"
      aria-label={label}
      data-config={id}
      onClick={open}
      onKeyDown={(event: KeyboardEvent<SVGGElement>) => {
        if (event.key !== ' ' && event.key !== 'Enter') return;
        event.preventDefault();
        event.stopPropagation();
        open();
      }}
      className="group cursor-pointer outline-none"
    >
      <rect
        x={x}
        y={y}
        width={BADGE.w}
        height={BADGE.h}
        rx={BADGE.h / 2}
        strokeWidth={1.25}
        className="fill-white stroke-slate-300 group-hover:stroke-red-500 group-focus-visible:stroke-red-500 dark:fill-[#0B0F17] dark:stroke-slate-700"
      />
      <g transform={`translate(${x + 10} ${y + BADGE.h / 2})`} fill="none" strokeWidth={1.4} strokeLinecap="round" className="stroke-slate-500 dark:stroke-slate-400">
        <circle r={2.6} />
        {Array.from({ length: 8 }, (_, i) => (
          <line key={i} x1={0} y1={-4.1} x2={0} y2={-5.5} transform={`rotate(${i * 45})`} />
        ))}
      </g>
      <text x={x + 21} y={y + BADGE.h / 2 + 3.2} fontSize={9} fontWeight={800} pointerEvents="none" className={TEXT}>
        {code}
      </text>
    </g>
  );
}

/** Flat actuator symbols. Blue = closed / active (accent), red = break-contact cap, slate = at rest. */
function ActuatorGlyph({ device, actuated, cy }: { device: InputDevice; actuated: boolean; cy: number }) {
  const cx = ACTUATOR.x + 30;
  switch (device.kind) {
    case 'pushbutton':
    case 'switch':
      return null; // drawn as the canonical mechanical switch by InputRow
    case 'limit':
      return null; // drawn as a mechanical switch with roller lever by InputRow
    case 'spare':
      return null; // open terminals, see SpareInput
    case 'sensor':
      // Passive-infrared detector: dome on a base; waves while it sees motion.
      return (
        <g>
          <rect x={cx - 14} y={cy + 4} width={28} height={6} rx={1.5} className="fill-slate-400 dark:fill-slate-600" />
          <path d={`M ${cx - 12} ${cy + 4} A 12 12 0 0 1 ${cx + 12} ${cy + 4} Z`} strokeWidth={1.5} className={actuated ? 'fill-red-500/15 stroke-red-500' : OFF_BODY} />
          {actuated &&
            [16, 22].map((r) => (
              <path key={r} d={`M ${cx - r * 0.7} ${cy - r * 0.35} A ${r} ${r} 0 0 1 ${cx + r * 0.7} ${cy - r * 0.35}`} fill="none" strokeWidth={1.5} className="stroke-red-500" />
            ))}
        </g>
      );
    default: {
      const exhaustive: never = device.kind;
      return exhaustive;
    }
  }
}

/**
 * Canonical mechanical switch (SPST): two terminals and a hinged blade. Closed = blade lies on the
 * fixed contact; open = blade raised. A pushbutton adds the plunger stem and cap of its symbol, a
 * latching switch the dashed mechanical link. NC devices carry the break-contact tick.
 */
function MechanicalSwitch({ y, device, actuated, closed, powered, live }: { y: number; device: InputDevice; actuated: boolean; closed: boolean; powered: boolean; live: boolean }) {
  const left = ACTUATOR.x + 10;
  const right = ACTUATOR.x + 70;
  const bladeEnd: readonly [number, number] = closed ? [right, y] : [right - 6, y - 15];
  const blade = closed && powered ? 'stroke-(--lb-live)' : closed ? 'stroke-slate-400 dark:stroke-slate-600' : 'stroke-slate-600 dark:stroke-slate-300';
  const mid = [(left + bladeEnd[0]) / 2, (y + bladeEnd[1]) / 2] as const;
  return (
    <g>
      <circle cx={left} cy={y} r={3} className={liveFill(powered)} />
      <circle cx={right} cy={y} r={3} className={liveFill(live)} />
      <line x1={left} y1={y} x2={bladeEnd[0]} y2={bladeEnd[1]} strokeWidth={2.5} strokeLinecap="round" className={`transition-all duration-100 ${blade}`} />
      {device.kind === 'pushbutton' ? (
        <g className="stroke-slate-600 dark:stroke-slate-300" strokeWidth={2} strokeLinecap="round">
          <line x1={mid[0]} y1={mid[1]} x2={mid[0]} y2={mid[1] - (closed ? 5 : 10)} />
          <line x1={mid[0] - 6} y1={mid[1] - (closed ? 5 : 10)} x2={mid[0] + 6} y2={mid[1] - (closed ? 5 : 10)} />
        </g>
      ) : device.kind === 'limit' ? (
        // Limit switch: dashed mechanical link down to a roller lever; the lever is pushed up when the target reaches it.
        <g className="stroke-slate-600 dark:stroke-slate-300" strokeWidth={2} strokeLinecap="round">
          <line x1={mid[0]} y1={mid[1]} x2={mid[0]} y2={y + 14} strokeWidth={1.5} strokeDasharray="3 2" />
          <g style={{ transform: `rotate(${actuated ? -14 : 12}deg)`, transformOrigin: `${mid[0] + 14}px ${y + 14}px`, transition: 'transform 90ms ease-out' }}>
            <line x1={mid[0] + 14} y1={y + 14} x2={mid[0] - 10} y2={y + 14} />
            <circle cx={mid[0] - 10} cy={y + 14} r={3.5} className={actuated ? 'fill-red-500/20' : 'fill-slate-50 dark:fill-[#020617]'} />
          </g>
          <circle cx={mid[0] + 14} cy={y + 14} r={1.75} className="fill-slate-600 dark:fill-slate-300" stroke="none" />
        </g>
      ) : (
        <line x1={mid[0]} y1={mid[1]} x2={mid[0]} y2={y - 22} strokeWidth={1.5} strokeDasharray="3 2" className="stroke-slate-500 dark:stroke-slate-400" />
      )}
      {device.contact === 'NC' && <line x1={right - 2} y1={y - 8} x2={right - 2} y2={y - 1} strokeWidth={1.5} className="stroke-slate-500 dark:stroke-slate-400" />}
    </g>
  );
}

/** Unused input: two capped conductor ends and a label, mirroring the spare output. No wire runs to its terminal. */
function SpareInput({ y, name, device, onOpenMenu, index }: { y: number; name: string; device: InputDevice; onOpenMenu: InputRowProps['onOpenMenu']; index: number }) {
  const cx = ACTUATOR.x + ACTUATOR.w / 2;
  return (
    <g data-input-row={name} data-spare="true">
      <text x={ACTUATOR.x} y={y - 24} fontSize={11} fontWeight={700} className={TEXT}>
        <tspan className={MUTED}>{device.symbol}</tspan> {truncate(device.tag, 15)}
      </text>
      <ConfigBadge x={ACTUATOR.x + 128} y={y - 37} id={name} code="SPARE" label={`Configure ${name} field device (${ACTUATOR_LABEL.spare}, ${device.contact})`} onOpen={(anchor) => onOpenMenu(index, anchor)} />
      <g role="img" aria-label={`${name} ${device.symbol} ${device.tag} (${ACTUATOR_LABEL.spare})`}>
        <circle cx={cx - 26} cy={y} r={4.5} fill="none" strokeWidth={2} className="stroke-slate-400 dark:stroke-slate-600" />
        <circle cx={cx + 26} cy={y} r={4.5} fill="none" strokeWidth={2} className="stroke-slate-400 dark:stroke-slate-600" />
        <text x={cx} y={y + 3.5} textAnchor="middle" fontSize={8.5} fontWeight={800} letterSpacing={1} className={MUTED}>
          OPEN
        </text>
      </g>
    </g>
  );
}

export interface InputRowProps {
  readonly index: number;
  readonly y: number;
  readonly input: BenchInputState;
  readonly powered: boolean;
  readonly onActuate: (index: number, actuated: boolean) => void;
  readonly onToggle: (index: number) => void;
  readonly onOpenMenu: (index: number, anchor: { x: number; y: number }) => void;
}

/** One field device on its input: actuator, schematic contact, device-type badge; wire to the duct. */
export function InputRow({ index, y, input, powered, onActuate, onToggle, onOpenMenu }: InputRowProps) {
  const { device, actuated, volts } = input;
  const momentary = isMomentary(device);
  const closed = contactClosed(device, actuated);
  const holding = useRef(false);
  const name = `I${index + 1}`;

  const release = (): void => {
    if (!holding.current) return;
    holding.current = false;
    onActuate(index, false);
  };
  const onPointerDown = (event: PointerEvent<SVGGElement>): void => {
    if (event.button > 0) return;
    if (momentary) {
      try {
        event.currentTarget.setPointerCapture?.(event.pointerId); // spring return even if released off the button
      } catch {
        // no active pointer (synthetic event): release still arrives on the element
      }
      holding.current = true;
      onActuate(index, true);
    } else {
      onToggle(index);
    }
  };
  const onKeyDown = (event: KeyboardEvent<SVGGElement>): void => {
    if (event.key !== ' ' && event.key !== 'Enter') return;
    event.preventDefault();
    event.stopPropagation();
    if (event.repeat) return;
    if (momentary) {
      holding.current = true;
      onActuate(index, true);
    } else {
      onToggle(index);
    }
  };
  const onKeyUp = (event: KeyboardEvent<SVGGElement>): void => {
    if (event.key === ' ' || event.key === 'Enter') release();
  };

  if (device.kind === 'spare') return <SpareInput y={y} name={name} device={device} onOpenMenu={onOpenMenu} index={index} />;

  const live = volts > 0;
  const mechanical = device.kind === 'pushbutton' || device.kind === 'switch' || device.kind === 'limit';

  return (
    <g data-input-row={name}>
      <text x={ACTUATOR.x} y={y - 24} fontSize={11} fontWeight={700} className={TEXT}>
        <tspan className={MUTED}>{device.symbol}</tspan> {truncate(device.tag, 15)}
      </text>
      <ConfigBadge
        x={ACTUATOR.x + 128}
        y={y - 37}
        id={name}
        code={`${KIND_ABBR[device.kind]} ${device.contact}`}
        label={`Configure ${name} field device (${ACTUATOR_LABEL[device.kind]}, ${device.contact})`}
        onOpen={(anchor) => onOpenMenu(index, anchor)}
      />

      {/* feed from the hot rail; the switch itself is the only thing between rail and route */}
      {mechanical ? (
        <>
          <line x1={40} y1={y} x2={ACTUATOR.x + 10} y2={y} strokeWidth={2} className={wireClass(powered)} />
          <line x1={ACTUATOR.x + 70} y1={y} x2={CONTACT.to} y2={y} strokeWidth={2} className={wireClass(live)} />
        </>
      ) : (
        <>
          <line x1={40} y1={y} x2={ACTUATOR.x} y2={y} strokeWidth={2} className={wireClass(powered)} />
          <line x1={ACTUATOR.x + ACTUATOR.w} y1={y} x2={CONTACT.from} y2={y} strokeWidth={2} className={wireClass(powered)} />
        </>
      )}

      <g
        role="button"
        tabIndex={0}
        aria-pressed={actuated}
        aria-label={`${name} ${device.symbol} ${device.tag} (${ACTUATOR_LABEL[device.kind]}, ${device.contact})`}
        onPointerDown={onPointerDown}
        onPointerUp={release}
        onPointerCancel={release}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        className="group cursor-pointer outline-none"
      >
        {/* unstyled border: only a focus / hover ring in the accent colour */}
        <rect
          x={ACTUATOR.x}
          y={y - ACTUATOR.h / 2}
          width={ACTUATOR.w}
          height={ACTUATOR.h}
          rx={3}
          strokeWidth={1.5}
          className="fill-transparent stroke-transparent group-hover:stroke-red-500/60 group-focus-visible:stroke-red-500"
        />
        {mechanical ? <MechanicalSwitch y={y} device={device} actuated={actuated} closed={closed} powered={powered} live={live} /> : <ActuatorGlyph device={device} actuated={actuated} cy={y} />}
      </g>

      {/* limit switches and sensors keep a separate schematic contact after the device */}
      {!mechanical && (
        <>
          <circle cx={CONTACT.from} cy={y} r={2.5} className={liveFill(powered)} />
          <circle cx={CONTACT.to} cy={y} r={2.5} className={liveFill(live)} />
          <line
            x1={CONTACT.from}
            y1={y}
            x2={closed ? CONTACT.to : CONTACT.to - 6}
            y2={closed ? y : y - 13}
            strokeWidth={2}
            strokeLinecap="round"
            className={`transition-all duration-100 ${closed ? wireClass(powered) : 'stroke-slate-500 dark:stroke-slate-400'}`}
          />
          {device.contact === 'NC' && <line x1={CONTACT.to} y1={y - 9} x2={CONTACT.to} y2={y - 1} strokeWidth={1.5} className="stroke-slate-500 dark:stroke-slate-400" />}
          <line x1={CONTACT.to} y1={y} x2={CONTACT.to + 1} y2={y} strokeWidth={2} className={wireClass(live)} />
        </>
      )}
    </g>
  );
}

export interface LoadViewProps {
  readonly index: number;
  readonly y: number;
  readonly load: OutputLoad;
  readonly on: boolean;
  readonly onOpenMenu: (index: number, anchor: { x: number; y: number }) => void;
}

function LoadGlyph({ load, on, y }: { load: OutputLoad; on: boolean; y: number }) {
  const x = LOAD_X;
  switch (load.kind) {
    case 'lamp':
      // Engineering schematic lamp: a circle crossed by an X.
      return (
        <g strokeWidth={2} strokeLinecap="round" className={on ? 'stroke-red-500' : 'stroke-slate-400 dark:stroke-slate-600'}>
          <circle cx={x} cy={y} r={14} className={on ? 'fill-red-500/15' : 'fill-transparent'} />
          <line x1={x - 9.9} y1={y - 9.9} x2={x + 9.9} y2={y + 9.9} />
          <line x1={x - 9.9} y1={y + 9.9} x2={x + 9.9} y2={y - 9.9} />
        </g>
      );
    case 'contactor':
      // Contactor drive coil: block with A1/A2 terminals; the armature pulls in when energised.
      return (
        <g>
          <rect x={x - 22} y={y - 16} width={44} height={32} rx={3} strokeWidth={1.5} className={on ? 'fill-red-500/15 stroke-red-500' : OFF_BODY} />
          <rect x={x - 15} y={y + (on ? 3 : 8)} width={30} height={5} rx={1} className={`transition-all duration-100 ${on ? 'fill-red-500' : 'fill-slate-400 dark:fill-slate-600'}`} />
          <text x={x} y={y - 3} textAnchor="middle" fontSize={11} fontWeight={800} className={TEXT}>
            {load.symbol}
          </text>
          <text x={x - 22} y={y - 19} textAnchor="middle" fontSize={7.5} className={MUTED}>
            A1
          </text>
          <text x={x + 22} y={y - 19} textAnchor="middle" fontSize={7.5} className={MUTED}>
            A2
          </text>
        </g>
      );
    case 'beacon':
      // Warning beacon: dome on a base; red while energised (the program makes it flash).
      return (
        <g>
          <rect x={x - 16} y={y + 10} width={32} height={8} rx={2} className="fill-slate-400 dark:fill-slate-600" />
          <path d={`M ${x - 14} ${y + 10} V ${y - 4} A 14 16 0 0 1 ${x + 14} ${y - 4} V ${y + 10} Z`} strokeWidth={1.5} className={on ? 'fill-red-500 stroke-red-600 dark:fill-red-400' : OFF_BODY} />
        </g>
      );
    case 'motor':
      // Motor: circle with M and a four-blade rotor that spins while the output is driven high.
      return (
        <g>
          <circle cx={x} cy={y} r={17} strokeWidth={2} className={on ? 'fill-red-500/10 stroke-red-500' : 'fill-transparent stroke-slate-400 dark:stroke-slate-600'} />
          <g
            data-rotor={on ? 'spinning' : 'idle'}
            strokeWidth={2.5}
            strokeLinecap="round"
            className={`${on ? 'stroke-red-500 motion-safe:animate-[spin_0.7s_linear_infinite]' : 'stroke-slate-400 dark:stroke-slate-600'}`}
            style={{ transformOrigin: `${x}px ${y}px` }}
          >
            <line x1={x - 12} y1={y} x2={x + 12} y2={y} />
            <line x1={x} y1={y - 12} x2={x} y2={y + 12} />
          </g>
          <circle cx={x} cy={y} r={6.5} strokeWidth={1.5} className="fill-slate-50 stroke-slate-300 dark:fill-[#020617] dark:stroke-slate-700" />
          <text x={x} y={y + 3.6} textAnchor="middle" fontSize={10} fontWeight={800} className={TEXT}>
            M
          </text>
        </g>
      );
    case 'none':
      // Nothing across the contact: two capped conductor ends with a gap.
      return (
        <g>
          <circle cx={x - 18} cy={y} r={4.5} fill="none" strokeWidth={2} className="stroke-slate-400 dark:stroke-slate-600" />
          <circle cx={x + 18} cy={y} r={4.5} fill="none" strokeWidth={2} className="stroke-slate-400 dark:stroke-slate-600" />
          <text x={x} y={y + 3.5} textAnchor="middle" fontSize={8.5} fontWeight={800} letterSpacing={1} className={MUTED}>
            OPEN
          </text>
        </g>
      );
    default: {
      const exhaustive: never = load.kind;
      return exhaustive;
    }
  }
}

/** Load across a relay contact, drawn as a flat symbol; red accent while energised. */
export function LoadView({ index, y, load, on, onOpenMenu }: LoadViewProps) {
  const name = `Q${index + 1}`;
  return (
    <g data-load={name}>
      <text x={LOAD_X} y={y - 34} textAnchor="middle" fontSize={11} fontWeight={700} className={TEXT}>
        <tspan className={MUTED}>{load.symbol}</tspan> {truncate(load.tag, 18)}
      </text>
      <g
        role="img"
        aria-label={load.kind === 'none' ? `${name} ${load.tag}` : `${load.symbol} ${load.tag} ${on ? 'energized' : 'off'}`}
        data-on={on && load.kind !== 'none'}
      >
        <LoadGlyph load={load} on={on} y={y} />
      </g>
      <ConfigBadge
        x={LOAD_X - BADGE.w / 2}
        y={y + 30}
        id={name}
        code={LOAD_ABBR[load.kind]}
        label={`Configure ${name} load (${load.tag})`}
        onOpen={(anchor) => onOpenMenu(index, anchor)}
      />
    </g>
  );
}
