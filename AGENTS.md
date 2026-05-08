# AGENTS.md

## Overview & Scope

`claude-code-to-cursor` is an OAuth-authenticated proxy that routes API traffic through Claude Code's OAuth credentials, exposing OpenAI- and Anthropic-compatible endpoints to clients (Cursor, VS Code, etc.). Three services, orchestrated by Docker Compose: **API** (Bun, port 8082), **Frontend** (Next.js 16 standalone, port 3111), **Cloudflared** tunnel.

This file applies to the entire repo. There are no nested `AGENTS.md` — closest-wins precedence applies if any are added.

## Agent Role

Senior TypeScript engineer fluent in Bun, Next.js 16 (App Router, RSC, Server Actions), React 19, GSAP, Tailwind v4, shadcn/ui, SWR, and Anthropic/OpenAI APIs. Allowed: edit source under `src/`, `frontend/app/`, `frontend/components/`, `frontend/hooks/`, `frontend/lib/`, update configs, refactor. Not allowed: commit secrets, run installs/builds without explicit need, push or merge, edit shadcn-generated primitives in `frontend/components/ui/` (regenerate via CLI instead), edit `cctc.db` or files under `/data`, or rewrite migrations history in `src/db.ts`.

## Build & Validation Commands

Backend (repo root, Bun):

```bash
bun install
bun run dev                    # hot reload via bun --hot
bun run typecheck              # bunx tsc --noEmit
bun run lint                   # biome check . (covers backend + frontend)
bun run lint:fix               # biome check --write .
```

Frontend (`cd frontend`, pnpm):

```bash
pnpm install
pnpm run dev                   # next dev, port 3111
pnpm run typecheck             # tsc --noEmit
pnpm run build                 # next build (standalone output)
pnpm run start                 # next start (production)
pnpm run lint                  # biome check .
```

Docker:

```bash
docker compose up -d    fffffff                      # prod stack
docker compose -f docker-compose.dev.yml up   # dev stack with hot reload
docker compose build api frontend             # (unverified) used in CI
```

Pre-PR validation:

```bash
bun run typecheck && bun run lint
cd frontend && pnpm run typecheck && pnpm run build
```

## Conventions & Patterns

- **Backend**: TypeScript strict (`noUncheckedIndexedAccess`, `noImplicitOverride`, `verbatimModuleSyntax`). Zero runtime deps — only Bun built-ins (HTTP, SQLite, fetch, crypto). Entry: `index.ts`. Source: `src/`. Routes: `src/routes/<domain>.ts`, return `Response`. Shared types: `src/types.ts`. Logging: `logger.info/error/verbose` (file-based, auto-rotating).
- **Frontend**: Next.js 16 App Router with `output: 'standalone'`, React 19. UI: shadcn/ui (`new-york`, `--base radix`) + Tailwind v4 single-CSS theme (`frontend/app/globals.css`, "Studio Soft" tokens). Display font: Fraunces (`next/font/google`). Animations: GSAP + ScrollTrigger + SplitText via `useGSAP` islands (`frontend/lib/motion.ts`); always under `gsap.matchMedia` honoring `prefers-reduced-motion`. Data: RSC fetches via `frontend/lib/api.ts` (server-only, parses Zod v4 schemas in `frontend/lib/schemas.ts`); SWR polls via `frontend/app/api/proxy/[...path]/route.ts` BFF that adds `x-settings-key` server-side. Mutations: Server Actions in `frontend/lib/server-actions.ts`. Forms: React Hook Form + Zod. Path alias `~/` → `frontend/`.
- **Naming**: camelCase for vars/functions, PascalCase for types/components/React files, kebab-case for source filenames. Interfaces preferred over type aliases for object shapes.
- **Imports**: use `import type { ... }` for type-only.
- **Errors**: Anthropic-shaped JSON `{ type: "error", error: { type, message } }`.
- **Search**: ignore `node_modules/`, `frontend/.next/`, `frontend/components/ui/` (shadcn-generated).

## Cursor `/multitask` & Subagents

Cursor 3.2+ exposes `/multitask`, where the parent agent calls a `Task` (alias `Agent`) tool to dispatch async subagents. There is **no new endpoint** to support — subagent traffic flows over the same `/v1/chat/completions` route.

What CCTC does today:

- When Cursor declares `Task` / `Agent` in `tools[]`, the model's `tool_use` blocks for those names are forwarded as OpenAI `tool_calls` (`src/stream-handler.ts`). The parent run works normally.
- Each spawned subagent **should** hit the proxy as a separate chat completion. When it does, it's served via Claude Code OAuth like any other request.
- If the model emits `Task` / `Agent` without Cursor declaring it, `formatInternalToolContent` (`src/internal-tools.ts`) renders the dispatch as readable text so the assistant message stays coherent.
- Both paths log a `[Subagent] …` line (INFO when forwarded, WARN when downgraded to text) so you can confirm what Cursor sent.

Known Cursor-side limitation: in 3.2 the spawned subagents silently bypassed the custom OpenAI base URL and hit Cursor's own cloud (forum thread `159369`). 3.3 partially fixed this; if subagents don't show up in `api.log` after a `/multitask` run, the bypass is back and there is nothing the proxy can do until Cursor routes the calls through it.

## Dos and Don'ts

- Do: keep `src/db.ts` migrations append-only; never drop or rewrite existing rows.
- Do: validate every new API response with a Zod schema in `frontend/lib/schemas.ts`.
- Do: prefix MCP tool names with `mcp_` and sort alphabetically — required for stable cache keys (see `src/anthropic-client.ts`).
- Do: route all proxy bodies through `src/routing-policy.ts` (`pickRoute`) so thinking effort is normalized.
- Don't: add a runtime dep to the backend `package.json` — it must stay zero-dep.
- Don't: change the `User-Agent` (`claude-cli/2.1.97 (external, cli)`), the OAuth client ID, or the system-prompt prefix `"You are Claude Code, Anthropic's official CLI for Claude."` — OAuth breaks otherwise.
- Don't: commit `api.log`, `cctc.db`, `auth.json`, or any `.env` file.
- Don't: edit shadcn primitives in `frontend/components/ui/` directly — regenerate via `pnpm dlx shadcn@latest add <name> --overwrite`.

## Safety & Guardrails

- Off-limits: production secrets, `CLOUDFLARE_TUNNEL_TOKEN`, OAuth credentials in `CCTC_AUTH_DIR/auth.json`, the `cctc-data` Docker volume.
- Never run destructive shell ops (`rm -rf`, force pushes, `docker volume rm cctc-data`).
- Never bump dependency major versions without explicit approval; respect existing pins (Bun v1+, Node 22 for frontend, Next.js 16, Biome v2.4.x, React 19, Tailwind v4, recharts v3, Zod v4, GSAP v3.13+, shadcn `new-york` style, cloudflared `2025.4.0`).
- Never expose the API directly to the internet — all external traffic must go through cloudflared.
- IP whitelist (`ALLOWED_IPS` in `.env`) is enforced by `src/middleware.ts`. Setting it to `disabled` is for local dev only.
- Generated/vendored — do not edit: `frontend/components/ui/` (shadcn), `frontend/.next/`, `node_modules/`, lockfiles (`bun.lock`, `frontend/pnpm-lock.yaml`).

## Git & PR Rules

- Branching: feature branches off `main`; PRs into `main`.
- Commit message: imperative, English, scoped (e.g. `[backend] fix rate-limit cache eviction`, `[frontend] add plan-usage card`, `[docker] pin cloudflared version`).
- PR title format: `[backend|frontend|docker] Brief description`.
- PR body: short summary + bullet list of changes. Mention any migration in `src/db.ts`.
- CI (`.github/workflows/ci.yml`) runs three jobs and must be green: **backend** (`bun install --frozen-lockfile`, `bun run typecheck`, `bun run lint`), **frontend** (`pnpm install --frozen-lockfile`, `pnpm run typecheck`, `pnpm run build`), **docker** (`docker compose build api frontend`).
- Do not merge with failing typecheck or lint on either side.

