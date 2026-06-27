import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import Database from "better-sqlite3";
import type { AppConfig, CollectedMessage, DigestJson } from "./types.js";

export class AppDatabase {
  private db: Database.Database;

  constructor(private config: AppConfig) {
    fs.mkdirSync(path.dirname(config.databasePath), { recursive: true });
    this.db = new Database(config.databasePath);
    this.db.pragma("journal_mode = WAL");
    this.migrate();
    this.syncGroups();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tracked_groups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        group_name TEXT NOT NULL UNIQUE,
        enabled INTEGER NOT NULL DEFAULT 1,
        last_scanned_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        group_name TEXT NOT NULL,
        sender_name TEXT NOT NULL DEFAULT '',
        message_text TEXT NOT NULL,
        message_time_raw TEXT NOT NULL DEFAULT '',
        message_time_iso TEXT,
        collected_at TEXT NOT NULL,
        message_hash TEXT NOT NULL UNIQUE,
        source_type TEXT NOT NULL DEFAULT 'whatsapp_web'
      );
      CREATE INDEX IF NOT EXISTS idx_messages_collected_at ON messages(collected_at);
      CREATE TABLE IF NOT EXISTS digests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        digest_date TEXT NOT NULL,
        total_messages INTEGER NOT NULL,
        important_message_count INTEGER NOT NULL,
        summary_markdown TEXT NOT NULL,
        summary_json TEXT NOT NULL,
        emailed_to TEXT,
        emailed_at TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
  }

  private syncGroups(): void {
    const upsert = this.db.prepare(`
      INSERT INTO tracked_groups (group_name) VALUES (?)
      ON CONFLICT(group_name) DO UPDATE SET enabled=1, updated_at=CURRENT_TIMESTAMP
    `);
    const tx = this.db.transaction(() => this.config.whatsappGroups.forEach((g) => upsert.run(g)));
    tx();
  }

  insertMessage(message: CollectedMessage): boolean {
    const normalized = message.messageText.replace(/\s+/g, " ").trim().toLowerCase();
    const bucket = message.messageTimeIso?.slice(0, 16) ?? message.collectedAt.slice(0, 10);
    const hash = crypto.createHash("sha256")
      .update([message.groupName, message.senderName, normalized, bucket].join("\u001f"))
      .digest("hex");
    const result = this.db.prepare(`
      INSERT OR IGNORE INTO messages
      (group_name, sender_name, message_text, message_time_raw, message_time_iso, collected_at, message_hash)
      VALUES (@groupName, @senderName, @messageText, @messageTimeRaw, @messageTimeIso, @collectedAt, @hash)
    `).run({ ...message, hash });
    return result.changes === 1;
  }

  markGroupScanned(groupName: string): void {
    this.db.prepare("UPDATE tracked_groups SET last_scanned_at=?, updated_at=CURRENT_TIMESTAMP WHERE group_name=?")
      .run(new Date().toISOString(), groupName);
  }

  getTodayMessages(): Array<Record<string, string>> {
    const cutoff = new Date(Date.now() - this.config.scanLookbackHours * 3600_000).toISOString();
    const groups = this.config.whatsappGroups;
    if (groups.length === 0) return [];
    const placeholders = groups.map(() => "?").join(", ");
    return this.db.prepare(`
      SELECT group_name, sender_name, message_text, message_time_raw, collected_at
      FROM messages
      WHERE collected_at >= ? AND group_name IN (${placeholders})
      ORDER BY collected_at
    `).all(cutoff, ...groups) as Array<Record<string, string>>;
  }

  saveDigest(date: string, total: number, digest: DigestJson, markdown: string, emailed: boolean): void {
    this.db.prepare(`
      INSERT INTO digests
      (digest_date, total_messages, important_message_count, summary_markdown, summary_json, emailed_to, emailed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(date, total, digest.importantMessageCount, markdown, JSON.stringify(digest),
      emailed ? this.config.digestEmailTo : null, emailed ? new Date().toISOString() : null);
  }

  getLatestDigest(): { markdown: string; date: string; createdAt: string } | null {
    const row = this.db.prepare(`
      SELECT summary_markdown AS markdown, digest_date AS date, created_at AS createdAt
      FROM digests ORDER BY id DESC LIMIT 1
    `).get() as { markdown: string; date: string; createdAt: string } | undefined;
    return row ?? null;
  }

  clearMessages(): number {
    return this.db.prepare("DELETE FROM messages").run().changes;
  }

  close(): void { this.db.close(); }
}
