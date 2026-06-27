import "dotenv/config";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { URL } from "node:url";
import type { AppConfig } from "./types.js";
import { loadConfig } from "./config.js";
import { AppDatabase } from "./db.js";
import { createDigest } from "./digest.js";
import { logger } from "./logger.js";
import { discoverChats, loginFromUi, scan } from "./whatsapp/scanner.js";

const host = "127.0.0.1";
const port = Number(process.env.UI_PORT ?? 3210);
const configPath = path.resolve("config.json");
const webRoot = path.resolve("src", "web");
let busy = false;
let lastStatus = "Ready";

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://${host}:${port}`);
  try {
    if (url.pathname === "/api/config" && request.method === "GET") return json(response, 200, readConfig());
    if (url.pathname === "/api/config" && request.method === "POST") {
      const body = await readBody(request);
      fs.writeFileSync(configPath, `${JSON.stringify(body, null, 2)}\n`);
      lastStatus = "Configuration saved";
      return json(response, 200, { ok: true });
    }
    if (url.pathname === "/api/status") return json(response, 200, { busy, status: lastStatus });
    if (url.pathname === "/api/secrets" && request.method === "POST") {
      const body = await readBody(request) as { openrouterKey?: string; resendKey?: string };
      updateSecret("OPENROUTER_API_KEY", body.openrouterKey);
      updateSecret("RESEND_API_KEY", body.resendKey);
      lastStatus = "API keys saved locally";
      return json(response, 200, { ok: true });
    }
    if (url.pathname === "/api/latest-digest" && request.method === "GET") {
      const config = loadConfig();
      const db = new AppDatabase(config);
      try {
        return json(response, 200, db.getLatestDigest());
      } finally {
        db.close();
      }
    }
    if (url.pathname.startsWith("/api/run/") && request.method === "POST") {
      if (busy) return json(response, 409, { error: "Another task is already running" });
      const action = url.pathname.split("/").pop() ?? "";
      void runAction(action);
      return json(response, 202, { ok: true, status: `Started ${action}` });
    }
    return serveStatic(url.pathname, response);
  } catch (error) {
    logger.error("UI request failed", error);
    return json(response, 500, { error: error instanceof Error ? error.message : String(error) });
  }
});

async function runAction(action: string): Promise<void> {
  busy = true;
  lastStatus = `${action} running…`;
  let db: AppDatabase | undefined;
  try {
    const config = loadConfig();
    if (action === "login") await loginFromUi(config);
    else if (action === "discover") {
      const chats = await discoverChats(config);
      fs.mkdirSync(path.resolve("data"), { recursive: true });
      fs.writeFileSync(path.resolve("data", "discovered-chats.json"), JSON.stringify(chats));
    } else {
      db = new AppDatabase(config);
      if (action === "scan") await scan(config, db);
      else if (action === "digest") await createDigest(config, db);
      else if (action === "job") {
        const result = await scan(config, db);
        if (result.messagesFound === 0) {
          throw new Error("Scan opened the selected chats but found no visible messages; digest was not generated.");
        }
        await createDigest(config, db);
      } else if (action === "clear") {
        const count = db.clearMessages();
        lastStatus = `Deleted ${count} stored messages`;
        return;
      } else throw new Error(`Unknown action: ${action}`);
    }
    lastStatus = `${action} completed`;
  } catch (error) {
    lastStatus = `${action} failed: ${error instanceof Error ? error.message : String(error)}`;
    logger.error(lastStatus, error);
  } finally {
    db?.close();
    busy = false;
  }
}

function readConfig(): AppConfig {
  const source = fs.existsSync(configPath) ? configPath : path.resolve("config.example.json");
  return JSON.parse(fs.readFileSync(source, "utf8")) as AppConfig;
}

function updateSecret(name: string, value?: string): void {
  if (!value?.trim()) return;
  const envPath = path.resolve(".env");
  const existing = fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "";
  const line = `${name}=${value.trim()}`;
  const pattern = new RegExp(`^${name}=.*$`, "m");
  const updated = pattern.test(existing)
    ? existing.replace(pattern, line)
    : `${existing.trimEnd()}\n${line}\n`;
  fs.writeFileSync(envPath, updated);
  process.env[name] = value.trim();
}

async function readBody(request: http.IncomingMessage): Promise<unknown> {
  let body = "";
  for await (const chunk of request) body += chunk;
  return JSON.parse(body);
}

function json(response: http.ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(value));
}

function serveStatic(urlPath: string, response: http.ServerResponse): void {
  const file = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, "");
  if (file === "api/discovered") {
    const discovered = path.resolve("data", "discovered-chats.json");
    return json(response, 200, fs.existsSync(discovered) ? JSON.parse(fs.readFileSync(discovered, "utf8")) : []);
  }
  const full = path.resolve(webRoot, file);
  if (!full.startsWith(webRoot) || !fs.existsSync(full)) {
    response.writeHead(404); response.end("Not found"); return;
  }
  const type = file.endsWith(".css") ? "text/css" : file.endsWith(".js") ? "text/javascript" : "text/html";
  response.writeHead(200, { "Content-Type": `${type}; charset=utf-8` });
  response.end(fs.readFileSync(full));
}

server.listen(port, host, () => {
  logger.info(`Dashboard available at http://${host}:${port}`);
  console.log(`\nOpen http://${host}:${port} in your browser.\n`);
});
