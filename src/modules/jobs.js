"use strict";

const { createSession, randomDelay } = require("../browser");
const { analyzeJobFit, generateFormAnswer } = require("../ai");

const SEARCH_QUERIES = [
  "Prompt Engineer",
  "AI Automation Specialist",
  "Automation Engineer no-code",
  "AI Integration Developer",
  "Process Automation Lead",
];

const MIN_SCORE_TO_APPLY = 65;

/**
 * Search LinkedIn Jobs and optionally auto-apply to matching positions.
 * @param {Object} opts
 * @param {string[]} [opts.queries] - Search queries
 * @param {number} [opts.maxResults] - Max jobs to evaluate per query
 * @param {boolean} [opts.autoApply] - If true, auto-apply to high-score matches
 * @returns {Promise<Array<{title: string, company: string, score: number, applied: boolean}>>}
 */
async function searchAndApply({ queries, maxResults = 10, autoApply = false } = {}) {
  const searchQueries = queries || SEARCH_QUERIES;
  const results = [];

  console.log("[jobs] Launching browser...");
  const { page, browser } = await createSession();

  try {
    for (const q of searchQueries) {
      console.log(`[jobs] Searching: "${q}"`);
      const encoded = encodeURIComponent(q);
      await page.goto(
        `https://www.linkedin.com/jobs/search/?keywords=${encoded}&location=Poland&f_TPR=r604800`,
        { waitUntil: "networkidle", timeout: 30000 }
      );
      await randomDelay(3000, 5000);

      for (let i = 0; i < 3; i++) {
        await page.keyboard.press("End");
        await randomDelay(1000, 2000);
      }

      const jobCards = page.locator("li.jobs-search-results__list-item, div.job-card-container");

      const count = Math.min(await jobCards.count(), maxResults);
      console.log(`[jobs] Found ~${count} listings. Evaluating...`);

      for (let i = 0; i < count; i++) {
        const card = jobCards.nth(i);
        try {
          await card.click();
          await randomDelay(1500, 3000);

          const title = await page.locator("h1.job-details-jobs-unified-top-card__job-title, h2.t-24").first().textContent().catch(() => "");

          const company = await page.locator("a.job-details-jobs-unified-top-card__company-name, span.job-details-jobs-unified-top-card__company-name").first().textContent().catch(() => "Unknown");

          const description = await page.locator("div.jobs-description__content, div.job-view-layout").first().textContent().catch(() => "");

          if (!title.trim() || !description.trim()) {
            continue;
          }

          console.log(`[jobs]   Analyzing: ${title.trim()} @ ${company.trim()}`);

          const analysis = await analyzeJobFit({
            title: title.trim(),
            description: description.trim(),
            company: company.trim(),
          });

          console.log(`[jobs]   Score: ${analysis.score}/100`);

          let applied = false;
          if (autoApply && analysis.score >= MIN_SCORE_TO_APPLY) {
            console.log(`[jobs]   ✅ High match! Attempting to apply...`);
            applied = await attemptApply(page, {
              jobTitle: title.trim(),
              company: company.trim(),
            });
            console.log(`[jobs]   Applied: ${applied}`);
          }

          results.push({
            title: title.trim(),
            company: company.trim(),
            score: analysis.score,
            reasoning: analysis.reasoning,
            coverLetter: analysis.coverLetter,
            applied,
          });

          await randomDelay(1000, 2500);
        } catch (e) {
          console.error(`[jobs]   Error processing card ${i}: ${e.message}`);
        }
      }
    }
  } finally {
    await browser.close();
    console.log("[jobs] Browser closed.");
  }

  results.sort((a, b) => b.score - a.score);
  return results;
}

// ── Level 2: Dynamic form answer engine ──────────────────────────────────────

/**
 * Attempt to complete Easy Apply including dynamic text questions.
 * Detects custom text fields, sends questions to DeepSeek, fills answers.
 */
async function attemptApply(page, { jobTitle, company }) {
  try {
    const applyBtn = page.locator('button:has-text("Easy Apply"), button:has-text("Aplikuj"), button:has-text("Apply")').first();
    if (await applyBtn.count() === 0) {
      console.log("[jobs]     No apply button found. Skipping.");
      return false;
    }

    await applyBtn.click();
    await randomDelay(1500, 3000);

    for (let step = 0; step < 8; step++) {
      // ── Dynamic form question detection ──────────────────────────────────
      const handled = await handleFormQuestions(page, jobTitle, company);
      if (handled) {
        await randomDelay(1000, 2000);
        continue; // questions were answered, try moving to next step
      }

      const nextBtn = page.locator('button:has-text("Next"), button:has-text("Dalej"), button:has-text("Review"), button:has-text("Przejrzyj")').first();
      const submitBtn = page.locator('button:has-text("Submit"), button:has-text("Wyślij"), button:has-text("Submit application")').first();

      if (await submitBtn.count() > 0) {
        await submitBtn.click();
        await randomDelay(2000, 4000);
        console.log("[jobs]     Application submitted.");
        return true;
      }

      if (await nextBtn.count() > 0) {
        await nextBtn.click();
        await randomDelay(1000, 2500);
        continue;
      }

      break;
    }

    const dismissBtn = page.locator('button[aria-label="Dismiss"], button:has-text("Dismiss"), button:has-text("Anuluj")').first();
    if (await dismissBtn.count() > 0) {
      await dismissBtn.click();
      await randomDelay(500, 1000);
    }

    return false;
  } catch (e) {
    console.error(`[jobs]     Apply error: ${e.message}`);
    return false;
  }
}

/**
 * Scan the current Easy Apply modal for custom text questions,
 * generate AI answers, and fill them in.
 */
async function handleFormQuestions(page, jobTitle, company) {
  let handled = false;

  // Look for text inputs and textareas
  const textInputs = page.locator(
    'input[type="text"]:not([aria-label*="name"]):not([aria-label*="email"]):not([aria-label*="phone"]), textarea:not([aria-label*="message"])'
  );

  const inputCount = await textInputs.count();
  for (let i = 0; i < inputCount; i++) {
    const input = textInputs.nth(i);
    const isVisible = await input.isVisible().catch(() => false);
    if (!isVisible) continue;

    const value = await input.inputValue().catch(() => "");
    if (value.trim()) continue; // already filled

    // Find the associated label/question
    let questionText = "";

    // Try aria-labelledby
    const labelledBy = await input.getAttribute("aria-labelledby").catch(() => "");
    if (labelledBy) {
      questionText = await page.locator(`#${labelledBy}`).textContent().catch(() => "");
    }

    // Try parent label
    if (!questionText) {
      const parentLabel = input.locator("..").locator("label, span.form-label, legend").first();
      questionText = await parentLabel.textContent().catch(() => "");
    }

    // Try preceding sibling
    if (!questionText) {
      questionText = await input.locator("..").locator("..").locator("label, span.t-14, h3").first().textContent().catch(() => "");
    }

    if (!questionText || questionText.length < 3) continue;

    console.log(`[jobs]     📝 Dynamic question: "${questionText.slice(0, 100)}..."`);

    try {
      const answer = await generateFormAnswer({
        question: questionText.trim(),
        jobTitle,
        company,
      });

      console.log(`[jobs]     🤖 AI answer (${answer.length} chars)`);
      await input.click();
      await randomDelay(200, 500);
      await input.fill(answer);
      await randomDelay(300, 800);
      handled = true;
    } catch (e) {
      console.error(`[jobs]     ❌ Failed to answer question: ${e.message}`);
    }
  }

  // Also check for radio / select questions
  const selects = page.locator("select:not([hidden])");
  const selectCount = await selects.count();
  for (let i = 0; i < selectCount; i++) {
    const select = selects.nth(i);
    const isVisible = await select.isVisible().catch(() => false);
    if (!isVisible) continue;

    const currentVal = await select.inputValue().catch(() => "");
    if (currentVal && currentVal !== "Select an option" && currentVal !== "Wybierz") continue;

    // Pick the first real option (skip placeholder)
    const options = select.locator("option");
    const optCount = await options.count();
    for (let j = 0; j < optCount; j++) {
      const optVal = await options.nth(j).getAttribute("value").catch(() => "");
      if (optVal && optVal !== "Select an option" && optVal !== "Wybierz" && optVal !== "") {
        await select.selectOption(optVal);
        handled = true;
        break;
      }
    }
  }

  return handled;
}

module.exports = { searchAndApply, SEARCH_QUERIES };
