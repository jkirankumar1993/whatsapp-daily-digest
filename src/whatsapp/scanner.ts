import { chromium, type Page } from "playwright";
import type { AppConfig, CollectedMessage } from "../types.js";
import { AppDatabase } from "../db.js";
import { logger } from "../logger.js";
import { selectors } from "./selectors.js";

async function firstVisible(page: Page, candidates: readonly string[]) {
  for (const selector of candidates) {
    const locator = page.locator(selector).first();
    if (await locator.isVisible().catch(() => false)) return locator;
  }
  const controls = await page.locator("#side").evaluate((root) =>
    [...root.querySelectorAll("input, button, [contenteditable], [role='textbox']")]
      .slice(0, 30)
      .map((el) => ({
        tag: el.tagName,
        role: el.getAttribute("role"),
        ariaLabel: el.getAttribute("aria-label"),
        title: el.getAttribute("title"),
        contenteditable: el.getAttribute("contenteditable"),
        dataTab: el.getAttribute("data-tab"),
        type: el.getAttribute("type")
      }))
  ).catch(() => []);
  logger.warn("WhatsApp sidebar controls found while locating search", controls);
  throw new Error("Could not find WhatsApp search box. Selectors may need updating.");
}

export async function login(config: AppConfig): Promise<void> {
  const context = await chromium.launchPersistentContext(config.browserProfilePath, {
    headless: false,
    viewport: null
  });
  const page = context.pages()[0] ?? await context.newPage();
  await page.goto("https://web.whatsapp.com");
  logger.info("Browser opened. Scan the QR code if requested.");
  logger.info("After WhatsApp loads, return here and press Enter to save and close the session.");
  await new Promise<void>((resolve) => process.stdin.once("data", () => resolve()));
  await context.close();
}

export async function loginFromUi(config: AppConfig): Promise<void> {
  const context = await chromium.launchPersistentContext(config.browserProfilePath, {
    headless: false,
    viewport: null
  });
  const page = context.pages()[0] ?? await context.newPage();
  await page.goto("https://web.whatsapp.com");
  logger.info("Login window opened. Waiting for the WhatsApp chat list.");
  await page.waitForSelector(selectors.appReady, { timeout: 5 * 60_000 });
  await page.waitForTimeout(1500);
  await context.close();
  logger.info("WhatsApp login confirmed and profile saved.");
}

export async function discoverChats(config: AppConfig): Promise<Array<{ name: string; label: string }>> {
  const context = await chromium.launchPersistentContext(config.browserProfilePath, {
    headless: false,
    viewport: { width: 1440, height: 1000 }
  });
  try {
    const page = context.pages()[0] ?? await context.newPage();
    await page.goto("https://web.whatsapp.com", { waitUntil: "domcontentloaded" });
    await page.waitForSelector(selectors.appReady, { timeout: 90_000 });
    const pane = page.locator(selectors.appReady);
    const chats = new Map<string, string>();
    for (let pass = 0; pass < 12; pass++) {
      const visibleChats = await pane.locator(
        '[role="listitem"], [data-testid="cell-frame-container"]'
      ).evaluateAll((rows) => rows.map((row) => {
        const titleNode = row.querySelector('[data-testid="cell-frame-title"] span[title], span[title]');
        const name = titleNode?.getAttribute("title")?.trim() ?? "";
        if (!name || name === "Loading…") return null;
        const lines = (row.textContent ?? "").split(/\n+/).map((line) => line.trim()).filter(Boolean);
        const nameIndex = lines.findIndex((line) => line === name);
        const parent = nameIndex > 0
          ? lines.slice(0, nameIndex).find((line) => !/^\d{1,2}:\d{2}/.test(line))
          : undefined;
        return { name, label: parent && parent !== name ? `${parent} — ${name}` : name };
      }).filter((item): item is { name: string; label: string } => item !== null));
      visibleChats.forEach((chat) => chats.set(chat.name, chat.label));
      await pane.evaluate((el) => el.scrollBy(0, Math.max(500, el.clientHeight * 0.8)));
      await page.waitForTimeout(350);
    }
    logger.info(`Discovered ${chats.size} visible chat names.`);
    return [...chats].map(([name, label]) => ({ name, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  } finally {
    await context.close();
  }
}

export async function scan(config: AppConfig, db: AppDatabase): Promise<{ groupsScanned: number; messagesFound: number; inserted: number; duplicates: number; errors: number }> {
  const context = await chromium.launchPersistentContext(config.browserProfilePath, {
    headless: config.headless,
    viewport: { width: 1440, height: 1000 }
  });
  const page = context.pages()[0] ?? await context.newPage();
  const stats = { groupsScanned: 0, messagesFound: 0, inserted: 0, duplicates: 0, errors: 0 };
  const queue = [...config.whatsappGroups];
  const queued = new Set(queue);
  const parentCommunity = new Map<string, string>();
  try {
    await page.goto("https://web.whatsapp.com", { waitUntil: "domcontentloaded" });
    await page.waitForSelector(selectors.appReady, { timeout: 90_000 });
    for (let groupIndex = 0; groupIndex < queue.length; groupIndex++) {
      const group = queue[groupIndex]!;
      try {
        const community = parentCommunity.get(group);
        const subgroupCards = page.locator(
          `[data-testid^="chatlist-message-"]:has([data-testid="cell-frame-title"] span[title="${cssEscape(group)}"])`
        );
        const popupIndex = (await subgroupCards.count()) - 1;
        if (community && popupIndex >= 0) {
          await subgroupCards.nth(popupIndex).click({ force: true });
        } else {
          const search = await firstVisible(page, selectors.searchBoxCandidates);
          await search.click();
          await search.fill(community ?? group);
          await page.waitForTimeout(1200);
          const searchName = community ?? group;
          const exact = page.locator(selectors.chatRows).filter({
            has: page.locator(`span[title="${cssEscape(searchName)}"]`)
          }).first();
          if (!(await exact.isVisible().catch(() => false))) {
            logger.warn(`Chat not found: ${searchName}`);
            stats.errors++;
            await search.fill("");
            continue;
          }
          await exact.click();
          if (community) {
            await page.waitForTimeout(700);
            await page.locator('#main [data-testid="subgroup-switcher-button"]').click();
            await page.waitForTimeout(500);
            await page.locator('[data-testid="view-community-row"]').click();
            await page.waitForTimeout(800);
            const cards = page.locator(
              `[data-testid^="chatlist-message-"]:has([data-testid="cell-frame-title"] span[title="${cssEscape(group)}"])`
            );
            const index = (await cards.count()) - 1;
            if (index < 0) {
              throw new Error(`Subgroup "${group}" was not found in Community "${community}".`);
            }
            await cards.nth(index).click({ force: true });
          }
        }
        await page.waitForSelector(selectors.messagePane, { timeout: 20_000 });
        await page.waitForTimeout(1000);
        // Community member groups also show the subgroup caret. Scans now operate
        // only on explicitly selected chat names, so never expand from this signal.
        const isCommunityContainer = false;
        if (isCommunityContainer) {
          await page.locator('#main [data-testid="subgroup-switcher-button"]').click();
          await page.waitForTimeout(500);
          const seedGroup = page.locator(
            '[role="row"][data-testid^="list-item-"] [data-testid^="chatlist-message-"]'
          ).last();
          if (!(await seedGroup.isVisible().catch(() => false))) {
            throw new Error(`Community "${group}" did not expose an initial member group.`);
          }
          await seedGroup.click({ force: true });
          await page.waitForTimeout(900);
          const refreshedSearch = await firstVisible(page, selectors.searchBoxCandidates);
          await refreshedSearch.fill("");
          await page.waitForTimeout(300);
          await page.locator('#main [data-testid="subgroup-switcher-button"]').click();
          await page.waitForTimeout(500);
          await page.locator('[data-testid="view-community-row"]').click();
          await page.waitForTimeout(1000);
          const subgroupNames = await page.locator(
            '[data-testid^="chatlist-message-"] [data-testid="cell-frame-title"] span[title]'
          ).evaluateAll((nodes) =>
            nodes.filter((node) => !node.closest("#pane-side"))
              .map((node) => node.getAttribute("title")?.trim() ?? "")
              .filter((name) => name && name !== "Loading…")
          );
          const additions = [...new Set(subgroupNames)].filter((name) => !queued.has(name));
          additions.forEach((name) => {
            queued.add(name);
            queue.push(name);
            parentCommunity.set(name, group);
          });
          logger.info(`Expanded Community "${group}" into ${additions.length} subgroup chats`, additions);
          if (additions.length === 0) {
            const communityView = await page.locator("body").evaluate((root) =>
              [...root.querySelectorAll("span[title], [data-testid]")]
                .filter((el) => !el.closest("#pane-side"))
                .map((el) => ({
                  tag: el.tagName,
                  title: el.getAttribute("title"),
                  testid: el.getAttribute("data-testid")
                }))
                .filter((item) => item.title || item.testid?.includes("group") || item.testid?.includes("community"))
                .slice(-80)
            );
            logger.warn("Community view structure", communityView);
            throw new Error(`No subgroup chats were found inside Community "${group}".`);
          }
          continue;
        }
        await page.locator(selectors.scrollContainer).first().evaluate((el) => el.scrollBy(0, -1500)).catch(() => {});
        await page.waitForTimeout(800);
        const rows = page.locator(selectors.messageRows);
        const totalRows = await rows.count();
        const count = Math.min(totalRows, config.maxMessagesPerGroup);
        if (count === 0) {
          const structure = await page.locator("#main").evaluate((root) =>
            [...root.querySelectorAll("*")]
              .filter((el) =>
                el.hasAttribute("data-id") ||
                el.hasAttribute("data-testid") ||
                el.hasAttribute("data-pre-plain-text") ||
                (el.getAttribute("class") ?? "").includes("message") ||
                el.getAttribute("role") === "row"
              )
              .slice(0, 80)
              .map((el) => ({
                tag: el.tagName,
                class: el.getAttribute("class"),
                dataId: el.getAttribute("data-id"),
                testId: el.getAttribute("data-testid"),
                role: el.getAttribute("role"),
                hasMeta: el.hasAttribute("data-pre-plain-text")
              }))
          ).catch(() => []);
          logger.warn(`No message rows found in ${group}; current WhatsApp structure`, structure);
        }
        stats.messagesFound += count;
        const extracted = await rows.evaluateAll((nodes, args) =>
          nodes.slice(-args.limit).map((row) => {
            const textNodes = [...row.querySelectorAll(args.textSelector)];
            const text = (textNodes.length
              ? textNodes.map((node) => node.textContent ?? "").join(" ")
              : row.textContent ?? "").replace(/\s+/g, " ").trim();
            const metaNode = row.matches("[data-pre-plain-text]")
              ? row
              : row.querySelector("[data-pre-plain-text]");
            return { text, meta: metaNode?.getAttribute("data-pre-plain-text") ?? "" };
          }), { limit: config.maxMessagesPerGroup, textSelector: selectors.messageText }
        );
        for (const item of extracted) {
          const text = item.text;
          if (!text) continue;
          const parsed = parseMeta(item.meta);
          const message: CollectedMessage = {
            groupName: group,
            senderName: parsed.sender,
            messageText: config.redactPhoneNumbers ? redactPhones(text) : text,
            messageTimeRaw: parsed.time,
            messageTimeIso: null,
            collectedAt: new Date().toISOString()
          };
          if (db.insertMessage(message)) stats.inserted++; else stats.duplicates++;
        }
        db.markGroupScanned(group);
        stats.groupsScanned++;
        const search = await firstVisible(page, selectors.searchBoxCandidates).catch(() => null);
        await search?.fill("").catch(() => {});
      } catch (error) {
        stats.errors++;
        logger.error(`Failed to scan group: ${group}`, error);
      }
    }
  } catch (error) {
    logger.error("WhatsApp scan failed. Run npm run login if the session expired.", error);
    throw error;
  } finally {
    await Promise.race([
      context.close(),
      new Promise<void>((resolve) => setTimeout(resolve, 5_000))
    ]);
    logger.info("Scan summary", stats);
  }
  if (stats.groupsScanned === 0 && stats.errors > 0) {
    throw new Error(`Scan failed for all selected chats (${stats.errors} error). Check the selected group name or WhatsApp selectors.`);
  }
  return stats;
}

function parseMeta(meta: string): { sender: string; time: string } {
  const match = meta.match(/^\[([^\]]+)]\s*([^:]+):/);
  return { time: match?.[1]?.trim() ?? "", sender: match?.[2]?.trim() ?? "" };
}

function redactPhones(text: string): string {
  return text.replace(/(?<!\d)(?:\+?\d[\s.-]?){8,15}(?!\d)/g, "[PHONE REDACTED]");
}

function cssEscape(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
