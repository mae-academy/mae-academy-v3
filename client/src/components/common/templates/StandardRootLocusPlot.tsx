import React from "react";
import { ComplexPlanePlot } from "@/features/control-systems/ui/plots/ComplexPlanePlot";
import type {
  ComplexPlanePlotProps,
  ComplexCoordinate,
  AsymptoteSpec,
} from "@/features/control-systems/ui/plots/types";

export type StandardRootLocusPlotProps = ComplexPlanePlotProps;
export type { ComplexCoordinate, AsymptoteSpec };

/**
 * StandardRootLocusPlot — Canonical S-Plane complex root locus vector plot.
 * Standardizes complex axes crossing at (0, 0), asymptotic lines, breakaway markers,
 * pole (x) and zero (o) vector rendering, and isolated Apple-style floating HUD tooltip.
 */
export function StandardRootLocusPlot(props: StandardRootLocusPlotProps) {
  return <ComplexPlanePlot {...props} />;
}

export default StandardRootLocusPlot;
