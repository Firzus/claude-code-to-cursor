# AGENTS.md

## Project Overview

ccproxy is a local OAuth proxy server that routes LLM API requests through Claude Code's OAuth authentication. Built with TypeScript on the Bun runtime, it accepts both native Anthropic (`/v1/messages`) and OpenAI-compatible (`/v1/chat/completions`) request formats, translating the latter to Anthropic's Messages API. Designed primarily to let Cursor IDE use Claude via Claude Code's OAuth tokens.

**Key technologies:** TypeScript (strict mode), Bun runtime, SQLite (Bun built-in), native `fetch()`. Zero external runtime dependencies.

## Setup Commands

```bash
bun install              # Install dev dependencies (@types/bun, typescript)
cp .env.example .env     # Create local config (optional, all vars have defaults)
bun run dev              # Start with hot reload (development)
bun run start            # Start in production mode
bun run typecheck        # TypeScript type checking (no emit)
```

After starting the server, authenticate by opening `http://localhost:8082/login` in a browser. This initiates the PKCE OAuth flow. Credentials are persisted to `~/.ccproxy/auth.json` and automatically refreshed.

## Development Workflow

- Entry point is `index.ts` — a Bun HTTP server on port 8082 (configurable via `PORT` env var)
- Routes are dispatched manually via pathname matching in `index.ts`, with handlers in `src/routes/`
- Hot reload is available via `bun run dev` (`bun --hot run index.ts`)
- Logging outputs to both console and `api.log` (50MB rolling, gitignored)
- The SQLite database `ccproxy.db` is auto-created on first run

### Environment Variables

All optional. See `.env.example` for full documentation.

| Variable                        | Default                    | Description                                                           |
| ------------------------------- | -------------------------- | --------------------------------------------------------------------- |
| `PORT`                          | `8082`                     | Server port                                                           |
| `ALLOWED_IPS`                   | Cursor backend IPs         | Comma-separated IP whitelist, or `"disabled"`                         |
| `CLAUDE_CODE_EXTRA_INSTRUCTION` | Headless proxy instruction | Extra system prompt appended to required Claude Code prefix           |
| `CCPROXY_DB_PATH`               | `./ccproxy.db`             | Path to SQLite analytics database                                     |

## Architecture

```
index.ts                    # Bun.serve entry point, route dispatch
src/
├── anthropic-client.ts     # Proxies to Anthropic API, OAuth token injection, rate limit cache, mcp_ tool prefixing
├── openai-adapter.ts       # Bidirectional OpenAI ↔ Anthropic format conversion
├── stream-handler.ts       # Anthropic SSE → OpenAI SSE stream transformation
├── oauth.ts                # PKCE OAuth flow, token refresh, credential persistence (~/.ccproxy/auth.json)
├── config.ts               # Constants (OAuth URLs, beta headers, user-agent) and runtime config
├── middleware.ts            # CORS headers, IP whitelist validation (CF tunnel aware)
├── model-parser.ts         # Model ID parsing, thinking effort extraction, exposed model list
├── db.ts                   # SQLite analytics database (Bun built-in), schema auto-init
├── logger.ts               # Dual console + file logger with auto-truncation
├── types.ts                # Shared TypeScript interfaces
├── html-templates.ts       # HTML pages for OAuth login flow UI
├── internal-tools.ts       # Extracts readable text from Claude Code internal tool calls
├── request-normalization.ts      # Model name and tool ID normalization/sanitization
├── request-normalization.test.ts # Bun tests for normalization (bun:test)
└── routes/
    ├── anthropic.ts        # POST /v1/messages (native Anthropic proxy)
    ├── openai.ts           # POST /v1/chat/completions (OpenAI-compatible)
    ├── models.ts           # GET /v1/models
    ├── analytics.ts        # GET /analytics, GET /analytics/requests, POST /analytics/reset
    └── auth.ts             # GET /login, POST /oauth/callback
```

### Request Flow

1. CORS preflight handling
2. IP whitelist check (enforced only for `/v1/` and `/analytics` paths, only when Cloudflare tunnel headers are present)
3. Route dispatch to handler
4. For API routes: OAuth bearer token injected, request forwarded to `https://api.anthropic.com`

### Inline Routes (in `index.ts`)

- `GET /` or `GET /health` — Health check with auth and rate limit status
- `GET /rate-limit` — Current rate limit cache status
- `POST /rate-limit/reset` — Manually clear rate limit cache

## Testing

Tests use Bun's built-in test runner (`bun:test`). Test files live alongside source files with the `.test.ts` suffix.

```bash
bun test                              # Run all tests
bun test src/request-normalization    # Run a specific test file
```

TypeScript strict mode (`bun run typecheck`) is also used for static analysis. For changes that aren't covered by tests, verify by:

1. Running `bun run typecheck` to catch type errors
2. Starting the server with `bun run dev` and testing endpoints manually
3. Checking `api.log` for detailed request/response logs

## Code Style

- **Runtime**: Bun exclusively — use `Bun.serve`, `Bun.file`, `Bun.write`, `bun:sqlite`. No Node-specific APIs beyond `node:os` and `node:path`.
- **No external dependencies**: Only `@types/bun` and `typescript` as dev/peer deps. Use native `fetch()` for HTTP calls.
- **TypeScript strict mode**: All strict flags enabled plus `noFallthroughCasesInSwitch`, `noUncheckedIndexedAccess`, `noImplicitOverride`.
- **No linter/formatter**: TypeScript strict mode is the sole static analysis tool.
- **Module system**: ESM (`"type": "module"`), `verbatimModuleSyntax` enabled — use `import type` for type-only imports.
- **File organization**: Route handlers in `src/routes/`, core logic in `src/`, entry point at root `index.ts`.
- **Error handling**: Return structured `AnthropicError` JSON responses. Use `satisfies` for type checking error shapes.

## Key Conventions

- **OAuth identity**: Requests to Anthropic must include the exact Claude Code system prompt prefix (`CLAUDE_CODE_SYSTEM_PROMPT` in `config.ts`) and specific beta headers, or the API will reject them. Do not modify these values.
- **Multi-model routing**: Multiple models are exposed to clients via `/v1/models`: the three base Anthropic models (`claude-opus-4-6`, `claude-sonnet-4-6`, `claude-haiku-4-5`), a thinking variant for each effort level (`-low-thinking`, `-medium-thinking`, `-high-thinking`), and the legacy `"Claude Code"` alias (maps to `claude-sonnet-4-6`). The incoming model name is parsed by `parseModelId()` in `src/model-parser.ts`; unknown models return a 400 error. Thinking effort can be encoded in the model name (e.g. `claude-opus-4-6-high-thinking`) and overrides the default thinking budget.
- **Tool name prefixing**: All tool names are prefixed with `mcp_` before sending to the Claude Code API (required for compatibility) and stripped back on response. This applies to `tools`, `tool_choice`, and tool use/result blocks in messages. See `prepareClaudeCodeBody()` and `stripMcpPrefixFromResponse()` in `anthropic-client.ts`.
- **Thinking tag filtering**: Claude may emit `<thinking>...</thinking>` tags in plain text. These are stripped in both streaming (state machine in `stream-handler.ts`) and non-streaming (`anthropicToOpenai()` regex in `openai-adapter.ts`) paths.
- **Rate limit caching**: 429 responses trigger a cache with soft expiry (5 min — allows one probe request through) and a hard cap (15 min maximum). Both values are hardcoded constants in `src/anthropic-client.ts`.
- **Logging**: Use the `logger` from `src/logger.ts`. It writes to both console and `api.log`. Use `logger.verbose()` for debug data that should only go to the log file.

## Build and Deployment

There is no build step — Bun runs TypeScript directly. For deployment:

- **Development**: `bun run dev` (hot reload)
- **Production**: `bun run start`
- **Windows deployment**: Scripts in `scripts/` handle Windows Scheduled Task registration and restart loops:
  - `scripts/install-task.ps1` — Registers Windows Scheduled Task
  - `scripts/run-ccproxy.bat` / `scripts/run-ccproxy.vbs` — Startup scripts
  - `scripts/run-cloudflared.bat` / `scripts/run-cloudflared.vbs` — Cloudflare tunnel scripts

## Debugging and Troubleshooting

- **Auth issues**: Check `~/.ccproxy/auth.json` exists and contains valid tokens. Re-authenticate via `http://localhost:<port>/login`.
- **Rate limits**: Check `GET /rate-limit` for current status. Use `POST /rate-limit/reset` to manually clear the cache. Soft expiry is hardcoded to 5 min, hard cap to 15 min (in `src/anthropic-client.ts`).
- **Request logs**: All requests are logged to `api.log` with timestamps. Verbose details (system prompts, tool lists) are logged via `logger.verbose()`.
- **Analytics**: Use `GET /analytics` for usage summary, `GET /analytics/requests` for recent request details.
- **Token refresh failures**: The server logs refresh attempts. If refresh fails, the user must re-authenticate via `/login`.
- **IP whitelist blocks**: Only enforced when Cloudflare tunnel headers (`CF-Ray`, `CF-Connecting-IP`) are present. Local requests bypass the whitelist. Set `ALLOWED_IPS=disabled` to allow all IPs.

## Files to Never Commit

- `.env` — Local environment configuration
- `~/.ccproxy/auth.json` — OAuth credentials
- `api.log`, `ccproxy-startup.log` — Log files
- `ccproxy.db` — SQLite analytics database
