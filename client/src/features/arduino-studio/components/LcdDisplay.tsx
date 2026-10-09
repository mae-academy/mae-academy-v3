import { memo, useId } from "react";
import type { LcdState } from "@shared/code/arduinoTypes";
import { glyphRows } from "../lcdFont";
import {
  BEZEL,
  CHAR_PITCH,
  DOT,
  DOTS_X0,
  DOTS_Y0,
  GLASS,
  I2C_PINS,
  LCD_H,
  LCD_HOLE_Y,
  LCD_PINS,
  LCD_W,
  LINE_PITCH,
  i2cHoleX,
  lcdHoleX,
} from "./circuit/lcdGeometry";

/** Backlit (powered) glass, white pixels: the classic blue 1602. Flat fills only, no gradients. */
export const LCD_BLUE = { fill: "#0f3cb3", ink: "#f4faff", ghost: "#0a2a85" } as const;
/** Backlight off or board unpowered: dim blue-grey glass. */
export const LCD_DIM = { fill: "#4f5d80", ink: "#6c7ca3", ghost: "#425071" } as const;
/** Blue breakout PCB (soldermask) with lighter silkscreen. */
export const PCB_BLUE = { fill: "#1d4ed8", edge: "#1e3a8a", trace: "#60a5fa" } as const;

const smooth = (v: number): number => Math.max(0, Math.min(1, v));
/** V0 contrast model: pixels fade in around 20-45%, are crisp near the middle, and wash out into solid blocks at the top end. */
export function contrastLook(contrast: number): { ink: number; ghost: number } {
  const c = smooth(contrast);
  return { ink: smooth((c - 0.12) / 0.3) * smooth((1 - c) / 0.2), ghost: c < 0.5 ? 0.12 + c * 0.3 : 0.27 + (c - 0.5) * 1.4 };
}

const SOLID = DOT - 0.28;
const dotPath = (x: number, y: number): string => `M${x.toFixed(2)} ${y.toFixed(2)}h${SOLID}v${SOLID}h-${SOLID}z`;

/** Every unlit dot of the 16x2 matrix, built once: it never changes. */
const GHOST_DOTS = (() => {
  let d = "";
  for (let line = 0; line < 2; line++)
    for (let col = 0; col < 16; col++)
      for (let r = 0; r < 8; r++)
        for (let c = 0; c < 5; c++) d += dotPath(DOTS_X0 + col * CHAR_PITCH + c * DOT, DOTS_Y0 + line * LINE_PITCH + r * DOT);
  return d;
})();

function litDots(text: string, line: number, custom: Record<number, number[]>): string {
  let d = "";
  for (let col = 0; col < 16; col++) {
    const code = text.charCodeAt(col);
    if (code === 32 || Number.isNaN(code)) continue;
    const rows = glyphRows(code, custom);
    for (let r = 0; r < 8; r++)
      for (let c = 0; c < 5; c++)
        if ((rows[r] >> (4 - c)) & 1) d += dotPath(DOTS_X0 + col * CHAR_PITCH + c * DOT, DOTS_Y0 + line * LINE_PITCH + r * DOT);
  }
  return d;
}

/** Trimmer footprint in the module's local coordinates; ArduinoBoard overlays the hit target here. */
export const TRIMMER = { x: 124, y: 84, w: 28, h: 19 } as const;

export interface LcdDisplayProps {
  lcd: LcdState;
  /** The board has power (a sketch is loaded); without it the glass is dark and blank. */
  powered: boolean;
  mode?: "parallel" | "i2c";
  x?: number;
  y?: number;
}

/**
 * HD44780 16x2 character LCD on its green breakout PCB: black bezel, blue backlit glass with a 5x8 dot matrix,
 * 16-pin header (or an I2C backpack), contrast trimmer and mounting holes.
 */
export const LcdDisplay = memo(function LcdDisplay({ lcd, powered, mode = "parallel", x = 0, y = 0 }: LcdDisplayProps) {
  const uid = useId().replace(/:/g, "");
  const lit = powered && lcd.backlight;
  const showText = powered && lcd.enabled && lcd.displayOn;
  const theme = lit ? LCD_BLUE : LCD_DIM;
  const look = contrastLook(lcd.contrast);
  const inkOpacity = lit ? look.ink : 1;
  const ghostOpacity = lit ? look.ghost : 0.5;
  const rows = lcd.rows;
  const cursorCol = lcd.cursor.col;
  const cursorX = DOTS_X0 + cursorCol * CHAR_PITCH;
  const cursorY = DOTS_Y0 + lcd.cursor.row * LINE_PITCH;
  const showCursor = showText && cursorCol >= 0;
  const summary = showText ? `${rows[0].trimEnd()} / ${rows[1].trimEnd()}` : lit ? "blank" : "off";

  return (
    <svg
      x={x}
      y={y}
      width={LCD_W}
      height={LCD_H}
      viewBox={`0 0 ${LCD_W} ${LCD_H}`}
      overflow="visible"
      role="img"
      aria-label={`16x2 character LCD: ${summary}`}
      data-component="lcd16x2"
      data-powered={powered ? "1" : "0"}
      data-backlight={lcd.backlight ? "1" : "0"}
      data-contrast={lcd.contrast.toFixed(2)}
      data-mode={mode}
    >
      <defs>
        <clipPath id={`${uid}-clip`}>
          <rect x={GLASS.x} y={GLASS.y} width={GLASS.w} height={GLASS.h} rx={1.5} />
        </clipPath>
        <style>{`.lcd16-blink{animation:lcd16-blink 1s steps(1,end) infinite}@keyframes lcd16-blink{0%{opacity:1}50%{opacity:0}}@media (prefers-reduced-motion:reduce){.lcd16-blink{animation:none;opacity:.6}}`}</style>
      </defs>

      {/* PCB */}
      <rect width={LCD_W} height={LCD_H} rx={4} fill={PCB_BLUE.fill} stroke={PCB_BLUE.edge} strokeWidth={1} />
      <path d={`M10 ${LCD_H - 22} H${LCD_W - 10}`} stroke={PCB_BLUE.trace} strokeWidth={0.8} opacity={0.5} />
      {[
        [7, 7],
        [LCD_W - 7, 7],
        [7, LCD_H - 7],
        [LCD_W - 7, LCD_H - 7],
      ].map(([cx, cy]) => (
        <g key={`${cx}-${cy}`}>
          <circle cx={cx} cy={cy} r={3.6} fill="#d4af37" />
          <circle cx={cx} cy={cy} r={2} fill="#0b1b4d" />
        </g>
      ))}

      {/* Bezel + glass */}
      <rect {...BEZEL} rx={3} fill="#0b0d12" stroke="#2b3140" strokeWidth={1} />
      <rect x={BEZEL.x + 3} y={BEZEL.y + 3} width={BEZEL.w - 6} height={BEZEL.h - 6} rx={2} fill="none" stroke="#1b2029" strokeWidth={1} />
      <rect data-lcd-glass x={GLASS.x} y={GLASS.y} width={GLASS.w} height={GLASS.h} rx={1.5} fill={theme.fill} />
      <g clipPath={`url(#${uid}-clip)`}>
        <path d={GHOST_DOTS} fill={theme.ghost} opacity={ghostOpacity} />
        {showText &&
          rows.map((text, line) => (
            <path key={line} data-lcd-ink={line} d={litDots(text, line, lcd.customChars)} fill={theme.ink} opacity={inkOpacity} />
          ))}
        {showCursor && lcd.cursorVisible && (
          <path d={Array.from({ length: 5 }, (_, c) => dotPath(cursorX + c * DOT, cursorY + 7 * DOT)).join("")} fill={theme.ink} data-lcd-cursor="underline" />
        )}
        {showCursor && lcd.blink && (
          <rect className="lcd16-blink" data-lcd-cursor="blink" x={cursorX - 0.2} y={cursorY - 0.2} width={5 * DOT + 0.4} height={8 * DOT + 0.4} fill={theme.ink} />
        )}
      </g>
      <rect x={GLASS.x} y={GLASS.y} width={GLASS.w} height={GLASS.h} rx={1.5} fill="none" stroke="#000" strokeOpacity={0.55} strokeWidth={1} />

      {/* Text for assistive tech and DOM inspection: the exact 16-character rows currently shown. */}
      {rows.map((text, line) => (
        <text key={line} data-lcd-row={line} data-testid={`lcd-row-${line}`} fontSize={1} opacity={0} aria-hidden>
          {showText ? text : " ".repeat(16)}
        </text>
      ))}

      {/* Silkscreen */}
      <text x={20} y={95} fontSize={5.6} fontFamily="ui-monospace, monospace" fill="#dbeafe" opacity={0.85}>
        LCD1602 · HD44780
      </text>
      <g data-trimmer>
        <rect x={TRIMMER.x} y={TRIMMER.y} width={TRIMMER.w} height={TRIMMER.h} rx={2} fill="#e2e8f0" stroke="#94a3b8" strokeWidth={0.7} />
        <circle cx={TRIMMER.x + TRIMMER.w / 2} cy={TRIMMER.y + TRIMMER.h / 2} r={6.4} fill="#f8fafc" stroke="#64748b" strokeWidth={0.7} />
        <g transform={`rotate(${-135 + 270 * lcd.contrast} ${TRIMMER.x + TRIMMER.w / 2} ${TRIMMER.y + TRIMMER.h / 2})`}>
          <path d={`M${TRIMMER.x + TRIMMER.w / 2} ${TRIMMER.y + TRIMMER.h / 2 - 5.6}V${TRIMMER.y + TRIMMER.h / 2}`} stroke="#1e293b" strokeWidth={1.8} strokeLinecap="round" />
        </g>
        <text x={TRIMMER.x + TRIMMER.w + 4} y={TRIMMER.y + 8} fontSize={5} fontFamily="ui-monospace, monospace" fill="#dbeafe">
          V0 10k
        </text>
        <text x={TRIMMER.x + TRIMMER.w + 4} y={TRIMMER.y + 15} fontSize={5} fontFamily="ui-monospace, monospace" fill="#bfdbfe" data-lcd-contrast-label>
          {Math.round(lcd.contrast * 100)}%
        </text>
      </g>

      {/* 16-pin header: gold pads with silkscreen names. */}
      {LCD_PINS.map((name, k) => (
        <g key={name} data-lcd-pin={name}>
          <text x={lcdHoleX(k)} y={LCD_HOLE_Y - 8.5} textAnchor="middle" fontSize={5.4} fontWeight={600} fontFamily="ui-monospace, monospace" fill="#eff6ff">
            {name}
          </text>
          <circle cx={lcdHoleX(k)} cy={LCD_HOLE_Y} r={4.4} fill="#d4af37" stroke="#8a6d12" strokeWidth={0.5} />
          <circle cx={lcdHoleX(k)} cy={LCD_HOLE_Y} r={1.7} fill="#1b1404" />
        </g>
      ))}

      {mode === "i2c" && (
        <g data-i2c-backpack>
          <rect x={i2cHoleX("GND") - 10} y={88} width={i2cHoleX("SCL") - i2cHoleX("GND") + 20} height={LCD_H - 90} rx={2.5} fill="#0f172a" stroke="#020617" strokeWidth={0.8} />
          <rect x={i2cHoleX("GND") - 5} y={92} width={30} height={9} rx={1} fill="#334155" />
          <text x={i2cHoleX("GND") + 10} y={98.6} textAnchor="middle" fontSize={4.2} fontFamily="ui-monospace, monospace" fill="#9ca3af">
            PCF8574
          </text>
          {I2C_PINS.map(name => (
            <g key={name} data-i2c-pin={name}>
              <text x={i2cHoleX(name)} y={LCD_HOLE_Y - 8.5} textAnchor="middle" fontSize={5.4} fontWeight={700} fontFamily="ui-monospace, monospace" fill="#f8fafc">
                {name}
              </text>
              <circle cx={i2cHoleX(name)} cy={LCD_HOLE_Y} r={4.4} fill="#d4af37" stroke="#8a6d12" strokeWidth={0.5} />
              <circle cx={i2cHoleX(name)} cy={LCD_HOLE_Y} r={1.7} fill="#1b1404" />
            </g>
          ))}
        </g>
      )}
    </svg>
  );
});
