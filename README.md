# claude-code-to-cursor

A self-hosted Next.js 16 proxy that routes Cursor IDE traffic through your
Claude Code OAuth session. Exposes both Anthropic (`/v1/messages`) and
OpenAI-compatible (`/v1/chat/completions`) endpoints, plus a dashboard for
analytics, auth, and plan-usage. Persistence is self-hosted Convex; public
ingress is a Cloudflare tunnel.

This is a personal tool meant to run on your own laptop. There is no
production deployment, no SaaS, no other consumers. The Cloudflare tunnel
exists so Cursor's backend (which runs on AWS) can reach the proxy on
your machine.

---

## Architecture

```
Cursor (Cursor's AWS backend)
       │
       ▼
https://your-tunnel.example.com   ← Cloudflare tunnel (cloudflared)
       │
       ▼
http://host.docker.internal:3111  ← reaches the host
       │
       ▼
pnpm run dev (Next.js, port 3111) ← the app, where you edit code
       │
       ▼
http://127.0.0.1:3210             ← self-hosted Convex (docker)
```

Three things run in Docker (Convex backend, Convex admin UI, cloudflared
tunnel). The Next.js app runs on the host with hot reload.

---

## Setup (first time)

### 1. Prerequisites

- Docker Desktop (or Docker Engine + Compose)
- Node 22 + pnpm 10 (`corepack enable && corepack prepare pnpm@10 --activate`)
- A Cloudflare account with a tunnel set up — copy the tunnel token

### 2. Clone & install

```bash
git clone <your-repo>
cd claude-code-to-cursor
pnpm install
```

### 3. Environment

Create `.env` from the template:

```bash
cp .env.example .env
```

Fill in:

- `CLOUDFLARE_TUNNEL_TOKEN` — from Cloudflare Zero Trust
- `CONVEX_INSTANCE_SECRET` — generate once and never lose it:

  ```bash
  openssl rand -hex 32
  ```

`CONVEX_SELF_HOSTED_URL` defaults to `http://127.0.0.1:3210` — leave it.

### 4. Bring up Convex and generate the admin key

```bash
docker compose up -d convex convex-dashboard
docker compose exec convex ./generate_admin_key.sh
```

Copy the printed key to `.env`:

```
CONVEX_SELF_HOSTED_ADMIN_KEY=cctc|...
```

Also create `.env.local` with the same two Convex vars (Next.js reads
`.env.local` for client-bundled values):

```
CONVEX_SELF_HOSTED_URL=http://127.0.0.1:3210
CONVEX_SELF_HOSTED_ADMIN_KEY=cctc|...
NEXT_PUBLIC_CONVEX_URL=http://127.0.0.1:3210
```

### 5. Push the Convex schema and functions

```bash
pnpm run convex:deploy
```

### 6. Configure the Cloudflare tunnel (one-time)

Cloudflare Zero Trust → Networks → Tunnels → your tunnel → Public Hostnames.
Add or edit your hostname:

- **Service**: `http://host.docker.internal:3111`

Save. Never touched again.

### 7. Start everything

```bash
pnpm dev
```

That single script runs `docker compose up -d` (Convex + tunnel) then
`next dev -p 3111` (the app with hot reload).

### 8. Authenticate with Claude

Open <http://localhost:3111/integrations> and log in via the OAuth flow.
Tokens land in the Convex `oauthTokens` table.

### 9. Configure Cursor

Cursor → Settings → Models → Add custom OpenAI provider:

- **Base URL**: `https://your-tunnel.example.com/v1` (your Cloudflare hostname)
- **API key**: any non-empty string (auth happens via OAuth + IP whitelist)
- **Model**: `claude` (lowercase, case-sensitive)

In a Cursor chat, pick `claude`. Your prompts route through the tunnel to
your local proxy and back.

---

## Daily workflow

```bash
pnpm dev    # docker stack + dev server
# ... code, save, browser auto-reloads, Cursor requests hit live code
```

When you're done:

```bash
# stop the dev server (Ctrl-C in its terminal)
pnpm down
```

Useful URLs while running:

| URL | What |
|---|---|
| http://localhost:3111 | The app (dashboard + API) |
| http://localhost:6791 | Convex admin UI (browse data) |
| https://your-tunnel.example.com | Same app, reached over the tunnel |

---

## Running in production mode (detached)

If you don't plan to edit code (e.g. you cloned the repo on a different
machine, or you want a process that keeps running without a terminal
window open), skip `pnpm dev` and do this once after setup steps 1–6:

```bash
pnpm start       # docker compose --profile prod up -d --build
```

That builds the production image and brings up the full stack — Convex,
tunnel, AND a containerized Next.js app — all detached. You can close
the terminal and the app keeps running. Docker auto-restarts it on crash
or reboot.

```bash
pnpm logs        # follow the app's logs (Ctrl-C to detach)
pnpm down        # stop everything
```

When you pull new code:

```bash
pnpm start       # rebuilds the image and re-launches (--build flag)
```

### Dev vs prod cheat sheet

| | `pnpm dev` | `pnpm start` |
|---|---|---|
| Where the app runs | Foreground on the host | Detached docker container |
| Need terminal open | Yes (Ctrl-C kills it) | No |
| Hot reload | Yes (Turbopack) | No |
| Auto-restart on crash | No | Yes (Docker) |
| Survives reboot | No | Yes (`restart: unless-stopped`) |
| Iteration speed | Instant | ~15s rebuild per change |

Both modes use the same Cloudflare tunnel target
(`host.docker.internal:3111`), so Cursor BYOK works identically.

---

## Troubleshooting

**`Provider Error -- We're having trouble finding the resource you requested`** in Cursor
- Cursor is hitting `/v1/...` but the path no longer exists. The app
  rewrites `/v1/* → /api/v1/*` internally, so the legacy URL still works.
  If you see this, double-check the Cloudflare service is set to
  `http://host.docker.internal:3111` and that `pnpm run dev` is running.

**`User API Key Rate limit exceeded`** in Cursor
- Not a real rate limit. It's a generic Cursor client-side mapping for any
  `ConnectError [invalid_argument]` returned by their AI transport. The
  request often never even reaches the proxy. Known Cursor bug, tracked on
  their forum (search "User API Key Rate limit").

**Tunnel returns 502**
- The tunnel target (`host.docker.internal:3111`) is unreachable. Either
  `pnpm run dev` isn't running, or it's running on a different port.

**Convex CLI complains about missing admin key**
- Make sure `CONVEX_SELF_HOSTED_URL` and `CONVEX_SELF_HOSTED_ADMIN_KEY`
  are set in `.env.local` (the file the Next.js dev server reads).

---

## Repository layout

```
app/                      Next.js App Router (UI + API Route Handlers)
  api/                    /api/v1/* (Cursor-facing) + /api/* (dashboard)
components/               UI (radix + shadcn)
convex/                   Convex schema + queries/mutations
hooks/                    React hooks
lib/                      Shared utilities + lib/server/ (server-only)
public/                   Static assets
scripts/                  Standalone scripts (e2e smoke tests, tooling)

docker-compose.yml        3 services: convex, convex-dashboard, cloudflared
next.config.ts            includes the /v1/* → /api/v1/* rewrite
.env / .env.example       runtime config
AGENTS.md                 contributor guide for AI agents
```
