/**
 * Operations on a named matrix typed as an expression: `\det(A)`, `A^{-1}`, `A^T`, eigenvalues. The numbers already
 * exist in the matrix report (exact determinant, Gauss-Jordan inverse, eigenvalues); this only reads them. An operation
 * the engine does not have says so (Part D: "nothing is guessed").
 */
import type { MatrixAnalysis } from "@shared/mathcore/linalg/analyze";

export type MatrixOpKind = "det" | "inverse" | "transpose" | "eigenvalues";
export interface MatrixOp {
  op: MatrixOpKind;
  name: string;
}

const NAME = String.raw`([A-Z](?:_\{?\w+\}?)?)`;
const FORMS: ReadonlyArray<[MatrixOpKind, RegExp]> = [
  ["det", new RegExp(String.raw`^\s*\\(?:det|operatorname\{det\}|mathrm\{det\})\s*(?:\\left)?\(?\s*${NAME}\s*(?:\\right)?\)?\s*$`)],
  ["inverse", new RegExp(String.raw`^\s*${NAME}\s*\^\s*\{?\s*-\s*1\s*\}?\s*$`)],
  ["transpose", new RegExp(String.raw`^\s*${NAME}\s*\^\s*\{?\s*(?:T|\\top|\\mathrm\{T\}|\\intercal)\s*\}?\s*$`)],
  ["eigenvalues", new RegExp(String.raw`^\s*\\(?:operatorname|mathrm)\{(?:eig|eigenvalues)\}\s*(?:\\left)?\(\s*${NAME}\s*(?:\\right)?\)\s*$`)],
];

export function parseMatrixOp(latex: string): MatrixOp | null {
  for (const [op, re] of FORMS) {
    const m = re.exec(latex);
    if (m) return { op, name: m[1] };
  }
  return null;
}

export type MatrixOpResult =
  | { ok: true; latex: string }
  | { ok: false; reason: "notMatrix" | "transpose" | "singular" };

export function matrixOpResult(op: MatrixOp, analysis: MatrixAnalysis | null): MatrixOpResult {
  if (op.op === "transpose") return { ok: false, reason: "transpose" };
  if (!analysis) return { ok: false, reason: "notMatrix" };
  switch (op.op) {
    case "det":
      return { ok: true, latex: `\\det ${analysis.name} = ${analysis.det.latex}` };
    case "inverse":
      return analysis.inverse.result ? { ok: true, latex: `${analysis.name}^{-1} = ${analysis.inverse.result}` } : { ok: false, reason: "singular" };
    case "eigenvalues":
      return { ok: true, latex: analysis.eigen.latex.map((l) => `\\lambda = ${l}`).join(",\\; ") };
  }
}

/** Entries of a named numeric matrix line for the matrix editor; null when the line is not `A = [[…]]`. */
export function parseMatrixLine(latex: string): { name: string; rows: string[][] } | null {
  const m = /^\s*([A-Za-z](?:_\{?\w+\}?)?)\s*=\s*\\begin\{(?:b|p)?matrix\}([\s\S]*)\\end\{(?:b|p)?matrix\}\s*$/.exec(latex);
  if (!m) return null;
  const rows = m[2].split(/\\\\/).map((r) => r.trim()).filter((r) => r.length > 0).map((r) => r.split("&").map((c) => c.trim()));
  if (rows.length === 0 || rows.some((r) => r.length !== rows[0].length)) return null;
  return { name: m[1], rows };
}

export function buildMatrixLine(name: string, rows: readonly (readonly string[])[]): string {
  return `${name}=\\begin{bmatrix}${rows.map((r) => r.join("&")).join("\\\\")}\\end{bmatrix}`;
}
