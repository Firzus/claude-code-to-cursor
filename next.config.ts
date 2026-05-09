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
};

export default config;
