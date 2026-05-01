"use strict";

// Sherlock — OSINT Module
// Scrapes company data, tech blogs, and news before job applications.
// Matches candidate profile to company culture and tech stack.

const { client, MODEL } = require("../ai");
const { withRetry } = require("../utils/retry");

/**
 * Investigate a company — gather public intelligence for job targeting.
 * Uses Playwright to scrape the company website + LinkedIn, then AI to synthesize.
 *
 * @param {import("playwright").Page} page - Authenticated browser page
 * @param {object} target
 * @param {string} target.company - Company name
 * @param {string} [target.companyUrl] - Company website URL
 * @param {string} [target.linkedinUrl] - LinkedIn company page
 * @returns {Promise<{culture: string, techStack: string[], recentNews: string[], painPoints: string[], strategy: string}>}
 */
async function investigate(page, target) {
  const findings = { culture: "", techStack: [], recentNews: [], painPoints: [], rawText: "" };

  // 1. Scrape company LinkedIn page if URL provided
  if (target.linkedinUrl) {
    try {
      await page.goto(target.linkedinUrl, { waitUntil: "domcontentloaded", timeout: 20000 });
      findings.rawText += await page.evaluate(() => {
        const about = document.querySelector("section.artdeco-card p, div.organization-outlet p, div.org-about-us-organization-description__text");
        return about?.textContent?.trim()?.slice(0, 1500) || "";
      });
    } catch { /* non-critical */ }
  }

  // 2. Scrape company website if URL provided
  if (target.companyUrl) {
    try {
      await page.goto(target.companyUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
      findings.rawText += " " + (await page.evaluate(() => {
        return document.querySelector("meta[name='description']")?.getAttribute("content")
          || document.body?.innerText?.slice(0, 2000) || "";
      }));
    } catch { /* non-critical */ }
  }

  if (!findings.rawText.trim()) {
    findings.rawText = `Company: ${target.company}. No additional data scraped.`;
  }

  // 3. AI synthesis
  const prompt = `Przeanalizuj dane o firmie i zwróć JSON z kluczowymi informacjami dla kandydata:

Firma: ${target.company}
Dane: ${findings.rawText.slice(0, 3000)}

Zwróć JSON:
{
  "culture": "<1 zdanie — jaka kultura pracy>",
  "techStack": ["<technologia 1>", "<technologia 2>", ...],
  "recentNews": ["<news 1>", "<news 2>", ...],
  "painPoints": ["<problem 1>", "<problem 2>", ...],
  "strategy": "<1 zdanie — jak podejść do rekrutacji>"
}

Jeśli brak danych — zwróć puste tablice i "Brak danych.".
TYLKO JSON.`;

  try {
    const resp = await withRetry(() => client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: "Jesteś Sherlock — analityk OSINT CoLwork. Odpowiadasz TYLKO JSON." },
        { role: "user", content: prompt },
      ],
      temperature: 0.4,
      max_tokens: 600,
      response_format: { type: "json_object" },
    }), { retries: 2, label: "sherlock.investigate" });

    const parsed = JSON.parse(resp.choices[0].message.content);
    return { ...findings, ...parsed };
  } catch {
    return {
      culture: "Nieznana — brak danych",
      techStack: [],
      recentNews: [],
      painPoints: [],
      strategy: "Standardowe podejście — podkreśl AI i automatyzację.",
    };
  }
}

module.exports = { investigate };
