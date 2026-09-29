/**
 * MAE Academy / Signals & Systems — Fourier series derivation with an EFS (c_n) / TFS (a_n, b_n) switch.
 * Scroll-contained so it can sit in the inspection column beneath the selected coefficients.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { SegmentedControl } from "@/components/common/templates";
import { KatexMath } from "@/components/ui/KatexMath";
import type { DerivationStep } from "@/features/signals/engines/derivationTypes";
import { ContinuousDerivationCard } from "@/features/signals/ui/ContinuousDerivationCard";

type SeriesForm = "efs" | "tfs";
type Props = { efsSteps: DerivationStep[]; tfsSteps: DerivationStep[]; className?: string };

const PAIRS: Record<SeriesForm, string> = {
  efs: String.raw`c_k=\frac{1}{T_0}\int_{\langle T_0\rangle}x(t)\,e^{-jk\omega_0t}\,dt`,
  tfs: String.raw`x(t)=\frac{a_0}{2}+\sum_{k\ge1}a_k\cos k\omega_0t+b_k\sin k\omega_0t`,
};

export function FourierSeriesDerivationCard({ efsSteps, tfsSteps, className }: Props) {
  const { t } = useTranslation('simulators');
  const [form, setForm] = useState<SeriesForm>("efs");
  return (
    <ContinuousDerivationCard
      className={className ?? "max-h-[520px] overflow-y-auto pr-1"}
      title={t('signals.fourierSeriesDerivation', 'Fourier Series Derivation')}
      pair={PAIRS[form]}
      steps={form === "efs" ? efsSteps : tfsSteps}
      actions={
        <SegmentedControl<SeriesForm>
          value={form}
          onChange={setForm}
          size="sm"
          fullWidth
          aria-label="Fourier series form"
          options={[
            { value: "efs", label: <span className="inline-flex items-center gap-1.5">EFS <KatexMath math="c_n" /></span>, "aria-label": "Exponential Fourier series c_n" },
            { value: "tfs", label: <span className="inline-flex items-center gap-1.5">TFS <KatexMath math="a_n,\ b_n" /></span>, "aria-label": "Trigonometric Fourier series a_n, b_n" },
          ]}
        />
      }
    />
  );
}

export default FourierSeriesDerivationCard;
