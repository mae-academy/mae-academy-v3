/**
 * MAE Academy hero visualizer: superposed damped traveling waves on Canvas 2D.
 * Client-only, RAF-driven; paused off-viewport or when the tab is hidden. Pointer
 * position perturbs phase/amplitude of the nearer source, easing back to baseline.
 */
import { useEffect, useRef } from "react";

export interface WaveSource {
  id: string;
  amplitude: number; // px
  frequency: number; // rad/s
  phase: number; // rad
  dampingRatio: number; // zeta, 0-1: how fast a perturbation eases back to baseline
  color: string; // CSS color
}

export interface WaveFieldProps {
  className?: string;
  sources?: WaveSource[];
}

const defaultSources: WaveSource[] = [
  { id: "violet", amplitude: 34, frequency: 1.1, phase: 0, dampingRatio: 0.35, color: "#8B5CF6" },
  { id: "cyan", amplitude: 24, frequency: 1.6, phase: Math.PI / 3, dampingRatio: 0.45, color: "#06B6D4" },
];

const SAMPLE_POINTS = 160;
const WAVENUMBER = 0.014;
const MAX_POINTER_DX = 40;

type SourceState = { amplitudeMultiplier: number; targetAmplitude: number; phaseOffset: number; anchorX: number };

export default function WaveField({ className = "", sources = defaultSources }: WaveFieldProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const statesRef = useRef<SourceState[]>(sources.map((_, index) => ({ amplitudeMultiplier: 1, targetAmplitude: 1, phaseOffset: 0, anchorX: (index + 0.5) / sources.length })));

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const size = { width: 0, height: 0 };
    const pointer = { lastX: 0, tracking: false };
    let rafId: number | null = null;
    let isIntersecting = true;
    let lastFrameTime = performance.now();

    const resize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      size.width = rect.width;
      size.height = rect.height;
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      renderFrame(performance.now());
    };

    const renderFrame = (now: number) => {
      const dt = Math.min(0.05, (now - lastFrameTime) / 1000);
      lastFrameTime = now;
      const { width, height } = size;
      if (width <= 0 || height <= 0) return;
      const t = now / 1000;
      const centerY = height / 2;
      const step = width / SAMPLE_POINTS;
      const seriesY: number[][] = [];

      ctx.clearRect(0, 0, width, height);

      sources.forEach((source, index) => {
        const state = statesRef.current[index];
        if (!state) return;
        state.amplitudeMultiplier += (state.targetAmplitude - state.amplitudeMultiplier) * Math.min(1, source.dampingRatio * dt * 6);
        const ys: number[] = [];
        for (let i = 0; i <= SAMPLE_POINTS; i++) {
          const x = i * step;
          const y = centerY + source.amplitude * state.amplitudeMultiplier * Math.sin(source.frequency * x * WAVENUMBER - source.frequency * t + source.phase + state.phaseOffset);
          ys.push(y);
        }
        seriesY.push(ys);

        ctx.beginPath();
        ctx.moveTo(0, ys[0]);
        for (let i = 1; i <= SAMPLE_POINTS; i++) ctx.lineTo(i * step, ys[i]);
        ctx.strokeStyle = source.color;
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.85;
        ctx.stroke();
      });

      if (seriesY.length > 1) {
        ctx.beginPath();
        for (let i = 0; i <= SAMPLE_POINTS; i++) {
          const averageY = seriesY.reduce((sum, ys) => sum + ys[i], 0) / seriesY.length;
          if (i === 0) ctx.moveTo(i * step, averageY); else ctx.lineTo(i * step, averageY);
        }
        ctx.strokeStyle = "#CBD5E1";
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = 0.28;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    };

    let loopRunning = false;
    const loop = (now: number) => {
      renderFrame(now);
      if (isIntersecting && document.visibilityState === "visible" && !prefersReducedMotion) {
        rafId = requestAnimationFrame(loop);
      } else {
        loopRunning = false;
      }
    };
    const startLoop = () => {
      if (loopRunning || prefersReducedMotion) return;
      loopRunning = true;
      lastFrameTime = performance.now();
      rafId = requestAnimationFrame(loop);
    };
    const stopLoop = () => {
      loopRunning = false;
      if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
    };

    resize();
    if (!prefersReducedMotion) startLoop();

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);

    const intersectionObserver = new IntersectionObserver((entries) => {
      isIntersecting = entries[0]?.isIntersecting ?? true;
      if (isIntersecting && document.visibilityState === "visible") startLoop(); else stopLoop();
    }, { threshold: 0.05 });
    intersectionObserver.observe(container);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && isIntersecting) startLoop(); else stopLoop();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    const handlePointerMove = (event: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      const dx = pointer.tracking ? Math.max(-MAX_POINTER_DX, Math.min(MAX_POINTER_DX, x - pointer.lastX)) : 0;
      pointer.lastX = x;
      pointer.tracking = true;
      if (size.width <= 0) return;

      const relativeX = x / size.width;
      const relativeY = (y - size.height / 2) / (size.height / 2);
      let nearestIndex = 0;
      let nearestDistance = Infinity;
      statesRef.current.forEach((state, index) => {
        const distance = Math.abs(relativeX - state.anchorX);
        if (distance < nearestDistance) { nearestDistance = distance; nearestIndex = index; }
      });
      const nearest = statesRef.current[nearestIndex];
      if (nearest) {
        nearest.phaseOffset += (dx / size.width) * 0.02;
        nearest.targetAmplitude = Math.max(0.6, Math.min(1.4, 1 - relativeY * 0.4));
      }
    };
    const handlePointerLeave = () => {
      pointer.tracking = false;
      statesRef.current.forEach((state) => { state.targetAmplitude = 1; });
    };
    container.addEventListener("pointermove", handlePointerMove);
    container.addEventListener("pointerleave", handlePointerLeave);

    return () => {
      stopLoop();
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      container.removeEventListener("pointermove", handlePointerMove);
      container.removeEventListener("pointerleave", handlePointerLeave);
    };
  }, [sources]);

  return <div ref={containerRef} className={`mae-wave-grid relative aspect-[6/5] w-full overflow-hidden rounded-[2rem] border border-slate-200/70 bg-white/40 backdrop-blur-sm dark:border-white/10 dark:bg-slate-950/30 ${className}`}>
    <canvas ref={canvasRef} className="relative z-[1] h-full w-full" />
  </div>;
}
