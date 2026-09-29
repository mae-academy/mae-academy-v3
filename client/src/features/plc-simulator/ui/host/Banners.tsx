import { AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ProfileIssue } from './program';

/** Compile findings for the current hardware, collapsed unless something is an error. */
export function IssueBanner({ label, issues }: { label: string; issues: readonly Pick<ProfileIssue, 'severity' | 'message'>[] }) {
  const { t } = useTranslation('simulators');
  if (issues.length === 0) return null;
  const errors = issues.filter((issue) => issue.severity === 'error').length;
  const warnings = issues.length - errors;
  return (
    <details
      open={errors > 0}
      className="shrink-0 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-400"
    >
      <summary className="flex cursor-pointer items-center gap-1.5 font-semibold">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="mae-i18n-text">
          {label}: {t('plc.errorsCount', '{{count}} error', { count: errors })}, {t('plc.warningsCount', '{{count}} warning', { count: warnings })}
        </span>
      </summary>
      <ul aria-label={t('plc.profileIssuesAria', 'Profile issues')} className="mt-1 max-h-32 list-disc overflow-y-auto pl-5">
        {issues.slice(0, 30).map((issue, index) => (
          <li key={index}>{issue.message}</li>
        ))}
      </ul>
    </details>
  );
}

export function NoticeBanner({ message, onDismiss }: { message: string | null; onDismiss: () => void }) {
  const { t } = useTranslation('simulators');
  if (message === null) return null;
  return (
    <div
      role="alert"
      className="flex shrink-0 items-center justify-between gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-1.5 text-xs text-red-700 dark:text-red-400"
    >
      <span>{message}</span>
      <button type="button" onClick={onDismiss} className="font-semibold underline">
        {t('plc.dismiss', 'Dismiss')}
      </button>
    </div>
  );
}
