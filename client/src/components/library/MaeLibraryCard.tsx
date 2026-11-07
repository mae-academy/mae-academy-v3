import { Link } from "wouter";
import { motion, type Variants } from "framer-motion";
import { ArrowRight, BookOpen, ClipboardList, FileText, FlaskConical, GraduationCap, PlayCircle, type LucideIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { MaeItemType, MaeLibraryItem } from "@/data/maeLibrary";

export const MAE_TYPE_ICON: Record<MaeItemType, LucideIcon> = {
  "test-bank": ClipboardList,
  "study-guide": BookOpen,
  summary: FileText,
  "lab-manual": FlaskConical,
  "video-course": PlayCircle,
  project: GraduationCap,
};

/** Same card chrome as LibraryBookCard (border, radius, hover lift, brand line) so both collections look like one library. */
export default function MaeLibraryCard({ item, itemVariants }: { item: MaeLibraryItem; itemVariants: Variants }) {
  const { t } = useTranslation(["library"]);
  const Icon = MAE_TYPE_ICON[item.type];
  return (
    <motion.article
      variants={itemVariants}
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white/75 shadow-[0_15px_40px_-28px_rgba(15,23,42,.45)] transition-all duration-300 hover:-translate-y-2 hover:border-violet-400 hover:shadow-2xl hover:shadow-purple-500/20 dark:border-white/[0.08] dark:bg-[#08080A] dark:hover:border-white/[0.15] font-sans leading-relaxed"
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-brand-gradient opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
      <div className="flex flex-1 flex-col p-5">
        <div className="mb-3 flex items-center justify-between text-xs">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-500/20 bg-violet-500/10 px-2.5 py-0.5 font-semibold uppercase tracking-wider text-violet-700 dark:bg-violet-500/20 dark:text-violet-300">
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            {t(`mae.types.${item.type}`)}
          </span>
          <span className="font-semibold text-slate-500 dark:text-slate-400">{item.updated?.slice(0, 4) ?? ""}</span>
        </div>
        <h2 className="mb-2 line-clamp-2 text-base font-bold leading-relaxed tracking-tight text-slate-900 dark:text-white">{item.title}</h2>
        <p className="mb-2 line-clamp-1 text-xs font-medium text-slate-500 dark:text-zinc-400">{item.authors.join(", ")}</p>
        <p className="mb-4 line-clamp-3 text-xs leading-relaxed text-slate-600 dark:text-zinc-400">{item.summary}</p>
        <div className="mt-auto flex items-center justify-end border-t border-slate-100 pt-3 dark:border-white/[0.05]">
          <Link
            href={`/library/mae/${item.slug}`}
            className="group/btn flex items-center gap-1 text-xs font-semibold text-violet-600 transition-colors hover:text-violet-700 dark:text-violet-400 dark:hover:text-violet-300"
          >
            {t("card.details")}
            <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover/btn:translate-x-0.5 rtl:rotate-180" />
          </Link>
        </div>
      </div>
    </motion.article>
  );
}
