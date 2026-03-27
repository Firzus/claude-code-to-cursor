---
name: restart-ccproxy-services
description: Verifies ccproxy and cloudflared health on Windows, restarts them safely, and re-verifies. Use when the user asks to restart local services, the OAuth proxy, the Cloudflare tunnel, to check ccproxy/cloudflared status, or says "redémarrer les services" in this repository context.
---

# Restart ccproxy + cloudflared (Windows)

## Scope

This workflow applies to **this repo** on **Windows**: Bun `ccproxy` (default port from `PORT` env, else **8082**) and **cloudflared** started via `scripts/run-cloudflared.bat` or Scheduled Task `cloudflared-tunnel`.

The agent should **run the checks and commands** (shell/PowerShell), not only describe them.

## 1. Baseline health (before any restart)

### ccproxy

1. Resolve port: `PORT` from `.env` if present, else **8082**.
2. Confirm listener: `netstat -ano` (or equivalent) shows `LISTENING` on that port; note the **PID**.
3. HTTP check (must succeed if server is up):

   ```bash
   curl -sS "http://localhost:<PORT>/health"
   ```

4. Interpret JSON:
   - `status`: `"ok"` is healthy; `"rate_limited"` means proxy is up but Anthropic path may be short-circuited — note in the report, still a **running** service.
   - `claudeCode.authenticated`: `false` means OAuth missing/expired — **do not** treat as “server down”; tell the user to open `loginUrl` from the response or `http://localhost:<PORT>/login`.
   - Connection refused / timeout → ccproxy is **down** or wrong port.

### cloudflared

1. Process:

   ```powershell
   Get-Process cloudflared -ErrorAction SilentlyContinue | Select-Object Id, ProcessName
   ```

2. If troubleshooting tunnel errors, tail the log at repo root: `cloudflared-startup.log` (see `scripts/run-cloudflared.bat` for paths).

### Summarize before restart

Report: port/PID, health JSON summary, cloudflared PID (or absent). Only proceed to restart if the user asked for restart **or** a check shows a required fix (e.g. dead process).

## 2. Restart procedures

### ccproxy (development: Cursor/shell)

1. From repo root, stop the listener: `taskkill //PID <pid> //F` (PID from `netstat`), or kill the Bun process holding the port.
2. Start again:

   ```bash
   bun run dev
   ```

   Run in background if the user wants a long-running server from the agent session.

### ccproxy (Scheduled Task)

Task name: **`ccproxy`** (see `scripts/install-task.ps1`).

```bat
schtasks /End /TN ccproxy
schtasks /Run /TN ccproxy
```

Prefer this when the user relies on login startup tasks rather than a manual `bun run dev`.

### cloudflared

- If **`run-cloudflared.bat`** (or VBS wrapper) is already running in a loop, stopping `cloudflared.exe` alone triggers restart after ~5s:

  ```bash
  taskkill //IM cloudflared.exe //F
  ```

- Or use the task:

  ```bat
  schtasks /End /TN cloudflared-tunnel
  schtasks /Run /TN cloudflared-tunnel
  ```

Wait **~5–10s** after cloudflared kill before post-checks (tunnel process respawn).

## 3. Post-restart verification

Repeat **section 1** in full:

- `curl` `/health` → expect HTTP 200 and interpret `status` + `claudeCode.authenticated`.
- `Get-Process cloudflared` → process present if tunnel should run.
- Confirm `netstat` shows the expected port **LISTENING** with a new PID if ccproxy was restarted.

Report clearly: what changed (old vs new PID), auth state, rate limit state.

## 4. Pitfalls

- **Do not** assume failure if `authenticated` is false — only fix via `/login`.
- **`cmd.exe` piping** with `findstr` from Git Bash can misbehave; use `netstat -ano` and grep, or PowerShell `Get-NetTCPConnection`.
- Two ccproxy instances: ensure only **one** listener on the configured port before starting another.

## 5. Optional deep checks (on user request)

- `GET http://localhost:<PORT>/rate-limit` — rate limit cache detail.
- `api.log` / `ccproxy-startup.log` / `cloudflared-startup.log` — for errors after restart.
