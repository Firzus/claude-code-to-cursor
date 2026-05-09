import { v } from "convex/values";
import { SINGLETON_KEY, upsertPlanUsageSnapshot } from "./helpers";
import { mutation, query } from "./_generated/server";

const windowValidator = v.union(
  v.object({
    utilization: v.number(),
    resetAt: v.number(),
    status: v.string(),
  }),
  v.null(),
);

export const save = mutation({
  args: {
    capturedAt: v.number(),
    overallStatus: v.union(v.string(), v.null()),
    representativeClaim: v.optional(
      v.union(v.literal("five_hour"), v.literal("seven_day"), v.null()),
    ),
    fiveHour: windowValidator,
    weekly: windowValidator,
    fallbackPercentage: v.union(v.number(), v.null()),
    overageStatus: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    await upsertPlanUsageSnapshot(ctx, args);
  },
});

export const getLatest = query({
  args: {},
  handler: async (ctx) => {
    const row = await ctx.db
      .query("planUsageSnapshot")
      .withIndex("by_key", (q) => q.eq("key", SINGLETON_KEY))
      .unique();

    if (!row) return null;

    // Strip Convex-internal fields the route handler doesn't need.
    const { _id: _id, _creationTime: _ct, key: _k, ...rest } = row;
    return rest;
  },
});
