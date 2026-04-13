import { AlertTriangle, RotateCcw } from "lucide-react";
import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ErrorBoundary caught:", error, info);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div
          role="alert"
          className="flex flex-col items-center justify-center py-20 px-6 text-center animate-fade-in"
        >
          <div
            className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive mb-4"
            aria-hidden="true"
          >
            <AlertTriangle className="h-6 w-6" />
          </div>
          <h2 className="text-sm font-semibold mb-1">Something went wrong</h2>
          <p className="text-[13px] text-muted-foreground mb-4 max-w-sm">
            {this.state.error?.message || "An unexpected error occurred."}
          </p>
          <button
            onClick={() => window.location.reload()}
            className="inline-flex h-8 items-center gap-2 rounded-md bg-foreground px-4 text-[13px] font-medium text-background transition-opacity hover:opacity-90 cursor-pointer"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reload page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
