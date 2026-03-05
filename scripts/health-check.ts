#!/usr/bin/env bun
/**
 * Health check script for ccproxy services
 * Usage: bun run scripts/health-check.ts
 */

import { join } from "node:path";
import { homedir } from "node:os";
import { existsSync, statSync } from "node:fs";

const PORT = process.env.PORT || "8082";
const BASE_URL = `http://localhost:${PORT}`;
const CREDENTIALS_PATH = join(homedir(), ".claude", ".credentials.json");
const DB_PATH = process.env.CCPROXY_DB_PATH || "./ccproxy.db";
const LOG_FILE = "./api.log";
const STARTUP_LOG = "./ccproxy-startup.log";

type CheckResult = {
  name: string;
  status: "OK" | "WARN" | "FAIL";
  detail: string;
};

const results: CheckResult[] = [];

function ok(name: string, detail: string) {
  results.push({ name, status: "OK", detail });
}
function warn(name: string, detail: string) {
  results.push({ name, status: "WARN", detail });
}
function fail(name: string, detail: string) {
  results.push({ name, status: "FAIL", detail });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  return `${(ms / 3_600_000).toFixed(1)}h`;
}

// ── 1. Process running (port listening) ──────────────────────────
async function checkProcess() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${BASE_URL}/health`, { signal: controller.signal });
    clearTimeout(timeout);
    if (res.ok) {
      ok("Process", `Listening on port ${PORT}`);
    } else {
      fail("Process", `Port ${PORT} responded with ${res.status}`);
    }
    return res.ok ? await res.json() : null;
  } catch (e: any) {
    fail("Process", `Not reachable on port ${PORT} (${e.code || e.message})`);
    return null;
  }
}

// ── 2. OAuth credentials ────────────────────────────────────────
async function checkCredentials(healthData: any) {
  // File exists?
  if (!existsSync(CREDENTIALS_PATH)) {
    fail("OAuth File", `Not found: ${CREDENTIALS_PATH}`);
    return;
  }

  try {
    const creds = await Bun.file(CREDENTIALS_PATH).json();
    if (!creds?.claudeAiOauth) {
      fail("OAuth File", "File exists but missing claudeAiOauth field");
      return;
    }
    ok("OAuth File", CREDENTIALS_PATH);

    // Token expiry
    const { expiresAt } = creds.claudeAiOauth;
    const now = Date.now();
    const bufferMs = 5 * 60 * 1000;

    if (now >= expiresAt) {
      fail("Token Expiry", `Expired ${formatDuration(now - expiresAt)} ago — needs refresh`);
    } else if (now >= expiresAt - bufferMs) {
      warn("Token Expiry", `Expires in ${formatDuration(expiresAt - now)} (within refresh buffer)`);
    } else {
      ok("Token Expiry", `Valid for ${formatDuration(expiresAt - now)}`);
    }
  } catch {
    fail("OAuth File", "Failed to parse credentials JSON");
  }

  // Runtime auth status from /health
  if (healthData?.claudeCode) {
    if (healthData.claudeCode.authenticated) {
      ok("OAuth Runtime", "Authenticated (token loaded in proxy)");
    } else {
      warn("OAuth Runtime", "Not authenticated at runtime");
    }
  }
}

// ── 3. API key fallback ─────────────────────────────────────────
function checkApiKeyFallback(healthData: any) {
  if (healthData?.fallback) {
    ok("API Key Fallback", "ANTHROPIC_API_KEY configured");
  } else {
    warn("API Key Fallback", "No ANTHROPIC_API_KEY — no fallback if OAuth fails");
  }
}

// ── 4. Database ─────────────────────────────────────────────────
async function checkDatabase() {
  if (!existsSync(DB_PATH)) {
    fail("Database", `Not found: ${DB_PATH}`);
    return;
  }

  const stat = statSync(DB_PATH);
  ok("Database File", `${DB_PATH} (${formatBytes(stat.size)})`);

  // Try to query analytics
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${BASE_URL}/analytics?period=day`, { signal: controller.signal });
    clearTimeout(timeout);

    if (res.ok) {
      const data = (await res.json()) as { totalRequests: number; claudeCodeRequests: number; apiKeyRequests: number };
      ok("Database Query", `Today: ${data.totalRequests} requests, ${data.claudeCodeRequests} via OAuth, ${data.apiKeyRequests} via API key`);
    } else {
      warn("Database Query", `Analytics endpoint returned ${res.status}`);
    }
  } catch {
    warn("Database Query", "Could not reach analytics endpoint");
  }
}

// ── 5. Budget ───────────────────────────────────────────────────
async function checkBudget() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${BASE_URL}/budget`, { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) return;
    const budget = (await res.json()) as { enabled: boolean; hourlyLimit?: number; dailyLimit?: number; monthlyLimit?: number };

    if (!budget.enabled) {
      ok("Budget", "No budget limits configured");
      return;
    }

    const limits: string[] = [];
    if (budget.hourlyLimit) limits.push(`$${budget.hourlyLimit}/h`);
    if (budget.dailyLimit) limits.push(`$${budget.dailyLimit}/d`);
    if (budget.monthlyLimit) limits.push(`$${budget.monthlyLimit}/mo`);
    ok("Budget", `Limits: ${limits.join(", ") || "none set"}`);
  } catch {
    // Not critical if proxy is down — already caught by process check
  }
}

// ── 6. Models endpoint ──────────────────────────────────────────
async function checkModels() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${BASE_URL}/v1/models`, { signal: controller.signal });
    clearTimeout(timeout);

    if (res.ok) {
      const data = (await res.json()) as { data?: unknown[] };
      const count = data?.data?.length || 0;
      ok("Models Endpoint", `${count} models available`);
    } else {
      warn("Models Endpoint", `Returned ${res.status}`);
    }
  } catch {
    warn("Models Endpoint", "Not reachable");
  }
}

// ── 7. OpenAI passthrough ───────────────────────────────────────
function checkOpenAIPassthrough(healthData: any) {
  if (!healthData?.openaiPassthrough) return;

  const { enabled, baseUrl } = healthData.openaiPassthrough;
  if (enabled) {
    ok("OpenAI Passthrough", `Enabled → ${baseUrl}`);
  } else {
    ok("OpenAI Passthrough", "Disabled (no OPENAI_API_KEY)");
  }
}

// ── 8. Log files ────────────────────────────────────────────────
function checkLogFiles() {
  for (const [label, path] of [["API Log", LOG_FILE], ["Startup Log", STARTUP_LOG]] as const) {
    if (existsSync(path)) {
      const stat = statSync(path);
      const age = Date.now() - stat.mtimeMs;
      const ageStr = formatDuration(age);
      ok(label, `${formatBytes(stat.size)}, last write ${ageStr} ago`);
    } else {
      ok(label, "Not created yet");
    }
  }
}

// ── 9. Streaming test (lightweight) ─────────────────────────────
async function checkStreaming() {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const res = await fetch(`${BASE_URL}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        messages: [{ role: "user", content: "Reply with exactly: OK" }],
        max_tokens: 10,
        stream: true,
        stream_options: { include_usage: true },
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      const err = await res.text();
      warn("Streaming Test", `${res.status}: ${err.slice(0, 100)}`);
      return;
    }

    const text = await res.text();
    const lines = text.split("\n").filter((l) => l.startsWith("data: "));
    const hasUsage = lines.some((l) => {
      if (l === "data: [DONE]") return false;
      try {
        const chunk = JSON.parse(l.slice(6));
        return chunk.usage && chunk.usage.prompt_tokens > 0;
      } catch {
        return false;
      }
    });

    if (hasUsage) {
      ok("Streaming + Usage", `Working (${lines.length} SSE chunks, usage reported)`);
    } else if (lines.length > 1) {
      warn("Streaming + Usage", `Streaming works but no usage chunk found`);
    } else {
      warn("Streaming + Usage", "Response received but unexpected format");
    }
  } catch (e: any) {
    if (e.name === "AbortError") {
      warn("Streaming Test", "Timed out after 10s");
    } else {
      warn("Streaming Test", `Error: ${e.message}`);
    }
  }
}

// ── Main ────────────────────────────────────────────────────────
async function main() {
  const skipLive = process.argv.includes("--skip-live");

  console.log("╔══════════════════════════════════════════╗");
  console.log("║       ccproxy health check               ║");
  console.log("╚══════════════════════════════════════════╝\n");

  // Static checks (always run)
  checkLogFiles();

  // Live checks (need running proxy)
  const healthData = await checkProcess();
  await checkCredentials(healthData);

  if (healthData) {
    checkApiKeyFallback(healthData);
    checkOpenAIPassthrough(healthData);
    await checkDatabase();
    await checkBudget();
    await checkModels();

    if (!skipLive) {
      console.log("  Running live streaming test...");
      await checkStreaming();
    }
  } else {
    // Offline — just check DB file
    if (existsSync(DB_PATH)) {
      const stat = statSync(DB_PATH);
      ok("Database File", `${DB_PATH} (${formatBytes(stat.size)}) — proxy offline, can't query`);
    } else {
      warn("Database File", `Not found: ${DB_PATH}`);
    }
  }

  // ── Print results ──────────────────────────────────────────
  console.log("");
  const icons = { OK: "✅", WARN: "⚠️", FAIL: "❌" };
  const maxName = Math.max(...results.map((r) => r.name.length));

  for (const r of results) {
    const icon = icons[r.status];
    const name = r.name.padEnd(maxName);
    console.log(`  ${icon} ${name}  ${r.detail}`);
  }

  // Summary
  const counts = { OK: 0, WARN: 0, FAIL: 0 };
  for (const r of results) counts[r.status]++;

  console.log(`\n  ── Summary: ${counts.OK} passed, ${counts.WARN} warnings, ${counts.FAIL} failures ──\n`);

  if (counts.FAIL > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Health check crashed:", err);
  process.exit(2);
});
