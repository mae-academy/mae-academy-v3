/** Localized sentence for a curve description (STEPS.md §4 Accessibility, ADR-13). */
import type { TFunction } from "i18next";
import type { CurveDescription } from "@shared/mathcore/describe/describe";

export function describeItem(t: TFunction<"mathcore">, label: string, d: CurveDescription): string {
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
