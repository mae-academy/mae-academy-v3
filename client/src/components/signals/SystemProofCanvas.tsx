/**
 * MAE Academy / Signals & Systems — Tab B System Properties Verification.
 * Canonical vector SVG implementation consuming StandardStepPlot template.
 */
import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { StandardStepPlot } from "@/components/common/templates/StandardStepPlot";
import type { PillarId, SystemSemantic } from "@shared/signals/results";
import { classifyProofRemote } from "@/services/signalsClient";
import { useRemoteQuery } from "@/lib/useRemoteQuery";

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
  // The pillar test (verdict + the sampled proof curves) is produced by the serverless engine; the last answer stays plotted while a newer one loads.
  const proof = useRemoteQuery(`${system.source}|${pillar}|${a}|${b}|${t0}`, (signal) => classifyProofRemote(system.source, pillar, a, b, t0, signal), { debounceMs: 50 }).data;
  const { series, title, xLabel, yLabel } = useMemo(() => {
    const verdict = proof?.verdict ?? "";
    const empty = { title: "", xLabel: "t\\text{ (s)}", yLabel: "y(t)", series: [] as Array<{ id: string; katexName: string; data: Array<{ x: number; y: number }>; color: string; dashArray?: string }> };
    if (!proof) return empty;

    if (pillar === "stability") {
      const points = proof.stability ?? [];
      const isUnstable = verdict === "Unstable";
      return {
        title: `${t('signals.bipoStabilityTest', 'BIBO Stability Test')} — ${isUnstable ? t('signals.unstableDivergent', 'Unstable / Divergent') : t('signals.stableBounded', 'Stable / Bounded')}`,
        xLabel: "t\\text{ (s)}",
        yLabel: "y(t)",
        series: [
          { id: "output", katexName: "y(t)", data: points.map((p) => ({ x: p.t, y: p.output })), color: "#2563EB" },
          { id: "input", katexName: "x(t)\\text{ (bounded)}", data: points.map((p) => ({ x: p.t, y: p.input })), color: "#DC2626", dashArray: "5 5" },
        ],
      };
    }

    if (pillar === "linearity") {
      const data = proof.samples ?? [];
      const isLinear = Math.max(...data.map((p) => Math.abs(p.difference))) < 1e-5;
      return {
        title: `${t('signals.linearSuperpositionTest', 'Linear Superposition Test')} — ${isLinear ? t('signals.linearCoincident', 'Linear (Coincident)') : t('signals.nonLinearSeparated', 'Non-Linear (Separated)')}`,
        xLabel: "t\\text{ (s)}",
        yLabel: "y(t)",
        series: [
          { id: "left", katexName: "T\\{a x_1 + b x_2\\}", data: data.map((p) => ({ x: p.t, y: p.left })), color: "#2563EB" },
          { id: "right", katexName: "a T\\{x_1\\} + b T\\{x_2\\}", data: data.map((p) => ({ x: p.t, y: p.right })), color: "#DC2626", dashArray: "6 4" },
        ],
      };
    }

    if (pillar === "time") {
      const data = proof.samples ?? [];
      const isTimeInvariant = Math.max(...data.map((p) => Math.abs(p.difference))) < 1e-5;
      return {
        title: `${t('signals.timeInvarianceTest', 'Time Invariance Test')} — ${isTimeInvariant ? t('signals.timeInvariantLabel', 'Time-Invariant') : t('signals.timeVariantLabel', 'Time-Variant')}`,
        xLabel: "t\\text{ (s)}",
        yLabel: "y(t)",
        series: [
          { id: "shifted-input", katexName: "T\\{x(t - t_0)\\}", data: data.map((p) => ({ x: p.t, y: p.left })), color: "#2563EB" },
          { id: "shifted-output", katexName: "y(t - t_0)", data: data.map((p) => ({ x: p.t, y: p.right })), color: "#DC2626", dashArray: "6 4" },
        ],
      };
    }

    // Causality and memory tests plot the system's response to the engine's test input.
    const io = proof.io ?? [];
    return {
      title: `${pillar === "causality" ? t('signals.causalityTest', 'Causality Test') : t('signals.memoryTest', 'Memory Test')} — ${verdictLabel(verdict)}`,
      xLabel: "t\\text{ (s)}",
      yLabel: "y(t)",
      series: [
        { id: "output", katexName: "y(t)", data: io.map((p) => ({ x: p.t, y: p.output })), color: "#2563EB" },
        { id: "input", katexName: "x(t)", data: io.map((p) => ({ x: p.t, y: p.input })), color: "#DC2626", dashArray: "4 4" },
      ],
    };
  }, [pillar, proof, t]);

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
