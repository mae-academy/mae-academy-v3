import { useState } from "react";
import { motion, Variants } from "framer-motion";
import { Star, ArrowRight, FileText } from "lucide-react";
import type { ResearchPaper } from "@/lib/openalex";

interface ResearchPaperCardProps {
  paper: ResearchPaper;
  onReadMore: (paper: ResearchPaper) => void;
  itemVariants: Variants;
}

export default function ResearchPaperCard({
  paper,
  onReadMore,
  itemVariants,
}: ResearchPaperCardProps) {
  // Track the exact URL that failed so a new paper never inherits a stale error flag.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  // Thumbnail derives strictly from THIS paper's pdfUrl.
  const thumbnailSrc = paper.pdfUrl
    ? `https://images.weserv.nl/?url=${encodeURIComponent(paper.pdfUrl)}&page=1&w=800&fit=contain&q=90`
    : null;

  const showThumbnail = thumbnailSrc !== null && failedSrc !== thumbnailSrc;

  return (
    <motion.article
      variants={itemVariants}
      className="group relative flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white/75 shadow-[0_15px_40px_-28px_rgba(15,23,42,.45)] transition-all duration-300 hover:-translate-y-2 hover:border-violet-400 hover:shadow-2xl hover:shadow-purple-500/20 dark:border-white/[0.08] dark:bg-[#08080A] dark:hover:border-white/[0.15] font-['Tajawal',sans-serif] leading-relaxed"
    >
      {/* Gradient top line on hover */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-brand-gradient opacity-0 transition-opacity duration-300 group-hover:opacity-100" />

      {/* ── Cover Area ── */}
      <div className="relative h-56 w-full overflow-hidden border-b border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-900">
        {showThumbnail ? (
          <img
            key={thumbnailSrc}
            src={thumbnailSrc}
            alt={paper.title}
            loading="lazy"
            onError={() => setFailedSrc(thumbnailSrc)}
            className="h-full w-full object-cover object-top filter contrast-105 transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          /* ── Skeleton document mockup (no overlay text) ── */
          <div className="relative flex h-full w-full flex-col justify-between bg-slate-50 p-5 select-none dark:bg-slate-950">
            {/* Subtle grid texture */}
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.03] dark:opacity-[0.05]"
              style={{
                backgroundImage:
                  "linear-gradient(#000 1px, transparent 1px), linear-gradient(90deg, #000 1px, transparent 1px)",
                backgroundSize: "14px 14px",
              }}
            />
            {/* Header bar */}
            <div className="relative flex items-center justify-between border-b border-slate-200/60 pb-3 dark:border-slate-800/80">
              <div className="flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-md bg-purple-100 dark:bg-purple-900/40">
                  <FileText className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
                </div>
                <div className="h-2 w-20 rounded-full bg-slate-200 dark:bg-slate-700" />
              </div>
              <div className="h-2 w-10 rounded-full bg-slate-200 dark:bg-slate-700" />
            </div>
            {/* Body lines */}
            <div className="relative my-auto space-y-2 py-1">
              <div className="h-3 w-4/5 rounded bg-slate-200/90 dark:bg-slate-700/80" />
              <div className="h-2.5 w-3/5 rounded bg-slate-200/70 dark:bg-slate-700/60" />
              <div className="grid grid-cols-3 gap-2 pt-2 opacity-60">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="h-10 rounded border border-slate-200/50 bg-slate-200/40 dark:border-slate-700/40 dark:bg-slate-800/60"
                  />
                ))}
              </div>
            </div>
            {/* Footer lines */}
            <div className="relative border-t border-slate-200/60 pt-2.5 dark:border-slate-800/80">
              <div className="grid grid-cols-2 gap-3 opacity-40">
                {[0, 1].map((col) => (
                  <div key={col} className="space-y-1">
                    <div className="h-1.5 w-full rounded bg-slate-200 dark:bg-slate-700" />
                    <div className="h-1.5 w-4/5 rounded bg-slate-200 dark:bg-slate-700" />
                    <div className="h-1.5 w-2/3 rounded bg-slate-200 dark:bg-slate-700" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Card Body ── */}
      <div className="flex flex-1 flex-col p-4">
        {/* Citations & Year */}
        <div className="mb-2.5 flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-200">
            <Star className="h-3.5 w-3.5 shrink-0 fill-red-500 text-red-500" />
            <span>{paper.citations.toLocaleString()} Citations</span>
          </div>
          <span className="font-semibold text-slate-500 dark:text-slate-400">{paper.year}</span>
        </div>

        {/* Title */}
        <h2 className="mb-2 line-clamp-2 text-base font-bold leading-relaxed tracking-tight text-slate-900 dark:text-white">
          {paper.title}
        </h2>

        {/* Authors */}
        <p className="mb-2 line-clamp-1 text-xs font-medium leading-relaxed text-slate-500 dark:text-zinc-400">
          {paper.authors.length > 0 ? paper.authors.join(", ") : "Various Authors"}
        </p>

        {/* Abstract */}
        <p className="mb-4 line-clamp-3 text-xs leading-relaxed text-slate-600 dark:text-zinc-400">
          {paper.abstract}
        </p>

        {/* Footer action */}
        <div className="mt-auto flex items-center justify-end border-t border-slate-100 pt-3 dark:border-white/[0.05]">
          <button
            onClick={() => onReadMore(paper)}
            className="group/btn flex items-center gap-1 text-xs font-semibold text-violet-600 transition-colors hover:text-violet-700 dark:text-violet-400 dark:hover:text-violet-300"
          >
            Details
            <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover/btn:translate-x-0.5" />
          </button>
        </div>
      </div>
    </motion.article>
  );
}
