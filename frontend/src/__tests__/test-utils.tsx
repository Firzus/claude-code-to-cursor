import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, renderHook } from "@testing-library/react";
import type { FC, ReactNode } from "react";
import { vi } from "vitest";

let _capturedComponent: FC | null = null;

export function setupRouteComponentCapture() {
  _capturedComponent = null;
  vi.mock("@tanstack/react-router", () => ({
    createFileRoute: () => (opts: { component: FC }) => {
      _capturedComponent = opts.component;
      return { component: opts.component };
    },
  }));
  return { getCapturedComponent: () => _capturedComponent };
}

export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

export function createWrapper() {
  const qc = createTestQueryClient();
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

export function renderHookWithQuery<T>(hook: () => T) {
  const qc = createTestQueryClient();
  return {
    ...renderHook(hook, {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={qc}>{children}</QueryClientProvider>
      ),
    }),
    queryClient: qc,
  };
}

export function renderWithQuery(ui: ReactNode) {
  const qc = createTestQueryClient();
  return {
    ...render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>),
    queryClient: qc,
  };
}

/** Use after dynamic-importing a route file that calls `createFileRoute` (see `setupRouteComponentCapture`). */
export function requireCapturedRouteComponent(): FC {
  if (!_capturedComponent) {
    throw new Error(
      "No route component captured — import the route module after setupRouteComponentCapture()",
    );
  }
  return _capturedComponent;
}
