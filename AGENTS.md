# AGENTS.md

## Project Overview

**claude-code-to-cursor** is an OAuth-authenticated proxy that routes API requests through Claude Code's OAuth authentication. It lets clients like Cursor, VS Code, or any OpenAI/Anthropic-compatible tool use Claude without needing a direct Anthropic API key. All traffic goes through a Cloudflare Tunnel — the proxy is never directly exposed to the internet.

### Architecture

Three services orchestrated via Docker Compose:

- **API Server** (Bun, port 8082) — the proxy that handles OAuth, request translation, rate limiting, analytics, and model settings
- **Frontend Dashboard** (React + Vite, port 3111) — authentication UI, analytics, settings management
- **Cloudflare Tunnel** (cloudflared) — secure external access to the API

The API converts between OpenAI chat completion format and Anthropic messages format, allowing any OpenAI-compatible client to talk to Claude. It exposes a single public model ID (`Claude Code`) and maps it to a user-configured backend model (Opus 4.6, Sonnet 4.6, or Haiku 4.5).

### Key Technologies

- **Backend**: Bun v1.0+, TypeScript (strict mode), SQLite (Bun built-in), OAuth 2.0 PKCE, SSE streaming
- **Frontend**: React 19, TanStack Router v1, TanStack Query v5, React Hook Form + Zod, Tailwind CSS v4, Vite v6, Vitest
- **Infrastructure**: Docker Compose, Cloudflare Tunnel, nginx (frontend prod)

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
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```

Mounts source code as volumes for live reloading.

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

| Variable | Default | Description |
|---|---|---|
| `CLOUDFLARE_TUNNEL_TOKEN` | _(required)_ | Cloudflare Tunnel token |
| `PORT` | `8082` | Proxy server port |
| `FRONTEND_PORT` | `3111` | Dashboard frontend port |
| `ALLOWED_IPS` | Cursor backend IPs | IP whitelist (set `disabled` to allow all) |
| `CLAUDE_CODE_EXTRA_INSTRUCTION` | _(empty)_ | Extra instruction appended to system prompt |
| `CCTC_AUTH_DIR` | `~/.cctc` / `/data/auth` | OAuth credentials storage directory |
| `CCTC_DB_PATH` | `./cctc.db` / `/data/cctc.db` | SQLite database path |
| `SETTINGS_API_KEY` | _(empty)_ | Shared secret for settings API |
| `LOG_DIR` | _(current dir)_ / `/data/logs` | Log files directory |

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

- Test runner: Vitest
- Test directory: `frontend/src/__tests__/`
- Test files:
  - `frontend/src/__tests__/schemas/settings.test.ts`
  - `frontend/src/__tests__/schemas/login.test.ts`
  - `frontend/src/__tests__/lib/api-client.test.ts`

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

### TypeScript (Frontend)

- Strict mode, ES2022 target
- TanStack Router for routing (file-based routes in `src/routes/`)
- TanStack Query for server state (query keys centralized in `src/lib/query-keys.ts`)
- Forms: React Hook Form + Zod schemas (schemas in `src/schemas/`)
- Styling: Tailwind CSS v4, utility merging via `clsx` + `tailwind-merge` (in `src/lib/utils.ts`)
- Icons: `lucide-react`
- Charts: `recharts`
- Custom hooks in `src/hooks/` for data fetching (analytics, health, settings, onboarding)
- API client in `src/lib/api-client.ts`

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
│   ├── internal-tools.ts       # Internal tool definitions
│   ├── middleware.ts           # CORS, IP whitelist
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
│   │   ├── routes/             # TanStack Router file-based routes
│   │   ├── components/         # React components
│   │   ├── hooks/              # Custom React hooks
│   │   ├── lib/                # API client, utilities, query keys
│   │   ├── schemas/            # Zod validation schemas
│   │   └── __tests__/          # Frontend tests
│   ├── vite.config.ts
│   ├── tsconfig.json
│   └── nginx.conf              # Production nginx config
├── docker-compose.yml          # Production orchestration
├── docker-compose.dev.yml      # Dev overrides (hot reload)
├── Dockerfile                  # Backend container (oven/bun:1)
└── frontend/Dockerfile         # Frontend container (node:22 → nginx)
```

---

## API Endpoints

### Proxy Endpoints (IP whitelisted)

| Method | Path | Description |
|---|---|---|
| `POST` | `/v1/messages` | Anthropic Messages API proxy |
| `POST` | `/v1/chat/completions` | OpenAI Chat Completions API proxy |
| `GET` | `/v1/models` | List available models |

### Internal Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Health check (also `/` and `/api/health`) |
| `GET` | `/api/analytics` | Analytics summary |
| `GET` | `/api/analytics/requests` | Request history |
| `GET` | `/api/analytics/timeline` | Timeline data |
| `POST` | `/api/analytics/reset` | Reset analytics |
| `GET` | `/api/rate-limit` | Rate limit status |
| `POST` | `/api/rate-limit/reset` | Clear rate limit cache |
| `GET` | `/api/auth/login` | Start OAuth flow |
| `POST` | `/api/auth/callback` | Complete OAuth flow |
| `GET` | `/api/auth/status` | Auth status |
| `GET` | `/api/settings` | Get model settings |
| `POST` | `/api/settings/model` | Update model settings |

---

## Key Implementation Details

### OAuth Flow

- Uses OAuth 2.0 PKCE (Claude Code client ID: `9d1c250a-e61b-44d9-88ed-5944d1962f5e`)
- Credentials stored as JSON in `CCTC_AUTH_DIR/auth.json`
- Tokens auto-refresh on expiry
- Required beta headers: `oauth-2025-04-20`, `interleaved-thinking-2025-05-14`
- User-Agent must match: `claude-cli/2.1.2 (external, cli)`
- System prompt must start with: `"You are Claude Code, Anthropic's official CLI for Claude."` (required for OAuth to work)

### Request Translation (OpenAI ↔ Anthropic)

- `src/openai-adapter.ts` converts OpenAI chat completion requests to Anthropic messages format
- `src/stream-handler.ts` converts Anthropic SSE streaming responses back to OpenAI format
- Model names in requests are ignored — the proxy uses the model selected in settings
- The only public model ID exposed is `"Claude Code"` (see `src/model-settings.ts`)

### Model Settings

- Supported models: `claude-opus-4-6`, `claude-sonnet-4-6`, `claude-haiku-4-5`
- Thinking mode: enabled/disabled with effort levels (low: 4096, medium: 8192, high: 16384 tokens)
- Default: Opus 4.6, thinking enabled, high effort
- Settings persisted in SQLite (`model_settings` table)

### Rate Limiting

- Smart cache in `src/anthropic-client.ts`
- 5-minute hard block after 429, then soft expiry with probing
- Status exposed via `/api/rate-limit`
- Manual reset via `/api/rate-limit/reset`

### Database

- SQLite via Bun's built-in driver
- Tables: `requests` (analytics), `model_settings`
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

- Backend image: `oven/bun:1` — runs `bun run index.ts` directly
- Frontend image: `node:22-alpine` build stage → `nginx:alpine` for serving
- Persistent volume: `cctc-data` mounted at `/data` (database, auth, logs)
- Health check: API must respond on `/health` before frontend/cloudflared start

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

### Debugging

- Check `api.log` in the working directory (or `LOG_DIR`) for verbose request logs
- Query SQLite: `bun -e "import { getDb } from './src/db'; console.log(getDb().query('SELECT * FROM requests ORDER BY id DESC LIMIT 5').all())"`
- Docker logs: `docker compose logs api`, `docker compose logs cloudflared`
- Test with curl: `curl http://localhost:8082/health`

---

## Troubleshooting

| Problem | Solution |
|---|---|
| Port 8082 in use | `netstat -ano \| findstr :8082` then kill the process, or set `PORT=8083` in `.env` |
| Health shows "Unauthenticated" | Open dashboard → Auth page → complete OAuth flow |
| Requests fail with 403 | IP not in whitelist. Check logs or set `ALLOWED_IPS=disabled` in `.env` |
| Requests fail with 429 | Rate limited by Anthropic. Dashboard shows reset time |
| Tunnel not connecting | Verify `CLOUDFLARE_TUNNEL_TOKEN` in `.env`. Check `docker compose logs cloudflared` |
| Frontend can't reach API | Ensure API is healthy first. In Docker, frontend uses `API_URL=http://api:8082` |

---

## PR Guidelines

- Run `bun run typecheck && bun test` (backend) and `cd frontend && npm run typecheck && npm run test` (frontend) before committing
- Title format: `[backend|frontend|docker] Brief description`
- Keep database migrations backward-compatible
- Don't commit log files (`api.log` is gitignored)
