import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import PdfPreviewFallback from "@/components/PdfPreviewFallback";
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  MoveHorizontal,
  Maximize2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";

pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

interface RestrictedPdfViewerProps {
  pdfUrl: string;
  title: string;
  /** Publisher landing page, offered when the preview cannot be rendered. */
  landingPageUrl: string;
  /** Label of the fallback link (defaults to "Publisher Page"). */
  landingLabel?: string;
}

type FitMode = "width" | "page" | null;

const MIN_SCALE = 0.4;
const MAX_SCALE = 3;
const ZOOM_STEP = 0.2;
const PAGE_PADDING = 32;
const LOAD_TIMEOUT_MS = 60_000;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const toolButton =
  "flex h-8 w-8 items-center justify-center rounded-full text-slate-600 transition-colors hover:bg-slate-200 disabled:opacity-30 disabled:hover:bg-transparent dark:text-zinc-300 dark:hover:bg-white/[0.08]";

/**
 * Canvas-only PDF renderer with a deliberately minimal toolbar (navigation + zoom + fit).
 * No download / print / open controls, no text or link layers, context menu disabled, hidden when printing.
 * The document is always fetched through the same-origin /api/pdf-proxy so publisher CORS / framing rules never apply.
 */
export default function RestrictedPdfViewer({ pdfUrl, title, landingPageUrl, landingLabel }: RestrictedPdfViewerProps) {
  const [numPages, setNumPages] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const [fit, setFit] = useState<FitMode>("width");
  const [manualScale, setManualScale] = useState(1);
  const [pageSize, setPageSize] = useState<{ width: number; height: number } | null>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });
  const [failed, setFailed] = useState(false);

  const viewportRef = useRef<HTMLDivElement>(null);
  const proxyUrl = `/api/pdf-proxy?url=${encodeURIComponent(pdfUrl)}`;

  // A document that never reports its page count (stalled proxy, worker failure) must not spin forever.
  useEffect(() => {
    if (numPages > 0 || failed) return;
    const timer = setTimeout(() => setFailed(true), LOAD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [numPages, failed]);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      setBox({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [failed]);

  const scale = useMemo(() => {
    if (!fit || !pageSize || box.width === 0) return manualScale;
    const byWidth = (box.width - PAGE_PADDING) / pageSize.width;
    const byHeight = (box.height - PAGE_PADDING) / pageSize.height;
    return clamp(fit === "width" ? byWidth : Math.min(byWidth, byHeight), MIN_SCALE, MAX_SCALE);
  }, [fit, pageSize, box, manualScale]);

  const goTo = useCallback(
    (target: number) => {
      const next = clamp(target, 1, Math.max(1, numPages));
      setPageNumber(next);
      setPageInput(String(next));
      viewportRef.current?.scrollTo({ top: 0 });
    },
    [numPages],
  );

  const zoomBy = (delta: number) => {
    setFit(null);
    setManualScale(clamp(scale + delta, MIN_SCALE, MAX_SCALE));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // Swallow save / print shortcuts while the viewer has focus.
    if ((e.ctrlKey || e.metaKey) && ["s", "p"].includes(e.key.toLowerCase())) {
      e.preventDefault();
      return;
    }
    if (e.target instanceof HTMLInputElement) return;
    if (e.key === "ArrowRight" || e.key === "PageDown") goTo(pageNumber + 1);
    if (e.key === "ArrowLeft" || e.key === "PageUp") goTo(pageNumber - 1);
  };

  if (failed) return <PdfPreviewFallback landingPageUrl={landingPageUrl} landingLabel={landingLabel} />;

  return (
    <div
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onContextMenu={(e) => e.preventDefault()}
      aria-label={`Document preview: ${title}`}
      className="flex h-[600px] select-none flex-col overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 shadow-sm outline-none dark:border-white/[0.08] dark:bg-zinc-950 lg:sticky lg:top-24 lg:h-[80vh] print:hidden"
    >
      {/* ── Restricted toolbar: navigation, zoom, fit. Nothing else. ── */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white/60 px-3 py-2 text-xs text-slate-600 dark:border-white/[0.06] dark:bg-zinc-900/60 dark:text-zinc-300">
        <div className="flex items-center gap-1">
          <button type="button" className={toolButton} onClick={() => goTo(pageNumber - 1)} disabled={pageNumber <= 1} aria-label="Previous page">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <input
            value={pageInput}
            inputMode="numeric"
            aria-label="Page number"
            disabled={numPages === 0}
            onChange={(e) => setPageInput(e.target.value.replace(/\D/g, ""))}
            onBlur={() => goTo(Number(pageInput) || pageNumber)}
            onKeyDown={(e) => e.key === "Enter" && goTo(Number(pageInput) || pageNumber)}
            className="h-7 w-11 rounded-md border border-slate-200 bg-white text-center text-xs font-semibold text-slate-800 focus:border-violet-500 focus:outline-none dark:border-white/[0.1] dark:bg-zinc-950 dark:text-white"
          />
          <span className="px-1 font-medium">/ {numPages || "–"}</span>
          <button type="button" className={toolButton} onClick={() => goTo(pageNumber + 1)} disabled={pageNumber >= numPages} aria-label="Next page">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="flex items-center gap-1">
          <button type="button" className={toolButton} onClick={() => zoomBy(-ZOOM_STEP)} disabled={scale <= MIN_SCALE} aria-label="Zoom out">
            <ZoomOut className="h-4 w-4" />
          </button>
          <span className="w-11 text-center font-semibold tabular-nums">{Math.round(scale * 100)}%</span>
          <button type="button" className={toolButton} onClick={() => zoomBy(ZOOM_STEP)} disabled={scale >= MAX_SCALE} aria-label="Zoom in">
            <ZoomIn className="h-4 w-4" />
          </button>
          <button
            type="button"
            className={`${toolButton} ${fit === "width" ? "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300" : ""}`}
            onClick={() => setFit("width")}
            aria-label="Fit to width"
            aria-pressed={fit === "width"}
          >
            <MoveHorizontal className="h-4 w-4" />
          </button>
          <button
            type="button"
            className={`${toolButton} ${fit === "page" ? "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300" : ""}`}
            onClick={() => setFit("page")}
            aria-label="Fit to page"
            aria-pressed={fit === "page"}
          >
            <Maximize2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* ── Canvas viewport ── */}
      <div ref={viewportRef} className="relative grow overflow-auto bg-slate-200/60 p-4 dark:bg-zinc-900/60">
        <Document
          file={proxyUrl}
          suspense={false}
          onLoadSuccess={({ numPages: total }) => setNumPages(total)}
          onLoadError={(err) => {
            console.error("PDF preview failed:", err);
            setFailed(true);
          }}
          onSourceError={(err) => {
            console.error("PDF source failed:", err);
            setFailed(true);
          }}
          loading={
            <div className="flex h-full min-h-[300px] items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-violet-500" />
            </div>
          }
          error={null}
          noData={null}
          className="flex justify-center"
        >
          <Page
            pageNumber={pageNumber}
            scale={scale}
            renderTextLayer={false}
            renderAnnotationLayer={false}
            onLoadSuccess={(page) => setPageSize({ width: page.originalWidth, height: page.originalHeight })}
            onLoadError={() => setFailed(true)}
            onRenderError={() => setFailed(true)}
            loading={
              <div className="flex h-[300px] items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-violet-400" />
              </div>
            }
            className="pointer-events-none shadow-lg [&_canvas]:!block"
          />
        </Document>
      </div>
    </div>
  );
}
