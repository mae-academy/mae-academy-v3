/**
 * MAE Academy / Signals & Systems — Tab E S/Z-plane laboratory.
 * Bidirectional in continuous mode: enter H(s) (inverse transform card) or h(t) (forward transform card);
 * either way the resulting rational H(s) drives the plane, ROC, and landscape. During a root drag the
 * plane, terminal, and transform card update imperatively; React commits once on pointer release.
 */
import { useMemo, useRef, useState } from "react";
import { KatexMath } from "@/components/ui/KatexMath";
import { SegmentedControl, StatusBadge, StudioCard, InnerBox } from "@/components/common/templates";
import { UnifiedSignalEngineTerminal, type UnifiedSignalEngineTerminalHandle } from "@/components/signals/common/UnifiedSignalEngineTerminal";
import SZPlaneCanvas from "@/components/signals/SZPlaneCanvas";
import { FrequencyResponseCanvases, ImpulseResponseCanvas, type ImpulseResponseCanvasHandle } from "@/components/signals/LaplaceCanvases";
import { ComplexSurface3D } from "@/components/signals/ComplexSurface3D";
import { InverseLaplaceCard, type InverseLaplaceCardHandle } from "@/components/signals/InverseLaplaceCard";
import { ForwardLaplaceCard } from "@/components/signals/ForwardLaplaceCard";
import { DiscreteStemPlot } from "@/components/signals/DiscreteStemPlot";
import { ZTransformDerivationCard } from "@/features/signals/ui/ZTransformDerivationCard";
import { analyzeForwardZ, deriveInverseZSteps, inverseZ } from "@/features/signals/engines/zTransformEngine";
import { discreteYDomain, evaluateDiscrete, parseDiscreteSignal, type DiscreteSample } from "@/features/signals/engines/discreteSignalEngine";
import { complexLatex, deriveForwardLaplaceSteps, formatTransferLatex, forwardLaplace, inverseLaplace, parseTransferFunction, rocFor, type PlaneMode, type RocKind, type TransferFunction } from "@/features/signals/engines/laplaceEngine";
import { nodeToLatex } from "@/features/signals/engines/diracIntegral";
import { evaluateUnifiedSignal, parseUnifiedSignal } from "@/lib/signals/unifiedSignalParser";
import "./laplaceAcademic.css";

const selected = "border-transparent btn-active-brand brand-active-pill font-semibold";
const idle = "border-slate-200 text-slate-600 hover:border-violet-300 hover:text-violet-700 dark:border-slate-800 dark:text-slate-300 dark:hover:border-violet-500 dark:hover:text-violet-200";
const presets: Record<PlaneMode, Array<{ label: string; value: string }>> = { s: [{ label: "Damped pair", value: "\\frac{1}{s^2+4s+13}" }, { label: "Stable first order", value: "\\frac{1}{s+2}" }, { label: "Unstable pole", value: "\\frac{1}{s-1}" }, { label: "Two real poles", value: "\\frac{1}{(s+1)(s+3)}" }, { label: "Undamped oscillator", value: "\\frac{s}{s^2+4}" }, { label: "Repeated pole", value: "\\frac{1}{(s+1)^2}" }], z: [{ label: "Stable pair", value: "\\frac{z+0.5}{z^2-1.2z+0.32}" }, { label: "Unit-delay filter", value: "\\frac{1}{z-0.6}" }, { label: "Unstable pole", value: "\\frac{1}{z-1.2}" }] };
const initial: Record<PlaneMode, string> = { s: "\\frac{1}{s^2+4s+13}", z: "\\frac{z+0.5}{z^2-1.2z+0.32}" };
type InputDomain = "s" | "t";
const timePresets = [
  { label: "Decaying exponential", value: "e^{-3t}u(t)" }, { label: "Causal sine", value: "\\sin(2t)u(t)" }, { label: "Impulse + exponential", value: "\\delta(t)+4e^{-t}u(t)" },
  { label: "Causal cosine", value: "\\cos(3t)u(t)" }, { label: "Critically damped", value: "t\\,e^{-t}u(t)" }, { label: "Damped oscillation", value: "e^{-2t}\\cos(3t)u(t)" },
] as const;
const zTimePresets = [
  { label: "Causal geometric", value: "(0.5)^{n}u[n]" }, { label: "Anti-causal geometric", value: "-(2)^{n}u[-n-1]" },
  { label: "Two-sided annulus", value: "(0.5)^{n}u[n]-(2)^{n}u[-n-1]" }, { label: "Delayed impulse", value: "\\delta[n-2]" },
] as const;

/** Causal h(t) for a (dragged) H(s), rewritten into the terminal grammar ([…] → (…)). */
const timeFromSystem = (system: TransferFunction) => inverseLaplace(system, "right").timeLatex.replace(/^h\(t\)=/, "").replaceAll("\\left[", "\\left(").replaceAll("\\right]", "\\right)");

/** Keypad operators (×, ÷) are folded onto the transfer-function grammar's own spellings. */
function parseOrNull(source: string, mode: PlaneMode): { system: TransferFunction | null; error: string | null } { if (source.includes("\\placeholder")) return { system: null, error: "Fill the empty slot to complete the transfer function." }; try { return { system: parseTransferFunction(source.replaceAll("\\times", "\\cdot").replaceAll("\\div", "/"), mode), error: null }; } catch (error) { return { system: null, error: error instanceof Error ? error.message : "The transfer function could not be parsed." }; } }

export function LaplaceZPlaneLab() {
  const [mode, setMode] = useState<PlaneMode>("s"); const [source, setSource] = useState(initial.s); const [rocKind, setRocKind] = useState<RocKind>("right"); const inputRef = useRef<UnifiedSignalEngineTerminalHandle>(null); const impulseRef = useRef<ImpulseResponseCanvasHandle>(null); const inverseRef = useRef<InverseLaplaceCardHandle>(null);
  const [inputDomain, setInputDomain] = useState<InputDomain>("s"); const [timeSource, setTimeSource] = useState<string>(timePresets[0].value);
  const timeMode = mode === "s" && inputDomain === "t"; const zTimeMode = mode === "z" && inputDomain === "t";
  const [zTimeSource, setZTimeSource] = useState<string>(zTimePresets[0].value);
  const forwardZ = useMemo(() => (zTimeMode ? analyzeForwardZ(zTimeSource) : null), [zTimeMode, zTimeSource]);
  const parsed = useMemo(() => parseOrNull(source, mode), [mode, source]);
  const timeParsed = useMemo(() => (timeMode ? parseUnifiedSignal(timeSource) : null), [timeMode, timeSource]);
  const forward = useMemo(() => (timeParsed?.ok ? forwardLaplace(timeParsed.node, (node, at) => evaluateUnifiedSignal(node, at), nodeToLatex) : null), [timeParsed]);
  const forwardSteps = useMemo(() => (timeParsed?.ok ? deriveForwardLaplaceSteps(timeParsed.node, (node, at) => evaluateUnifiedSignal(node, at), nodeToLatex, { time: "h", freq: "H" }) : null), [timeParsed]);
  const system = timeMode ? (forward?.ok ? forward.system : null) : zTimeMode ? forwardZ?.system ?? null : parsed.system;
  // The unilateral transform of a causal h(t) always converges to the right of its poles.
  const activeRoc: RocKind = timeMode ? "right" : zTimeMode ? forwardZ?.rocKind ?? "right" : rocKind;
  const roc = useMemo(() => system ? rocFor(system, activeRoc) : null, [activeRoc, system]);
  const changeMode = (next: PlaneMode) => { setMode(next); setSource(initial[next]); setRocKind("right"); };
  const previewRootMove = (next: TransferFunction) => { if (!zTimeMode) inputRef.current?.setValue(timeMode ? timeFromSystem(next) : formatTransferLatex(next)); impulseRef.current?.drawSystem(next); inverseRef.current?.preview(next); };
  const commitRootMove = (next: TransferFunction) => { if (timeMode) setTimeSource(timeFromSystem(next)); else { setSource(formatTransferLatex(next)); if (zTimeMode) setInputDomain("s"); } };
  const inverseZData = useMemo(() => (mode === "z" && !zTimeMode && system ? { steps: deriveInverseZSteps(system, rocKind), result: inverseZ(system, rocKind) } : null), [mode, zTimeMode, system, rocKind]);
  const sequenceSamples = useMemo<DiscreteSample[] | null>(() => {
    if (mode !== "z") return null;
    const indices = Array.from({ length: 61 }, (_, index) => index - 30);
    if (zTimeMode) { const node = parseDiscreteSignal(zTimeSource); return node.ok ? indices.map((n) => { const value = evaluateDiscrete(node.node, n); return { n, value: Number.isFinite(value) ? value : 0 }; }) : null; }
    return inverseZData ? indices.map((n) => ({ n, value: inverseZData.result.value(n) })) : null;
  }, [mode, zTimeMode, zTimeSource, inverseZData]);
  return <div className="laplace-academic space-y-6">
    <StudioCard className="overflow-hidden">
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 dark:border-slate-800 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="mt-1 text-xl font-black tracking-tight text-slate-900 dark:text-white">Root Geometry Workspace</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500 dark:text-slate-400">Move poles and zeros directly in the complex plane, inspect the Region of Convergence, and observe the resulting spectral landscape.</p>
        </div>
        <SegmentedControl
          value={mode}
          onChange={changeMode}
          options={[
            { value: "s", label: "Continuous / Laplace" },
            { value: "z", label: "Discrete / Z-Transform" },
          ]}
        />
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.16fr)_minmax(19rem,.84fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          {(
            <SegmentedControl
              value={inputDomain}
              onChange={setInputDomain}
              fullWidth
              options={[
                {
                  value: "s",
                  label: (
                    <span className="font-['Poppins',sans-serif] font-medium inline-flex items-center gap-1.5">
                      {mode === "s" ? "s-Domain" : "z-Domain"} <KatexMath math={`[H(${mode})]`} />
                    </span>
                  ),
                  "aria-label": `${mode}-Domain [H(${mode})]`,
                },
                {
                  value: "t",
                  label: (
                    <span className="font-['Poppins',sans-serif] font-medium inline-flex items-center gap-1.5">
                      Time-Domain <KatexMath math={mode === "s" ? "[h(t)]" : "[h[n]]"} />
                    </span>
                  ),
                  "aria-label": mode === "s" ? "Time-Domain [h(t)]" : "Time-Domain [h[n]]",
                },
              ]}
              aria-label="Input domain"
            />
          )}
          {zTimeMode ? (
            <UnifiedSignalEngineTerminal ref={inputRef} key="ztime" title="SEQUENCE" domain="n" channels={[{ id: "h", lhs: "h[n]", value: zTimeSource, onChange: setZTimeSource, error: forwardZ?.error ?? null }]}>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">{zTimePresets.map((preset) => <button type="button" key={preset.label} onClick={() => setZTimeSource(preset.value)} className={`rounded-xl border px-3 py-2 text-left text-xs font-bold transition active:scale-[.98] ${idle}`}>{preset.label}</button>)}</div>
            </UnifiedSignalEngineTerminal>
          ) : timeMode ? (
            <UnifiedSignalEngineTerminal ref={inputRef} key="time" title="IMPULSE RESPONSE" domain="t" channels={[{ id: "h", lhs: "h(t)", value: timeSource, onChange: setTimeSource, error: timeParsed && !timeParsed.ok ? timeParsed.error : null }]}>
              <div className="mt-4 grid gap-2 sm:grid-cols-3">{timePresets.map((preset) => <button type="button" key={preset.label} onClick={() => setTimeSource(preset.value)} className={`rounded-xl border px-3 py-2 text-left text-xs font-bold transition active:scale-[.98] ${idle}`}>{preset.label}</button>)}</div>
            </UnifiedSignalEngineTerminal>
          ) : (
            <UnifiedSignalEngineTerminal ref={inputRef} key={mode} title="TRANSFER FUNCTION" domain={mode} channels={[{ id: "H", lhs: `H(${mode})`, value: source, onChange: setSource, error: parsed.error }]}>
              <div className="mt-4 grid gap-2 sm:grid-cols-3">{presets[mode].map((preset) => <button type="button" key={preset.label} onClick={() => setSource(preset.value)} className={`rounded-xl border px-3 py-2 text-left text-xs font-bold transition active:scale-[.98] ${idle}`}>{preset.label}</button>)}</div>
            </UnifiedSignalEngineTerminal>
          )}
        </div>
        <div className="flex min-w-0 flex-col gap-5 self-start">
        <InnerBox>
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-white pb-2 border-b border-slate-100 dark:border-slate-800">
            REGION OF CONVERGENCE
          </h3>
          <p className="mt-2 text-[11px] leading-5 text-slate-500 dark:text-slate-400">The shaded plane region determines whether the transform contains the {mode === "s" ? <KatexMath math="j\omega" /> : "unit-circle"} frequency slice.</p>
          {timeMode ? (
            <p className="mt-4 rounded-xl border border-blue-200 bg-blue-50/70 px-3 py-2 text-[11px] leading-5 text-blue-900 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-100">Unilateral transform of a causal <KatexMath math="h(t)" />: the ROC is right-sided by construction.</p>
          ) : zTimeMode ? (
            <p className="mt-4 rounded-xl border border-blue-200 bg-blue-50/70 px-3 py-2 text-[11px] leading-5 text-blue-900 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-100">The ROC follows from the sequence: right-sided terms give <KatexMath math="|z|>r" />, left-sided terms <KatexMath math="|z|<r" />.</p>
          ) : <div className="mt-4">
            <SegmentedControl
              value={rocKind}
              onChange={setRocKind}
              size="sm"
              fullWidth
              options={[
                { value: "right", label: "Right-sided / Causal" },
                { value: "left", label: "Left-sided / Anti-causal" },
                { value: "two-sided", label: "Two-sided / Non-causal" },
              ]}
            />
          </div>}
          {roc && <div className={`mt-4 rounded-xl border p-3 ${roc.stable ? "border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-100" : "border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-100"}`}>
            <div className="flex items-center justify-between">
              <p className="text-xs font-black">{roc.stable ? "System is Stable" : "System is Unstable"}</p>
              <StatusBadge
                variant={roc.stable ? "info" : "danger"}
                className="uppercase tracking-wider text-[10px]"
              >
                {roc.stable ? "STABLE" : "UNSTABLE"}
              </StatusBadge>
            </div>
            <KatexMath math={roc.latex} block className="mt-2 block overflow-x-auto text-left text-xs" />
            <p className="mt-2 text-[11px] leading-5 text-slate-600 dark:text-slate-400">
              The ROC {roc.stable ? "includes" : "excludes"} <KatexMath math={mode === "s" ? "j\\omega" : "|z|=1"} />; the system is {roc.stable ? "BIBO stable" : "BIBO unstable"}.
            </p>
          </div>}
        </InnerBox>
        </div>
      </div>
    </StudioCard>
    {(() => {
      const flush = system && roc ? "overflow-y-auto pr-1 lg:absolute lg:inset-0" : "max-h-[920px] overflow-y-auto pr-1";
      const derivation = mode === "z"
        ? zTimeMode ? <ZTransformDerivationCard className={flush} direction="forward" steps={forwardZ && !forwardZ.error ? forwardZ.steps : null} error={forwardZ?.error ?? null} />
          : inverseZData ? <ZTransformDerivationCard className={flush} direction="inverse" steps={inverseZData.steps} notes={inverseZData.result.warnings} /> : null
        : timeMode
        ? <ForwardLaplaceCard className={flush} steps={forwardSteps} error={timeParsed && !timeParsed.ok ? timeParsed.error : null} notes={forward?.ok ? forward.notes : forward && !forward.ok ? [`The plots need a causal rational transform: ${forward.error}`] : []} />
        : mode === "s" && system ? <InverseLaplaceCard className={flush} ref={inverseRef} system={system} rocKind={rocKind} /> : null;
      const plots = system && roc;
      return (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {plots && <div className={`flex min-w-0 flex-col gap-6${derivation ? " lg:col-span-8" : " lg:col-span-12"}`}>
            <StudioCard>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-white pb-2 border-b border-slate-100 dark:border-slate-800">
              {mode === "s" ? "CARTESIAN S-PLANE" : "POLAR Z-PLANE (UNIT CIRCLE)"}
            </h3>
            <div className="flex flex-wrap gap-2 text-[10px] font-bold">
              <span className="rounded-full border border-rose-300 bg-rose-50 px-2 py-1 text-rose-700 dark:border-rose-400/30 dark:bg-rose-500/10 dark:text-rose-200">× poles</span>
              <span className="rounded-full border border-blue-300 bg-blue-50 px-2 py-1 text-blue-700 dark:border-blue-400/30 dark:bg-blue-500/10 dark:text-blue-200">○ zeros</span>
              <span className="rounded-full border border-slate-300 px-2 py-1 text-slate-600 dark:border-slate-700 dark:text-slate-300">Drag roots · Auto-scaled</span>
            </div>
          </div>
          <SZPlaneCanvas system={system} roc={roc} extractSlice onPreview={previewRootMove} onCommit={commitRootMove} />
          <div className="mt-4 border-t border-slate-100 pt-4 dark:border-slate-800/80">
            <p className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-white">SOLVED POLES &amp; ZEROS</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[.14em] text-rose-500">Poles</p>
          <div className="mt-2 space-y-2">
            {system.poles.length ? system.poles.map((root, index) => <div key={`p${index}`} className="flex items-center justify-between rounded-xl border border-rose-200 bg-rose-50/70 px-3 py-2 text-xs dark:border-rose-400/20 dark:bg-rose-500/10"><KatexMath math={`p_{${index + 1}}=${complexLatex(root)}`} /><span className="font-mono text-rose-600 dark:text-rose-200">×</span></div>) : <p className="text-xs text-slate-500">No finite poles.</p>}
          </div>
        </div>
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[.14em] text-blue-500">Zeros</p>
          <div className="mt-2 space-y-2">
            {system.zeros.length ? system.zeros.map((root, index) => <div key={`z${index}`} className="flex items-center justify-between rounded-xl border border-blue-200 bg-blue-50/70 px-3 py-2 text-xs dark:border-blue-400/20 dark:bg-blue-500/10"><KatexMath math={`z_{${index + 1}}=${complexLatex(root)}`} /><span className="font-mono text-blue-600 dark:text-blue-200">○</span></div>) : <p className="text-xs text-slate-500">No finite zeros.</p>}
          </div>
        </div>
      </div>
          </div>
            </StudioCard>
          </div>}
          {derivation && <div className={`relative min-h-[34rem] min-w-0${plots ? " lg:col-span-4" : " lg:col-span-12"}`}>{derivation}</div>}
          {plots && (
            <StudioCard className="lg:col-span-12">
              <div className="mb-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-white pb-2 border-b border-slate-100 dark:border-slate-800">
                  SYSTEM RESPONSES
                </h3>
              </div>
              <FrequencyResponseCanvases system={system}>
                {mode === "s" ? (
                  <ImpulseResponseCanvas ref={impulseRef} system={system} />
                ) : sequenceSamples ? (() => {
                  // Symmetric [−N, N] (at least ±10) so n = 0 is dead centre; N grows to cover the last visible sample.
                  const peak = Math.max(1e-12, ...sequenceSamples.map((sample) => Math.abs(sample.value)));
                  const last = sequenceSamples.reduce((extent, sample) => (Math.abs(sample.value) > 0.01 * peak ? Math.max(extent, Math.abs(sample.n) + 1) : extent), 0);
                  const bound = Math.min(30, Math.max(10, last)); const window = { from: -bound, to: bound };
                  return (
                    <DiscreteStemPlot
                      title="h[n]"
                      name="h[n]"
                      samples={sequenceSamples.filter((sample) => sample.n >= window.from && sample.n <= window.to)}
                      color="#8B5CF6"
                      window={window}
                      yDomain={discreteYDomain([sequenceSamples.filter((sample) => Math.abs(sample.n) <= bound)], window)}
                      height={320}
                    />
                  );
                })() : null}
              </FrequencyResponseCanvases>
            </StudioCard>
          )}
        </div>
      );
    })()}
    {system && roc && <>
      <StudioCard>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-white pb-2 border-b border-slate-100 dark:border-slate-800">
            3D COMPLEX SURFACE STUDIO
          </h3>
          <span className="text-[11px] text-slate-400">Drag to orbit • Scroll to zoom • Hover the surface to probe |H|</span>
        </div>
        <ComplexSurface3D system={system} roc={roc} onModeChange={changeMode} />
      </StudioCard>
    </>}
  </div>;
}

export default LaplaceZPlaneLab;
