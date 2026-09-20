import { Component, type ErrorInfo, type ReactNode } from "react";

interface PdfErrorBoundaryProps {
  fallback: ReactNode;
  children: ReactNode;
}

/**
 * Catches anything the viewer can throw (failed lazy chunk, pdf.js / render exceptions) so a broken preview
 * degrades to the fallback card instead of unmounting the whole page to a white screen.
 */
export default class PdfErrorBoundary extends Component<PdfErrorBoundaryProps, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("PDF viewer crashed:", error, info.componentStack);
  }

  render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
