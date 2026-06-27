import fs from "node:fs";
import path from "node:path";

fs.mkdirSync(path.resolve("logs"), { recursive: true });
const logFile = path.resolve("logs", `${new Date().toISOString().slice(0, 10)}.log`);

function write(level: string, message: string, details?: unknown): void {
  const suffix = details === undefined ? "" : ` ${safe(details)}`;
  const line = `${new Date().toISOString()} [${level}] ${message}${suffix}`;
  console.log(line);
  fs.appendFileSync(logFile, `${line}\n`);
}

function safe(value: unknown): string {
  const text = value instanceof Error ? value.stack ?? value.message : JSON.stringify(value);
  return text.replace(/(api[_-]?key|password|authorization)["']?\s*[:=]\s*["']?[^"',\s]+/gi, "$1=[REDACTED]");
}

export const logger = {
  info: (message: string, details?: unknown) => write("INFO", message, details),
  warn: (message: string, details?: unknown) => write("WARN", message, details),
  error: (message: string, details?: unknown) => write("ERROR", message, details)
};
