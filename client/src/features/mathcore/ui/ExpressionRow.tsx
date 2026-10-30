/**
 * One line of the expression list: a MathLive field (the app's MathLive loader, STEPS.md §3 reuse) with the item's
 * color, error and value. Falls back to a plain LaTeX text field if MathLive cannot load.
 */
import { Suspense, lazy, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { MATH_FIELD_TAG, loadMathLive } from "@/components/ai/mathliveLoader";
import { MAX_LATEX_LENGTH } from "@shared/mathcore/constants";
import { NS } from "../i18n/register";
import type { ItemResult } from "../workers/protocol";

/** KaTeX and the report load only when a matrix or system is on the page. */
const LinalgPanel = lazy(() => import("./LinalgPanel"));

interface MathFieldElement extends HTMLElement {
  value: string;
}

export interface ExpressionRowProps {
  index: number;
  latex: string;
  color: string;
  result?: ItemResult;
  onChange: (latex: string) => void;
  onRemove: () => void;
  onEnter: () => void;
  /** Gauss-Jordan steps start open (`view.showSteps`). */
  showSteps?: boolean;
  /** 2D or 3D view (Phase 5): 3×3 items point to the 3D view while the 2D view is shown. */
  mode?: "2d" | "3d";
}

/** Item kinds drawn by a later phase, with that phase (STEPS.md §11). */
const LATER_PHASE: Readonly<Record<string, number>> = { ODE1: 6, RiemannSum: 9, Distribution: 10 };

export function ExpressionRow({ index, latex, color, result, onChange, onRemove, onEnter, showSteps = false, mode = "2d" }: ExpressionRowProps) {
  const { t } = useTranslation(NS);
  const host = useRef<HTMLDivElement>(null);
  const field = useRef<MathFieldElement | null>(null);
  const [mathLive, setMathLive] = useState<"loading" | "ready" | "failed">("loading");
  const onChangeRef = useRef(onChange);
  const onEnterRef = useRef(onEnter);
  useEffect(() => {
    onChangeRef.current = onChange;
    onEnterRef.current = onEnter;
  });

  useEffect(() => {
    let cancelled = false;
    void loadMathLive().then((ok) => {
      if (cancelled) return;
      setMathLive(ok ? "ready" : "failed");
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (mathLive !== "ready" || !host.current || field.current) return;
    const el = document.createElement(MATH_FIELD_TAG) as MathFieldElement;
    el.setAttribute("aria-label", t("expressionLabel", { n: index + 1 }));
    el.setAttribute("dir", "ltr");
    el.className = "mc-mathfield";
    el.value = latex;
    el.addEventListener("input", () => onChangeRef.current(el.value.slice(0, MAX_LATEX_LENGTH)));
    el.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        onEnterRef.current();
      }
    });
    host.current.appendChild(el);
    field.current = el;
    // latex, index and t are only the initial values; later changes are synced by the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mathLive]);

  useEffect(() => {
    if (field.current && field.current.value !== latex) field.current.value = latex;
  }, [latex]);

  const errors = result?.errors ?? [];
  const later = result ? LATER_PHASE[result.kind] : undefined;
  return (
    <li className="mc-row" data-invalid={errors.length > 0 || undefined}>
      <span className="mc-swatch" style={{ background: color }} aria-hidden />
      <div className="mc-row-body">
        <div ref={host} className="mc-input" dir="ltr">
          {mathLive !== "ready" && (
            <input
              className="mc-text-input"
              dir="ltr"
              value={latex}
              maxLength={MAX_LATEX_LENGTH}
              aria-label={t("expressionLabel", { n: index + 1 })}
              placeholder={t("placeholder")}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onEnter()}
            />
          )}
        </div>
        {result?.value !== undefined && Number.isFinite(result.value) && (
          <div className="mc-value" dir="ltr">{t("value_is", { value: formatValue(result.value) })}</div>
        )}
        {errors.map((e, i) => (
          <div key={i} className="mc-error" role="alert">
            {e.message}
            {e.start !== undefined && (
              <code dir="ltr" className="mc-error-at">
                {latex.slice(e.start, e.end)}
              </code>
            )}
          </div>
        ))}
        {errors.length === 0 && later !== undefined && <div className="mc-note">{t("notYet", { kind: result?.kind, phase: later })}</div>}
        {result?.warnings.map((w, i) => (
          <div key={`w${i}`} className="mc-note">
            {t("kindWarning", { message: w })}
          </div>
        ))}
        {result?.precisionWarning && <div className="mc-note">{t("precision")}</div>}
        {errors.length === 0 && result?.linalg && (
          <Suspense fallback={<div className="mc-note">{t("linalg.loading")}</div>}>
            <LinalgPanel report={result.linalg} showSteps={showSteps} mode={mode} />
          </Suspense>
        )}
      </div>
      <button type="button" className="mc-icon-button" onClick={onRemove} aria-label={t("removeExpression", { n: index + 1 })}>
        ×
      </button>
    </li>
  );
}

/** Values shown in the list: up to 10 significant digits, no float noise. */
export function formatValue(v: number): string {
  if (!Number.isFinite(v)) return String(v);
  const r = Number(v.toPrecision(10));
  return Math.abs(r) >= 1e10 || (Math.abs(r) < 1e-6 && r !== 0) ? r.toExponential(6) : String(r);
}
