import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const SINGLETON_KEY = "singleton" as const;

const DEFAULT_SETTINGS = {
  selectedModel: "claude-opus-4-7",
  thinkingEnabled: true,
  thinkingEffort: "high" as const,
  subscriptionPlan: "max5x" as const,
};

export const get = query({
  args: {},
  handler: async (ctx) => {
    const row = await ctx.db
      .query("modelSettings")
      .withIndex("by_key", (q) => q.eq("key", SINGLETON_KEY))
      .unique();

    if (!row) return DEFAULT_SETTINGS;

    return {
      selectedModel: row.selectedModel,
      thinkingEnabled: row.thinkingEnabled,
      thinkingEffort: row.thinkingEffort,
      subscriptionPlan: row.subscriptionPlan,
    };
  },
});

export const save = mutation({
  args: {
    selectedModel: v.string(),
    thinkingEnabled: v.boolean(),
    thinkingEffort: v.union(
      v.literal("low"),
      v.literal("medium"),
      v.literal("high"),
      v.literal("xhigh"),
      v.literal("max"),
    ),
    subscriptionPlan: v.union(
      v.literal("pro"),
      v.literal("max5x"),
      v.literal("max20x"),
    ),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("modelSettings")
      .withIndex("by_key", (q) => q.eq("key", SINGLETON_KEY))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, args);
    } else {
      await ctx.db.insert("modelSettings", { key: SINGLETON_KEY, ...args });
    }
  },
});
