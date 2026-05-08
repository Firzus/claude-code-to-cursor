// Spike: long-running `claude` process with stream-json input/output.
// Goal: send multiple prompts to a single process, measure latency for each.
// If first req has cold-start cost but subsequent reqs are fast, this is our path.

import { spawn } from "node:child_process";

const proc = spawn(
  "claude",
  [
    "-p",
    "--input-format",
    "stream-json",
    "--output-format",
    "stream-json",
    "--include-partial-messages",
    "--verbose",
    "--model",
    "claude-haiku-4-5",
    "--tools",
    "",
  ],
  { stdio: ["pipe", "pipe", "pipe"] },
);

let buf = "";
const lineHandlers: Array<(line: string) => void> = [];

proc.stdout.on("data", (chunk: Buffer) => {
  buf += chunk.toString("utf8");
  let idx: number;
  // biome-ignore lint/suspicious/noAssignInExpressions: idiomatic line buffer drain
  while ((idx = buf.indexOf("\n")) !== -1) {
    const line = buf.slice(0, idx).trim();
    buf = buf.slice(idx + 1);
    if (!line) continue;
    for (const h of lineHandlers) h(line);
  }
});

proc.stderr.on("data", (chunk: Buffer) => {
  process.stderr.write(`[claude stderr] ${chunk.toString("utf8")}`);
});

proc.on("exit", (code) => {
  console.log(`[claude exit] code=${code}`);
  process.exit(code ?? 0);
});

interface ResultEvent {
  type: "result";
  subtype: string;
  is_error: boolean;
  duration_ms: number;
  duration_api_ms: number;
  result: string;
}

function send(prompt: string): Promise<{ wallMs: number; result: ResultEvent }> {
  return new Promise((resolve) => {
    const start = performance.now();
    let firstStreamEventAt: number | null = null;

    const handler = (line: string) => {
      try {
        const obj = JSON.parse(line);
        if (firstStreamEventAt === null && obj.type === "stream_event") {
          firstStreamEventAt = performance.now();
          console.log(
            `  [first stream_event] +${(firstStreamEventAt - start).toFixed(0)}ms`,
          );
        }
        if (obj.type === "result") {
          const wallMs = performance.now() - start;
          const idx = lineHandlers.indexOf(handler);
          if (idx !== -1) lineHandlers.splice(idx, 1);
          resolve({ wallMs, result: obj as ResultEvent });
        }
      } catch {
        // ignore non-json lines
      }
    };
    lineHandlers.push(handler);

    const userMsg = {
      type: "user",
      message: { role: "user", content: prompt },
    };
    proc.stdin.write(`${JSON.stringify(userMsg)}\n`);
  });
}

async function main() {
  const prompts = [
    "Reply with exactly: A",
    "Reply with exactly: B",
    "Reply with exactly: C",
  ];
  for (let i = 0; i < prompts.length; i++) {
    console.log(`\n=== Turn ${i + 1}: "${prompts[i]}" ===`);
    const { wallMs, result } = await send(prompts[i]);
    console.log(
      `  wall=${wallMs.toFixed(0)}ms  api=${result.duration_api_ms}ms  cli=${result.duration_ms}ms  result="${result.result}"  err=${result.is_error}`,
    );
  }
  proc.stdin.end();
}

main().catch((err) => {
  console.error(err);
  proc.kill();
  process.exit(1);
});
