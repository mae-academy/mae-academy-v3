/**
 * MAE Academy / Signals & Systems — Tab E inverse Laplace card.
 * Renders h(t) = 𝓛⁻¹{H(s)} as a step-by-step PFE / residue / ROC derivation for the active ROC. Root drags reach it via
 * the imperative `preview` handle, so only this card re-renders while the plane is being dragged.
 */
import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { StatusBadge } from "@/components/common/templates";
import { ContinuousDerivationCard } from "@/features/signals/ui/ContinuousDerivationCard";
import { deriveInverseLaplaceSteps, inverseLaplace, type Causality, type RocKind, type TransferFunction } from "@/features/signals/engines/laplaceEngine";

export type InverseLaplaceCardHandle = { preview: (system: TransferFunction) => void };

type Props = { system: TransferFunction; rocKind: RocKind; className?: string };

export const InverseLaplaceCard = forwardRef<InverseLaplaceCardHandle, Props>(function InverseLaplaceCard({ system, rocKind, className }, ref) {
  const { t } = useTranslation('simulators');
  const CAUSALITY: Record<Causality, { label: string; variant: "info" | "default" | "danger" }> = {
    causal: { label: t('signals.causalRightSided', 'Causal · Right-Sided'), variant: "info" },
    "anti-causal": { label: t('signals.antiCausalLeftSided', 'Anti-Causal · Left-Sided'), variant: "danger" },
    "non-causal": { label: t('signals.nonCausalTwoSided', 'Non-Causal · Two-Sided'), variant: "default" },
  };
  const [previewed, setPreviewed] = useState<TransferFunction | null>(null);
  useEffect(() => setPreviewed(null), [system]);
  useImperativeHandle(ref, () => ({ preview: setPreviewed }), []);
  const active = previewed ?? system;
  const result = useMemo(() => inverseLaplace(active, rocKind), [active, rocKind]);
  const steps = useMemo(() => deriveInverseLaplaceSteps(active, rocKind, {}, { time: "h", freq: "H" }), [active, rocKind]);
  const causality = CAUSALITY[result.causality];

  return (
    <ContinuousDerivationCard
      title={t('signals.inverseLaplaceTransform', 'Inverse Laplace Transform')}
      pair={String.raw`\mathcal{L}^{-1}\{H(s)\}=h(t)`}
      steps={steps}
      target={result.timeLatex}
      targetTestId="inverse-laplace-ht"
      badge={<StatusBadge variant={causality.variant} className="uppercase tracking-wider text-[10px]">{causality.label}</StatusBadge>}
      notes={result.warnings}
      className={className}
    />
  );
});

export default InverseLaplaceCard;
