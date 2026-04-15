import { describe, expect, mock, test } from "bun:test";

const summary = {
  periodStart: 1_700_000_000_000,
  periodEnd: 1_700_000_086_400_000,
  inputTokens: 1000,
  outputTokens: 500,
  cacheReadTokens: 200,
  cacheCreationTokens: 50,
  thinkingTokens: 42,
  estimatedUsd: 1.23,
};

mock.module("../db", () => ({
  getBudgetDaySummary: () => summary,
}));

const { handleBudget } = await import("./budget");

describe("handleBudget", () => {
  test("returns JSON from getBudgetDaySummary", async () => {
    const res = handleBudget();
    expect(res.status).toBe(200);
    const body = (await res.json()) as typeof summary;
    expect(body).toEqual(summary);
  });
});
