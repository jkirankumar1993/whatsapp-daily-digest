# Personal WhatsApp Web Daily Digest

A local, read-only MVP that opens your own WhatsApp Web session, collects recent
visible messages from an explicit allow-list of groups, summarizes important items,
and emails a daily digest. It never sends WhatsApp messages or scrapes contacts.

## Easy Windows installation

Download or clone this repository, then double-click `INSTALL_AND_START.bat`.
It installs Node.js when Winget is available, installs all dependencies and
Chromium, creates local configuration, starts the app, and opens the dashboard.
On later uses, double-click `START_APP.bat`.

API keys can be pasted into the dashboard during first setup. They are stored only
in the local `.env` file and are never returned to the browser.

## Feasibility and architecture

This is feasible as personal browser automation, with one important caveat:
WhatsApp Web is not a stable public scraping API. UI changes can break selectors.
The browser layer is therefore isolated in `src/whatsapp/selectors.ts`.

Flow:

`Persistent Playwright profile → selected groups → SQLite → OpenRouter → Resend`

Only configured groups are opened. A bounded number of visible messages is read.
SQLite hashes messages for deduplication. Raw message text leaves the computer only
when sent to the AI provider you configure; email contains only the generated digest.

## Folder structure

```text
src/
  whatsapp/selectors.ts   Centralized WhatsApp Web selectors
  whatsapp/scanner.ts     Login and read-only collection
  ai.ts                   OpenAI-compatible and Gemini summarizers
  email.ts                Resend delivery
  db.ts                   SQLite schema and deduplication
  digest.ts               Digest rendering/orchestration
  cli.ts                  Commands
config.example.json
.env.example
TASK_SCHEDULER.md
```

Generated local data is ignored by Git: `config.json`, `.env`, `data/`,
`browser-profile/`, and log files.

## Setup

Requirements: Node.js 20+ and a WhatsApp account you control.

```powershell
npm install
npx playwright install chromium
Copy-Item config.example.json config.json
Copy-Item .env.example .env
```

Edit `config.json` with exact group names and email settings. Edit `.env` with the
chosen AI and email credentials. Start with `"dryRun": true`.

## Local dashboard (recommended)

You do not need CMD for normal use. Start the local dashboard:

```powershell
npm.cmd run ui
```

On Windows, you can instead double-click `start-dashboard.vbs`. It starts the
dashboard invisibly and keeps it running after the launcher closes.

Then open `http://127.0.0.1:3210`. Use **Connect WhatsApp**, scan the QR code,
then **Discover chats** and select the group chats to track. Configuration and all
actions are available from the dashboard. Keep the terminal window open while using
it; closing the terminal stops the local server.

### 1. Save the login session

```powershell
npm run login
```

Scan the QR code if shown. Wait for the chat list, then return to the terminal and
press Enter. The session is stored in `browser-profile/`.

### 2. Collect messages

```powershell
npm run scan
```

### 3. Generate a digest

```powershell
npm run digest
```

With dry-run enabled, the complete email is written to the terminal and daily log.
After verifying it, set `"dryRun": false`.

### 4. Run the scheduled workflow

```powershell
npm run job
```

See [TASK_SCHEDULER.md](TASK_SCHEDULER.md).

## Providers

- OpenRouter handles AI summarization. Set `OPENROUTER_API_KEY` and use an
  OpenRouter model identifier such as `openai/gpt-4.1-mini` or
  `google/gemini-2.5-flash`.
- Resend handles email delivery. Set `RESEND_API_KEY` and use a sender address or
  domain authorized in your Resend account.

## Privacy and deletion

Enable `redactPhoneNumbers` to replace phone-like strings before storage and AI use.
Delete all locally stored messages with:

```powershell
npm run clear-messages
```

This does not delete saved digest records. To remove everything, close the app and
delete the configured SQLite file yourself.

## Troubleshooting

**QR code or expired session:** Run `npm run login` again. Do not run login and scan
simultaneously because Chromium locks the profile.

**Browser closes or profile is locked:** Close other Chromium instances using the
same `browserProfilePath`. Use a dedicated profile, not your everyday Chrome profile.

**Group not found:** Confirm the spelling is exact. Archived or muted groups can
behave differently; open them manually once and retry.

**Selector timeout:** WhatsApp Web likely changed. Run with `headless: false`, inspect
the current UI, and update only `src/whatsapp/selectors.ts`.

**No older messages:** The MVP reads only a bounded recent visible window. It does
not export or deeply scrape chat history.

**Resend delivery failure:** Ensure your API key is active and the sender domain or
address is authorized in your Resend account.

## Known limitations

- WhatsApp Web UI changes can break selectors.
- QR sessions expire and may require login again.
- Your phone/account must remain connected and functional.
- Messages not loaded into the browser cannot be captured.
- Images, files, audio, and media are ignored unless visible caption text exists.
- Muted and archived groups may behave differently.
- Timestamp parsing varies by locale; collection time is the reliable fallback.
- This is a personal local tool, not suitable for hosted SaaS or multi-user use.

## Safety boundary

There is no code for sending messages, auto-replies, bulk messaging, contact/member
harvesting, or group administration. Keep the tool for your own account and comply
with WhatsApp's terms and applicable law.
