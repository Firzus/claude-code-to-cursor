/**
 * Tracks last successful user proxy activity for cache keepalive gating.
 * Lives in its own module to avoid circular imports between anthropic-client
 * and cache-keepalive.
 */

let lastSuccessfulProxyActivityAt = 0;

export function markSuccessfulProxyActivity(): void {
  lastSuccessfulProxyActivityAt = Date.now();
}

export function getLastSuccessfulProxyActivityAt(): number {
  return lastSuccessfulProxyActivityAt;
}

/** True if a real proxy request completed within the given window. */
export function hasRecentProxyActivity(windowMs: number): boolean {
  if (lastSuccessfulProxyActivityAt === 0) return false;
  return Date.now() - lastSuccessfulProxyActivityAt <= windowMs;
}
