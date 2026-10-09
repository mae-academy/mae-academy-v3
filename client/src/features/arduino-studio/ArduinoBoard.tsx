/**
 * Interactive Arduino UNO canvas. The board SVG is inlined into the DOM; a same-viewBox overlay layer renders
 * pin glow and LED state, and a pixel-space layer draws flat-vector peripherals wired directly to the headers.
 */
import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import unoRaw from "./arduinoUno.svg?raw";
import { ANALOG_HEADER_Y, DIGITAL_HEADER_Y, HEADER_PINS, LEDS, VIEW_H, VIEW_W, analogPinX, digitalPinX, pinName } from "./arduinoBoardGeometry";
import type { PinUsage } from "@shared/code/arduinoTypes";
import { BTN_H, BTN_W, LED_H, LED_W, LCD_HOLE_Y, LcdWires, POT_H, POT_W, RES_H, RES_W, VectorLed, VectorPotentiometer, VectorPushButton, VectorResistor, buildLcdHarness } from "./components/circuit";
import { LcdDisplay, TRIMMER } from "./components/LcdDisplay";
import { LcdContrastKnob } from "./components/LcdContrastKnob";
import { lcdHoleX } from "./components/circuit/lcdGeometry";
import type { HardwareSnapshot } from "./arduinoRuntime";
import { StudioSlider } from "@/components/common/templates";

/** Scopes the SVG's global `.stN` classes to the board so they cannot leak into the app stylesheet. */
export function prepareUnoSvg(raw: string): string {
  return raw
    .replace(/<style[\s\S]*?<\/style>/, m => m.replace(/\.(st\d+)\b/g, ".arduino-uno-svg .$1"))
    .replace(/<svg\b/, '<svg class="arduino-uno-svg" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Arduino UNO R3 board"');
}
const UNO_SVG = prepareUnoSvg(unoRaw);

const CANVAS_W = 800;
const CANVAS_H = 600;
/** With the LCD on, the canvas grows upward: LCD row, jumper lanes, then (optionally) the module row above the board. */
const LCD_HOLE_ABOVE = { withModules: 196, bare: 80 } as const;
const LCD_TOP_MARGIN = 12;
const LCD_BOTTOM_ROOM = 58;
const DEFAULT_LCD_PINS = [12, 11, 5, 4, 3, 2];

/** Board scaling and coordinates within the 800x600 canvas */
const S_BOARD = 1.75;
const BOARD_W = VIEW_W * S_BOARD; // 499.1
const BOARD_H = VIEW_H * S_BOARD; // 365.75
const BOARD_X = 142;
const BOARD_Y = 120;

/** Peripheral footprints (px). Components are drawn inside these local frames. */
const OUT_C = { w: 150, h: 86, ledX: 12, ledY: 4, resX: 44, resY: 64, resS: 0.8 };
const IN_C = { w: 132, h: 72, btnX: 8, btnY: 8, btnS: 46 / BTN_W };
const AN_C = { w: 270, h: 88, potX: 196, potY: 12, potS: 0.72 };
const GAP_TOP = 24;
const GAP_BOTTOM = 18;
const MOD_SPACING = 14;
const WIRE = { signalIn: "#06B6D4", signalOut: "#7C3AED", vcc: "#DC2626", series: "#F59E0B" } as const;
const TOP_GND = { x: 125.75, y: 19.05 };
const V5 = { x: 167.25, y: 190.05 };
const BOTTOM_GND = { x: 176.25, y: 190.05 };
/** Port faces on the Uno SVG (viewBox units): USB-B jack and DC barrel jack both open toward the left edge. */
const USB_JACK = { left: 10.2, cy: 64, h: 40.6 };
const DC_JACK = { left: 26.2, cy: 171.35, h: 31.9 };
const USB_COLOR = "#1976D2";
const CABLE_W = 10; // heavy-gauge cable stroke (canvas units, scaled with the board)
const CABLE_TRANSITION = "transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.3s ease";
const USB_INSERT = 14;
const USB_RETRACT = 22;
const DC_INSERT = 12;
const DC_RETRACT = 28;
const CABLE_EXTENT = 600; // cables run this far past the canvas edge so they always reach the pane boundary

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
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      setSize({ w: rect.width, h: rect.height });
    }
    const ro = new ResizeObserver(([entry]) => {
      if (entry) {
        setSize({ w: entry.contentRect.width, h: entry.contentRect.height });
      }
    });
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

export const LED_COLOR_OPTIONS = [
  { label: "Red", color: "#EF4444" },
  { label: "Green", color: "#22C55E" },
  { label: "Blue", color: "#3B82F6" },
  { label: "Yellow", color: "#EAB308" },
  { label: "White", color: "#F8FAFC" },
] as const;

/** Localized labels for the LED color picker; falls back to the English `LED_COLOR_OPTIONS` order/colors. */
function useLedColorOptions(): { label: string; color: string }[] {
  const { t } = useTranslation("simulators");
  return [
    { label: t("arduino.colorRed", "Red"), color: "#EF4444" },
    { label: t("arduino.colorGreen", "Green"), color: "#22C55E" },
    { label: t("arduino.colorBlue", "Blue"), color: "#3B82F6" },
    { label: t("arduino.colorYellow", "Yellow"), color: "#EAB308" },
    { label: t("arduino.colorWhite", "White"), color: "#F8FAFC" },
  ];
}

interface Props {
  snapshot: HardwareSnapshot;
  onDigitalInput: (pin: number, level: 0 | 1) => void;
  onAnalogInput: (channel: number, value: number) => void;
  /** Statically analysed pin usage of the current sketch: peripherals stay visible across Reset. */
  layout?: PinUsage;
  /** External LED colours keyed by digital pin (default red). */
  ledColors?: Record<number, string>;
  /** Callback when user changes an LED's color via the popover. */
  onLedColorChange?: (pin: number, color: string) => void;
  /** Show the 16x2 LCD module with its auto-wired jumpers. */
  lcdVisible?: boolean;
  /** Turns the LCD's V0 contrast trimmer (0..1). */
  onLcdContrast?: (value: number) => void;
}

const EMPTY_LAYOUT: PinUsage = { digitalInputs: [], pullups: [], analogInputs: [], outputs: [] };
const uniqSorted = (xs: number[]): number[] => Array.from(new Set(xs)).sort((a, b) => a - b);

type TopModule = { kind: "in" | "out"; pin: number };

export function ArduinoBoard({ snapshot, onDigitalInput, onAnalogInput, layout = EMPTY_LAYOUT, ledColors = {}, onLedColorChange, lcdVisible = false, onLcdContrast }: Props) {
  const { t } = useTranslation("simulators");
  const ledColorOptions = useLedColorOptions();
  const [boxRef, box] = useElementSize<HTMLDivElement>();
  const [internalLedColors, setInternalLedColors] = useState<Record<number, string>>({});
  const [openPickerPin, setOpenPickerPin] = useState<number | null>(null);

  const activeLedColors = { ...ledColors, ...internalLedColors };

  useEffect(() => {
    if (openPickerPin === null) return;
    const handleClickOutside = () => setOpenPickerPin(null);
    window.addEventListener("click", handleClickOutside);
    return () => window.removeEventListener("click", handleClickOutside);
  }, [openPickerPin]);

  const handleSelectColor = (pin: number, color: string) => {
    setInternalLedColors(prev => ({ ...prev, [pin]: color }));
    onLedColorChange?.(pin, color);
    setOpenPickerPin(null);
  };

  const tx = useFlash(snapshot.txCount);
  const rx = useFlash(snapshot.rxCount);

  // Static scaffolding (from the sketch) united with pins the running program touched.
  // The LCD owns its interface pins: they get jumpers to the module, not an LED/button of their own.
  // While a sketch runs its live constructor arguments win; otherwise the statically analysed ones follow the editor.
  const live = snapshot.status === "running" || snapshot.status === "paused";
  const lcdWiring = (live ? snapshot.lcd.wiring : null) ?? layout.lcd ?? snapshot.lcd.wiring ?? null;
  const lcdMode = lcdWiring?.mode ?? "parallel";
  const lcdPins = lcdWiring?.mode === "i2c" ? [] : lcdWiring?.pins ?? DEFAULT_LCD_PINS;
  const lcdOwned = new Set<number>(lcdVisible ? lcdPins : []);
  const runtimeOutputs = snapshot.pins.map((p, i) => (p.mode === "OUTPUT" && i <= 13 && !lcdOwned.has(i) ? i : -1)).filter(i => i >= 0);
  const allOutputs = uniqSorted([...layout.outputs.filter(p => !lcdOwned.has(p)), ...runtimeOutputs]);
  // Pin 13 is the built-in L LED; it only gets an external circuit when the sketch drives other outputs too.
  const outputs = allOutputs.filter(p => p < 13 || allOutputs.length > 1);
  const digitalInputs = uniqSorted([...layout.digitalInputs, ...snapshot.digitalInputs]).filter(p => !allOutputs.includes(p) && p !== 13 && !lcdOwned.has(p));
  const analogInputs = uniqSorted([...layout.analogInputs, ...snapshot.analogInputs]).filter(ch => !lcdOwned.has(ch + 14));
  const topModules: TopModule[] = [...digitalInputs.map((pin): TopModule => ({ kind: "in", pin })), ...outputs.map((pin): TopModule => ({ kind: "out", pin }))].sort((a, b) => digitalPinX(a.pin) - digitalPinX(b.pin));

  const s = S_BOARD;
  const boardH = BOARD_H;
  const P = (x: number, y: number): Pt => ({ x: x * s, y: y * s });

  // Vertical layout: the canvas origin is the board's top-left corner offset by `boardY`.
  const lcdHoleY = lcdVisible ? -(topModules.length > 0 ? LCD_HOLE_ABOVE.withModules : LCD_HOLE_ABOVE.bare) : 0;
  const lcdOriginY = lcdHoleY - LCD_HOLE_Y;
  const boardY = lcdVisible ? LCD_TOP_MARGIN - lcdOriginY : BOARD_Y;
  const canvasH = lcdVisible ? boardY + BOARD_H + (analogInputs.length > 0 ? GAP_BOTTOM + AN_C.h + 12 : LCD_BOTTOM_ROOM) : CANVAS_H;

  const pin13 = snapshot.pins[13];
  const lBrightness = pin13.mode === "OUTPUT" ? (pin13.pwm !== null ? pin13.pwm / 255 : pin13.level) : 0;
  const ledLevel: Record<string, number> = { L: lBrightness, TX: tx ? 1 : 0, RX: rx ? 1 : 0, ON: 1 };
  
  // 3-State Cable Logic:
  // State 1 (Stopped/Idle): USB connected (1.0), DC unplugged (0.35)
  // State 2 (Running): USB unplugged (0.35), DC connected (1.0)
  // State 3 (Paused): USB connected (1.0), DC connected (1.0)
  const isRunning = snapshot.status === "running";
  const isPaused = snapshot.status === "paused";
  const usbPlugged = !isRunning || isPaused;
  const dcPlugged = isRunning || isPaused;

  // Peripheral rows are bounded within the canvas (with 12px margin from canvas edges)
  const minX = -(BOARD_X - 12);
  const maxX = CANVAS_W - BOARD_X - 12;
  const maxRowWidth = maxX - minX;
  const fitScale = (total: number): number => (total > maxRowWidth ? maxRowWidth / total : 1);
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

  // Cables: each plug sits flush on its jack face, then runs horizontally to (and past) the canvas left edge.
  const cableEnd = -BOARD_X - CABLE_EXTENT;
  const usb = P(USB_JACK.left, USB_JACK.cy);
  const usbPlugH = USB_JACK.h * s * 0.5;
  const dc = P(DC_JACK.left, DC_JACK.cy);
  const dcPlugH = DC_JACK.h * s * 0.46;
  const bootLen = 16;

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
      const currentColor = activeLedColors[m.pin] ?? "#EF4444";
      signal.push(<Wire key={`o${m.pin}s`} label={`D${m.pin}-signal`} from={pinPt} to={anode} color={WIRE.signalOut} />);
      mid.push(<Wire key={`o${m.pin}m`} label={`D${m.pin}-series`} from={cathode} to={resL} color={WIRE.series} />);
      gnd.push(<Wire key={`o${m.pin}g`} label={`D${m.pin}-gnd`} from={resR} to={gndPt} ground />);
      art.push(
        <g key={`oa${m.pin}`} data-module={`O${m.pin}`} data-lit={lit ? "1" : "0"} transform={xf} className="cursor-pointer">
          <VectorLed x={OUT_C.ledX} y={OUT_C.ledY} width={LED_W} height={LED_H} state={brightness} color={currentColor} />
          <VectorResistor x={OUT_C.resX} y={OUT_C.resY} width={RES_W * OUT_C.resS} height={RES_H * OUT_C.resS} value={220} />
          <text x={OUT_C.resX + (RES_W * OUT_C.resS) / 2} y={OUT_C.resY - 3} textAnchor="middle" fontSize={8} fontFamily="ui-monospace, monospace" className="fill-slate-500 dark:fill-slate-400">220Ω</text>
          <text x={62} y={16} fontSize={9} fontWeight={700} className="fill-slate-700 dark:fill-slate-200">{t("arduino.digitalOutputLabel", "Digital Output")}</text>
          <text x={62} y={28} fontSize={8.5} fontFamily="ui-monospace, monospace" className="fill-slate-500 dark:fill-slate-400">{pinName(m.pin)}{lit ? " · HIGH" : " · LOW"}</text>
        </g>,
      );
      overlays.push(
        <div key={`led-overlay-${m.pin}`}>
          {/* Interactive Trigger Button overlay over the LED */}
          <button
            type="button"
            data-testid={`led-trigger-${m.pin}`}
            aria-label={t("arduino.customizeLedColorAria", "Customize LED color for {{pin}}", { pin: pinName(m.pin) })}
            title={t("arduino.ledColorTitle", "{{pin}} LED — click to select color", { pin: pinName(m.pin) })}
            onClick={(e) => {
              e.stopPropagation();
              setOpenPickerPin(prev => prev === m.pin ? null : m.pin);
            }}
            className="absolute cursor-pointer rounded-full group focus:outline-none"
            style={{
              left: at(OUT_C.ledX + 2, 0).x,
              top: at(0, OUT_C.ledY + 2).y,
              width: 32 * m.k,
              height: 32 * m.k,
            }}
          >
            <span className="absolute inset-0 rounded-full border-2 border-transparent group-hover:border-violet-400/80 group-hover:shadow-[0_0_8px_rgba(167,139,250,0.6)] group-focus:border-violet-500 transition-all pointer-events-none" />
          </button>

          {/* Floating Color Palette Popover */}
          {openPickerPin === m.pin && (
            <div
              data-testid={`led-color-picker-${m.pin}`}
              role="dialog"
              aria-label={t("arduino.colorPaletteAria", "Color palette for {{pin}} LED", { pin: pinName(m.pin) })}
              className="absolute z-50 flex items-center gap-1.5 rounded-xl border border-slate-700/80 bg-slate-900/95 p-1.5 shadow-xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-100"
              style={{
                left: at(OUT_C.ledX + 18, 0).x,
                top: at(0, OUT_C.ledY).y - 38 * m.k,
                transform: "translateX(-50%)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {ledColorOptions.map((opt) => {
                const isActive = currentColor.toLowerCase() === opt.color.toLowerCase();
                return (
                  <button
                    key={opt.color}
                    type="button"
                    title={`${opt.label} (${opt.color})`}
                    aria-label={t("arduino.selectColorAria", "Select {{color}} color", { color: opt.label })}
                    data-color={opt.color}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSelectColor(m.pin, opt.color);
                    }}
                    className={`h-5 w-5 rounded-full border border-white/20 cursor-pointer transition-all hover:scale-125 active:scale-95 focus:outline-none ${
                      isActive
                        ? "ring-2 ring-white scale-110 shadow-md"
                        : "opacity-80 hover:opacity-100 hover:ring-1 hover:ring-white/60"
                    }`}
                    style={{ backgroundColor: opt.color }}
                  />
                );
              })}
            </div>
          )}
        </div>,
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
          <text x={64} y={26} fontSize={9} fontWeight={700} className="fill-slate-700 dark:fill-slate-200">{t("arduino.digitalInputLabel", "Digital Input")}</text>
          <text x={64} y={39} fontSize={8.5} fontFamily="ui-monospace, monospace" className="fill-slate-500 dark:fill-slate-400">{pinName(m.pin)}{high ? " · HIGH" : " · LOW"}</text>
        </g>,
      );
      overlays.push(
        <button
          key={`ib${m.pin}`}
          type="button"
          role="switch"
          aria-checked={high}
          aria-label={t("arduino.digitalInputAria", "Digital input {{pin}} {{state}}", { pin: pinName(m.pin), state: high ? "HIGH" : "LOW" })}
          title={t("arduino.digitalInputToggleTitle", "{{pin}}: {{state}} — click to toggle", { pin: pinName(m.pin), state: high ? "HIGH (1)" : "LOW (0)" })}
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
          {t("arduino.analogInputLabel", "Analog Input")} <span className="ms-1 font-mono font-medium text-slate-500 dark:text-slate-400">A{ch}</span>
        </div>
        <StudioSlider
          min={0}
          max={1023}
          step={1}
          value={value}
          aria-label={t("arduino.analogInputAria", "Analog input {{channel}}", { channel: `A${ch}` })}
          onChange={val => onAnalogInput(ch, val)}
          hideHeader
          className="my-1.5 w-full"
        />
        <div className="flex justify-between font-mono text-[8px] text-slate-400">
          <span>0</span>
          <span>512</span>
          <span>1023</span>
        </div>
        <div className="mt-1 font-mono text-[10px] font-semibold tabular-nums text-slate-600 dark:text-slate-300">
          {t("arduino.analogRawLabel", "raw {{value}} · {{voltage}} V", { value, voltage: ((value * 5) / 1023).toFixed(2) })}
        </div>
      </div>,
    );
  });

  let lcdLayer: React.ReactNode = null;
  if (lcdVisible) {
    const padOf = (id: string): Pt => {
      const hp = HEADER_PINS.find(h => h.id === id);
      return P(hp?.x ?? 0, hp?.y ?? 0);
    };
    // Align D4 (header pin 10) with Uno pin 5 so the four data lines drop straight onto their pads (parallel),
    // or park the backpack just right of the top GND pad (I2C).
    const alignX = lcdMode === "parallel" ? P(digitalPinX(lcdPins[2] ?? 5), 0).x - lcdHoleX(10) : P(TOP_GND.x, 0).x + 40 - lcdHoleX(11);
    const origin: Pt = { x: alignX, y: lcdOriginY };
    const wires = buildLcdHarness({
      mode: lcdMode,
      pins: lcdPins,
      origin,
      boardW: BOARD_W,
      boardH,
      pinPoint: pin => (pin >= 14 ? P(analogPinX(pin - 14), ANALOG_HEADER_Y) : P(digitalPinX(pin), DIGITAL_HEADER_Y)),
      gndTop: P(TOP_GND.x, TOP_GND.y),
      gndBottom: P(BOTTOM_GND.x, BOTTOM_GND.y),
      v5: P(V5.x, V5.y),
      sda: padOf("SDA"),
      scl: padOf("SCL"),
    });
    const powered = snapshot.status !== "idle";
    lcdLayer = (
      <>
        <LcdDisplay lcd={snapshot.lcd} powered={powered} mode={lcdMode} x={origin.x} y={origin.y} />
        <LcdWires wires={wires} />
      </>
    );
    overlays.push(
      <LcdContrastKnob
        key="lcd-contrast"
        value={snapshot.lcd.contrast}
        onChange={v => onLcdContrast?.(v)}
        label={t("arduino.lcdContrastAria", "LCD contrast (V0 trimmer)")}
        style={{ left: origin.x + TRIMMER.x, top: origin.y + TRIMMER.y, width: TRIMMER.w, height: TRIMMER.h }}
      />,
    );
  }

  const scale = box.w > 0 && box.h > 0
    ? Math.min(box.w / CANVAS_W, box.h / canvasH) * 0.95
    : 1;

  return (
    <div
      ref={boxRef}
      className="relative flex h-full w-full items-center justify-center overflow-hidden select-none"
    >
      <div
        className="relative shrink-0"
        style={{
          width: CANVAS_W,
          height: canvasH,
          transform: `scale(${scale})`,
          transformOrigin: "center center",
        }}
      >
        <div
          className="absolute"
          style={{
            left: BOARD_X,
            top: boardY,
            width: BOARD_W,
            height: BOARD_H,
          }}
        >
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
                  <title>
                    {led.id === "L"
                      ? t("arduino.ledBuiltinTitle", "L — pin 13 built-in LED")
                      : led.id === "ON"
                        ? t("arduino.ledPowerTitle", "ON — power")
                        : t("arduino.ledSerialActivityTitle", "{{id}} — serial activity", { id: led.id })}
                  </title>
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
          <svg className="pointer-events-none absolute left-0 top-0 overflow-visible" width={BOARD_W} height={BOARD_H} viewBox={`0 0 ${BOARD_W} ${BOARD_H}`} aria-hidden data-layer="wiring">
            <defs>
              {/* Anything right of a jack's outer face is hidden, so inserted metal tips vanish inside the housing. */}
              <clipPath id="arduino-usb-clip">
                <rect x={cableEnd - 20} y={usb.y - 200} width={usb.x - cableEnd + 20} height={400} />
              </clipPath>
              <clipPath id="arduino-dc-clip">
                <rect x={cableEnd - 20} y={dc.y - 200} width={dc.x - cableEnd + 20} height={400} />
              </clipPath>
            </defs>

            {/* USB-B serial cable: plugged while stopped/paused (tip inside the jack, boot flush), pulled back and dimmed while running. */}
            <g clipPath="url(#arduino-usb-clip)">
              <g
                data-usb={usbPlugged ? "plugged" : "retracted"}
                style={{ transform: `translateX(${usbPlugged ? USB_INSERT : -USB_RETRACT}px)`, opacity: usbPlugged ? 1.0 : 0.35, transition: CABLE_TRANSITION }}
              >
                <line x1={cableEnd - USB_INSERT} y1={usb.y} x2={usb.x - 42} y2={usb.y} stroke={USB_COLOR} strokeWidth={CABLE_W} strokeLinecap="round" strokeLinejoin="round" />
                <rect data-usb-boot x={usb.x - 44} y={usb.y - usbPlugH / 2 - 4} width={30} height={usbPlugH + 8} rx={5} fill="#263238" stroke="#0F172A" strokeWidth={1} strokeLinejoin="round" />
                <rect x={usb.x - 40} y={usb.y - usbPlugH / 2 - 1} width={22} height={3} rx={1.5} fill="#455A64" />
                <rect data-usb-plug x={usb.x - 14} y={usb.y - usbPlugH * 0.4} width={14} height={usbPlugH * 0.8} rx={1.5} fill="#CBD5E1" stroke="#94A3B8" strokeWidth={1} strokeLinejoin="round" />
                <rect x={usb.x - 10} y={usb.y - usbPlugH * 0.22} width={3} height={usbPlugH * 0.44} rx={1} fill="#64748B" />
              </g>
            </g>

            {/* DC barrel-jack power cable: withdrawn and faint while stopped, sleeve flush against the jack with ring and tip inside when running/paused. */}
            <g clipPath="url(#arduino-dc-clip)">
              <g
                data-dc={dcPlugged ? "plugged" : "unplugged"}
                style={{ transform: `translateX(${dcPlugged ? DC_INSERT : -DC_RETRACT}px)`, opacity: dcPlugged ? 1.0 : 0.35, transition: CABLE_TRANSITION }}
              >
                <line x1={cableEnd - DC_INSERT} y1={dc.y} x2={dc.x - 54} y2={dc.y} stroke="#1E293B" strokeWidth={CABLE_W} strokeLinecap="round" strokeLinejoin="round" />
                <rect x={dc.x - 58} y={dc.y - CABLE_W / 2 - 3} width={16} height={CABLE_W + 6} rx={4} fill="#0F172A" />
                <rect data-dc-plug x={dc.x - 44} y={dc.y - dcPlugH / 2} width={32} height={dcPlugH} rx={dcPlugH * 0.3} fill="#0B1220" />
                <rect x={dc.x - 40} y={dc.y - dcPlugH / 2 + 2} width={24} height={3} rx={1.5} fill="#334155" />
                <rect x={dc.x - 12} y={dc.y - dcPlugH / 2 - 1.5} width={4} height={dcPlugH + 3} rx={1.5} fill="#CBD5E1" />
                <rect data-dc-tip x={dc.x - 8} y={dc.y - dcPlugH * 0.2} width={8} height={dcPlugH * 0.4} rx={1} fill="#94A3B8" />
              </g>
            </g>
            {gnd}
            {mid}
            {lcdLayer}
            {art}
            {signal}
          </svg>
          {overlays}
        </div>
      </div>
    </div>
  );
}
