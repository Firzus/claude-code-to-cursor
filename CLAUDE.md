# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is ccproxy

A Bun-based HTTP proxy that routes Anthropic API requests through a Claude Code OAuth subscription, with automatic fallback to a direct API key when subscription limits are hit (429/403). It exposes both Anthropic-native (`/v1/messages`) and OpenAI-compatible (`/v1/chat/completions`) endpoints, making it usable with Cursor IDE and similar tools.

## Commands

```bash
bun run index.ts          # Start the proxy (port 8082)
bun --hot run index.ts    # Start with hot reload (dev)
bunx tsc --noEmit         # Type check (strict mode, has known errors in openai-adapter.ts)
bun test                  # Run tests
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
  oauth.ts                  ← Token loading (macOS Keychain or file), refresh, caching
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
- `reasoning_budget` must be stripped from requests before sending to Claude Code API
- `cache_control.ttl` must be stripped (Claude Code API doesn't accept it)
- Token refresh uses a 5-minute expiry buffer

## Environment variables

See `.env.example`. Key ones: `ANTHROPIC_API_KEY` (fallback), `PORT` (default 8082), `CLAUDE_CODE_FIRST` (default true), `OPENAI_API_KEY` (for non-Claude models), `ALLOWED_IPS` (comma-separated, or `"disabled"`).
