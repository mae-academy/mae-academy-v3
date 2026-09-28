/**
 * MAE Academy Engineering Scope / Wave Monitor
 * Framed, responsive oscilloscope canvas rendering 3 dynamic traveling harmonic waves
 * with KaTeX telemetry notation, stable 60 FPS animation loop, and clean header.
 */
import { useEffect, useRef, useState } from "react";
import { KatexMath } from "@/components/ui/KatexMath";

export interface EngineeringScopeProps {
  className?: string;
}

export default function EngineeringScope({ className = "" }: EngineeringScopeProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Floating KaTeX cursor tooltip state
  const [hoverInfo, setHoverInfo] = useState<{
    x: number;
    y: number;
    time: string;
    vBlue: string;
    vViolet: string;
  } | null>(null);

  const stateRef = useRef({
    cursorX: null as number | null,
    cursorY: null as number | null,
    isHovered: false,
    lastFrameTime: performance.now(),
    timeAcc: 0,
    damping: 0.35,
  });

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let rafId: number | null = null;
    let isIntersecting = true;
    let width = 0;
    let height = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      if (width <= 0 || height <= 0) return;

      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const render = (now: number) => {
      const state = stateRef.current;
      const dt = Math.min(0.033, (now - state.lastFrameTime) / 1000);
      state.lastFrameTime = now;

      // Steady phase accumulator guarantees perfectly smooth 60 FPS animation with zero jitter
      state.timeAcc += dt * 3.2;

      if (width <= 0 || height <= 0) return;

      const t = state.timeAcc;
      const centerY = height / 2;

      ctx.clearRect(0, 0, width, height);

      // --- 1. Reticle Oscilloscope Grid ---
      const numCols = 10;
      const numRows = 8;
      const colStep = width / numCols;
      const rowStep = height / numRows;

      ctx.save();
      ctx.strokeStyle = "rgba(100, 116, 139, 0.12)";
      ctx.lineWidth = 1;

      // Minor grid lines
      for (let i = 1; i < numCols; i++) {
        const x = Math.round(i * colStep) + 0.5;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let j = 1; j < numRows; j++) {
        const y = Math.round(j * rowStep) + 0.5;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // Center crosshairs with division ticks
      ctx.strokeStyle = "rgba(100, 116, 139, 0.25)";
      ctx.lineWidth = 1.2;
      const midX = Math.round(width / 2) + 0.5;
      const midY = Math.round(height / 2) + 0.5;

      ctx.beginPath();
      ctx.moveTo(midX, 0);
      ctx.lineTo(midX, height);
      ctx.moveTo(0, midY);
      ctx.lineTo(width, midY);
      ctx.stroke();

      // Tick marks on center axes
      const tickSize = 3;
      ctx.beginPath();
      for (let x = 0; x <= width; x += colStep / 5) {
        ctx.moveTo(x, midY - tickSize);
        ctx.lineTo(x, midY + tickSize);
      }
      for (let y = 0; y <= height; y += rowStep / 5) {
        ctx.moveTo(midX - tickSize, y);
        ctx.lineTo(midX + tickSize, y);
      }
      ctx.stroke();
      ctx.restore();

      // --- 2. Mathematical Traveling Waves ---
      const samplePoints = 220;
      const dx = width / samplePoints;
      const baseWavenumber = 0.018;

      // Wave 3: Modulated Envelope (Dashed Warm Rose / Magenta #E11D48)
      ctx.save();
      ctx.strokeStyle = "rgba(225, 29, 72, 0.5)";
      ctx.lineWidth = 1.3;
      ctx.setLineDash([4, 4]);
      const envAmp = height * 0.36;

      ctx.beginPath();
      for (let i = 0; i <= samplePoints; i++) {
        const x = i * dx;
        const normX = x / width;
        const decay = Math.exp(-state.damping * 2.2 * normX);
        const y = centerY - envAmp * decay * (0.8 + 0.2 * Math.cos(baseWavenumber * 0.5 * x - t * 0.8));
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();

      ctx.beginPath();
      for (let i = 0; i <= samplePoints; i++) {
        const x = i * dx;
        const normX = x / width;
        const decay = Math.exp(-state.damping * 2.2 * normX);
        const y = centerY + envAmp * decay * (0.8 + 0.2 * Math.cos(baseWavenumber * 0.5 * x - t * 0.8));
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.restore();

      // Wave 1: Input Excitation Carrier Signal (Electric Blue #2563EB)
      ctx.save();
      ctx.strokeStyle = "#2563EB";
      ctx.lineWidth = 2.2;
      ctx.shadowColor = "rgba(37, 99, 235, 0.35)";
      ctx.shadowBlur = 4;
      ctx.beginPath();
      const inAmp = height * 0.22;
      for (let i = 0; i <= samplePoints; i++) {
        const x = i * dx;
        const y = centerY + inAmp * Math.sin(baseWavenumber * x - t);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.restore();

      // Wave 2: Damped Transient Step Response (Signature Violet #7C3AED with glow)
      ctx.save();
      ctx.strokeStyle = "#7C3AED";
      ctx.lineWidth = 2.5;
      ctx.shadowColor = "rgba(124, 58, 237, 0.45)";
      ctx.shadowBlur = 6;
      ctx.beginPath();
      const outAmp = height * 0.32;
      const phaseDiff = 0.72;

      for (let i = 0; i <= samplePoints; i++) {
        const x = i * dx;
        const normX = x / width;
        const envelopeDecay = Math.exp(-state.damping * 2.5 * normX);
        // Subtle, localized perturbation near cursor if hovered
        let nudge = 0;
        if (state.isHovered && state.cursorX !== null) {
          const dist = (x - state.cursorX) / (width * 0.2);
          nudge = Math.exp(-dist * dist) * 4 * Math.sin(t * 2);
        }
        const y = centerY + outAmp * envelopeDecay * Math.sin(baseWavenumber * 1.25 * x - t * 1.15 + phaseDiff) + nudge;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.restore();

      // --- 3. Interactive Cursor Reticle Annotation ---
      if (state.isHovered && state.cursorX !== null) {
        const cx = state.cursorX;
        ctx.save();
        ctx.strokeStyle = "rgba(124, 58, 237, 0.45)";
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 2]);

        {/* Standard Reticle Vertical Cursor Line */ }
        ctx.beginPath();
        ctx.moveTo(cx, 0);
        ctx.lineTo(cx, height);
        ctx.stroke();

        // 1. Blue Wave Point (Channel 1 Input)
        const inAmp = height * 0.22;
        const cy1 = centerY + inAmp * Math.sin(baseWavenumber * cx - t);

        // Blue marker outer glow & dot
        ctx.fillStyle = "rgba(37, 99, 235, 0.25)";
        ctx.beginPath();
        ctx.arc(cx, cy1, 7, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#2563EB";
        ctx.beginPath();
        ctx.arc(cx, cy1, 3.5, 0, Math.PI * 2);
        ctx.fill();

        // 2. Violet Wave Point (Channel 2 Transient Response)
        const normX = cx / width;
        const decay = Math.exp(-state.damping * 2.5 * normX);
        const cy2 = centerY + outAmp * decay * Math.sin(baseWavenumber * 1.25 * cx - t * 1.15 + phaseDiff);

        // Violet marker outer glow & dot
        ctx.fillStyle = "rgba(124, 58, 237, 0.25)";
        ctx.beginPath();
        ctx.arc(cx, cy2, 7, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = "#7C3AED";
        ctx.beginPath();
        ctx.arc(cx, cy2, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    };

    let loopRunning = false;
    const loop = (now: number) => {
      render(now);
      if (isIntersecting && document.visibilityState === "visible" && !prefersReducedMotion) {
        rafId = requestAnimationFrame(loop);
      } else {
        loopRunning = false;
      }
    };

    const startLoop = () => {
      if (loopRunning || prefersReducedMotion) return;
      loopRunning = true;
      stateRef.current.lastFrameTime = performance.now();
      rafId = requestAnimationFrame(loop);
    };

    const stopLoop = () => {
      loopRunning = false;
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    };

    resize();
    if (!prefersReducedMotion) startLoop();

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);

    const intersectionObserver = new IntersectionObserver(
      (entries) => {
        isIntersecting = entries[0]?.isIntersecting ?? true;
        if (isIntersecting && document.visibilityState === "visible") startLoop();
        else stopLoop();
      },
      { threshold: 0.05 }
    );
    intersectionObserver.observe(container);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && isIntersecting) startLoop();
      else stopLoop();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      stopLoop();
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    const y = Math.max(0, Math.min(rect.height, e.clientY - rect.top));

    stateRef.current.cursorX = x;
    stateRef.current.cursorY = y;
    stateRef.current.isHovered = true;

    // Real-time instantaneous sampling of the mathematical waveforms at slice t
    const t = stateRef.current.timeAcc;
    const baseWavenumber = 0.018;
    const phaseDiff = 0.72;
    const normX = x / rect.width;
    const decay = Math.exp(-stateRef.current.damping * 2.5 * normX);

    // V1(t) = A1 * sin(ω1*x - t) normalized to ±3.3V full scale
    const sin1 = Math.sin(baseWavenumber * x - t);
    const v1 = (sin1 * 1.65).toFixed(2);
    const v1Str = Number(v1) >= 0 ? `+${v1}` : v1;

    // V2(t) = A2 * decay * sin(ω2*x - t*1.15 + phi) normalized to ±3.3V
    const sin2 = decay * Math.sin(baseWavenumber * 1.25 * x - t * 1.15 + phaseDiff);
    const v2 = (sin2 * 2.4).toFixed(2);
    const v2Str = Number(v2) >= 0 ? `+${v2}` : v2;

    const timeMs = (normX * 80).toFixed(1);

    setHoverInfo({
      x,
      y,
      time: timeMs,
      vBlue: v1Str,
      vViolet: v2Str,
    });
  };

  const handlePointerLeave = () => {
    stateRef.current.isHovered = false;
    stateRef.current.cursorX = null;
    stateRef.current.cursorY = null;
    setHoverInfo(null);
  };

  return (
    <div
      ref={containerRef}
      className={`flex flex-col bg-white border border-slate-200/80 rounded-2xl shadow-sm p-3.5 sm:p-4 w-full max-w-sm sm:max-w-md mx-auto h-fit self-center relative overflow-hidden backdrop-blur-sm dark:border-white/[0.08] dark:bg-[#08080A] ${className}`}
    >
      {/* Top Tri-Color Signature Accent Line */}
      <div className="absolute top-0 left-0 right-0 h-[2.5px] bg-gradient-to-br from-[#2563eb] via-[#9333ea] to-[#e11d48]" />

      {/* Scope Header Bar: Channel indicators & Timebase */}
      <div className="flex items-center justify-between gap-2 sm:gap-3 mb-2.5 sm:mb-3 pb-2 border-b border-slate-200/70 dark:border-white/[0.08]">
        <div className="flex items-center gap-2 sm:gap-3 text-[11px] sm:text-xs font-medium text-slate-600 dark:text-zinc-400">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-blue-600" />
            CH1
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-purple-600" />
            CH2
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-rose-500" />
            CH3
          </span>
        </div>

        <div className="px-2 py-0.5 sm:py-1 bg-slate-100 rounded-md text-[10px] sm:text-xs font-mono font-medium text-slate-700 dark:bg-white/[0.06] dark:border dark:border-white/[0.08] dark:text-zinc-200 flex items-center">
          <KatexMath math="10\text{ ms/div}" />
        </div>
      </div>

      {/* Grid & Plot Area - Clean aspect ratio hugs canvas perfectly */}
      <div className="w-full aspect-[4/3] rounded-xl border border-slate-200/60 overflow-hidden relative bg-slate-50/30 dark:border-white/[0.08] dark:bg-[#000000]">
        <canvas
          ref={canvasRef}
          onPointerMove={handlePointerMove}
          onPointerLeave={handlePointerLeave}
          className="w-full h-full block cursor-crosshair touch-none relative z-10"
        />

        {/* KaTeX Mathematical Cursor Tooltip Overlay */}
        {hoverInfo && (
          <div
            className="pointer-events-none absolute z-20 -translate-x-1/2 -translate-y-full mb-2 rounded-lg border border-slate-200/90 bg-white/95 px-3 py-1.5 shadow-md backdrop-blur-md dark:border-white/[0.15] dark:bg-[#08080A]/95 text-xs text-slate-800 dark:text-zinc-100 transition-opacity duration-150 whitespace-nowrap"
            style={{
              left: Math.max(110, Math.min(hoverInfo.x, (canvasRef.current?.getBoundingClientRect().width || 360) - 110)),
              top: Math.max(35, hoverInfo.y - 12),
            }}
          >
            <KatexMath
              math={`\\Delta t = ${hoverInfo.time}\\text{ ms}, \\quad \\textcolor{#2563EB}{V_{\\text{1}}(t) = ${hoverInfo.vBlue}\\text{ V}}, \\quad \\textcolor{#7C3AED}{V_{\\text{2}}(t) = ${hoverInfo.vViolet}\\text{ V}}`}
            />
          </div>
        )}
      </div>

      {/* Readout Footer snug directly below grid without gaps */}
      <div className="flex justify-between items-center mt-2.5 sm:mt-3 pt-1 text-[10px] sm:text-xs text-slate-600 dark:text-zinc-300 font-mono whitespace-nowrap gap-1 overflow-x-auto no-scrollbar">
        <KatexMath math="f = 120\text{ Hz}" />
        <KatexMath math="\zeta = 0.35" />
        <KatexMath math="V_{\text{p-p}} = 3.3\text{ V}" />
        <KatexMath math="\phi = 42.0^\circ" />
      </div>
    </div>
  );
}
