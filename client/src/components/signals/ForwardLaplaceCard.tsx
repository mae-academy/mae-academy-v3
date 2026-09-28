/**
 * MAE Academy / Signals & Systems — Tab E forward Laplace derivation (time-domain mode).
 * Bilateral 𝓛{h(t)} = H(s) with the convergence limit and ROC of every term, in one flat container.
 */
import { StatusBadge } from "@/components/common/templates";
import { ContinuousDerivationCard } from "@/features/signals/ui/ContinuousDerivationCard";
import type { DerivationStep } from "@/features/signals/engines/derivationTypes";

type Props = { steps: DerivationStep[] | null; error?: string | null; notes?: string[]; className?: string };

export function ForwardLaplaceCard({ steps, error = null, notes = [], className }: Props) {
  return (
    <ContinuousDerivationCard
      title="Laplace Transform"
      pair={String.raw`\mathcal{L}\{h(t)\}=H(s)`}
      steps={steps ?? []}
      error={steps ? null : error ?? "Enter h(t) from the keypad, for example e^{-3t}u(t)."}
      targetTestId="forward-laplace-hs"
      badge={<StatusBadge variant="info" className="uppercase tracking-wider text-[10px]">Bilateral · ROC</StatusBadge>}
      notes={notes}
      className={className}
    />
  );
}

export default ForwardLaplaceCard;
