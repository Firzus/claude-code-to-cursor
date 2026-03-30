function getApiBase(): string {
  if (typeof window !== "undefined") {
    // Browser: call backend directly on same hostname, port 8082
    // Works because backend has CORS * headers
    return `${window.location.protocol}//${window.location.hostname}:${window.__CCPROXY_API_PORT__ || 8082}/api`;
  }
  // SSR: use Docker internal hostname
  return `${process.env.API_URL || "http://api:8082"}/api`;
}

declare global {
  interface Window {
    __CCPROXY_API_PORT__?: number;
  }
}

export async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const url = `${getApiBase()}${path}`;
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(
      (error as { message?: string }).message || `API error: ${res.status}`,
    );
  }

  return res.json() as Promise<T>;
}
