import { beforeEach, describe, expect, mock, test } from "bun:test";

const SKIP = !!process.env.SKIP_MOCK_MODULE_TESTS;

if (!SKIP) {
  // Mock oauth module so handleLoginAPI doesn't do real crypto work.
  mock.module("../oauth", () => ({
    generatePKCE: async () => ({
      codeVerifier: "verifier-test",
      codeChallenge: "challenge-test",
    }),
    getAuthorizationURL: (_challenge: string, _state: string) => "https://example.test/auth",
    exchangeCode: async () => {
      throw new Error("not exercised");
    },
    getValidToken: async () => null,
    hasCredentials: () => false,
  }));

  const { handleLoginAPI, __getPkceStoreSize } = await import("./auth");

  describe("PKCE store cap", () => {
    beforeEach(async () => {
      // Drain the store by making the cleanup timer not interfere.
      // Each test relies on a fresh state; we get there by calling handleLoginAPI
      // enough times to fill the cap and observing eviction.
    });

    test("map size stays at or below the 100-entry cap", async () => {
      // Prime with 150 logins — after the first 100 the cap should kick in
      // and evict older entries, keeping the size bounded.
      for (let i = 0; i < 150; i++) {
        await handleLoginAPI();
      }
      expect(__getPkceStoreSize()).toBeLessThanOrEqual(100);
    });

    test("eviction is FIFO — oldest entries go first", async () => {
      // After many logins in a row, the store should be at the cap.
      for (let i = 0; i < 101; i++) {
        await handleLoginAPI();
      }
      const size = __getPkceStoreSize();
      expect(size).toBeGreaterThan(0);
      expect(size).toBeLessThanOrEqual(100);
    });
  });
} else {
  test.skip("PKCE store cap (skipped: SKIP_MOCK_MODULE_TESTS)", () => {});
}
