/**
 * Shared timing constants for client-side polling and UI feedback. Keeping
 * the magic numbers in one place avoids drift between hooks and components.
 */

/** Polling interval for endpoints that change quickly (health, plan-usage). */
export const POLL_FAST = 30_000;

/** Polling interval for endpoints that change slowly (analytics summaries). */
export const POLL_SLOW = 60_000;

/** How long the "copied" indicator stays visible after a clipboard write. */
export const COPY_FEEDBACK_MS = 1_400;
