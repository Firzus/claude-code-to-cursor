import type { GenericMutationCtx } from "convex/server";
import type { DataModel } from "./_generated/dataModel";

export const SINGLETON_KEY = "singleton" as const;

type Ctx = GenericMutationCtx<DataModel>;

/**
 * Single source of truth for singleton tables (`by_key` indexed, one row keyed
 * `"singleton"`). Each helper is concrete and fully typed against its table —
 * no generics, no `as any`. Adding a new singleton table = adding a new helper.
 */

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
