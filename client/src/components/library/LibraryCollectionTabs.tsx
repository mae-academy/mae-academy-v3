import { Link } from "wouter";
import { useTranslation } from "react-i18next";

/** Switches between the open third-party library and the MAE Library. Same pill style as the sort control. */
export default function LibraryCollectionTabs({ active }: { active: "open" | "mae" }) {
  const { t } = useTranslation(["library"]);
  const tab = (isActive: boolean) =>
    `min-h-11 shrink-0 whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium transition-all duration-200 sm:min-h-0 ${
      isActive ? "brand-active-pill" : "bg-transparent text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
    }`;
  return (
    <nav aria-label={t("mae.tabs.label")} className="mb-8">
      <div className="scroll-x no-scrollbar inline-flex max-w-full items-center gap-1 rounded-full border border-slate-200 bg-slate-100 p-1 shadow-xs dark:border-slate-700 dark:bg-slate-800/90">
        <Link href="/library" className={tab(active === "open")} aria-current={active === "open" ? "page" : undefined}>
          {t("mae.tabs.open")}
        </Link>
        <Link href="/library/mae" className={tab(active === "mae")} aria-current={active === "mae" ? "page" : undefined}>
          {t("mae.tabs.mae")}
        </Link>
      </div>
    </nav>
  );
}
