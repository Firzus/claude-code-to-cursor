import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, render } from "@testing-library/react";
import type { ReactNode } from "react";

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
    ...render(
      <QueryClientProvider client={qc}>{ui}</QueryClientProvider>,
    ),
    queryClient: qc,
  };
}
