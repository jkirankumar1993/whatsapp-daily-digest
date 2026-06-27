import type { AppConfig, DigestJson } from "./types.js";
import { AppDatabase } from "./db.js";
import { summarize } from "./ai.js";
import { sendEmail } from "./email.js";
import { logger } from "./logger.js";

export async function createDigest(config: AppConfig, db: AppDatabase): Promise<void> {
  const messages = db.getTodayMessages();
  const digest = await summarize(config, messages);
  const date = localDate();
  const markdown = renderDigest(digest, {
    groups: new Set(messages.map((m) => m.group_name)).size,
    messages: messages.length
  });
  let emailed = false;
  if (digest.importantMessageCount > 0 || config.sendDigestEvenIfNoImportantMessages) {
    emailed = await sendEmail(config, `WhatsApp Daily Digest - ${date}`, markdown);
  } else {
    logger.info("No important messages found; email skipped by configuration.");
    logger.info(markdown);
  }
  db.saveDigest(date, messages.length, digest, markdown, emailed);
}

function renderDigest(d: DigestJson, stats: { groups: number; messages: number }): string {
  const list = (items: string[]) => items.length ? items.map((x) => `- ${x}`).join("\n") : "- None";
  const groups = d.groupWiseUpdates.length
    ? d.groupWiseUpdates.map((g) => `### ${g.group}\n${list(g.updates)}`).join("\n\n")
    : "- None";
  return `# WhatsApp Daily Digest

## Executive summary
${d.executiveSummary}

## Top important updates
${list(d.topImportantUpdates)}

## Group-wise important updates
${groups}

## Action items
${list(d.actionItems)}

## Urgent items needing attention
${list(d.urgentItems)}

## Ignored noise summary
${d.ignoredNoiseSummary}

## Stats
- Groups scanned: ${stats.groups}
- Total messages collected: ${stats.messages}
- Important items found: ${d.importantMessageCount}
`;
}

function localDate(): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric", month: "2-digit", day: "2-digit"
  }).format(new Date());
}
