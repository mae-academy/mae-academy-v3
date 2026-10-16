import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { MoreHorizontal, Pencil, Plus, Settings, Trash2, User, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { MathText } from "./mathText";
import { RENAME_MAX_CHARS, groupThreads, threadTitle, type ChatThread } from "./chatThreads";

export interface ChatSidebarProps {
  threads: ChatThread[];
  activeId: string;
  onNewChat: () => void;
  onSelect: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onRequestDelete: (id: string) => void;
  onRequestClearAll: () => void;
  /** Present in the mobile drawer: renders a close button. */
  onClose?: () => void;
}

const DESTRUCTIVE = "text-rose-600 focus:bg-rose-50 focus:text-rose-700 dark:text-rose-400 dark:focus:bg-rose-500/10 dark:focus:text-rose-300 [&_svg]:!text-current";
const FOCUS = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600";

interface ThreadRowProps {
  thread: ChatThread;
  active: boolean;
  onSelect: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onRequestDelete: (id: string) => void;
}

function ThreadRow({ thread, active, onSelect, onRename, onRequestDelete }: ThreadRowProps) {
  const { t } = useTranslation("ai");
  const [renaming, setRenaming] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const renameRequested = useRef(false);
  /** Enter, Escape and blur can all end a rename (and unmounting may fire a blur); only the first counts. */
  const settled = useRef(false);
  const title = threadTitle(thread) ?? t("sidebar.untitled");

  useEffect(() => {
    if (!renaming) return;
    settled.current = false;
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [renaming]);

  const finish = () => {
    if (settled.current) return false;
    settled.current = true;
    setRenaming(false);
    return true;
  };

  const commit = (value: string) => {
    if (!finish()) return;
    if (value.trim() !== title) onRename(thread.id, value);
  };

  const onInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commit(event.currentTarget.value);
    } else if (event.key === "Escape") {
      event.preventDefault();
      finish();
    }
  };

  if (renaming) {
    return (
      <li className="px-1">
        <input
          ref={inputRef}
          defaultValue={title}
          dir="auto"
          maxLength={RENAME_MAX_CHARS}
          aria-label={t("sidebar.renameLabel")}
          onKeyDown={onInputKeyDown}
          onBlur={(event) => commit(event.currentTarget.value)}
          className="block min-h-11 w-full rounded-lg border border-violet-400 bg-white px-3 text-sm text-slate-900 outline-none ring-2 ring-violet-400/30 dark:bg-white/[0.06] dark:text-white"
        />
      </li>
    );
  }

  return (
    <li className="px-1">
      <div className={cn("group relative flex items-center rounded-lg transition-colors", active ? "bg-slate-200/80 dark:bg-white/[0.09]" : "hover:bg-slate-200/50 dark:hover:bg-white/[0.05]")}>
        <button
          type="button"
          onClick={() => onSelect(thread.id)}
          aria-current={active ? "true" : undefined}
          aria-label={title.replace(/\$/g, "")}
          className={cn("min-h-11 min-w-0 flex-1 rounded-lg px-3 text-start text-sm text-slate-700 dark:text-zinc-200", active && "font-medium text-slate-950 dark:text-white", FOCUS)}
        >
          <span dir="auto" className="block truncate"><MathText text={title} /></span>
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={t("sidebar.options", { title })}
              className={cn(
                "me-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-slate-500 opacity-0 transition-opacity hover:bg-slate-300/60 hover:text-slate-900 focus-visible:opacity-100 group-focus-within:opacity-100 group-hover:opacity-100 data-[state=open]:opacity-100 [@media(hover:none)]:opacity-100 dark:text-zinc-400 dark:hover:bg-white/[0.1] dark:hover:text-white",
                FOCUS,
              )}
            >
              <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="min-w-40"
            onCloseAutoFocus={(event) => {
              // Renaming moves focus into the input; do not hand it back to the trigger.
              if (renameRequested.current) {
                renameRequested.current = false;
                event.preventDefault();
              }
            }}
          >
            <DropdownMenuItem className="min-h-11" onSelect={() => { renameRequested.current = true; setRenaming(true); }}>
              <Pencil aria-hidden="true" />
              {t("sidebar.rename")}
            </DropdownMenuItem>
            <DropdownMenuItem className={cn("min-h-11", DESTRUCTIVE)} variant="destructive" onSelect={() => onRequestDelete(thread.id)}>
              <Trash2 aria-hidden="true" />
              {t("sidebar.delete")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  );
}

/** History and sessions: new chat, the saved chats grouped by recency, and a placeholder account row. */
export function ChatSidebar({ threads, activeId, onNewChat, onSelect, onRename, onRequestDelete, onRequestClearAll, onClose }: ChatSidebarProps) {
  const { t } = useTranslation("ai");
  const groups = useMemo(() => groupThreads(threads), [threads]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 p-3">
        <button
          type="button"
          onClick={onNewChat}
          className={cn("flex min-h-11 flex-1 items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-medium text-slate-800 shadow-sm transition-colors hover:border-violet-300 hover:bg-violet-50 dark:border-white/[0.1] dark:bg-white/[0.04] dark:text-zinc-100 dark:hover:border-violet-400/40 dark:hover:bg-violet-500/10", FOCUS)}
        >
          <Plus className="h-4 w-4 text-violet-600 dark:text-violet-300" aria-hidden="true" />
          {t("sidebar.newChat")}
        </button>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label={t("sidebar.close")}
            className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-200/60 hover:text-slate-900 dark:text-zinc-400 dark:hover:bg-white/[0.08] dark:hover:text-white", FOCUS)}
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        ) : null}
      </div>

      <nav aria-label={t("sidebar.label")} className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-3">
        {groups.length === 0 ? (
          <p className="px-3 pt-4 text-sm text-slate-500 dark:text-zinc-500">{t("sidebar.empty")}</p>
        ) : (
          groups.map((group) => (
            <section key={group.key} aria-labelledby={`mae-ai-group-${group.key}`}>
              <h2 id={`mae-ai-group-${group.key}`} className="px-3 pb-1 pt-4 text-xs font-medium text-slate-500 dark:text-zinc-500">
                {t(`sidebar.groups.${group.key}`)}
              </h2>
              <ul className="space-y-0.5">
                {group.threads.map((thread) => (
                  <ThreadRow key={thread.id} thread={thread} active={thread.id === activeId} onSelect={onSelect} onRename={onRename} onRequestDelete={onRequestDelete} />
                ))}
              </ul>
            </section>
          ))
        )}
      </nav>

      <div className="border-t border-slate-200 p-2 dark:border-white/[0.08]">
        <div className="flex items-center gap-3 rounded-xl p-1.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-blue-600 to-violet-600 text-white" aria-hidden="true">
            <User className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800 dark:text-zinc-100">{t("sidebar.guest")}</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label={t("sidebar.menu")}
                title={t("sidebar.menu")}
                className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-200/60 hover:text-slate-900 data-[state=open]:bg-slate-200/60 dark:text-zinc-400 dark:hover:bg-white/[0.08] dark:hover:text-white", FOCUS)}
              >
                <Settings className="h-5 w-5" aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent side="top" align="end" className="min-w-52">
              <DropdownMenuItem className={cn("min-h-11", DESTRUCTIVE)} variant="destructive" disabled={groups.length === 0} onSelect={onRequestClearAll}>
                <Trash2 aria-hidden="true" />
                {t("sidebar.clearAll")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="min-h-11" disabled>
                <Settings aria-hidden="true" />
                {t("sidebar.settings")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}

export default ChatSidebar;
