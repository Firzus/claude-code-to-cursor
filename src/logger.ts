/**
 * File-based logger for verbose API request/response logging
 */

import { existsSync, unlinkSync, appendFileSync } from "node:fs";
import { join } from "node:path";

const LOG_FILE = join(process.cwd(), "api.log");

// Clear log file on module load (server start)
if (existsSync(LOG_FILE)) {
  unlinkSync(LOG_FILE);
}

function formatTimestamp(): string {
  const now = new Date();
  return now.toISOString();
}

function formatMessage(level: string, message: string): string {
  return `[${formatTimestamp()}] [${level}] ${message}\n`;
}

export const logger = {
  debug(message: string): void {
    const formatted = formatMessage("DEBUG", message);
    appendFileSync(LOG_FILE, formatted, "utf-8");
    console.log(message); // Also log to console
  },

  info(message: string): void {
    const formatted = formatMessage("INFO", message);
    appendFileSync(LOG_FILE, formatted, "utf-8");
    console.log(message); // Also log to console
  },

  warn(message: string): void {
    const formatted = formatMessage("WARN", message);
    appendFileSync(LOG_FILE, formatted, "utf-8");
    console.warn(message); // Also log to console
  },

  error(message: string): void {
    const formatted = formatMessage("ERROR", message);
    appendFileSync(LOG_FILE, formatted, "utf-8");
    console.error(message); // Also log to console
  },

  verbose(message: string): void {
    // Verbose logs only go to file, not console
    const formatted = formatMessage("VERBOSE", message);
    appendFileSync(LOG_FILE, formatted, "utf-8");
  },
};

