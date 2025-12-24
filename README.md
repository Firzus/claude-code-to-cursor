# ccproxy

A local proxy that routes Anthropic API requests through your Claude Code subscription first, then falls back to direct API when limits are hit. Includes analytics, cost tracking, and budget controls.

## Why?

Claude Pro/Max subscriptions via Claude Code are significantly cheaper than direct API usage. This proxy lets you use your subscription in tools like Cursor that expect an Anthropic or OpenAI-compatible API.

## Prerequisites

1. **Claude Code CLI** installed and authenticated:

   ```bash
   # Install Claude Code
   npm install -g @anthropic-ai/claude-code

   # Login (opens browser for OAuth)
   claude /login
   ```

2. **Bun** runtime:
   ```bash
   curl -fsSL https://bun.sh/install | bash
   ```

## Setup

```bash
# Install dependencies
bun install

# Run the proxy
bun run index.ts
```

The proxy starts on `http://localhost:8082` by default.

## Configuration

Environment variables:

| Variable                        | Default             | Description                                      |
| ------------------------------- | ------------------- | ------------------------------------------------ |
| `PORT`                          | `8082`              | Port to run the proxy on                         |
| `ANTHROPIC_API_KEY`             | -                   | Fallback API key when Claude Code limits are hit |
| `CLAUDE_CODE_FIRST`             | `true`              | Set to `false` to use direct API only            |
| `CLAUDE_CODE_EXTRA_INSTRUCTION` | _(headless prompt)_ | Extra instruction appended to system prompt      |
| `CCPROXY_DB_PATH`               | `./ccproxy.db`      | Path to SQLite database                          |

Example with fallback:

```bash
ANTHROPIC_API_KEY=sk-ant-xxx bun run index.ts
```

## Usage in Cursor

1. Open Cursor Settings → Models
2. For **Anthropic** provider:
   - Set **API Base URL**: `http://localhost:8082`
   - Set **API Key**: `proxy` (any value works)
3. For **OpenAI** provider:
   - Set **API Base URL**: `http://localhost:8082`
   - Set **API Key**: `proxy` (any value works)
4. Select your model (e.g., `claude-sonnet-4-20250514`)

## How It Works

```
┌─────────────┐     ┌───────────┐     ┌──────────────────┐
│   Cursor    │────▶│  ccproxy  │────▶│ Claude Code OAuth│
│  (client)   │     │           │     │  (subscription)  │
└─────────────┘     └─────┬─────┘     └──────────────────┘
                          │
                          │ fallback (429/403)
                          ▼
                    ┌──────────────────┐
                    │  Anthropic API   │
                    │  (direct, paid)  │
                    └──────────────────┘
```

1. Requests come in via Anthropic (`/v1/messages`) or OpenAI (`/v1/chat/completions`) endpoints
2. Proxy adds required headers and system prompt to identify as Claude Code
3. If Claude Code rate limits (429) or errors (403), falls back to direct API
4. All requests are logged to SQLite for analytics and cost tracking
5. Budget limits can block API key usage when thresholds are exceeded

### OAuth Token Lifecycle

- **Access tokens** expire after ~4 hours
- **Refresh tokens** are long-lived (months)
- The proxy **automatically refreshes** access tokens using the refresh token
- You only need to re-login (`claude /login`) if the refresh token expires or is revoked
- Tokens are read from macOS Keychain (or `~/.claude/.credentials.json` as fallback)

### Claude Code Identification

For requests to be accepted as Claude Code, the proxy adds:

1. Required beta headers: `claude-code-20250219`, `oauth-2025-04-20`
2. Required system prompt: `"You are Claude Code, Anthropic's official CLI for Claude."`
3. Bearer token authentication with the OAuth access token

## API Endpoints

### Proxy Endpoints

| Endpoint               | Method | Description                   |
| ---------------------- | ------ | ----------------------------- |
| `/v1/messages`         | POST   | Anthropic Messages API        |
| `/v1/chat/completions` | POST   | OpenAI Chat Completions API   |
| `/v1/models`           | GET    | List available models         |
| `/health`              | GET    | Health check with auth status |

### Analytics Endpoints

| Endpoint              | Method | Description                                             |
| --------------------- | ------ | ------------------------------------------------------- |
| `/analytics`          | GET    | Usage stats (add `?period=hour\|day\|week\|month\|all`) |
| `/analytics/requests` | GET    | Recent requests (add `?limit=N`)                        |
| `/budget`             | GET    | Current budget settings                                 |
| `/budget`             | POST   | Update budget settings                                  |

### Analytics Example

```bash
# Get daily analytics
curl http://localhost:8082/analytics

# Response:
{
  "period": "day",
  "totalRequests": 42,
  "claudeCodeRequests": 38,
  "apiKeyRequests": 4,
  "errorRequests": 0,
  "totalInputTokens": 125000,
  "totalOutputTokens": 45000,
  "estimatedApiKeyCost": 1.23,
  "estimatedSavings": 12.45,  // What Claude Code requests would have cost
  "note": "Costs are estimates. Actual costs may be lower due to prompt caching."
}
```

### Budget Controls

```bash
# Set spending limits (only applies to API key fallback)
curl -X POST http://localhost:8082/budget \
  -H "Content-Type: application/json" \
  -d '{
    "hourlyLimit": 50,
    "weeklyLimit": 300,
    "enabled": true
  }'
```

When budget is exceeded, API key requests return 429 (Claude Code requests still work).

## Cost Estimation

Pricing used for estimates (per million tokens):

| Model             | Input  | Output |
| ----------------- | ------ | ------ |
| Claude Opus 4.5   | $5.00  | $25.00 |
| Claude Opus 4/4.1 | $15.00 | $75.00 |
| Claude Sonnet 4.x | $3.00  | $15.00 |
| Claude Haiku 4.5  | $1.00  | $5.00  |

**Note**: Actual costs may be lower due to prompt caching. These are maximum estimates.

## Troubleshooting

**"No Claude Code credentials found"**
Run `claude /login` to authenticate with your Anthropic account.

**"Token invalid" errors**
Your refresh token may have expired. Run `claude /login` again.

**Requests always falling back to API**

- Check if your Claude Code subscription has usage limits
- The proxy falls back when it receives 429 or 403 responses
- View `/analytics` to see request sources

**"Budget exceeded" errors**
Your API key spending limit was reached. Either:

- Wait for the time period to reset
- Increase limits via `POST /budget`
- Disable budget controls: `{"enabled": false}`

## Development

```bash
# Run with hot reload
bun --hot run index.ts

# Type check
bunx tsc --noEmit

# View database
sqlite3 ccproxy.db "SELECT * FROM requests ORDER BY timestamp DESC LIMIT 10;"
```

## License

MIT
