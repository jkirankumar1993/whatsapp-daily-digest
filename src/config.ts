import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { AppConfig } from "./types.js";

const schema = z.object({
  whatsappGroups: z.array(z.string().min(1)).min(1),
  digestEmailTo: z.string().email(),
  digestEmailFrom: z.string().min(3),
  aiProvider: z.literal("openrouter"),
  aiModel: z.string().min(1),
  emailProvider: z.literal("resend"),
  maxMessagesPerGroup: z.number().int().positive().max(2000).default(250),
  scanLookbackHours: z.number().positive().max(168).default(24),
  headless: z.boolean().default(false),
  browserProfilePath: z.string().default("./browser-profile"),
  databasePath: z.string().default("./data/digest.sqlite"),
  sendDigestEvenIfNoImportantMessages: z.boolean().default(false),
  redactPhoneNumbers: z.boolean().default(true),
  dryRun: z.boolean().default(false)
});

export function loadConfig(): AppConfig {
  const configPath = path.resolve(process.env.CONFIG_PATH ?? "config.json");
  if (!fs.existsSync(configPath)) {
    throw new Error(`Missing ${configPath}. Copy config.example.json to config.json and edit it.`);
  }
  const parsed = schema.parse(JSON.parse(fs.readFileSync(configPath, "utf8")));
  return {
    ...parsed,
    browserProfilePath: path.resolve(parsed.browserProfilePath),
    databasePath: path.resolve(parsed.databasePath),
    dryRun: parsed.dryRun || process.env.DRY_RUN === "true"
  };
}
