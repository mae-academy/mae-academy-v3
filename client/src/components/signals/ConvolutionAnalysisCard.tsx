/**
 * MAE Academy / Signals & Systems — right-hand piecewise analytical stage.
 * Owns its own tiny state so the throttled canvas frames re-render only this card.
 */
import { forwardRef, useImperativeHandle, useState } from "react";
import { KatexMath } from "@/components/ui/KatexMath";
import { FormulaBox, InnerBox, StatusBadge, StudioCard } from "@/components/common/templates";
import type { ConvolutionRegime, RegimeKind } from "@/features/signals/engines/convolutionPiecewise";

export type ConvolutionAnalysisHandle = { update: (regime: ConvolutionRegime, t: number, value: number) => void };
type Snapshot = { regime: ConvolutionRegime; t: number; value: number };

const fmt = (v: number, digits = 4) => (Number.isFinite(v) ? Number(v.toFixed(digits)).toString() : "—");
const variant = (kind: RegimeKind) => (kind === "before" || kind === "after" ? "neutral" as const : kind === "full-x" || kind === "full-h" ? "success" as const : "info" as const);
const bound = (v: number) => (Number.isFinite(v) ? fmt(v, 2) : v < 0 ? "-\\infty" : "\\infty");

export const ConvolutionAnalysisCard = forwardRef<ConvolutionAnalysisHandle>(function ConvolutionAnalysisCard(_, ref) {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  useImperativeHandle(ref, () => ({ update: (regime, t, value) => setSnap({ regime, t, value }) }), []);
  const r = snap?.regime; const idle = !r || r.kind === "before" || r.kind === "after";
  return <StudioCard>
    <h3 className="pb-2 text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-white border-b border-slate-100 dark:border-slate-800">Piecewise analytical stage</h3>
    {!snap || !r ? <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">Awaiting first frame…</p> : <div className="mt-3 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge variant={variant(r.kind)}>{r.kind === "impulse" || r.kind === "unbounded" ? r.label : `Phase ${r.index} / ${r.total} · ${r.label}`}</StatusBadge>
      </div>
      <InnerBox>
        <p className="text-[10px] font-bold uppercase tracking-[0.17em] text-slate-500 dark:text-slate-400">Active regime in t</p>
        <KatexMath math={`${bound(r.tRange.from)}\\le t<${bound(r.tRange.to)}`} className="mt-1 block" />
        <p className="mt-3 text-[10px] font-bold uppercase tracking-[0.17em] text-slate-500 dark:text-slate-400">Active bounds</p>
        {idle ? <KatexMath math="x(\tau)\,h(t-\tau)=0\;\;\forall\tau" className="mt-1 block" /> : r.kind === "impulse" ? <KatexMath math={r.tau1Latex} className="mt-1 block" /> : <KatexMath math={`${r.tau1Latex}\\le\\tau\\le ${r.tau2Latex}`} className="mt-1 block" />}
      </InnerBox>
      <FormulaBox className="flex-col gap-2">
        {r.kind === "impulse" ? <KatexMath math={r.integralLatex} displayMode /> : <>
          <KatexMath math={idle ? "\\int x(\\tau)h(t-\\tau)\\,d\\tau=0" : `y(t)=\\int_{${r.tau1Latex}}^{${r.tau2Latex}}x(\\tau)\\,h(t-\\tau)\\,d\\tau`} displayMode />
          {r.closedFormLatex !== null && <KatexMath math={`y(t)=${r.closedFormLatex}`} displayMode />}
        </>}
        {r.closedFormLatex === null && r.kind !== "impulse" && <span className="text-[11px] text-slate-500 dark:text-slate-400">No low-order closed form detected; value is integrated numerically.</span>}
      </FormulaBox>
      <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/60 px-3.5 py-2.5 text-xs dark:border-slate-800 dark:bg-slate-900/40">
        <span className="text-slate-600 dark:text-slate-300">
          <KatexMath math={`t = ${fmt(snap.t, 3)}`} />
        </span>
        <span className="font-semibold text-blue-600 dark:text-blue-400">
          <KatexMath math={`y(t) = ${fmt(snap.value, 5)}`} />
        </span>
      </div>
    </div>}
  </StudioCard>;
});

export default ConvolutionAnalysisCard;
