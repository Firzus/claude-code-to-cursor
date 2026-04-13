import { describe, expect, it } from "vitest";
import {
  CACHE_CREATION_COST_RATIO,
  CACHE_READ_COST_RATIO,
  calculateCacheSavings,
} from "~/lib/pricing";

describe("calculateCacheSavings", () => {
  it("calculates savings with all token types present", () => {
    const result = calculateCacheSavings(1000, 5000, 2000);

    expect(result.allInput).toBe(8000);
    expect(result.noCacheCost).toBe(8000);
    expect(result.withCacheCost).toBe(
      1000 + 5000 * CACHE_READ_COST_RATIO + 2000 * CACHE_CREATION_COST_RATIO,
    );
    expect(result.savingsPercent).toBeGreaterThan(0);
    expect(result.tokensSaved).toBeGreaterThan(0);
  });

  it("returns zero savings when all tokens are zero", () => {
    const result = calculateCacheSavings(0, 0, 0);

    expect(result.allInput).toBe(0);
    expect(result.noCacheCost).toBe(0);
    expect(result.withCacheCost).toBe(0);
    expect(result.savingsPercent).toBe(0);
    expect(result.tokensSaved).toBe(0);
  });

  it("calculates correctly with only input tokens (no caching)", () => {
    const result = calculateCacheSavings(1000, 0, 0);

    expect(result.allInput).toBe(1000);
    expect(result.withCacheCost).toBe(1000);
    expect(result.savingsPercent).toBe(0);
    expect(result.tokensSaved).toBe(0);
  });

  it("calculates correctly with only cache read tokens", () => {
    const result = calculateCacheSavings(0, 1000, 0);

    expect(result.allInput).toBe(1000);
    expect(result.withCacheCost).toBe(1000 * CACHE_READ_COST_RATIO);
    expect(result.savingsPercent).toBe(90);
  });

  it("shows negative savings when cache creation cost exceeds savings", () => {
    const result = calculateCacheSavings(0, 0, 1000);

    expect(result.withCacheCost).toBe(1000 * CACHE_CREATION_COST_RATIO);
    expect(result.savingsPercent).toBeLessThan(0);
  });

  it("returns integer for tokensSaved", () => {
    const result = calculateCacheSavings(333, 777, 111);
    expect(Number.isInteger(result.tokensSaved)).toBe(true);
  });
});
