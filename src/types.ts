export type AiProvider = "openrouter";
export type EmailProvider = "resend";

export interface AppConfig {
  whatsappGroups: string[];
  digestEmailTo: string;
  digestEmailFrom: string;
  aiProvider: AiProvider;
  aiModel: string;
  emailProvider: EmailProvider;
  maxMessagesPerGroup: number;
  scanLookbackHours: number;
  headless: boolean;
  browserProfilePath: string;
  databasePath: string;
  sendDigestEvenIfNoImportantMessages: boolean;
  redactPhoneNumbers: boolean;
  dryRun: boolean;
}

export interface CollectedMessage {
  groupName: string;
  senderName: string;
  messageText: string;
  messageTimeRaw: string;
  messageTimeIso: string | null;
  collectedAt: string;
}

export interface DigestJson {
  executiveSummary: string;
  topImportantUpdates: string[];
  groupWiseUpdates: Array<{ group: string; updates: string[] }>;
  actionItems: string[];
  urgentItems: string[];
  ignoredNoiseSummary: string;
  importantMessageCount: number;
}
