import { v } from "convex/values";
import { SINGLETON_KEY, upsertModelSettings } from "./helpers";
import { mutation, query } from "./_generated/server";

// Cold-start defaults returned when no `modelSettings` row exists yet.
// MUST mirror `DEFAULT_MODEL_SETTINGS` in lib/server/model-settings.ts so
// fresh installs and legacy-payload fallbacks land on the same plan tier.
const DEFAULT_SETTINGS = {
  selectedModel: "claude-opus-4-7",
  thinkingEnabled: true,
  thinkingEffort: "high" as const,
  subscriptionPlan: "max20x" as const,
};

export const get = query({
  args: {},
  handler: async (ctx) => {
    const row = await ctx.db
      .query("modelSettings")
      .withIndex("by_key", (q) => q.eq("key", SINGLETON_KEY))
      .unique();

    if (!row) return DEFAULT_SETTINGS;

    // Soft migration: claude-opus-4-6 was retired in favor of 4-7. Old rows
    // are remapped at read time so we don't have to backfill the table.
    const selectedModel =
      row.selectedModel === "claude-opus-4-6" ? "claude-opus-4-7" : row.selectedModel;

    return {
      selectedModel,
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
    await upsertModelSettings(ctx, args);
  },
});
