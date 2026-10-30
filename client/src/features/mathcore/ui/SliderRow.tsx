/**
 * A parameter slider (STEPS.md §4 Sliders): min, max, step, keyboard control (native range input) and animation
 * over `animate.from…to` with `period_s`. While the value moves the engine samples at quarter resolution.
 */
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Param } from "@shared/mathcore/ir/types";
import { NS } from "../i18n/register";
import { formatValue } from "./ExpressionRow";

export interface SliderRowProps {
  name: string;
  param: Param;
  onValue: (value: number, quality: "drag" | "full") => void;
  onRange: (patch: Partial<Pick<Param, "min" | "max" | "step">>) => void;
}

/** Default animation period when a parameter has none (seconds, within §5.2's 0.5–60). */
const DEFAULT_PERIOD_S = 6;

export function SliderRow({ name, param, onValue, onRange }: SliderRowProps) {
  const { t } = useTranslation(NS);
  const [playing, setPlaying] = useState(false);
  const raf = useRef(0);
  const onValueRef = useRef(onValue);
  useEffect(() => {
    onValueRef.current = onValue;
  });

  useEffect(() => {
    if (!playing) return;
    const from = param.animate?.from ?? param.min;
    const to = param.animate?.to ?? param.max;
    const period = (param.animate?.period_s ?? DEFAULT_PERIOD_S) * 1000;
    const loop = param.animate?.loop ?? true;
    const start = performance.now();
    const tick = (now: number) => {
      const phase = (now - start) / period;
      if (!loop && phase >= 1) {
        onValueRef.current(to, "full");
        setPlaying(false);
        return;
      }
      // Triangle wave from → to → from, so a looping animation has no jump.
      const u = phase % 1;
      const s = u < 0.5 ? u * 2 : 2 - u * 2;
      onValueRef.current(from + (to - from) * s, "drag");
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [playing, param.animate, param.min, param.max]);

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  const num = (v: string, fallback: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };

  return (
    <li className="mc-slider">
      <div className="mc-slider-head" dir="ltr">
        <span className="mc-slider-name">{name}</span>
        <span className="mc-slider-value">= {formatValue(param.value)}</span>
        <button
          type="button"
          className="mc-icon-button"
          aria-pressed={playing}
          aria-label={playing ? t("pause", { name }) : t("play", { name })}
          onClick={() => {
            if (playing) onValue(param.value, "full");
            setPlaying((p) => !p);
          }}
        >
          {playing ? "❚❚" : "▶"}
        </button>
      </div>
      <input
        type="range"
        dir="ltr"
        className="mc-range"
        min={param.min}
        max={param.max}
        step={param.step}
        value={param.value}
        aria-label={t("value", { name })}
        onChange={(e) => onValue(Number(e.target.value), "drag")}
        onPointerUp={(e) => onValue(Number((e.target as HTMLInputElement).value), "full")}
        onKeyUp={(e) => onValue(Number((e.target as HTMLInputElement).value), "full")}
      />
      <div className="mc-slider-range" dir="ltr">
        <label>
          <span className="mc-sr">{t("min")}</span>
          <input
            type="number"
            value={param.min}
            onChange={(e) => {
              const v = num(e.target.value, param.min);
              if (v < param.max) onRange({ min: v });
            }}
          />
        </label>
        <label>
          <span className="mc-sr">{t("step")}</span>
          <input
            type="number"
            value={param.step}
            min={0}
            onChange={(e) => {
              const v = num(e.target.value, param.step);
              if (v > 0) onRange({ step: v });
            }}
          />
        </label>
        <label>
          <span className="mc-sr">{t("max")}</span>
          <input
            type="number"
            value={param.max}
            onChange={(e) => {
              const v = num(e.target.value, param.max);
              if (v > param.min) onRange({ max: v });
            }}
          />
        </label>
      </div>
    </li>
  );
}
