/**
 * Matrix and system report under an expression (STEPS.md §8.2): determinant with its sign and orientation, trace,
 * characteristic polynomial, eigenvalues (closed form for 2×2), eigen-directions, and the annotated Gauss-Jordan steps
 * with the pivot boxed. Loaded lazily with KaTeX, so the graphing page does not pay for it until a matrix is typed.
 */
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { KatexMath } from "@/components/ui/KatexMath";
import type { MatrixAnalysis, StepReport, SystemAnalysis } from "@shared/mathcore/linalg/analyze";
import { NS } from "../i18n/register";
import type { ItemResult } from "../workers/protocol";

export interface LinalgPanelProps {
  report: NonNullable<ItemResult["linalg"]>;
  /** `view.showSteps`: the steps start open. */
  showSteps: boolean;
  /** 3×3 items are drawn in the 3D view; in the 2D view they say so. */
  mode?: "2d" | "3d";
}

/** Significant digits of the rotation angle (degrees) and scale. */
const ANGLE_DIGITS = 4;

function Steps({ title, start, steps, open, result }: { title: string; start: string; steps: StepReport[]; open: boolean; result?: ReactNode }) {
  return (
    <details className="mc-steps" open={open}>
      <summary>{title}</summary>
      <ol className="mc-step-list" dir="ltr">
        <li>
          <KatexMath math={start} block />
        </li>
        {steps.map((s, i) => (
          <li key={i} className="mc-step">
            <KatexMath math={s.op} />
            <KatexMath math={s.matrix} block />
          </li>
        ))}
      </ol>
      {result}
    </details>
  );
}

function MatrixReport({ a, showSteps, mode }: { a: MatrixAnalysis; showSteps: boolean; mode: "2d" | "3d" }) {
  const { t } = useTranslation(NS);
  const orientation = a.det.singular ? "singular" : a.det.sign > 0 ? "kept" : "reversed";
  const complex = a.eigen.values.find((v) => v.im > 0);
  return (
    <div className="mc-linalg" data-testid="mc-linalg">
      <div className="mc-linalg-row">
        <span dir="ltr">
          <KatexMath math={`\\det ${a.name} = ${a.det.latex}`} />
        </span>
        <span className="mc-badge" data-orientation={orientation} role="status">
          {t(`linalg.orientation_${orientation}`)}
        </span>
      </div>
      <div className="mc-linalg-row mc-linalg-working" dir="ltr">
        <KatexMath math={a.det.working} />
      </div>
      <div className="mc-linalg-row" dir="ltr">
        <KatexMath math={`\\operatorname{tr} ${a.name} = ${a.trace.latex}, \\quad ${a.characteristic}`} />
      </div>
      <div className="mc-linalg-row">
        <span>{t("linalg.eigenvalues")}</span>
        <span dir="ltr">
          <KatexMath math={`\\displaystyle ${a.eigen.latex.map((l) => `\\lambda = ${l}`).join(", \\quad ")}`} />
        </span>
      </div>
      {a.eigen.working && (
        <div className="mc-linalg-row mc-linalg-working" dir="ltr">
          <KatexMath math={`\\displaystyle ${a.eigen.working}`} />
        </div>
      )}
      {a.eigen.vectors.length > 0 && (
        <div className="mc-linalg-row">
          <span>{t("linalg.eigenvectors")}</span>
          {a.eigen.vectors.map((v, i) => (
            <span key={i} dir="ltr">
              <KatexMath math={`\\lambda = ${v.value}: ${v.vector}`} />
            </span>
          ))}
        </div>
      )}
      {complex && (
        <p className="mc-note">
          {t("linalg.rotation", {
            angle: Number(((Math.atan2(complex.im, complex.re) * 180) / Math.PI).toPrecision(ANGLE_DIGITS)),
            scale: Number(Math.hypot(complex.re, complex.im).toPrecision(ANGLE_DIGITS)),
          })}
        </p>
      )}
      {a.size === 3 && mode === "2d" && <p className="mc-note">{t("linalg.matrix3d")}</p>}
      <Steps
        title={t("linalg.stepsInverse")}
        start={a.inverse.start}
        steps={a.inverse.steps}
        open={showSteps}
        result={
          <div className="mc-linalg-row" dir="ltr">
            {a.inverse.result ? <KatexMath math={`${a.name}^{-1} = ${a.inverse.result}`} block /> : <span className="mc-note">{t("linalg.noInverse", { rank: a.rank })}</span>}
          </div>
        }
      />
    </div>
  );
}

function SystemReport({ s, showSteps, mode }: { s: SystemAnalysis; showSteps: boolean; mode: "2d" | "3d" }) {
  const { t } = useTranslation(NS);
  const sol = s.solution;
  return (
    <div className="mc-linalg" data-testid="mc-linalg">
      <div className="mc-linalg-row" dir="ltr">
        <KatexMath math={`\\begin{cases} ${s.equations.join(" \\\\ ")} \\end{cases}`} block />
      </div>
      <div className="mc-linalg-row" role="status">
        {sol.kind === "unique" && (
          <>
            <span>{t("linalg.solution")}</span>
            <span dir="ltr">
              <KatexMath math={sol.latex.join(", \\quad ")} />
            </span>
          </>
        )}
        {sol.kind === "none" && <span className="mc-badge" data-orientation="singular">{t("linalg.noSolution", { rank: s.rank })}</span>}
        {sol.kind === "infinite" && (
          <>
            <span className="mc-badge" data-orientation="singular">{t("linalg.infinite", { rank: s.rank })}</span>
            <span dir="ltr">
              <KatexMath math={sol.latex.join(", \\quad ")} />
            </span>
          </>
        )}
      </div>
      {s.size === 3 && mode === "2d" && <p className="mc-note">{t("linalg.planes3d")}</p>}
      <Steps title={t("linalg.stepsSystem")} start={s.start} steps={s.steps} open={showSteps} />
    </div>
  );
}

export default function LinalgPanel({ report, showSteps, mode = "2d" }: LinalgPanelProps) {
  return report.type === "matrix" ? (
    <MatrixReport a={report.analysis} showSteps={showSteps} mode={mode} />
  ) : (
    <SystemReport s={report.analysis} showSteps={showSteps} mode={mode} />
  );
}
