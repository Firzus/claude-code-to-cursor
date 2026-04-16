import { screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  renderWithQuery,
  requireCapturedRouteComponent,
  setupRouteComponentCapture,
} from "../test-utils";

setupRouteComponentCapture();

vi.mock("~/hooks/use-analytics", () => ({
  useAnalyticsSummary: vi.fn(),
  useAnalyticsRequests: vi.fn(),
  useAnalyticsTimeline: vi.fn(),
}));

vi.mock("~/hooks/use-budget", () => ({
  useBudgetDay: vi.fn(),
}));

vi.mock("~/hooks/use-plan-usage", () => ({
  usePlanUsage: vi.fn(),
}));

vi.mock("~/lib/api-client", () => ({
  apiFetch: vi.fn(),
}));

vi.mock("recharts", () => ({
  AreaChart: ({ children }: { children: ReactNode }) => (
    <div data-testid="area-chart">{children}</div>
  ),
  Area: () => null,
  CartesianGrid: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  ReferenceLine: () => null,
  ResponsiveContainer: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

import {
  useAnalyticsRequests,
  useAnalyticsSummary,
  useAnalyticsTimeline,
} from "~/hooks/use-analytics";
import { useBudgetDay } from "~/hooks/use-budget";
import { usePlanUsage } from "~/hooks/use-plan-usage";

const mockSummary = vi.mocked(useAnalyticsSummary);
const mockRequests = vi.mocked(useAnalyticsRequests);
const mockTimeline = vi.mocked(useAnalyticsTimeline);
const mockBudget = vi.mocked(useBudgetDay);
const mockPlanUsage = vi.mocked(usePlanUsage);

const planUsageData = {
  plan: "max20x" as const,
  source: "estimated" as const,
  capturedAt: null,
  representativeClaim: null,
  quotas: { fiveHourTokens: 220_000, weeklyTokens: 30_000_000 },
  usage: {
    fiveHour: {
      tokens: 22_000,
      limit: 220_000,
      percent: 10,
      resetAt: Date.now() + 60 * 60 * 1000,
    },
    weekly: {
      tokens: 3_000_000,
      limit: 30_000_000,
      percent: 10,
      resetAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
    },
  },
};

const budgetData = {
  periodStart: Date.UTC(2024, 0, 1, 0, 0, 0, 0),
  periodEnd: Date.UTC(2024, 0, 1, 12, 0, 0, 0),
  inputTokens: 100,
  outputTokens: 50,
  cacheReadTokens: 20,
  cacheCreationTokens: 5,
  thinkingTokens: 10,
  estimatedUsd: 1.25,
};

async function renderAnalyticsPage() {
  await import("~/routes/analytics");
  const AnalyticsPage = requireCapturedRouteComponent();
  return renderWithQuery(<AnalyticsPage />);
}

const summaryData = {
  period: "day",
  totalRequests: 42,
  claudeCodeRequests: 40,
  errorRequests: 2,
  totalInputTokens: 10_000,
  totalOutputTokens: 5_000,
  totalCacheReadTokens: 3_000,
  totalCacheCreationTokens: 1_000,
  totalThinkingTokens: 400,
  cacheHitRate: 0.75,
  cacheSavingsUsdEstimate: 0.33,
  periodStart: Date.now() - 86_400_000,
  periodEnd: Date.now(),
};

const requestsData = {
  requests: [
    {
      id: 1,
      timestamp: Date.now(),
      model: "claude-opus-4-7",
      source: "claude_code" as const,
      inputTokens: 500,
      outputTokens: 200,
      cacheReadTokens: 100,
      cacheCreationTokens: 50,
      stream: true,
      latencyMs: 1200,
      error: null,
      estimatedUsd: 0.03,
    },
  ],
  total: 1,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockBudget.mockReturnValue({
    data: budgetData,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  } as never);
  mockPlanUsage.mockReturnValue({
    data: planUsageData,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  } as never);
});

describe("AnalyticsPage", () => {
  it("shows loading state", async () => {
    mockBudget.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      refetch: vi.fn(),
    } as never);
    mockSummary.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      dataUpdatedAt: 0,
      refetch: vi.fn(),
    } as never);
    mockRequests.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      refetch: vi.fn(),
    } as never);
    mockTimeline.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
    } as never);

    await renderAnalyticsPage();

    expect(screen.getByText("Analytics")).toBeInTheDocument();
  });

  it("no longer shows the removed stat cards (Requests, Est. cost saved, Avg output)", async () => {
    mockSummary.mockReturnValue({
      data: summaryData,
      isLoading: false,
      isError: false,
      dataUpdatedAt: Date.now(),
      refetch: vi.fn(),
    } as never);
    mockRequests.mockReturnValue({
      data: requestsData,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as never);
    mockTimeline.mockReturnValue({
      data: { period: "day", buckets: [] },
      isLoading: false,
      isError: false,
    } as never);

    await renderAnalyticsPage();

    expect(screen.queryByText("Requests")).not.toBeInTheDocument();
    expect(screen.queryByText("Est. cost saved")).not.toBeInTheDocument();
    expect(screen.queryByText("Avg output")).not.toBeInTheDocument();
    expect(screen.queryByText("Cache saved")).not.toBeInTheDocument();
  });

  it("shows simplified budget section with 3 metrics (cost removed, plan usage handles it)", async () => {
    mockSummary.mockReturnValue({
      data: summaryData,
      isLoading: false,
      isError: false,
      dataUpdatedAt: Date.now(),
      refetch: vi.fn(),
    } as never);
    mockRequests.mockReturnValue({
      data: requestsData,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as never);
    mockTimeline.mockReturnValue({
      data: { period: "day", buckets: [] },
      isLoading: false,
      isError: false,
    } as never);

    await renderAnalyticsPage();

    expect(screen.queryByText("Estimated cost")).not.toBeInTheDocument();
    expect(screen.queryByText("$1.25")).not.toBeInTheDocument();
    expect(screen.getByText("Tokens in")).toBeInTheDocument();
    expect(screen.getByText("Tokens out")).toBeInTheDocument();
    expect(screen.getByText("Cache hit rate")).toBeInTheDocument();
  });

  it("renders plan usage card", async () => {
    mockSummary.mockReturnValue({
      data: summaryData,
      isLoading: false,
      isError: false,
      dataUpdatedAt: Date.now(),
      refetch: vi.fn(),
    } as never);
    mockRequests.mockReturnValue({
      data: requestsData,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as never);
    mockTimeline.mockReturnValue({
      data: { period: "day", buckets: [] },
      isLoading: false,
      isError: false,
    } as never);

    await renderAnalyticsPage();

    expect(screen.getByText("Plan usage")).toBeInTheDocument();
    expect(screen.getByText("Max (20x)")).toBeInTheDocument();
    expect(screen.getByText("Current session")).toBeInTheDocument();
    expect(screen.getByText(/Weekly/)).toBeInTheDocument();
  });

  it("shows error state", async () => {
    mockBudget.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as never);
    mockSummary.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      dataUpdatedAt: 0,
      refetch: vi.fn(),
    } as never);
    mockRequests.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as never);
    mockTimeline.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: false,
    } as never);

    await renderAnalyticsPage();

    expect(screen.getByText("Failed to load analytics.")).toBeInTheDocument();
  });

  it("shows empty state when no requests", async () => {
    mockSummary.mockReturnValue({
      data: summaryData,
      isLoading: false,
      isError: false,
      dataUpdatedAt: Date.now(),
      refetch: vi.fn(),
    } as never);
    mockRequests.mockReturnValue({
      data: { requests: [], total: 0 },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as never);
    mockTimeline.mockReturnValue({
      data: { period: "day", buckets: [] },
      isLoading: false,
      isError: false,
    } as never);

    await renderAnalyticsPage();

    expect(screen.getByText("No requests yet")).toBeInTheDocument();
  });

  it("renders period buttons", async () => {
    mockSummary.mockReturnValue({
      data: summaryData,
      isLoading: false,
      isError: false,
      dataUpdatedAt: Date.now(),
      refetch: vi.fn(),
    } as never);
    mockRequests.mockReturnValue({
      data: requestsData,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as never);
    mockTimeline.mockReturnValue({
      data: { period: "day", buckets: [] },
      isLoading: false,
      isError: false,
    } as never);

    await renderAnalyticsPage();

    expect(screen.getByText("5H")).toBeInTheDocument();
    expect(screen.getByText("24H")).toBeInTheDocument();
    expect(screen.getByText("7J")).toBeInTheDocument();
    expect(screen.getByText("30J")).toBeInTheDocument();
    expect(screen.getByText("All")).toBeInTheDocument();
  });

  it("has refresh, reset, and export buttons", async () => {
    mockSummary.mockReturnValue({
      data: summaryData,
      isLoading: false,
      isError: false,
      dataUpdatedAt: Date.now(),
      refetch: vi.fn(),
    } as never);
    mockRequests.mockReturnValue({
      data: requestsData,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as never);
    mockTimeline.mockReturnValue({
      data: { period: "day", buckets: [] },
      isLoading: false,
      isError: false,
    } as never);

    await renderAnalyticsPage();

    expect(screen.getByLabelText("Refresh analytics data")).toBeInTheDocument();
    expect(screen.getByLabelText("Reset analytics data")).toBeInTheDocument();
    expect(screen.getByLabelText("Export CSV")).toBeInTheDocument();
  });

  it("renders request table with expandable rows", async () => {
    mockSummary.mockReturnValue({
      data: summaryData,
      isLoading: false,
      isError: false,
      dataUpdatedAt: Date.now(),
      refetch: vi.fn(),
    } as never);
    mockRequests.mockReturnValue({
      data: requestsData,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as never);
    mockTimeline.mockReturnValue({
      data: { period: "day", buckets: [] },
      isLoading: false,
      isError: false,
    } as never);

    await renderAnalyticsPage();

    expect(screen.getByText("Request History")).toBeInTheDocument();
    expect(screen.getByText("opus-4-7")).toBeInTheDocument();
    expect(screen.getByText("$0.03")).toBeInTheDocument();
  });
});
