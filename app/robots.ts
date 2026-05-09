import type { MetadataRoute } from "next";

// Single-user dashboard — disallow every crawler. Reinforced by the
// `X-Robots-Tag` header in `next.config.ts` and the `robots` metadata in
// `app/layout.tsx`.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", disallow: "/" }],
  };
}
