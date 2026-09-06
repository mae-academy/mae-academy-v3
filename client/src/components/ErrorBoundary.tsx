import React from 'react';

interface Props { children: React.ReactNode; }
interface State { hasError: boolean; error: Error | null; }

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 bg-red-50 text-red-900 font-mono w-full h-full min-h-screen z-50 fixed top-0 left-0">
          <h2 className="text-2xl font-bold mb-4">🚨 Application Crashed at Runtime!</h2>
          <p className="text-lg font-semibold mb-4">{this.state.error?.name}: {this.state.error?.message}</p>
          <div className="bg-red-100 p-4 rounded overflow-x-auto whitespace-pre-wrap">
            {this.state.error?.stack}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
