import { createContext, memo, useCallback, useContext, useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { ChartLine, Code2, ImageDown, Loader2, Maximize2, Play, TriangleAlert, Wrench, X, ZoomIn, ZoomOut } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { cachedPlot, runningPlot, startPlot, type PlotOutcome } from "@/features/plot/plotJobs";
import { PLOT_STAGES, type PlotError, type PlotResult, type PlotStage } from "@/features/plot/plotProtocol";
import { CodeBlock } from "./CodeBlock";
import { downloadBlob } from "./schematicExport";

/** True for messages created in this page session: their plot runs on its own. Restored ones wait for a click (no silent 20 MB download). */
export const PlotAutoRunContext = createContext(false);

/** Sends a follow-up message in the current chat (the "Ask MAE AI to fix this plot" button); null where sending is not possible. */
export const PlotFixContext = createContext<((text: string) => void) | null>(null);

const ZOOM_STEP = 1.25;
const ZOOM_MIN = 1;
const ZOOM_MAX = 6;
const clampZoom = (value: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, value));

const iconButton =
  "inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-blue-600 disabled:cursor-progress disabled:opacity-50 sm:size-8";

const pillButton =
  "inline-flex min-h-11 items-center gap-2 rounded-full border border-slate-300 bg-white px-4 text-sm font-medium text-slate-800 transition-colors hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:border-white/[0.14] dark:bg-transparent dark:text-zinc-100 dark:hover:bg-white/[0.08]";

const cardShell = "my-4 overflow-hidden rounded-2xl bg-slate-50 ring-1 ring-slate-200 dark:bg-white/[0.04] dark:ring-white/10";

function SkeletonPlot() {
  return (
    <svg aria-hidden="true" viewBox="0 0 160 60" className="h-16 w-40 text-blue-500/70 motion-safe:animate-pulse dark:text-blue-300/60" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 6v48h144" className="text-slate-400 dark:text-zinc-500" />
      <path d="M14 44c14-34 22-34 34-6s22 22 34-4 24-18 36-12 14 4 24 0" />
    </svg>
  );
}

/** Loading skeleton for a plot: engineering grid, soft blue/violet glow, a sweeping shimmer, and the content centered on top. */
function ShimmerShell({ children }: { children: ReactNode }) {
  return (
    <div role="status" aria-live="polite" data-plot-skeleton className="relative isolate my-4 overflow-hidden rounded-2xl bg-slate-50 ring-1 ring-blue-200/70 dark:bg-white/[0.04] dark:ring-blue-400/20">
      <div aria-hidden="true" className="mae-plot-grid absolute inset-0 -z-10" />
      <div aria-hidden="true" className="absolute -top-12 start-[18%] -z-10 size-44 rounded-full bg-blue-500/25 blur-3xl motion-safe:animate-pulse dark:bg-blue-500/20" />
      <div aria-hidden="true" className="absolute -bottom-14 end-[18%] -z-10 size-44 rounded-full bg-violet-500/25 blur-3xl motion-safe:animate-pulse [animation-delay:700ms] dark:bg-violet-500/20" />
      <div aria-hidden="true" className="mae-plot-shimmer absolute inset-y-0 start-0 -z-10 w-1/3 bg-gradient-to-r from-transparent via-white/60 to-transparent dark:via-white/10" />
      {children}
    </div>
  );
}

/** Shown in the plot's slot while the model is still writing the script. */
export function PlotPending() {
  const { t } = useTranslation("ai");
  return (
    <ShimmerShell>
      <div className="flex h-44 flex-col items-center justify-center gap-4 sm:h-52">
        <SkeletonPlot />
        <p className="flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-zinc-300">
          <ChartLine className="h-4 w-4 text-blue-600 motion-safe:animate-pulse dark:text-blue-300" aria-hidden="true" />
          {t("plot.preparing")}
        </p>
      </div>
    </ShimmerShell>
  );
}

/** Shown while the Python runtime loads and the script runs. */
function LoadingCard({ stage }: { stage: PlotStage | null }) {
  const { t } = useTranslation("ai");
  const visible = PLOT_STAGES.filter((s) => s !== "scipy" || stage === "scipy");
  const index = stage ? visible.indexOf(stage) : -1;
  return (
    <ShimmerShell>
      <div className="flex min-h-44 flex-col items-center justify-center gap-3 px-4 py-6 text-center sm:min-h-52">
        <SkeletonPlot />
        <p className="text-sm font-semibold text-slate-800 dark:text-zinc-100">{t("plot.synthesizing")}</p>
        <p className="flex items-center gap-2 text-xs font-medium text-slate-600 dark:text-zinc-300">
          <Loader2 className="h-3.5 w-3.5 text-blue-600 motion-safe:animate-spin dark:text-blue-300" aria-hidden="true" />
          {stage ? t(`plot.stage.${stage}`) : t("plot.waiting")}
          {index >= 0 ? <span className="font-normal text-slate-500 dark:text-zinc-400">{t("plot.step", { n: index + 1, total: visible.length })}</span> : null}
        </p>
        <p className="max-w-md text-xs text-slate-500 dark:text-zinc-400">{t("plot.loadingHint")}</p>
      </div>
    </ShimmerShell>
  );
}

interface Actions {
  expand?: (opener: HTMLElement) => void;
  download: () => void;
  toggleCode: () => void;
  codeShown: boolean;
}

function Toolbar({ variant, actions }: { variant: "overlay" | "bar"; actions: Actions }) {
  const { t } = useTranslation("ai");
  const button = (label: string, onClick: (el: HTMLElement) => void, icon: React.ReactNode, pressed?: boolean) => (
    <button type="button" className={iconButton} title={label} aria-label={label} aria-pressed={pressed} onClick={(event) => onClick(event.currentTarget)}>
      {icon}
    </button>
  );
  return (
    <div
      role="group"
      aria-label={t("plot.actions")}
      className={cn(
        "flex flex-wrap items-center justify-end gap-0.5",
        variant === "overlay" &&
          "border-t border-slate-200 bg-slate-50 px-1 sm:absolute sm:end-2 sm:top-2 sm:flex-nowrap sm:rounded-xl sm:border sm:bg-white/95 sm:p-0.5 sm:opacity-0 sm:shadow-sm sm:backdrop-blur sm:transition-opacity sm:group-focus-within:opacity-100 sm:group-hover:opacity-100 [@media(hover:none)]:sm:opacity-100",
      )}
    >
      {actions.expand ? button(t("plot.expand"), actions.expand, <Maximize2 className="h-4 w-4" aria-hidden="true" />) : null}
      {button(t("plot.download"), () => actions.download(), <ImageDown className="h-4 w-4" aria-hidden="true" />)}
      {button(actions.codeShown ? t("plot.hideCode") : t("plot.viewCode"), () => actions.toggleCode(), <Code2 className="h-4 w-4" aria-hidden="true" />, actions.codeShown)}
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
        <DialogDescription className="sr-only">{t("plot.lightboxHint")}</DialogDescription>
        <div className="order-3 flex w-full flex-wrap items-center justify-center gap-x-3 sm:order-2 sm:w-auto">
          <div role="group" aria-label={t("plot.zoom")} className="flex items-center gap-0.5">
            <button type="button" className={iconButton} title={t("plot.zoomOut")} aria-label={t("plot.zoomOut")} onClick={() => zoomBy(1 / ZOOM_STEP)}>
              <ZoomOut className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              className="inline-flex h-11 min-w-14 items-center justify-center rounded-lg px-2 text-xs font-semibold tabular-nums text-slate-700 transition-colors hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-blue-600 sm:h-8"
              title={t("plot.fit")}
              aria-label={t("plot.fit")}
              onClick={() => setZoom(1)}
            >
              {zoom === 1 ? t("plot.fitShort") : `${Math.round(zoom * 100)}%`}
            </button>
            <button type="button" className={iconButton} title={t("plot.zoomIn")} aria-label={t("plot.zoomIn")} onClick={() => zoomBy(ZOOM_STEP)}>
              <ZoomIn className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <span aria-hidden="true" className="hidden h-5 w-px bg-slate-200 sm:block" />
          <button type="button" className={iconButton} title={t("plot.download")} aria-label={t("plot.download")} onClick={() => actions.download()}>
            <ImageDown className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <button type="button" className={cn(iconButton, "order-2 sm:order-3")} title={t("plot.close")} aria-label={t("plot.close")} onClick={onClose}>
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

/** Alt text from a figure title: mathtext markers and commands are dropped so a screen reader does not read dollar signs. */
export function plainTitle(raw: string): string {
  return raw
    .replace(/\\(?:mathrm|text|mathbf|mathit)\{([^}]*)\}/g, "$1")
    .replace(/\\[a-zA-Z]+/g, " ")
    .replace(/[$_^{}]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

type View =
  | { phase: "idle" }
  | { phase: "running"; stage: PlotStage | null }
  | { phase: "done"; result: PlotResult }
  | { phase: "error"; error: PlotError };

function viewOf(outcome: PlotOutcome): View {
  return outcome.result ? { phase: "done", result: outcome.result } : { phase: "error", error: outcome.error! };
}

function initialView(code: string, auto: boolean): View {
  const cached = cachedPlot(code);
  if (cached) return viewOf(cached);
  const running = runningPlot(code);
  if (running) return { phase: "running", stage: running.stage() };
  return auto ? { phase: "running", stage: null } : { phase: "idle" };
}

function plotFilename(now: Date = new Date()): string {
  return `mae-plot-${now.getTime()}.png`;
}

export interface PlotCardProps {
  /** The Python source of the ```python:plot fence (untrusted model output; it is validated and run in a worker, never rendered as HTML). */
  code: string;
}

function PlotCardImpl({ code }: PlotCardProps) {
  const { t } = useTranslation("ai");
  const auto = useContext(PlotAutoRunContext);
  const askFix = useContext(PlotFixContext);
  const [view, setView] = useState<View>(() => initialView(code, auto));
  const [codeShown, setCodeShown] = useState(false);
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLElement | null>(null);
  // Whether this message may run on its own is decided once; flipping it later must not start a download.
  const autoRef = useRef(auto);
  const runId = useRef(0);

  const begin = useCallback((source: string) => {
    const id = ++runId.current;
    const job = startPlot(source);
    setView({ phase: "running", stage: job.stage() });
    const unsubscribe = job.subscribe((stage) => {
      if (runId.current === id) setView({ phase: "running", stage });
    });
    void job.promise.then((outcome) => {
      unsubscribe();
      if (runId.current === id) setView(viewOf(outcome));
    });
  }, []);

  useEffect(() => {
    const done = cachedPlot(code);
    if (done) setView(viewOf(done));
    else if (runningPlot(code) || autoRef.current) begin(code);
    else setView({ phase: "idle" });
    return () => {
      runId.current += 1; // a late result for the old code is ignored
    };
  }, [code, begin]);

  const result = view.phase === "done" ? view.result : null;
  const src = useMemo(() => (result ? URL.createObjectURL(new Blob([result.png as BlobPart], { type: "image/png" })) : ""), [result]);
  useEffect(() => () => { if (src) URL.revokeObjectURL(src); }, [src]);

  const title = result ? plainTitle(result.summary.suptitle || result.summary.axes[0]?.title || "") : "";
  const alt = title ? t("plot.alt", { title }) : t("plot.label");

  const actions: Actions = {
    expand: (element) => {
      opener.current = element;
      setOpen(true);
    },
    download: () => {
      if (!result) return;
      try {
        downloadBlob(new Blob([result.png as BlobPart], { type: "image/png" }), plotFilename());
      } catch {
        toast.error(t("plot.downloadFailed"));
      }
    },
    toggleCode: () => setCodeShown((shown) => !shown),
    codeShown,
  };

  if (view.phase === "idle") {
    return (
      <figure className="my-4">
        <div className={cn(cardShell, "flex flex-col items-center gap-3 px-4 py-6 text-center")}>
          <SkeletonPlot />
          <p className="max-w-md text-xs text-slate-500 dark:text-zinc-400">{t("plot.restoredHint")}</p>
          <button type="button" className={pillButton} onClick={() => begin(code)}>
            <Play className="h-4 w-4" aria-hidden="true" />
            {t("plot.run")}
          </button>
        </div>
        <details className="mt-1">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-1 text-xs font-medium text-slate-600 marker:hidden dark:text-zinc-300 [&::-webkit-details-marker]:hidden">
            <Code2 className="h-3.5 w-3.5" aria-hidden="true" />
            {t("plot.viewCode")}
          </summary>
          <CodeBlock code={code} language="python" />
        </details>
      </figure>
    );
  }

  if (view.phase === "running") return <LoadingCard stage={view.stage} />;

  if (view.phase === "error") {
    const { error } = view;
    const detail = error.line ? t("plot.errorAtLine", { line: error.line, message: error.message }) : error.message;
    const fixText = t("plot.fixPrompt", { error: detail });
    return (
      <figure className="my-4">
        <div role="alert" className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900 dark:border-blue-400/25 dark:bg-blue-950/40 dark:text-blue-100">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <p className="flex min-w-0 flex-1 items-center gap-1.5 font-semibold">
              <TriangleAlert className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-200" aria-hidden="true" />
              {t(`plot.error.${error.kind}`)}
            </p>
            {error.kind === "load" || error.kind === "timeout" || error.kind === "internal" ? (
              <button type="button" className={cn(pillButton, "border-blue-300 bg-white text-blue-900 hover:bg-blue-100 sm:min-h-9")} onClick={() => begin(code)}>
                <Play className="h-4 w-4" aria-hidden="true" />
                {t("plot.retry")}
              </button>
            ) : null}
            {askFix ? (
              <button type="button" className={cn(pillButton, "border-blue-300 bg-white text-blue-900 hover:bg-blue-100 sm:min-h-9")} onClick={() => askFix(fixText)}>
                <Wrench className="h-4 w-4" aria-hidden="true" />
                {t("plot.askFix")}
              </button>
            ) : null}
          </div>
          <p dir="auto" className="mt-1 break-words font-mono text-xs">{detail}</p>
        </div>
        <CodeBlock code={code} language="python" />
      </figure>
    );
  }

  const { result: done } = view;
  const warnings = done.warnings;
  return (
    <figure className="my-4">
      <div className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-white/20">
        <button
          type="button"
          dir="ltr"
          onClick={(event) => actions.expand?.(event.currentTarget)}
          aria-label={t("plot.open")}
          className="block w-full cursor-zoom-in bg-white p-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-600"
        >
          <img src={src} alt={alt} draggable={false} className="mx-auto block h-auto max-h-[32rem] w-full bg-white object-contain" style={{ maxWidth: Math.round(done.width / 2) }} />
        </button>
        <Toolbar variant="overlay" actions={actions} />
      </div>
      <div role="status" aria-live="polite" className="sr-only">{t("plot.ready")}</div>
      {warnings.length > 0 ? (
        <details className="mt-2 text-xs text-slate-600 dark:text-zinc-300">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-1 font-medium marker:hidden sm:min-h-8 [&::-webkit-details-marker]:hidden">
            <TriangleAlert className="h-3.5 w-3.5 text-blue-600" aria-hidden="true" />
            {t("plot.warnings", { count: warnings.length })}
          </summary>
          <ul dir="ltr" className="list-disc space-y-0.5 ps-5 font-mono">
            {warnings.map((warning) => (
              <li key={warning} className="break-words">{warning}</li>
            ))}
          </ul>
        </details>
      ) : null}
      {codeShown ? <CodeBlock code={code} language="python" /> : null}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          showCloseButton={false}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            opener.current?.focus();
          }}
          className="top-1/2 left-1/2 flex h-[calc(100dvh-1.5rem)] w-[calc(100vw-1.5rem)] max-w-none flex-col gap-0 overflow-hidden rounded-2xl border-0 bg-white p-0 text-slate-900 sm:h-[calc(100dvh-3rem)] sm:w-[calc(100vw-3rem)] sm:max-w-none"
        >
          <Lightbox src={src} alt={alt} title={title || t("plot.label")} actions={actions} onClose={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </figure>
  );
}

export const PlotCard = memo(PlotCardImpl);
export default PlotCard;
