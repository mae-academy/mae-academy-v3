/**
 * Unified Engineering SVG Plotting Standard — TypeScript Definitions
 * Reusable across Control Systems, Arduino Studio, Electrical Circuits, and Future Studios.
 */

export interface PlotPoint {
  x: number;
  y: number;
  metadata?: Record<string, any>;
}

export interface PlotSeries {
  id: string;
  katexName: string; // e.g. "y(t)", "r(t)", "e(t)"
  data: PlotPoint[];
  color: string;
  unit?: string;
  dashArray?: string;
  strokeWidth?: number;
}

export interface StandardStepPlotProps {
  xLabelKatex?: string;
  yLabelKatex?: string;
  series: PlotSeries[];
  height?: number | string;
  forceBipolar?: boolean; // Forces 2-quadrant display
  showLegend?: boolean;
  className?: string;
  title?: string;
  headerRight?: React.ReactNode;
  steadyStateValue?: number;
  showSteadyState?: boolean;
}

export interface ComplexCoordinate {
  re: number;
  im: number;
  k?: number;
}

export interface AsymptoteSpec {
  angleDeg: number;
  centroid: number;
}

export interface ComplexPlanePlotProps {
  poles: { re: number; im: number }[];
  zeros: { re: number; im: number }[];
  locusBranches?: { re: number; im: number; k: number }[][];
  height?: number | string;
  interactive?: boolean; // Pan/zoom enabled
  currentRoots?: { re: number; im: number }[];
  breakawayPoints?: number[];
  asymptotes?: AsymptoteSpec[];
  imagCrossings?: { k: number; omega: number }[];
  gridMode?: 'cartesian' | 'polar';
  onGridModeChange?: (mode: 'cartesian' | 'polar') => void;
  highlightedStep?: string | null;
  className?: string;
  title?: string;
  reLabelKatex?: string;
  imLabelKatex?: string;
  onPointHover?: (info: { s: ComplexCoordinate; wn: number; zeta: number; k?: number } | null) => void;
}
