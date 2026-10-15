import { FileText, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ChatDocument } from "@shared/aiTypes";
import { cn } from "@/lib/utils";
import { formatFileSize } from "./documentUtils";

export interface DocumentBadgeProps {
  document: Pick<ChatDocument, "name" | "size">;
  /** Present in the composer: renders the remove button. */
  onRemove?: () => void;
  className?: string;
}

/** An attached file as a compact chip: icon, name (truncated, full name in the tooltip) and size. Text only, never a preview. */
export function DocumentBadge({ document, onRemove, className }: DocumentBadgeProps) {
  const { t } = useTranslation("ai");
  return (
    <div
      className={cn(
        "inline-flex max-w-full items-center gap-2.5 rounded-2xl border border-slate-200 bg-slate-50 py-2 ps-3 text-slate-800 dark:border-white/[0.12] dark:bg-white/[0.05] dark:text-zinc-100",
        onRemove ? "pe-1" : "pe-3",
        className,
      )}
    >
      <FileText className="h-5 w-5 shrink-0 text-violet-600 dark:text-violet-300" aria-hidden="true" />
      <span className="flex min-w-0 flex-col leading-tight">
        <span dir="auto" title={document.name} className="truncate text-sm font-medium">{document.name}</span>
        <span className="text-xs text-slate-500 tabular-nums dark:text-zinc-400"><bdi>{formatFileSize(document.size)}</bdi></span>
      </span>
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={t("composer.removeAttachment")}
          title={t("composer.removeAttachment")}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-200/70 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue-600 dark:text-zinc-400 dark:hover:bg-white/[0.1] dark:hover:text-white"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}

export default DocumentBadge;
