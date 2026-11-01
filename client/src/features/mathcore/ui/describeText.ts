/** Localized sentence for a curve description (STEPS.md §4 Accessibility, ADR-13). */
import type { TFunction } from "i18next";
import type { CurveDescription } from "@shared/mathcore/describe/describe";
import type { MatrixAnalysis, SystemAnalysis } from "@shared/mathcore/linalg/analyze";
import { numberText } from "@shared/mathcore/linalg/format";

const spoken = numberText;

/** Sentence for a matrix or a linear system (the canvas picture says the same: orientation, eigenvalues, solution). */
export function describeLinalg(
  t: TFunction<"mathcore">,
  label: string,
  r: { type: "matrix"; analysis: MatrixAnalysis } | { type: "system"; analysis: SystemAnalysis },
): string {
  if (r.type === "system") {
    const s = r.analysis.solution;
    if (s.kind === "none") return t("describe.systemNone", { label });
    if (s.kind === "infinite") return t("describe.systemInfinite", { label });
    const solution = s.values.map((v, i) => `${r.analysis.unknowns[i]} = ${spoken(v)}`).join(", ");
    return t("describe.systemUnique", { label, solution });
  }
  const a = r.analysis;
  const orientation = t(`linalg.orientation_${a.det.singular ? "singular" : a.det.sign > 0 ? "kept" : "reversed"}`);
  const eigen = a.eigen.values
    .map((v) => (v.im === 0 ? spoken(v.re) : `${spoken(v.re)} ${v.im > 0 ? "+" : "−"} ${spoken(Math.abs(v.im))}i`))
    .join(", ");
  return t("describe.matrix", { label, det: spoken(a.det.value), orientation, eigen });
}

export function describeItem(t: TFunction<"mathcore">, label: string, d: CurveDescription): string {
  if (d.shaded !== undefined) {
    // Inequality: say how much is shaded first (the region may fill the view while its boundary is off-screen).
    // "All" and "none" only when exact; otherwise 1–99 %, so a nearly full view is not called full.
    const percent = Math.min(99, Math.max(1, Math.round(d.shaded * 100)));
    const region =
      d.shaded === 1 ? t("describe.regionAll", { label }) : d.shaded === 0 ? t("describe.regionNone", { label }) : t("describe.region", { label, percent });
    return d.extent ? `${region}; ${t("describe.boundary", { ...d.extent })}.` : `${region}.`;
  }
  if (d.pieces === 0) return t("describe.hidden", { label });
  if (d.extent) {
    return t("describe.extent", { label, count: d.pieces, ...d.extent }) + ".";
  }
  if (d.domain.length === 0) return t("describe.hidden", { label });
  const parts = [
    t("describe.pieces", { label, count: d.pieces, from: d.domain[0][0], to: d.domain[d.domain.length - 1][1] }),
    d.zeros.length ? t("describe.zeros", { list: d.zeros.join(", ") }) : t("describe.noZeros"),
  ];
  const fmt = (type: "max" | "min") =>
    d.extrema
      .filter((e) => e.type === type)
      .map((e) => `(${e.x}, ${e.y})`)
      .join(", ");
  if (fmt("max")) parts.push(t("describe.maxima", { list: fmt("max") }));
  if (fmt("min")) parts.push(t("describe.minima", { list: fmt("min") }));
  return parts.join("; ") + ".";
}
