/** Keyboard shortcuts panel (Part E): opens with `?` (or its button), closes with Escape or Close; focus returns. */
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { NS } from "../i18n/register";

const ROWS: ReadonlyArray<[string[], string]> = [
  [["Tab", "Shift+Tab"], "tab"],
  [["↑", "↓"], "arrows"],
  [["Enter"], "enter"],
  [["Esc"], "escape"],
  [["?"], "help"],
  [["←", "→", "↑", "↓"], "canvasPan"],
  [["+", "−"], "canvasZoom"],
  [["←", "→", "Home", "End"], "slider"],
];

export function ShortcutsPanel({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation(NS);
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => close.current?.focus(), []);
  return (
    <div
      className="mc-dialog-backdrop"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
        // Keep Tab inside the dialog: it has one button.
        if (e.key === "Tab") {
          e.preventDefault();
          close.current?.focus();
        }
      }}
    >
      <div className="mc-dialog" role="dialog" aria-modal="true" aria-labelledby="mc-shortcuts-title" data-testid="mc-shortcuts">
        <h2 id="mc-shortcuts-title" className="mc-template-title">
          {t("shortcuts.title")}
        </h2>
        <table className="mc-shortcuts-table">
          <thead>
            <tr>
              <th scope="col">{t("shortcuts.key")}</th>
              <th scope="col">{t("shortcuts.action")}</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map(([keys, id]) => (
              <tr key={id}>
                <td dir="ltr">
                  {keys.map((k) => (
                    <kbd key={k} className="mc-kbd">
                      {k}
                    </kbd>
                  ))}
                </td>
                <td>{t(`shortcuts.rows.${id}`)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <button ref={close} type="button" className="mc-button" onClick={onClose}>
          {t("shortcuts.close")}
        </button>
      </div>
    </div>
  );
}
