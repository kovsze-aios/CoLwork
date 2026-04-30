"use strict";

const { createSession, randomDelay } = require("../browser");
const { generatePost } = require("../ai");

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

/**
 * Generate and publish a professional LinkedIn post.
 * @param {Object} opts
 * @param {string} [opts.topic] - Custom topic (auto-picked if omitted)
 * @param {string} [opts.tone] - "inspirational" | "technical" | "thought-leadership"
 * @param {boolean} [opts.dryRun] - If true, generate but don't publish
 * @returns {Promise<{topic: string, post: string, published: boolean}>}
 */
async function createAndPublishPost({ topic, tone, dryRun = false } = {}) {
  const selectedTopic = topic || TOPICS[Math.floor(Math.random() * TOPICS.length)];

  console.log(`[content] Topic: "${selectedTopic}"`);
  console.log("[content] Generating post with DeepSeek...");

  const post = await generatePost({
    topic: selectedTopic,
    tone: tone || "thought-leadership",
    length: "medium",
  });

  console.log("[content] Post generated:");
  console.log("─".repeat(50));
  console.log(post);
  console.log("─".repeat(50));

  if (dryRun) {
    console.log("[content] DRY RUN — post NOT published.");
    return { topic: selectedTopic, post, published: false };
  }

  console.log("[content] Publishing to LinkedIn...");
  const { page, browser } = await createSession();

  try {
    await page.goto("https://www.linkedin.com/feed/", { waitUntil: "networkidle", timeout: 30000 });
    await randomDelay(2000, 4000);

    // Click the "Start a post" / share box
    const shareBox = page.locator('button:has-text("Start a post"), button:has-text("Share"), div[role="textbox"]').first();
    await shareBox.click();
    await randomDelay(1000, 2000);

    // Type into the post editor
    const editor = page.locator('div[role="textbox"], div.ql-editor, div[contenteditable="true"]').first();

    if (await editor.count() > 0) {
      await editor.click();
      await randomDelay(500, 1000);

      // Split into paragraphs and type each
      const paragraphs = post.split("\n");
      for (let i = 0; i < paragraphs.length; i++) {
        const para = paragraphs[i].trim();
        if (!para) {
          await page.keyboard.press("Enter");
          continue;
        }
        await page.keyboard.type(para, { delay: 20 + Math.random() * 30 });
        if (i < paragraphs.length - 1) {
          await page.keyboard.press("Enter");
          if (paragraphs[i + 1]?.trim()) {
            await page.keyboard.press("Enter");
          }
        }
        await randomDelay(100, 300);
      }

      await randomDelay(1500, 2500);

      // Click Post button
      const postBtn = page.locator('button:has-text("Post"), button:has-text("Opublikuj")').last();
      if (await postBtn.count() > 0) {
        await postBtn.click();
        await randomDelay(3000, 5000);
        console.log("[content] Post published successfully.");
      }
    } else {
      console.log("[content] ⚠️  Post editor not found — posting skipped.");
    }
  } finally {
    await browser.close();
    console.log("[content] Browser closed.");
  }

  return { topic: selectedTopic, post, published: true };
}

module.exports = { createAndPublishPost, TOPICS };
