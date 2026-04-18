import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { FC, ReactNode } from "react";
import * as React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

function renderWithQuery(ui: ReactNode) {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  return {
    ...render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>),
    queryClient: qc,
  };
}

const captureRef = vi.hoisted(() => ({ value: null as FC | null }));

vi.mock("@tanstack/react-router", () => {
  const LinkMock: FC<{ children?: ReactNode; to: string; [key: string]: unknown }> = ({
    children,
    to,
    ...props
  }) => React.createElement("a", { href: to, ...props }, children);

  const CreateFileRoute = () => (opts: { component: FC }) => {
    captureRef.value = opts.component;
    return { component: opts.component, options: opts };
  };

  return {
    createFileRoute: CreateFileRoute,
    Link: LinkMock,
    redirect: vi.fn(),
  };
});

vi.mock("~/hooks/use-health", () => ({ useHealth: vi.fn() }));
vi.mock("~/hooks/use-settings", () => ({ useSettings: vi.fn() }));
vi.mock("~/hooks/use-analytics", () => ({ useAnalyticsSummary: vi.fn() }));
vi.mock("~/hooks/use-budget", () => ({ useBudgetDay: vi.fn() }));

import { useAnalyticsSummary } from "~/hooks/use-analytics";
import { useBudgetDay } from "~/hooks/use-budget";
import { useHealth } from "~/hooks/use-health";
import { useSettings } from "~/hooks/use-settings";

const mockHealth = vi.mocked(useHealth);
const mockSettings = vi.mocked(useSettings);
const mockSummary = vi.mocked(useAnalyticsSummary);
const mockBudget = vi.mocked(useBudgetDay);

const okHealth = {
  status: "ok" as const,
  tunnelUrl: "https://proxy.example.com",
  claudeCode: { authenticated: true, expiresAt: null },
  rateLimit: {
    isLimited: false,
    resetAt: null,
    minutesRemaining: null,
    inSoftExpiry: false,
    cachedAt: null,
  },
};

const okSettings = {
  settings: {
    selectedModel: "claude-opus-4-7" as const,
    subscriptionPlan: "max20x" as const,
  },
};

const okSummary = {
  period: "day",
  totalRequests: 42,
  claudeCodeRequests: 40,
  errorRequests: 2,
  totalInputTokens: 1_000,
  totalOutputTokens: 500,
  totalCacheReadTokens: 300,
  totalCacheCreationTokens: 100,
  cacheHitRate: 72.5,
  cacheSavingsUsdEstimate: 0.33,
  periodStart: Date.now() - 86_400_000,
  periodEnd: Date.now(),
};

const okBudget = {
  periodStart: Date.now() - 3_600_000,
  periodEnd: Date.now(),
  inputTokens: 1_000,
  outputTokens: 500,
  cacheReadTokens: 300,
  cacheCreationTokens: 100,
  estimatedUsd: 2.47,
};

async function renderHomePage() {
  const mod = (await import("~/routes/index")) as {
    Route?: { options?: { component?: FC }; component?: FC };
  };
  const HomePage = captureRef.value ?? mod.Route?.options?.component ?? mod.Route?.component;
  if (!HomePage) throw new Error("HomePage component not captured");
  return renderWithQuery(<HomePage />);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockHealth.mockReturnValue({
    data: okHealth,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  } as never);
  mockSettings.mockReturnValue({
    data: okSettings,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  } as never);
  mockSummary.mockReturnValue({
    data: okSummary,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  } as never);
  mockBudget.mockReturnValue({
    data: okBudget,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  } as never);
});

describe("HomePage", () => {
  it("renders the hero headline and taglines", async () => {
    await renderHomePage();

    expect(screen.getByText("claude_code")).toBeInTheDocument();
    expect(screen.getByText("cursor")).toBeInTheDocument();
    expect(
      screen.getByText(/OAuth-authenticated proxy that routes any OpenAI/i),
    ).toBeInTheDocument();
  });

  it("renders CTAs pointing to setup and analytics", async () => {
    await renderHomePage();

    expect(screen.getAllByRole("link", { name: /start setup/i }).length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: /open analytics/i })).toBeInTheDocument();
  });

  it("renders the live status panel with data from hooks", async () => {
    await renderHomePage();

    const panel = screen.getByRole("status", { name: /live proxy status/i });
    expect(panel).toBeInTheDocument();

    expect(screen.getByText("ONLINE")).toBeInTheDocument();
    expect(screen.getByText("opus_4_7")).toBeInTheDocument();
    expect(screen.getByText("72.5%")).toBeInTheDocument();
    expect(screen.getByText("$2.47")).toBeInTheDocument();
  });

  it("shows OFFLINE when the health query errors", async () => {
    mockHealth.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: vi.fn(),
    } as never);

    await renderHomePage();

    expect(screen.getByText("OFFLINE")).toBeInTheDocument();
  });

  it("shows UNAUTH when the user is not authenticated", async () => {
    mockHealth.mockReturnValue({
      data: {
        ...okHealth,
        claudeCode: { authenticated: false, expiresAt: null },
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as never);

    await renderHomePage();

    expect(screen.getByText("UNAUTH")).toBeInTheDocument();
  });

  it("renders the three feature cards", async () => {
    await renderHomePage();

    expect(screen.getByRole("heading", { name: /openai ↔ anthropic/i })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /four breakpoints, optimised/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /every request, every token/i }),
    ).toBeInTheDocument();
  });
});
