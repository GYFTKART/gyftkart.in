import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home, ChevronDown, ChevronUp } from 'lucide-react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  showDetails: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: false,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo });
    // In production, send to error reporting telemetry (e.g., Sentry / Datadog)
    console.error('Unhandled GyftKart Application Error:', error, errorInfo);
  }

  handleReload = (): void => {
    window.location.reload();
  };

  handleGoHome = (): void => {
    window.location.href = '/';
  };

  handleReset = (): void => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  toggleDetails = (): void => {
    this.setState((prev) => ({ showDetails: !prev.showDetails }));
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const { error, errorInfo, showDetails } = this.state;

      return (
        <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 sm:p-6 lg:p-8 font-sans">
          <div className="w-full max-w-lg bg-white rounded-3xl border border-slate-200/80 shadow-xl overflow-hidden p-6 sm:p-8 text-center animate-in fade-in zoom-in-95 duration-200">
            {/* Icon */}
            <div className="mx-auto mb-5 grid place-items-center h-16 w-16 rounded-2xl bg-amber-50 border border-amber-200 text-amber-600 shadow-sm">
              <AlertTriangle className="h-8 w-8" />
            </div>

            {/* Title & Description */}
            <h1 className="text-xl sm:text-2xl font-display font-extrabold text-slate-900 tracking-tight">
              Something went wrong
            </h1>
            <p className="mt-2 text-sm text-slate-600 leading-relaxed">
              We encountered an unexpected error while displaying this page. Don't worry, your wallet balance and orders remain completely safe.
            </p>

            {/* Primary Action Buttons */}
            <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                type="button"
                onClick={this.handleReload}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-semibold px-5 py-2.5 text-sm shadow-sm transition-colors"
              >
                <RefreshCw className="h-4 w-4" />
                Reload Page
              </button>
              <button
                type="button"
                onClick={this.handleGoHome}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold px-5 py-2.5 text-sm shadow-xs transition-colors"
              >
                <Home className="h-4 w-4" />
                Back to Home
              </button>
            </div>

            {/* Technical Details Accordion */}
            <div className="mt-6 pt-5 border-t border-slate-100 text-left">
              <button
                type="button"
                onClick={this.toggleDetails}
                className="w-full flex items-center justify-between text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors"
              >
                <span>Technical details</span>
                {showDetails ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>

              {showDetails && (
                <div className="mt-3 p-3.5 rounded-xl bg-slate-900 text-slate-200 font-mono text-[11px] overflow-x-auto max-h-48 text-left leading-relaxed">
                  <p className="text-rose-400 font-bold mb-1">
                    {error?.name}: {error?.message}
                  </p>
                  {errorInfo?.componentStack && (
                    <pre className="text-slate-400 whitespace-pre-wrap">{errorInfo.componentStack}</pre>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
