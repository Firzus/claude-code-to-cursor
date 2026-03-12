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
- `anthropic-client.ts` — Proxies to Anthropic API, injects OAuth bearer token and required system prompt prefix
- `openai-adapter.ts` — Bidirectional conversion between OpenAI chat format and Anthropic Messages format
- `stream-handler.ts` — Transforms Anthropic SSE streams into OpenAI-compatible SSE format
- `oauth.ts` — PKCE OAuth flow, token refresh, credential persistence to `~/.ccproxy/auth.json`
- `config.ts` — Constants (OAuth URLs, beta headers, user-agent) and runtime config from env vars
- `tool-call-translator.ts` — Converts Claude tool calls to Cursor-compatible format
- `middleware.ts` — CORS headers, IP whitelist validation
- `db.ts` — SQLite analytics database (Bun built-in), schema auto-initialization

**Routes** (`src/routes/`):
- `anthropic.ts` — `POST /v1/messages` (native Anthropic proxy)
- `openai.ts` — `POST /v1/chat/completions` (OpenAI-compatible endpoint)
- `models.ts` — `GET /v1/models` (available Claude models)
- `analytics.ts` — `GET /analytics`, `GET /analytics/requests`, `POST /analytics/reset`
- `auth.ts` — `GET /login`, `POST /oauth/callback`

## Key Conventions

- **Runtime**: Bun exclusively — uses Bun.serve, Bun SQLite, Bun file I/O. No Node-specific APIs beyond `node:os` and `node:path`.
- **No external dependencies**: Only `@types/bun` and `typescript` as dev/peer deps. HTTP calls use native `fetch()`.
- **OAuth identity**: Requests must include the exact Claude Code system prompt prefix and specific beta headers (`config.ts`) or the API will reject them.
- **Model normalization**: Both Anthropic format (`claude-opus-4-5-20250514`) and Cursor format (`claude-4.5-opus-high`) are supported and normalized internally.
- **Logging**: Dual output to console and `api.log` (50MB rolling). Logger in `src/logger.ts`.
- **Windows deployment**: Scripts in `scripts/` handle Windows Scheduled Task registration and restart loops.

## Authentication

To authenticate the proxy, open `http://localhost:8082/login` in a browser. This initiates the PKCE OAuth flow with Claude Code's OAuth provider. After successful login, credentials are persisted to `~/.ccproxy/auth.json` and automatically refreshed.

## Environment Variables

See `.env.example`. Key vars: `PORT`, `ALLOWED_IPS` (comma-separated or `"disabled"`), `CLAUDE_CODE_EXTRA_INSTRUCTION`.
