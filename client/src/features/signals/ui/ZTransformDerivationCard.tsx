/**
 * MAE Academy / Signals & Systems — Tab E z-transform derivation card (forward Σh[n]z⁻ⁿ and inverse PFE with ROC matching).
 */
import { StatusBadge } from "@/components/common/templates";
import type { DerivationStep } from "@/features/signals/engines/derivationTypes";
import { ContinuousDerivationCard } from "@/features/signals/ui/ContinuousDerivationCard";

type Props = { direction: "forward" | "inverse"; steps: DerivationStep[] | null; error?: string | null; notes?: string[]; className?: string };

export function ZTransformDerivationCard({ direction, steps, error = null, notes = [], className }: Props) {
  const forward = direction === "forward";
  return (
    <ContinuousDerivationCard
      className={className ?? "max-h-[880px] overflow-y-auto pr-1"}
      title={forward ? "Z-Transform" : "Inverse Z-Transform"}
      pair={forward ? String.raw`\mathcal{Z}\{h[n]\}=H(z)` : String.raw`\mathcal{Z}^{-1}\{H(z)\}=h[n]`}
      steps={steps ?? []}
      error={steps ? null : error ?? "Enter h[n] from the keypad, for example (0.5)^{n}u[n]."}
      targetTestId={forward ? "forward-z-hz" : "inverse-z-hn"}
      badge={<StatusBadge variant="info" className="uppercase tracking-wider text-[10px]">Bilateral · ROC</StatusBadge>}
      notes={notes}
    />
  );
}

export default ZTransformDerivationCard;
