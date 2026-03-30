export const queryKeys = {
  health: ["health"] as const,
  settings: ["settings"] as const,
  analytics: (period: string) => ["analytics", period] as const,
  analyticsRequests: (limit: number) => ["analytics", "requests", limit] as const,
  login: ["login"] as const,
  authStatus: ["auth", "status"] as const,
};
