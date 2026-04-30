"use strict";

const { createSession, randomDelay } = require("../browser");
const { generateAbout } = require("../ai");

/**
 * Update the "About" (O mnie) section on the authenticated LinkedIn profile.
 * @param {Object} opts
 * @param {string[]} opts.achievements - recent career highlights
 * @param {string} opts.name - full name override (defaults to reading from profile)
 */
async function updateAboutSection({ achievements, name, currentRole } = {}) {
  console.log("[profile] Launching browser session...");
  const { page, browser } = await createSession();

  try {
    console.log("[profile] Navigating to profile page...");
    await page.goto("https://www.linkedin.com/in/me/", { waitUntil: "networkidle", timeout: 30000 });
    await randomDelay(2000, 4000);

    // Read current name if not provided
    if (!name) {
      name = await page.locator("h1.text-heading-xlarge").first().textContent().catch(() => "Specjalista AI");
    }

    console.log(`[profile] Generating updated About for: ${name}`);
    const aboutText = await generateAbout({
      name: name.trim(),
      achievements: achievements || [
        "Wdrożenie hybrydowego sklepu internetowego Medusa.js + Next.js z pełną automatyzacją procesów",
        "Redukcja kosztów operacyjnych o 40% dzięki automatyzacji procesów biznesowych (Make, n8n, Node.js)",
        "Integracja DeepSeek v4 Pro do analizy danych sprzedażowych i personalizacji ofert w e-commerce",
      ],
      currentRole: currentRole || "AI Automation Engineer",
    });

    console.log("[profile] About text generated. Updating on LinkedIn...");

    // Click the edit (pencil) button on the About section
    const aboutSection = page.locator("#about, [data-section='summary']");
    const editBtn = page.locator('button[aria-label*="Edit"], button:has-text("Edit")').first();

    // LinkedIn UI varies — try multiple strategies
    try {
      await page.locator('a[href*="/edit/"]').first().click();
    } catch {
      // Fallback: directly navigate to edit intro
      await page.goto("https://www.linkedin.com/in/me/edit/intro/", {
        waitUntil: "networkidle",
        timeout: 20000,
      });
    }

    await randomDelay(1500, 3000);

    // Find the summary/About textarea
    const summaryTextarea = page.locator("textarea#summary, textarea[name='summary']");
    if (await summaryTextarea.count() > 0) {
      await summaryTextarea.click();
      await randomDelay(300, 600);
      // Clear existing
      await summaryTextarea.fill("");
      await randomDelay(200, 400);
      await summaryTextarea.type(aboutText, { delay: 15 });
      await randomDelay(1000, 2000);

      // Save
      const saveBtn = page.locator('button[type="submit"], button:has-text("Save"), button:has-text("Zapisz")').first();
      if (await saveBtn.count() > 0) {
        await saveBtn.click();
        await randomDelay(2000, 4000);
        console.log("[profile] About section updated successfully.");
      }
    } else {
      console.log("[profile] ⚠️  Could not find About textarea. LinkedIn UI may have changed.");
      console.log("[profile] Generated About text (save manually):");
      console.log("─".repeat(50));
      console.log(aboutText);
      console.log("─".repeat(50));
    }
  } finally {
    await browser.close();
    console.log("[profile] Browser closed.");
  }

  return true;
}

module.exports = { updateAboutSection };
