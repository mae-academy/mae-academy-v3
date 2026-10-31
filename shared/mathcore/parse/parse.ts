/**
 * LaTeX → core expression. Compute Engine is injected (`RawParser`) so this module never imports it: the client
 * loads Compute Engine lazily inside the parse Worker (ADR-1, ADR-11, ADR-12).
 */
import type { Expr } from "../ast/expr";
import { nodeCount } from "../ast/expr";
import { MAX_EXPR_NODES, MAX_LATEX_LENGTH } from "../constants";
import type { NormalizeContext } from "../normalize/normalize";
import { hasInvalid, normalizeStatement } from "../normalize/normalize";
import type { ErrorKey, ErrorParams } from "../errors";

/** `(latex) => ce.parse(latex, { form: "raw" }).json` (owner decision Q1). */
export type RawParser = (latex: string) => unknown;

export interface ParseError {
  message: string;
  /** Catalog key and params: the page shows the translation of `errors.<key>`; `message` is the English text. */
  key?: ErrorKey;
  params?: ErrorParams;
  /** Character offset in the LaTeX source, when the fragment could be located. */
  start?: number;
  end?: number;
}

export type ParseResult = { ok: true; expr: Expr; nodes: number } | { ok: false; errors: ParseError[] };

export function parseLatex(latex: string, parser: RawParser, ctx: NormalizeContext = {}): ParseResult {
  if (latex.length > MAX_LATEX_LENGTH) {
    return { ok: false, errors: [{ message: `Expression is longer than ${MAX_LATEX_LENGTH} characters`, key: "tooLong", params: { max: MAX_LATEX_LENGTH } }] };
  }
  if (latex.trim() === "") return { ok: false, errors: [{ message: "Empty expression", key: "emptyExpression" }] };
  let raw: unknown;
  try {
    raw = parser(latex);
  } catch (err) {
    // The parser's own message (a crash, a timeout in the parse Worker, or the parser being unavailable).
    return { ok: false, errors: [{ message: err instanceof Error ? err.message : String(err) }] };
  }
  const { expr, errors } = normalizeStatement(raw, ctx);
  if (errors.length > 0 || hasInvalid(expr)) {
    const list = errors.length > 0 ? errors : [{ message: "Invalid expression", key: "invalidExpression" as const }];
    return {
      ok: false,
      errors: list.map((e) => {
        const at = e.fragment ? latex.indexOf(e.fragment) : -1;
        const keyed = e.key ? { key: e.key, params: e.params ?? {} } : {};
        return at >= 0 ? { message: e.message, ...keyed, start: at, end: at + (e.fragment?.length ?? 0) } : { message: e.message, ...keyed };
      }),
    };
  }
  const nodes = nodeCount(expr);
  if (nodes > MAX_EXPR_NODES) {
    return { ok: false, errors: [{ message: `Expression has ${nodes} nodes; the limit is ${MAX_EXPR_NODES}`, key: "nodeLimit", params: { nodes, max: MAX_EXPR_NODES } }] };
  }
  return { ok: true, expr, nodes };
}
