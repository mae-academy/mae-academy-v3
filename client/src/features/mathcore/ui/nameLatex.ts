/** LaTeX for a symbol name as the engine reports it: `x_0` → `x_{0}`, `alpha` → `\alpha`, `Rot` → `\mathrm{Rot}`. */
export function nameLatex(name: string): string {
  const [base, sub] = name.split("_");
  const GREEK = new Set(["alpha", "beta", "gamma", "delta", "theta", "lambda", "mu", "nu", "pi", "phi", "omega", "sigma", "tau", "xi", "rho", "epsilon"]);
  const head = base.length === 1 ? base : GREEK.has(base) ? `\\${base}` : `\\mathrm{${base}}`;
  return sub ? `${head}_{${sub.replace(/[{}]/g, "")}}` : head;
}
