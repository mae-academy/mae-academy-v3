import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Check, Copy, FileCode2, ImageDown, Maximize2, PenLine, TriangleAlert, X, ZoomIn, ZoomOut } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { CodeBlock, copyText } from "./CodeBlock";
import { diagramFilename, downloadBlob, rasterizeSvg, svgBlob, svgDataUri } from "./svgExport";
import { sanitizeSvg, type SanitizedSvg } from "./svgSanitize";

const ZOOM_STEP = 1.25;
const ZOOM_MIN = 0.1;
const ZOOM_MAX = 8;
const LIGHTBOX_PADDING = 24;

const iconButton =
  "inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-blue-600 disabled:cursor-progress disabled:opacity-50 sm:size-8";

type CopyState = "idle" | "copied" | "failed";

/** Shown in the diagram's slot while the model is still writing the SVG (no partial parse is ever attempted). */
export function SvgDiagramPending() {
  const { t } = useTranslation("ai");
  return (
    <div role="status" aria-live="polite" className="my-4 overflow-hidden rounded-2xl bg-slate-50 ring-1 ring-slate-200 dark:bg-white/[0.04] dark:ring-white/10">
      <div className="flex h-44 flex-col items-center justify-center gap-4 sm:h-52">
        <svg aria-hidden="true" viewBox="0 0 160 60" className="h-16 w-40 text-slate-300 motion-safe:animate-pulse dark:text-zinc-600" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M8 30h28l5-12 10 24 10-24 10 24 5-12h28" />
          <circle cx="144" cy="30" r="4" fill="currentColor" stroke="none" />
          <path d="M8 30v22M144 34v18M8 52h136" strokeDasharray="2 7" />
        </svg>
        <p className="flex items-center gap-2 text-sm font-medium text-slate-500 dark:text-zinc-400">
          <PenLine className="h-4 w-4 motion-safe:animate-pulse" aria-hidden="true" />
          {t("diagram.drawing")}
        </p>
      </div>
    </div>
  );
}

function DiagramFallback({ source }: { source: string }) {
  const { t } = useTranslation("ai");
  return (
    <div>
      <CodeBlock code={source} language="xml" />
      <p role="note" className="-mt-2 mb-3 flex items-center gap-1.5 text-xs text-slate-500 dark:text-zinc-400">
        <TriangleAlert className="h-3.5 w-3.5 shrink-0 text-amber-500" aria-hidden="true" />
        {t("diagram.failed")}
      </p>
    </div>
  );
}

interface ToolbarProps {
  diagram: SanitizedSvg;
  /** `overlay` floats over the card on hover/focus (below sm it is a row under the picture); `bar` is a plain row. */
  variant: "overlay" | "bar";
  onExpand?: (opener: HTMLElement) => void;
}

function DiagramToolbar({ diagram, variant, onExpand }: ToolbarProps) {
  const { t } = useTranslation("ai");
  const [copy, setCopy] = useState<CopyState>("idle");
  const [busy, setBusy] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const saveSvg = () => {
    try {
      downloadBlob(svgBlob(diagram.svg), diagramFilename("svg"));
    } catch {
      toast.error(t("diagram.downloadFailed"));
    }
  };
  const savePng = async () => {
    if (busy) return;
    setBusy(true);
    try {
      downloadBlob(await rasterizeSvg(diagram.svg, diagram.width, diagram.height), diagramFilename("png"));
    } catch {
      toast.error(t("diagram.pngFailed"));
    } finally {
      setBusy(false);
    }
  };
  const copySvg = async () => {
    const ok = await copyText(diagram.svg);
    setCopy(ok ? "copied" : "failed");
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopy("idle"), 1800);
  };

  const status = copy === "copied" ? t("diagram.copied") : copy === "failed" ? t("chat.copyFailed") : "";
  return (
    <div
      role="group"
      aria-label={t("diagram.actions")}
      className={cn(
        "flex items-center justify-end gap-0.5",
        variant === "overlay" &&
          "border-t border-slate-200 bg-slate-50 px-1 sm:absolute sm:end-2 sm:top-2 sm:rounded-xl sm:border sm:bg-white/95 sm:p-0.5 sm:opacity-0 sm:shadow-sm sm:backdrop-blur sm:transition-opacity sm:group-focus-within:opacity-100 sm:group-hover:opacity-100 [@media(hover:none)]:sm:opacity-100",
      )}
    >
      {onExpand ? (
        <button type="button" className={iconButton} title={t("diagram.expand")} aria-label={t("diagram.expand")} onClick={(event) => onExpand(event.currentTarget)}>
          <Maximize2 className="h-4 w-4" aria-hidden="true" />
        </button>
      ) : null}
      <button type="button" className={iconButton} title={t("diagram.downloadSvg")} aria-label={t("diagram.downloadSvg")} onClick={saveSvg}>
        <FileCode2 className="h-4 w-4" aria-hidden="true" />
      </button>
      <button type="button" className={iconButton} title={t("diagram.downloadPng")} aria-label={t("diagram.downloadPng")} aria-busy={busy} disabled={busy} onClick={savePng}>
        <ImageDown className="h-4 w-4" aria-hidden="true" />
      </button>
      <button type="button" className={iconButton} title={t("diagram.copySvg")} aria-label={t("diagram.copySvg")} onClick={copySvg}>
        {copy === "copied" ? <Check className="h-4 w-4 text-emerald-600" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
      </button>
      <span role="status" aria-live="polite" className="sr-only">{status}</span>
    </div>
  );
}

const clampZoom = (value: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, value));

interface LightboxBodyProps {
  diagram: SanitizedSvg;
  src: string;
  alt: string;
  onClose: () => void;
}

/** Header (zoom, export, close) and the scrollable viewer. Mounted only while the dialog is open, so zoom resets on each open. */
function LightboxBody({ diagram, src, alt, onClose }: LightboxBodyProps) {
  const { t } = useTranslation("ai");
  // null means "fit to the viewer"; a number is a fixed scale of the drawing's own size.
  const [scale, setScale] = useState<number | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  const fitScale = useCallback(() => {
    const el = scroller.current;
    if (!el) return 1;
    return Math.min((el.clientWidth - LIGHTBOX_PADDING) / diagram.width, (el.clientHeight - LIGHTBOX_PADDING) / diagram.height);
  }, [diagram.height, diagram.width]);
  // Zooming keeps whatever is at the centre of the viewer at the centre.
  const anchor = useRef<{ x: number; y: number } | null>(null);
  const rememberCenter = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    anchor.current = {
      x: el.scrollWidth > el.clientWidth ? (el.scrollLeft + el.clientWidth / 2) / el.scrollWidth : 0.5,
      y: el.scrollHeight > el.clientHeight ? (el.scrollTop + el.clientHeight / 2) / el.scrollHeight : 0.5,
    };
  }, []);
  const zoomBy = useCallback((factor: number) => {
    rememberCenter();
    setScale((current) => clampZoom((current ?? fitScale()) * factor));
  }, [fitScale, rememberCenter]);
  useLayoutEffect(() => {
    const el = scroller.current;
    const center = anchor.current;
    anchor.current = null;
    if (!el || !center) return;
    el.scrollLeft = center.x * el.scrollWidth - el.clientWidth / 2;
    el.scrollTop = center.y * el.scrollHeight - el.clientHeight / 2;
  }, [scale]);

  // Ctrl/cmd + wheel (which is also how a trackpad pinch arrives) zooms instead of scrolling the page.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return undefined;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      zoomBy(Math.exp(-event.deltaY * 0.01));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomBy]);

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === "+" || event.key === "=") zoomBy(ZOOM_STEP);
    else if (event.key === "-") zoomBy(1 / ZOOM_STEP);
    else if (event.key === "0") setScale(null);
    else return;
    event.preventDefault();
  };

  const percent = scale === null ? null : Math.round(scale * 100);
  return (
    <div className="flex min-h-0 flex-1 flex-col" onKeyDown={onKeyDown}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-slate-200 bg-slate-50 py-1 ps-4 pe-1">
        <DialogTitle className="order-1 min-w-0 flex-1 truncate text-sm font-semibold leading-normal">{alt}</DialogTitle>
        <DialogDescription className="sr-only">{t("diagram.lightboxHint")}</DialogDescription>
        {/* Below sm the tools drop to their own row so the close button stays beside the title. */}
        <div className="order-3 flex w-full items-center justify-center gap-x-3 sm:order-2 sm:w-auto">
          <div role="group" aria-label={t("diagram.zoom")} className="flex items-center gap-0.5">
            <button type="button" className={iconButton} title={t("diagram.zoomOut")} aria-label={t("diagram.zoomOut")} onClick={() => zoomBy(1 / ZOOM_STEP)}>
              <ZoomOut className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              className="inline-flex h-11 min-w-14 items-center justify-center rounded-lg px-2 text-xs font-semibold tabular-nums text-slate-700 transition-colors hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-blue-600 sm:h-8"
              title={t("diagram.fit")}
              aria-label={t("diagram.fit")}
              onClick={() => setScale(null)}
            >
              {percent === null ? t("diagram.fitShort") : `${percent}%`}
            </button>
            <button type="button" className={iconButton} title={t("diagram.zoomIn")} aria-label={t("diagram.zoomIn")} onClick={() => zoomBy(ZOOM_STEP)}>
              <ZoomIn className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <span aria-hidden="true" className="hidden h-5 w-px bg-slate-200 sm:block" />
          <DiagramToolbar diagram={diagram} variant="bar" />
        </div>
        <button type="button" className={cn(iconButton, "order-2 sm:order-3")} title={t("diagram.close")} aria-label={t("diagram.close")} onClick={onClose}>
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <div ref={scroller} dir="ltr" className="relative min-h-0 flex-1 overflow-auto bg-white">
        {scale === null ? (
          <img src={src} alt={alt} draggable={false} className="absolute inset-0 h-full w-full object-contain p-3" />
        ) : (
          <div className="flex min-h-full min-w-full p-3">
            <img src={src} alt={alt} draggable={false} className="m-auto max-w-none shrink-0" style={{ width: diagram.width * scale, height: diagram.height * scale }} />
          </div>
        )}
      </div>
    </div>
  );
}

function DiagramCard({ diagram }: { diagram: SanitizedSvg }) {
  const { t } = useTranslation("ai");
  const src = useMemo(() => svgDataUri(diagram.svg), [diagram.svg]);
  const alt = diagram.title ?? t("diagram.label");
  const [open, setOpen] = useState(false);
  // Focus returns to whatever opened the viewer (the picture or the expand button).
  const opener = useRef<HTMLElement | null>(null);
  const expand = (element: HTMLElement) => {
    opener.current = element;
    setOpen(true);
  };

  return (
    <figure className="group relative my-4 overflow-hidden rounded-2xl bg-white ring-1 ring-slate-200 dark:ring-white/20">
      <button
        type="button"
        dir="ltr"
        onClick={(event) => expand(event.currentTarget)}
        aria-label={t("diagram.open", { title: alt })}
        className="block w-full cursor-zoom-in focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-600"
      >
        {/* The size is reserved up front so the transcript does not jump when the image decodes. */}
        <img
          src={src}
          alt=""
          width={diagram.width}
          height={diagram.height}
          draggable={false}
          style={{ aspectRatio: `${diagram.width} / ${diagram.height}` }}
          className="mx-auto block h-auto max-h-[30rem] w-full object-contain"
        />
      </button>
      <DiagramToolbar diagram={diagram} variant="overlay" onExpand={expand} />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          showCloseButton={false}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            opener.current?.focus();
          }}
          className="top-1/2 left-1/2 flex h-[calc(100dvh-1.5rem)] w-[calc(100vw-1.5rem)] max-w-none flex-col gap-0 overflow-hidden rounded-2xl border-0 bg-white p-0 text-slate-900 sm:h-[calc(100dvh-3rem)] sm:w-[calc(100vw-3rem)] sm:max-w-none"
        >
          <LightboxBody diagram={diagram} src={src} alt={alt} onClose={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </figure>
  );
}

/** A finished diagram fence: the sanitized drawing in a card, or the raw source plus a note when it cannot be shown. */
function SvgDiagramImpl({ source }: { source: string }) {
  const diagram = useMemo(() => sanitizeSvg(source), [source]);
  return diagram ? <DiagramCard diagram={diagram} /> : <DiagramFallback source={source} />;
}

export const SvgDiagram = memo(SvgDiagramImpl);
export default SvgDiagram;
