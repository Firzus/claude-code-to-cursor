/**
 * File-based logger with level filtering and numbered file rotation.
 * Uses buffered async writes to avoid blocking the event loop.
 *
 * Configuration (env vars):
 *   LOG_LEVEL        — minimum level to write: VERBOSE | DEBUG | INFO | WARN | ERROR (default: INFO)
 *   LOG_DIR          — directory for log files (default: cwd)
 *   LOG_MAX_SIZE_MB  — max size per log file in MB before rotation (default: 10)
 *   LOG_MAX_FILES    — number of rotated files to keep (default: 3)
 *   LOG_CONSOLE      — write to stdout/stderr too: true | false (default: true)
 *   LOG_RESET_ON_START — delete api.log on startup when "1"
 */

import { existsSync, renameSync, statSync, unlinkSync } from "node:fs";
import { appendFile } from "node:fs/promises";
import { basename, join } from "node:path";

const LOG_LEVELS = { VERBOSE: 0, DEBUG: 1, INFO: 2, WARN: 3, ERROR: 4 } as const;
type LogLevel = keyof typeof LOG_LEVELS;

const LOG_DIR = process.env.LOG_DIR || process.cwd();
const LOG_FILE = join(LOG_DIR, "api.log");
const LOG_BASE = join(LOG_DIR, basename("api", ".log"));

const MAX_SIZE = (Number.parseInt(process.env.LOG_MAX_SIZE_MB || "10", 10) || 10) * 1024 * 1024;
const MAX_FILES = Number.parseInt(process.env.LOG_MAX_FILES || "3", 10) || 3;
const CHECK_INTERVAL = 200;

const envLevel = (process.env.LOG_LEVEL?.toUpperCase() ?? "INFO") as LogLevel;
const currentLevel: number = LOG_LEVELS[envLevel] ?? LOG_LEVELS.INFO;

const logConsole = process.env.LOG_CONSOLE !== "false";

let writeCount = 0;
const writeQueue: string[] = [];
let flushing = false;

if (process.env.LOG_RESET_ON_START === "1" && existsSync(LOG_FILE)) {
  unlinkSync(LOG_FILE);
}

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= currentLevel;
}

function formatTimestamp(): string {
  return new Date().toISOString();
}

function formatMessage(level: string, message: string): string {
  return `[${formatTimestamp()}] [${level}] ${message}\n`;
}

function rotateIfNeeded(): void {
  writeCount++;
  if (writeCount % CHECK_INTERVAL !== 0) return;

  try {
    const { size } = statSync(LOG_FILE);
    if (size <= MAX_SIZE) return;

    for (let i = MAX_FILES; i >= 1; i--) {
      const from = i === 1 ? LOG_FILE : `${LOG_BASE}.${i - 1}.log`;
      const to = `${LOG_BASE}.${i}.log`;
      try {
        renameSync(from, to);
      } catch {}
    }
  } catch {}
}

async function flushQueue(): Promise<void> {
  if (flushing || writeQueue.length === 0) return;
  flushing = true;
  try {
    const batch = writeQueue.splice(0, writeQueue.length).join("");
    await appendFile(LOG_FILE, batch, "utf-8");
    rotateIfNeeded();
  } catch {}
  flushing = false;
  if (writeQueue.length > 0) flushQueue();
}

function write(formatted: string): void {
  writeQueue.push(formatted);
  flushQueue();
}

export const logger = {
  debug(message: string): void {
    if (!shouldLog("DEBUG")) return;
    write(formatMessage("DEBUG", message));
    if (logConsole) console.log(message);
  },

  info(message: string): void {
    if (!shouldLog("INFO")) return;
    write(formatMessage("INFO", message));
    if (logConsole) console.log(message);
  },

  warn(message: string): void {
    if (!shouldLog("WARN")) return;
    write(formatMessage("WARN", message));
    console.warn(message);
  },

  error(message: string): void {
    if (!shouldLog("ERROR")) return;
    write(formatMessage("ERROR", message));
    console.error(message);
  },

  verbose(message: string): void {
    if (!shouldLog("VERBOSE")) return;
    write(formatMessage("VERBOSE", message));
  },
};
