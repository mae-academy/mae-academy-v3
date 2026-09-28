import { useState } from "react";
import { X, ExternalLink, Download, Star, Eye, FileText } from "lucide-react";
import type { ResearchPaper } from "@/lib/openalex";

interface ResearchPaperModalProps {
  isOpen: boolean;
  onClose: () => void;
  paper: ResearchPaper | null;
}

export default function ResearchPaperModal({ isOpen, onClose, paper }: ResearchPaperModalProps) {
  const [showViewer, setShowViewer] = useState(false);

  if (!isOpen || !paper) return null;

  const handleClose = () => {
    setShowViewer(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 sm:p-8 shadow-2xl dark:bg-[#0c0d12] dark:border dark:border-white/[0.08] font-['Tajawal',sans-serif]">
        <button
          onClick={handleClose}
          className="absolute right-4 top-4 p-2 text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
          aria-label="Close modal"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="mb-6">
          <div className="flex flex-wrap items-center gap-2 mb-4 pr-10">
            <span className="inline-flex items-center h-6 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700 dark:bg-white/[0.06] dark:text-zinc-300 border border-slate-200/80 dark:border-white/[0.06]">
              {paper.year || "n/a"}
            </span>
            <div className="inline-flex items-center gap-1.5 h-6 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-800 dark:bg-white/[0.06] dark:text-slate-200 border border-slate-200/80 dark:border-white/[0.06]">
              <Star className="w-3.5 h-3.5 text-red-500 fill-red-500 shrink-0" />
              <span>{paper.citations ?? 0} Citations</span>
            </div>
            <span className="inline-flex items-center h-6 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider">
              OPEN ACCESS
            </span>
          </div>
          
          <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 dark:text-white mb-3 leading-relaxed">
            {paper.title}
          </h2>
          
          <p className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-6 leading-relaxed">
            By {paper.authors.join(", ")}
          </p>
        </div>

        <div className="prose prose-slate dark:prose-invert max-w-none mb-8">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500 mb-2">
            Abstract
          </h3>
          <p className="text-sm leading-relaxed text-slate-700 dark:text-zinc-300">
            {paper.abstract || "No abstract available for this paper."}
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-6 dark:border-white/[0.08]">
          {paper.pdfUrl && (
            <>
              <a
                href={paper.pdfUrl}
                download
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-full brand-active-pill hover:opacity-95 shadow-md active:scale-95 px-5 py-2.5 text-sm"
              >
                <Download className="w-4 h-4" /> Download PDF
              </a>

              <button
                onClick={() => setShowViewer(!showViewer)}
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-800 shadow-xs transition-all hover:bg-slate-50 hover:border-slate-300 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-zinc-200 dark:hover:bg-white/[0.08] active:scale-95"
              >
                {showViewer ? <X className="w-4 h-4" /> : <Eye className="w-4 h-4 text-purple-600 dark:text-purple-400" />}
                {showViewer ? "Hide Viewer" : "View PDF Online"}
              </button>
            </>
          )}
          
          <a
            href={paper.landingPageUrl || "#"}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-600 shadow-xs transition-all hover:border-slate-300 hover:text-slate-900 hover:bg-slate-50 active:scale-95 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-zinc-300 dark:hover:bg-white/[0.08]"
          >
            Publisher Page <ExternalLink className="w-4 h-4" />
          </a>
        </div>

        {/* Embedded PDF Viewer if activated */}
        {showViewer && paper.pdfUrl && (
          <div className="mt-6 overflow-hidden rounded-xl border border-slate-200 bg-slate-50 dark:border-white/[0.08] dark:bg-zinc-950">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-4 py-2.5 text-xs text-slate-500 dark:border-white/[0.06] dark:text-zinc-400 bg-white/50 dark:bg-zinc-900/50">
              <span className="font-semibold flex items-center gap-1.5 text-slate-700 dark:text-zinc-200">
                <FileText className="w-3.5 h-3.5 text-purple-500" />
                Live Document Preview (Bypassing X-Frame Blocks)
              </span>
              <div className="flex items-center gap-2">
                <a
                  href={paper.pdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-full brand-active-pill shadow-sm hover:opacity-95 text-xs px-3.5 py-1.5"
                >
                  Open Direct PDF in New Tab <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
            <iframe
              src={`https://docs.google.com/viewer?url=${encodeURIComponent(paper.pdfUrl)}&embedded=true`}
              className="h-[600px] w-full bg-white border-0"
              title={`PDF Reader: ${paper.title}`}
            />
          </div>
        )}
      </div>
    </div>
  );
}
