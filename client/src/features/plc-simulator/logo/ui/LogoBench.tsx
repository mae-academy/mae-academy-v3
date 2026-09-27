import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import type { LogoBenchController } from '../controller';
import type { PanelKey } from '../firmware/panel';
import { INPUT_DEVICE_OPTIONS, isMomentary, LOAD_OPTIONS, type ActuatorKind, type ContactType, type LoadKind } from '../hardware/devices';
import { InputRow, LoadView } from './FieldDevices';
import { SvgMenu } from './SvgMenu';
import { HOT_LANE_Y, hotBranches, hotRail, inputRoute, lineRoute, neutralBranches, neutralRail, neutralRoute, outputRoute, relayFeedRoute, returnRoute, toPath } from './routing';
import { inputRowY, loadY, OUTPUT_TERMINAL_X, RAIL, SUPPLY, VIEW } from './geometry';
import { usePortLabelAudit } from './label-audit';
import { DEFAULT_KEYBINDINGS, matchKeybinding, type LogoKeyBindings } from '../keybindings';
import { LabelCanvas } from './LabelCanvas';
import { LogoDevice } from './LogoDevice';
import { PortLabel } from './PortLabel';
import { liveFill, supplyVars, toneText, wireClass, type Tone } from './wire';

/** Elements that own arrows / Enter / Escape themselves: the keypad leaves every key alone there. */
const KEY_OWNERS =
  'input, textarea, select, [contenteditable=""], [contenteditable="true"], [role="tab"], [role="slider"], [role="dialog"], [role="menu"], [role="listbox"]';

function Wire({ d, live, tone = 'hot' }: { d: string; live: boolean; tone?: Tone }) {
  return <path d={d} fill="none" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={wireClass(live, tone)} />;
}

export interface LogoBenchProps {
  readonly controller: LogoBenchController;
  /** Route the physical keyboard to the keypad while this bench is the visible one. */
  readonly active: boolean;
  readonly keybindings?: LogoKeyBindings;
}

/**
 * Interactive electrical bench (spec §5.3): supply and mains breaker, the Basic unit on its DIN rail,
 * field devices wired to I1..I8 and loads switched through the Q1..Q4 dry contacts. Conductors glow
 * when energised and animate while current flows through a closed loop.
 */
export function LogoBench({ controller, active, keybindings = DEFAULT_KEYBINDINGS }: LogoBenchProps) {
  const spec = controller.device;
  const powered = controller.powered;
  const ac = spec.supply.kind === 'AC';
  const inputs = controller.benchInputs;
  const wiredOutputs = controller.loads.flatMap((load, index) => (load.kind === 'none' ? [] : [index]));
  const rootRef = useRef<HTMLDivElement>(null);
  usePortLabelAudit(rootRef, 'LOGO! bench');
  const wiredRows = inputs.flatMap((input, index) => (input.device.kind === 'spare' ? [] : [index]));
  const relays = OUTPUT_TERMINAL_X.map((_, index) => controller.relayClosed(index + 1));

  // Device-type popover: at most one open at a time, anchored under its badge.
  const [menu, setMenu] = useState<{ side: 'in' | 'out'; index: number; x: number; y: number } | null>(null);
  const closeMenu = useCallback((): void => {
    setMenu((open) => {
      if (open) {
        const id = `${open.side === 'in' ? 'I' : 'Q'}${open.index + 1}`;
        window.setTimeout(() => document.querySelector<SVGGElement>(`[data-config="${id}"]`)?.focus(), 0);
      }
      return null;
    });
  }, []);

  // Brief "pressed" flash on the on-screen key, also when it was hit from the keyboard.
  const [flash, setFlash] = useState<PanelKey | null>(null);
  const flashTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(flashTimer.current), []);

  const press = useCallback(
    (key: PanelKey): void => {
      controller.press(key);
      setFlash(key);
      window.clearTimeout(flashTimer.current);
      flashTimer.current = window.setTimeout(() => setFlash(null), 140);
    },
    [controller],
  );

  useEffect(() => {
    if (!active) return undefined;

    const onWindowKeyDown = (event: globalThis.KeyboardEvent): void => {
      if (menu !== null) return; // an open menu owns the keyboard
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target;
      if (target instanceof Element && target.closest(KEY_OWNERS) !== null) return;

      // Numeric hotkeys 1-8 for inputs I1-I8
      if (/^[1-8]$/.test(event.key)) {
        const index = parseInt(event.key, 10) - 1;
        const input = controller.benchInputs[index];
        if (!input || input.device.kind === 'spare') return;
        event.preventDefault();
        if (event.repeat) return;
        if (isMomentary(input.device)) {
          controller.actuate(index, true);
        } else {
          controller.toggle(index);
        }
        return;
      }

      const key = matchKeybinding(event.key, keybindings);
      if (!key) return;
      event.preventDefault();
      press(key);
    };

    const onWindowKeyUp = (event: globalThis.KeyboardEvent): void => {
      if (menu !== null) return;
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target;
      if (target instanceof Element && target.closest(KEY_OWNERS) !== null) return;

      if (/^[1-8]$/.test(event.key)) {
        const index = parseInt(event.key, 10) - 1;
        const input = controller.benchInputs[index];
        if (!input || input.device.kind === 'spare') return;
        if (isMomentary(input.device)) {
          event.preventDefault();
          controller.actuate(index, false);
        }
      }
    };

    window.addEventListener('keydown', onWindowKeyDown);
    window.addEventListener('keyup', onWindowKeyUp);
    return () => {
      window.removeEventListener('keydown', onWindowKeyDown);
      window.removeEventListener('keyup', onWindowKeyUp);
    };
  }, [active, press, menu, keybindings, controller]);

  const onBreakerKey = (event: KeyboardEvent<SVGGElement>): void => {
    if (event.key !== ' ' && event.key !== 'Enter') return;
    event.preventDefault();
    event.stopPropagation();
    (event.currentTarget as unknown as HTMLElement).blur?.();
    controller.setPower(!powered);
  };

  const breakerX = SUPPLY.x + SUPPLY.w - 44;

  return (
    <LabelCanvas
      width={VIEW.w}
      height={VIEW.h}
      maxHeight="78vh"
      wrapperRef={rootRef}
      className={supplyVars()}
      svgClassName="select-none"
      data-supply={ac ? 'ac' : 'dc'}
      role="group"
      aria-label={`Electrical bench: ${spec.model}, ${spec.supply.volts} V ${spec.supply.kind}`}
    >
      <rect width={VIEW.w} height={VIEW.h} rx={12} strokeWidth={1} className="fill-slate-50 stroke-slate-200 dark:fill-[#020617] dark:stroke-slate-800" />

      {/* ---- supply, breaker and rails ---- */}
      <g>
        <rect x={SUPPLY.x} y={SUPPLY.y} width={SUPPLY.w} height={SUPPLY.h} rx={6} strokeWidth={1.5} className="fill-white stroke-slate-300 dark:fill-[#0B0F17] dark:stroke-slate-800" />
        <text x={SUPPLY.x + 10} y={SUPPLY.y + 20} fontSize={11} fontWeight={800} className="fill-slate-900 dark:fill-slate-100">
          {ac ? '230 V ~ 50 Hz' : '24 V ⎓ DC'}
        </text>
        <PortLabel x={SUPPLY.x + 10} y={SUPPLY.y + 36} name={spec.supply.hot} anchor="start" size={10} pair={false} className="text-slate-500 dark:text-slate-400" />
        <PortLabel x={SUPPLY.x + 34} y={SUPPLY.y + 36} name={spec.supply.ret} anchor="start" size={10} pair={false} className="text-slate-500 dark:text-slate-400" />
        <text x={SUPPLY.x + 10} y={SUPPLY.y + 58} fontSize={9} fontWeight={700} className={powered ? 'fill-red-600 dark:fill-red-400' : 'fill-slate-500'}>
          {powered ? 'MAINS ON' : 'MAINS OFF'}
        </text>
        <g
          role="switch"
          tabIndex={0}
          aria-checked={powered}
          aria-label="Mains breaker"
          onClick={(e) => {
            (e.currentTarget as unknown as HTMLElement).blur?.();
            controller.setPower(!powered);
          }}
          onPointerUp={(e) => {
            (e.currentTarget as unknown as HTMLElement).blur?.();
          }}
          onKeyDown={onBreakerKey}
          className="group cursor-pointer outline-none"
        >
          <rect x={breakerX} y={SUPPLY.y + 6} width={36} height={58} rx={3} strokeWidth={1.5} className="fill-slate-100 stroke-slate-300 group-hover:stroke-red-500 group-focus-visible:stroke-red-500 dark:fill-slate-900 dark:stroke-slate-700" />
          <rect x={breakerX + 8} y={SUPPLY.y + (powered ? 12 : 34)} width={20} height={22} rx={2} className={`transition-all duration-150 ${powered ? 'fill-red-500' : 'fill-slate-400 dark:fill-slate-600'}`} />
          <text x={breakerX + 18} y={SUPPLY.y + (powered ? 27 : 49)} textAnchor="middle" fontSize={10} fontWeight={800} pointerEvents="none" className="fill-white">
            {powered ? 'I' : 'O'}
          </text>
        </g>
      </g>

      {/* ---- conductors: one orthogonal grid, drawn under the devices ---- */}
      <Wire d={toPath(hotRail(wiredOutputs))} live={powered} />
      <Wire d={toPath(neutralRail(wiredOutputs))} live={powered} tone="ret" />
      <Wire d={toPath(lineRoute())} live={powered} />
      <Wire d={toPath(neutralRoute())} live={powered} tone="ret" />
      {inputs.map((input, index) => (input.device.kind === 'spare' ? null : <Wire key={`in${index}`} d={toPath(inputRoute(index))} live={input.volts > 0} />))}
      {OUTPUT_TERMINAL_X.map((_, index) =>
        controller.loads[index]?.kind === 'none' ? null : (
          <g key={`out${index}`}>
            <Wire d={toPath(relayFeedRoute(index))} live={powered} />
            <Wire d={toPath(outputRoute(index))} live={relays[index] === true} />
            <Wire d={toPath(returnRoute(index))} live={relays[index] === true} tone="ret" />
          </g>
        ),
      )}
      {hotBranches(wiredRows, wiredOutputs.length > 0).map(([x, y]) => (
        <circle key={`h${y}`} cx={x} cy={y} r={3} className={liveFill(powered)} />
      ))}
      {neutralBranches(wiredOutputs).map(([x, y], index) => (
        <circle key={`n${index}`} cx={x} cy={y} r={3} className={powered ? 'fill-(--lb-ret)' : 'fill-slate-400 dark:fill-slate-700'} />
      ))}
      <PortLabel x={RAIL.hotX + 6} y={HOT_LANE_Y + 12} name={spec.supply.hot} anchor="start" target={[RAIL.hotX, HOT_LANE_Y]} pair={false} className={powered ? toneText('hot') : 'text-slate-500'} />
      <PortLabel x={RAIL.retX - 8} y={RAIL.retY - 12} name={spec.supply.ret} anchor="end" target={[RAIL.retX, RAIL.retY]} pair={false} className={powered ? toneText('ret') : 'text-slate-500'} />

      {/* ---- field devices on I1..I8 ---- */}
      {inputs.map((input, index) => (
        <InputRow
          key={index}
          index={index}
          y={inputRowY(index)}
          input={input}
          powered={powered}
          onActuate={(i, actuated) => controller.actuate(i, actuated)}
          onToggle={(i) => controller.toggle(i)}
          onOpenMenu={(i, anchor) => setMenu({ side: 'in', index: i, ...anchor })}
        />
      ))}

      {/* ---- loads across the dry contacts ---- */}
      {controller.loads.map((load, index) => (
        <LoadView key={index} index={index} y={loadY(index)} load={load} on={relays[index] === true && load.kind !== 'none'} onOpenMenu={(i, anchor) => setMenu({ side: 'out', index: i, ...anchor })} />
      ))}

      <LogoDevice
        spec={spec}
        powered={powered}
        runLed={controller.runLed}
        frame={controller.frame()}
        inputVolts={inputs.map((input) => input.volts)}
        supplyVolts={[powered ? spec.supply.volts : 0, 0]}
        relays={relays}
        cardLoaded={controller.cardHasProgram}
        flash={flash}
        onKey={press}
      />

      {menu !== null && menu.side === 'in' && (
        <SvgMenu
          x={menu.x}
          y={menu.y}
          title={`I${menu.index + 1} field device`}
          options={INPUT_DEVICE_OPTIONS.map((option) => ({
            id: `${option.kind}:${option.contact}`,
            label: option.label,
            active: inputs[menu.index]?.device.kind === option.kind && inputs[menu.index]?.device.contact === option.contact,
          }))}
          onPick={(id) => {
            const [kind, contact] = id.split(':');
            controller.setInputDevice(menu.index, kind as ActuatorKind, contact as ContactType);
            closeMenu();
          }}
          onClose={closeMenu}
        />
      )}
      {menu !== null && menu.side === 'out' && (
        <SvgMenu
          x={menu.x - 60}
          y={menu.y}
          title={`Q${menu.index + 1} load`}
          options={LOAD_OPTIONS.map((option) => ({ id: option.kind, label: option.label, active: controller.loads[menu.index]?.kind === option.kind }))}
          onPick={(id) => {
            controller.setLoadKind(menu.index, id as LoadKind);
            closeMenu();
          }}
          onClose={closeMenu}
        />
      )}
    </LabelCanvas>
  );
}
