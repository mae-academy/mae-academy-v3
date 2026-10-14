import { createContext, memo, useCallback, useContext, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Braces, FileCode2, ImageDown, ListTree, Maximize2, PenLine, ShieldCheck, TriangleAlert, Wrench, X, ZoomIn, ZoomOut } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { extractJsonText, netlistToMarkdown, type Issue } from "@shared/schematic";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { CodeBlock, copyText } from "./CodeBlock";
import { MAX_REPAIR_ATTEMPTS, analyzeSchematic, cachedVerification, startVerification, type SchematicOutcome, type VerifyProgress } from "./schematicVerify";
import { downloadBlob, rasterizeSvg, schematicFilename, svgBlob, svgDataUri } from "./schematicExport";

/** True for messages created in this page session: their schematic may call the repair route on its own. Restored ones only validate locally. */
export const SchematicAutoRepairContext = createContext(false);

const ZOOM_STEP = 1.25;
const ZOOM_MIN = 1;
const ZOOM_MAX = 8;
const clampZoom = (value: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, value));

const iconButton =
  "inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-blue-600 disabled:cursor-progress disabled:opacity-50 sm:size-8";

const pillButton =
  "inline-flex min-h-11 items-center gap-2 rounded-full border border-slate-300 bg-white px-4 text-sm font-medium text-slate-800 transition-colors hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:border-white/[0.14] dark:bg-transparent dark:text-zinc-100 dark:hover:bg-white/[0.08]";

const summaryClass =
  "flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-lg px-1 text-xs font-medium text-slate-600 marker:hidden hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 dark:text-zinc-300 dark:hover:text-zinc-50 sm:min-h-8 [&::-webkit-details-marker]:hidden";

function SkeletonDrawing() {
  return (
    <svg aria-hidden="true" viewBox="0 0 160 60" className="h-16 w-40 text-slate-300 motion-safe:animate-pulse dark:text-zinc-600" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 30h28l5-12 10 24 10-24 10 24 5-12h28" />
      <circle cx="144" cy="30" r="4" fill="currentColor" stroke="none" />
      <path d="M8 30v22M144 34v18M8 52h136" strokeDasharray="2 7" />
    </svg>
  );
}

/** Shown in the diagram's slot while the model is still writing the spec (no partial parse is ever attempted). */
export function SchematicPending() {
  const { t } = useTranslation("ai");
  return (
    <div role="status" aria-live="polite" className="my-4 overflow-hidden rounded-2xl bg-slate-50 ring-1 ring-slate-200 dark:bg-white/[0.04] dark:ring-white/10">
      <div className="flex h-44 flex-col items-center justify-center gap-4 sm:h-52">
        <SkeletonDrawing />
        <p className="flex items-center gap-2 text-sm font-medium text-slate-500 dark:text-zinc-400">
          <PenLine className="h-4 w-4 motion-safe:animate-pulse" aria-hidden="true" />
          {t("schematic.drawing")}
        </p>
      </div>
    </div>
  );
}

function VerifyingCard({ progress }: { progress: VerifyProgress }) {
  const { t } = useTranslation("ai");
  return (
    <div role="status" aria-live="polite" className="my-4 overflow-hidden rounded-2xl bg-slate-50 ring-1 ring-slate-200 dark:bg-white/[0.04] dark:ring-white/10">
      <div className="flex h-44 flex-col items-center justify-center gap-3 px-4 text-center sm:h-52">
        <SkeletonDrawing />
        <p className="flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-zinc-300">
          <ShieldCheck className="h-4 w-4 motion-safe:animate-pulse" aria-hidden="true" />
          {t("schematic.verifying")}
        </p>
        {progress.phase === "fixing" ? <p className="text-xs text-slate-500 dark:text-zinc-400">{t("schematic.fixing", { n: progress.issues, attempt: progress.attempt, max: MAX_REPAIR_ATTEMPTS })}</p> : null}
      </div>
    </div>
  );
}

function prettySpec(specText: string): string {
  const body = extractJsonText(specText) ?? specText;
  try {
    return JSON.stringify(JSON.parse(body), null, 2);
  } catch {
    return body;
  }
}

interface Actions {
  expand?: (opener: HTMLElement) => void;
  downloadSvg: () => void;
  downloadPng: () => void;
  copySpec: () => void;
  copyNetlist: () => void;
}

function Toolbar({ variant, actions }: { variant: "overlay" | "bar"; actions: Actions }) {
  const { t } = useTranslation("ai");
  const button = (label: string, onClick: (el: HTMLElement) => void, icon: React.ReactNode) => (
    <button type="button" className={iconButton} title={label} aria-label={label} onClick={(event) => onClick(event.currentTarget)}>
      {icon}
    </button>
  );
  return (
    <div
      role="group"
      aria-label={t("schematic.actions")}
      className={cn(
        "flex flex-wrap items-center justify-end gap-0.5",
        variant === "overlay" &&
          "border-t border-slate-200 bg-slate-50 px-1 sm:absolute sm:end-2 sm:top-2 sm:flex-nowrap sm:rounded-xl sm:border sm:bg-white/95 sm:p-0.5 sm:opacity-0 sm:shadow-sm sm:backdrop-blur sm:transition-opacity sm:group-focus-within:opacity-100 sm:group-hover:opacity-100 [@media(hover:none)]:sm:opacity-100",
      )}
    >
      {actions.expand ? button(t("schematic.expand"), actions.expand, <Maximize2 className="h-4 w-4" aria-hidden="true" />) : null}
      {button(t("schematic.downloadSvg"), () => actions.downloadSvg(), <FileCode2 className="h-4 w-4" aria-hidden="true" />)}
      {button(t("schematic.downloadPng"), () => actions.downloadPng(), <ImageDown className="h-4 w-4" aria-hidden="true" />)}
      {button(t("schematic.copySpec"), () => actions.copySpec(), <Braces className="h-4 w-4" aria-hidden="true" />)}
      {button(t("schematic.copyNetlist"), () => actions.copyNetlist(), <ListTree className="h-4 w-4" aria-hidden="true" />)}
    </div>
  );
}

interface LightboxProps {
  src: string;
  alt: string;
  title: string;
  actions: Actions;
  onClose: () => void;
}

/** Header (zoom, downloads, close) and the scrollable viewer. Mounted only while the dialog is open, so zoom resets on each open. */
function Lightbox({ src, alt, title, actions, onClose }: LightboxProps) {
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
        <DialogDescription className="sr-only">{t("schematic.lightboxHint")}</DialogDescription>
        <div className="order-3 flex w-full flex-wrap items-center justify-center gap-x-3 sm:order-2 sm:w-auto">
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
          <Toolbar variant="bar" actions={{ ...actions, expand: undefined }} />
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

function IssueList({ issues }: { issues: readonly Issue[] }) {
  return (
    <ul dir="auto" className="mt-1 list-disc space-y-0.5 ps-5 text-xs text-slate-600 marker:text-slate-400 dark:text-zinc-300">
      {issues.map((issue, index) => (
        <li key={`${issue.code}-${index}`} className="break-words">
          {issue.message}
        </li>
      ))}
    </ul>
  );
}

function NetlistTable({ outcome }: { outcome: SchematicOutcome }) {
  const { t } = useTranslation("ai");
  const parts = outcome.validation.netlist.parts;
  if (parts.length === 0) return null;
  return (
    <details className="group/nl">
      <summary className={summaryClass}>
        <ListTree className="h-3.5 w-3.5" aria-hidden="true" />
        {t("schematic.netlist")}
      </summary>
      <div dir="ltr" className="my-1 max-w-full overflow-x-auto rounded-lg border border-slate-200 dark:border-white/[0.08]">
        <table className="w-full border-collapse text-start text-xs">
          <thead className="bg-slate-100 dark:bg-white/[0.05]">
            <tr>
              {(["designator", "type", "value", "nodes"] as const).map((column) => (
                <th key={column} scope="col" className="border-b border-slate-200 px-2.5 py-1.5 text-start font-semibold dark:border-white/[0.08]">
                  {t(`schematic.col.${column}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {parts.map((part) => (
              <tr key={part.designator}>
                <th scope="row" className="border-t border-slate-200 px-2.5 py-1.5 text-start font-mono font-semibold dark:border-white/[0.08]">{part.designator}</th>
                <td className="border-t border-slate-200 px-2.5 py-1.5 align-top dark:border-white/[0.08]">{part.type}</td>
                <td className="border-t border-slate-200 px-2.5 py-1.5 align-top dark:border-white/[0.08]">{part.value || "-"}</td>
                <td className="border-t border-slate-200 px-2.5 py-1.5 align-top font-mono dark:border-white/[0.08]">
                  {Object.entries(part.nodes).map(([pin, net]) => `${pin}=${net}`).join(", ")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export interface SchematicDiagramProps {
  /** The raw text of the ```schematic fence (untrusted model output; it is parsed, validated and drawn, never rendered as HTML). */
  text: string;
}

function useSchematicOutcome(text: string, autoRepair: boolean) {
  const cached = cachedVerification(text);
  const [outcome, setOutcome] = useState<SchematicOutcome>(() => cached ?? analyzeSchematic(text));
  const [running, setRunning] = useState<boolean>(() => !cached && autoRepair && analyzeSchematic(text).status !== "verified");
  const [progress, setProgress] = useState<VerifyProgress>({ phase: "verifying", attempt: 0, issues: 0 });
  // Whether this message may repair on its own is decided once; flipping it later must not trigger a request.
  const auto = useRef(autoRepair);
  const runId = useRef(0);

  const begin = useCallback((spec: string) => {
    const id = ++runId.current;
    const run = startVerification(spec);
    setProgress(run.progress());
    setRunning(true);
    const unsubscribe = run.subscribe((next) => {
      if (runId.current === id) setProgress(next);
    });
    void run.promise.then((result) => {
      unsubscribe();
      if (runId.current !== id) return;
      setOutcome(result);
      setRunning(false);
    });
  }, []);

  useEffect(() => {
    const done = cachedVerification(text);
    if (done) {
      setOutcome(done);
      setRunning(false);
    } else {
      const local = analyzeSchematic(text);
      setOutcome(local);
      if (local.status !== "verified" && auto.current) begin(text);
      else setRunning(false);
    }
    return () => {
      runId.current += 1; // a late result for the old text is ignored
    };
  }, [text, begin]);

  return { outcome, running, progress, verify: () => begin(text) };
}

function SchematicDiagramImpl({ text }: SchematicDiagramProps) {
  const { t } = useTranslation("ai");
  const autoRepair = useContext(SchematicAutoRepairContext);
  const { outcome, running, progress, verify } = useSchematicOutcome(text, autoRepair);
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLElement | null>(null);

  const { render, validation, status } = outcome;
  const title = validation.spec?.title?.trim() ?? "";
  const alt = title ? t("schematic.alt", { title }) : t("schematic.label");
  const src = useMemo(() => (render ? svgDataUri(render.svg) : ""), [render]);

  const actions: Actions = {
    expand: (element) => {
      opener.current = element;
      setOpen(true);
    },
    downloadSvg: () => {
      if (!render) return;
      try {
        downloadBlob(svgBlob(render.svg), schematicFilename("svg"));
      } catch {
        toast.error(t("schematic.downloadFailed"));
      }
    },
    downloadPng: () => {
      if (!render) return;
      rasterizeSvg(render.svg, render.width, render.height).then(
        (blob) => downloadBlob(blob, schematicFilename("png")),
        () => toast.error(t("schematic.downloadFailed")),
      );
    },
    copySpec: () => {
      void copyText(prettySpec(outcome.specText)).then((ok) => (ok ? toast.success(t("schematic.copied")) : toast.error(t("schematic.copyFailed"))));
    },
    copyNetlist: () => {
      void copyText(netlistToMarkdown(validation.netlist)).then((ok) => (ok ? toast.success(t("schematic.copied")) : toast.error(t("schematic.copyFailed"))));
    },
  };

  if (running) return <VerifyingCard progress={progress} />;

  const errors = validation.errors;
  const canFix = status !== "verified" && (outcome.attempts < MAX_REPAIR_ATTEMPTS || outcome.repairError !== undefined) && text.trim().length > 0;

  const statusRow = (
    <div aria-live="polite" className="mt-2 space-y-1 text-xs text-slate-600 dark:text-zinc-300">
      {status === "verified" ? (
        <p className="font-medium text-emerald-700 dark:text-emerald-400">{t("schematic.passed")}</p>
      ) : (
        <div role="note" className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-amber-950 dark:border-amber-400/30 dark:bg-amber-400/10 dark:text-amber-100">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <p className="flex min-w-0 flex-1 items-center gap-1.5 font-semibold">
              <TriangleAlert className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-300" aria-hidden="true" />
              {status === "unparseable" ? t("schematic.unreadable") : t("schematic.unverified", { n: errors.length })}
            </p>
            {canFix ? (
              <button type="button" className={cn(pillButton, "min-h-11 border-amber-400 bg-white text-amber-950 hover:bg-amber-100 sm:min-h-9")} onClick={verify}>
                <Wrench className="h-4 w-4" aria-hidden="true" />
                {t("schematic.verifyFix")}
              </button>
            ) : null}
          </div>
          {outcome.repairError ? <p className="mt-1">{t("schematic.repairUnavailable")}</p> : null}
          {errors.length > 0 ? (
            <details>
              <summary className={cn(summaryClass, "text-amber-900 hover:text-amber-950 dark:text-amber-100")}>{t("schematic.issues", { n: errors.length })}</summary>
              <IssueList issues={errors} />
            </details>
          ) : null}
        </div>
      )}
      {outcome.repaired ? <p className="text-slate-500 dark:text-zinc-400">{t("schematic.autoCorrected")}</p> : null}
      {validation.warnings.length > 0 ? (
        <details>
          <summary className={summaryClass}>{t("schematic.warnings", { n: validation.warnings.length })}</summary>
          <IssueList issues={validation.warnings} />
        </details>
      ) : null}
    </div>
  );

  if (!render) {
    // Nothing drawable: show the raw spec as code, with the reasons.
    return (
      <figure className="my-4">
        <CodeBlock code={text} language="json" />
        {statusRow}
      </figure>
    );
  }

  return (
    <figure className="my-4">
      <div className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white dark:border-white/20">
        <button
          type="button"
          dir="ltr"
          onClick={(event) => actions.expand?.(event.currentTarget)}
          aria-label={t("schematic.open")}
          className="block w-full cursor-zoom-in bg-white p-2 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue-600"
        >
          <img src={src} alt={alt} draggable={false} className="mx-auto block h-auto max-h-[32rem] w-full bg-white object-contain" style={{ maxWidth: render.width }} />
        </button>
        <Toolbar variant="overlay" actions={actions} />
      </div>
      {statusRow}
      <NetlistTable outcome={outcome} />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          showCloseButton={false}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            opener.current?.focus();
          }}
          className="top-1/2 left-1/2 flex h-[calc(100dvh-1.5rem)] w-[calc(100vw-1.5rem)] max-w-none flex-col gap-0 overflow-hidden rounded-2xl border-0 bg-white p-0 text-slate-900 sm:h-[calc(100dvh-3rem)] sm:w-[calc(100vw-3rem)] sm:max-w-none"
        >
          <Lightbox src={src} alt={alt} title={title || t("schematic.label")} actions={actions} onClose={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </figure>
  );
}

export const SchematicDiagram = memo(SchematicDiagramImpl);
export default SchematicDiagram;
