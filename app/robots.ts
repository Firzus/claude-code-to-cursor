import type { MetadataRoute } from "next";

/**
 * Disallow every crawler. `cctc` is a single-user personal tool; the dashboard
 * is reachable via a Cloudflare tunnel but is not meant to appear in any
 * search index. Combined with the global `X-Robots-Tag` header set in
 * `next.config.ts` and the `noindex, nofollow` meta tag in `app/layout.tsx`,
 * this gives three independent layers of indexation prevention.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", disallow: "/" }],
  };
}
