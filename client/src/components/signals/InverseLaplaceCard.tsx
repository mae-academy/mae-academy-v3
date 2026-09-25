/**
 * MAE Academy / Signals & Systems — Tab E inverse Laplace card.
 * Renders h(t) = 𝓛⁻¹{H(s)} and its partial-fraction trace for the active ROC. Root drags reach it via
 * the imperative `preview` handle, so only this card re-renders while the plane is being dragged.
 */
import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from "react";
import { KatexMath } from "@/components/ui/KatexMath";
import { StatusBadge } from "@/components/common/templates";
import { inverseLaplace, type Causality, type RocKind, type TransferFunction } from "@/features/signals/engines/laplaceEngine";

export type InverseLaplaceCardHandle = { preview: (system: TransferFunction) => void };

type Props = { system: TransferFunction; rocKind: RocKind };

const CAUSALITY: Record<Causality, { label: string; variant: "info" | "default" | "danger" }> = {
  causal: { label: "Causal · Right-Sided", variant: "info" },
  "anti-causal": { label: "Anti-Causal · Left-Sided", variant: "danger" },
  "non-causal": { label: "Non-Causal · Two-Sided", variant: "default" },
};

const fmt = (value: number) => { const rounded = Number(value.toFixed(4)); return Object.is(rounded, -0) ? "0" : String(rounded); };
const complexTex = (re: number, im: number) => {
  if (Math.abs(im) < 1e-7) return fmt(re);
  if (Math.abs(re) < 1e-7) return `${im < 0 ? "-" : ""}j${fmt(Math.abs(im))}`;
  return `${fmt(re)}${im < 0 ? "-" : "+"}j${fmt(Math.abs(im))}`;
};

export const InverseLaplaceCard = forwardRef<InverseLaplaceCardHandle, Props>(function InverseLaplaceCard({ system, rocKind }, ref) {
  const [previewed, setPreviewed] = useState<TransferFunction | null>(null);
  useEffect(() => setPreviewed(null), [system]);
  useImperativeHandle(ref, () => ({ preview: setPreviewed }), []);
  const result = useMemo(() => inverseLaplace(previewed ?? system, rocKind), [previewed, system, rocKind]);
  const causality = CAUSALITY[result.causality];
  // Residue table: one row per (pole, order); repeated poles index A_{k,order}.
  const poleIndex = new Map<string, number>();
  const rows = result.terms.map((term) => {
    const key = `${term.pole.re},${term.pole.im}`;
    if (!poleIndex.has(key)) poleIndex.set(key, poleIndex.size + 1);
    const index = poleIndex.get(key)!;
    const suffix = term.multiplicity > 1 ? `${index},${term.order}` : `${index}`;
    return { key: `${key}:${term.order}`, pole: `p_{${index}}=${complexTex(term.pole.re, term.pole.im)}${term.multiplicity > 1 ? `\\;(m=${term.multiplicity})` : ""}`, residue: `A_{${suffix}}=${complexTex(term.residue.re, term.residue.im)}`, causal: term.causal };
  });

  return (
    <section className="min-w-0 rounded-2xl border border-slate-200/80 bg-white/80 p-4 shadow-sm backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/80">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3 dark:border-slate-800/80">
        <div className="min-w-0">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-white">Inverse Laplace Transform</h3>
          <KatexMath math={String.raw`\mathcal{L}^{-1}\{H(s)\}=h(t)`} className="mt-1 block text-sm text-slate-600 dark:text-slate-300" />
        </div>
        <StatusBadge variant={causality.variant} className="uppercase tracking-wider text-[10px]">{causality.label}</StatusBadge>
      </header>

      <div data-testid="inverse-laplace-ht" className="mt-4 overflow-x-auto rounded-xl border border-slate-200/60 bg-slate-50/80 p-3 text-center text-lg text-slate-900 dark:border-slate-800 dark:bg-slate-950/60 dark:text-white">
        <KatexMath math={result.timeLatex} displayMode />
      </div>

      <details open className="group mt-3">
        <summary className="cursor-pointer select-none text-[10px] font-bold uppercase tracking-[0.17em] text-slate-500 hover:text-violet-700 dark:text-slate-400 dark:hover:text-violet-200">
          Partial fraction expansion
        </summary>
        <div data-testid="inverse-laplace-pfe" className="mt-2 overflow-x-auto text-sm text-slate-700 dark:text-slate-200">
          <KatexMath math={result.pfeLatex} displayMode />
        </div>
        {rows.length > 0 && (
          <ul className="mt-2 space-y-1.5">
            {rows.map((row) => (
              <li key={row.key} className="flex items-center justify-between gap-3 overflow-x-auto rounded-lg border border-slate-200/70 bg-white/70 px-3 py-1.5 text-xs dark:border-slate-800 dark:bg-slate-900/60">
                <KatexMath math={row.pole} />
                <span className="flex items-center gap-2">
                  <KatexMath math={row.residue} />
                  <span className={`text-[10px] font-semibold ${row.causal ? "text-blue-600 dark:text-blue-300" : "text-rose-600 dark:text-rose-300"}`}>{row.causal ? "u(t)" : "u(−t)"}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
        {result.direct.some((value) => Math.abs(value) > 1e-7) && (
          <p className="mt-2 text-[11px] leading-5 text-slate-500 dark:text-slate-400">
            <KatexMath math={String.raw`\deg N\ge\deg D`} />: the polynomial quotient maps to <KatexMath math={String.raw`\delta(t)`} /> terms.
          </p>
        )}
      </details>

      {result.warnings.map((warning) => (
        <p key={warning} role="status" className="mt-3 rounded-r-xl border-l-2 border-violet-400 bg-violet-50/70 px-3 py-2 text-xs leading-5 text-violet-800 dark:bg-violet-500/10 dark:text-violet-200">{warning}</p>
      ))}
    </section>
  );
});

export default InverseLaplaceCard;
