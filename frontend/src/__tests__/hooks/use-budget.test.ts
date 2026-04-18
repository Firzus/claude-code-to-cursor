import { waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useBudgetDay } from "~/hooks/use-budget";
import { renderHookWithQuery } from "../test-utils";

vi.mock("~/lib/api-client", () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from "~/lib/api-client";

const mockApiFetch = vi.mocked(apiFetch);

beforeEach(() => {
  vi.clearAllMocks();
});

const mockBudget = {
  periodStart: 1_700_000_000_000,
  periodEnd: 1_700_008_640_000,
  inputTokens: 200,
  outputTokens: 100,
  cacheReadTokens: 30,
  cacheCreationTokens: 10,
  estimatedUsd: 0.99,
};

describe("useBudgetDay", () => {
  it("returns budget data", async () => {
    mockApiFetch.mockResolvedValueOnce(mockBudget);

    const { result } = renderHookWithQuery(() => useBudgetDay());

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.estimatedUsd).toBe(0.99);
    expect(mockApiFetch).toHaveBeenCalledWith("/budget", expect.anything());
  });
});
