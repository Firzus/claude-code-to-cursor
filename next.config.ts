import path from "node:path";
import type { NextConfig } from "next";

const config: NextConfig = {
  // Required by the production Dockerfile (it copies `.next/standalone`).
  // Harmless when running on the host (`pnpm dev` / `pnpm build && next start`).
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
  turbopack: {
    root: path.resolve(import.meta.dirname),
  },
  outputFileTracingRoot: path.resolve(import.meta.dirname),
  // Enable Cache Components (PPR successor). With this on, pages that don't
  // use dynamic APIs are pre-rendered by default; pages that read cookies/
  // headers stay dynamic automatically. `dynamic = "force-dynamic"` exports
  // are forbidden under cacheComponents (Next throws at compile time), so
  // we rely on Next's automatic detection plus per-function `'use cache'`
  // opt-ins (see lib/server/routes/models.ts).
  cacheComponents: true,
  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "recharts",
      "radix-ui",
      "@hookform/resolvers",
      "sonner",
    ],
  },
  // Backwards-compat with the legacy Bun-proxy URL shape: the Cursor BYOK
  // config (and any existing OpenAI/Anthropic SDK clients pointing at this
  // host) sends to `/v1/...`, while Next.js puts our handlers under
  // `/api/v1/...`. Rewrite is internal — the client URL doesn't change.
  rewrites: async () => [
    { source: "/v1/:path*", destination: "/api/v1/:path*" },
  ],
  // Indexation prevention layer #2 (the `noindex` meta tag in `app/layout.tsx`
  // is layer #1, `app/robots.ts` is layer #3). The HTTP header is the only
  // signal that covers non-HTML resources (RSC payloads, JSON, static assets)
  // and is honored by bots that may ignore robots.txt or skip HTML parsing.
  headers: async () => [
    {
      source: "/:path*",
      headers: [
        {
          key: "X-Robots-Tag",
          value: "noindex, nofollow, noarchive, nosnippet",
        },
      ],
    },
  ],
};

export default config;
