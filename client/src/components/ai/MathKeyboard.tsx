import { useRef, useState, type KeyboardEvent } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { KatexMath } from "@/components/ui/KatexMath";
import { cn } from "@/lib/utils";
import { MATH_TABS, type MathKey, type MathTabId } from "./mathKeyboardData";

const TAB_STORAGE_KEY = "mae-ai:mathkb-tab:v1";

function readStoredTab(): MathTabId {
  try {
    const stored = window.localStorage.getItem(TAB_STORAGE_KEY);
    if (MATH_TABS.some((tab) => tab.id === stored)) return stored as MathTabId;
  } catch {
    /* storage unavailable */
  }
  return "calculus";
}

function storeTab(id: MathTabId) {
  try {
    window.localStorage.setItem(TAB_STORAGE_KEY, id);
  } catch {
    /* storage unavailable */
  }
}

/** Keeps the textarea focused: a pointer press on a key must never move focus off the field being typed in. */
const keepFocus = { onMouseDown: (event: { preventDefault: () => void }) => event.preventDefault(), onPointerDown: (event: { preventDefault: () => void }) => event.preventDefault() };

export interface MathKeyboardToggleProps {
  open: boolean;
  panelId: string;
  onToggle: () => void;
}

/** The composer button whose face is the rendered radical. */
export function MathKeyboardToggle({ open, panelId, onToggle }: MathKeyboardToggleProps) {
  const { t } = useTranslation("ai");
  const label = t(open ? "mathKeyboard.close" : "mathKeyboard.open");
  return (
    <button
      type="button"
      onClick={onToggle}
      {...keepFocus}
      aria-label={label}
      title={label}
      aria-expanded={open}
      aria-controls={panelId}
      data-math-keyboard-toggle
      className={cn(
        "flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-600 dark:text-zinc-400 dark:hover:bg-white/[0.08] dark:hover:text-white",
        open && "bg-gradient-to-r from-blue-600/15 via-indigo-600/15 to-violet-600/15 text-blue-800 ring-1 ring-blue-500/30 dark:from-blue-500/25 dark:via-indigo-500/25 dark:to-violet-500/25 dark:text-blue-100 dark:ring-blue-400/30",
      )}
    >
      <span aria-hidden="true" dir="ltr">
        <KatexMath math="\sqrt{x}" />
      </span>
    </button>
  );
}

export interface MathKeyboardProps {
  open: boolean;
  id: string;
  onInsert: (key: MathKey) => void;
  onClose: () => void;
  /** The last insertion was refused because it would exceed the message limit. */
  tooLong: boolean;
}

/** Tabbed key grid; sits in flow above the input bar and never takes focus from the textarea on pointer use. */
export function MathKeyboard({ open, id, onInsert, onClose, tooLong }: MathKeyboardProps) {
  const { t } = useTranslation("ai");
  const reduceMotion = useReducedMotion();
  const [tab, setTab] = useState<MathTabId>(readStoredTab);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const select = (next: MathTabId, focus = false) => {
    setTab(next);
    storeTab(next);
    if (focus) tabRefs.current[next]?.focus();
  };

  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const index = MATH_TABS.findIndex((item) => item.id === tab);
    const rtl = getComputedStyle(event.currentTarget).direction === "rtl";
    let next = index;
    if (event.key === "ArrowRight") next = index + (rtl ? -1 : 1);
    else if (event.key === "ArrowLeft") next = index + (rtl ? 1 : -1);
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = MATH_TABS.length - 1;
    else return;
    event.preventDefault();
    select(MATH_TABS[(next + MATH_TABS.length) % MATH_TABS.length].id, true);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
    }
  };

  const active = MATH_TABS.find((item) => item.id === tab) ?? MATH_TABS[0];
  const tabLabel = (tabId: MathTabId) => t(`mathKeyboard.tabs.${tabId}`);

  return (
    <AnimatePresence initial={false}>
      {open ? (
        <motion.div
          key="math-keyboard"
          initial={reduceMotion ? false : { height: 0, opacity: 0 }}
          animate={reduceMotion ? undefined : { height: "auto", opacity: 1 }}
          exit={reduceMotion ? { opacity: 1 } : { height: 0, opacity: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.18, ease: "easeOut" }}
          className="overflow-hidden pb-2.5"
        >
          <div
            id={id}
            role="region"
            aria-label={t("mathKeyboard.panel")}
            aria-describedby={`${id}-hint`}
            onKeyDown={onKeyDown}
            className="mx-2.5 mt-2.5 rounded-2xl border border-slate-200 bg-slate-50/80 dark:border-white/[0.1] dark:bg-white/[0.03]"
          >
            <p id={`${id}-hint`} className="sr-only">{t("mathKeyboard.hint")}</p>
            <div role="tablist" aria-label={t("mathKeyboard.tabsLabel")} className="flex gap-1 overflow-x-auto px-2.5 py-2 [scrollbar-width:none]">
              {MATH_TABS.map((item) => {
                const selected = item.id === tab;
                return (
                  <button
                    key={item.id}
                    ref={(node) => { tabRefs.current[item.id] = node; }}
                    type="button"
                    role="tab"
                    id={`${id}-tab-${item.id}`}
                    aria-selected={selected}
                    aria-controls={`${id}-panel-${item.id}`}
                    tabIndex={selected ? 0 : -1}
                    onClick={() => select(item.id)}
                    onKeyDown={onTabKeyDown}
                    {...keepFocus}
                    className={cn(
                      "min-h-10 shrink-0 whitespace-nowrap rounded-full px-3.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-600",
                      selected
                        ? "bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white shadow-md shadow-indigo-500/20"
                        : "text-slate-600 hover:bg-slate-200/60 dark:text-zinc-300 dark:hover:bg-white/[0.08]",
                    )}
                  >
                    {tabLabel(item.id)}
                  </button>
                );
              })}
            </div>
            <div
              role="tabpanel"
              id={`${id}-panel-${active.id}`}
              aria-labelledby={`${id}-tab-${active.id}`}
              aria-label={t("mathKeyboard.keysLabel", { tab: tabLabel(active.id) })}
              className="max-h-[260px] overflow-y-auto overscroll-contain p-2"
            >
              <div dir="ltr" className="grid grid-cols-[repeat(auto-fill,minmax(3.5rem,1fr))] gap-1.5">
                {active.keys.map((item) => {
                  const name = t(`mathKeyboard.keys.${item.id}`, { defaultValue: item.name });
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onInsert(item)}
                      {...keepFocus}
                      aria-label={name}
                      title={name}
                      data-key-id={item.id}
                      className="flex min-h-11 min-w-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white px-1.5 py-1 text-[0.95rem] text-slate-900 shadow-sm transition-[transform,background-color,border-color] hover:border-blue-300 hover:bg-gradient-to-br hover:from-blue-50 hover:to-violet-50 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-600 active:scale-95 active:from-blue-100 active:to-violet-100 dark:border-white/[0.1] dark:bg-[#1c1c22] dark:text-white dark:hover:border-blue-400/50 dark:hover:from-blue-500/20 dark:hover:to-violet-500/20 dark:active:from-blue-500/30 dark:active:to-violet-500/30"
                    >
                      <span aria-hidden="true" className="pointer-events-none max-w-full">
                        <KatexMath math={item.face} />
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
            {tooLong ? (
              <p role="status" className="px-3 pb-2 text-xs font-medium text-rose-600 dark:text-rose-400">{t("mathKeyboard.tooLong")}</p>
            ) : null}
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
