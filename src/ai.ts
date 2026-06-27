import type { AppConfig, DigestJson } from "./types.js";

const SYSTEM_PROMPT = `You create a private daily digest from WhatsApp group messages.
Extract only meaningful items in these categories: urgent issues, maintenance/security,
payments/dues, admin announcements, events/meetings, disputes/conflicts, action items,
and messages needing the user's attention. Ignore greetings, thanks, jokes, festival
forwards, repeated forwards, casual chatter, emoji-only messages, generic reactions,
and irrelevant small talk. Do not invent facts. Return valid JSON only with this shape:
{"executiveSummary":"string","topImportantUpdates":["string"],
"groupWiseUpdates":[{"group":"string","updates":["string"]}],
"actionItems":["string"],"urgentItems":["string"],"ignoredNoiseSummary":"string",
"importantMessageCount":0}.`;

export async function summarize(config: AppConfig, messages: Array<Record<string, string>>): Promise<DigestJson> {
  if (messages.length === 0) return emptyDigest();
  const input = messages.map((m) =>
    `[${m.group_name}] ${m.sender_name || "Unknown"}: ${m.message_text}`).join("\n");
  const raw = await callOpenRouter(config, input);
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return normalizeDigest(JSON.parse(cleaned) as Partial<DigestJson>);
}

async function callOpenRouter(config: AppConfig, input: string): Promise<string> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY is not set");
  const base = "https://openrouter.ai/api/v1";
  const headers: Record<string, string> = {
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json"
  };
  headers["HTTP-Referer"] = "http://127.0.0.1:3210";
  headers["X-Title"] = "Personal WhatsApp Daily Digest";
  const response = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: config.aiModel,
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: input }]
    })
  });
  if (!response.ok) throw new Error(`OpenRouter API failed (${response.status}): ${await response.text()}`);
  const json = await response.json() as { choices: Array<{ message: { content: string } }> };
  return json.choices[0]?.message.content ?? "{}";
}

function emptyDigest(): DigestJson {
  return {
    executiveSummary: "No messages were collected for this digest period.",
    topImportantUpdates: [], groupWiseUpdates: [], actionItems: [], urgentItems: [],
    ignoredNoiseSummary: "No messages processed.", importantMessageCount: 0
  };
}

function normalizeDigest(value: Partial<DigestJson>): DigestJson {
  const top = Array.isArray(value.topImportantUpdates) ? value.topImportantUpdates : [];
  const groups = Array.isArray(value.groupWiseUpdates) ? value.groupWiseUpdates : [];
  const actions = Array.isArray(value.actionItems) ? value.actionItems : [];
  const urgent = Array.isArray(value.urgentItems) ? value.urgentItems : [];
  const inferredCount = top.length + groups.reduce((sum, group) =>
    sum + (Array.isArray(group.updates) ? group.updates.length : 0), 0);
  return {
    executiveSummary: value.executiveSummary ?? "No executive summary was returned.",
    topImportantUpdates: top,
    groupWiseUpdates: groups,
    actionItems: actions,
    urgentItems: urgent,
    ignoredNoiseSummary: value.ignoredNoiseSummary ?? "No noise summary was returned.",
    importantMessageCount: Number.isFinite(value.importantMessageCount)
      ? Number(value.importantMessageCount)
      : inferredCount
  };
}
