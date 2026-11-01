/**
 * Color of one curve (Part C): the current color is shown on the swatch; one click on the swatch opens a row of the 8
 * palette colors, one more click picks. Escape closes and returns focus to the swatch. Colors are design tokens only.
 */
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { NS } from "../i18n/register";
import { CURVE_PALETTE, paletteEntry } from "./curvePalette";

export interface ColorPickerProps {
  /** 1-based number of the expression, for the labels. */
  n: number;
  index: number;
  /** `item.style.color` (a token name, `#RRGGBB`, or undefined for the default). */
  value: string | undefined;
  /** The color as resolved for this theme, painted on the swatch. */
  resolved: string;
  onChange: (id: string) => void;
}

export function ColorPicker({ n, index, value, resolved, onChange }: ColorPickerProps) {
  const { t } = useTranslation(NS);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const current = paletteEntry(value, index);
  const currentName = current ? t(`palette.${current.name}`) : t("palette.custom");

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  return (
    <div
      ref={root}
      className="mc-color"
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          e.stopPropagation();
          setOpen(false);
          button.current?.focus();
        }
      }}
    >
      <button
        ref={button}
        type="button"
        className="mc-swatch-button"
        data-testid="mc-color-button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={`${t("color.change", { n })}. ${t("color.current", { name: currentName })}`}
        title={t("color.current", { name: currentName })}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="mc-swatch" style={{ background: resolved }} aria-hidden />
      </button>
      {open && (
        <div className="mc-palette" role="group" aria-label={t("color.palette")}>
          {CURVE_PALETTE.map((c) => {
            const name = t(`palette.${c.name}`);
            const selected = current?.id === c.id;
            return (
              <button
                key={c.id}
                type="button"
                className="mc-palette-color"
                data-color={c.id}
                aria-pressed={selected}
                aria-label={t("color.pick", { name })}
                title={name}
                autoFocus={selected}
                style={{ background: `var(${c.token})` }}
                onClick={() => {
                  onChange(c.id);
                  setOpen(false);
                  button.current?.focus();
                }}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
