/** Message protocol between the plot runner (main thread) and plot.worker.ts. Shared types only. */

/** Loading stages, in order. `rendering` means the user script is running (the execution timeout starts there). */
export type PlotStage = "runtime" | "numpy" | "matplotlib" | "scipy" | "rendering";

export const PLOT_STAGES: readonly PlotStage[] = ["runtime", "numpy", "matplotlib", "scipy", "rendering"];

export type PlotErrorKind =
  /** Refused before execution (forbidden import, name, dunder access, size). Nothing ran. */
  | "rejected"
  /** The script raised, or did not produce a figure. */
  | "python"
  /** The figure is larger than the limits. */
  | "limit"
  /** The script ran longer than the timeout; the worker was terminated. */
  | "timeout"
  /** Pyodide or a package could not be downloaded. */
  | "load"
  | "internal";

export interface PlotLineSummary {
  label: string;
  linestyle: string;
  color: string;
  points: number;
  /** Only with `debug`: the plotted data (capped), for numeric checks. */
  x?: number[];
  y?: number[];
}

export interface PlotAxesSummary {
  title: string;
  xlabel: string;
  ylabel: string;
  lines: PlotLineSummary[];
  legend: string[];
  xlim: [number, number];
  ylim: [number, number];
  grid: boolean;
  gridLinestyle: string;
  /** Axes position in figure fractions: left, bottom, width, height. */
  position: [number, number, number, number];
  titleSize: number;
  labelSize: number;
}

export interface PlotSummary {
  axes: PlotAxesSummary[];
  suptitle: string;
  figsize: [number, number];
}

export interface PlotRequest {
  type: "run";
  id: number;
  code: string;
  /** Test hook: include the plotted data in the summary. */
  debug?: boolean;
}

export type PlotResponse =
  | { type: "progress"; id: number; stage: PlotStage }
  | {
      type: "result";
      id: number;
      png: ArrayBuffer;
      width: number;
      height: number;
      dpi: number;
      summary: PlotSummary;
      warnings: string[];
    }
  | { type: "error"; id: number; kind: PlotErrorKind; message: string; line?: number };

export interface PlotResult {
  png: Uint8Array;
  width: number;
  height: number;
  dpi: number;
  summary: PlotSummary;
  warnings: string[];
}

export class PlotError extends Error {
  constructor(
    readonly kind: PlotErrorKind,
    message: string,
    readonly line?: number,
  ) {
    super(message);
    this.name = "PlotError";
  }
}

export const PLOT_DPI = 300;
export const PLOT_MAX_CODE_CHARS = 20_000;
export const PLOT_MAX_CODE_LINES = 600;
export const PLOT_MAX_PNG_BYTES = 8 * 1024 * 1024;
export const PLOT_MAX_FIGURE_INCHES = 20;
export const PLOT_TIMEOUT_MS = 30_000;
