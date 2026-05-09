import type { GenericMutationCtx } from "convex/server";
import type { DataModel } from "./_generated/dataModel";

export const SINGLETON_KEY = "singleton" as const;

type Ctx = GenericMutationCtx<DataModel>;

// Upsert helpers for singleton tables (`by_key` indexed, one row keyed
// `"singleton"`). One helper per table keeps the types concrete; add a new
// helper when introducing a new singleton.

export async function upsertOauthTokens(
  ctx: Ctx,
  args: {
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    scopes: string[];
    obtainedAt: number;
  },
): Promise<void> {
  const existing = await ctx.db
    .query("oauthTokens")
    .withIndex("by_key", (q) => q.eq("key", SINGLETON_KEY))
    .unique();
  if (existing) await ctx.db.patch(existing._id, args);
  else await ctx.db.insert("oauthTokens", { key: SINGLETON_KEY, ...args });
}

export async function upsertModelSettings(
  ctx: Ctx,
  args: {
    selectedModel: string;
    thinkingEnabled: boolean;
    thinkingEffort: "low" | "medium" | "high" | "xhigh" | "max";
    subscriptionPlan: "pro" | "max5x" | "max20x";
  },
): Promise<void> {
  const existing = await ctx.db
    .query("modelSettings")
    .withIndex("by_key", (q) => q.eq("key", SINGLETON_KEY))
    .unique();
  if (existing) await ctx.db.patch(existing._id, args);
  else await ctx.db.insert("modelSettings", { key: SINGLETON_KEY, ...args });
}

export async function upsertPlanUsageSnapshot(
  ctx: Ctx,
  args: {
    capturedAt: number;
    overallStatus: string | null;
    representativeClaim?: "five_hour" | "seven_day" | null;
    fiveHour: { utilization: number; resetAt: number; status: string } | null;
    weekly: { utilization: number; resetAt: number; status: string } | null;
    fallbackPercentage: number | null;
    overageStatus: string | null;
  },
): Promise<void> {
  const existing = await ctx.db
    .query("planUsageSnapshot")
    .withIndex("by_key", (q) => q.eq("key", SINGLETON_KEY))
    .unique();
  if (existing) await ctx.db.patch(existing._id, args);
  else await ctx.db.insert("planUsageSnapshot", { key: SINGLETON_KEY, ...args });
}

// Adjust a named counter atomically. Negative deltas decrement; the counter
// is clamped at zero so a -N bump on a fresh counter lands at 0, not below.
export async function bumpCounter(ctx: Ctx, key: string, delta: number): Promise<void> {
  const existing = await ctx.db
    .query("counters")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
  if (existing) await ctx.db.patch(existing._id, { count: Math.max(0, existing.count + delta) });
  else await ctx.db.insert("counters", { key, count: Math.max(0, delta) });
}

/** Set a counter to a specific value (used by reset / backfill). */
export async function setCounter(ctx: Ctx, key: string, count: number): Promise<void> {
  const existing = await ctx.db
    .query("counters")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
  if (existing) await ctx.db.patch(existing._id, { count });
  else await ctx.db.insert("counters", { key, count });
}
