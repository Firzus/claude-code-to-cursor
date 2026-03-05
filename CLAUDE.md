# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is ccproxy

A Bun-based HTTP proxy that routes Anthropic API requests through a Claude Code OAuth subscription, with automatic fallback to a direct API key when subscription limits are hit (429/403). It exposes both Anthropic-native (`/v1/messages`) and OpenAI-compatible (`/v1/chat/completions`) endpoints, making it usable with Cursor IDE and similar tools.

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
index.ts                    ← HTTP server (Bun.serve), routing, IP whitelist, streaming
src/
  config.ts                 ← Env vars, OAuth constants, Claude Code system prompt
  oauth.ts                  ← OAuth PKCE login, token exchange, refresh, persistence (~/.ccproxy/auth.json)
  anthropic-client.ts       ← Core proxy: Claude Code request → fallback to API key
  openai-adapter.ts         ← OpenAI ↔ Anthropic format conversion (messages, tools, streaming)
  openai-passthrough.ts     ← Direct forwarding for non-Claude models (GPT, Gemini, etc.)
  tool-call-translator.ts   ← Fixes Claude Code tool call XML to Cursor's expected format
  db.ts                     ← SQLite analytics: request logging, budget enforcement, cost tracking
  pricing.ts                ← Per-model token cost calculations
  logger.ts                 ← File logger with auto-truncation (50 MB api.log, 5 MB startup log)
  types.ts                  ← Shared type definitions
scripts/                    ← Windows automation (bat/ps1/vbs for auto-restart, task scheduler)
```

## Request flow

1. Request hits `index.ts` → IP whitelist check (via `cf-connecting-ip` for Cloudflare tunnels)
2. For `/v1/chat/completions`: OpenAI format converted to Anthropic via `openai-adapter.ts`
3. Non-Claude models (GPT, Gemini) routed directly to OpenAI/OpenRouter via `openai-passthrough.ts`
4. Claude requests go through `anthropic-client.ts`:
   - Tries Claude Code OAuth first (requires system prompt prefix + beta headers)
   - On 429/403, falls back to direct `ANTHROPIC_API_KEY`
   - Rate limit results are cached to skip Claude Code temporarily
5. Response streamed back; tool calls translated via `tool-call-translator.ts`
6. Request recorded in SQLite for analytics/budget tracking

## Key constraints

- The Claude Code system prompt in `config.ts` (`CLAUDE_CODE_SYSTEM_PROMPT`) must start with the exact string `"You are Claude Code, Anthropic's official CLI for Claude."` — this is required for OAuth to work
- Beta headers (`CLAUDE_CODE_BETA_HEADERS`) must include both `claude-code-20250219` and `oauth-2025-04-20`
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
- `GET /budget` — Budget settings
- `POST /budget` — Update budget settings (budget only applies to API key requests, not Claude Code)

## Streaming pipeline (OpenAI-compatible)

The streaming path in `index.ts` is the most complex part of the codebase. It reads Anthropic SSE events (`content_block_start`, `content_block_delta`, `message_delta`, etc.) and converts them to OpenAI `chat.completion.chunk` SSE format in real-time. Key behaviors:
- Accumulates text to detect and translate XML tool calls mid-stream
- Converts Anthropic `tool_use` content blocks into OpenAI `tool_calls` delta format
- Emits a usage chunk with token counts before `[DONE]` when `stream_options.include_usage` is set
- Handles `thinking` blocks by silently consuming them (not forwarded to client)

## Environment variables

See `.env.example`. Key ones: `ANTHROPIC_API_KEY` (fallback), `PORT` (default 8082), `CLAUDE_CODE_FIRST` (default true), `OPENAI_API_KEY` (for non-Claude models), `ALLOWED_IPS` (comma-separated, or `"disabled"`).
