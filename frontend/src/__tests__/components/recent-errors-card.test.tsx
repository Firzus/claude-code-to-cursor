import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RecentErrorsCard } from "~/components/analytics/recent-errors-card";
import { renderWithQuery } from "../test-utils";

vi.mock("~/hooks/use-analytics", () => ({
  useAnalyticsErrors: vi.fn(),
}));

import { useAnalyticsErrors } from "~/hooks/use-analytics";

const mockErrorsHook = vi.mocked(useAnalyticsErrors);

describe("RecentErrorsCard", () => {
  it("shows loading skeletons while fetching", () => {
    mockErrorsHook.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      refetch: vi.fn(),
    } as never);

    const { container } = renderWithQuery(<RecentErrorsCard period="day" />);
    expect(screen.getByText("recent errors")).toBeInTheDocument();
    // 3 skeleton blocks
    expect(
      container.querySelectorAll('[data-slot="skeleton"], .animate-pulse').length,
    ).toBeGreaterThan(0);
  });

  it("renders nothing on brand-new installs (totalAllTime=0)", () => {
    mockErrorsHook.mockReturnValue({
      data: { errors: [], total: 0, totalAllTime: 0 },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as never);

    const { container } = renderWithQuery(<RecentErrorsCard period="day" />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders empty state when no errors in window but there are historical errors", () => {
    mockErrorsHook.mockReturnValue({
      data: { errors: [], total: 0, totalAllTime: 5 },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as never);

    renderWithQuery(<RecentErrorsCard period="day" />);
    expect(screen.getByText("recent errors")).toBeInTheDocument();
    expect(screen.getByText(/no errors in this window/i)).toBeInTheDocument();
    expect(screen.getByText(/5 total all-time/i)).toBeInTheDocument();
  });

  it("renders the list of recent errors with model, message, and latency", () => {
    mockErrorsHook.mockReturnValue({
      data: {
        errors: [
          {
            id: 1,
            timestamp: Date.now() - 30_000,
            model: "claude-opus-4-7",
            error: "upstream timeout",
            latencyMs: 3200,
            route: "anthropic",
          },
          {
            id: 2,
            timestamp: Date.now() - 5 * 60_000,
            model: "claude-sonnet-4-6",
            error: "invalid request: prompt too long",
            latencyMs: 120,
            route: "openai",
          },
        ],
        total: 2,
        totalAllTime: 2,
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as never);

    renderWithQuery(<RecentErrorsCard period="day" />);
    expect(screen.getByText("recent errors")).toBeInTheDocument();
    expect(screen.getByText("2 in window")).toBeInTheDocument();
    expect(screen.getByText("opus-4-7")).toBeInTheDocument();
    expect(screen.getByText("sonnet-4-6")).toBeInTheDocument();
    expect(screen.getByText("upstream timeout")).toBeInTheDocument();
    expect(screen.getByText("invalid request: prompt too long")).toBeInTheDocument();
    expect(screen.getByText("3.2s")).toBeInTheDocument();
    expect(screen.getByText("120ms")).toBeInTheDocument();
  });

  it("shows an error state with retry button when the query fails", () => {
    const refetch = vi.fn();
    mockErrorsHook.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch,
    } as never);

    renderWithQuery(<RecentErrorsCard period="day" />);
    expect(screen.getByText(/failed to load errors/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });
});
