export const CACHE_READ_COST_RATIO = 0.1;
export const CACHE_CREATION_COST_RATIO = 1.25;

export function calculateCacheSavings(
  inputTokens: number,
  cacheReadTokens: number,
  cacheCreationTokens: number,
) {
  const allInput = inputTokens + cacheReadTokens + cacheCreationTokens;
  const noCacheCost = allInput;
  const withCacheCost =
    inputTokens +
    cacheReadTokens * CACHE_READ_COST_RATIO +
    cacheCreationTokens * CACHE_CREATION_COST_RATIO;
  const savingsPercent =
    noCacheCost > 0 ? ((noCacheCost - withCacheCost) / noCacheCost) * 100 : 0;
  const tokensSaved = noCacheCost > 0 ? Math.round(noCacheCost - withCacheCost) : 0;

  return { allInput, noCacheCost, withCacheCost, savingsPercent, tokensSaved };
}
