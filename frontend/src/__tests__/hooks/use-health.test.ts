import { waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useHealth } from "~/hooks/use-health";
import { renderHookWithQuery } from "../test-utils";

const mockHealthResponse = {
  status: "ok" as const,
  tunnelUrl: "https://example.dev",
  claudeCode: {
    authenticated: true,
    expiresAt: Date.now() + 3600_000,
  },
  rateLimit: {
    isLimited: false,
    resetAt: null,
    minutesRemaining: null,
    inSoftExpiry: false,
    cachedAt: null,
  },
};

vi.mock("~/lib/api-client", () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from "~/lib/api-client";

const mockApiFetch = vi.mocked(apiFetch);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useHealth", () => {
  it("returns health data on success", async () => {
    mockApiFetch.mockResolvedValueOnce(mockHealthResponse);

    const { result } = renderHookWithQuery(() => useHealth());

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mockHealthResponse);
  });

  it("returns error state on failure", async () => {
    mockApiFetch.mockRejectedValueOnce(new Error("Network error"));

    const { result } = renderHookWithQuery(() => useHealth());

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe("Network error");
  });

  it("reports loading state initially", () => {
    mockApiFetch.mockReturnValue(new Promise(() => {}));

    const { result } = renderHookWithQuery(() => useHealth());

    expect(result.current.isLoading).toBe(true);
    expect(result.current.data).toBeUndefined();
  });
});
