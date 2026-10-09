import { useRef, type CSSProperties, type KeyboardEvent, type PointerEvent, type WheelEvent } from "react";

const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));
const DRAG_RANGE_PX = 120;

interface Props {
  /** Contrast 0..1. */
  value: number;
  onChange: (value: number) => void;
  style: CSSProperties;
  label: string;
}

/** Invisible hit target laid over the LCD's V0 trimmer: drag, scroll or use arrow keys to turn it. */
export function LcdContrastKnob({ value, onChange, style, label }: Props) {
  const drag = useRef<{ x: number; y: number; v: number } | null>(null);
  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, v: value };
  };
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (d) onChange(clamp01(d.v + (e.clientX - d.x - (e.clientY - d.y)) / DRAG_RANGE_PX));
  };
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 0.1 : 0.02;
    const next = e.key === "ArrowRight" || e.key === "ArrowUp" ? value + step : e.key === "ArrowLeft" || e.key === "ArrowDown" ? value - step : e.key === "Home" ? 0 : e.key === "End" ? 1 : null;
    if (next === null) return;
    e.preventDefault();
    onChange(clamp01(next));
  };
  const onWheel = (e: WheelEvent<HTMLDivElement>) => onChange(clamp01(value - Math.sign(e.deltaY) * 0.03));
  return (
    <div
      role="slider"
      tabIndex={0}
      data-testid="lcd-contrast"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value * 100)}
      aria-valuetext={`${Math.round(value * 100)}%`}
      title={`${label}: ${Math.round(value * 100)}%`}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={() => (drag.current = null)}
      onPointerCancel={() => (drag.current = null)}
      onKeyDown={onKey}
      onWheel={onWheel}
      className="absolute cursor-grab touch-none rounded-md outline-none ring-sky-400 hover:ring-2 focus-visible:ring-2 active:cursor-grabbing"
      style={style}
    />
  );
}
