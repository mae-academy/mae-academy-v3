/**
 * One line of the expression list: a MathLive field (the app's MathLive loader, STEPS.md §3 reuse) with the item's
 * color picker, its class (slider / input variable / function / constant matrix / output / unknown), error and value,
 * all typeset with KaTeX (Part D). Falls back to a plain LaTeX text field if MathLive cannot load.
 * Keyboard (Part E): ↑/↓ leave the field for the previous/next expression when the caret has nowhere to go inside it,
 * Enter adds a row below (and focuses it), Escape leaves the field and focuses the row.
 */
import { Component, Suspense, lazy, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { MATH_FIELD_TAG, loadMathLive } from "@/components/ai/mathliveLoader";
import { MAX_LATEX_LENGTH } from "@shared/mathcore/constants";
import type { Classification, Interpretation } from "@shared/mathcore/classify/classify";
import { fractionLatex, nearFraction } from "@shared/mathcore/classify/derive";
import { NS } from "../i18n/register";
import type { ItemResult } from "../workers/protocol";
import { ColorPicker } from "./ColorPicker";
import { errorMath } from "./errorText";
import { MathLabel, MathMessage } from "./MathLabel";
import { MatrixEditor } from "./MatrixEditor";

/** The matrix report loads only when a matrix or system is on the page. */
const LinalgPanel = lazy(() => import("./LinalgPanel"));

/** A report chunk that fails to load (offline) shows a note in its row instead of taking the page down. */
class PanelBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

interface MathFieldElement extends HTMLElement {
  value: string;
  position: number;
}

/** What the page worked out for a calculus statement (Part D); numbers come from the engine's helper items. */
export type CalcReadout =
  | { kind: "derivative"; fn: string; x0: number | undefined; value: number | undefined; slope: number | undefined }
  | { kind: "integral"; latex: string; value: number | undefined; lower: string; upper: string; missingBounds: boolean };

export interface ExpressionRowProps {
  index: number;
  latex: string;
  /** `item.style.color`: a palette token, `#RRGGBB`, or undefined (default by position). */
  colorId?: string;
  color: string;
  result?: ItemResult;
  onChange: (latex: string) => void;
  onColor: (id: string) => void;
  onRemove: () => void;
  onEnter: () => void;
  /** Gauss-Jordan steps start open (`view.showSteps`). */
  showSteps?: boolean;
  /** 2D or 3D view (Phase 5): 3×3 items point to the 3D view while the 2D view is shown. */
  mode?: "2d" | "3d";
  classification: Classification;
  /** The interpretation in force for an unclear statement (the first option unless the reader chose another). */
  interpretation?: Interpretation;
  onInterpret: (i: Interpretation) => void;
  calc?: CalcReadout;
  /** Result of a matrix operation line (`\det(A)`, `A^{-1}`, …) or the reason it has none. */
  matrixOp?: { latex?: string; message?: string };
  /** Focus this row's field once it exists (a row just added). */
  autoFocus?: boolean;
  onFocused?: () => void;
}

/** Item kinds drawn by a later phase, with that phase (STEPS.md §11). */
const LATER_PHASE: Readonly<Record<string, number>> = { ODE1: 6, RiemannSum: 9, Distribution: 10 };

const FIELD_SELECTOR = ".mc-mathfield, .mc-text-input";

/** The field of the row `step` places away (−1 previous, +1 next), or null at the ends. */
function siblingField(from: HTMLElement, step: -1 | 1): HTMLElement | null {
  const row = from.closest("li.mc-row");
  const next = step < 0 ? row?.previousElementSibling : row?.nextElementSibling;
  return (next?.querySelector(FIELD_SELECTOR) as HTMLElement | null) ?? null;
}

export function ExpressionRow({
  index, latex, colorId, color, result, onChange, onColor, onRemove, onEnter, showSteps = false, mode = "2d",
  classification, interpretation, onInterpret, calc, matrixOp, autoFocus = false, onFocused,
}: ExpressionRowProps) {
  const { t } = useTranslation(NS);
  const row = useRef<HTMLLIElement>(null);
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

  /** Leave the field: focus goes to the row itself (it is focusable), so arrows keep working from there. */
  const leave = () => {
    (document.activeElement as HTMLElement | null)?.blur?.();
    row.current?.focus();
    // MathLive can take the focus back while it settles its own blur handling; the row keeps it.
    setTimeout(() => {
      if (row.current && document.activeElement !== row.current && document.activeElement?.closest("li.mc-row") === row.current) {
        (document.activeElement as HTMLElement).blur();
        row.current.focus();
      }
    }, 50);
  };

  useEffect(() => {
    if (mathLive !== "ready" || !host.current || field.current) return;
    const el = document.createElement(MATH_FIELD_TAG) as MathFieldElement;
    el.setAttribute("aria-label", t("expressionLabel", { n: index + 1 }));
    el.setAttribute("dir", "ltr");
    el.className = "mc-mathfield";
    el.value = latex;
    el.addEventListener("input", () => onChangeRef.current(el.value.slice(0, MAX_LATEX_LENGTH)));
    // Capture phase: runs before MathLive's own handler, so the caret position before the key is known.
    el.addEventListener(
      "keydown",
      (ev) => {
        const e = ev;
        if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          leave();
        } else if ((e.key === "ArrowUp" || e.key === "ArrowDown") && !e.shiftKey && !e.altKey && !e.ctrlKey && !e.metaKey) {
          const before = el.position;
          const step = e.key === "ArrowUp" ? -1 : 1;
          // MathLive moves inside fractions and powers first; only a key that moved nothing leaves the expression.
          setTimeout(() => {
            if (el.position === before) siblingField(el, step)?.focus();
          }, 0);
        }
      },
      true,
    );
    el.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        onEnterRef.current();
        // The new row's field does not exist for a moment: keys typed meanwhile must not land in this expression.
        leave();
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

  // A row just added (Enter or the add button) takes the keyboard.
  useEffect(() => {
    if (!autoFocus || mathLive === "loading") return;
    const target = field.current ?? (host.current?.querySelector(FIELD_SELECTOR) as HTMLElement | null);
    target?.focus();
    onFocused?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFocus, mathLive]);

  const hasOp = matrixOp !== undefined;
  const handledCalc = calc !== undefined;
  // A matrix operation or a calculus statement is answered by the page; the engine's complaint about the bare line is not shown.
  const errors = hasOp || (handledCalc && calc.kind === "integral") ? [] : result?.errors ?? [];
  const later = result && !hasOp && !handledCalc ? LATER_PHASE[result.kind] : undefined;
  const cls = classification.class;
  const options = classification.options;
  const showWhy = cls === "unknown" || !!options || cls === "input";
  return (
    <li
      ref={row}
      className="mc-row"
      data-invalid={errors.length > 0 || undefined}
      data-class={cls}
      data-testid="mc-row"
      tabIndex={-1}
      onKeyDown={(e) => {
        // Focus is on the row itself (after Escape): arrows move between rows, Enter goes back into the field.
        if (e.target !== e.currentTarget) return;
        if (e.key === "ArrowUp" || e.key === "ArrowDown") {
          e.preventDefault();
          const sib = e.key === "ArrowUp" ? e.currentTarget.previousElementSibling : e.currentTarget.nextElementSibling;
          (sib as HTMLElement | null)?.focus();
        } else if (e.key === "Enter") {
          e.preventDefault();
          (host.current?.querySelector(FIELD_SELECTOR) as HTMLElement | null)?.focus();
        }
      }}
    >
      <ColorPicker n={index + 1} index={index} value={colorId} resolved={color} onChange={onColor} />
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
              onKeyDown={(e) => {
                if (e.key === "Enter") onEnter();
                else if (e.key === "Escape") leave();
                else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                  e.preventDefault();
                  siblingField(e.currentTarget, e.key === "ArrowUp" ? -1 : 1)?.focus();
                }
              }}
            />
          )}
        </div>
        <div className="mc-class-row">
          <span className="mc-class" data-class={cls} title={t(`classify.why.${classification.reason}`).replace(/\$/g, "")}>
            {t(`classify.${cls}`)}
            {classification.name && (
              <>
                {" "}
                <MathLabel math={classification.name.replace(/_(\w)$/, "_{$1}")} />
              </>
            )}
          </span>
          {showWhy && (
            <span className="mc-note">
              <MathMessage text={t(`classify.why.${classification.reason}`)} />
            </span>
          )}
        </div>
        {options && (
          <div className="mc-chip-row" role="group" aria-label={t("classify.interpretAs")} data-testid="mc-interpret">
            <span className="mc-note">{t("classify.interpretAs")}</span>
            {options.map((o) => (
              <button key={o} type="button" className="mc-chip" data-choice={o} aria-pressed={interpretation === o} onClick={() => onInterpret(o)}>
                {t(`classify.choice.${o}`)}
              </button>
            ))}
          </div>
        )}
        {result?.value !== undefined && Number.isFinite(result.value) && !hasOp && !handledCalc && (
          <div className="mc-value" data-value={result.value}>
            <MathLabel math={`= ${formatValue(result.value)}`} />
          </div>
        )}
        {calc?.kind === "derivative" && (
          <div className="mc-calc" data-testid="mc-tangent-readout" data-slope={calc.slope} data-x0={calc.x0} data-value={calc.value}>
            {calc.x0 !== undefined && calc.slope !== undefined && calc.value !== undefined ? (
              <MathLabel
                math={`x_0=${formatValue(calc.x0)},\\;\\; ${calc.fn}(x_0)=${formatValue(calc.value)},\\;\\; ${calc.fn}'(x_0)=${formatValue(calc.slope)},\\;\\; y=${formatValue(calc.slope)}\\,(x-${formatValue(calc.x0)})+${formatValue(calc.value)}`}
              />
            ) : null}
            <div className="mc-note"><MathMessage text={t("calc.tangentAt")} /></div>
          </div>
        )}
        {calc?.kind === "integral" && (
          <div className="mc-calc" data-testid="mc-integral" data-value={calc.value}>
            {calc.value !== undefined && Number.isFinite(calc.value) ? <IntegralValue calc={calc} /> : null}
            {calc.missingBounds && <div className="mc-note"><MathMessage text={t("calc.integralBounds")} /></div>}
          </div>
        )}
        {hasOp && (
          <div className="mc-calc" data-testid="mc-matrix-op" role="status">
            {matrixOp.latex ? <MathLabel math={matrixOp.latex} /> : <span className="mc-note">{matrixOp.message}</span>}
          </div>
        )}
        {cls === "matrix" && <MatrixEditor latex={latex} onChange={onChange} />}
        {interpretation === "constant" && <div className="mc-note">{t("classify.constantNote")}</div>}
        {interpretation === "input" && (
          <div className="mc-note">
            <MathMessage text={t("classify.inputHidden")} />
          </div>
        )}
        {errors.map((e, i) => (
          <div key={i} className="mc-error" role="alert">
            <MathMessage text={errorMath(t, e)} />
            {e.start !== undefined && (
              <span className="mc-error-at">
                <MathLabel math={latex.slice(e.start, e.end)} />
              </span>
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
          <PanelBoundary fallback={<div className="mc-note">{t("linalg.panelFailed")}</div>}>
            <Suspense fallback={<div className="mc-note">{t("linalg.loading")}</div>}>
              <LinalgPanel report={result.linalg} showSteps={showSteps} mode={mode} />
            </Suspense>
          </PanelBoundary>
        )}
      </div>
      <button type="button" className="mc-icon-button" onClick={onRemove} aria-label={t("removeExpression", { n: index + 1 })}>
        ×
      </button>
    </li>
  );
}

function IntegralValue({ calc }: { calc: Extract<CalcReadout, { kind: "integral" }> }) {
  const v = calc.value as number;
  const frac = nearFractionLatex(v);
  return <MathLabel math={`${calc.latex} = ${formatValue(v)}${frac ? ` \\approx ${frac}` : ""}`} />;
}

function nearFractionLatex(v: number): string | null {
  const f = nearFraction(v);
  return f && f.q > 1 ? fractionLatex(f) : null;
}

/** Values shown in the list: up to 10 significant digits, no float noise. */
export function formatValue(v: number): string {
  if (!Number.isFinite(v)) return String(v);
  const r = Number(v.toPrecision(10));
  return Math.abs(r) >= 1e10 || (Math.abs(r) < 1e-6 && r !== 0) ? r.toExponential(6) : String(r);
}
