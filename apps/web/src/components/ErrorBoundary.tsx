'use client';

/**
 * React Error Boundary — prevents a component crash from white-screening the entire app.
 *
 * Usage:
 *   <ErrorBoundary>
 *     <SomethingThatMightCrash />
 *   </ErrorBoundary>
 *
 * Or with a custom fallback:
 *   <ErrorBoundary fallback={<p>Something went wrong</p>}>
 *     <SomethingThatMightCrash />
 *   </ErrorBoundary>
 */

import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children:  ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  errorId:  string | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, errorId: null };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true, errorId: Math.random().toString(36).slice(2, 9) };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Log to server-side error tracking — never expose to the user
    // Replace with Sentry.captureException(error, { extra: info }) when Sentry is configured
    console.error('[ErrorBoundary] Caught error:', error.message, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="flex flex-col items-center justify-center min-h-[200px] gap-4 p-8 text-center">
          <div className="text-4xl">⚠️</div>
          <h2 className="text-white font-semibold text-lg">Something went wrong</h2>
          <p className="text-white/50 text-sm max-w-xs">
            An unexpected error occurred. The rest of the app is still working.
          </p>
          <button
            onClick={() => this.setState({ hasError: false, errorId: null })}
            className="bg-pink-500 hover:bg-pink-600 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
          >
            Try again
          </button>
          {process.env.NODE_ENV === 'development' && this.state.errorId && (
            <p className="text-white/20 text-xs font-mono">ref: {this.state.errorId}</p>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

/** Convenience wrapper for feed/video cards that shouldn't crash the whole page */
export function SafeRender({ children, label = 'component' }: { children: ReactNode; label?: string }) {
  return (
    <ErrorBoundary
      fallback={
        <div className="flex items-center justify-center h-full text-white/20 text-xs p-4">
          {label} unavailable
        </div>
      }
    >
      {children}
    </ErrorBoundary>
  );
}
