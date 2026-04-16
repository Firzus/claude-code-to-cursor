# AGENTS.md

## Project Overview

**claude-code-to-cursor** is an OAuth-authenticated proxy that routes API requests through Claude Code's OAuth authentication. It lets clients like Cursor, VS Code, or any OpenAI/Anthropic-compatible tool use Claude without needing a direct Anthropic API key. All traffic goes through a Cloudflare Tunnel — the proxy is never directly exposed to the internet.

### Architecture

Three services orchestrated via Docker Compose:

- **API Server** (Bun, port 8082) — the proxy that handles OAuth, request translation, rate limiting, analytics, and model settings
- **Frontend Dashboard** (React + Vite, port 3111) — authentication UI, onboarding wizard, analytics dashboard, settings management
- **Cloudflare Tunnel** (cloudflared) — secure external access to the API

The API converts between OpenAI chat completion format and Anthropic messages format, allowing any OpenAI-compatible client to talk to Claude. It exposes a single public model ID (`Claude Code`) and maps it to a user-configured backend model (Opus 4.7, Sonnet 4.6, or Haiku 4.5).

### Key Technologies

- **Backend**: Bun v1.0+, TypeScript (strict mode), SQLite (Bun built-in), OAuth 2.0 PKCE, SSE streaming
- **Frontend**: React 19, TanStack Router v1, TanStack Query v5, React Hook Form + Zod, Tailwind CSS v4, Vite v6, recharts v3
- **Testing**: Bun test runner (backend), Vitest v3 + Testing Library (React v16, jest-dom v6, user-event v14) + jsdom (frontend)
- **Infrastructure**: Docker Compose, Cloudflare Tunnel (cloudflared 2025.4.0), nginx (frontend prod)

---

## Setup Commands

### Prerequisites

- [Bun](https://bun.sh) v1.0+ (backend)
- Node.js 22+ (frontend)
- Docker & Docker Compose (recommended for full stack)
- A Cloudflare Tunnel token

### Installation

```bash
# Clone the repo
git clone <repo-url> && cd claude-code-to-cursor

# Install backend dependencies
bun install

# Install frontend dependencies
cd frontend && npm install && cd ..

# Set up environment
cp .env.example .env
# Edit .env — at minimum set CLOUDFLARE_TUNNEL_TOKEN
```

### Docker (recommended)

```bash
docker compose up -d
```

This starts all three services. API health is checked before frontend and cloudflared start.

### Docker (development mode with hot reload)

```bash
docker compose -f docker-compose.dev.yml up
```

The dev compose file uses `include` to load `docker-compose.yml` as base, then overrides with source volume mounts and hot-reload commands.

---

## Development Workflow

### Backend

```bash
bun run dev          # Start with hot reload (bun --hot)
bun run start        # Start without hot reload
bun run typecheck    # Run TypeScript type checking (bunx tsc --noEmit)
bun test             # Run all backend tests
```

Entry point: `index.ts`. All source code in `src/`.

### Frontend

```bash
cd frontend
npm run dev          # Start Vite dev server on port 3111
npm run build        # Production build → dist/
npm run preview      # Preview production build
npm run typecheck    # Run TypeScript type checking
npm run test         # Run all tests (vitest run)
npm run test:watch   # Run tests in watch mode
```

Frontend uses path alias `~/` → `./src/` (configured in `tsconfig.json` and `vite.config.ts`).

### Environment Variables

All settings via `.env` (see `.env.example`):

| Variable                        | Default                        | Description                                           |
| ------------------------------- | ------------------------------ | ----------------------------------------------------- |
| `CLOUDFLARE_TUNNEL_TOKEN`       | _(required)_                   | Cloudflare Tunnel token                               |
| `CLOUDFLARE_TUNNEL_URL`         | _(empty)_                      | Public URL of the tunnel (shown in setup wizard)      |
| `PORT`                          | `8082`                         | Proxy server port                                     |
| `FRONTEND_PORT`                 | `3111`                         | Dashboard frontend port                               |
| `ALLOWED_IPS`                   | `52.44.113.131,184.73.225.134` | IP whitelist (set `disabled` to allow all)            |
| `CLAUDE_CODE_EXTRA_INSTRUCTION` | _(empty)_                      | Extra instruction appended to system prompt           |
| `CCTC_AUTH_DIR`                 | `~/.cctc` / `/data/auth`       | OAuth credentials storage directory                   |
| `CCTC_DB_PATH`                  | `./cctc.db` / `/data/cctc.db`  | SQLite database path                                  |
| `SETTINGS_API_KEY`              | _(empty)_                      | Shared secret for settings API (empty = unrestricted) |
| `LOG_DIR`                       | _(current dir)_ / `/data/logs` | Log files directory                                   |

---

## Testing Instructions

### Backend Tests

```bash
bun test                                    # Run all backend tests
bun test src/openai-adapter.test.ts         # Run a specific test file
bun test --grep "pattern"                   # Run tests matching pattern
```

- Test runner: Bun built-in test runner
- Test root: `./src` (configured in `bunfig.toml`)
- Test files live alongside source: `src/*.test.ts` and `src/routes/*.test.ts`
- Key test files:
  - `src/openai-adapter.test.ts` — OpenAI-to-Anthropic format conversion
  - `src/request-normalization.test.ts` — request preprocessing
  - `src/model-settings.test.ts` — model configuration validation
  - `src/model-settings-store.test.ts` — SQLite persistence for settings
  - `src/routes/anthropic.test.ts` — Anthropic route handler
  - `src/routes/settings.test.ts` — Settings API endpoint

### Frontend Tests

```bash
cd frontend
npm run test                                # Run all tests (vitest run)
npm run test:watch                          # Watch mode
```

- Test runner: Vitest (jsdom environment, globals enabled)
- Setup file: `src/test-setup.ts` (extends `expect` with `@testing-library/jest-dom` matchers)
- Shared utilities: `src/__tests__/test-utils.tsx` (QueryClient wrappers, `renderWithQuery`, `renderHookWithQuery`)
- Test directory: `frontend/src/__tests__/` organized by category:
  - `schemas/` — api-responses, login, settings schema validation
  - `hooks/` — use-analytics, use-health, use-onboarding, use-settings
  - `components/` — empty-state, error-boundary, nav-bar, oauth-flow
  - `routes/` — analytics, login, settings page rendering
  - `lib/` — api-client fetch wrapper

### Before Submitting Code

Always run both:

```bash
bun run typecheck && bun test
cd frontend && npm run typecheck && npm run test
```

---

## Code Style Guidelines

### TypeScript (Backend)

- **Strict mode** with `noUncheckedIndexedAccess` and `noImplicitOverride` enabled
- ESNext target, bundler module resolution
- Use `async/await` throughout, return `Response` objects from route handlers
- Route handlers in `src/routes/` — one file per domain (anthropic, openai, auth, analytics, settings, models)
- Use `type` imports (`import type { ... }`) via `verbatimModuleSyntax`
- All types defined in `src/types.ts`
- Use `logger.info()` / `logger.error()` for structured logging (file-based, auto-rotating)
- Zero runtime dependencies — backend relies entirely on Bun built-ins (HTTP server, SQLite, fetch, crypto)

### TypeScript (Frontend)

- Strict mode, ES2022 target
- TanStack Router for routing (file-based routes in `src/routes/`)
- TanStack Query for server state (query keys centralized in `src/lib/query-keys.ts`)
- Forms: React Hook Form + Zod schemas (schemas in `src/schemas/`)
- API response validation: Zod schemas centralized in `src/schemas/api-responses.ts`
- Styling: Tailwind CSS v4, utility merging via `clsx` + `tailwind-merge` (in `src/lib/utils.ts`)
- Variants: `class-variance-authority` for components with style variants (e.g. `badge.tsx`)
- UI primitives: native HTML elements styled with Tailwind (no shadcn-ui wrappers for button, input, label, select)
- Icons: `lucide-react`
- Charts: `recharts`
- Custom hooks in `src/hooks/` for data fetching (analytics, health, settings, onboarding)
- API client in `src/lib/api-client.ts` — typed fetch wrapper with optional Zod validation

### General Conventions

- camelCase for variables/functions, PascalCase for types/components
- No semicolons needed (Bun default style)
- Interfaces preferred over type aliases for object shapes
- Error responses follow Anthropic's error format: `{ type: "error", error: { type: string, message: string } }`

---

## Project Structure

```
claude-code-to-cursor/
├── index.ts                    # Backend entry point — HTTP server + routing
├── src/
│   ├── config.ts               # Configuration, OAuth constants, env parsing
│   ├── types.ts                # All TypeScript interfaces
│   ├── oauth.ts                # OAuth 2.0 PKCE flow implementation
│   ├── anthropic-client.ts     # Anthropic API interaction + rate limit cache
│   ├── openai-adapter.ts       # OpenAI ↔ Anthropic format conversion
│   ├── stream-handler.ts       # SSE stream processing and format conversion
│   ├── model-settings.ts       # Model configuration types and validation
│   ├── model-settings-store.ts # SQLite persistence for model settings
│   ├── model-parser.ts         # Model ID parsing utilities
│   ├── request-normalization.ts # Request preprocessing
│   ├── internal-tools.ts       # Internal tool text extraction (CreatePlan, TodoWrite)
│   ├── cache-keepalive.ts     # Periodic ping to keep Anthropic prompt cache warm
│   ├── middleware.ts           # CORS, IP whitelist, request logging
│   ├── logger.ts               # File-based logging with auto-rotation
│   ├── db.ts                   # SQLite database setup + analytics storage
│   └── routes/
│       ├── anthropic.ts        # POST /v1/messages (Anthropic format proxy)
│       ├── openai.ts           # POST /v1/chat/completions (OpenAI format proxy)
│       ├── models.ts           # GET /v1/models
│       ├── auth.ts             # OAuth login/callback/status API
│       ├── analytics.ts        # Analytics queries API
│       └── settings.ts         # Model settings API
├── frontend/
│   ├── src/
│   │   ├── main.tsx            # React entry point
│   │   ├── router.tsx          # TanStack Router + QueryClient setup
│   │   ├── test-setup.ts       # Vitest setup (jest-dom matchers)
│   │   ├── styles/
│   │   │   └── app.css         # Tailwind v4 theme (dark mode, oklch colors)
│   │   ├── routes/
│   │   │   ├── __root.tsx      # Root layout (NavBar, ErrorBoundary, Suspense)
│   │   │   ├── index.tsx       # Redirect → /analytics or /setup
│   │   │   ├── analytics.tsx   # Analytics dashboard (stats, charts, request history)
│   │   │   ├── login.tsx       # OAuth authentication page
│   │   │   ├── settings.tsx    # Model selection, thinking toggle
│   │   │   └── setup.tsx       # Onboarding wizard (4 steps)
│   │   ├── components/
│   │   │   ├── empty-state.tsx       # Empty state placeholder
│   │   │   ├── error-boundary.tsx    # React error boundary
│   │   │   ├── health-indicator.tsx  # Health status badge
│   │   │   ├── nav-bar.tsx           # Navigation bar
│   │   │   ├── oauth-flow.tsx        # OAuth login flow component
│   │   │   ├── analytics/
│   │   │   │   ├── ago-text.tsx      # Relative time display
│   │   │   │   ├── confirm-dialog.tsx # Confirmation dialog
│   │   │   │   ├── pagination.tsx    # Table pagination
│   │   │   │   └── stat-card.tsx     # Statistics card
│   │   │   ├── setup/
│   │   │   │   ├── copy-block.tsx    # Copy-to-clipboard code block
│   │   │   │   ├── nav-buttons.tsx   # Wizard navigation buttons
│   │   │   │   ├── status-row.tsx    # Status check row
│   │   │   │   └── step-indicator.tsx # Step progress indicator
│   │   │   └── ui/
│   │   │       ├── badge.tsx         # Badge with variants (cva)
│   │   │       ├── card.tsx          # Card components
│   │   │       ├── chart.tsx         # Recharts wrapper
│   │   │       ├── skeleton.tsx      # Loading skeleton
│   │   │       └── tooltip.tsx       # Tooltip component
│   │   ├── hooks/
│   │   │   ├── use-analytics.ts      # Analytics data hooks (summary, requests, timeline)
│   │   │   ├── use-health.ts         # Health check hook
│   │   │   ├── use-onboarding.ts     # Onboarding state (localStorage)
│   │   │   └── use-settings.ts       # Settings query + mutation
│   │   ├── lib/
│   │   │   ├── api-client.ts         # Typed fetch wrapper with Zod validation
│   │   │   ├── pricing.ts            # Cache savings calculation
│   │   │   ├── query-keys.ts         # TanStack Query key constants
│   │   │   └── utils.ts              # cn() utility (clsx + tailwind-merge)
│   │   ├── schemas/
│   │   │   ├── api-responses.ts      # Zod schemas for all API responses
│   │   │   ├── login.ts              # Login form schema
│   │   │   └── settings.ts           # Settings form schema
│   │   └── __tests__/
│   │       ├── test-utils.tsx        # Shared test utilities
│   │       ├── schemas/              # Schema validation tests
│   │       ├── hooks/                # Hook behavior tests
│   │       ├── components/           # Component rendering tests
│   │       ├── routes/               # Route/page rendering tests
│   │       └── lib/                  # Utility function tests
│   ├── vite.config.ts
│   ├── vitest.config.ts
│   ├── tsconfig.json
│   └── nginx.conf              # Production nginx config
├── docker-compose.yml          # Production orchestration
├── docker-compose.dev.yml      # Dev overrides (hot reload, via include)
├── Dockerfile                  # Backend container (oven/bun:1, non-root)
├── docker-entrypoint.sh        # Docker startup script (permissions + bun run)
└── frontend/Dockerfile         # Frontend container (node:22 → nginx-unprivileged)
```

---

## API Endpoints

### Proxy Endpoints (IP whitelisted)

| Method | Path                   | Description                       |
| ------ | ---------------------- | --------------------------------- |
| `POST` | `/v1/messages`         | Anthropic Messages API proxy      |
| `POST` | `/v1/chat/completions` | OpenAI Chat Completions API proxy |
| `GET`  | `/v1/models`           | List available models             |

### Analytics Endpoints (IP whitelisted)

| Method | Path                                                    | Description                 |
| ------ | ------------------------------------------------------- | --------------------------- |
| `GET`  | `/api/analytics` (alias `/analytics`)                   | Analytics summary           |
| `GET`  | `/api/analytics/requests` (alias `/analytics/requests`) | Request history (paginated) |
| `GET`  | `/api/analytics/timeline` (alias `/analytics/timeline`) | Timeline data (bucketed)    |
| `POST` | `/api/analytics/reset` (alias `/analytics/reset`)       | Reset analytics             |

### Auth Endpoints

| Method | Path                 | Description         |
| ------ | -------------------- | ------------------- |
| `GET`  | `/api/auth/login`    | Start OAuth flow    |
| `POST` | `/api/auth/callback` | Complete OAuth flow |
| `GET`  | `/api/auth/status`   | Auth status         |

### Settings Endpoints

| Method | Path                  | Description           |
| ------ | --------------------- | --------------------- |
| `GET`  | `/api/settings`       | Get model settings    |
| `POST` | `/api/settings/model` | Update model settings |

### Utility Endpoints

| Method | Path                                                | Description            |
| ------ | --------------------------------------------------- | ---------------------- |
| `GET`  | `/health` (also `/`, `/api/health`)                 | Health check           |
| `GET`  | `/api/rate-limit` (alias `/rate-limit`)             | Rate limit status      |
| `POST` | `/api/rate-limit/reset` (alias `/rate-limit/reset`) | Clear rate limit cache |

---

## Key Implementation Details

### OAuth Flow

- Uses OAuth 2.0 PKCE (Claude Code client ID: `9d1c250a-e61b-44d9-88ed-5944d1962f5e`)
- Credentials stored as JSON in `CCTC_AUTH_DIR/auth.json`
- Tokens auto-refresh on expiry
- Required beta headers: `oauth-2025-04-20`, `interleaved-thinking-2025-05-14`
- User-Agent must match: `claude-cli/2.1.97 (external, cli)`
- System prompt must start with: `"You are Claude Code, Anthropic's official CLI for Claude."` (required for OAuth to work)
- Note: `context-1m` beta header was removed — 1M context is GA for Opus 4.7

### Request Translation (OpenAI ↔ Anthropic)

- `src/openai-adapter.ts` converts OpenAI chat completion requests to Anthropic messages format
- `src/stream-handler.ts` converts Anthropic SSE streaming responses back to OpenAI format
- Model names in requests are ignored — the proxy uses the model selected in settings
- The only public model ID exposed is `"Claude Code"` (see `src/model-settings.ts`)
- Supports OpenAI Responses API format (`input` field), images, and tool calls

### Cache Strategy

The proxy uses 4 cache breakpoints in `src/anthropic-client.ts` to maximize Anthropic prompt caching:

1. Last tool definition in the tools array
2. Last block in the system prompt
3. Intermediate breakpoint at ~40% of user messages
4. Second-to-last user message

Tool names are prefixed with `mcp_` and sorted alphabetically for stable cache keys. TTL-based `cache_control` is stripped (not supported by Claude Code OAuth).

### Cache Keepalive

- `src/cache-keepalive.ts` sends a lightweight ping every 4 minutes to keep the Anthropic prompt cache warm (ephemeral cache TTL is 5 minutes)
- After each successful request, `updateCachePrefix()` stores the model, system prompt, and tools
- A `setInterval` timer calls `sendKeepalivePing()` with a minimal `max_tokens=1` request using the same prefix
- Started automatically on server boot via `startCacheKeepalive()` in `index.ts`
- Inspired by Aider's `--cache-keepalive-pings` feature

### Model Settings

- Supported models: `claude-opus-4-7`, `claude-sonnet-4-6`, `claude-haiku-4-5`
- Thinking mode: enabled/disabled with effort levels (low: 4096, medium: 8192, high: 16384 tokens)
- `THINKING_MAX_TOKENS_PADDING` = 8192 (added to thinking budget to compute max_tokens)
- Default: Opus 4.7, thinking enabled, high effort
- Settings persisted in SQLite (`model_settings` table)
- Context window: 1M tokens for Opus 4.7, 200K for Sonnet 4.6 and Haiku 4.5

### Rate Limiting

- Smart cache in `src/anthropic-client.ts`
- 5-minute hard block after 429, then soft expiry with probing (max 15 minutes)
- Status exposed via `/api/rate-limit`
- Manual reset via `/api/rate-limit/reset`

### Onboarding Flow

- 4-step setup wizard at `/setup`: Welcome → Authenticate → Configure Client → Verify
- Completion stored in localStorage key `cctc:onboarding-complete`
- Auto-detects first successful request via analytics polling
- Index route redirects to `/setup` if onboarding is incomplete, otherwise to `/analytics`
- `use-onboarding.ts` hook syncs state with `useSyncExternalStore` + `StorageEvent`

### Cache Savings Estimation

- `frontend/src/lib/pricing.ts` calculates estimated cost savings from prompt caching
- Cache read cost ratio: 0.1 (10% of normal input token cost)
- Cache creation cost ratio: 1.25 (25% surcharge for creating cache entries)

### Database

- SQLite via Bun's built-in driver
- Tables: `requests` (analytics with cache token tracking), `model_settings`
- `requests` table includes `cache_read_tokens` and `cache_creation_tokens` columns (added via migration)
- Auto-migrated on startup in `src/db.ts`
- Docker volume `cctc-data` for persistence

---

## Build and Deployment

### Production Build

```bash
# Backend (runs directly from TypeScript with Bun, no build step needed)
bun run start

# Frontend
cd frontend && npm run build   # Outputs to frontend/dist/
```

### Docker Deployment

```bash
docker compose up -d --build
```

- Backend image: `oven/bun:1` — runs `bun run index.ts` as non-root user `bun`
- Frontend image: `node:22-alpine` build stage → `nginxinc/nginx-unprivileged:alpine` for serving
- Cloudflared image: `cloudflare/cloudflared:2025.4.0` (pinned version)
- Persistent volume: `cctc-data` mounted at `/data` (database, auth, logs)
- Health check: API must respond on `/health` before frontend/cloudflared start
- Resource limits: API = 512MB / 1 CPU, Frontend = 256MB / 0.5 CPU, Cloudflared = 128MB / 0.25 CPU
- All services on an isolated `internal` bridge network

### Docker Development

```bash
docker compose -f docker-compose.dev.yml up
```

- Uses `include` directive to load `docker-compose.yml` as base
- API: mounts source at `/app` with `bun --hot` for hot reload
- Frontend: targets `builder` stage, mounts `src/` for live reload via `vite dev`

---

## Common Development Tasks

### Adding a New Route

1. Create handler in `src/routes/<name>.ts` returning `Response`
2. Register the route in `index.ts` `handleRequest()` function
3. Add tests in `src/routes/<name>.test.ts`

### Adding a New Supported Model

1. Add model ID to `SupportedSelectedModel` type in `src/model-settings.ts`
2. Add to `SUPPORTED_SELECTED_MODELS` array
3. Update `getContextLength()` if the new model has a different context window
4. Update thinking budgets if needed

### Adding a Frontend Test

1. Create test file in `frontend/src/__tests__/<category>/` (schemas, hooks, components, routes, lib)
2. Use shared utilities from `__tests__/test-utils.tsx` (`renderWithQuery`, `renderHookWithQuery`)
3. Mock `apiFetch` from `~/lib/api-client` for hook and component tests
4. Run `npm run test` from `frontend/` to verify

### Adding an API Response Schema

1. Add Zod schema + inferred type in `frontend/src/schemas/api-responses.ts`
2. Pass the schema to `apiFetch()` for runtime validation in hooks
3. Add validation tests in `frontend/src/__tests__/schemas/api-responses.test.ts`

### Adding an Analytics Component

1. Create component in `frontend/src/components/analytics/`
2. Import and use in `frontend/src/routes/analytics.tsx`
3. Add tests in `frontend/src/__tests__/components/`

### Debugging

- Check `api.log` in the working directory (or `LOG_DIR`) for verbose request logs
- Query SQLite: `bun -e "import { getDb } from './src/db'; console.log(getDb().query('SELECT * FROM requests ORDER BY id DESC LIMIT 5').all())"`
- Docker logs: `docker compose logs api`, `docker compose logs cloudflared`
- Test with curl: `curl http://localhost:8082/health`

---

## Troubleshooting

| Problem                        | Solution                                                                            |
| ------------------------------ | ----------------------------------------------------------------------------------- |
| Port 8082 in use               | `netstat -ano \| findstr :8082` then kill the process, or set `PORT=8083` in `.env` |
| Health shows "Unauthenticated" | Open dashboard → Auth page → complete OAuth flow                                    |
| Requests fail with 403         | IP not in whitelist. Check logs or set `ALLOWED_IPS=disabled` in `.env`             |
| Requests fail with 429         | Rate limited by Anthropic. Dashboard shows reset time                               |
| Tunnel not connecting          | Verify `CLOUDFLARE_TUNNEL_TOKEN` in `.env`. Check `docker compose logs cloudflared` |
| Frontend can't reach API       | Ensure API is healthy first. In Docker, frontend uses `API_URL=http://api:8082`     |

---

## PR Guidelines

- Run `bun run typecheck && bun test` (backend) and `cd frontend && npm run typecheck && npm run test` (frontend) before committing
- Title format: `[backend|frontend|docker] Brief description`
- Keep database migrations backward-compatible
- Don't commit log files (`api.log` is gitignored)
