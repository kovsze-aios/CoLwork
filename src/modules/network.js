"use strict";

const path = require("path");
const fs = require("fs");
const { browserManager, randomDelay } = require("../browser");
const { generateInviteMessage } = require("../ai");
const { safe } = require("../utils/retry");
const { clean, nameCase, url: cleanUrl } = require("../utils/clean");

const TARGET_ROLES = [
  "CTO", "CEO", "Founder",
  "Chief Technology Officer", "Chief Executive Officer", "Co-Founder",
  "VP of Engineering", "Head of AI", "Head of Product", "Engineering Manager",
];

const MY_ROLE = "AI Automation Engineer | DeepSeek • Playwright • Medusa.js";
const SKIPPED_LOG = path.resolve(__dirname, "..", "..", "data", "skipped_leads.log");

function logSkipped(reason, ctx) {
  try {
    fs.mkdirSync(path.dirname(SKIPPED_LOG), { recursive: true });
    fs.appendFileSync(
      SKIPPED_LOG,
      `${new Date().toISOString()}\t${reason}\t${JSON.stringify(ctx).slice(0, 400)}\n`
    );
  } catch { /* never crash on logging */ }
}

async function readCard(card) {
  const nameRaw = await safe(
    async () => await card.locator("span.entity-result__title-text a span[aria-hidden='true'], a.app-aware-link span[aria-hidden='true'], span[dir='ltr'] span[aria-hidden='true']").first().textContent(),
    "",
    "card.name"
  );
  const headlineRaw = await safe(
    async () => await card.locator("div.entity-result__primary-subtitle, div.mb1").first().textContent(),
    "",
    "card.headline"
  );
  const companyRaw = await safe(
    async () => await card.locator("div.entity-result__secondary-subtitle, p.entity-result__secondary-subtitle").first().textContent(),
    "",
    "card.company"
  );
  const profileLink = await safe(
    async () => await card.locator("a.app-aware-link[href*='/in/']").first().getAttribute("href"),
    "",
    "card.link"
  );
  return {
    name: nameCase(nameRaw),
    headline: clean(headlineRaw, { oneLine: true, max: 200 }),
    company: clean(companyRaw, { oneLine: true, max: 80 }),
    linkedinUrl: cleanUrl(profileLink),
  };
}

async function trySendInvite(page, card, message) {
  // Click Connect on the card
  const connectBtn = card.locator(
    'button:has-text("Connect"), button:has-text("Zaproś"), button:has-text("Nawiąż kontakt")'
  ).first();
  if (!(await connectBtn.count())) return { sent: false, reason: "no_connect_button" };

  await connectBtn.click({ timeout: 6000 });
  await randomDelay(900, 1700);

  // Add a note
  const addNoteBtn = page.locator('button:has-text("Add a note"), button:has-text("Dodaj notatkę")').first();
  if (await addNoteBtn.count()) {
    await addNoteBtn.click({ timeout: 4000 });
    await randomDelay(400, 900);

    const noteArea = page.locator("textarea#custom-message, textarea[name='message']").first();
    if (await noteArea.count()) {
      await noteArea.fill(message);
      await randomDelay(400, 900);
    }
  }

  const sendBtn = page.locator(
    'button:has-text("Send"), button:has-text("Wyślij"), button[aria-label*="Send"], button[aria-label*="Wyślij"]'
  ).first();
  if (!(await sendBtn.count())) return { sent: false, reason: "no_send_button" };

  await sendBtn.click({ timeout: 5000 });
  await randomDelay(1200, 2500);
  return { sent: true };
}

async function smartNetwork({ roles, maxInvites = 5, dryRun = false } = {}) {
  const targets = roles?.length ? roles : TARGET_ROLES;
  const results = [];
  let page;

  try {
    page = await browserManager.start();
  } catch (e) {
    logSkipped("browser_start_failed", { error: e.message });
    console.error(`[network] browser failed to start: ${e.message}`);
    return [];
  }

  let sent = 0;

  try {
    for (const role of targets) {
      if (sent >= maxInvites) break;

      const navOk = await safe(async () => {
        await page.goto(
          `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(role)}&geoUrn=%5B%22101286278%22%5D&network=%5B%22S%22%5D`,
          { waitUntil: "domcontentloaded", timeout: 30000 }
        );
        return true;
      }, false, "network.nav");

      if (!navOk) {
        logSkipped("nav_failed", { role });
        continue;
      }

      await randomDelay(2500, 4500);
      await safe(async () => {
        for (let i = 0; i < 2; i++) {
          await page.keyboard.press("End");
          await randomDelay(900, 1800);
        }
      }, null, "network.scroll");

      const cards = page.locator("li.reusable-search__result-container, div.entity-result, div.search-result");
      const cardCount = Math.min(await safe(() => cards.count(), 0, "card.count"), 5);

      for (let i = 0; i < cardCount && sent < maxInvites; i++) {
        const card = cards.nth(i);
        let lead = { name: "", headline: "", company: "", linkedinUrl: "" };

        try {
          lead = await readCard(card);
          if (!lead.name || lead.name.length < 3) {
            logSkipped("missing_name", { role, idx: i });
            continue;
          }

          const message = await generateInviteMessage({
            targetName: lead.name,
            targetTitle: lead.headline.slice(0, 120),
            targetCompany: lead.company,
            myRole: MY_ROLE,
          }).catch((e) => {
            logSkipped("ai_invite_failed", { lead: lead.name, error: e.message });
            return null;
          });

          if (!message) continue;

          if (dryRun) {
            results.push({ ...lead, title: lead.headline, message, sent: false, dryRun: true });
            sent++;
            await randomDelay(800, 1600);
            continue;
          }

          const outcome = await trySendInvite(page, card, message).catch((e) => ({ sent: false, reason: e.message?.slice(0, 80) }));
          if (outcome.sent) {
            sent++;
            results.push({ ...lead, title: lead.headline, message, sent: true });
            console.log(`[network] ✓ invite → ${lead.name}`);
          } else {
            logSkipped("send_failed", { lead: lead.name, reason: outcome.reason });
            results.push({ ...lead, title: lead.headline, message, sent: false, reason: outcome.reason });
          }
          await randomDelay(2200, 4200);
        } catch (e) {
          logSkipped("card_error", { role, idx: i, error: e.message?.slice(0, 200), name: lead.name });
          console.warn(`[network] card ${i} skipped — ${e.message?.slice(0, 80)}`);
        }
      }
    }
  } finally {
    await safe(() => browserManager.stop(), null, "browser.stop");
  }

  console.log(`[network] done — ${results.filter((r) => r.sent).length}/${results.length} invites sent`);
  return results;
}

module.exports = { smartNetwork, TARGET_ROLES };
