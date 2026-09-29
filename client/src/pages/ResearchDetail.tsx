import { lazy, Suspense, useState, useEffect } from "react";
import { Link } from "wouter";
import { Loader2, ExternalLink, Download, Star, ArrowLeft, FileText } from "lucide-react";
import { fetchWorkById, fetchRelatedWorks, ResearchPaper } from "@/lib/openalex";
import ResearchPaperCard from "@/components/ResearchPaperCard";
import PdfErrorBoundary from "@/components/PdfErrorBoundary";
import PdfPreviewFallback from "@/components/PdfPreviewFallback";

type DownloadState = "idle" | "checking" | "error";

/** ASCII slug used as the saved file name (the server sanitises it again). */
const toPdfFilename = (title: string): string =>
  `${title.normalize("NFKD").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "research_paper"}.pdf`;

// Lazy: keeps pdf.js (~1 MB) out of the main bundle until a paper with a PDF is opened.
const RestrictedPdfViewer = lazy(() => import("@/components/RestrictedPdfViewer"));

export default function ResearchDetail({ params }: any) {
  const [paper, setPaper] = useState<ResearchPaper | null>(null);
  const [relatedPapers, setRelatedPapers] = useState<ResearchPaper[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloadState, setDownloadState] = useState<DownloadState>("idle");

  const paperId = params.id;

  useEffect(() => {
    if (!paperId) return;

    const controller = new AbortController();
    
    async function loadData() {
      setIsLoading(true);
      setError(null);
      setDownloadState("idle");
      setRelatedPapers([]);
      try {
        const fetchedPaper = await fetchWorkById(paperId, controller.signal);
        setPaper(fetchedPaper);
        document.title = `${fetchedPaper.title} | MAE Academy`;

        // Fetch related works
        try {
          const relatedRes = await fetchRelatedWorks(fetchedPaper.primaryConceptId, paperId, controller.signal);
          setRelatedPapers(relatedRes);
        } catch (e) {
          console.error("Failed to load related works", e);
        }
      } catch (err: unknown) {
        if (controller.signal.aborted) return;
        console.error(err);
        setError(err instanceof Error ? err.message : "Failed to load paper details.");
      } finally {
        setIsLoading(false);
      }
    }

    loadData();

    return () => controller.abort();
  }, [paperId]);

  if (isLoading) {
    return (
      <div className="container flex min-h-[60vh] items-center justify-center py-20">
        <Loader2 className="h-10 w-10 animate-spin text-violet-500" />
      </div>
    );
  }

  if (error || !paper) {
    return (
      <div className="container py-20 text-center font-sans">
        <h1 className="mb-4 text-2xl font-bold text-slate-900 dark:text-white">Paper Not Found</h1>
        <p className="mb-8 text-slate-500 dark:text-zinc-400">{error || "Could not load the requested research paper."}</p>
        <Link
          href="/research"
          className="inline-flex items-center gap-2 rounded-full bg-violet-100 px-6 py-2.5 text-sm font-bold text-violet-700 transition-colors hover:bg-violet-200 dark:bg-violet-900/30 dark:text-violet-300"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Research
        </Link>
      </div>
    );
  }

  const validRelatedPapers = relatedPapers.filter((p) => Boolean(p?.id) && Boolean(p.title));

  const handleDownload = async () => {
    if (!paper.pdfUrl || downloadState === "checking") return;

    // TODO: MONETIZATION HOOK - await the ad / monetization modal here (resolve to continue, return to abort).

    const downloadUrl = `/api/pdf-download?url=${encodeURIComponent(paper.pdfUrl)}&name=${encodeURIComponent(toPdfFilename(paper.title))}`;

    // Preflight the first KB: a failing source would otherwise save an error page as a "PDF" or show a broken download.
    setDownloadState("checking");
    try {
      const res = await fetch(downloadUrl, { headers: { Range: "bytes=0-1023" } });
      void res.body?.cancel();
      const isPdfAttachment =
        res.ok &&
        (res.headers.get("content-type") ?? "").includes("application/pdf") &&
        (res.headers.get("content-disposition") ?? "").startsWith("attachment");
      if (!isPdfAttachment) throw new Error(`Download unavailable (${res.status})`);
    } catch (err) {
      console.error(err);
      setDownloadState("error");
      return;
    }

    // Hidden same-origin anchor: Content-Disposition: attachment makes the browser save instead of open.
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = toPdfFilename(paper.title);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setDownloadState("idle");
  };

  return (
    <div className="container py-14 sm:py-20 font-sans leading-relaxed max-w-[1400px]">
      {/* ── Breadcrumb / Back ── */}
      <div className="mb-8">
        <Link
          href="/research"
          className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Search
        </Link>
      </div>

      {/* ── FULL-WIDTH HEADER ── */}
      <header className="mb-12">
        <div className="flex flex-wrap items-center gap-2 mb-6">
          <span className="inline-flex items-center h-6 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700 dark:bg-white/[0.06] dark:text-zinc-300 border border-slate-200/80 dark:border-white/[0.06]">
            {paper.year || "n/a"}
          </span>
          <div className="inline-flex items-center gap-1.5 h-6 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-800 dark:bg-white/[0.06] dark:text-slate-200 border border-slate-200/80 dark:border-white/[0.06]">
            <Star className="w-3.5 h-3.5 text-red-500 fill-red-500 shrink-0" />
            <span>{paper.citations ?? 0} Citations</span>
          </div>
          <span className="inline-flex items-center h-6 rounded-full bg-violet-500/10 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300 border border-violet-500/20 px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider">
            OPEN ACCESS
          </span>
        </div>
        
        <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black tracking-tight text-slate-900 dark:text-white mb-6 leading-snug">
          {paper.title}
        </h1>
        
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-base sm:text-lg font-medium text-slate-600 dark:text-slate-400 leading-relaxed max-w-4xl">
            By {paper.authors.join(", ")}
          </p>

          {/* ── Action Bar ── */}
          <div className="flex flex-wrap items-center gap-3 shrink-0">
            {paper.pdfUrl && (
              <button
                type="button"
                onClick={handleDownload}
                disabled={downloadState === "checking"}
                className="inline-flex items-center gap-2 rounded-full brand-active-pill hover:opacity-95 shadow-md active:scale-95 px-6 py-2.5 text-sm disabled:cursor-wait disabled:opacity-70"
              >
                {downloadState === "checking" ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                Download PDF
              </button>
            )}
            <a
              href={paper.landingPageUrl || "#"}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-6 py-2.5 text-sm font-medium text-slate-600 shadow-xs transition-all hover:border-slate-300 hover:text-slate-900 hover:bg-slate-50 active:scale-95 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-zinc-300 dark:hover:bg-white/[0.08]"
            >
              Publisher Page <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        </div>
        {downloadState === "error" && (
          <p role="alert" className="text-sm font-medium text-red-600 dark:text-red-400">
            A direct download isn't available for this paper. Please use the Publisher Page instead.
          </p>
        )}
      </header>

      <div className="lg:grid lg:grid-cols-12 lg:gap-10 lg:items-start mb-20">
        {/* ── LEFT COLUMN: Abstract ── */}
        <div className="lg:col-span-5 mb-12 lg:mb-0">
          <section className="rounded-2xl bg-slate-50 p-6 sm:p-8 dark:bg-white/[0.02] border border-slate-100 dark:border-white/[0.05]">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500 mb-5">
              Abstract
            </h3>
            <p className="text-base sm:text-lg leading-relaxed text-slate-700 dark:text-zinc-300">
              {paper.abstract || "No abstract available for this paper."}
            </p>
          </section>
        </div>

        {/* ── RIGHT COLUMN: PDF Viewer ── */}
        <div className="lg:col-span-7">
          {paper.pdfUrl ? (
            <PdfErrorBoundary key={paper.pdfUrl} fallback={<PdfPreviewFallback landingPageUrl={paper.landingPageUrl} />}>
              <Suspense
                fallback={
                  <div className="flex h-[600px] items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 dark:border-white/[0.08] dark:bg-zinc-950 lg:h-[80vh]">
                    <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
                  </div>
                }
              >
                <RestrictedPdfViewer key={paper.pdfUrl} pdfUrl={paper.pdfUrl} title={paper.title} landingPageUrl={paper.landingPageUrl} />
              </Suspense>
            </PdfErrorBoundary>
          ) : (
            <div className="flex h-[400px] flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center shadow-sm dark:border-white/[0.08] dark:bg-zinc-950 lg:sticky lg:top-24">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-200 dark:bg-slate-800">
                <FileText className="h-6 w-6 text-slate-500 dark:text-slate-400" />
              </div>
              <div>
                <h3 className="mb-1 text-lg font-bold text-slate-800 dark:text-zinc-200">No PDF Available</h3>
                <p className="text-sm text-slate-500 dark:text-zinc-400 max-w-sm mx-auto">
                  Live document preview is not available for this publisher. Please try downloading or visiting the publisher's page directly.
                </p>
              </div>
              <div className="mt-2 flex flex-col gap-3 sm:flex-row">
                {paper.landingPageUrl && (
                  <a
                    href={paper.landingPageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-full bg-violet-600 px-6 py-2 text-sm font-semibold text-white transition-colors hover:bg-violet-700"
                  >
                    Publisher Page <ExternalLink className="h-4 w-4" />
                  </a>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* --- SEE ALSO / RELATED RESEARCH SECTION: renders only real cards; absent entirely when there are none --- */}
      {validRelatedPapers.length > 0 && (
        <section className="mt-16 pt-10 border-t border-slate-200 dark:border-white/[0.08] w-full">
          <div className="mb-6">
            <h2 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">See Also / Related Research</h2>
            <p className="text-sm text-slate-500 dark:text-zinc-400 mt-1">Explore papers related to this domain</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {validRelatedPapers.map((relPaper) => (
              <ResearchPaperCard
                key={relPaper.id}
                paper={relPaper}
                itemVariants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0 } }}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
