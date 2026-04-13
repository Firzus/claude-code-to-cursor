import { waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSettings, useUpdateSettings } from "~/hooks/use-settings";
import { renderHookWithQuery } from "../test-utils";

vi.mock("~/lib/api-client", () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from "~/lib/api-client";

const mockApiFetch = vi.mocked(apiFetch);

beforeEach(() => {
  vi.clearAllMocks();
});

const mockSettings = {
  settings: {
    selectedModel: "claude-opus-4-6" as const,
    thinkingEnabled: true,
    thinkingEffort: "high" as const,
  },
};

describe("useSettings", () => {
  it("returns settings data", async () => {
    mockApiFetch.mockResolvedValueOnce(mockSettings);

    const { result } = renderHookWithQuery(() => useSettings());

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.settings.selectedModel).toBe("claude-opus-4-6");
    expect(result.current.data?.settings.thinkingEnabled).toBe(true);
  });

  it("handles error", async () => {
    mockApiFetch.mockRejectedValueOnce(new Error("fail"));

    const { result } = renderHookWithQuery(() => useSettings());

    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe("useUpdateSettings", () => {
  it("calls apiFetch with POST and invalidates cache on success", async () => {
    mockApiFetch
      .mockResolvedValueOnce(mockSettings)
      .mockResolvedValueOnce({ success: true, settings: mockSettings.settings })
      .mockResolvedValueOnce(mockSettings);

    const { result, queryClient } = renderHookWithQuery(() => useUpdateSettings());

    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    result.current.mutate({
      selectedModel: "claude-sonnet-4-6",
      thinkingEnabled: false,
      thinkingEffort: "low",
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateSpy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: ["settings"] }));
  });
});
