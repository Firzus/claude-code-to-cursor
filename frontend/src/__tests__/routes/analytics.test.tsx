import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { setupRouteComponentCapture, renderWithQuery } from "../test-utils";

const { getCapturedComponent } = setupRouteComponentCapture();

vi.mock("~/hooks/use-analytics", () => ({
  useAnalyticsSummary: vi.fn(),
  useAnalyticsRequests: vi.fn(),
  useAnalyticsTimeline: vi.fn(),
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
  ResponsiveContainer: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
}));

import {
  useAnalyticsSummary,
  useAnalyticsRequests,
  useAnalyticsTimeline,
} from "~/hooks/use-analytics";

const mockSummary = vi.mocked(useAnalyticsSummary);
const mockRequests = vi.mocked(useAnalyticsRequests);
const mockTimeline = vi.mocked(useAnalyticsTimeline);

async function renderAnalyticsPage() {
  await import("~/routes/analytics");
  const AnalyticsPage = getCapturedComponent()!;
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
  cacheHitRate: 0.75,
  periodStart: Date.now() - 86_400_000,
  periodEnd: Date.now(),
};

const requestsData = {
  requests: [
    {
      id: 1,
      timestamp: Date.now(),
      model: "claude-opus-4-6",
      source: "claude_code" as const,
      inputTokens: 500,
      outputTokens: 200,
      cacheReadTokens: 100,
      cacheCreationTokens: 50,
      stream: true,
      latencyMs: 1200,
      error: null,
    },
  ],
  total: 1,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("AnalyticsPage", () => {
  it("shows loading state", async () => {
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

  it("shows stat cards when data is loaded", async () => {
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

    expect(screen.getByText("Requests")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("Cache Hit Rate")).toBeInTheDocument();
  });

  it("shows error state", async () => {
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

    expect(screen.getByText("1H")).toBeInTheDocument();
    expect(screen.getByText("24H")).toBeInTheDocument();
    expect(screen.getByText("7D")).toBeInTheDocument();
    expect(screen.getByText("30D")).toBeInTheDocument();
    expect(screen.getByText("All")).toBeInTheDocument();
  });

  it("has refresh and reset buttons", async () => {
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
  });
});
