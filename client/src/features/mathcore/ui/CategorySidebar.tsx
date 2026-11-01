/**
 * Left sidebar (Part B): the five categories. Choosing one opens its template in the panel: a sample, what it does,
 * a button that adds it to the graph, and a plain statement of what the engine cannot do yet in that category.
 * "Expressions" returns to the plain Desmos-style list.
 */
import { useTranslation } from "react-i18next";
import { NS } from "../i18n/register";
import type { Category, CategoryId, Sample } from "./categories";
import { CATEGORIES } from "./categories";
import { MathLabel, MathMessage } from "./MathLabel";

export function CategorySidebar({ active, onSelect }: { active: CategoryId | null; onSelect: (id: CategoryId | null) => void }) {
  const { t } = useTranslation(NS);
  return (
    <nav className="mc-sidebar" aria-label={t("categories.navLabel")}>
      <h2 className="mc-sidebar-title">{t("categories.heading")}</h2>
      <ul className="mc-sidebar-list">
        <li>
          <button type="button" className="mc-category" data-category="home" aria-current={active === null ? "page" : undefined} onClick={() => onSelect(null)}>
            {t("categories.home")}
          </button>
        </li>
        {CATEGORIES.map((c) => (
          <li key={c.id}>
            <button type="button" className="mc-category" data-category={c.id} aria-current={active === c.id ? "page" : undefined} onClick={() => onSelect(c.id)}>
              {t(`categories.${c.id}.title`)}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function TemplatePanel({ category, onAdd, onClose, added }: { category: Category; onAdd: (s: Sample) => void; onClose: () => void; added: string | null }) {
  const { t } = useTranslation(NS);
  return (
    <section className="mc-template" data-testid="mc-template" data-category={category.id} aria-label={t("template.title")}>
      <header className="mc-template-head">
        <div>
          <h2 className="mc-template-title">{t(`categories.${category.id}.title`)}</h2>
          <p className="mc-note"><MathMessage text={t(`categories.${category.id}.blurb`)} /></p>
        </div>
        <button type="button" className="mc-icon-button" onClick={onClose} aria-label={t("template.close")}>
          ×
        </button>
      </header>
      <ul className="mc-sample-list">
        {category.samples.map((s) => (
          <li key={s.id} className="mc-sample" data-sample={s.id}>
            <h3 className="mc-sample-title">{t(`samples.${s.id}.title`)}</h3>
            <div className="mc-sample-math">
              {s.items.map((latex) => (
                <MathLabel key={latex} math={latex} />
              ))}
            </div>
            <p className="mc-note"><MathMessage text={t(`samples.${s.id}.explain`)} /></p>
            <button type="button" className="mc-button" data-testid="mc-sample-add" onClick={() => onAdd(s)}>
              {t("template.add")}
            </button>
            {added === s.id && (
              <span className="mc-note" role="status">
                {t("template.added")}
              </span>
            )}
          </li>
        ))}
      </ul>
      {category.unsupported.length > 0 && (
        <div className="mc-unsupported" data-testid="mc-unsupported">
          <h3 className="mc-sample-title">{t("template.notYet")}</h3>
          <ul>
            {category.unsupported.map((k) => (
              <li key={k} className="mc-note">
                <MathMessage text={t(`categories.unsupported.${k}`)} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
