import { useEffect, useRef } from "react";
import { useReducedMotion } from "framer-motion";
import { barLevels, meanLevel } from "./voiceInput";

const BARS = 44;
const BLUE = "#2563eb";
const VIOLET = "#7c3aed";

export interface VoiceWaveformProps {
  analyser: AnalyserNode | null;
  className?: string;
}

const isDark = () => typeof document !== "undefined" && document.documentElement.classList.contains("dark");

/**
 * Live microphone level on a canvas: rounded bars in the brand gradient (60fps via rAF, DPR aware, paused while the tab is
 * hidden). With `prefers-reduced-motion` it draws a plain level meter, refreshed a few times a second instead.
 */
export function VoiceWaveform({ analyser, className }: VoiceWaveformProps) {
  const reduceMotion = useReducedMotion();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const data = new Uint8Array(analyser ? analyser.frequencyBinCount : 0);
    let levels: number[] = new Array(BARS).fill(0);
    let meter = 0;
    let width = 0;
    let height = 0;
    let raf = 0;
    let timer: ReturnType<typeof setInterval> | null = null;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const fill = () => {
      const gradient = ctx.createLinearGradient(0, 0, width, 0);
      gradient.addColorStop(0, BLUE);
      gradient.addColorStop(1, VIOLET);
      return gradient;
    };

    const roundedRect = (x: number, y: number, w: number, h: number) => {
      const r = Math.min(w, h) / 2;
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
      ctx.fill();
    };

    const track = () => (isDark() ? "rgba(255,255,255,0.12)" : "rgba(15,23,42,0.1)");

    const drawBars = () => {
      if (analyser) analyser.getByteFrequencyData(data);
      levels = barLevels(data, BARS, levels);
      ctx.clearRect(0, 0, width, height);
      const slot = width / BARS;
      const barWidth = Math.max(2, slot * 0.55);
      const gradient = fill();
      for (let i = 0; i < BARS; i++) {
        // A gentle bell so the edges stay small even when the spectrum is flat.
        const envelope = 0.45 + 0.55 * Math.sin((Math.PI * (i + 0.5)) / BARS);
        const barHeight = Math.max(barWidth, Math.min(height, (levels[i] * 1.6 * envelope) * height));
        const x = i * slot + (slot - barWidth) / 2;
        ctx.fillStyle = levels[i] < 0.02 ? track() : gradient;
        roundedRect(x, (height - barHeight) / 2, barWidth, barHeight);
      }
    };

    const drawMeter = () => {
      if (analyser) analyser.getByteFrequencyData(data);
      meter = meanLevel(data);
      ctx.clearRect(0, 0, width, height);
      const barHeight = Math.min(10, height);
      const y = (height - barHeight) / 2;
      ctx.fillStyle = track();
      roundedRect(0, y, width, barHeight);
      const filled = Math.max(barHeight, Math.min(1, meter * 3) * width);
      ctx.fillStyle = fill();
      roundedRect(0, y, filled, barHeight);
    };

    const loop = () => {
      drawBars();
      raf = requestAnimationFrame(loop);
    };

    const run = () => {
      stop();
      if (document.visibilityState === "hidden") return;
      if (reduceMotion) {
        drawMeter();
        timer = setInterval(drawMeter, 120);
      } else {
        raf = requestAnimationFrame(loop);
      }
    };
    const stop = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      if (timer) clearInterval(timer);
      timer = null;
    };

    resize();
    run();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => { resize(); if (reduceMotion) drawMeter(); });
    observer?.observe(canvas);
    document.addEventListener("visibilitychange", run);
    return () => {
      stop();
      observer?.disconnect();
      document.removeEventListener("visibilitychange", run);
    };
  }, [analyser, reduceMotion]);

  return <canvas ref={canvasRef} aria-hidden="true" data-voice-waveform className={className} />;
}

export default VoiceWaveform;
