import { Suspense } from "react";
import { Outlet, Link, createRootRouteWithContext } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import { NavBar } from "~/components/nav-bar";
import { ErrorBoundary } from "~/components/error-boundary";
import { Loader2 } from "lucide-react";

interface RouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootComponent,
  notFoundComponent: NotFoundPage,
});

function NotFoundPage() {
  return (
    <div className="min-h-screen bg-background">
      <NavBar />
      <main className="flex flex-col items-center justify-center py-32 px-6 text-center animate-fade-in">
        <h1 className="text-4xl font-bold font-mono mb-2">404</h1>
        <p className="text-[14px] text-muted-foreground mb-6">
          This page could not be found.
        </p>
        <Link
          to="/analytics"
          className="inline-flex h-8 items-center gap-2 rounded-md bg-foreground px-4 text-[13px] font-medium text-background transition-opacity hover:opacity-90"
        >
          Back to dashboard
        </Link>
      </main>
    </div>
  );
}

function PageLoader() {
  return (
    <div className="flex items-center justify-center py-24 text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" />
    </div>
  );
}

function RootComponent() {
  return (
    <div className="min-h-screen bg-background">
      <NavBar />
      <main className="mx-auto max-w-5xl px-6 py-8">
        <ErrorBoundary>
          <Suspense fallback={<PageLoader />}>
            <Outlet />
          </Suspense>
        </ErrorBoundary>
      </main>
    </div>
  );
}
