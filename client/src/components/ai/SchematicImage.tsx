import { memo, useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ImageDown, Maximize2, RotateCcw, ShieldAlert, Sparkles, TriangleAlert, X, ZoomIn, ZoomOut } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { clampPrompt, cachedSchematic, forgetSchematic, loadSchematic, type SchematicSource } from "./schematicClient";

const ZOOM_STEP = 1.25;
const ZOOM_MIN = 1;
const ZOOM_MAX = 8;

const iconButton =
  "inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-blue-600 disabled:cursor-progress disabled:opacity-50 sm:size-8";

const pillButton =
  "inline-flex min-h-11 items-center gap-2 rounded-full border border-slate-300 bg-white px-4 text-sm font-medium text-slate-800 transition-colors hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:border-white/[0.14] dark:bg-transparent dark:text-zinc-100 dark:hover:bg-white/[0.08]";

type Phase = "idle" | "loading" | "ready" | "error";

interface View {
  phase: Phase;
  source?: SchematicSource;
  /** `src` for the <img>; an object URL for server bytes, the host URL for the fallback. */
  src?: string;
}

function extensionFor(type: string): string {
  return type === "image/jpeg" ? "jpg" : type === "image/webp" ? "webp" : "png";
}

function schematicFilename(extension: string): string {
  return `mae-schematic-${Date.now()}.${extension}`;
}

function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

interface ToolbarProps {
  variant: "overlay" | "bar";
  busy: boolean;
  onExpand?: (opener: HTMLElement) => void;
  onDownload: () => void;
  onRegenerate: () => void;
}

function SchematicToolbar({ variant, busy, onExpand, onDownload, onRegenerate }: ToolbarProps) {
  const { t } = useTranslation("ai");
  return (
    <div
      role="group"
      aria-label={t("schematic.actions")}
      className={cn(
        "flex items-center justify-end gap-0.5",
        variant === "overlay" &&
          "border-t border-slate-200 bg-slate-50 px-1 sm:absolute sm:end-2 sm:top-2 sm:rounded-xl sm:border sm:bg-white/95 sm:p-0.5 sm:opacity-0 sm:shadow-sm sm:backdrop-blur sm:transition-opacity sm:group-focus-within:opacity-100 sm:group-hover:opacity-100 [@media(hover:none)]:sm:opacity-100",
      )}
    >
      {onExpand ? (
        <button type="button" className={iconButton} title={t("schematic.expand")} aria-label={t("schematic.expand")} onClick={(event) => onExpand(event.currentTarget)}>
          <Maximize2 className="h-4 w-4" aria-hidden="true" />
        </button>
      ) : null}
      <button type="button" className={iconButton} title={t("schematic.download")} aria-label={t("schematic.download")} onClick={onDownload}>
        <ImageDown className="h-4 w-4" aria-hidden="true" />
      </button>
      <button type="button" className={iconButton} title={t("schematic.regenerate")} aria-label={t("schematic.regenerate")} disabled={busy} onClick={onRegenerate}>
        <RotateCcw className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}

const clampZoom = (value: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, value));

interface LightboxProps {
  src: string;
  alt: string;
  busy: boolean;
  onClose: () => void;
  onDownload: () => void;
  onRegenerate: () => void;
}

/** Header (zoom, download, close) and the scrollable viewer. Mounted only while the dialog is open, so zoom resets on each open. */
function Lightbox({ src, alt, busy, onClose, onDownload, onRegenerate }: LightboxProps) {
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
        <DialogTitle className="order-1 min-w-0 flex-1 truncate text-sm font-semibold leading-normal">{t("schematic.label")}</DialogTitle>
        <DialogDescription className="sr-only">{t("schematic.lightboxHint")}</DialogDescription>
        <div className="order-3 flex w-full items-center justify-center gap-x-3 sm:order-2 sm:w-auto">
          <div role="group" aria-label={t("schematic.zoom")} className="flex items-center gap-0.5">
            <button type="button" className={iconButton} title={t("schematic.zoomOut")} aria-label={t("schematic.zoomOut")} onClick={() => zoomBy(1 / ZOOM_STEP)}>
              <ZoomOut className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              className="inline-flex h-11 min-w-14 items-center justify-center rounded-lg px-2 text-xs font-semibold tabular-nums text-slate-700 transition-colors hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-blue-600 sm:h-8"
              title={t("schematic.fit")}
              aria-label={t("schematic.fit")}
              onClick={() => setZoom(1)}
            >
              {zoom === 1 ? t("schematic.fitShort") : `${Math.round(zoom * 100)}%`}
            </button>
            <button type="button" className={iconButton} title={t("schematic.zoomIn")} aria-label={t("schematic.zoomIn")} onClick={() => zoomBy(ZOOM_STEP)}>
              <ZoomIn className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <span aria-hidden="true" className="hidden h-5 w-px bg-slate-200 sm:block" />
          <SchematicToolbar variant="bar" busy={busy} onDownload={onDownload} onRegenerate={onRegenerate} />
        </div>
        <button type="button" className={cn(iconButton, "order-2 sm:order-3")} title={t("schematic.close")} aria-label={t("schematic.close")} onClick={onClose}>
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

export interface SchematicImageProps {
  /** The text-to-image prompt from the model's `[GENERATE_SCHEMATIC: ...]` tag (untrusted text; never rendered as HTML). */
  prompt: string;
  /** True for replies created in this session: the image generates on its own. Restored chats show a button instead. */
  autoStart: boolean;
}

function SchematicImageImpl({ prompt: rawPrompt, autoStart }: SchematicImageProps) {
  const { t } = useTranslation("ai");
  const prompt = clampPrompt(rawPrompt);
  const [view, setView] = useState<View>(() => ({ phase: "idle" }));
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLElement | null>(null);
  const objectUrl = useRef<string | null>(null);
  const runId = useRef(0);

  const releaseUrl = useCallback(() => {
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = null;
  }, []);

  const show = useCallback(
    (source: SchematicSource): View => {
      releaseUrl();
      if (source.kind === "server") {
        objectUrl.current = URL.createObjectURL(source.blob);
        return { phase: "ready", source, src: objectUrl.current };
      }
      // The host image is still downloading: keep the skeleton up until the <img> reports it loaded.
      return { phase: "loading", source, src: source.url };
    },
    [releaseUrl],
  );

  const start = useCallback(
    (fresh: boolean) => {
      const id = ++runId.current;
      releaseUrl();
      setView({ phase: "loading" });
      loadSchematic(prompt, { fresh }).then(
        (source) => {
          if (runId.current === id) setView(show(source));
        },
        () => {
          if (runId.current === id) setView({ phase: "error" });
        },
      );
    },
    [prompt, releaseUrl, show],
  );

  useEffect(() => {
    const cached = cachedSchematic(prompt);
    if (cached) setView(show(cached));
    else if (autoStart) start(false);
    else setView({ phase: "idle" });
    return () => {
      runId.current += 1; // a late result for the old prompt is ignored
      releaseUrl();
    };
    // `autoStart` is read once per prompt: flipping it later must not trigger a request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prompt]);

  const onImageLoad = () => setView((current) => (current.phase === "loading" && current.src ? { ...current, phase: "ready" } : current));
  const onImageError = () => {
    forgetSchematic(prompt);
    releaseUrl();
    setView({ phase: "error" });
  };

  const download = async () => {
    const source = view.source;
    if (!source) return;
    try {
      if (source.kind === "server") {
        saveBlob(source.blob, schematicFilename(extensionFor(source.blob.type)));
        return;
      }
      // The host may not allow reading the image across origins; then the image is opened for a manual save.
      const response = await fetch(source.url);
      if (!response.ok) throw new Error("fetch failed");
      const blob = await response.blob();
      saveBlob(blob, schematicFilename(extensionFor(blob.type)));
    } catch {
      if (source.kind === "fallback") {
        window.open(source.url, "_blank", "noopener,noreferrer");
        toast(t("schematic.openedInTab"));
      } else {
        toast.error(t("schematic.downloadFailed"));
      }
    }
  };

  const busy = view.phase === "loading";
  const alt = t("schematic.alt", { prompt });
  const expand = (element: HTMLElement) => {
    opener.current = element;
    setOpen(true);
  };

  if (view.phase === "idle") {
    return (
      <div className="my-4">
        <button type="button" className={pillButton} onClick={() => start(false)}>
          <Sparkles className="h-4 w-4 text-violet-500" aria-hidden="true" />
          {t("schematic.generate")}
        </button>
      </div>
    );
  }

  if (view.phase === "error") {
    return (
      <div role="alert" className="my-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-zinc-300">
        <TriangleAlert className="h-5 w-5 shrink-0 text-amber-500" aria-hidden="true" />
        <p className="min-w-0 flex-1" dir="auto">{t("schematic.failed")}</p>
        <button type="button" className={pillButton} onClick={() => start(true)}>
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          {t("schematic.retry")}
        </button>
      </div>
    );
  }

  const loading = view.phase === "loading";
  return (
    <figure className="my-4">
      <div className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-white/20">
        {loading ? (
          <div role="status" aria-live="polite" className="flex aspect-[16/10] w-full flex-col items-center justify-center gap-4 bg-slate-50">
            <svg aria-hidden="true" viewBox="0 0 160 60" className="h-16 w-40 text-slate-300 motion-safe:animate-pulse" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 30h28l5-12 10 24 10-24 10 24 5-12h28" />
              <circle cx="144" cy="30" r="4" fill="currentColor" stroke="none" />
              <path d="M8 30v22M144 34v18M8 52h136" strokeDasharray="2 7" />
            </svg>
            <p className="flex items-center gap-2 text-sm font-medium text-slate-500">
              <Sparkles className="h-4 w-4 motion-safe:animate-pulse" aria-hidden="true" />
              {t("schematic.generating")}
            </p>
          </div>
        ) : null}
        {view.src ? (
          <button
            type="button"
            dir="ltr"
            tabIndex={loading ? -1 : 0}
            hidden={loading}
            onClick={(event) => expand(event.currentTarget)}
            aria-label={t("schematic.open")}
            className="block w-full cursor-zoom-in focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-600"
          >
            <img
              src={view.src}
              alt={alt}
              draggable={false}
              referrerPolicy="no-referrer"
              onLoad={onImageLoad}
              onError={onImageError}
              className="mx-auto block h-auto max-h-[32rem] w-full bg-white object-contain"
            />
          </button>
        ) : null}
        {!loading ? <SchematicToolbar variant="overlay" busy={busy} onExpand={expand} onDownload={download} onRegenerate={() => start(true)} /> : null}
      </div>
      {!loading ? (
        <figcaption className="mt-2 space-y-1 text-xs text-slate-500 dark:text-zinc-400" dir="auto">
          {view.source?.kind === "fallback" ? (
            <p role="note" className="flex items-start gap-1.5">
              <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" aria-hidden="true" />
              {t("schematic.fallbackNote")}
            </p>
          ) : null}
          <p className="flex items-start gap-1.5">
            <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {t("schematic.disclaimer")}
          </p>
        </figcaption>
      ) : null}
      {view.src && !loading ? (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent
            showCloseButton={false}
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              opener.current?.focus();
            }}
            className="top-1/2 left-1/2 flex h-[calc(100dvh-1.5rem)] w-[calc(100vw-1.5rem)] max-w-none flex-col gap-0 overflow-hidden rounded-2xl border-0 bg-white p-0 text-slate-900 sm:h-[calc(100dvh-3rem)] sm:w-[calc(100vw-3rem)] sm:max-w-none"
          >
            <Lightbox src={view.src} alt={alt} busy={busy} onClose={() => setOpen(false)} onDownload={download} onRegenerate={() => { setOpen(false); start(true); }} />
          </DialogContent>
        </Dialog>
      ) : null}
    </figure>
  );
}

export const SchematicImage = memo(SchematicImageImpl);
export default SchematicImage;
