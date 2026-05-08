// Spike: override system prompt + measure cache_creation_input_tokens.
// Goal: verify that --system-prompt replaces Claude Code's massive default,
// dropping the 46k-token first-call cost.

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
    "--system-prompt",
    "You are a helpful assistant. Reply concisely.",
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

proc.on("exit", (code) => console.log(`[claude exit] code=${code}`));

interface MessageStartEvent {
  usage?: {
    input_tokens?: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
}

function send(prompt: string): Promise<{ wallMs: number; usage: MessageStartEvent["usage"] }> {
  return new Promise((resolve) => {
    const start = performance.now();
    let messageStartUsage: MessageStartEvent["usage"];

    const handler = (line: string) => {
      try {
        const obj = JSON.parse(line);
        if (
          obj.type === "stream_event" &&
          obj.event?.type === "message_start" &&
          obj.event.message?.usage
        ) {
          messageStartUsage = obj.event.message.usage;
        }
        if (obj.type === "result") {
          const wallMs = performance.now() - start;
          const idx = lineHandlers.indexOf(handler);
          if (idx !== -1) lineHandlers.splice(idx, 1);
          resolve({ wallMs, usage: messageStartUsage });
        }
      } catch {
        // ignore
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
  const prompts = ["Say A", "Say B"];
  for (let i = 0; i < prompts.length; i++) {
    console.log(`\n=== Turn ${i + 1}: "${prompts[i]}" ===`);
    const { wallMs, usage } = await send(prompts[i]);
    console.log(`  wall=${wallMs.toFixed(0)}ms`);
    console.log(`  input_tokens=${usage?.input_tokens ?? "?"}`);
    console.log(`  cache_creation=${usage?.cache_creation_input_tokens ?? 0}`);
    console.log(`  cache_read=${usage?.cache_read_input_tokens ?? 0}`);
  }
  proc.stdin.end();
}

main().catch((err) => {
  console.error(err);
  proc.kill();
  process.exit(1);
});
