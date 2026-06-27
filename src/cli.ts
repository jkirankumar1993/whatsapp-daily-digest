import "dotenv/config";
import { loadConfig } from "./config.js";
import { AppDatabase } from "./db.js";
import { login, scan } from "./whatsapp/scanner.js";
import { createDigest } from "./digest.js";
import { logger } from "./logger.js";

async function main(): Promise<void> {
  const command = process.argv[2];
  const config = loadConfig();
  if (command === "login") {
    await login(config);
    return;
  }
  const db = new AppDatabase(config);
  try {
    if (command === "scan") await scan(config, db);
    else if (command === "digest") await createDigest(config, db);
    else if (command === "job") {
      await scan(config, db);
      await createDigest(config, db);
    } else if (command === "clear-messages") {
      logger.info(`Deleted ${db.clearMessages()} locally stored messages.`);
    } else {
      throw new Error("Usage: npm run login|scan|digest|job|clear-messages");
    }
  } finally {
    db.close();
  }
}

main().catch((error) => {
  logger.error("Command failed", error);
  process.exitCode = 1;
});
