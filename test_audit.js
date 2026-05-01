#!/usr/bin/env node
"use strict";

const path = require("path");
const fs = require("fs");
const OpenAI = require("openai");
const inquirer = require("inquirer");
require("dotenv").config({ path: path.join(__dirname, ".env") });

const { browserManager, waitForHuman } = require("./src/browser");
const { showWelcomeBanner } = require("./src/utils/ui");
const { logAction, startSession, completeSession } = require("./src/utils/memory");

const TARGET_PROFILE = process.argv[2] || process.env.LINKEDIN_PROFILE_URL;
if (!TARGET_PROFILE) {
  console.error("[audit] Usage: node test_audit.js <linkedin-profile-url>  (or set LINKEDIN_PROFILE_URL in .env)");
  process.exit(1);
}

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY || "sk-placeholder",
  baseURL: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com/v1",
});
const MODEL = process.env.DEEPSEEK_MODEL || "deepseek-chat";

// ── Scrape LinkedIn About section ────────────────────────────────────────────

async function scrapeAbout(page) {
  console.log("[audit] Scraping About section...");

  // Wait for the profile to render — try multiple selectors
  const aboutSelectors = [
    "#about",
    "[data-section='summary']",
    "section.artdeco-card",
    "div.display-flex.ph5.pv3",
    "div.pv-shared-text-with-see-more",
    "span[aria-hidden='true']",
  ];

  // LinkedIn renders About in a div inside the profile card
  // Strategy: find a section that contains text about experience/summary
  const allText = await page.evaluate(() => {
    // LinkedIn shows the About section in a dedicated card
    // Try to find the "About" heading and grab its sibling content
    const sections = document.querySelectorAll("section");
    for (const section of sections) {
      const heading = section.querySelector("h2, h3, span.t-bold");
      if (heading && /about|o mnie|summary|informacje/i.test(heading.textContent)) {
        const content = section.querySelector("div.inline-show-more-text, div.pv-shared-text-with-see-more, span[aria-hidden='true']");
        if (content) return content.textContent.trim();
        // Fallback: return the whole section text
        return section.textContent.trim();
      }
    }
    // Last resort: grab the main profile content area
    const main = document.querySelector("main");
    if (main) {
      const text = main.textContent.trim();
      // Return first 2000 chars as a rough snapshot
      return text.slice(0, 2000);
    }
    return "";
  });

  if (!allText || allText.length < 20) {
    console.warn("[audit] Could not find About section. Page may require login.");
    return null;
  }

  console.log(`[audit] Scraped ${allText.length} chars from profile.`);
  return allText.slice(0, 3000); // keep first 3000 chars max
}

// ── Read resume markdown ─────────────────────────────────────────────────────

async function readResume() {
  const defaultPath = path.join(__dirname, "data", "resume.md");

  if (fs.existsSync(defaultPath)) {
    const content = fs.readFileSync(defaultPath, "utf-8");
    console.log(`[audit] Loaded resume: ${content.split("\n").length} lines from data/resume.md`);
    return content;
  }

  console.warn(`[audit] Default resume not found: ${defaultPath}`);

  // Interactive prompt
  const { action } = await inquirer.prompt([
    {
      type: "list",
      name: "action",
      message: "Resume file not found. How would you like to proceed?",
      choices: [
        { name: "📂  Enter a file path manually", value: "path" },
        { name: "📋  List .md files in the current directory", value: "list" },
        { name: "⚡  Continue with a fallback profile (AI-generated)", value: "fallback" },
      ],
    },
  ]);

  if (action === "path") {
    const { filePath } = await inquirer.prompt([
      {
        type: "input",
        name: "filePath",
        message: "Enter the full path to your resume (.md):",
        validate: (input) => {
          if (!input.trim()) return "Path cannot be empty.";
          if (!fs.existsSync(input.trim())) return `File not found: ${input}`;
          return true;
        },
      },
    ]);
    const content = fs.readFileSync(filePath.trim(), "utf-8");
    console.log(`[audit] Loaded resume: ${content.split("\n").length} lines from ${filePath}`);
    return content;
  }

  if (action === "list") {
    const cwd = process.cwd();
    const mdFiles = fs.readdirSync(cwd).filter((f) => f.endsWith(".md"));
    if (mdFiles.length === 0) {
      console.warn(`[audit] No .md files found in ${cwd}`);
      return readResume(); // recurse to fallback
    }
    const { selected } = await inquirer.prompt([
      {
        type: "list",
        name: "selected",
        message: "Select a .md file:",
        choices: mdFiles.map((f) => ({ name: f, value: path.join(cwd, f) })),
      },
    ]);
    const content = fs.readFileSync(selected, "utf-8");
    console.log(`[audit] Loaded resume: ${content.split("\n").length} lines from ${selected}`);
    return content;
  }

  // Fallback
  console.log("[audit] Using AI-generated fallback profile.");
  return "Kandydat: AI Automation Architect | Stack: DeepSeek V4 Pro, Kimi K2.6, Playwright, Medusa.js | Specjalizacja: autonomiczne agenty AI, RevOps, e-commerce | Ostatnie projekty: Onyks Store (ISR <50ms), Colwork Agent (LinkedIn automation)";
}

// ── DeepSeek audit prompt ────────────────────────────────────────────────────

async function auditProfile(linkedinText, resumeMd) {
  if (!linkedinText || linkedinText.length < 20) {
    return "[audit] ❌ Nie udało się pobrać sekcji 'O mnie' z LinkedIn. Sprawdź, czy profil wymaga logowania — uruchom `node index.js login` wcześniej.";
  }

  const prompt = `Jesteś AI Automation Architectem.

Oto OBECNA sekcja 'O mnie' z profilu LinkedIn kandydata:
"""
${linkedinText}
"""

A oto DOCELOWE CV kandydata (format Markdown):
"""
${resumeMd}
"""

Wykonaj analizę:
1. Wypisz 3 KLUCZOWE RÓŻNICE między starym profilem a docelowym CV.
2. Wyjaśnij, DLACZEGO nowy profil mocniej pozycjonuje kandydata w branży AI i RevOps.
3. Podaj jedną konkretną REKOMENDACJĘ co zmienić w sekcji 'O mnie' na LinkedIn.

Format odpowiedzi: krótkie akapity, po polsku, profesjonalnie, zwięźle. BEZ markdowna.`;

  console.log("[audit] Sending to DeepSeek for analysis...\n");

  const resp = await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: "Jesteś karierowym audytorem AI. Odpowiadasz zwięźle po polsku." },
      { role: "user", content: prompt },
    ],
    temperature: 0.5,
    max_tokens: 1200,
  });

  return resp.choices[0].message.content.trim();
}

// ── Main ─────────────────────────────────────────────────────────────────────

(async () => {
  showWelcomeBanner();
  console.log(`  Target: ${TARGET_PROFILE}\n`);

  try {
    // 0. Start memory session
    startSession("profile_audit");

    // 1. Start browser
    console.log("[audit] Starting stealth browser...");
    const page = await browserManager.start();

    // 2. Navigate to profile
    console.log(`[audit] Navigating to: ${TARGET_PROFILE}`);
    await page.goto(TARGET_PROFILE, { waitUntil: "domcontentloaded", timeout: 60000 });

    // 3. Wait a moment for dynamic rendering
    const { randomDelay } = require("./src/browser");
    await randomDelay(2000, 4000);

    // 4. Scrape About section
    const linkedinText = await scrapeAbout(page);

    // 5. Read resume (interactive if not found)
    const resumeMd = await readResume();

    // 6. AI Analysis
    const result = await auditProfile(linkedinText, resumeMd);

    // 7. Output
    console.log("\n" + "─".repeat(60));
    console.log("  DEEPSEEK AUDIT RESULT");
    console.log("─".repeat(60));
    console.log(result);
    console.log("─".repeat(60));

    // 7a. Log to memory
    logAction("audit", { profile: TARGET_PROFILE, resumeLines: resumeMd.split("\n").length, resultLength: result.length });
    completeSession({ status: "success", profile: TARGET_PROFILE });

    // 8. Interactive: PDF + email
    const { generatePDF, sendEmail } = require("./src/modules/reporting");

    const reportEmail = process.env.REPORT_EMAIL_TO;
    const { sendReport } = await inquirer.prompt([
      {
        type: "confirm",
        name: "sendReport",
        message: reportEmail
          ? `Wygenerować raport PDF i wysłać na email ${reportEmail}?`
          : "Wygenerować raport PDF? (REPORT_EMAIL_TO not set — PDF only, no email)",
        default: true,
      },
    ]);

    if (sendReport) {
      console.log("\n[audit] Generating PDF report...");
      const pdfPath = await generatePDF({
        title: `Colwork Profile Audit — ${TARGET_PROFILE}`,
        content: `# Colwork Profile Audit\n\n**Target:** ${TARGET_PROFILE}\n**Date:** ${new Date().toISOString()}\n\n## DeepSeek Analysis\n\n${result}`,
      });
      console.log(`[audit] PDF saved: ${pdfPath}`);

      if (reportEmail) {
        console.log("[audit] Sending email...");
        await sendEmail(pdfPath, reportEmail);
      } else {
        console.log("[audit] No REPORT_EMAIL_TO env var — skipping email send.");
      }
    } else {
      console.log("[audit] Report skipped.");
    }

  } catch (e) {
    console.error(`\n[audit] ❌ Error: ${e.message}`);
    console.error(`[audit] Stack: ${e.stack?.slice(0, 500)}`);
    console.log("");
    console.log("╔══════════════════════════════════════════════════════════════╗");
    console.log("║  🐞  BROWSER POZOSTAJE OTWARTY                              ║");
    console.log("║                                                            ║");
    console.log("║  Sprawdź okno przeglądarki, aby zdiagnozować problem.      ║");
    console.log("║  Naciśnij ENTER, aby zamknąć przeglądarkę i zakończyć...   ║");
    console.log("╚══════════════════════════════════════════════════════════════╝");
    console.log("");
    await waitForHuman("⏳ [oczekiwanie na ENTER...] ");
  }
  // 8. Cleanup (always runs — after success or after ENTER on error)
  await browserManager.stop();
  console.log("\n[audit] Done.");
})();
