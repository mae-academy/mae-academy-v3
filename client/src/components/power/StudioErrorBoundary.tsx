import { Component, type ErrorInfo, type ReactNode } from "react";

interface StudioErrorBoundaryProps {
  children: ReactNode;
  studioName: string;
}

interface StudioErrorBoundaryState {
  error: Error | null;
}

export class StudioErrorBoundary extends Component<StudioErrorBoundaryProps, StudioErrorBoundaryState> {
  constructor(props: StudioErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): StudioErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`[${this.props.studioName}Studio] render error:`, error, errorInfo);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div role="alert" className="border-l-2 border-rose-500 bg-rose-50 px-3 py-2 dark:bg-rose-500/10">
          <div className="font-mono text-[9px] font-bold tracking-[.12em] text-rose-700 dark:text-rose-300">{this.props.studioName.toUpperCase()} STUDIO / RENDER ERROR</div>
          <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
            The studio failed to render for the current parameter combination. Resetting to default values usually clears this.
          </p>
          {import.meta.env.DEV && (
            <pre className="mt-2 overflow-auto rounded-lg bg-rose-100 p-2 text-[10px] text-rose-800 dark:bg-rose-500/20 dark:text-rose-200">{error.message}</pre>
          )}
        </div>
        <button
          type="button"
          onClick={() => this.setState({ error: null })}
          className="mt-3 rounded-full border border-rose-300 px-3 py-1.5 text-xs font-bold text-rose-700 transition hover:bg-rose-50 dark:border-rose-400/40 dark:text-rose-200 dark:hover:bg-rose-500/10"
        >
          Retry
        </button>
      </div>
    );
  }
}
