/**
 * Unified Engineering SVG Plotting Standard — Public Platform Exports
 * Reusable across Control Systems, Arduino Studio, Power Electronics, and Future Engineering Studios.
 */

// Plot Components
export { ComplexPlanePlot } from "./ComplexPlanePlot";
export { StandardStepPlot } from "./StandardStepPlot";
export { BodeMagnitudePlot, type BodeMagnitudePlotProps } from "./BodeMagnitudePlot";
export { BodePhasePlot, type BodePhasePlotProps } from "./BodePhasePlot";
export { BodePlot, type BodePlotProps } from "./BodePlot";
export { NyquistPlot, type NyquistPlotProps, type NyquistPoint } from "./NyquistPlot";
export { NicholsPlot, type NicholsPlotProps, type NicholsPoint } from "./NicholsPlot";

// Core Plotting Contracts & Types
export type {
  ComplexPlanePlotProps,
  StandardStepPlotProps,
  PlotSeries,
  PlotPoint,
  ComplexCoordinate,
  AsymptoteSpec,
} from "./types";

// Shared Decade Scaling & Coordinate Utilities
export {
  DECADE_STEPS,
  findClosestDecadeStep,
  getNextDecadeStep,
  getPrevDecadeStep,
  formatStepDisplay,
  formatTickNumber,
  formatRealTick,
  getAlignedGridTicks,
} from "./grid-utils";

// Full re-export of types for complete backward compatibility
export * from "./types";
