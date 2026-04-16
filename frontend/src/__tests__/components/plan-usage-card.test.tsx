import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PlanUsageCard } from "~/components/analytics/plan-usage-card";
import { renderWithQuery } from "../test-utils";

vi.mock("~/hooks/use-plan-usage", () => ({
  usePlanUsage: vi.fn(),
}));

import { usePlanUsage } from "~/hooks/use-plan-usage";

const mockPlanUsage = vi.mocked(usePlanUsage);

describe("PlanUsageCard", () => {
  it("shows loading skeletons while fetching", () => {
    mockPlanUsage.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      refetch: vi.fn(),
    } as never);

    renderWithQuery(<PlanUsageCard />);
    expect(screen.queryByText("Plan usage")).not.toBeInTheDocument();
    expect(screen.queryByText("Current session")).not.toBeInTheDocument();
  });

  it('renders the "estimated" badge and token figures when source is estimated', () => {
    mockPlanUsage.mockReturnValue({
      data: {
        plan: "max20x",
        source: "estimated",
        capturedAt: null,
        representativeClaim: null,
        quotas: { fiveHourTokens: 220_000, weeklyTokens: 30_000_000 },
        usage: {
          fiveHour: {
            tokens: 44_000,
            limit: 220_000,
            percent: 20,
            resetAt: Date.now() + 3 * 60 * 60 * 1000,
          },
          weekly: {
            tokens: 6_000_000,
            limit: 30_000_000,
            percent: 20,
            resetAt: Date.now() + 6 * 24 * 60 * 60 * 1000,
          },
        },
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as never);

    renderWithQuery(<PlanUsageCard />);

    expect(screen.getByText("Plan usage")).toBeInTheDocument();
    expect(screen.getByText("Max (20x)")).toBeInTheDocument();
    expect(screen.getByText("Current session")).toBeInTheDocument();
    expect(screen.getByText("Weekly · All models")).toBeInTheDocument();
    expect(screen.getAllByText("20% used")).toHaveLength(2);
    expect(screen.getByText("Estimated")).toBeInTheDocument();
    // Estimated mode still shows token figures in the subtext
    expect(screen.getByText(/44.0K \/ 220.0K/)).toBeInTheDocument();
  });

  it('renders the "Live" badge and a binding marker when source is anthropic', () => {
    const capturedAt = Date.now() - 2 * 60 * 1000; // 2 min ago
    mockPlanUsage.mockReturnValue({
      data: {
        plan: "max20x",
        source: "anthropic",
        capturedAt,
        representativeClaim: "five_hour",
        quotas: { fiveHourTokens: 220_000, weeklyTokens: 30_000_000 },
        usage: {
          fiveHour: {
            percent: 1.84,
            resetAt: Date.now() + 3 * 60 * 60 * 1000,
            status: "allowed",
          },
          weekly: {
            percent: 48,
            resetAt: Date.now() + 18 * 60 * 60 * 1000,
            status: "allowed",
          },
        },
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as never);

    renderWithQuery(<PlanUsageCard />);

    expect(screen.getByText(/Live · 2min ago/)).toBeInTheDocument();
    expect(screen.getByText("Binding")).toBeInTheDocument();
    // Anthropic percentages without token figures
    expect(screen.getByText(/1.8% used/)).toBeInTheDocument();
    expect(screen.getByText(/48% used/)).toBeInTheDocument();
    expect(screen.queryByText(/220.0K/)).not.toBeInTheDocument();
  });

  it('shows the "No data yet" badge when source is none', () => {
    mockPlanUsage.mockReturnValue({
      data: {
        plan: "pro",
        source: "none",
        capturedAt: null,
        representativeClaim: null,
        quotas: { fiveHourTokens: 44_000, weeklyTokens: 1_500_000 },
        usage: {
          fiveHour: { percent: 0, resetAt: Date.now() + 5 * 60 * 60 * 1000, status: "unknown" },
          weekly: { percent: 0, resetAt: Date.now() + 7 * 24 * 60 * 60 * 1000, status: "unknown" },
        },
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as never);

    renderWithQuery(<PlanUsageCard />);

    expect(screen.getByText("Pro")).toBeInTheDocument();
    expect(screen.getByText("No data yet")).toBeInTheDocument();
  });

  it("shows an error state when the query fails", () => {
    mockPlanUsage.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: vi.fn(),
    } as never);

    renderWithQuery(<PlanUsageCard />);

    expect(screen.getByText("Failed to load plan usage.")).toBeInTheDocument();
    expect(screen.getByText("Retry")).toBeInTheDocument();
  });
});
