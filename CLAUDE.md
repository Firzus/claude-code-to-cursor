# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is ccproxy

A Bun-based HTTP proxy that routes Anthropic API requests through a Claude Code OAuth subscription. It exposes both Anthropic-native (`/v1/messages`) and OpenAI-compatible (`/v1/chat/completions`) endpoints, making it usable with Cursor IDE and similar tools.

## Commands

```bash
bun run index.ts          # Start the proxy (port 8082)
bun --hot run index.ts    # Start with hot reload (dev)
bunx tsc --noEmit         # Type check (strict mode, has known errors in openai-adapter.ts)
bun test                  # Run tests (no test files currently exist)
```

## Bun-only — no Node/npm/vite

- Use `bun` / `bun install` / `bun run` / `bunx` exclusively
- Bun auto-loads `.env` — no dotenv
- Use Bun built-in APIs: `Bun.serve()`, `Bun.file()`, `bun:sqlite`, `Bun.spawn()`
- No runtime npm dependencies — everything uses Bun's built-in APIs
- Don't use express, ws, better-sqlite3, pg, ioredis, or vite

## Architecture

```
index.ts                        ← HTTP server (Bun.serve), routing, bootstrap (~140 lines)
src/
  config.ts                     ← Env vars, OAuth constants, Claude Code system prompt
  oauth.ts                      ← OAuth PKCE login, token exchange, refresh, persistence (~/.ccproxy/auth.json)
  anthropic-client.ts           ← Core proxy: Claude Code OAuth request, rate limit caching
  openai-adapter.ts             ← OpenAI ↔ Anthropic format conversion (messages, tools, streaming)
  stream-handler.ts             ← SSE streaming pipeline: Anthropic events → OpenAI chunks
  tool-call-translator.ts       ← Fixes Claude Code tool call XML to Cursor's expected format
  middleware.ts                 ← IP whitelist, request logging, header extraction, CORS
  html-templates.ts             ← OAuth login page and result page HTML
  db.ts                         ← SQLite analytics: request logging, cost tracking
  pricing.ts                    ← Per-model token cost calculations
  logger.ts                     ← File logger with auto-truncation (50 MB api.log, 5 MB startup log)
  types.ts                      ← Shared type definitions
  routes/
    anthropic.ts                ← Handler for POST /v1/messages
    openai.ts                   ← Handler for POST /v1/chat/completions
    models.ts                   ← Handler for GET /v1/models
    analytics.ts                ← Handlers for /analytics endpoints
    auth.ts                     ← Handlers for /login and /oauth/callback + PKCE store
scripts/                        ← Windows automation (bat/ps1 for auto-restart, task scheduler)
```

## Request flow

1. Request hits `index.ts` → IP whitelist check (via `cf-connecting-ip` for Cloudflare tunnels)
2. For `/v1/chat/completions`: OpenAI format converted to Anthropic via `openai-adapter.ts`
3. All requests go through `anthropic-client.ts` → Claude Code OAuth (requires system prompt prefix + beta headers)
4. Rate limit results are cached to skip retries temporarily
5. Response streamed back via `stream-handler.ts`; tool calls translated via `tool-call-translator.ts`
6. Request recorded in SQLite for analytics

## Key constraints

- The Claude Code system prompt in `config.ts` (`CLAUDE_CODE_SYSTEM_PROMPT`) must start with the exact string `"You are Claude Code, Anthropic's official CLI for Claude."` — this is required for OAuth to work
- Beta headers (`CLAUDE_CODE_BETA_HEADERS`) must include both `oauth-2025-04-20` and `interleaved-thinking-2025-05-14`
- `reasoning_budget` is converted to `thinking: { type: "enabled", budget_tokens: N }` with `temperature: 1` (required by the API for extended thinking)
- `cache_control.ttl` must be stripped (Claude Code API doesn't accept it)
- OAuth credentials are stored in `~/.ccproxy/auth.json` (not Claude Code's credentials)
- Token refresh persists rotated tokens to disk (no 5-minute buffer, exact expiry like OpenCode)
- `api.log` is deleted and recreated each time the proxy starts (see `logger.ts`)
- The `User-Agent` header is centralized as `CLAUDE_CODE_USER_AGENT` in `config.ts`

## Model name normalization

`openai-adapter.ts` handles two key model transformations:

1. **Cursor format → Anthropic format** (`normalizeModelName`): `claude-4.5-opus-high-thinking` → `claude-opus-4-5` with `thinking.budget_tokens=16384`. The `-thinking` suffix enables extended thinking; without it, budget suffixes like `-high` are ignored.

2. **Non-Claude → Claude mapping** (`mapModelToClaude`): GPT, Gemini, o1/o3/o4 models are all mapped to `claude-sonnet-4-5`. This allows Cursor's "Override Base URL" to work regardless of model selection.

## API endpoints

- `POST /v1/messages` — Anthropic-native proxy
- `POST /v1/chat/completions` — OpenAI-compatible proxy (converts formats)
- `GET /v1/models` — Lists available models (both Anthropic and Cursor formats)
- `GET /health` or `GET /` — Health check / status (includes `loginUrl` if not authenticated)
- `GET /login` — OAuth PKCE login page (generates auth URL, accepts code via form)
- `POST /oauth/callback` — Receives authorization code from login form, exchanges for tokens
- `GET /analytics?period=day|hour|week|month|all` — Usage analytics
- `GET /analytics/requests?limit=100` — Recent request log
- `POST /analytics/reset` — Clear analytics data

## Streaming pipeline (OpenAI-compatible)

The streaming logic lives in `stream-handler.ts`. It reads Anthropic SSE events (`content_block_start`, `content_block_delta`, `message_delta`, etc.) and converts them to OpenAI `chat.completion.chunk` SSE format in real-time. Key behaviors:

- Accumulates text to detect and translate XML tool calls mid-stream
- Converts Anthropic `tool_use` content blocks into OpenAI `tool_calls` delta format
- Emits a usage chunk with token counts before `[DONE]` when `stream_options.include_usage` is set
- Handles `thinking` blocks by silently consuming them (not forwarded to client)

## Environment variables

See `.env.example`. Key ones: `PORT` (default 8082), `ALLOWED_IPS` (comma-separated, or `"disabled"`), `CLAUDE_CODE_EXTRA_INSTRUCTION` (optional headless mode prompt).

## Windows service management

The proxy and tunnel run as Windows scheduled tasks triggered at logon. Each task uses a VBScript wrapper (`.vbs`) to launch the `.bat` script invisibly (no terminal window):

- **`ccproxy`** — `run-ccproxy.vbs` → `run-ccproxy.bat` (kills stale bun on :8082, restart loop, logs to `ccproxy-startup.log`)
- **`cloudflared-tunnel`** — `run-cloudflared.vbs` → `run-cloudflared.bat` (restart loop, logs to `cloudflared-startup.log`)

```powershell
# Install/update both tasks (run as Administrator)
powershell -ExecutionPolicy Bypass -File scripts\install-task.ps1

# Manual start
schtasks /Run /TN ccproxy && schtasks /Run /TN cloudflared-tunnel

# Check status
powershell -Command "Get-ScheduledTask -TaskName ccproxy,cloudflared-tunnel | Select TaskName,State"
```

Log files are locked by the bat wrappers (stdout redirect) — to clean them, kill the cmd/bun/cloudflared processes first, delete the `.log` files, then restart the tasks.
