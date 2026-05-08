// Spike: can we inject Cursor's custom tools via stream-json input?
// Send a user message that begs for tool use and inspect the response.
// Strategy 1: tools as part of the user message envelope.
// Strategy 2: tools as a separate top-level event.

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
    "You are a coding assistant. When the user asks to read a file, ALWAYS call the read_file tool. Do not respond with text.",
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

interface ResultEvent {
  type: "result";
  is_error: boolean;
  result: string;
}

function send(envelope: object): Promise<{
  result: ResultEvent;
  toolUseFound: boolean;
  textOutput: string;
  rawLines: string[];
}> {
  return new Promise((resolve) => {
    let toolUseFound = false;
    let textOutput = "";
    const rawLines: string[] = [];

    const handler = (line: string) => {
      rawLines.push(line);
      try {
        const obj = JSON.parse(line);
        if (obj.type === "stream_event") {
          if (
            obj.event?.type === "content_block_start" &&
            obj.event.content_block?.type === "tool_use"
          ) {
            toolUseFound = true;
          }
          if (
            obj.event?.type === "content_block_delta" &&
            obj.event.delta?.type === "text_delta"
          ) {
            textOutput += obj.event.delta.text;
          }
        }
        if (obj.type === "result") {
          const idx = lineHandlers.indexOf(handler);
          if (idx !== -1) lineHandlers.splice(idx, 1);
          resolve({ result: obj, toolUseFound, textOutput, rawLines });
        }
      } catch {
        // ignore
      }
    };
    lineHandlers.push(handler);

    proc.stdin.write(`${JSON.stringify(envelope)}\n`);
  });
}

async function main() {
  // Strategy 1: tools embedded in the user message.message
  console.log("\n=== Strategy 1: tools in message envelope ===");
  const r1 = await send({
    type: "user",
    message: {
      role: "user",
      content: "Please read the file at /tmp/foo.txt",
    },
    tools: [
      {
        name: "read_file",
        description: "Read a file from disk",
        input_schema: {
          type: "object",
          properties: { path: { type: "string" } },
          required: ["path"],
        },
      },
    ],
  });
  console.log(
    `  toolUse=${r1.toolUseFound}  text="${r1.textOutput.slice(0, 100)}"  err=${r1.result.is_error}`,
  );

  // Strategy 2: top-level "tools" event before user message
  console.log("\n=== Strategy 2: separate tools event ===");
  const toolsEvent = {
    type: "tools",
    tools: [
      {
        name: "read_file",
        description: "Read a file from disk",
        input_schema: {
          type: "object",
          properties: { path: { type: "string" } },
          required: ["path"],
        },
      },
    ],
  };
  proc.stdin.write(`${JSON.stringify(toolsEvent)}\n`);
  const r2 = await send({
    type: "user",
    message: { role: "user", content: "Please read /tmp/bar.txt" },
  });
  console.log(
    `  toolUse=${r2.toolUseFound}  text="${r2.textOutput.slice(0, 100)}"  err=${r2.result.is_error}`,
  );

  proc.stdin.end();
}

main().catch((err) => {
  console.error(err);
  proc.kill();
  process.exit(1);
});
