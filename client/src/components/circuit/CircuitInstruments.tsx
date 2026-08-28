import { useEffect, useMemo, useRef, useState } from "react";
import { Gauge, Radio, RotateCw, SlidersHorizontal } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { SignalProcessor, type TimeVoltageSample } from "@/lib/signalProcessor";

export type DmmMode = "DCV" | "ACV" | "DCA" | "ACA" | "OHM" | "CONT";

const formatEngineering = (value: number, unit: string) => {
  const magnitude = Math.abs(value);
  if (magnitude >= 1000) return `${(value / 1000).toFixed(3)} k${unit}`;
  if (magnitude >= 1) return `${value.toFixed(3)} ${unit}`;
  if (magnitude >= 0.001) return `${(value * 1000).toFixed(3)} m${unit}`;
  return `${(value * 1_000_000).toFixed(2)} µ${unit}`;
};

export function DmmPanel({ samples, currentAmps, resistance, connected }: { samples: TimeVoltageSample[]; currentAmps: number; resistance: number; connected: boolean }) {
  const [mode, setMode] = useState<DmmMode>("DCV");
  const [reading, setReading] = useState("0.000 V");
  const processor = useMemo(() => new SignalProcessor(samples), [samples]);

  useEffect(() => {
    const refresh = () => {
      if (!connected) { setReading("LEADS"); return; }
      if (mode === "DCV") setReading(formatEngineering(processor.dcAverage(), "V"));
      if (mode === "ACV") setReading(formatEngineering(processor.acRms(), "V"));
      if (mode === "DCA") setReading(formatEngineering(currentAmps, "A"));
      if (mode === "ACA") setReading(formatEngineering(0, "A"));
      if (mode === "OHM") setReading(resistance > 0 ? formatEngineering(resistance, "Ω") : "OL");
      if (mode === "CONT") setReading(resistance > 0 && resistance <= 60 ? "BEEP" : "OL");
    };
    refresh();
    const interval = window.setInterval(refresh, 300);
    return () => window.clearInterval(interval);
  }, [connected, currentAmps, mode, processor, resistance]);

  return <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
    <div className="flex items-center justify-between"><div><p className="font-mono text-[10px] font-bold tracking-[.16em] text-violet-500">DMM / RED − BLACK</p><h2 className="mt-1 text-sm font-bold text-slate-900 dark:text-white">Digital Multimeter</h2></div><Gauge className="h-5 w-5 text-emerald-500"/></div>
    <div className="mt-4 rounded-xl border border-emerald-900/60 bg-[#b7c6a1] p-3 shadow-inner"><p className="font-mono text-[9px] font-bold tracking-[.18em] text-slate-700">{mode} · 300 ms SAMPLE</p><p className="mt-1 overflow-hidden text-2xl font-bold tracking-[.08em] text-slate-900">{reading}</p></div>
    <div className="mt-3 grid grid-cols-3 gap-1.5">{(["DCV", "ACV", "DCA", "ACA", "OHM", "CONT"] as DmmMode[]).map((entry) => <button key={entry} type="button" onClick={() => setMode(entry)} className={`rounded-lg border px-1 py-1.5 font-mono text-[10px] font-bold ${mode === entry ? "border-emerald-500 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "border-slate-200 text-slate-500 dark:border-slate-700 dark:text-slate-400"}`}>{entry}</button>)}</div>
    <p className="mt-3 text-[10px] text-slate-500 dark:text-slate-400">{connected ? "Differential model reads the current red-to-black circuit state." : "Connect both red and black probe terminals to enable a live reading."}</p>
  </section>;
}

type ScopeTrace = { samples: TimeVoltageSample[]; color: string; voltsDiv: number; offsetDiv: number };
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const formatSeconds = (value: number) => value < 1 ? `${(value * 1000).toFixed(value < .01 ? 1 : 0)} ms` : `${value.toFixed(2)} s`;

export function OscilloscopePanel({ channel1, channel2 }: { channel1: TimeVoltageSample[]; channel2: TimeVoltageSample[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [timeDiv, setTimeDiv] = useState(.01);
  const [ch1Div, setCh1Div] = useState(5);
  const [ch2Div, setCh2Div] = useState(.01);
  const [triggerLevel, setTriggerLevel] = useState(0);
  const processor1 = useMemo(() => new SignalProcessor(channel1), [channel1]);
  const processor2 = useMemo(() => new SignalProcessor(channel2), [channel2]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let frame = 0;
    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const width = Math.max(1, Math.floor(rect.width));
      const height = Math.max(1, Math.floor(rect.height));
      if (canvas.width !== width * dpr || canvas.height !== height * dpr) { canvas.width = width * dpr; canvas.height = height * dpr; }
      const context = canvas.getContext("2d");
      if (!context) return;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.fillStyle = "#020617";
      context.fillRect(0, 0, width, height);
      context.lineWidth = 1;
      for (let index = 0; index <= 10; index += 1) { context.strokeStyle = index === 5 ? "#475569" : "#1e293b"; context.beginPath(); context.moveTo((index / 10) * width, 0); context.lineTo((index / 10) * width, height); context.stroke(); }
      for (let index = 0; index <= 8; index += 1) { context.strokeStyle = index === 4 ? "#475569" : "#1e293b"; context.beginPath(); context.moveTo(0, (index / 8) * height); context.lineTo(width, (index / 8) * height); context.stroke(); }
      const drawTrace = (trace: ScopeTrace) => {
        if (!trace.samples.length) return;
        const triggerIndex = new SignalProcessor(trace.samples).risingEdgeIndex(triggerLevel);
        const triggerTime = trace.samples[triggerIndex]?.t ?? trace.samples[0].t;
        const pixelsPerDiv = height / 8;
        context.save();
        context.strokeStyle = trace.color;
        context.shadowColor = trace.color;
        context.shadowBlur = 7;
        context.lineWidth = 1.8;
        context.beginPath();
        let started = false;
        trace.samples.slice(triggerIndex).forEach((sample) => {
          const x = (sample.t - triggerTime) * (width / (timeDiv * 10));
          if (x < 0 || x > width) return;
          const y = height / 2 - sample.v * (pixelsPerDiv / Math.max(.00001, trace.voltsDiv)) + trace.offsetDiv * pixelsPerDiv;
          if (!started) { context.moveTo(x, y); started = true; } else context.lineTo(x, y);
        });
        context.stroke();
        context.restore();
      };
      drawTrace({ samples: channel1, color: "#ffff00", voltsDiv: ch1Div, offsetDiv: 0 });
      drawTrace({ samples: channel2, color: "#00ffff", voltsDiv: ch2Div, offsetDiv: 1.2 });
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [ch1Div, ch2Div, channel1, channel2, timeDiv, triggerLevel]);

  const autoScale = () => {
    const duration = Math.max(channel1.at(-1)?.t ?? 0, channel2.at(-1)?.t ?? 0);
    setTimeDiv(clamp(duration / 10, .001, 1));
    setCh1Div(clamp(Math.max(processor1.peakToPeak(), Math.abs(processor1.dcAverage()) * 2) / 6, .01, 10));
    setCh2Div(clamp(Math.max(processor2.peakToPeak(), Math.abs(processor2.dcAverage()) * 2) / 6, .001, 10));
  };

  return <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
    <div className="flex items-center justify-between"><div><p className="font-mono text-[10px] font-bold tracking-[.16em] text-violet-500">OSC / DIGITAL STORAGE</p><h2 className="mt-1 text-sm font-bold text-slate-900 dark:text-white">Triggered Oscilloscope</h2></div><Radio className="h-5 w-5 text-cyan-500"/></div>
    <canvas ref={canvasRef} className="mt-3 h-48 w-full rounded-lg border border-slate-700 bg-black" aria-label="10 by 8 oscilloscope graticule"/>
    <div className="mt-3 grid gap-3"><label className="text-[10px] font-bold text-slate-500 dark:text-slate-400">TIME/DIV · {formatSeconds(timeDiv)}<Slider value={[timeDiv]} min={.001} max={.1} step={.001} onValueChange={([value]) => setTimeDiv(value)}/></label><label className="text-[10px] font-bold text-yellow-600 dark:text-yellow-300">CH1 VOLTS/DIV · {ch1Div.toFixed(2)} V<Slider value={[ch1Div]} min={.01} max={10} step={.01} onValueChange={([value]) => setCh1Div(value)}/></label><label className="text-[10px] font-bold text-cyan-600 dark:text-cyan-300">CH2 VOLTS/DIV · {ch2Div.toFixed(3)} A<Slider value={[ch2Div]} min={.001} max={1} step={.001} onValueChange={([value]) => setCh2Div(value)}/></label></div>
    <div className="mt-3 flex items-center gap-2"><label className="min-w-0 flex-1 text-[10px] font-bold text-slate-500 dark:text-slate-400">RISING TRIGGER · {triggerLevel.toFixed(2)} V<input type="range" min="-10" max="10" step=".1" value={triggerLevel} onChange={(event) => setTriggerLevel(Number(event.target.value))} className="mt-1 w-full"/></label><button type="button" onClick={autoScale} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-2 text-[10px] font-bold text-slate-600 dark:border-slate-700 dark:text-slate-200"><RotateCw className="h-3.5 w-3.5"/>Auto</button></div>
    <p className="mt-3 flex items-center gap-1 text-[10px] text-slate-500 dark:text-slate-400"><SlidersHorizontal className="h-3.5 w-3.5"/>Rising-edge trigger locks CH1 (yellow); CH2 current sense is cyan.</p>
  </section>;
}
