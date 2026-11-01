/**
 * Entries of a named constant matrix (Part D). Each entry is a text field; an edit rewrites the matrix line, so the line
 * stays the single source of truth. A matrix with letters in it is editable too (the entry is LaTeX).
 */
import { useTranslation } from "react-i18next";
import { NS } from "../i18n/register";
import { buildMatrixLine, parseMatrixLine } from "./matrixOps";

export function MatrixEditor({ latex, onChange }: { latex: string; onChange: (latex: string) => void }) {
  const { t } = useTranslation(NS);
  const m = parseMatrixLine(latex);
  if (!m) return null;
  return (
    <div className="mc-matrix-editor" data-testid="mc-matrix-editor" role="group" aria-label={t("matrixEditor.label", { name: m.name })} dir="ltr">
      <div className="mc-matrix-grid" style={{ gridTemplateColumns: `repeat(${m.rows[0].length}, minmax(0, 1fr))` }}>
        {m.rows.map((row, r) =>
          row.map((cell, c) => (
            <input
              key={`${r}-${c}`}
              className="mc-matrix-cell"
              value={cell}
              inputMode="decimal"
              aria-label={t("matrixEditor.entry", { name: m.name, r: r + 1, c: c + 1 })}
              onChange={(e) => {
                const rows = m.rows.map((rr) => rr.slice());
                rows[r][c] = e.target.value.replace(/[&\\]/g, "");
                onChange(buildMatrixLine(m.name, rows));
              }}
            />
          )),
        )}
      </div>
    </div>
  );
}
