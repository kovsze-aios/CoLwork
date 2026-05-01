"use strict";

const { browserManager, randomDelay } = require("../browser");
const { generatePost } = require("../ai");
const { safe } = require("../utils/retry");

const TOPICS = [
  "Jak automatyzacja procesów biznesowych uwalnia 15h tygodniowo właściciela e-commerce",
  "Dlaczego Prompt Engineering to najbardziej niedoceniana umiejętność 2026 roku",
  "Hybrydowe sklepy internetowe — łączenie Medusa.js z zewnętrznymi platformami afiliacyjnymi",
  "5 procesów, które każda firma powinna zautomatyzować w pierwszej kolejności",
  "AI Agent w praktyce — jak zautomatyzowałem operacje sklepu od A do Z",
  "Integracja DeepSeek z procesami biznesowymi — case study redukcji kosztów o 30%",
  "Dlaczego małe firmy potrzebują automatyzacji bardziej niż korporacje",
  "E-commerce 2026: nie konkurujesz produktem, tylko szybkością procesów",
];

async function createAndPublishPost({ topic, tone, dryRun = false } = {}) {
  const selectedTopic = topic || TOPICS[Math.floor(Math.random() * TOPICS.length)];

  let post;
  try {
    post = await generatePost({ topic: selectedTopic, tone: tone || "thought-leadership", length: "medium" });
  } catch (e) {
    console.error(`[content] AI generation failed: ${e.message}`);
    return { topic: selectedTopic, post: "", published: false, error: e.message };
  }

  if (dryRun) return { topic: selectedTopic, post, published: false };

  let page;
  try {
    page = await browserManager.start();
  } catch (e) {
    console.error(`[content] browser failed: ${e.message}`);
    return { topic: selectedTopic, post, published: false, error: "browser_failed" };
  }

  let published = false;
  try {
    await page.goto("https://www.linkedin.com/feed/", { waitUntil: "domcontentloaded", timeout: 30000 });
    await randomDelay(2000, 4000);

    const shareBox = page.locator('button:has-text("Start a post"), button:has-text("Share"), div[role="textbox"]').first();
    if (!(await shareBox.count())) {
      console.warn("[content] share box not found — skipping publish");
      return { topic: selectedTopic, post, published: false, error: "share_box_not_found" };
    }
    await shareBox.click({ timeout: 5000 });
    await randomDelay(900, 1800);

    const editor = page.locator('div[role="textbox"], div.ql-editor, div[contenteditable="true"]').first();
    if (!(await editor.count())) {
      console.warn("[content] editor not found — skipping publish");
      return { topic: selectedTopic, post, published: false, error: "editor_not_found" };
    }

    await editor.click();
    await randomDelay(400, 900);

    const paragraphs = post.split("\n");
    for (let i = 0; i < paragraphs.length; i++) {
      const para = paragraphs[i].trim();
      if (!para) { await page.keyboard.press("Enter"); continue; }
      await page.keyboard.type(para, { delay: 18 + Math.random() * 28 });
      if (i < paragraphs.length - 1) {
        await page.keyboard.press("Enter");
        if (paragraphs[i + 1]?.trim()) await page.keyboard.press("Enter");
      }
      await randomDelay(80, 220);
    }
    await randomDelay(1300, 2200);

    const postBtn = page.locator('button:has-text("Post"), button:has-text("Opublikuj")').last();
    if (await postBtn.count()) {
      await postBtn.click({ timeout: 5000 });
      await randomDelay(2500, 4500);
      published = true;
      console.log("[content] ✓ post published");
    }
  } catch (e) {
    console.error(`[content] publish error: ${e.message?.slice(0, 120)}`);
  } finally {
    await safe(() => browserManager.stop(), null, "browser.stop");
  }

  return { topic: selectedTopic, post, published };
}

module.exports = { createAndPublishPost, TOPICS };
