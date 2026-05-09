import type { GenericMutationCtx } from "convex/server";
import type { DataModel } from "./_generated/dataModel";

export const SINGLETON_KEY = "singleton" as const;

type Ctx = GenericMutationCtx<DataModel>;

type SingletonTable = "oauthTokens" | "modelSettings" | "planUsageSnapshot";

/**
 * Patch the singleton row of a `by_key`-indexed table, inserting it on first
 * write. Replaces the same 6-line `existing ? patch : insert` pattern that
 * lived in three mutation files.
 *
 * Convex's generated types don't allow a generic over the table name to keep
 * full row-shape inference, so the row args are typed broadly here; each
 * caller passes already-validated mutation args, preserving safety at the
 * boundary.
 */
export async function singletonUpsert<T extends SingletonTable>(
  ctx: Ctx,
  table: T,
  args: Record<string, unknown>,
): Promise<void> {
  const existing = await (ctx.db
    .query(table)
    // biome-ignore lint/suspicious/noExplicitAny: typed against the union of singleton tables; the index/key combination is identical across all three.
    .withIndex("by_key", (q: any) => q.eq("key", SINGLETON_KEY))
    .unique() as Promise<{ _id: import("./_generated/dataModel").Id<T> } | null>);

  if (existing) {
    // biome-ignore lint/suspicious/noExplicitAny: the per-table row shape is checked by the caller's mutation validator.
    await ctx.db.patch(existing._id, args as any);
  } else {
    // biome-ignore lint/suspicious/noExplicitAny: the per-table row shape is checked by the caller's mutation validator.
    await ctx.db.insert(table, { key: SINGLETON_KEY, ...args } as any);
  }
}
