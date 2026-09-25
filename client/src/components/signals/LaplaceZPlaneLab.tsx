/**
 * MAE Academy / Signals & Systems — Tab E S/Z-plane laboratory.
 * During a root drag, the plane and MathLive field update imperatively through
 * refs; React receives one committed transfer function only on pointer release.
 */
import { Move3D, Waves } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { KatexMath } from "@/components/ui/KatexMath";
import { SegmentedControl, StatusBadge, StudioCard, InnerBox } from "@/components/common/templates";
import { MathLiveSignalInput, type MathLiveSignalInputHandle } from "@/components/signals/MathLiveSignalInput";
import SZPlaneCanvas from "@/components/signals/SZPlaneCanvas";
import { FrequencyResponseCanvases, ImpulseResponseCanvas, type ImpulseResponseCanvasHandle } from "@/components/signals/LaplaceCanvases";
import { LaplaceLandscape3D } from "@/components/signals/LaplaceLandscape3D";
import { complexLatex, formatTransferLatex, parseTransferFunction, rocFor, type PlaneMode, type RocKind, type TransferFunction } from "@/features/signals/engines/laplaceEngine";
import "./laplaceAcademic.css";

const selected = "border-transparent bg-gradient-to-r from-[#2563EB] via-[#7C3AED] to-[#E11D48] text-white shadow-sm font-semibold";
const idle = "border-slate-200 text-slate-600 hover:border-violet-300 hover:text-violet-700 dark:border-slate-800 dark:text-slate-300 dark:hover:border-violet-500 dark:hover:text-violet-200";
const presets: Record<PlaneMode, Array<{ label: string; value: string }>> = { s: [{ label: "Damped pair", value: "\\frac{1}{s^2+4s+13}" }, { label: "Stable first order", value: "\\frac{1}{s+2}" }, { label: "Unstable pole", value: "\\frac{1}{s-1}" }], z: [{ label: "Stable pair", value: "\\frac{z+0.5}{z^2-1.2z+0.32}" }, { label: "Unit-delay filter", value: "\\frac{1}{z-0.6}" }, { label: "Unstable pole", value: "\\frac{1}{z-1.2}" }] };
const initial: Record<PlaneMode, string> = { s: "\\frac{1}{s^2+4s+13}", z: "\\frac{z+0.5}{z^2-1.2z+0.32}" };

function parseOrNull(source: string, mode: PlaneMode): { system: TransferFunction | null; error: string | null } { try { return { system: parseTransferFunction(source, mode), error: null }; } catch (error) { return { system: null, error: error instanceof Error ? error.message : "The transfer function could not be parsed." }; } }

export function LaplaceZPlaneLab() {
  const [mode, setMode] = useState<PlaneMode>("s"); const [source, setSource] = useState(initial.s); const [rocKind, setRocKind] = useState<RocKind>("right"); const [slice, setSlice] = useState(false); const inputRef = useRef<MathLiveSignalInputHandle>(null); const impulseRef = useRef<ImpulseResponseCanvasHandle>(null);
  const parsed = useMemo(() => parseOrNull(source, mode), [mode, source]); const system = parsed.system; const roc = useMemo(() => system ? rocFor(system, rocKind) : null, [rocKind, system]);
  const changeMode = (next: PlaneMode) => { setMode(next); setSource(initial[next]); setRocKind("right"); setSlice(false); };
  const previewRootMove = (next: TransferFunction) => { inputRef.current?.setValue(formatTransferLatex(next)); impulseRef.current?.drawSystem(next); };
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
        <InnerBox>
          <h3 id="laplace-field-label" className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-white pb-2 border-b border-slate-100 dark:border-slate-800">
            TRANSFER FUNCTION
          </h3>
          <KatexMath math={system ? formatTransferLatex(system) : `H(${mode})=\\text{syntax error}`} className="mt-2 block min-h-7 overflow-x-auto text-lg font-black text-slate-900 dark:text-white" />
          <div className="mt-4"><MathLiveSignalInput ref={inputRef} value={source} onChange={setSource} labelledBy="laplace-field-label" /></div>
          {parsed.error && <p className="mt-2 text-xs font-bold text-rose-600 dark:text-rose-300">{parsed.error}</p>}
          <div className="mt-4 grid gap-2 sm:grid-cols-3">{presets[mode].map((preset) => <button type="button" key={preset.label} onClick={() => setSource(preset.value)} className={`rounded-xl border px-3 py-2 text-left text-xs font-bold transition active:scale-[.98] ${idle}`}>{preset.label}</button>)}</div>
        </InnerBox>
        <InnerBox>
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-white pb-2 border-b border-slate-100 dark:border-slate-800">
            REGION OF CONVERGENCE
          </h3>
          <p className="mt-2 text-[11px] leading-5 text-slate-500 dark:text-slate-400">The shaded plane region determines whether the transform contains the {mode === "s" ? <KatexMath math="j\omega" /> : "unit-circle"} frequency slice.</p>
          <div className="mt-4">
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
          </div>
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
            <p className="mt-2 text-[11px] leading-5 text-slate-600 dark:text-slate-400">{roc.description}</p>
          </div>}
        </InnerBox>
      </div>
    </StudioCard>
    {system && roc && <>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.18fr)_minmax(19rem,.82fr)]">
        <StudioCard>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-white pb-2 border-b border-slate-100 dark:border-slate-800">
              {mode === "s" ? "CARTESIAN S-PLANE" : "POLAR Z-PLANE (UNIT CIRCLE)"}
            </h3>
            <div className="flex flex-wrap gap-2 text-[10px] font-bold">
              <span className="rounded-full border border-rose-300 bg-rose-50 px-2 py-1 text-rose-700 dark:border-rose-400/30 dark:bg-rose-500/10 dark:text-rose-200">× poles</span>
              <span className="rounded-full border border-blue-300 bg-blue-50 px-2 py-1 text-blue-700 dark:border-blue-400/30 dark:bg-blue-500/10 dark:text-blue-200">○ zeros</span>
              <span className="rounded-full border border-slate-300 px-2 py-1 text-slate-600 dark:border-slate-700 dark:text-slate-300">Drag / pan / zoom</span>
            </div>
          </div>
          <SZPlaneCanvas system={system} roc={roc} extractSlice={slice} onPreview={previewRootMove} onCommit={(next) => setSource(formatTransferLatex(next))} />
        </StudioCard>
        <StudioCard className="max-h-[560px] overflow-y-auto">
          <div className="mb-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-white pb-2 border-b border-slate-100 dark:border-slate-800">
              SOLVED POLES &amp; ZEROS
            </h3>
          </div>
          <div className="mt-5 grid gap-4">
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
          <div className="mt-5 rounded-xl border border-violet-300/60 bg-violet-50 p-3 text-xs leading-5 text-violet-950 dark:border-violet-400/25 dark:bg-violet-500/10 dark:text-violet-100">
            <Move3D className="mr-1 inline h-3.5 w-3.5" />Drag a root in the plane. Complex-conjugate partners move symmetrically to preserve a real-coefficient transfer function.
          </div>
        </StudioCard>
      </div>
      <StudioCard>
        <div className="flex flex-col gap-4 border-b border-slate-200 pb-4 dark:border-slate-800 md:flex-row md:items-end md:justify-between">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-white pb-2 border-b border-slate-100 dark:border-slate-800">
              FREQUENCY RESPONSE SLICE
            </h3>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Extract the highlighted {mode === "s" ? <KatexMath math="j\omega" /> : "|z|=1"} path from the complex plane.</p>
          </div>
          <button type="button" onClick={() => setSlice((current) => !current)} className={`rounded-full px-4 py-2 text-xs font-semibold transition active:scale-[.98] cursor-pointer ${slice ? selected : idle}`}><Waves className="mr-1.5 inline h-3.5 w-3.5" />{slice ? "Hide Frequency Response" : "Extract Frequency Response H(jω)"}</button>
        </div>
        {slice && <div className="mt-5 grid gap-5 xl:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-bold text-slate-600 dark:text-slate-300">Bode-style slice</p>
            <FrequencyResponseCanvases system={system} />
          </div>
          <div>
            <p className="mb-2 text-xs font-bold text-slate-600 dark:text-slate-300">{mode === "s" ? "Reconstructed simple-pole h(t)" : "Pole-geometry companion"}</p>
            {mode === "s" ? <ImpulseResponseCanvas ref={impulseRef} system={system} /> : <div className="grid h-40 place-items-center rounded-xl border border-violet-300/50 bg-violet-50 p-4 text-center text-xs leading-5 text-violet-950 dark:border-violet-400/25 dark:bg-violet-500/10 dark:text-violet-100">For Z-transform mode, the pole-zero plane and unit-circle Bode slice remain the controlled visual relationship. Continuous-time simple poles additionally expose the modal inverse-Laplace <KatexMath math="h(t)" /> preview.</div>}
          </div>
        </div>}
      </StudioCard>
      <StudioCard>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-white pb-2 border-b border-slate-100 dark:border-slate-800">
            3D MAGNITUDE LANDSCAPE
          </h3>
          <span className="text-[11px] text-slate-400">Drag to rotate • Scroll to zoom • Interactive software 3D engine</span>
        </div>
        <LaplaceLandscape3D system={system} />
      </StudioCard>
    </>}
  </div>;
}

export default LaplaceZPlaneLab;
