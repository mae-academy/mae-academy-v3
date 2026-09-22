import { ExternalLink, FileX } from "lucide-react";

/** Shown whenever the in-page PDF preview cannot be produced. Deliberately links to the publisher, never the raw PDF. */
interface PdfPreviewFallbackProps {
  landingPageUrl: string;
  /** Wording for the outbound link and message; defaults to the research-paper flow. */
  landingLabel?: string;
}

export default function PdfPreviewFallback({ landingPageUrl, landingLabel = "Publisher Page" }: PdfPreviewFallbackProps) {
  return (
    <div
      role="status"
      className="flex h-[400px] flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center shadow-sm dark:border-white/[0.08] dark:bg-zinc-950 lg:sticky lg:top-24"
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-200 dark:bg-slate-800">
        <FileX className="h-6 w-6 text-slate-500 dark:text-slate-400" />
      </div>
      <div>
        <h3 className="mb-1 text-lg font-bold text-slate-800 dark:text-zinc-200">Preview Not Available</h3>
        <p className="mx-auto max-w-sm text-sm text-slate-500 dark:text-zinc-400">
          We could not load an in-page preview of this document. Please use the {landingLabel === "Publisher Page" ? "publisher's page" : landingLabel} to read it.
        </p>
      </div>
      {landingPageUrl && (
        <a
          href={landingPageUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-full bg-violet-600 px-6 py-2 text-sm font-semibold text-white transition-colors hover:bg-violet-700"
        >
          {landingLabel} <ExternalLink className="h-4 w-4" />
        </a>
      )}
    </div>
  );
}
