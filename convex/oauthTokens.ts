import { v } from "convex/values";
import { SINGLETON_KEY, singletonUpsert } from "./_helpers";
import { mutation, query } from "./_generated/server";

// SECURITY: these functions hold OAuth access/refresh tokens. They are
// declared as public `mutation`/`query` only because the self-hosted Convex
// HTTP client doesn't expose `setAdminAuth` and we need a way to call them
// from Next.js server-only modules. The trust boundary is the docker
// network: port 3210 MUST stay bound to 127.0.0.1 (see docker-compose.yml).
// If you ever expose Convex publicly, switch back to `mutation`/
// `query` and add a Convex Auth provider with an admin claim.

export const get = query({
  args: {},
  handler: async (ctx) => {
    const row = await ctx.db
      .query("oauthTokens")
      .withIndex("by_key", (q) => q.eq("key", SINGLETON_KEY))
      .unique();

    if (!row) return null;

    return {
      accessToken: row.accessToken,
      refreshToken: row.refreshToken,
      expiresAt: row.expiresAt,
      scopes: row.scopes,
      obtainedAt: row.obtainedAt,
    };
  },
});

export const save = mutation({
  args: {
    accessToken: v.string(),
    refreshToken: v.string(),
    expiresAt: v.number(),
    scopes: v.array(v.string()),
    obtainedAt: v.number(),
  },
  handler: async (ctx, args) => {
    await singletonUpsert(ctx, "oauthTokens", args);
  },
});

export const clear = mutation({
  args: {},
  handler: async (ctx) => {
    const existing = await ctx.db
      .query("oauthTokens")
      .withIndex("by_key", (q) => q.eq("key", SINGLETON_KEY))
      .unique();

    if (existing) await ctx.db.delete(existing._id);
  },
});

// Public-but-redacted variant for the auth-status endpoint: returns only
// presence + expiry, never the tokens themselves.
export const getStatus = query({
  args: {},
  handler: async (ctx) => {
    const row = await ctx.db
      .query("oauthTokens")
      .withIndex("by_key", (q) => q.eq("key", SINGLETON_KEY))
      .unique();

    if (!row) return { authenticated: false, expiresAt: null as number | null };
    return { authenticated: true, expiresAt: row.expiresAt };
  },
});
