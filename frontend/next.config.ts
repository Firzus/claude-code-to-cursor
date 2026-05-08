import path from "node:path";
import type { NextConfig } from "next";

const config: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
  // Lock turbopack/Next root to this folder. The repo also contains a Bun
  // backend at <repo>/src/, which Next.js 16 would otherwise pick up as
  // candidate middleware/source.
  turbopack: {
    root: path.resolve(import.meta.dirname),
  },
  outputFileTracingRoot: path.resolve(import.meta.dirname),
  experimental: {
    optimizePackageImports: ["lucide-react", "recharts", "radix-ui"],
  },
};

export default config;
