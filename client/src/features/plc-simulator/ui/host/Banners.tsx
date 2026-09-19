import { AlertTriangle } from 'lucide-react';
import type { ProfileIssue } from './program';

/** Compile findings for the current hardware, collapsed unless something is an error. */
export function IssueBanner({ label, issues }: { label: string; issues: readonly Pick<ProfileIssue, 'severity' | 'message'>[] }) {
  if (issues.length === 0) return null;
  const errors = issues.filter((issue) => issue.severity === 'error').length;
  const warnings = issues.length - errors;
  return (
    <details
      open={errors > 0}
      className={`shrink-0 rounded-xl border px-3 py-2 text-xs ${
        errors > 0
          ? 'border-rose-500/30 bg-rose-500/10 text-rose-800 dark:text-rose-200'
          : 'border-amber-500/30 bg-amber-500/10 text-amber-800 dark:text-amber-200'
      }`}
    >
      <summary className="flex cursor-pointer items-center gap-1.5 font-semibold">
        <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
        {label}: {errors} error{errors === 1 ? '' : 's'}, {warnings} warning{warnings === 1 ? '' : 's'}
      </summary>
      <ul aria-label="Profile issues" className="mt-1 max-h-32 list-disc overflow-y-auto pl-5">
        {issues.slice(0, 30).map((issue, index) => (
          <li key={index}>{issue.message}</li>
        ))}
      </ul>
    </details>
  );
}

export function NoticeBanner({ message, onDismiss }: { message: string | null; onDismiss: () => void }) {
  if (message === null) return null;
  return (
    <div
      role="alert"
      className="flex shrink-0 items-center justify-between gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs text-rose-800 dark:text-rose-200"
    >
      <span>{message}</span>
      <button type="button" onClick={onDismiss} className="font-semibold underline">
        Dismiss
      </button>
    </div>
  );
}
