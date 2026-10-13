/** Docs topics map 1:1 to studios; a topic may hold several tool docs (one per segmented control option). */
export type SimulationDocsTopic = "circuits" | "signals" | "control" | "fluid" | "logic" | "plc" | "arduino" | "powerElectronics" | "codeStudio";

/** One worked-example step. `text` is prose with inline `$...$` math; `tex` is an optional display equation. */
export interface ToolDocStep {
  text: string;
  tex?: string;
}

/**
 * Localized documentation for ONE segmented-control tool. Every string may contain inline `$...$` math
 * (and `$$...$$` display math); see `RichMathText`. Equations themselves live in `toolDocs/equations/<topic>.ts`,
 * paired by index with `equations` captions.
 */
export interface ToolDoc {
  title: string;
  intro: string;
  /** Section 1: what the tool visualizes / models / executes. */
  purpose: string;
  /** Section 2: the mathematical model, as headed prose paragraphs. */
  model: { heading: string; body: string }[];
  /** One caption per entry in the tool's equation list. */
  equations: string[];
  /** Section 3: canvas parameter and control mapping. */
  mapping: { term: string; body: string }[];
  /** Section 4: fully worked numerical example. */
  example: { title: string; problem: string; steps: ToolDocStep[]; result: string };
  /** Section 5: industrial / mechatronic applications. */
  applications: { field: string; body: string }[];
}

export type ToolDocsFile = Record<string, ToolDoc>;
export type ToolEquationsFile = Record<string, string[]>;
