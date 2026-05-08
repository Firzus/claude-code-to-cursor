// Blended pricing heuristics (USD per 1M tokens) for dashboard estimates only —
// these are NOT billing truth. Anthropic's actual price tiers vary by model
// and volume; we only use them so the UI can show approximate spend / savings.

export const INPUT_USD_PER_M = 15;
export const OUTPUT_USD_PER_M = 75;
export const CACHE_READ_COST_RATIO = 0.1;
export const CACHE_CREATION_COST_RATIO = 1.25;
export const CACHE_READ_USD_PER_M = INPUT_USD_PER_M * CACHE_READ_COST_RATIO;
export const CACHE_CREATION_USD_PER_M = INPUT_USD_PER_M * CACHE_CREATION_COST_RATIO;

export function estimateRequestUsd(
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens: number,
  cacheCreationTokens: number,
): number {
  return (
    (inputTokens * INPUT_USD_PER_M +
      outputTokens * OUTPUT_USD_PER_M +
      cacheReadTokens * CACHE_READ_USD_PER_M +
      cacheCreationTokens * CACHE_CREATION_USD_PER_M) /
    1_000_000
  );
}
