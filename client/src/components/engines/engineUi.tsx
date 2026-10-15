import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Braces, Code2, FileCode2, ImageDown, Loader2, Maximize2, TriangleAlert, X, ZoomIn, ZoomOut } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { CodeBlock, copyText } from "@/components/ai/CodeBlock";
import { downloadBlob, rasterizeSvg, svgBlob, svgDataUri } from "@/components/ai/schematicExport";

/** Shared chrome of the deterministic visual engines (Mermaid, WaveDrom): placeholders, error card, figure with toolbar and lightbox. */

const ZOOM_STEP = 1.25;
const ZOOM_MIN = 1;
const ZOOM_MAX = 8;
const clampZoom = (value: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, value));

export const iconButton =
  "inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-blue-600 disabled:cursor-progress disabled:opacity-50 sm:size-8";

export const pillButton =
  "inline-flex min-h-11 items-center gap-2 rounded-full border border-slate-300 bg-white px-4 text-sm font-medium text-slate-800 transition-colors hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:border-white/[0.14] dark:bg-transparent dark:text-zinc-100 dark:hover:bg-white/[0.08]";

export const cardShell = "my-4 overflow-hidden rounded-2xl bg-slate-50 ring-1 ring-slate-200 dark:bg-white/[0.04] dark:ring-white/10";

export function Skeleton() {
  return (
    <svg aria-hidden="true" viewBox="0 0 160 60" className="h-16 w-40 text-slate-300 motion-safe:animate-pulse dark:text-zinc-600" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="6" y="14" width="40" height="32" rx="4" />
      <rect x="114" y="14" width="40" height="32" rx="4" />
      <path d="M46 30h68M106 24l8 6-8 6" />
    </svg>
  );
}

/** A status placeholder in the slot of a diagram: still streaming (`busy` false) or being drawn (`busy` true). */
export function EngineStatus({ icon, text, busy = false }: { icon: ReactNode; text: string; busy?: boolean }) {
  return (
    <div role="status" aria-live="polite" className={cardShell}>
      <div className="flex h-44 flex-col items-center justify-center gap-4 sm:h-52">
        <Skeleton />
        <p className="flex items-center gap-2 text-sm font-medium text-slate-500 dark:text-zinc-400">
          {busy ? <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" /> : icon}
          {text}
        </p>
      </div>
    </div>
  );
}

/** Calm error card with the offending source underneath (never a stack trace). */
export function EngineError({ title, detail, source, language }: { title: string; detail?: string; source: string; language: string }) {
  return (
    <figure className="my-4">
      <div role="alert" className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900 dark:border-blue-400/25 dark:bg-blue-950/40 dark:text-blue-100">
        <p className="flex items-center gap-1.5 font-semibold">
          <TriangleAlert className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-200" aria-hidden="true" />
          {title}
        </p>
        {detail ? <p dir="auto" className="mt-1 break-words text-xs">{detail}</p> : null}
      </div>
      <CodeBlock code={source} language={language} />
    </figure>
  );
}

export function engineFilename(prefix: string, extension: "svg" | "png", now: Date = new Date()): string {
  return `${prefix}-${now.getTime()}.${extension}`;
}

interface Actions {
  expand?: (opener: HTMLElement) => void;
  downloadSvg: () => void;
  downloadPng: () => void;
  copySource: () => void;
  toggleSource: () => void;
  sourceShown: boolean;
}

function Toolbar({ variant, actions }: { variant: "overlay" | "bar"; actions: Actions }) {
  const { t } = useTranslation("ai");
  const button = (label: string, onClick: (el: HTMLElement) => void, icon: ReactNode, pressed?: boolean) => (
    <button type="button" className={iconButton} title={label} aria-label={label} aria-pressed={pressed} onClick={(event) => onClick(event.currentTarget)}>
      {icon}
    </button>
  );
  return (
    <div
      role="group"
      aria-label={t("engine.actions")}
      className={cn(
        "flex flex-wrap items-center justify-end gap-0.5",
        variant === "overlay" &&
          "border-t border-slate-200 bg-slate-50 px-1 sm:absolute sm:end-2 sm:top-2 sm:flex-nowrap sm:rounded-xl sm:border sm:bg-white/95 sm:p-0.5 sm:opacity-0 sm:shadow-sm sm:backdrop-blur sm:transition-opacity sm:group-focus-within:opacity-100 sm:group-hover:opacity-100 [@media(hover:none)]:sm:opacity-100",
      )}
    >
      {actions.expand ? button(t("engine.expand"), actions.expand, <Maximize2 className="h-4 w-4" aria-hidden="true" />) : null}
      {button(t("engine.downloadSvg"), () => actions.downloadSvg(), <FileCode2 className="h-4 w-4" aria-hidden="true" />)}
      {button(t("engine.downloadPng"), () => actions.downloadPng(), <ImageDown className="h-4 w-4" aria-hidden="true" />)}
      {button(t("engine.copySource"), () => actions.copySource(), <Braces className="h-4 w-4" aria-hidden="true" />)}
      {button(actions.sourceShown ? t("engine.hideSource") : t("engine.viewSource"), () => actions.toggleSource(), <Code2 className="h-4 w-4" aria-hidden="true" />, actions.sourceShown)}
    </div>
  );
}

function Lightbox({ src, alt, title, actions, onClose }: { src: string; alt: string; title: string; actions: Actions; onClose: () => void }) {
  const { t } = useTranslation("ai");
  const [zoom, setZoom] = useState(1);
  const zoomBy = (factor: number) => setZoom((current) => clampZoom(current * factor));
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === "+" || event.key === "=") zoomBy(ZOOM_STEP);
    else if (event.key === "-") zoomBy(1 / ZOOM_STEP);
    else if (event.key === "0") setZoom(1);
    else return;
    event.preventDefault();
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col" onKeyDown={onKeyDown}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-slate-200 bg-slate-50 py-1 ps-4 pe-1">
        <DialogTitle className="order-1 min-w-0 flex-1 truncate text-sm font-semibold leading-normal">{title}</DialogTitle>
        <DialogDescription className="sr-only">{t("engine.lightboxHint")}</DialogDescription>
        <div className="order-3 flex w-full flex-wrap items-center justify-center gap-x-3 sm:order-2 sm:w-auto">
          <div role="group" aria-label={t("engine.zoom")} className="flex items-center gap-0.5">
            <button type="button" className={iconButton} title={t("engine.zoomOut")} aria-label={t("engine.zoomOut")} onClick={() => zoomBy(1 / ZOOM_STEP)}>
              <ZoomOut className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              className="inline-flex h-11 min-w-14 items-center justify-center rounded-lg px-2 text-xs font-semibold tabular-nums text-slate-700 transition-colors hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-blue-600 sm:h-8"
              title={t("engine.fit")}
              aria-label={t("engine.fit")}
              onClick={() => setZoom(1)}
            >
              {zoom === 1 ? t("engine.fitShort") : `${Math.round(zoom * 100)}%`}
            </button>
            <button type="button" className={iconButton} title={t("engine.zoomIn")} aria-label={t("engine.zoomIn")} onClick={() => zoomBy(ZOOM_STEP)}>
              <ZoomIn className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <span aria-hidden="true" className="hidden h-5 w-px bg-slate-200 sm:block" />
          <Toolbar variant="bar" actions={{ ...actions, expand: undefined }} />
        </div>
        <button type="button" className={cn(iconButton, "order-2 sm:order-3")} title={t("engine.close")} aria-label={t("engine.close")} onClick={onClose}>
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <div dir="ltr" className="relative min-h-0 flex-1 overflow-auto bg-white">
        <div className="flex min-h-full min-w-full items-center justify-center p-3">
          <img src={src} alt={alt} draggable={false} className="block h-auto max-w-none shrink-0 bg-white" style={{ width: `${zoom * 100}%` }} />
        </div>
      </div>
    </div>
  );
}

export interface ImageFigureProps {
  /** Final, inspected SVG markup. It is only ever displayed through <img> (no script execution, no subresources). */
  svg: string;
  width: number;
  height: number;
  alt: string;
  title: string;
  /** Text copied by "Copy source" and shown by "View source". */
  source: string;
  sourceLanguage: string;
  filePrefix: string;
}

export function ImageFigure({ svg, width, height, alt, title, source, sourceLanguage, filePrefix }: ImageFigureProps) {
  const { t } = useTranslation("ai");
  const [open, setOpen] = useState(false);
  const [sourceShown, setSourceShown] = useState(false);
  const opener = useRef<HTMLElement | null>(null);
  const src = svgDataUri(svg);

  const downloadSvg = () => {
    try {
      downloadBlob(svgBlob(svg), engineFilename(filePrefix, "svg"));
    } catch {
      toast.error(t("engine.downloadFailed"));
    }
  };
  const actions: Actions = {
    expand: (element) => {
      opener.current = element;
      setOpen(true);
    },
    downloadSvg,
    downloadPng: () => {
      rasterizeSvg(svg, width, height).then(
        (blob) => downloadBlob(blob, engineFilename(filePrefix, "png")),
        () => {
          // Some browsers refuse to export a canvas that held a foreignObject: give the vector file instead.
          toast.message(t("engine.pngFallback"));
          downloadSvg();
        },
      );
    },
    copySource: () => {
      void copyText(source).then((ok) => (ok ? toast.success(t("engine.copied")) : toast.error(t("engine.copyFailed"))));
    },
    toggleSource: () => setSourceShown((shown) => !shown),
    sourceShown,
  };

  return (
    <figure className="my-4">
      <div className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-white/20">
        <button
          type="button"
          dir="ltr"
          onClick={(event) => actions.expand?.(event.currentTarget)}
          aria-label={t("engine.open")}
          className="block w-full cursor-zoom-in bg-white p-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-600"
        >
          <img src={src} alt={alt} draggable={false} className="mx-auto block h-auto max-h-[32rem] w-full bg-white object-contain" style={{ maxWidth: width }} />
        </button>
        <Toolbar variant="overlay" actions={actions} />
      </div>
      {sourceShown ? <CodeBlock code={source} language={sourceLanguage} /> : null}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          showCloseButton={false}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            opener.current?.focus();
          }}
          className="top-1/2 left-1/2 flex h-[calc(100dvh-1.5rem)] w-[calc(100vw-1.5rem)] max-w-none flex-col gap-0 overflow-hidden rounded-2xl border-0 bg-white p-0 text-slate-900 sm:h-[calc(100dvh-3rem)] sm:w-[calc(100vw-3rem)] sm:max-w-none"
        >
          <Lightbox src={src} alt={alt} title={title} actions={actions} onClose={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </figure>
  );
}
