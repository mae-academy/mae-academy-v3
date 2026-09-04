import { type FormEvent, useState } from "react";
import { Cpu, LoaderCircle, Send } from "lucide-react";
import KatexMath from "@/components/ui/KatexMath";

function renderAnalysis(text: string) {
  return text.split(/(\$\$[\s\S]*?\$\$|\$[^$\n]+\$)/g).map((segment, index) => {
    if (segment.startsWith("$$") && segment.endsWith("$$")) {
      return <KatexMath key={index} math={segment.slice(2, -2).trim()} block className="my-3 block overflow-x-auto" />;
    }
    if (segment.startsWith("$") && segment.endsWith("$")) {
      return <KatexMath key={index} math={segment.slice(1, -1).trim()} />;
    }
    return <span key={index}>{segment}</span>;
  });
}

export default function CircuitAnalysisAssistant() {
  const [prompt, setPrompt] = useState("");
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!prompt.trim() || loading) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/ai/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const payload = await response.json() as { result?: string; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Analysis request failed.");
      setResult(payload.result ?? "No analysis was returned.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Analysis request failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm rounded-2xl p-6">
      <div className="mb-4 flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-xl bg-gradient-to-r from-blue-600 to-pink-500 text-white shadow-sm">
          <Cpu size={20} aria-hidden="true" />
        </span>
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-800 dark:text-white">Circuit Analysis Assistant</h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Ask DeepSeek to explain the active circuit.</p>
        </div>
      </div>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row">
        <input
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="Ask about voltage, current, topology, or stability..."
          className="min-h-10 flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm text-slate-800 outline-none focus:border-blue-500 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
        />
        <button type="submit" disabled={loading || !prompt.trim()} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-pink-500 px-3 py-1.5 text-xs font-medium text-white shadow-sm disabled:cursor-not-allowed disabled:opacity-50">
          {loading ? <LoaderCircle size={15} className="animate-spin" aria-hidden="true" /> : <Send size={15} aria-hidden="true" />}
          Analyze
        </button>
      </form>
      {error && <p role="alert" className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300">{error}</p>}
      {result && <div className="mt-5 whitespace-pre-wrap text-sm leading-7 text-slate-700 dark:text-slate-300">{renderAnalysis(result)}</div>}
    </section>
  );
}
