import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

// SECURITY: see comment in oauthTokens.ts. Same trust boundary applies —
// PKCE state is short-lived (minutes) but still sensitive (could enable
// auth-code interception during the OAuth handshake).

export const create = mutation({
  args: {
    state: v.string(),
    codeVerifier: v.string(),
  },
  handler: async (ctx, { state, codeVerifier }) => {
    await ctx.db.insert("pkceState", {
      state,
      codeVerifier,
      createdAt: Date.now(),
    });
  },
});

export const consume = mutation({
  args: { state: v.string() },
  handler: async (ctx, { state }) => {
    const row = await ctx.db
      .query("pkceState")
      .withIndex("by_state", (q) => q.eq("state", state))
      .unique();

    if (!row) return null;

    await ctx.db.delete(row._id);
    return { codeVerifier: row.codeVerifier, createdAt: row.createdAt };
  },
});

export const cleanupExpired = mutation({
  args: { olderThanMs: v.number() },
  handler: async (ctx, { olderThanMs }) => {
    const cutoff = Date.now() - olderThanMs;
    const stale = await ctx.db.query("pkceState").collect();
    let deleted = 0;
    for (const row of stale) {
      if (row.createdAt < cutoff) {
        await ctx.db.delete(row._id);
        deleted++;
      }
    }
    return { deleted };
  },
});

export const peek = query({
  args: { state: v.string() },
  handler: async (ctx, { state }) => {
    const row = await ctx.db
      .query("pkceState")
      .withIndex("by_state", (q) => q.eq("state", state))
      .unique();

    return row ? { exists: true, createdAt: row.createdAt } : { exists: false };
  },
});
