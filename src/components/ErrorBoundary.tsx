import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || 'An unexpected error occurred.',
    };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-[#F7F9FC] dark:bg-[#0E1117] text-[#111827] dark:text-[#F1F5F9]">
          <div className="max-w-lg w-full rounded-3xl bg-white dark:bg-[#171C24] border border-[#E2E8F0] dark:border-[#262E3B] p-6 sm:p-8 space-y-4">
            <h1 className="text-xl font-semibold">Something went wrong</h1>
            <p className="text-sm text-[#475569] dark:text-[#94A3B8] break-words font-mono bg-[#EEF2F7] dark:bg-[#1E2530] p-3 rounded-xl">
              {this.state.message}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-5 py-2.5 rounded-xl bg-[#0B57D0] text-white dark:bg-[#A8C7FA] dark:text-[#062E6F] text-sm font-medium hover:opacity-90 transition-opacity"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
