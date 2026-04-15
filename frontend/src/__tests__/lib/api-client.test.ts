import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Simulate browser environment
vi.stubGlobal("window", {
  location: { protocol: "http:", hostname: "localhost" },
});

// Dynamic import to get fresh module per test
async function getApiFetch() {
  const mod = await import("../../lib/api-client");
  return mod.apiFetch;
}

describe("apiFetch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends JSON content-type header", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: "test" }),
    });

    const apiFetch = await getApiFetch();
    await apiFetch("/health");

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/health"),
      expect.objectContaining({
        headers: expect.objectContaining({
          "Content-Type": "application/json",
        }),
      }),
    );
  });

  it("uses same-origin /api prefix (Vite proxy in dev)", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });

    const apiFetch = await getApiFetch();
    await apiFetch("/health");

    expect(mockFetch).toHaveBeenCalledWith("/api/health", expect.any(Object));
  });

  it("throws on non-ok response", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      json: () => Promise.resolve({ message: "Server error" }),
    });

    const apiFetch = await getApiFetch();
    await expect(apiFetch("/fail")).rejects.toThrow("Server error");
  });

  it("passes custom headers", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });

    const apiFetch = await getApiFetch();
    await apiFetch("/test", {
      headers: { "X-Custom": "value" },
    });

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "X-Custom": "value",
        }),
      }),
    );
  });
});
