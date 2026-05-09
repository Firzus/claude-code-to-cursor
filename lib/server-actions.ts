"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import {
  postAnalyticsReset,
  postAuthCallback,
  postAuthLogin,
  postRateLimitReset,
  postSettings,
} from "./api";
import { type ModelSettings, modelSettingsSchema } from "./schemas";
import { getForwardedFor } from "./server/forwarded-for";

async function forwardedFor(): Promise<string | undefined> {
  return getForwardedFor(await headers());
}

export type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: string };

/* ------------------------------------------------------------------ */
/* Settings                                                            */
/* ------------------------------------------------------------------ */

export async function savePreferencesAction(raw: unknown): Promise<ActionResult<ModelSettings>> {
  const parsed = modelSettingsSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: "Invalid settings payload." };
  }
  try {
    const ip = await forwardedFor();
    const settings = await postSettings(parsed.data, ip);
    revalidatePath("/preferences");
    revalidatePath("/");
    return { ok: true, data: settings };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to save preferences." };
  }
}

/* ------------------------------------------------------------------ */
/* OAuth                                                               */
/* ------------------------------------------------------------------ */

export async function startOAuthAction(): Promise<
  ActionResult<{ authURL: string; state: string }>
> {
  try {
    const ip = await forwardedFor();
    const data = await postAuthLogin(ip);
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to start OAuth." };
  }
}

const callbackSchema = z.object({
  code: z.string().min(1, "Paste the code returned by Anthropic."),
  state: z.string().min(1),
});

export async function submitOAuthCodeAction(
  raw: unknown,
): Promise<ActionResult<{ message: string; expiresIn?: number }>> {
  const parsed = callbackSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid payload." };
  }
  try {
    const ip = await forwardedFor();
    const data = await postAuthCallback(parsed.data, ip);
    if (!data.success) {
      return { ok: false, error: data.message ?? "OAuth callback failed." };
    }
    revalidatePath("/", "layout");
    return {
      ok: true,
      data: { message: data.message ?? "Connected.", expiresIn: data.expiresIn },
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to exchange code." };
  }
}

/* ------------------------------------------------------------------ */
/* Reset actions                                                       */
/* ------------------------------------------------------------------ */

export async function resetAnalyticsAction(): Promise<ActionResult<number>> {
  try {
    const ip = await forwardedFor();
    const deletedCount = await postAnalyticsReset(ip);
    revalidatePath("/usage");
    revalidatePath("/");
    return { ok: true, data: deletedCount };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to reset analytics." };
  }
}

export async function resetRateLimitAction(): Promise<ActionResult> {
  try {
    const ip = await forwardedFor();
    await postRateLimitReset(ip);
    revalidatePath("/preferences");
    return { ok: true, data: undefined };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to reset rate limit." };
  }
}
