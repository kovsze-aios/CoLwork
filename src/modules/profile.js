"use strict";

const { browserManager, randomDelay } = require("../browser");
const { generateAbout } = require("../ai");
const { safe } = require("../utils/retry");
const { clean, nameCase } = require("../utils/clean");

const DEFAULT_ACHIEVEMENTS = [
  "Wdrożenie hybrydowego sklepu Medusa.js + Next.js z pełną automatyzacją procesów",
  "Redukcja kosztów operacyjnych o 40% dzięki Make / n8n / Node.js",
  "Integracja DeepSeek do analizy danych sprzedażowych i personalizacji ofert",
];

async function updateAboutSection({ achievements, name, currentRole } = {}) {
  let page;
  try {
    page = await browserManager.start();
  } catch (e) {
    console.error(`[profile] browser failed: ${e.message}`);
    return { ok: false, error: "browser_failed" };
  }

  let aboutText = "";
  try {
    await page.goto("https://www.linkedin.com/in/me/", { waitUntil: "domcontentloaded", timeout: 30000 });
    await randomDelay(1800, 3500);

    const detectedName = await safe(
      () => page.locator("h1.text-heading-xlarge").first().textContent(),
      "",
      "profile.name"
    );
    const finalName = nameCase(name || detectedName || "Specjalista AI");

    aboutText = await generateAbout({
      name: finalName,
      achievements: achievements || DEFAULT_ACHIEVEMENTS,
      currentRole: clean(currentRole || "AI Automation Engineer", { oneLine: true, max: 80 }),
    });

    const editLinkOk = await safe(async () => {
      await page.locator('a[href*="/edit/"]').first().click({ timeout: 5000 });
      return true;
    }, false, "profile.edit_link");

    if (!editLinkOk) {
      await safe(async () => {
        await page.goto("https://www.linkedin.com/in/me/edit/intro/", { waitUntil: "domcontentloaded", timeout: 20000 });
      }, null, "profile.edit_nav");
    }

    await randomDelay(1300, 2700);

    const summaryTextarea = page.locator("textarea#summary, textarea[name='summary']");
    if (!(await summaryTextarea.count())) {
      console.warn("[profile] textarea not found — printing generated text for manual save");
      console.log("─".repeat(50));
      console.log(aboutText);
      console.log("─".repeat(50));
      return { ok: false, aboutText, error: "textarea_not_found" };
    }

    await summaryTextarea.click({ timeout: 5000 });
    await summaryTextarea.fill("");
    await summaryTextarea.type(aboutText, { delay: 14 });
    await randomDelay(900, 1800);

    const saveBtn = page.locator('button[type="submit"], button:has-text("Save"), button:has-text("Zapisz")').first();
    if (await saveBtn.count()) {
      await saveBtn.click({ timeout: 5000 });
      await randomDelay(1800, 3500);
      console.log("[profile] ✓ About section updated");
      return { ok: true, aboutText };
    }
    return { ok: false, aboutText, error: "save_button_not_found" };
  } catch (e) {
    console.error(`[profile] error: ${e.message?.slice(0, 120)}`);
    return { ok: false, aboutText, error: e.message };
  } finally {
    await safe(() => browserManager.stop(), null, "browser.stop");
  }
}

module.exports = { updateAboutSection };
