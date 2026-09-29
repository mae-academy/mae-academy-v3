import { Check, Copy, Download } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { ExportFile } from '../../transpiler';
import { copyText, downloadText } from './download';

export interface ExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Built lazily so the STL is generated only when the dialog is actually opened. */
  build: () => ExportFile;
}

const button =
  'inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-300 px-3 text-xs font-medium hover:bg-slate-100 disabled:opacity-50 dark:border-slate-600 dark:hover:bg-slate-800';

/** STEP 7-Micro/WIN export: preview, copy to clipboard, or download the `.awl` (and `.sym`). */
export function ExportDialog({ open, onOpenChange, build }: ExportDialogProps) {
  const { t } = useTranslation('simulators');
  const [file, setFile] = useState<ExportFile | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (open) {
      setFile(build());
      setCopied(false);
    }
  }, [open, build]);

  const problems = file?.diagnostics.filter((d) => d.severity === 'error') ?? [];
  const warnings = file?.diagnostics.filter((d) => d.severity === 'warning') ?? [];

  const copy = async (): Promise<void> => {
    if (!file) return;
    setCopied(await copyText(file.content));
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t('plc.exportDialogTitle', 'Export to STEP 7-Micro/WIN')}</DialogTitle>
          <DialogDescription>
            {t(
              'plc.exportDialogDescription',
              'Paste the source into the STL editor, or use File ► Import. Not yet verified against a real Micro/WIN install: confirm one import before relying on it.',
            )}
          </DialogDescription>
        </DialogHeader>

        <textarea
          readOnly
          dir="ltr"
          value={file?.content ?? ''}
          aria-label={t('plc.awlSourceAria', 'AWL source')}
          spellCheck={false}
          wrap="off"
          className="h-72 w-full resize-none rounded-md border border-slate-200 bg-slate-50 p-3 text-left font-mono text-xs leading-5 text-slate-900 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
        />

        {(problems.length > 0 || warnings.length > 0) && (
          <ul aria-label={t('plc.exportDiagnosticsAria', 'Export diagnostics')} className="max-h-24 overflow-y-auto text-xs">
            {[...problems, ...warnings].slice(0, 8).map((d, i) => (
              <li key={i} className={d.severity === 'error' ? 'text-red-600' : 'text-amber-600'}>
                {d.severity}: {d.message}
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-wrap items-center justify-end gap-2">
          <button type="button" className={button} disabled={!file} onClick={copy}>
            {copied ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
            {copied ? t('plc.copiedShort', 'Copied') : t('plc.copyShort', 'Copy')}
          </button>
          {file?.symbolTable && (
            <button
              type="button"
              className={button}
              onClick={() => downloadText(file.symbolTable?.fileName ?? 'program.sym', file.symbolTable?.content ?? '')}
            >
              <Download className="h-3.5 w-3.5" aria-hidden="true" />
              {file.symbolTable.fileName}
            </button>
          )}
          <button type="button" className={button} disabled={!file} onClick={() => file && downloadText(file.fileName, file.content)}>
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            {t('plc.downloadFile', 'Download {{filename}}', { filename: file?.fileName ?? '.awl' })}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
