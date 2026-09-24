import React from "react";
import { StandardStepPlot as BaseStandardStepPlot } from "@/features/control-systems/ui/plots/StandardStepPlot";
import type {
  StandardStepPlotProps,
  PlotPoint,
  PlotSeries,
} from "@/features/control-systems/ui/plots/types";

export type { StandardStepPlotProps, PlotPoint, PlotSeries };

/**
 * StandardStepPlot — Canonical time-domain waveform & step response scope template.
 * Standardizes 1-quadrant vs 2-quadrant auto-scaling, brand blue (#2563EB) primary trace,
 * floating HUD tracking tooltip, and integrated metric targets.
 */
export function StandardStepPlot(props: StandardStepPlotProps) {
  return <BaseStandardStepPlot {...props} />;
}

export default StandardStepPlot;
