# AGENTS.md

## Overview & Scope

`claude-code-to-cursor` (cctc): a Next.js 16 full-stack app that exposes
Anthropic `/v1/messages` and OpenAI `/v1/chat/completions` endpoints (Cursor
BYOK target) backed by a Claude Code OAuth session, plus a dashboard for
analytics, auth, settings, and plan-usage. Persistence is **self-hosted Convex**.
Public ingress runs through a Cloudflare tunnel.

This is a single-user personal tool. There is no separate "production"
deployment — the user's laptop IS the host, the tunnel goes down whenever
the laptop sleeps, there is no SaaS and no other consumers.

This file applies to the entire repo. No nested `AGENTS.md` exist.

## Architecture

```
docker-compose stack (3 services on `internal` network):

  convex                  Self-hosted Convex backend (port 3210, 3211)
                          Volume: cctc-convex-data
  convex-dashboard        Convex admin UI (port 6791)
  cloudflared             Public ingress → host.docker.internal:3111

Next.js app (host, NOT in docker):
  app/                    UI pages + Route Handlers (App Router)
    └── api/              /api/v1/* (Cursor) + /api/* (dashboard)
  components/             UI (radix + shadcn)
  lib/server/             Server-only modules (proxy logic, OAuth, Convex client)
  lib/                    Shared (env, schemas, formatters)
  convex/                 Schema + queries/mutations (deployed via the CLI)
```

Single mode: the Next.js app always runs on the host via `pnpm run dev`.
Both `http://localhost:3111` (local browser) and `cctc.lprieu.dev` (Cursor
over the tunnel) hit the same dev process. No production-image path, no
mode switching.

## Agent Role

Senior TypeScript engineer comfortable with Next.js 16 (App Router, RSC,
Route Handlers), self-hosted Convex, and Cloudflare tunnels. Allowed: edit
`app/**`, `components/**`, `convex/**`, `lib/**`, `hooks/**`, configs,
docker-compose. Not allowed: rewrite the OAuth/PKCE flow, change the Convex
schema without migration plan, alter the Cloudflare tunnel topology, or add
dependencies without explicit user approval. Never log or commit OAuth
tokens or `.env`.

## Build, Test & Validation Commands

```bash
pnpm install --frozen-lockfile
pnpm run typecheck         # tsc --noEmit
pnpm run lint              # biome check .

# Dev mode (hot reload, foreground)
pnpm dev                   # docker compose up -d && next dev -p 3111

# Prod mode (containerized, detached, restart-on-crash)
pnpm start                 # docker compose --profile prod up -d --build
pnpm logs                  # docker compose --profile prod logs -f app
pnpm down                  # docker compose --profile prod down (kills both modes)

# Convex
pnpm run convex:deploy     # push schema + functions, regenerate types
npx convex dev             # watch mode (direct CLI; no script alias)

# Docker management beyond `pnpm dev` / `pnpm down`
docker compose logs -f
```

## First-time setup

```bash
# 1. Generate the Convex instance secret and put it in .env:
#      CONVEX_INSTANCE_SECRET=$(openssl rand -hex 32)
#    Set CLOUDFLARE_TUNNEL_TOKEN too.

# 2. Bring up Convex
docker compose up -d convex convex-dashboard

# 3. Generate the admin key and add to .env (and .env.local):
docker compose exec convex ./generate_admin_key.sh
# →  CONVEX_SELF_HOSTED_ADMIN_KEY=<paste>
#    CONVEX_SELF_HOSTED_URL=http://127.0.0.1:3210

# 4. Push schema + Convex functions
pnpm install
pnpm run convex:deploy

# 5. Bring up the tunnel and start the app
docker compose up -d cloudflared
pnpm run dev
```

### One-time Cloudflare config

Cloudflare Zero Trust → Networks → Tunnels → your tunnel → Public Hostnames →
edit `cctc.lprieu.dev`:

- **Service**: `http://host.docker.internal:3111`

Save. Never touched again — the tunnel forwards Cursor traffic from the
public hostname to the `pnpm run dev` server running on the host.

## Conventions & Patterns

- Runtime: **Node 22 + pnpm 10**.
- TypeScript: `strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`.
  Avoid `any`; avoid non-null assertions.
- Routing: each Next.js Route Handler in `app/api/**/route.ts` is a thin
  wrapper around a handler in `lib/server/routes/*.ts`. Apply
  `ipWhitelistGuard()` from `lib/server/guard.ts` at the top of every
  Cursor-facing or admin route.
- Imports: use the `~/*` alias for app-relative imports. Use `import type`
  for type-only imports.
- Frontend stack: Next.js App Router, React 19, Tailwind CSS v4, Radix UI,
  shadcn-style components in `components/ui/` (excluded from Biome — do not
  lint-fix or rewrite them), SWR for data, Convex hooks (`useQuery`) for
  real-time, Zod for schemas, Sonner for toasts, GSAP/`@gsap/react`.
- Logging: use `lib/server/logger.ts` (`logger.info|warn|error|verbose`).
  Never `console.*` in `lib/server/**` except in fatal handlers.
- Errors: proxy responses follow Anthropic's `{ type: "error", error: { type,
  message } }` shape (see `lib/server/types.ts`).
- Formatting: Biome, 2-space indent, line width 100. Run
  `pnpm exec biome check --write .` before committing.
- Search: exclude `node_modules/`, `.next/`, `components/ui/`,
  `convex/_generated/`, `*.log` when grepping.

## Convex specifics

- Schema lives in `convex/schema.ts` (5 tables: `requests`,
  `modelSettings`, `planUsageSnapshot`, `oauthTokens`, `pkceState`).
- All functions are declared as public `mutation`/`query` (not `internal*`).
  The trust boundary is the docker network — Convex port 3210 MUST stay
  bound to 127.0.0.1. If you ever expose it publicly, switch the OAuth and
  PKCE functions to `internalMutation`/`internalQuery` and add a Convex
  Auth provider.
- Server-side calls go through `lib/server/convex.ts` (a `ConvexHttpClient`
  pointed at `CONVEX_SELF_HOSTED_URL`, which equals `http://127.0.0.1:3210`).
- Browser-side hooks (`useQuery`, `useMutation`) read `NEXT_PUBLIC_CONVEX_URL`
  via `components/providers.tsx`. Same value as the server side.

## Dos and Don'ts

- Do: keep `lib/server/routes/*` handlers stateless; persist via Convex
  mutations/queries.
- Do: read config from `lib/server/config.ts` (env-driven); document new env
  vars in `.env.example`.
- Do: respect IP whitelisting — Cursor-facing routes (`/api/v1/*`) and admin
  routes (`/api/analytics/*`, `/api/auth/*`, `/api/settings/*`,
  `/api/rate-limit/*`) must call `ipWhitelistGuard()` first.
- Don't: bypass `getValidToken()` from `lib/server/oauth.ts`; never read
  tokens from Convex directly outside that module.
- Don't: introduce blocking I/O in route handlers — they share the Node
  event loop with in-flight SSE streams.
- Don't: edit `pnpm-lock.yaml` by hand.
- Don't: delete the `cctc-convex-data` volume — that's the source of truth
  for analytics, OAuth tokens, and snapshots.

## Safety & Guardrails

- Off-limits: `.env`, OAuth tokens (in Convex `oauthTokens` table),
  `components/ui/**` (vendored shadcn), `pnpm-lock.yaml`, `node_modules/`,
  `.next/`, `convex/_generated/`.
- Safe to automate: handler refactors, new routes, components/pages,
  Biome fixes, type tightening, Convex schema additions (with migration).
- Never run during agent work: long-running `next dev` (the user keeps it
  in their own foreground terminal — agents must not spawn a competing
  instance), destructive Convex mutations on prod data, `git push --force`.
- The Cloudflare tunnel is mandatory for Cursor BYOK; do not remove or
  rewire it.

## Git & PR Rules

- Branch off `main`; feature branches `feat/<scope>`, fixes `fix/<scope>`.
- Commits: short imperative subject in English. Documentation and code
  comments stay in English; chat/UI copy is FR/EN per context.
- PRs describe behavior change, env-var additions, and any Convex schema
  impact (run `pnpm run convex:deploy` and check the deployment summary).
  Don't push to remote unless explicitly asked.
