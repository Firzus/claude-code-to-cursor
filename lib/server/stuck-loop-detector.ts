import { logger } from "./logger";

const CONSECUTIVE_THRESHOLD = 3;

interface LoopState {
  consecutiveMaxOutput: number;
  lastOutputTokens: number;
}

const stateByHash = new Map<string, LoopState>();

/**
 * Track output tokens per conversation (identified by tool_defs_hash).
 * When a conversation produces the same high output count on consecutive
 * requests, it likely indicates the model is stuck in a loop.
 */
export function checkForStuckLoop(args: {
  toolDefsHash: string | null;
  outputTokens: number;
  messageCount: number | null;
}): void {
  const { toolDefsHash, outputTokens, messageCount } = args;
  if (!toolDefsHash || outputTokens < 2048) return;

  let state = stateByHash.get(toolDefsHash);
  if (!state) {
    state = { consecutiveMaxOutput: 0, lastOutputTokens: 0 };
    stateByHash.set(toolDefsHash, state);
  }

  if (outputTokens === state.lastOutputTokens && outputTokens >= 4000) {
    state.consecutiveMaxOutput++;
  } else {
    state.consecutiveMaxOutput = 1;
  }
  state.lastOutputTokens = outputTokens;

  if (state.consecutiveMaxOutput >= CONSECUTIVE_THRESHOLD) {
    logger.info(
      `[StuckLoopDetector] Potential stuck loop: ${state.consecutiveMaxOutput} consecutive requests ` +
        `with output=${outputTokens} tokens (msgs=${messageCount ?? "?"}, hash=${toolDefsHash.slice(0, 8)})`,
    );
  }

  if (stateByHash.size > 50) {
    const oldest = stateByHash.keys().next().value;
    if (oldest) stateByHash.delete(oldest);
  }
}

export function resetStuckLoopState(): void {
  stateByHash.clear();
}
