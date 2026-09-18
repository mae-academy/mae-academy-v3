/**
 * Interactive Arduino UNO canvas. The board SVG is inlined into the DOM; a same-viewBox overlay layer renders
 * pin glow, LED state and hit targets, while HTML mini-widgets (toggle/slider) anchor to the pin headers.
 */
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import unoRaw from "./arduinoUno.svg?raw";
import { ANALOG_HEADER_Y, DIGITAL_HEADER_Y, HEADER_PINS, LEDS, PWM_CAPABLE, VIEW_H, VIEW_W, analogPinX, digitalPinX, pinName } from "./arduinoBoardGeometry";
import type { HardwareSnapshot } from "./arduinoRuntime";

/** Scopes the SVG's global `.stN` classes to the board so they cannot leak into the app stylesheet. */
export function prepareUnoSvg(raw: string): string {
  return raw
    .replace(/<style[\s\S]*?<\/style>/, m => m.replace(/\.(st\d+)\b/g, ".arduino-uno-svg .$1"))
    .replace(/<svg\b/, '<svg class="arduino-uno-svg" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Arduino UNO R3 board"');
}
const UNO_SVG = prepareUnoSvg(unoRaw);

const RATIO = VIEW_W / VIEW_H;
const TOGGLE_TIER = 44;
const ROW_H = 26;
const pct = (n: number, total: number): string => `${(n / total) * 100}%`;

function useFlash(count: number, ms = 110): boolean {
  const [on, setOn] = useState(false);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (count === 0) {
      setOn(false);
      return;
    }
    setOn(true);
    const id = window.setTimeout(() => setOn(false), ms);
    return () => window.clearTimeout(id);
  }, [count, ms]);
  return on;
}

function useElementSize<T extends HTMLElement>(): [React.RefObject<T | null>, { w: number; h: number }] {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setSize({ w: entry.contentRect.width, h: entry.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size];
}

const StaticBoardSvg = memo(function StaticBoardSvg() {
  return <div className="absolute inset-0" dangerouslySetInnerHTML={{ __html: UNO_SVG }} />;
});

function DigitalToggle({ pin, level, tier, onChange }: { pin: number; level: 0 | 1; tier: number; onChange: (level: 0 | 1) => void }) {
  const x = digitalPinX(pin);
  const lift = 4 + tier * TOGGLE_TIER;
  const high = level === 1;
  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none absolute w-px bg-cyan-500/70"
        style={{ left: pct(x, VIEW_W), top: -lift, height: `calc(${pct(DIGITAL_HEADER_Y, VIEW_H)} + ${lift}px)` }}
      />
      <div className="absolute flex flex-col items-center gap-0.5" style={{ left: pct(x, VIEW_W), top: -lift, transform: "translate(-50%, -100%)" }}>
        <span className="font-mono text-[9px] font-bold leading-none text-slate-500 dark:text-slate-400">D{pin}</span>
        <button
          type="button"
          role="switch"
          aria-checked={high}
          aria-label={`Digital input ${pinName(pin)} ${high ? "HIGH" : "LOW"}`}
          title={`${pinName(pin)}: ${high ? "HIGH (1)" : "LOW (0)"} — click to toggle`}
          onClick={() => onChange(high ? 0 : 1)}
          className={`relative h-[22px] w-[14px] cursor-pointer rounded-full border transition-colors ${high ? "border-cyan-400 bg-cyan-500/80" : "border-slate-400 bg-slate-300 dark:border-slate-600 dark:bg-slate-700"}`}
        >
          <span className={`absolute left-[1px] h-[10px] w-[10px] rounded-full bg-white shadow transition-all ${high ? "top-[1px]" : "top-[9px]"}`} />
        </button>
        <span className={`font-mono text-[8px] font-bold leading-none ${high ? "text-cyan-600 dark:text-cyan-300" : "text-slate-400"}`}>{high ? "H" : "L"}</span>
      </div>
    </>
  );
}

function AnalogSlider({ channel, value, row, onChange }: { channel: number; value: number; row: number; onChange: (v: number) => void }) {
  const x = analogPinX(channel);
  const offset = 10 + row * ROW_H;
  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none absolute w-px bg-violet-500/70"
        style={{ left: pct(x, VIEW_W), top: pct(ANALOG_HEADER_Y, VIEW_H), height: `calc(${pct(VIEW_H - ANALOG_HEADER_Y, VIEW_H)} + ${offset + 11}px)` }}
      />
      <div
        className="absolute flex h-[22px] items-center gap-1.5 rounded-md border border-slate-300 bg-white/90 px-1.5 shadow-xs dark:border-white/[0.1] dark:bg-[#0d0f12]/95"
        style={{ right: pct(VIEW_W - x, VIEW_W), top: `calc(100% + ${offset}px)` }}
      >
        <span className="font-mono text-[9px] font-bold text-violet-600 dark:text-violet-300">A{channel}</span>
        <input
          type="range"
          min={0}
          max={1023}
          step={1}
          value={value}
          aria-label={`Analog input A${channel}`}
          onChange={e => onChange(Number(e.target.value))}
          className="h-1 w-[88px] cursor-pointer accent-violet-500"
        />
        <span className="w-[74px] text-end font-mono text-[9px] tabular-nums text-slate-600 dark:text-slate-300">
          {value} · {((value * 5) / 1023).toFixed(2)}V
        </span>
      </div>
    </>
  );
}

interface Props {
  snapshot: HardwareSnapshot;
  onDigitalInput: (pin: number, level: 0 | 1) => void;
  onAnalogInput: (channel: number, value: number) => void;
}

export function ArduinoBoard({ snapshot, onDigitalInput, onAnalogInput }: Props) {
  const [boxRef, box] = useElementSize<HTMLDivElement>();
  const tx = useFlash(snapshot.txCount);
  const rx = useFlash(snapshot.rxCount);

  const digitalInputs = snapshot.digitalInputs;
  const analogInputs = snapshot.analogInputs;
  const topPad = 20 + (digitalInputs.length > 0 ? 16 + TOGGLE_TIER * (digitalInputs.length > 1 ? 2 : 1) : 0);
  const bottomPad = 20 + Math.max(analogInputs.length, 1) * ROW_H;

  const width = useMemo(() => {
    if (!box.w || !box.h) return 640;
    const byHeight = (box.h - topPad - bottomPad) * RATIO;
    return Math.max(300, Math.min(box.w - 24, byHeight, 980));
  }, [box.w, box.h, topPad, bottomPad]);

  const pin13 = snapshot.pins[13];
  const lBrightness = pin13.mode === "OUTPUT" ? (pin13.pwm !== null ? pin13.pwm / 255 : pin13.level) : 0;
  const ledLevel: Record<string, number> = { L: lBrightness, TX: tx ? 1 : 0, RX: rx ? 1 : 0, ON: 1 };

  return (
    <div ref={boxRef} className="relative flex h-full w-full items-center justify-center overflow-auto">
      <div className="relative shrink-0" style={{ width, marginTop: topPad, marginBottom: bottomPad }}>
        <div className="relative w-full" style={{ aspectRatio: `${VIEW_W} / ${VIEW_H}` }}>
          <StaticBoardSvg />

          <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="absolute inset-0 h-full w-full overflow-visible" aria-hidden={false}>
            <defs>
              <filter id="arduino-glow" x="-100%" y="-100%" width="300%" height="300%">
                <feGaussianBlur stdDeviation="1.6" />
              </filter>
            </defs>

            {LEDS.map(led => {
              const v = ledLevel[led.id] ?? 0;
              return (
                <g key={led.id} data-led={led.id}>
                  <title>{led.id === "L" ? "L — pin 13 built-in LED" : led.id === "ON" ? "ON — power" : `${led.id} — serial activity`}</title>
                  <rect x={led.x} y={led.y} width={led.w} height={led.h} rx={0.6} fill="#2a2f3a" opacity={0.92} />
                  <rect x={led.x - 1} y={led.y - 1} width={led.w + 2} height={led.h + 2} rx={1.2} fill={led.color} opacity={v * 0.85} filter="url(#arduino-glow)" />
                  <rect x={led.x} y={led.y} width={led.w} height={led.h} rx={0.6} fill={led.color} opacity={0.12 + v * 0.88} />
                </g>
              );
            })}

            {HEADER_PINS.map(hp => {
              const state = hp.pin !== undefined ? snapshot.pins[hp.pin] : undefined;
              let glow: React.ReactNode = null;
              let description = hp.label;
              if (state && state.mode !== "UNSET") {
                const pwm = state.pwm !== null;
                const duty = pwm ? (state.pwm as number) / 255 : state.level;
                description = `${hp.pin !== undefined ? pinName(hp.pin) : hp.label} · ${state.mode}${state.mode === "OUTPUT" ? (pwm ? ` · PWM ${state.pwm}/255 (${Math.round(duty * 100)}%)` : state.level ? " · HIGH" : " · LOW") : ""}`;
                if (state.mode === "OUTPUT") {
                  glow =
                    duty > 0 ? (
                      <>
                        <circle cx={hp.x} cy={hp.y} r={2.4 + duty * 2.2} fill="#fbbf24" opacity={0.25 + duty * 0.6} filter="url(#arduino-glow)" />
                        <circle cx={hp.x} cy={hp.y} r={1.7} fill="#fde68a" opacity={0.3 + duty * 0.7} />
                      </>
                    ) : (
                      <circle cx={hp.x} cy={hp.y} r={2.1} fill="none" stroke="#fb7185" strokeWidth={0.5} opacity={0.6} />
                    );
                } else {
                  const level = snapshot.inputLevels[hp.pin as number] ?? (state.mode === "INPUT_PULLUP" ? 1 : 0);
                  glow = <circle cx={hp.x} cy={hp.y} r={2.1} fill={level ? "#22d3ee" : "none"} fillOpacity={0.85} stroke="#22d3ee" strokeWidth={0.5} />;
                }
              }
              return (
                <g key={hp.id} data-pin={hp.id}>
                  {glow}
                  <circle cx={hp.x} cy={hp.y} r={3.6} fill="transparent">
                    <title>{description}</title>
                  </circle>
                </g>
              );
            })}
          </svg>

          {digitalInputs.map((pin, i) => (
            <DigitalToggle key={pin} pin={pin} tier={i % 2} level={snapshot.inputLevels[pin] ?? (snapshot.pins[pin].mode === "INPUT_PULLUP" ? 1 : 0)} onChange={level => onDigitalInput(pin, level)} />
          ))}
          {analogInputs.map((ch, row) => (
            <AnalogSlider key={ch} channel={ch} row={row} value={snapshot.analogValues[ch] ?? 512} onChange={v => onAnalogInput(ch, v)} />
          ))}
        </div>
      </div>
    </div>
  );
}
