/**
 * MAE Academy / Signals & Systems — System Classification Pillars & Analytical Derivations.
 * Renders the 5 Pillars of classification (Linearity, Time Invariance, Causality, Memory, BIBO Stability)
 * with step-by-step mathematical substitution proofs in KaTeX.
 */
import {
  Activity,
  Braces,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  FunctionSquare,
  Timer,
} from "lucide-react";
import { InnerBox, StatusBadge } from "@/components/common/templates";
import { KatexMath } from "@/components/ui/KatexMath";
import type { Pillar, PillarId } from "@/features/signals/engines/systemClassifier";

export function PillarIcon({ id }: { id: PillarId }) {
  const icons = {
    linearity: FunctionSquare,
    time: Timer,
    causality: ChevronRight,
    memory: Braces,
    stability: Activity,
  };
  const Icon = icons[id];
  return <Icon className="h-4 w-4" />;
}

export function PillarSubtitle({ id }: { id: PillarId }) {
  switch (id) {
    case "linearity":
      return (
        <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 font-normal">
          <span>Compare</span>
          <KatexMath math="T\{a x_1(t) + b x_2(t)\} \quad \text{with} \quad a T\{x_1(t)\} + b T\{x_2(t)\}" />
        </span>
      );
    case "time":
      return (
        <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 font-normal">
          <span>Compare</span>
          <KatexMath math="T\{x(t - t_0)\} \quad \text{with} \quad y(t - t_0)" />
        </span>
      );
    case "causality":
      return (
        <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 font-normal">
          <span>Evaluate dependency at</span>
          <KatexMath math="t = t_1" />
        </span>
      );
    case "memory":
      return (
        <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 font-normal">
          <span>Test dependence on past/future</span>
          <KatexMath math="x(\tau), \ \tau \ne t" />
        </span>
      );
    case "stability":
      return (
        <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 font-normal">
          <span>Inject bounded input</span>
          <KatexMath math="|x(t)| \le M < \infty" />
        </span>
      );
  }
}

export function PendingBadge() {
  return (
    <StatusBadge variant="neutral" className="gap-1.5 uppercase tracking-[0.1em] text-[10px]">
      <CircleAlert className="h-3.5 w-3.5" />
      Syntax check
    </StatusBadge>
  );
}

export function VerdictBadge({ pillar }: { pillar: Pillar }) {
  return (
    <StatusBadge
      variant={pillar.passed ? "info" : "danger"}
      className="gap-1.5 uppercase tracking-[0.1em] text-[10px]"
    >
      {pillar.passed ? <CheckCircle2 className="h-3.5 w-3.5" /> : <CircleAlert className="h-3.5 w-3.5" />}
      {pillar.verdict}
    </StatusBadge>
  );
}

/**
 * Dedicated Derivation Card rendering step-by-step KaTeX mathematical substitution proofs.
 */
export function PillarDerivationCard({ proof }: { proof: readonly string[] }) {
  return (
    <InnerBox>
      <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-white">
          DERIVATION
        </h3>
        <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500">
          {proof.length} analytical steps
        </span>
      </div>
      <div className="mt-3 space-y-3 overflow-x-auto">
        {proof.map((step, index) => (
          <div key={index} className="grid gap-1 sm:grid-cols-[4.5rem_minmax(0,1fr)] sm:gap-3">
            <span className="font-sans text-xs font-semibold uppercase tracking-wider text-purple-600 dark:text-purple-400">Step {index + 1}</span>
            <div className="min-w-0">
              <KatexMath
                math={step}
                block
                className="block text-left text-xs leading-6 text-slate-700 dark:text-slate-200"
              />
            </div>
          </div>
        ))}
      </div>
    </InnerBox>
  );
}

export default PillarDerivationCard;
