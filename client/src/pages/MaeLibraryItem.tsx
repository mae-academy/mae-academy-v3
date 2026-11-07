import { useEffect } from "react";
import { Link, useRoute } from "wouter";
import { ArrowLeft, Download, ExternalLink, PlayCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import MaeLibraryCard, { MAE_TYPE_ICON } from "@/components/library/MaeLibraryCard";
import { findMaeItem, visibleMaeItems } from "@/data/maeLibrary";
import { usePageTitle } from "@/hooks/usePageTitle";
import NotFound from "./NotFound";

const chip = "inline-flex items-center h-6 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700 dark:bg-white/[0.06] dark:text-zinc-300 border border-slate-200/80 dark:border-white/[0.06]";

export default function MaeLibraryItem() {
  const { t } = useTranslation(["library"]);
  const [, params] = useRoute("/library/mae/:slug");
  const item = params ? findMaeItem(params.slug) : undefined;
  usePageTitle(item?.title ?? t("mae.tabs.mae"));

  // Drafts (development only) must never be indexed.
  useEffect(() => {
    if (item?.status !== "draft") return;
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex, nofollow";
    document.head.appendChild(meta);
    return () => meta.remove();
  }, [item?.status]);

  if (!item) return <NotFound />;
  const Icon = MAE_TYPE_ICON[item.type];
  const related = visibleMaeItems().filter((other) => other.slug !== item.slug).sort((a) => (a.type === item.type ? -1 : 1)).slice(0, 4);
  const card = "rounded-2xl bg-slate-50 p-6 sm:p-8 dark:bg-white/[0.02] border border-slate-100 dark:border-white/[0.05]";
  const heading = "text-sm font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500 mb-5";

  return (
    <div className="container py-14 sm:py-20 font-sans leading-relaxed max-w-[1400px]">
      <div className="mb-8">
        <Link href="/library/mae" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-white">
          <ArrowLeft className="h-4 w-4 rtl:rotate-180" /> {t("mae.item.back")}
        </Link>
      </div>

      <header className="mb-12">
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 h-6 rounded-full bg-violet-500/10 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300 border border-violet-500/20 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider">
            <Icon className="h-3.5 w-3.5" aria-hidden="true" /> {t(`mae.types.${item.type}`)}
          </span>
          <span className={chip}>{t("mae.item.language")}: {item.language}</span>
          {item.pages ? <span className={chip}>{item.pages} {t("mae.item.pages")}</span> : null}
          {item.updated ? <span className={chip}>{t("mae.item.updated")}: {item.updated}</span> : null}
        </div>
        <h1 className="mb-6 break-words text-2xl sm:text-5xl lg:text-6xl font-black tracking-tight text-slate-900 dark:text-white leading-snug">{item.title}</h1>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-4xl text-base sm:text-lg font-medium text-slate-600 dark:text-slate-400">
            {t("mae.item.by")} {item.authors.join(", ")}
          </p>
          <div className="flex shrink-0 flex-wrap items-center gap-3">
            {item.downloadUrl && (
              <a href={item.downloadUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-full brand-active-pill hover:opacity-95 shadow-md active:scale-95 px-6 py-2.5 text-sm">
                <Download className="h-4 w-4" /> {t("mae.item.download")}
              </a>
            )}
            {item.videoUrl && (
              <a href={item.videoUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-full brand-active-pill hover:opacity-95 shadow-md active:scale-95 px-6 py-2.5 text-sm">
                <PlayCircle className="h-4 w-4" /> {t("mae.item.watch")} <ExternalLink className="h-4 w-4" />
              </a>
            )}
          </div>
        </div>
      </header>

      <div className="mb-20 grid gap-8 lg:grid-cols-12 lg:items-start">
        <section className={`${card} lg:col-span-5`}>
          <h3 className={heading}>{t("mae.item.about")}</h3>
          <p className="text-base sm:text-lg leading-relaxed text-slate-700 dark:text-zinc-300">{item.description}</p>
          <p className="mt-6 text-sm font-medium text-slate-500 dark:text-zinc-400">
            {item.rights === "owner" ? t("mae.item.rightsOwner") : t("mae.item.rightsPermission")}
            {item.published ? ` ${t("mae.item.published")}: ${item.published}.` : ""}
          </p>
        </section>
        <div className="space-y-8 lg:col-span-7">
          <section className={card}>
            <h3 className={heading}>{t("mae.item.contents")}</h3>
            <ol className="list-decimal space-y-2 ps-5 text-base text-slate-700 dark:text-zinc-300">
              {item.contents.map((line, index) => (
                <li key={index} className="ps-1">{line}</li>
              ))}
            </ol>
          </section>
          <section className={card}>
            <h3 className={heading}>{t("mae.item.sample")}</h3>
            <div className="space-y-3 text-base leading-relaxed text-slate-700 dark:text-zinc-300">
              {item.sample.map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
            </div>
          </section>
        </div>
      </div>

      {related.length > 0 && (
        <section className="mt-16 w-full border-t border-slate-200 pt-10 dark:border-white/[0.08]">
          <h2 className="mb-6 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{t("mae.item.more")}</h2>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {related.map((other) => (
              <MaeLibraryCard key={other.slug} item={other} itemVariants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
