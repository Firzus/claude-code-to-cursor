import type { ZodType } from "zod";

function getApiBase(): string {
  return "/api";
}

declare global {
  interface Window {
    __CCTC_API_PORT__?: number;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyZodType<T> = ZodType<T, any, any>;

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T>;
export async function apiFetch<T>(
  path: string,
  schema: AnyZodType<T>,
  init?: RequestInit,
): Promise<T>;
export async function apiFetch<T>(
  path: string,
  schemaOrInit?: AnyZodType<T> | RequestInit,
  init?: RequestInit,
): Promise<T> {
  const isSchema =
    schemaOrInit != null &&
    typeof schemaOrInit === "object" &&
    "parse" in schemaOrInit &&
    typeof (schemaOrInit as AnyZodType<T>).parse === "function";

  const schema = isSchema ? (schemaOrInit as AnyZodType<T>) : undefined;
  const fetchInit = isSchema ? init : (schemaOrInit as RequestInit | undefined);

  const url = `${getApiBase()}${path}`;
  const res = await fetch(url, {
    ...fetchInit,
    headers: {
      "Content-Type": "application/json",
      ...fetchInit?.headers,
    },
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error((error as { message?: string }).message || `API error: ${res.status}`);
  }

  const data = await res.json();
  return schema ? schema.parse(data) : (data as T);
}
