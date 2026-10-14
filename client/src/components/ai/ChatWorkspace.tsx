import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { motion, useReducedMotion } from "framer-motion";
import { FlaskConical, ImagePlus, PanelLeft, Sparkles, SquarePen, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { LabContext, MascotState } from "@shared/aiTypes";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import { ChatComposer, type ComposerHandle, type ComposerSubmit } from "./ChatComposer";
import { ChatSidebar } from "./ChatSidebar";
import { ChatTranscript } from "./ChatTranscript";
import { MAI_LAYOUT_ID, MAI_LAYOUT_TRANSITION } from "./ChatMessages";
import { loadSidebarOpen, saveSidebarOpen } from "./chatStorage";
import { isAcceptedImageType } from "./imageUtils";
import MaiMascot from "./MaiMascot";
import { SuggestionChips } from "./SuggestionChips";
import { newId } from "./chatThreads";
import { useChatRunner, type RunPhase } from "./useChatRunner";
import { useChatThreads } from "./useChatThreads";
import { useMascotState } from "./useMascotState";
import { useMediaQuery } from "./useMediaQuery";

const MASCOT_STATES: readonly MascotState[] = ["idle", "listening", "thinking", "eureka", "talking"];
/** How long the first-message transition flags stay up; longer than the spring settles. */
const TRANSITION_MS = 1000;
const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600";
const ICON_BUTTON = cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-zinc-300 dark:hover:bg-white/[0.08] dark:hover:text-white", FOCUS);

type PendingDelete = { kind: "thread"; id: string } | { kind: "all" } | null;

export interface ChatWorkspaceProps {
  /** Invisible topic hint sent with each request (from `?lab=`); the assistant infers the topic itself otherwise. */
  lab: LabContext;
  className?: string;
}

function DemoNotice({ onDismiss }: { onDismiss: () => void }) {
  const { t } = useTranslation("ai");
  return (
    <div role="status" className="inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-full border border-amber-300/70 bg-amber-50 ps-3 pe-1 text-xs font-medium text-amber-900 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-100">
      <FlaskConical className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span className="truncate sm:hidden">{t("demo.short")}</span>
      <span className="hidden truncate sm:inline">{t("demo.full")}</span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label={t("demo.dismiss")}
        className={cn("relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full hover:bg-amber-200/60 before:absolute before:-inset-2.5 before:content-[''] dark:hover:bg-amber-300/15", FOCUS)}
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}

/** The full-viewport conversation: collapsible history sidebar, centered canvas, docked composer. */
export function ChatWorkspace({ lab, className }: ChatWorkspaceProps) {
  const { t } = useTranslation("ai");
  const reduceMotion = useReducedMotion();
  const mascot = useMascotState();
  const threads = useChatThreads();
  const { active } = threads;

  const labRef = useRef(lab);
  labRef.current = lab;
  const getLab = useCallback(() => labRef.current, []);
  const runner = useChatRunner({ mascot, getLab, updateMessages: threads.updateMessages });

  const composerRef = useRef<ComposerHandle>(null);
  const dragDepth = useRef(0);
  const [dragging, setDragging] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete>(null);
  // The dialog keeps its wording while it fades out.
  const lastPending = useRef<PendingDelete>(null);
  if (pendingDelete) lastPending.current = pendingDelete;
  const dialogKind = (pendingDelete ?? lastPending.current)?.kind;
  const [demoDismissed, setDemoDismissed] = useState(false);
  const [status, setStatus] = useState("");

  const isDesktop = useMediaQuery("(min-width: 1024px)", true);
  const [sidebarOpen, setSidebarOpen] = useState(() => loadSidebarOpen());
  const [drawerOpen, setDrawerOpen] = useState(false);
  useEffect(() => {
    if (isDesktop) setDrawerOpen(false);
  }, [isDesktop]);

  const isEmpty = active.messages.length === 0;
  const phase: RunPhase = runner.active ? runner.active.phase : "idle";
  const streamingId = runner.active && runner.active.threadId === active.id ? runner.active.replyId : null;
  const error = runner.error && runner.error.threadId === active.id ? runner.error.kind : null;
  const stateLabels = useMemo(() => Object.fromEntries(MASCOT_STATES.map((state) => [state, t(`mascot.states.${state}`)])) as Record<MascotState, string>, [t]);

  /* ---- first-message transition: composer docks (position layout) and the hero hands over to the first avatar ---- */
  const [dock, setDock] = useState(false);
  const [previousEmpty, setPreviousEmpty] = useState(isEmpty);
  if (previousEmpty !== isEmpty) {
    setPreviousEmpty(isEmpty);
    setDock(true);
  }
  const [handoff, setHandoff] = useState(false);
  useEffect(() => {
    if (!dock && !handoff) return;
    const timer = window.setTimeout(() => { setDock(false); setHandoff(false); }, TRANSITION_MS);
    return () => window.clearTimeout(timer);
  }, [dock, handoff]);

  /* ---- screen reader status ---- */
  const wasRunning = useRef(false);
  useEffect(() => {
    if (runner.active) {
      wasRunning.current = true;
      setStatus(t("chat.responding"));
    } else if (wasRunning.current) {
      wasRunning.current = false;
      setStatus(runner.error ? "" : t("chat.complete"));
    }
  }, [runner.active, runner.error, t]);

  const focusComposer = useCallback(() => composerRef.current?.focus(), []);

  /** Leaves the current chat: stop any stream (keeping its partial text), settle the mascot. */
  const leaveChat = useCallback(() => {
    runner.stop();
    mascot.reset();
  }, [mascot, runner]);

  /* ---- chat actions ---- */
  const handleSubmit = ({ text, image }: ComposerSubmit) => {
    if (runner.active) return;
    const message = { id: newId(), role: "user" as const, content: text, timestamp: Date.now(), ...(image ? { imageUrl: image } : {}) };
    if (active.messages.length === 0) setHandoff(true);
    runner.send(active.id, [...active.messages, message]);
  };

  const handleRetry = () => {
    if (runner.active) return;
    let lastUser = -1;
    active.messages.forEach((m, i) => { if (m.role === "user") lastUser = i; });
    if (lastUser === -1) return;
    runner.send(active.id, active.messages.slice(0, lastUser + 1));
  };

  const handleNewChat = () => {
    leaveChat();
    threads.newChat();
    setDrawerOpen(false);
    focusComposer();
  };

  const handleSelect = (id: string) => {
    if (id !== active.id) {
      leaveChat();
      threads.select(id);
    }
    setDrawerOpen(false);
    focusComposer();
  };

  const confirmDelete = () => {
    const target = pendingDelete;
    setPendingDelete(null);
    if (!target) return;
    if (target.kind === "all") {
      leaveChat();
      threads.clearAll();
    } else {
      if (runner.active?.threadId === target.id) leaveChat();
      threads.remove(target.id);
    }
  };

  const toggleSidebar = () => {
    if (!isDesktop) {
      setDrawerOpen(true);
      return;
    }
    setSidebarOpen((current) => {
      saveSidebarOpen(!current);
      return !current;
    });
  };

  /* ---- image drag and drop over the whole canvas ---- */
  const carriesImage = (event: DragEvent) => {
    if (!Array.from(event.dataTransfer.types).includes("Files")) return false;
    const items = Array.from(event.dataTransfer.items ?? []);
    // Types are only exposed during the drag; an empty type is let through and validated on drop.
    return items.length === 0 || items.some((item) => item.kind === "file" && (item.type === "" || item.type.startsWith("image/")));
  };
  const onDragEnter = (event: DragEvent) => {
    if (!carriesImage(event)) return;
    event.preventDefault();
    dragDepth.current += 1;
    setDragging(true);
  };
  const onDragOver = (event: DragEvent) => {
    if (!carriesImage(event)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
  };
  const onDragLeave = (event: DragEvent) => {
    if (!carriesImage(event)) return;
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  };
  const onDrop = (event: DragEvent) => {
    if (!Array.from(event.dataTransfer.types).includes("Files")) return;
    event.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    const files = Array.from(event.dataTransfer.files);
    const file = files.find((f) => isAcceptedImageType(f.type));
    if (file) void composerRef.current?.attachFile(file);
    else if (files.length > 0) toast.error(t("image.type"));
  };

  const sidebar = (onClose?: () => void) => (
    <ChatSidebar
      threads={threads.threads}
      activeId={active.id}
      onNewChat={handleNewChat}
      onSelect={handleSelect}
      onRename={threads.rename}
      onRequestDelete={(id) => setPendingDelete({ kind: "thread", id })}
      onRequestClearAll={() => setPendingDelete({ kind: "all" })}
      onClose={onClose}
    />
  );

  const sidebarSurface = "bg-slate-50/90 dark:bg-[#0a0a0d]";
  const showTopNewChat = !isEmpty && (!isDesktop || !sidebarOpen);
  const sidebarVisible = isDesktop ? sidebarOpen : drawerOpen;
  const spring = reduceMotion ? { duration: 0 } : MAI_LAYOUT_TRANSITION;

  return (
    <div
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={cn("relative flex min-h-0 w-full overflow-hidden", className)}
    >
      {isDesktop ? (
        <aside
          id="mae-ai-sidebar"
          aria-label={t("sidebar.label")}
          inert={!sidebarOpen}
          className={cn("shrink-0 overflow-hidden border-slate-200 transition-[width] duration-300 motion-reduce:transition-none dark:border-white/[0.08]", sidebarSurface, sidebarOpen ? "w-72 border-e" : "w-0")}
        >
          <div className="h-full w-72">{sidebar()}</div>
        </aside>
      ) : (
        <DialogPrimitive.Root open={drawerOpen} onOpenChange={setDrawerOpen}>
          <DialogPrimitive.Portal>
            <DialogPrimitive.Overlay className="fixed inset-0 z-[60] bg-slate-950/50 backdrop-blur-[2px] data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
            <DialogPrimitive.Content
              id="mae-ai-sidebar"
              aria-describedby={undefined}
              onCloseAutoFocus={(event) => { event.preventDefault(); focusComposer(); }}
              className={cn(
                "fixed inset-y-0 start-0 z-[61] w-[min(20rem,86vw)] border-e border-slate-200 shadow-2xl outline-none duration-300 data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left rtl:data-[state=closed]:slide-out-to-right rtl:data-[state=open]:slide-in-from-right dark:border-white/[0.08]",
                "bg-slate-50 dark:bg-[#0a0a0d]",
              )}
            >
              <DialogPrimitive.Title className="sr-only">{t("sidebar.label")}</DialogPrimitive.Title>
              {sidebar(() => setDrawerOpen(false))}
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
      )}

      <section aria-label={t("page.title")} className="relative flex min-w-0 flex-1 flex-col">
        <div className="flex h-14 shrink-0 items-center gap-1.5 px-2 sm:px-3">
          <button
            type="button"
            onClick={toggleSidebar}
            aria-label={sidebarVisible ? t("sidebar.close") : t("sidebar.open")}
            aria-expanded={sidebarVisible}
            aria-controls="mae-ai-sidebar"
            className={ICON_BUTTON}
          >
            <PanelLeft className="h-5 w-5 rtl:-scale-x-100" aria-hidden="true" />
          </button>
          <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-800 dark:text-zinc-100">
            <Sparkles className="h-4 w-4 text-violet-600 dark:text-violet-300" aria-hidden="true" />
            {t("page.title")}
          </span>
          <div className="min-w-0 flex-1" />
          {runner.mode === "mock" && !demoDismissed ? <DemoNotice onDismiss={() => setDemoDismissed(true)} /> : null}
          {showTopNewChat ? (
            <button type="button" onClick={handleNewChat} aria-label={t("sidebar.newChat")} title={t("sidebar.newChat")} className={ICON_BUTTON}>
              <SquarePen className="h-5 w-5" aria-hidden="true" />
            </button>
          ) : null}
        </div>

        <div className={cn("flex min-h-0 flex-1 flex-col", isEmpty && "items-center overflow-y-auto overscroll-contain px-4 pb-6")}>
          {isEmpty ? (
            <div className="mt-auto flex shrink-0 flex-col items-center gap-3 pb-6 text-center sm:gap-4 sm:pb-7">
              <motion.div
                layoutId={reduceMotion ? undefined : MAI_LAYOUT_ID}
                transition={spring}
                className="w-[clamp(4.5rem,15dvh,11.5rem)]"
              >
                <MaiMascot variant="hero" state={mascot.state} stateLabels={stateLabels} />
              </motion.div>
              <h1 className="max-w-xl text-balance text-2xl font-semibold tracking-tight text-slate-900 dark:text-white sm:text-[1.75rem] sm:leading-9">{t("empty.title")}</h1>
            </div>
          ) : (
            <>
              <h1 className="sr-only">{t("page.title")}</h1>
              <ChatTranscript
                key={active.id}
                messages={active.messages}
                streamingId={streamingId}
                mascotState={mascot.state}
                stateLabels={stateLabels}
                sharedAvatar={handoff}
                error={error}
                onRetry={handleRetry}
              />
            </>
          )}

          <motion.div
            layout={dock && !reduceMotion ? "position" : false}
            transition={spring}
            className={cn("w-full shrink-0", isEmpty ? "max-w-[44rem]" : "mx-auto max-w-3xl px-4 pb-3 sm:px-6")}
          >
            <ChatComposer
              ref={composerRef}
              large={isEmpty}
              phase={phase}
              onSubmit={handleSubmit}
              onStop={runner.stop}
              onActivity={mascot.onInputActivity}
            />
            {!isEmpty ? <p className="mt-2 text-center text-xs text-slate-500 dark:text-zinc-500">{t("composer.disclaimer")}</p> : null}
          </motion.div>

          {isEmpty ? (
            <div className="mb-auto mt-5 w-full max-w-[44rem] shrink-0">
              <SuggestionChips
                onFill={(text) => composerRef.current?.setDraft(text)}
                onAttach={(prompt) => {
                  composerRef.current?.setDraft(prompt);
                  composerRef.current?.openFilePicker();
                }}
              />
              <p className="mt-6 text-center text-xs text-slate-500 dark:text-zinc-500">{t("composer.disclaimer")}</p>
            </div>
          ) : null}
        </div>

        <div role="status" aria-live="polite" className="sr-only">{status}</div>
      </section>

      {dragging ? (
        <div className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 border-2 border-dashed border-violet-500 bg-violet-50/90 text-violet-800 backdrop-blur-sm dark:bg-violet-950/80 dark:text-violet-100" aria-hidden="true">
          <ImagePlus className="h-10 w-10" />
          <p className="text-base font-semibold">{t("chat.dropTitle")}</p>
          <p className="text-sm opacity-80">{t("chat.dropHint")}</p>
        </div>
      ) : null}

      <AlertDialog open={pendingDelete !== null} onOpenChange={(open) => { if (!open) setPendingDelete(null); }}>
        <AlertDialogContent onCloseAutoFocus={(event) => { event.preventDefault(); focusComposer(); }}>
          <AlertDialogHeader>
            <AlertDialogTitle>{dialogKind === "all" ? t("confirm.allTitle") : t("confirm.threadTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{dialogKind === "all" ? t("confirm.allBody") : t("confirm.threadBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-[44px]">{t("confirm.cancel")}</AlertDialogCancel>
            <AlertDialogAction className="min-h-[44px]" onClick={confirmDelete}>{dialogKind === "all" ? t("confirm.clearAll") : t("confirm.delete")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default ChatWorkspace;
