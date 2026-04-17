import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, Link, Outlet } from "@tanstack/react-router";
import { Suspense } from "react";
import { ErrorBoundary } from "~/components/error-boundary";
import { NavBar } from "~/components/nav-bar";
import { Button } from "~/components/ui/button";
import { Spinner } from "~/components/ui/spinner";

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
      <main className="flex flex-col items-center justify-center py-20 sm:py-32 px-6 text-center animate-fade-in font-mono">
        <span className="text-[10.5px] uppercase tracking-[0.22em] text-muted-foreground/70 mb-3">
          {"// error · 404"}
        </span>
        <h1 className="text-5xl font-bold tracking-[-0.04em] mb-2">
          not_found
          <span aria-hidden="true" className="ml-1 inline-block caret text-accent" />
        </h1>
        <p className="text-[13px] text-muted-foreground mb-6 max-w-sm leading-relaxed">
          This page could not be found. Use the navigation above to find your way back.
        </p>
        <Button asChild variant="secondary" size="default">
          <Link to="/analytics">back to dashboard</Link>
        </Button>
      </main>
    </div>
  );
}

function PageLoader() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center justify-center gap-3 py-24 font-mono text-[12px] text-muted-foreground"
    >
      <Spinner variant="braille" />
      <span className="uppercase tracking-[0.18em]">loading···</span>
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
