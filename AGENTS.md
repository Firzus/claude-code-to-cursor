# AGENTS.md

## Project Overview

**ccproxy** (Claude Code Proxy) is a local HTTP proxy server that routes API requests to the Anthropic API using Claude Code's OAuth authentication. It exposes a single public model alias (`"Claude Code"`) mapped to a configurable backend model (claude-opus-4-6, claude-sonnet-4-6, claude-haiku-4-5) and supports both Anthropic native and OpenAI-compatible API formats with real-time SSE streaming.

**Key technical choices:**

- **Runtime:** Bun (not Node.js) — TypeScript is executed directly, no build step
- **Zero runtime dependencies** — everything uses Bun built-in APIs (`Bun.serve()`, `bun:sqlite`, `bun:test`, `crypto.subtle`)
- **Single entry point:** `index.ts` at the project root
- **Database:** SQLite via `bun:sqlite` for analytics, cache metrics, and model settings
- **Auth:** OAuth PKCE flow with Anthropic, tokens persisted to `~/.ccproxy/auth.json`

**Key optimizations:**

- **Prompt caching:** Injects `cache_control: { type: "ephemeral" }` breakpoints on system prompts and conversation history to enable Anthropic prompt caching (~74% input token savings in agent loops)
- **Adaptive thinking:** Respects client `reasoning_effort` field to adjust thinking budget per-request instead of a fixed setting
- **1M context:** Sends `context-1m-2025-08-07` beta header for Opus 4.6 extended context

## Setup Commands

```bash
# Install dependencies (Bun is required — https://bun.sh)
bun install

# Copy environment config (optional)
cp .env.example .env

# Start the server
bun run start

# Start with hot-reload (development)
bun run dev
```

The server starts on `http://localhost:8082` by default. On first run, authenticate via `http://localhost:8082/login`.

## Environment Variables

Configured in `.env` (see `.env.example`):

| Variable                        | Default                        | Description                                                                          |
| ------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------ |
| `PORT`                          | `8082`                         | HTTP server port                                                                     |
| `ALLOWED_IPS`                   | `52.44.113.131,184.73.225.134` | IP whitelist for tunnel requests (comma-separated). Set to `"disabled"` to allow all |
| `CLAUDE_CODE_EXTRA_INSTRUCTION` | `""` (empty)                   | Optional extra instruction appended to the Claude Code system prompt                 |
| `CCPROXY_DB_PATH`               | `./ccproxy.db`                 | SQLite database file path                                                            |

## Development Workflow

- `bun run dev` starts the server with Bun's `--hot` flag for automatic reload on file changes
- `bun run start` starts without hot-reload (production)
- Verbose logs are written to `api.log` (auto-truncated at 50 MB, gitignored). Console output is minimal.
- The SQLite database `ccproxy.db` is gitignored and created automatically on first run
- OAuth tokens are stored at `~/.ccproxy/auth.json`

## Testing

```bash
# Run all tests
bun test

# Run a specific test file
bun test src/openai-adapter.test.ts

# Run tests matching a pattern
bun test --grep "model rewrite"
```

**Test framework:** `bun:test` (Bun's built-in test runner, Jest-compatible API)

**Test files are co-located with source files** using the `.test.ts` suffix:

| Test file                           | What it covers                                            |
| ----------------------------------- | --------------------------------------------------------- |
| `src/model-settings.test.ts`        | Public model contract, thinking budgets, API model ID     |
| `src/model-settings-store.test.ts`  | SQLite persistence of settings (in-memory DB)             |
| `src/openai-adapter.test.ts`        | OpenAI to Anthropic conversion, adaptive thinking budget  |
| `src/request-normalization.test.ts` | Tool ID normalization                                     |
| `src/routes/anthropic.test.ts`      | Anthropic route, model rewrite, thinking controls         |
| `src/routes/settings.test.ts`       | Settings security (loopback, same-origin, validation)     |

When modifying a module, add or update the corresponding `.test.ts` file.

## Type Checking

```bash
# Run TypeScript type checker (strict mode, no emit)
bun run typecheck
```

The project uses `tsconfig.json` with strict mode enabled, bundler module resolution, and `noEmit: true`. There is no compilation step — Bun executes TypeScript directly.

## Project Structure

```
ccproxy/
├── index.ts                           # Entry point — Bun.serve() setup, route registration
├── package.json                       # Scripts: start, dev, typecheck
├── tsconfig.json                      # Strict, ESNext, bundler mode, noEmit
├── .env.example                       # Environment variable documentation
├── src/
│   ├── config.ts                      # OAuth constants, beta headers, env config
│   ├── types.ts                       # TypeScript interfaces
│   ├── oauth.ts                       # PKCE flow, token refresh, persistence
│   ├── db.ts                          # SQLite analytics + cache metrics + settings schema
│   ├── middleware.ts                   # CORS headers, IP whitelist
│   ├── anthropic-client.ts            # API client, prompt caching injection, rate limiting
│   ├── openai-adapter.ts              # Bidirectional OpenAI ↔ Anthropic conversion
│   ├── stream-handler.ts             # SSE streaming pipeline (Anthropic → OpenAI chunks)
│   ├── model-parser.ts               # Model ID parsing
│   ├── model-settings.ts             # Model config (types, defaults, thinking budgets)
│   ├── model-settings-store.ts       # SQLite persistence for model settings
│   ├── request-normalization.ts      # Tool ID prefix normalization (mcp_)
│   ├── internal-tools.ts             # Text extraction from internal tools
│   ├── html-templates.ts             # HTML pages (login, settings UI)
│   ├── logger.ts                      # File logger with auto-truncation
│   ├── routes/
│   │   ├── anthropic.ts              # POST /v1/messages (with streaming token tracking)
│   │   ├── openai.ts                 # POST /v1/chat/completions (with streaming token tracking)
│   │   ├── models.ts                 # GET /v1/models (dynamic context_length)
│   │   ├── analytics.ts             # GET/POST /analytics (includes cache metrics)
│   │   ├── auth.ts                   # GET /login, POST /oauth/callback
│   │   └── settings.ts              # GET /settings, POST /settings/model (loopback only)
│   └── *.test.ts                     # Co-located test files
└── scripts/
    ├── install-task.ps1              # PowerShell: register Windows scheduled tasks
    ├── run-ccproxy.bat               # Batch: start ccproxy with restart loop
    ├── run-ccproxy.vbs               # VBScript: silent launcher for run-ccproxy.bat
    ├── run-cloudflared.bat           # Batch: start cloudflared tunnel with restart loop
    └── run-cloudflared.vbs           # VBScript: silent launcher for run-cloudflared.bat
```

## Architecture: Request Flow

```
Client (Cursor/IDE)
  → /v1/chat/completions (OpenAI format)
  → openai-adapter.ts (conversion + adaptive thinking budget)
    → anthropic-client.ts
      → prepareClaudeCodeBody():
        1. Inject Claude Code system prompt (required for OAuth)
        2. Add cache_control breakpoints (system + conversation history)
        3. Prefix tool names with mcp_
        4. Strip TTL from cache_control
      → Anthropic API (via OAuth token + beta headers)
    → stream-handler.ts (SSE Anthropic → OpenAI chunks)
      → Token usage tracked (input, output, cache_read, cache_creation)
    → Response to client (model rewritten to "Claude Code")
```

## HTTP API Endpoints

| Endpoint               | Method | Description                                      |
| ---------------------- | ------ | ------------------------------------------------ |
| `/` `/health`          | GET    | Health check, auth status, rate limit info       |
| `/v1/messages`         | POST   | Anthropic native API (proxy with model rewrite)  |
| `/v1/chat/completions` | POST   | OpenAI-compatible API (bidirectional conversion) |
| `/v1/models`           | GET    | Lists available models (returns `"Claude Code"`) |
| `/analytics`           | GET    | Usage statistics (includes cache hit rate)       |
| `/analytics/requests`  | GET    | Recent request log                               |
| `/analytics/reset`     | POST   | Reset analytics data                             |
| `/rate-limit`          | GET    | Current rate limit status                        |
| `/rate-limit/reset`    | POST   | Clear rate limit cache                           |
| `/login`               | GET    | OAuth PKCE login page                            |
| `/oauth/callback`      | POST   | OAuth token exchange callback                    |
| `/settings`            | GET    | Model configuration UI (loopback only)           |
| `/settings/model`      | POST   | Save model settings (loopback only)              |

## Code Conventions

- **Language:** TypeScript (strict mode) — all source files are `.ts`
- **No linter/formatter configured** — rely on TypeScript strict checks via `bun run typecheck`
- **Imports:** Use `.ts` extensions in import paths (Bun bundler mode requires this)
- **No default exports** — use named exports everywhere
- **Co-located tests** — test files sit next to the modules they test with `.test.ts` suffix
- **No build artifacts** — Bun runs TypeScript directly, `noEmit: true` in tsconfig
- **File naming:** kebab-case for all source files (e.g., `model-settings-store.ts`)
- **Console logging:** Keep console output minimal (model, stream, tokens). Use `logger.verbose()` for detailed debug info that goes to `api.log` only.

## Database Schema

The SQLite database (`ccproxy.db`) has two tables:

**requests** — tracks every API request:

| Column                 | Type    | Description                                    |
| ---------------------- | ------- | ---------------------------------------------- |
| `id`                   | INTEGER | Auto-increment primary key                     |
| `timestamp`            | INTEGER | Unix timestamp (ms)                            |
| `model`                | TEXT    | Backend model used                             |
| `source`               | TEXT    | `'claude_code'` or `'error'`                   |
| `input_tokens`         | INTEGER | Total input tokens (uncached + cached)         |
| `output_tokens`        | INTEGER | Output tokens                                  |
| `cache_read_tokens`    | INTEGER | Tokens read from Anthropic prompt cache        |
| `cache_creation_tokens`| INTEGER | Tokens written to Anthropic prompt cache       |
| `stream`               | INTEGER | 0 or 1                                         |
| `latency_ms`           | INTEGER | Request latency (nullable)                     |
| `error`                | TEXT    | Error message (nullable)                       |

**model_settings** — persists model configuration (selected model, thinking enabled/effort).

## Windows Services (scripts/)

The `scripts/` directory contains Windows automation for running ccproxy and cloudflared as background services:

- `install-task.ps1` — Run as Administrator to register two Windows scheduled tasks (`ccproxy` and `cloudflared-tunnel`) that start on user login with automatic restart (3 retries)
- `.bat` files implement restart loops with crash recovery (5-second delay between restarts)
- `.vbs` files wrap the `.bat` launchers to run without a visible console window

To install the scheduled tasks:

```powershell
# Run as Administrator
powershell -ExecutionPolicy Bypass -File scripts/install-task.ps1
```

## Troubleshooting

- **Port in use:** If port 8082 is occupied, find the process with `netstat -ano | findstr :8082` and kill it, or set a different `PORT` in `.env`
- **Auth expired:** Visit `http://localhost:8082/login` to re-authenticate via OAuth
- **Rate limited:** Check `http://localhost:8082/rate-limit` for status. The cache uses soft expiry (5 min) and hard cap (15 min). Use `POST /rate-limit/reset` to clear manually
- **Settings page inaccessible:** The `/settings` route is restricted to loopback addresses — access it via `localhost`, not a tunnel URL
- **Cache not working:** Anthropic prompt caching requires at least 1024 tokens of content to trigger. Small requests won't produce cache hits. Check `cache_read_tokens` and `cache_creation_tokens` in the DB to verify caching is active.
