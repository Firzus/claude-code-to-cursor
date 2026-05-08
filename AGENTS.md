# AGENTS.md

## Overview & Scope

`claude-code-to-cursor` (cctc): a Next.js 16 full-stack app that exposes
Anthropic `/v1/messages` and OpenAI `/v1/chat/completions` endpoints (Cursor
BYOK target) backed by a Claude Code OAuth session, plus a dashboard for
analytics, auth, settings, and plan-usage. Persistence is **self-hosted Convex**.
Production ingress runs through a Cloudflare tunnel.

This file applies to the entire repo. No nested `AGENTS.md` exist; if you
add one, the closest `AGENTS.md` to the edited file wins.

## Architecture

```
docker-compose stack (4 services on `internal` network):

  app                     Next.js 16 full-stack (port 3111, repo root)
    ├── app/              UI pages + Route Handlers (App Router)
    │   └── api/          /api/v1/* (Cursor) + /api/* (dashboard)
    ├── components/       UI (radix + shadcn)
    ├── lib/server/       Server-only modules (proxy logic, OAuth, Convex client)
    ├── lib/              Shared (env, schemas, formatters)
    └── convex/           Schema + queries/mutations

  convex                  Self-hosted Convex backend (port 3210, 3211)
                          Volume: cctc-convex-data
  convex-dashboard        Convex admin UI (port 6791)
  cloudflared             Public ingress → app:3111
```

There is no separate Bun proxy anymore. The previous SQLite analytics, OAuth
file (`/data/auth/auth.json`), and plan-usage snapshot all live in Convex.

## Agent Role

Senior TypeScript engineer comfortable with Next.js 16 (App Router, RSC,
Route Handlers), self-hosted Convex, and Cloudflare tunnels. Allowed: edit
`frontend/**` (= the whole app now), `convex/**`, configs, docker-compose.
Not allowed: rewrite the OAuth/PKCE flow, change the Convex schema without
migration plan, alter the Cloudflare tunnel topology, or add dependencies
without explicit user approval. Never log or commit OAuth tokens or `.env`.

## Build, Test & Validation Commands

The app lives at the repo root (standard Next.js 16 layout). Convex
schema/functions live in `convex/`.

```bash
pnpm install --frozen-lockfile
pnpm run typecheck       # tsc --noEmit
pnpm run lint            # biome check .
pnpm run dev             # next dev -p 3111
pnpm run build           # next build (standalone output for docker)

# Convex (against the self-hosted instance — needs cctc-convex container up)
pnpm run convex:deploy   # push schema + functions, regenerate types
pnpm run convex:dev      # watch mode for development
```

Docker (full stack: app + convex + convex-dashboard + cloudflared):

```bash
docker compose build
docker compose up -d
docker compose logs -f
docker compose down
```

Bootstrapping a fresh deployment:

```bash
# 1. Generate the Convex instance secret (32-byte hex), put in .env as
#    CONVEX_INSTANCE_SECRET=<hex>
openssl rand -hex 32

# 2. Bring up Convex first
docker compose up -d convex convex-dashboard

# 3. Generate an admin key for the CLI / Next.js server
docker compose exec convex ./generate_admin_key.sh
# Paste it into .env and frontend/.env.local as
# CONVEX_SELF_HOSTED_ADMIN_KEY=<key>
# CONVEX_SELF_HOSTED_URL=http://127.0.0.1:3210

# 4. Push schema and functions
pnpm run convex:deploy

# 5. Bring up the rest
docker compose up -d
```

## Conventions & Patterns

- Runtime: **Node 22 + pnpm 10** everywhere (the Bun backend is gone).
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
- Formatting: Biome, 2-space indent, line width 100. Run `pnpm run lint:fix`
  before committing.
- Search: exclude `node_modules/`, `.next/`, `components/ui/`,
  `convex/_generated/`, `*.log` when grepping.

## Convex specifics

- Schema lives in `frontend/convex/schema.ts` (5 tables: `requests`,
  `modelSettings`, `planUsageSnapshot`, `oauthTokens`, `pkceState`).
- All functions are declared as public `mutation`/`query` (not `internal*`).
  The trust boundary is the docker network — Convex port 3210 MUST stay
  bound to 127.0.0.1. If you ever expose it publicly, switch the OAuth and
  PKCE functions to `internalMutation`/`internalQuery` and add a Convex
  Auth provider.
- Server-side calls go through `lib/server/convex.ts` (a `ConvexHttpClient`
  pointed at `CONVEX_SELF_HOSTED_URL`).
- Browser-side hooks (`useQuery`, `useMutation`) read `NEXT_PUBLIC_CONVEX_URL`
  via `components/providers.tsx`. In docker that needs to be the host
  loopback (`http://127.0.0.1:3210`), not the docker DNS name.

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

- Off-limits: `.env`, OAuth tokens (now in Convex `oauthTokens` table),
  `components/ui/**` (vendored shadcn), `pnpm-lock.yaml`, `node_modules/`,
  `.next/`, `convex/_generated/`.
- Safe to automate: handler refactors, new routes, frontend components/pages,
  Biome fixes, type tightening, Convex schema additions (with migration).
- Never run during agent work: `docker compose up` (interactive), long-running
  `next dev` (start in background only when explicitly requested, and clean
  up before ending the session), destructive Convex mutations on prod data,
  `git push --force`.
- Cloudflared tunnel is mandatory in production; do not remove or rewire it.

## Git & PR Rules

- Branch off `main`; feature branches `feat/<scope>`, fixes `fix/<scope>`.
- Commits: short imperative subject in English. Documentation and code
  comments stay in English; chat/UI copy is FR/EN per context.
- PRs describe behavior change, env-var additions, and any Convex schema
  impact (run `npx convex dev --once` and check the deployment summary).
  Don't push to remote unless explicitly asked.
