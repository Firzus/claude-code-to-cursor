# Claude Code to Cursor

[![CI](https://img.shields.io/github/actions/workflow/status/your-org/claude-code-to-cursor/ci.yml?style=flat-square&label=CI)](https://github.com/your-org/claude-code-to-cursor/actions)
![Bun](https://img.shields.io/badge/Bun-1.x-f9f1e1?style=flat-square&logo=bun)
![Next.js](https://img.shields.io/badge/Next.js-16-000?style=flat-square&logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178c6?style=flat-square&logo=typescript&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-003B57?style=flat-square&logo=sqlite&logoColor=white)

A self-hosted proxy that routes Cursor IDE traffic through **Claude Code's OAuth session**, exposing both Anthropic (`/v1/messages`) and OpenAI-compatible (`/v1/chat/completions`) endpoints. Ships with a Next.js dashboard for analytics, auth, settings, and plan-usage monitoring.

[Features](#features) · [Architecture](#architecture) · [Getting Started](#getting-started) · [Configuration](#configuration) · [API Endpoints](#api-endpoints) · [Dashboard](#dashboard) · [Docker Deployment](#docker-deployment) · [Tech Stack](#tech-stack)

## Features

- **Dual API compatibility** — serves both Anthropic Messages API and OpenAI Chat Completions API from a single proxy
- **Claude Code OAuth** — authenticates via Claude Code's PKCE OAuth flow; the dashboard handles login and token refresh
- **Analytics dashboard** — real-time overview of requests, errors, timelines, plan usage, and budget tracking
- **Model routing** — configurable model selection and thinking-effort levels per request
- **IP whitelisting** — restrict API access to known Cursor backend IPs or your own allow-list
- **Rate limiting** — built-in rate-limit tracking with auto-backoff and cache cleanup
- **Cloudflare tunnel** — production ingress through a Cloudflare tunnel for secure, public-facing access
- **SQLite persistence** — lightweight storage for request logs, settings, and analytics via `bun:sqlite`
- **Event-loop monitoring** — detects and reports event-loop lag to keep streaming responsive
- **Docker-ready** — full `docker compose` stack with API, frontend, and Cloudflare tunnel containers

## Architecture

```
┌─────────────┐      ┌──────────────────┐      ┌───────────────────┐
│  Cursor IDE  │─────▶│  Cloudflare      │─────▶│  cctc-api (Bun)   │
│  (client)    │      │  Tunnel          │      │  :8082            │
└─────────────┘      └──────────────────┘      └────────┬──────────┘
                                                        │
                                          ┌─────────────┼─────────────┐
                                          ▼             ▼             ▼
                                   ┌──────────┐  ┌──────────┐  ┌──────────┐
                                   │ Anthropic │  │  SQLite  │  │ Frontend │
                                   │ API       │  │  (cctc   │  │ Next.js  │
                                   │           │  │   .db)   │  │ :3111    │
                                   └──────────┘  └──────────┘  └──────────┘
```

The **API server** (`index.ts`) is a flat routing table built on `Bun.serve`. It proxies requests to the Anthropic API using an OAuth token, rewrites model names for the client, and records every request in SQLite. The **frontend** is a Next.js 16 App Router application that reads from the same API to display dashboards.

## Getting Started

### Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| [Bun](https://bun.sh) | 1.x | Backend runtime |
| [Node.js](https://nodejs.org) | 22+ | Frontend runtime |
| [pnpm](https://pnpm.io) | 10+ | Frontend package manager |

### Local development

1. **Clone and install**

```bash
git clone https://github.com/your-org/claude-code-to-cursor.git
cd claude-code-to-cursor
bun install
cd frontend && pnpm install && cd ..
```

2. **Configure environment**

```bash
cp .env.example .env
# Edit .env — see Configuration section below
```

3. **Start the API**

```bash
bun run dev
```

The proxy starts on `http://localhost:8082`. A `/health` endpoint confirms it's running.

4. **Start the dashboard** (in a separate terminal)

```bash
cd frontend && pnpm run dev
```

The dashboard opens at `http://localhost:3111`. On first visit, it redirects to the welcome/auth page if no OAuth session exists.

> [!IMPORTANT]
> A **Cloudflare tunnel** is required for Cursor to reach the proxy in production. For local development, you can point Cursor directly at `http://localhost:8082`.

### Authenticate

Open the dashboard, navigate to the **Auth** page, and complete the Claude Code OAuth login. The proxy stores tokens in `~/.cctc/auth.json` (or `CCTC_AUTH_DIR` in Docker).

## Configuration

All settings are read from environment variables. Copy `.env.example` as a starting point:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8082` | API server port |
| `ALLOWED_IPS` | Cursor backend IPs | Comma-separated IP whitelist. Set to `disabled` to allow all |
| `CCTC_AUTH_DIR` | `~/.cctc` | OAuth token storage directory |
| `CCTC_DB_PATH` | `./cctc.db` | SQLite database path |
| `LOG_LEVEL` | `INFO` | `VERBOSE`, `DEBUG`, `INFO`, `WARN`, `ERROR` |
| `LOG_DIR` | `.` | Log files directory |
| `LOG_MAX_SIZE_MB` | `10` | Max log file size before rotation |
| `LOG_MAX_FILES` | `3` | Number of rotated log files to keep |
| `LOG_CONSOLE` | `true` | Also write logs to stdout |
| `SETTINGS_API_KEY` | _(empty)_ | Shared secret for settings API access from frontend |
| `FRONTEND_PORT` | `3111` | Dashboard port |
| `CLOUDFLARE_TUNNEL_TOKEN` | _(required in prod)_ | Cloudflare tunnel token |
| `CLOUDFLARE_TUNNEL_URL` | — | Public tunnel URL shown in the setup wizard |
| `CCTC_MAX_UPSTREAM_CONCURRENCY` | `3` | Max concurrent requests to Anthropic API |

## API Endpoints

### Proxy routes

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/v1/messages` | Anthropic Messages API proxy |
| `POST` | `/v1/chat/completions` | OpenAI-compatible Chat Completions proxy |
| `GET` | `/v1/models` | List available models |

### Internal routes

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check (DB, OAuth, rate-limit status) |
| `GET` | `/analytics` | Summary analytics |
| `GET` | `/analytics/requests` | Request log with pagination |
| `GET` | `/analytics/errors` | Error log |
| `GET` | `/analytics/timeline` | Time-series data |
| `DELETE` | `/analytics/reset` | Reset analytics data |
| `GET/PUT` | `/api/settings` | Proxy settings (model, thinking effort) |
| `GET/PUT` | `/api/budget` | Budget tracking |
| `GET` | `/api/plan-usage` | Claude plan usage snapshot |
| `POST` | `/api/auth/login` | Start OAuth PKCE flow |
| `GET` | `/api/auth/callback` | OAuth callback handler |
| `GET` | `/api/auth/status` | Auth status check |

## Dashboard

The Next.js frontend provides four main pages:

| Page | Path | Description |
|------|------|-------------|
| **Overview** | `/` | Health status, plan usage, today's stats, recent requests |
| **Usage** | `/usage` | Detailed analytics with timeline charts and error breakdown |
| **Integrations** | `/integrations` | Cursor configuration guide and connection setup |
| **Preferences** | `/preferences` | Model selection, thinking effort, and budget settings |

On first launch, the app redirects to `/welcome` for the OAuth setup flow.

## Docker Deployment

The `docker-compose.yml` defines three services:

| Service | Image | Port |
|---------|-------|------|
| `api` | `oven/bun:1` | `8082` |
| `frontend` | `node:22-alpine` | `3111` |
| `cloudflared` | `cloudflare/cloudflared` | — |

```bash
# Build all images
docker compose build

# Start the stack
docker compose up -d

# View logs
docker compose logs -f

# Stop
docker compose down
```

> [!NOTE]
> You **must** set `CLOUDFLARE_TUNNEL_TOKEN` in your `.env` before starting the Docker stack. The tunnel is mandatory for production use.

Data is persisted in a named Docker volume (`cctc-data`) mounted at `/data` in the API container, holding the SQLite database, logs, and OAuth tokens.

## Tech Stack

**Backend**
- [Bun](https://bun.sh) — runtime, HTTP server, SQLite driver
- TypeScript (strict mode)
- [Biome](https://biomejs.dev) — linter and formatter

**Frontend**
- [Next.js 16](https://nextjs.org) — App Router, React Server Components
- [React 19](https://react.dev)
- [Tailwind CSS v4](https://tailwindcss.com)
- [Radix UI](https://www.radix-ui.com) + shadcn/ui components
- [SWR](https://swr.vercel.app) — data fetching
- [Recharts](https://recharts.org) — analytics charts
- [GSAP](https://gsap.com) — animations
- [Zod](https://zod.dev) — schema validation

**Infrastructure**
- [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) — secure ingress
- [Docker Compose](https://docs.docker.com/compose/) — container orchestration
- [GitHub Actions](https://github.com/features/actions) — CI pipeline
