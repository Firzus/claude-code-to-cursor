/**
 * File-based logger for verbose API request/response logging
 * Auto-truncates when file exceeds MAX_LOG_SIZE_MB (keeps recent half).
 */

import {
  existsSync,
  unlinkSync,
  appendFileSync,
  statSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

const LOG_FILE = join(process.cwd(), "api.log");
const MAX_LOG_SIZE_MB = 50;
const MAX_LOG_SIZE = MAX_LOG_SIZE_MB * 1024 * 1024;
const CHECK_INTERVAL = 200;

let writeCount = 0;

if (existsSync(LOG_FILE)) {
  unlinkSync(LOG_FILE);
}

function formatTimestamp(): string {
  return new Date().toISOString();
}

function formatMessage(level: string, message: string): string {
  return `[${formatTimestamp()}] [${level}] ${message}\n`;
}

function trimLogIfNeeded(): void {
  writeCount++;
  if (writeCount % CHECK_INTERVAL !== 0) return;

  try {
    const { size } = statSync(LOG_FILE);
    if (size <= MAX_LOG_SIZE) return;

    const keepBytes = Math.floor(MAX_LOG_SIZE / 2);
    const buf = readFileSync(LOG_FILE);
    const start = buf.length - keepBytes;
    const newlineIdx = buf.indexOf(0x0a, start);
    const trimmed =
      newlineIdx !== -1 ? buf.subarray(newlineIdx + 1) : buf.subarray(start);

    const header = `[${formatTimestamp()}] [INFO] --- Log truncated (exceeded ${MAX_LOG_SIZE_MB} MB, kept recent ${Math.round(trimmed.length / 1024 / 1024)} MB) ---\n`;
    writeFileSync(LOG_FILE, header + trimmed.toString("utf-8"), "utf-8");
  } catch {}
}

function write(formatted: string): void {
  appendFileSync(LOG_FILE, formatted, "utf-8");
  trimLogIfNeeded();
}

export const logger = {
  debug(message: string): void {
    write(formatMessage("DEBUG", message));
    console.log(message);
  },

  info(message: string): void {
    write(formatMessage("INFO", message));
    console.log(message);
  },

  warn(message: string): void {
    write(formatMessage("WARN", message));
    console.warn(message);
  },

  error(message: string): void {
    write(formatMessage("ERROR", message));
    console.error(message);
  },

  verbose(message: string): void {
    write(formatMessage("VERBOSE", message));
  },
};

