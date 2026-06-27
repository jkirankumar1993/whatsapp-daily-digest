import type { AppConfig } from "./types.js";
import { logger } from "./logger.js";

export async function sendEmail(config: AppConfig, subject: string, markdown: string): Promise<boolean> {
  if (config.dryRun) {
    logger.info(`DRY RUN email\nTo: ${config.digestEmailTo}\nSubject: ${subject}\n\n${markdown}`);
    return false;
  }
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY is not set");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: config.digestEmailFrom, to: [config.digestEmailTo], subject,
      text: markdown, html: markdownToHtml(markdown)
    })
  });
  if (!response.ok) throw new Error(`Resend failed (${response.status}): ${await response.text()}`);
  logger.info(`Digest emailed to ${config.digestEmailTo}`);
  return true;
}

function markdownToHtml(markdown: string): string {
  const escaped = markdown.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return escaped.replace(/^### (.*)$/gm, "<h3>$1</h3>")
    .replace(/^## (.*)$/gm, "<h2>$1</h2>")
    .replace(/^# (.*)$/gm, "<h1>$1</h1>")
    .replace(/^- (.*)$/gm, "<li>$1</li>")
    .replace(/\n/g, "<br>");
}
