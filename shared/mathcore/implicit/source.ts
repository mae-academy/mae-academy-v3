/**
 * Serializable form of an implicit item's F, for strip Workers (STEPS.md §7.1 technique 4). Closures cannot be posted
 * to a Worker, so the strip Worker compiles the same expression with the same variable order and environment.
 * Kept apart from the graph engine so the strip Worker bundle holds only the compiler and the field code.
 */
import type { Expr } from "../ast/expr";
import type { FunctionDef } from "../compile/compile";
import { compile } from "../compile/compile";

export interface ImplicitSource {
  F: Expr;
  /** x, y, then the environment names in the engine's order. */
  variables: string[];
  env: number[];
  functions: Array<[string, FunctionDef]>;
}

/** F(x, y) from its source: compiled once (compile cache by expression), environment bound. */
export function bindImplicit(src: ImplicitSource): (x: number, y: number) => number {
  const c = compile(src.F, { variables: src.variables, functions: new Map(src.functions) });
  const buf = new Float64Array(src.variables.length);
  buf.set(src.env, 2);
  return (x, y) => {
    buf[0] = x;
    buf[1] = y;
    return c.evaluate(buf);
  };
}
