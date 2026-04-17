import { AlertTriangle, RotateCcw } from "lucide-react";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { EmptyState } from "./empty-state";
import { Button } from "./ui/button";

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

  override render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <EmptyState
          icon={AlertTriangle}
          tone="destructive"
          title="Something went wrong"
          description={this.state.error?.message || "An unexpected error occurred."}
          action={
            <Button
              variant="secondary"
              size="sm"
              leading={<RotateCcw className="h-3 w-3" aria-hidden="true" />}
              onClick={() => window.location.reload()}
            >
              Reload page
            </Button>
          }
        />
      );
    }

    return this.props.children;
  }
}
