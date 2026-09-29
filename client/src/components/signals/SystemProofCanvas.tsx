/**
 * MAE Academy / Signals & Systems — Tab B System Properties Verification.
 * Canonical vector SVG implementation consuming StandardStepPlot template.
 */
import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { StandardStepPlot } from "@/components/common/templates/StandardStepPlot";
import {
  classifySystem,
  evaluateSystem,
  shiftTestSamples,
  stabilitySamples,
  superpositionSamples,
  x2,
  type PillarId,
  type SystemSemantic,
} from "@/features/signals/engines/systemClassifier";

type Props = {
  system: SystemSemantic;
  pillar: PillarId;
  a: number;
  b: number;
  t0: number;
};

export function SystemProofCanvas({ system, pillar, a, b, t0 }: Props) {
  const { t } = useTranslation('simulators');
  const verdictLabel = (verdict: string) => {
    switch (verdict) {
      case "Causal": return t('signals.verdictCausal', 'Causal');
      case "Non-Causal": return t('signals.verdictNonCausal', 'Non-Causal');
      case "Memoryless": return t('signals.verdictMemoryless', 'Memoryless');
      case "Dynamic": return t('signals.verdictDynamic', 'Dynamic');
      default: return verdict;
    }
  };
  const { series, title, xLabel, yLabel } = useMemo(() => {
    const report = classifySystem(system);
    const verdict = report.pillars.find((item) => item.id === pillar)?.verdict ?? "";

    if (pillar === "stability") {
      const from = -2;
      const to = 8;
      const points = stabilitySamples(system, from, to);
      const isUnstable = verdict === "Unstable";

      return {
        title: `${t('signals.bipoStabilityTest', 'BIBO Stability Test')} — ${isUnstable ? t('signals.unstableDivergent', 'Unstable / Divergent') : t('signals.stableBounded', 'Stable / Bounded')}`,
        xLabel: "t\\text{ (s)}",
        yLabel: "y(t)",
        series: [
          {
            id: "output",
            katexName: "y(t)",
            data: points.map((p) => ({ x: p.t, y: p.output })),
            color: "#2563EB",
          },
          {
            id: "input",
            katexName: "x(t)\\text{ (bounded)}",
            data: points.map((p) => ({ x: p.t, y: p.input })),
            color: "#DC2626",
            dashArray: "5 5",
          },
        ],
      };
    }

    if (pillar === "linearity") {
      const from = -3;
      const to = 3;
      const data = superpositionSamples(system, a, b, from, to);
      const isLinear = Math.max(...data.map((p) => Math.abs(p.difference))) < 1e-5;

      return {
        title: `${t('signals.linearSuperpositionTest', 'Linear Superposition Test')} — ${isLinear ? t('signals.linearCoincident', 'Linear (Coincident)') : t('signals.nonLinearSeparated', 'Non-Linear (Separated)')}`,
        xLabel: "t\\text{ (s)}",
        yLabel: "y(t)",
        series: [
          {
            id: "left",
            katexName: "T\\{a x_1 + b x_2\\}",
            data: data.map((p) => ({ x: p.t, y: p.left })),
            color: "#2563EB",
          },
          {
            id: "right",
            katexName: "a T\\{x_1\\} + b T\\{x_2\\}",
            data: data.map((p) => ({ x: p.t, y: p.right })),
            color: "#DC2626",
            dashArray: "6 4",
          },
        ],
      };
    }

    if (pillar === "time") {
      const from = -3;
      const to = 3;
      const data = shiftTestSamples(system, t0, from, to);
      const isTimeInvariant = Math.max(...data.map((p) => Math.abs(p.difference))) < 1e-5;

      return {
        title: `${t('signals.timeInvarianceTest', 'Time Invariance Test')} — ${isTimeInvariant ? t('signals.timeInvariantLabel', 'Time-Invariant') : t('signals.timeVariantLabel', 'Time-Variant')}`,
        xLabel: "t\\text{ (s)}",
        yLabel: "y(t)",
        series: [
          {
            id: "shifted-input",
            katexName: "T\\{x(t - t_0)\\}",
            data: data.map((p) => ({ x: p.t, y: p.left })),
            color: "#2563EB",
          },
          {
            id: "shifted-output",
            katexName: "y(t - t_0)",
            data: data.map((p) => ({ x: p.t, y: p.right })),
            color: "#DC2626",
            dashArray: "6 4",
          },
        ],
      };
    }

    if (pillar === "causality") {
      const from = -3;
      const to = 3;
      const input = x2;
      const count = 260;
      const inputData: Array<{ x: number; y: number }> = [];
      const outputData: Array<{ x: number; y: number }> = [];

      for (let i = 0; i <= count; i++) {
        const t = from + ((to - from) * i) / count;
        inputData.push({ x: t, y: input(t) });
        outputData.push({ x: t, y: evaluateSystem(system, input, t) });
      }

      return {
        title: `${t('signals.causalityTest', 'Causality Test')} — ${verdictLabel(verdict)}`,
        xLabel: "t\\text{ (s)}",
        yLabel: "y(t)",
        series: [
          {
            id: "output",
            katexName: "y(t)",
            data: outputData,
            color: "#2563EB",
          },
          {
            id: "input",
            katexName: "x(t)",
            data: inputData,
            color: "#DC2626",
            dashArray: "4 4",
          },
        ],
      };
    }

    // Memory / Dynamicity test
    const from = -3;
    const to = 3;
    const input = x2;
    const count = 260;
    const inputData: Array<{ x: number; y: number }> = [];
    const outputData: Array<{ x: number; y: number }> = [];

    for (let i = 0; i <= count; i++) {
      const t = from + ((to - from) * i) / count;
      inputData.push({ x: t, y: input(t) });
      outputData.push({ x: t, y: evaluateSystem(system, input, t) });
    }

    return {
      title: `${t('signals.memoryTest', 'Memory Test')} — ${verdictLabel(verdict)}`,
      xLabel: "t\\text{ (s)}",
      yLabel: "y(t)",
      series: [
        {
          id: "output",
          katexName: "y(t)",
          data: outputData,
          color: "#2563EB",
        },
        {
          id: "input",
          katexName: "x(t)",
          data: inputData,
          color: "#DC2626",
          dashArray: "4 4",
        },
      ],
    };
  }, [a, b, pillar, system, t0, t]);

  return (
    <StandardStepPlot
      title={title}
      series={series}
      height={210}
      xLabelKatex={xLabel}
      yLabelKatex={yLabel}
      forceBipolar
      showLegend
    />
  );
}

export default SystemProofCanvas;
