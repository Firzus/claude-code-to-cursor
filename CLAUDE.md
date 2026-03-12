# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ccproxy is a local OAuth proxy server (TypeScript, Bun runtime) that routes LLM API requests through Claude Code's OAuth authentication. It accepts both native Anthropic (`/v1/messages`) and OpenAI-compatible (`/v1/chat/completions`) request formats, translating the latter to Anthropic's Messages API. Designed primarily to let Cursor IDE use Claude via Claude Code's OAuth tokens.

## Commands

```bash
bun run dev          # Start with hot reload
bun run start        # Production start
bun run typecheck    # TypeScript type checking (no emit)
```

No test framework is configured. No linter/formatter is configured — TypeScript strict mode is the primary code quality tool.

## Architecture

**Entry point**: `index.ts` — Bun HTTP server on port 8082 (configurable via `PORT` env var). Routes are dispatched manually via pathname matching.

**Request flow**:
1. CORS preflight → IP whitelist check (for `/v1/` and `/analytics` paths)
2. Route dispatch to handler in `src/routes/`
3. For API routes: OAuth token injected via `src/anthropic-client.ts`, request forwarded to `https://api.anthropic.com`

**Key modules** (`src/`):
- `anthropic-client.ts` — Proxies to Anthropic API, injects OAuth bearer token and required system prompt prefix. Rate limit cache with soft expiry and configurable max duration. Prefixes all tool names with `mcp_` before sending to the API and strips the prefix from responses.
- `openai-adapter.ts` — Bidirectional conversion between OpenAI chat format and Anthropic Messages format. Handles model name normalization, reasoning/thinking conversion, non-Claude model mapping (GPT/Gemini → Claude), and OpenAI Responses API `input` field aliasing.
- `stream-handler.ts` — Transforms Anthropic SSE streams into OpenAI-compatible SSE format
- `oauth.ts` — PKCE OAuth flow, token refresh, credential persistence to `~/.ccproxy/auth.json`
- `config.ts` — Constants (OAuth URLs, beta headers, user-agent) and runtime config from env vars
- `middleware.ts` — CORS headers, IP whitelist validation
- `db.ts` — SQLite analytics database (Bun built-in), schema auto-initialization
- `types.ts` — Shared TypeScript interfaces for Anthropic request/response types, OAuth tokens, and config
- `html-templates.ts` — HTML pages for the OAuth login flow UI

**Routes** (`src/routes/`):
- `anthropic.ts` — `POST /v1/messages` (native Anthropic proxy)
- `openai.ts` — `POST /v1/chat/completions` (OpenAI-compatible endpoint)
- `models.ts` — `GET /v1/models` (available Claude models)
- `analytics.ts` — `GET /analytics`, `GET /analytics/requests`, `POST /analytics/reset`
- `auth.ts` — `GET /login`, `POST /oauth/callback`

**Inline routes** (in `index.ts`):
- `GET /health` or `GET /` — Health check with auth and rate limit status
- `GET /rate-limit` — Current rate limit cache status
- `POST /rate-limit/reset` — Manually clear the rate limit cache

## Key Conventions

- **Runtime**: Bun exclusively — uses Bun.serve, Bun SQLite, Bun file I/O. No Node-specific APIs beyond `node:os` and `node:path`.
- **No external dependencies**: Only `@types/bun` and `typescript` as dev/peer deps. HTTP calls use native `fetch()`.
- **OAuth identity**: Requests must include the exact Claude Code system prompt prefix and specific beta headers (`config.ts`) or the API will reject them.
- **Model normalization**: Cursor format (`claude-4.6-opus-high`) is normalized to Anthropic format (`claude-opus-4-6`). Non-Claude models (GPT, Gemini, o1/o3) are mapped to `claude-sonnet-4-6`. The `-thinking` suffix and `reasoning_effort` field control extended thinking (budget: high=16384, medium=8192, low=4096 tokens).
- **Tool name prefixing**: All tool names are prefixed with `mcp_` before sending to the Claude Code API (required for compatibility) and stripped back on response. This applies to `tools`, `tool_choice`, and tool blocks in messages.
- **Logging**: Dual output to console and `api.log` (50MB rolling). Logger in `src/logger.ts`.
- **Windows deployment**: Scripts in `scripts/` handle Windows Scheduled Task registration and restart loops.

## Authentication

To authenticate the proxy, open `http://localhost:8082/login` in a browser. This initiates the PKCE OAuth flow with Claude Code's OAuth provider. After successful login, credentials are persisted to `~/.ccproxy/auth.json` and automatically refreshed.

## Environment Variables

See `.env.example`. Key vars: `PORT`, `ALLOWED_IPS` (comma-separated or `"disabled"`), `CLAUDE_CODE_EXTRA_INSTRUCTION`, `RATE_LIMIT_MAX_CACHE_SECONDS` (default 900 = 15 min), `RATE_LIMIT_SOFT_SECONDS` (default 300 = 5 min).
