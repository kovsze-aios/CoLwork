"use strict";

const path = require("path");
const fs = require("fs");
const { browserManager, randomDelay } = require("../browser");
const { analyzeJobFit, generateFormAnswer } = require("../ai");
const { safe } = require("../utils/retry");
const { clean } = require("../utils/clean");

const SEARCH_QUERIES = [
  "Prompt Engineer",
  "AI Automation Specialist",
  "Automation Engineer no-code",
  "AI Integration Developer",
  "Process Automation Lead",
];

const MIN_SCORE_TO_APPLY = 65;
const SKIPPED_LOG = path.resolve(__dirname, "..", "..", "data", "skipped_jobs.log");

function logSkipped(reason, ctx) {
  try {
    fs.mkdirSync(path.dirname(SKIPPED_LOG), { recursive: true });
    fs.appendFileSync(SKIPPED_LOG, `${new Date().toISOString()}\t${reason}\t${JSON.stringify(ctx).slice(0, 400)}\n`);
  } catch { /* never crash on logging */ }
}

async function searchAndApply({ queries, maxResults = 10, autoApply = false } = {}) {
  const searchQueries = queries?.length ? queries : SEARCH_QUERIES;
  const results = [];
  let page;

  try {
    page = await browserManager.start();
  } catch (e) {
    logSkipped("browser_start_failed", { error: e.message });
    return [];
  }

  try {
    for (const q of searchQueries) {
      const navOk = await safe(async () => {
        await page.goto(
          `https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(q)}&location=Poland&f_TPR=r604800`,
          { waitUntil: "domcontentloaded", timeout: 30000 }
        );
        return true;
      }, false, "jobs.nav");
      if (!navOk) { logSkipped("nav_failed", { query: q }); continue; }

      await randomDelay(2500, 4500);
      await safe(async () => {
        for (let i = 0; i < 3; i++) {
          await page.keyboard.press("End");
          await randomDelay(800, 1700);
        }
      }, null, "jobs.scroll");

      const jobCards = page.locator("li.jobs-search-results__list-item, div.job-card-container");
      const count = Math.min(await safe(() => jobCards.count(), 0, "jobs.count"), maxResults);
      console.log(`[jobs] "${q}" → ${count} listings`);

      for (let i = 0; i < count; i++) {
        const card = jobCards.nth(i);
        try {
          await safe(() => card.click({ timeout: 5000 }), null, "jobs.click");
          await randomDelay(1300, 2500);

          const title = clean(await safe(() => page.locator("h1.job-details-jobs-unified-top-card__job-title, h2.t-24").first().textContent(), "", "jobs.title"), { oneLine: true, max: 150 });
          const company = clean(await safe(() => page.locator("a.job-details-jobs-unified-top-card__company-name, span.job-details-jobs-unified-top-card__company-name").first().textContent(), "", "jobs.company"), { oneLine: true, max: 80 });
          const description = clean(await safe(() => page.locator("div.jobs-description__content, div.job-view-layout").first().textContent(), "", "jobs.desc"), { max: 1200 });

          if (!title || !description) { logSkipped("empty_listing", { query: q, idx: i }); continue; }

          let analysis;
          try {
            analysis = await analyzeJobFit({ title, description, company });
          } catch (e) {
            logSkipped("ai_analysis_failed", { query: q, title, error: e.message?.slice(0, 120) });
            continue;
          }

          let applied = false;
          if (autoApply && analysis.score >= MIN_SCORE_TO_APPLY) {
            applied = await attemptApply(page, { jobTitle: title, company }).catch((e) => {
              logSkipped("apply_error", { title, error: e.message?.slice(0, 120) });
              return false;
            });
          }

          results.push({ title, company, score: analysis.score, reasoning: analysis.reasoning, coverLetter: analysis.coverLetter, applied });
          console.log(`[jobs] ${analysis.score}/100 ${title} @ ${company}${applied ? " ✓ applied" : ""}`);
          await randomDelay(900, 2200);
        } catch (e) {
          logSkipped("card_error", { query: q, idx: i, error: e.message?.slice(0, 120) });
          console.warn(`[jobs] card ${i} skipped — ${e.message?.slice(0, 80)}`);
        }
      }
    }
  } finally {
    await safe(() => browserManager.stop(), null, "browser.stop");
  }

  results.sort((a, b) => b.score - a.score);
  return results;
}

async function attemptApply(page, { jobTitle, company }) {
  const applyBtn = page.locator('button:has-text("Easy Apply"), button:has-text("Aplikuj"), button:has-text("Apply")').first();
  if (!(await applyBtn.count())) return false;

  await applyBtn.click({ timeout: 5000 });
  await randomDelay(1300, 2500);

  for (let step = 0; step < 8; step++) {
    const handled = await handleFormQuestions(page, jobTitle, company).catch(() => false);
    if (handled) { await randomDelay(900, 1700); continue; }

    const submitBtn = page.locator('button:has-text("Submit"), button:has-text("Wyślij"), button:has-text("Submit application")').first();
    if (await submitBtn.count()) {
      await submitBtn.click({ timeout: 5000 });
      await randomDelay(1800, 3500);
      return true;
    }

    const nextBtn = page.locator('button:has-text("Next"), button:has-text("Dalej"), button:has-text("Review"), button:has-text("Przejrzyj")').first();
    if (await nextBtn.count()) {
      await nextBtn.click({ timeout: 5000 });
      await randomDelay(900, 2000);
      continue;
    }
    break;
  }

  const dismissBtn = page.locator('button[aria-label="Dismiss"], button:has-text("Anuluj")').first();
  if (await dismissBtn.count()) {
    await dismissBtn.click({ timeout: 3000 }).catch(() => {});
  }
  return false;
}

async function handleFormQuestions(page, jobTitle, company) {
  let handled = false;

  const textInputs = page.locator(
    'input[type="text"]:not([aria-label*="name"]):not([aria-label*="email"]):not([aria-label*="phone"]), textarea:not([aria-label*="message"])'
  );
  const inputCount = await safe(() => textInputs.count(), 0, "form.count");

  for (let i = 0; i < inputCount; i++) {
    const input = textInputs.nth(i);
    if (!(await input.isVisible().catch(() => false))) continue;
    const value = await input.inputValue().catch(() => "");
    if (value.trim()) continue;

    let q = "";
    const labelledBy = await input.getAttribute("aria-labelledby").catch(() => "");
    if (labelledBy) q = await page.locator(`#${labelledBy}`).textContent().catch(() => "");
    if (!q) q = await input.locator("..").locator("label, span.form-label, legend").first().textContent().catch(() => "");
    if (!q) q = await input.locator("..").locator("..").locator("label, span.t-14, h3").first().textContent().catch(() => "");
    q = clean(q, { oneLine: true, max: 240 });
    if (q.length < 3) continue;

    try {
      const answer = await generateFormAnswer({ question: q, jobTitle, company });
      await input.click({ timeout: 3000 });
      await input.fill(answer);
      handled = true;
      await randomDelay(300, 700);
    } catch (e) {
      logSkipped("form_answer_failed", { question: q.slice(0, 60), error: e.message?.slice(0, 80) });
    }
  }

  const selects = page.locator("select:not([hidden])");
  const selectCount = await safe(() => selects.count(), 0, "form.selects");
  for (let i = 0; i < selectCount; i++) {
    const select = selects.nth(i);
    if (!(await select.isVisible().catch(() => false))) continue;
    const currentVal = await select.inputValue().catch(() => "");
    if (currentVal && !["Select an option", "Wybierz", ""].includes(currentVal)) continue;

    const options = select.locator("option");
    const optCount = await safe(() => options.count(), 0, "form.options");
    for (let j = 0; j < optCount; j++) {
      const optVal = await options.nth(j).getAttribute("value").catch(() => "");
      if (optVal && !["Select an option", "Wybierz", ""].includes(optVal)) {
        await select.selectOption(optVal).catch(() => {});
        handled = true;
        break;
      }
    }
  }

  return handled;
}

module.exports = { searchAndApply, SEARCH_QUERIES };
