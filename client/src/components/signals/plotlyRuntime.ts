/**
 * MAE Academy / Signals & Systems — shared Plotly GL3D runtime loader.
 * The Tab D waterfall and Tab E landscape previously injected a script tag pointing at
 * `/manus-storage/plotly-gl3d-2.12.1.min_*.js`, an asset absent from the repository, so both
 * 3D surfaces resolved to a permanent spinner. The bundle is now a real dependency and is
 * code-split through a dynamic import, keeping it out of the initial payload.
 */
export type PlotlyRuntime = {
  react: (root: HTMLDivElement, traces: unknown[], layout: unknown, config: unknown) => Promise<unknown>;
  purge: (root: HTMLDivElement) => void;
  Plots: { resize: (root: HTMLDivElement) => void };
};

let runtime: Promise<PlotlyRuntime> | null = null;

export function loadPlotlyGl3d(): Promise<PlotlyRuntime> {
  runtime ??= import("plotly.js-gl3d-dist-min").then((module) => (module.default ?? module) as unknown as PlotlyRuntime);
  return runtime;
}
