import { useMemo, useState } from "react";
import { motion, type Variants } from "framer-motion";
import { useTranslation } from "react-i18next";
import LibraryCollectionTabs from "@/components/library/LibraryCollectionTabs";
import MaeLibraryCard from "@/components/library/MaeLibraryCard";
import { maeTypesWithItems, visibleMaeItems, type MaeItemType } from "@/data/maeLibrary";
import { usePageTitle } from "@/hooks/usePageTitle";
import NotFound from "./NotFound";

const containerVariants: Variants = { hidden: {}, visible: { transition: { staggerChildren: 0.06, delayChildren: 0.04 } } };
const itemVariants: Variants = { hidden: { opacity: 0, y: 18 }, visible: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 180, damping: 22 } } };

export default function MaeLibrary() {
  const { t } = useTranslation(["library"]);
  usePageTitle(t("mae.tabs.mae"));
  const items = useMemo(() => visibleMaeItems(), []);
  const types = useMemo(() => maeTypesWithItems(items), [items]);
  const [type, setType] = useState<MaeItemType | "all">("all");
  const shown = type === "all" ? items : items.filter((item) => item.type === type);

  // No published items yet: the page does not exist for visitors (no empty section).
  if (items.length === 0) return <NotFound />;

  const pill = (active: boolean) =>
    `min-h-11 shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs transition-all duration-200 sm:min-h-0 ${
      active ? "brand-active-pill" : "bg-transparent text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
    }`;

  return (
    <motion.section className="container py-12 sm:py-16 leading-relaxed" variants={containerVariants} initial="hidden" animate="visible">
      <motion.div variants={itemVariants}>
        <LibraryCollectionTabs active="mae" />
      </motion.div>
      <motion.div variants={itemVariants} className="mb-10 grid gap-6 lg:grid-cols-[1.2fr_.8fr] lg:items-end">
        <div>
          <div className="mb-3 flex items-center gap-3">
            <p className="text-sm font-semibold tracking-wider text-indigo-600 dark:text-indigo-400">{t("mae.eyebrow")}</p>
            <span className="h-px w-16 bg-brand-gradient" />
          </div>
          <h1 className="max-w-3xl break-words text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white">{t("mae.title")}</h1>
        </div>
        <p className="max-w-xl border-l-2 border-gradient-signal pl-5 text-sm md:text-base text-slate-500 leading-relaxed dark:text-zinc-400 rtl:border-l-0 rtl:border-r-2 rtl:pl-0 rtl:pr-5">
          {t("mae.description")}
        </p>
      </motion.div>

      <motion.div variants={itemVariants} className="mb-10 flex min-w-0 max-w-full items-center gap-2">
        <div className="scroll-x no-scrollbar flex max-w-full items-center gap-1 rounded-full border border-slate-200 bg-slate-100 p-1 shadow-xs dark:border-slate-700 dark:bg-slate-800/90">
          <button type="button" onClick={() => setType("all")} className={pill(type === "all")}>{t("mae.all")}</button>
          {types.map((value) => (
            <button key={value} type="button" onClick={() => setType(value)} className={pill(type === value)}>{t(`mae.types.${value}`)}</button>
          ))}
        </div>
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{shown.length} {t("mae.item.count")}</span>
      </motion.div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {shown.map((item) => (
          <MaeLibraryCard key={item.slug} item={item} itemVariants={itemVariants} />
        ))}
      </div>
    </motion.section>
  );
}
