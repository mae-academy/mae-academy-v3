/**
 * Interactive Arduino UNO canvas. The board SVG is inlined into the DOM; a same-viewBox overlay layer renders
 * pin glow and LED state, and a pixel-space layer draws flat-vector peripherals wired directly to the headers.
 */
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import unoRaw from "./arduinoUno.svg?raw";
import { ANALOG_HEADER_Y, DIGITAL_HEADER_Y, HEADER_PINS, LEDS, VIEW_H, VIEW_W, analogPinX, digitalPinX, pinName } from "./arduinoBoardGeometry";
import type { PinUsage } from "./arduinoCompiler";
import { BTN_H, BTN_W, LED_H, LED_W, POT_H, POT_W, RES_H, RES_W, VectorLed, VectorPotentiometer, VectorPushButton, VectorResistor } from "./components/circuit";
import type { HardwareSnapshot } from "./arduinoRuntime";

/** Scopes the SVG's global `.stN` classes to the board so they cannot leak into the app stylesheet. */
export function prepareUnoSvg(raw: string): string {
  return raw
    .replace(/<style[\s\S]*?<\/style>/, m => m.replace(/\.(st\d+)\b/g, ".arduino-uno-svg .$1"))
    .replace(/<svg\b/, '<svg class="arduino-uno-svg" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Arduino UNO R3 board"');
}
const UNO_SVG = prepareUnoSvg(unoRaw);

const RATIO = VIEW_W / VIEW_H;

/** Peripheral footprints (px, before fit-scaling). Components are drawn inside these local frames. */
const OUT_C = { w: 150, h: 86, ledX: 12, ledY: 4, resX: 44, resY: 64, resS: 0.8 };
const IN_C = { w: 132, h: 72, btnX: 8, btnY: 8, btnS: 46 / BTN_W };
const AN_C = { w: 270, h: 88, potX: 196, potY: 12, potS: 0.72 };
const GAP_TOP = 40;
const GAP_BOTTOM = 44;
const MOD_SPACING = 14;
const CABLE_MARGIN = 120;
const WIRE = { signalIn: "#06B6D4", signalOut: "#7C3AED", vcc: "#DC2626", series: "#F59E0B" } as const;
const TOP_GND = { x: 125.75, y: 19.05 };
const V5 = { x: 167.25, y: 190.05 };
const BOTTOM_GND = { x: 176.25, y: 190.05 };
const USB_JACK = { left: 10.2, cy: 64, h: 40.6 };

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

type Pt = { x: number; y: number };

/** Flat vector wire: 3 px solid stroke on a perfect cubic bezier with vertical end tangents, no shadow. */
function Wire({ from, to, color, label, ground = false }: { from: Pt; to: Pt; color?: string; label: string; ground?: boolean }) {
  const dy = to.y - from.y;
  const dir = dy >= 0 ? 1 : -1;
  const k = Math.max(20, Math.abs(dy) * 0.5);
  const d = `M ${from.x} ${from.y} C ${from.x} ${from.y + dir * k}, ${to.x} ${to.y - dir * k}, ${to.x} ${to.y}`;
  const stroke = ground ? "stroke-slate-800 dark:stroke-slate-500" : undefined;
  const fill = ground ? "fill-slate-800 dark:fill-slate-500" : undefined;
  return (
    <g data-wire={label}>
      <path d={d} fill="none" stroke={color} className={stroke} strokeWidth={3} strokeLinecap="round" />
      <circle cx={from.x} cy={from.y} r={2.6} fill={color} className={fill} />
      <circle cx={to.x} cy={to.y} r={2.6} fill={color} className={fill} />
    </g>
  );
}

interface Props {
  snapshot: HardwareSnapshot;
  onDigitalInput: (pin: number, level: 0 | 1) => void;
  onAnalogInput: (channel: number, value: number) => void;
  /** Statically analysed pin usage of the current sketch: peripherals stay visible across Reset. */
  layout?: PinUsage;
  /** External LED colours keyed by digital pin (default red). */
  ledColors?: Record<number, string>;
}

const EMPTY_LAYOUT: PinUsage = { digitalInputs: [], pullups: [], analogInputs: [], outputs: [] };
const uniqSorted = (xs: number[]): number[] => Array.from(new Set(xs)).sort((a, b) => a - b);

type TopModule = { kind: "in" | "out"; pin: number };

export function ArduinoBoard({ snapshot, onDigitalInput, onAnalogInput, layout = EMPTY_LAYOUT, ledColors = {} }: Props) {
  const [boxRef, box] = useElementSize<HTMLDivElement>();
  const tx = useFlash(snapshot.txCount);
  const rx = useFlash(snapshot.rxCount);

  // Static scaffolding (from the sketch) united with pins the running program touched.
  const runtimeOutputs = snapshot.pins.map((p, i) => (p.mode === "OUTPUT" && i <= 13 ? i : -1)).filter(i => i >= 0);
  const allOutputs = uniqSorted([...layout.outputs, ...runtimeOutputs]);
  // Pin 13 is the built-in L LED; it only gets an external circuit when the sketch drives other outputs too.
  const outputs = allOutputs.filter(p => p < 13 || allOutputs.length > 1);
  const digitalInputs = uniqSorted([...layout.digitalInputs, ...snapshot.digitalInputs]).filter(p => !allOutputs.includes(p) && p !== 13);
  const analogInputs = uniqSorted([...layout.analogInputs, ...snapshot.analogInputs]);
  const topModules: TopModule[] = [...digitalInputs.map((pin): TopModule => ({ kind: "in", pin })), ...outputs.map((pin): TopModule => ({ kind: "out", pin }))].sort((a, b) => digitalPinX(a.pin) - digitalPinX(b.pin));

  const topPad = topModules.length > 0 ? GAP_TOP + OUT_C.h + 14 : 16;
  const bottomPad = analogInputs.length > 0 ? GAP_BOTTOM + AN_C.h + 16 : 16;

  const width = useMemo(() => {
    if (!box.w || !box.h) return 640;
    const byHeight = (box.h - topPad - bottomPad) * RATIO;
    return Math.max(340, Math.min(box.w - CABLE_MARGIN - 24, byHeight, 980));
  }, [box.w, box.h, topPad, bottomPad]);

  const s = width / VIEW_W;
  const boardH = width / RATIO;
  const P = (x: number, y: number): Pt => ({ x: x * s, y: y * s });

  const pin13 = snapshot.pins[13];
  const lBrightness = pin13.mode === "OUTPUT" ? (pin13.pwm !== null ? pin13.pwm / 255 : pin13.level) : 0;
  const ledLevel: Record<string, number> = { L: lBrightness, TX: tx ? 1 : 0, RX: rx ? 1 : 0, ON: 1 };
  const usbConnected = snapshot.status !== "idle";

  // Peripheral rows may extend past the board but never past the pane; oversized rows are scaled down to fit.
  const boardLeft = Math.max(0, (box.w - (width + CABLE_MARGIN)) / 2) + CABLE_MARGIN;
  const minX = box.w ? -(boardLeft - 10) : 0;
  const maxX = box.w ? box.w - boardLeft - 10 : width;
  const fitScale = (total: number): number => (total > 0 ? Math.min(1, (maxX - minX) / total) : 1);
  const placeRow = (total: number, anchorX: number): number => Math.max(minX, Math.min(maxX - total, anchorX - total / 2));
  const modW = (m: TopModule): number => (m.kind === "in" ? IN_C.w : OUT_C.w);
  const modH = (m: TopModule): number => (m.kind === "in" ? IN_C.h : OUT_C.h);

  const topTotal = topModules.reduce((acc, m) => acc + modW(m), 0) + Math.max(0, topModules.length - 1) * MOD_SPACING;
  const kTop = fitScale(topTotal);
  const topAnchor = topModules.length ? (topModules.reduce((acc, m) => acc + digitalPinX(m.pin), 0) / topModules.length) * s : 0;
  let cursor = placeRow(topTotal * kTop, topAnchor);
  const topLayout = topModules.map(m => {
    const x = cursor;
    cursor += (modW(m) + MOD_SPACING) * kTop;
    return { ...m, x, y: -(GAP_TOP + modH(m) * kTop), k: kTop };
  });
  const aTotal = analogInputs.length * AN_C.w + Math.max(0, analogInputs.length - 1) * MOD_SPACING;
  const kA = fitScale(aTotal);
  const aStart = placeRow(aTotal * kA, ((V5.x + analogPinX(analogInputs[0] ?? 0)) / 2) * s);
  const aStep = (AN_C.w + MOD_SPACING) * kA;
  const aY = boardH + GAP_BOTTOM;

  // USB-B cable: flush plug on the jack's left face, then a straight horizontal run off the left edge.
  const jack = P(USB_JACK.left, USB_JACK.cy);
  const plugH = USB_JACK.h * s * 0.5;
  const plugLen = 26;
  const bootLen = 12;
  const cableEnd = -(boardLeft + 80);

  // Wires are collected per layer: ground returns at the bottom, then power/series, then signals.
  const gnd: React.ReactNode[] = [];
  const mid: React.ReactNode[] = [];
  const signal: React.ReactNode[] = [];
  const art: React.ReactNode[] = [];
  const overlays: React.ReactNode[] = [];

  topLayout.forEach(m => {
    const at = (lx: number, ly: number): Pt => ({ x: m.x + lx * m.k, y: m.y + ly * m.k });
    const xf = `translate(${m.x} ${m.y}) scale(${m.k})`;
    const pinPt = P(digitalPinX(m.pin), DIGITAL_HEADER_Y);
    const gndPt = P(TOP_GND.x, TOP_GND.y);
    if (m.kind === "out") {
      const st = snapshot.pins[m.pin];
      const brightness = st.mode === "OUTPUT" ? (st.pwm !== null ? st.pwm / 255 : st.level) : 0;
      const lit = brightness > 0.02;
      const anode = at(OUT_C.ledX + 12, OUT_C.ledY + 62);
      const cathode = at(OUT_C.ledX + 24, OUT_C.ledY + 52);
      const resL = at(OUT_C.resX, OUT_C.resY + 12 * OUT_C.resS);
      const resR = at(OUT_C.resX + RES_W * OUT_C.resS, OUT_C.resY + 12 * OUT_C.resS);
      signal.push(<Wire key={`o${m.pin}s`} label={`D${m.pin}-signal`} from={pinPt} to={anode} color={WIRE.signalOut} />);
      mid.push(<Wire key={`o${m.pin}m`} label={`D${m.pin}-series`} from={cathode} to={resL} color={WIRE.series} />);
      gnd.push(<Wire key={`o${m.pin}g`} label={`D${m.pin}-gnd`} from={resR} to={gndPt} ground />);
      art.push(
        <g key={`oa${m.pin}`} data-module={`O${m.pin}`} data-lit={lit ? "1" : "0"} transform={xf}>
          <VectorLed x={OUT_C.ledX} y={OUT_C.ledY} width={LED_W} height={LED_H} state={brightness} color={ledColors[m.pin] ?? "#EF4444"} />
          <VectorResistor x={OUT_C.resX} y={OUT_C.resY} width={RES_W * OUT_C.resS} height={RES_H * OUT_C.resS} value={220} />
          <text x={OUT_C.resX + (RES_W * OUT_C.resS) / 2} y={OUT_C.resY - 3} textAnchor="middle" fontSize={8} fontFamily="ui-monospace, monospace" className="fill-slate-500 dark:fill-slate-400">220Ω</text>
          <text x={62} y={16} fontSize={9} fontWeight={700} className="fill-slate-700 dark:fill-slate-200">Digital Output</text>
          <text x={62} y={28} fontSize={8.5} fontFamily="ui-monospace, monospace" className="fill-slate-500 dark:fill-slate-400">{pinName(m.pin)}{lit ? " · HIGH" : " · LOW"}</text>
        </g>,
      );
    } else {
      const pullup = layout.pullups.includes(m.pin) || snapshot.pins[m.pin].mode === "INPUT_PULLUP";
      const level: 0 | 1 = snapshot.inputLevels[m.pin] ?? (pullup ? 1 : 0);
      const high = level === 1;
      const legL = at(IN_C.btnX, IN_C.btnY + 42 * IN_C.btnS);
      const legR = at(IN_C.btnX + 56 * IN_C.btnS, IN_C.btnY + 14 * IN_C.btnS);
      signal.push(<Wire key={`i${m.pin}s`} label={`D${m.pin}-signal`} from={pinPt} to={legR} color={WIRE.signalIn} />);
      gnd.push(<Wire key={`i${m.pin}g`} label={`D${m.pin}-gnd`} from={gndPt} to={legL} ground />);
      art.push(
        <g key={`ia${m.pin}`} data-module={`D${m.pin}`} transform={xf}>
          <VectorPushButton x={IN_C.btnX} y={IN_C.btnY} width={IN_C.btnS * BTN_W} height={IN_C.btnS * BTN_H} state={high} color={high ? "#0E7490" : "#1F2937"} />
          <text x={64} y={26} fontSize={9} fontWeight={700} className="fill-slate-700 dark:fill-slate-200">Digital Input</text>
          <text x={64} y={39} fontSize={8.5} fontFamily="ui-monospace, monospace" className="fill-slate-500 dark:fill-slate-400">{pinName(m.pin)}{high ? " · HIGH" : " · LOW"}</text>
        </g>,
      );
      overlays.push(
        <button
          key={`ib${m.pin}`}
          type="button"
          role="switch"
          aria-checked={high}
          aria-label={`Digital input ${pinName(m.pin)} ${high ? "HIGH" : "LOW"}`}
          title={`${pinName(m.pin)}: ${high ? "HIGH (1)" : "LOW (0)"} — click to toggle`}
          onClick={() => onDigitalInput(m.pin, high ? 0 : 1)}
          className="absolute cursor-pointer rounded-full"
          style={{ left: at(IN_C.btnX + 8, 0).x, top: at(0, IN_C.btnY + 8).y, width: 30 * m.k, height: 30 * m.k }}
        />,
      );
    }
  });

  analogInputs.forEach((ch, i) => {
    const ax = aStart + i * aStep;
    const at = (lx: number, ly: number): Pt => ({ x: ax + lx * kA, y: aY + ly * kA });
    const pinTip = (n: number): Pt => at(AN_C.potX + [20, 32, 44][n] * AN_C.potS, AN_C.potY);
    const value = snapshot.analogValues[ch] ?? 512;
    gnd.push(<Wire key={`ag${ch}`} label={`A${ch}-gnd`} from={P(BOTTOM_GND.x, BOTTOM_GND.y)} to={pinTip(2)} ground />);
    mid.push(<Wire key={`av${ch}`} label={`A${ch}-5v`} from={P(V5.x, V5.y)} to={pinTip(0)} color={WIRE.vcc} />);
    signal.push(<Wire key={`as${ch}`} label={`A${ch}-signal`} from={P(analogPinX(ch), ANALOG_HEADER_Y)} to={pinTip(1)} color={WIRE.signalIn} />);
    art.push(
      <g key={`aa${ch}`} transform={`translate(${ax} ${aY}) scale(${kA})`}>
        <VectorPotentiometer x={AN_C.potX} y={AN_C.potY} width={POT_W * AN_C.potS} height={POT_H * AN_C.potS} value={value} />
      </g>,
    );
    overlays.push(
      <div key={`ac${ch}`} data-module={`A${ch}`} className="absolute" style={{ left: ax, top: aY + 22 * kA, width: 176, transform: `scale(${kA})`, transformOrigin: "0 0" }}>
        <div className="text-[10px] font-bold text-slate-700 dark:text-slate-200">
          Analog Input <span className="ms-1 font-mono font-medium text-slate-500 dark:text-slate-400">A{ch}</span>
        </div>
        <input
          type="range"
          min={0}
          max={1023}
          step={1}
          value={value}
          aria-label={`Analog input A${ch}`}
          onChange={e => onAnalogInput(ch, Number(e.target.value))}
          className="my-1.5 block h-1.5 w-full cursor-pointer accent-violet-600"
        />
        <div className="flex justify-between font-mono text-[8px] text-slate-400">
          <span>0</span>
          <span>512</span>
          <span>1023</span>
        </div>
        <div className="mt-1 font-mono text-[10px] font-semibold tabular-nums text-slate-600 dark:text-slate-300">
          raw {value} · {((value * 5) / 1023).toFixed(2)} V
        </div>
      </div>,
    );
  });

  return (
    <div ref={boxRef} className="relative flex h-full w-full items-center justify-center overflow-auto">
      <div className="relative shrink-0" style={{ width, marginTop: topPad, marginBottom: bottomPad, marginLeft: CABLE_MARGIN }}>
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
                        <circle cx={hp.x} cy={hp.y} r={2.4 + duty * 2.2} fill="#ef4444" opacity={0.3 + duty * 0.65} filter="url(#arduino-glow)" />
                        <circle cx={hp.x} cy={hp.y} r={1.7} fill="#fecaca" opacity={0.35 + duty * 0.65} />
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

          {/* Pixel-space layer: flat-vector USB cable, peripherals and wires. */}
          <svg className="pointer-events-none absolute left-0 top-0 overflow-visible" width={width} height={boardH} viewBox={`0 0 ${width} ${boardH}`} aria-hidden data-layer="wiring">
            {usbConnected && (
              <g data-usb="connected">
                <line x1={cableEnd} y1={jack.y} x2={jack.x - plugLen - bootLen} y2={jack.y} stroke="#2563EB" strokeWidth={9} />
                <rect data-usb-boot x={jack.x - plugLen - bootLen} y={jack.y - plugH / 2 - 3} width={bootLen} height={plugH + 6} rx={2} fill="#1E3A8A" />
                <rect data-usb-plug x={jack.x - plugLen} y={jack.y - plugH / 2} width={plugLen} height={plugH} fill="#CBD5E1" />
              </g>
            )}
            {gnd}
            {mid}
            {art}
            {signal}
          </svg>
          {overlays}
        </div>
      </div>
    </div>
  );
}
