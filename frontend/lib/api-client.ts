import type { ZodType } from "zod";

export class ClientApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "ClientApiError";
    this.status = status;
  }
}

/**
 * SWR-friendly fetcher. Calls the Next.js BFF route at /api/proxy/*,
 * which forwards to the Bun backend with the server-side x-settings-key.
 */
export async function apiFetch<T>(path: string, schema: ZodType<T>): Promise<T> {
  const url = path.startsWith("/api/") ? `/api/proxy${path.slice(4)}` : path;
  const res = await fetch(url, { credentials: "same-origin", cache: "no-store" });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      if (body?.error?.message) message = body.error.message;
    } catch {
      /* ignore */
    }
    throw new ClientApiError(res.status, message);
  }
  const data = (await res.json()) as unknown;
  return schema.parse(data);
}

export function makeFetcher<T>(schema: ZodType<T>) {
  return (path: string) => apiFetch(path, schema);
}
