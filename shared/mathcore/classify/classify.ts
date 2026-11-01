/**
 * Smart input classification (Part D). Every statement is exactly one of: slider, input variable, function definition,
 * constant matrix, output, or unknown. The class comes from what the existing parser/inference decided (`kind`) plus the
 * shape of the text; nothing here guesses. When the text allows more than one reading, `options` lists them and the
 * page shows a chip so the reader chooses; until then `class` is the stated default.
 * Pure: no DOM, no engine. The page passes the engine's `kind` and whether the scalar is a literal.
 */

export type StatementClass = "slider" | "input" | "function" | "matrix" | "output" | "unknown";

/** A way to read an unclear statement; `id` is stored by the page and applied by it. */
export type Interpretation = "slider" | "constant" | "input" | "line";

export interface Classification {
  class: StatementClass;
  /** Name defined by the statement (slider, function or matrix name), when there is one. */
  name?: string;
  /** Present when the statement can be read more than one way: the default is `options[0]`. */
  options?: Interpretation[];
  /** i18n key suffix under `classify.` explaining the class. */
  reason: string;
}

/** Variables that belong to curves, not to the reader's own definitions (Part D: x and t). */
export const INPUT_VARIABLES: ReadonlySet<string> = new Set(["x", "t"]);

const NAME = String.raw`([A-Za-z](?:_\{?[A-Za-z0-9]+\}?)?)`;
const NUMBER = String.raw`[-+]?\s*(?:\d+\.?\d*|\.\d+)`;
const ASSIGN_NUMBER = new RegExp(String.raw`^\s*${NAME}\s*=\s*(${NUMBER})\s*$`);

/** `name = number` → the name (and the number), else null. */
export function parseNumberAssignment(latex: string): { name: string; value: number } | null {
  const m = ASSIGN_NUMBER.exec(latex);
  if (!m) return null;
  return { name: m[1], value: Number(m[2].replace(/\s+/g, "")) };
}

export function classifyStatement(latex: string, kind: string | undefined): Classification {
  const assign = parseNumberAssignment(latex);
  if (assign && INPUT_VARIABLES.has(assign.name)) {
    // `x = 3` is a vertical line for the engine; `t = 2` cannot be drawn. Both names are input variables: say so.
    return assign.name === "x"
      ? { class: "output", name: assign.name, options: ["line", "input"], reason: "xAssigned" }
      : { class: "input", name: assign.name, options: ["input", "slider"], reason: "tAssigned" };
  }
  switch (kind) {
    case "Scalar": {
      if (assign) {
        // A capital letter is usually a matrix or a constant of the problem, a lowercase one a parameter: ask for capitals.
        const capital = /^[A-Z]/.test(assign.name);
        return { class: "slider", name: assign.name, options: capital ? ["slider", "constant"] : undefined, reason: capital ? "capitalScalar" : "slider" };
      }
      return { class: "output", reason: "definedValue" };
    }
    case "FunctionDef":
      return { class: "function", name: /^\s*([A-Za-z](?:_\{?\w+\}?)?)\s*\(/.exec(latex)?.[1], reason: "function" };
    case "Matrix2":
    case "Matrix3": {
      const named = new RegExp(String.raw`^\s*${NAME}\s*=`).exec(latex);
      return named ? { class: "matrix", name: named[1], reason: "matrix" } : { class: "output", reason: "matrixLiteral" };
    }
    case "Unknown":
      return { class: "unknown", reason: "unknown" };
    case undefined:
      return { class: "unknown", reason: "pending" };
    default:
      return { class: "output", reason: "output" };
  }
}

/** The interpretation in force: the reader's choice if it is one of the options, else the default (first option). */
export function effectiveInterpretation(c: Classification, chosen: Interpretation | undefined): Interpretation | undefined {
  if (!c.options) return undefined;
  return chosen && c.options.includes(chosen) ? chosen : c.options[0];
}
