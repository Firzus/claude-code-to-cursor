import { waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePlanUsage } from "~/hooks/use-plan-usage";
import { renderHookWithQuery } from "../test-utils";

vi.mock("~/lib/api-client", () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from "~/lib/api-client";

const mockApiFetch = vi.mocked(apiFetch);

beforeEach(() => {
  vi.clearAllMocks();
});

const mockPlanUsage = {
  plan: "max5x" as const,
  source: "estimated" as const,
  capturedAt: null,
  representativeClaim: null,
  quotas: { fiveHourTokens: 88_000, weeklyTokens: 7_500_000 },
  usage: {
    fiveHour: {
      tokens: 22_000,
      limit: 88_000,
      percent: 25,
      resetAt: Date.now() + 60 * 60 * 1000,
    },
    weekly: {
      tokens: 1_000_000,
      limit: 7_500_000,
      percent: 13.3,
      resetAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
    },
  },
};

describe("usePlanUsage", () => {
  it("returns plan usage data and calls the right endpoint", async () => {
    mockApiFetch.mockResolvedValueOnce(mockPlanUsage);

    const { result } = renderHookWithQuery(() => usePlanUsage());

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.plan).toBe("max5x");
    expect(result.current.data?.usage.fiveHour.percent).toBe(25);
    expect(mockApiFetch).toHaveBeenCalledWith("/plan-usage", expect.anything());
  });

  it("surfaces error state when the API rejects", async () => {
    mockApiFetch.mockRejectedValueOnce(new Error("offline"));

    const { result } = renderHookWithQuery(() => usePlanUsage());

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
