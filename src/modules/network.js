"use strict";

const { createSession, randomDelay } = require("../browser");
const { generateInviteMessage } = require("../ai");

const TARGET_ROLES = [
  "CTO",
  "CEO",
  "Founder",
  "Chief Technology Officer",
  "Chief Executive Officer",
  "Co-Founder",
  "VP of Engineering",
  "Head of AI",
  "Head of Product",
  "Engineering Manager",
];

const MY_ROLE = "AI Automation Engineer | DeepSeek • Playwright • Medusa.js";

/**
 * Search LinkedIn for people with specific roles in Poland,
 * read their profile headline, generate a personalized invite message via DeepSeek,
 * and send a connection request.
 *
 * @param {Object} opts
 * @param {string[]} [opts.roles] - Target job titles
 * @param {number} [opts.maxInvites] - Max invites to send (default: 5)
 * @param {boolean} [opts.dryRun] - If true, generate messages without sending
 * @returns {Promise<Array<{name: string, title: string, message: string, sent: boolean}>>}
 */
async function smartNetwork({ roles, maxInvites = 5, dryRun = false } = {}) {
  const targets = roles || TARGET_ROLES;
  const results = [];

  console.log("[network] Launching browser for smart networking...");
  const { page, browser } = await createSession();

  try {
    let sent = 0;

    for (const role of targets) {
      if (sent >= maxInvites) break;

      console.log(`[network] Searching: "${role}" in Poland...`);
      const encoded = encodeURIComponent(role);
      await page.goto(
        `https://www.linkedin.com/search/results/people/?keywords=${encoded}&geoUrn=%5B%22101286278%22%5D&currentCompany=%5B%5D&network=%5B%22S%22%5D`,
        { waitUntil: "networkidle", timeout: 30000 }
      );
      await randomDelay(3000, 5000);

      // Scroll to load results
      for (let i = 0; i < 2; i++) {
        await page.keyboard.press("End");
        await randomDelay(1000, 2000);
      }

      // Collect profile cards
      const cards = page.locator(
        "li.reusable-search__result-container, div.entity-result, div.search-result"
      );
      const cardCount = Math.min(await cards.count(), 5);

      for (let i = 0; i < cardCount && sent < maxInvites; i++) {
        const card = cards.nth(i);
        try {
          // Read profile name
          const nameEl = card.locator(
            "span.entity-result__title-text a, span[dir='ltr'] span[aria-hidden='true'], a.app-aware-link span[aria-hidden='true']"
          ).first();
          const name = (await nameEl.textContent().catch(() => ""))
            .trim()
            .split(" ")[0] + " " + ((await nameEl.textContent().catch(() => "")) || "").trim().split(" ").slice(1).join(" ");

          // Read headline
          const headlineEl = card.locator(
            "div.entity-result__primary-subtitle, div.mb1"
          ).first();
          const headline = (await headlineEl.textContent().catch(() => "")).trim();

          // Read company name from card
          const companyEl = card.locator(
            "div.entity-result__secondary-subtitle, p.entity-result__secondary-subtitle"
          ).first();
          const company = (await companyEl.textContent().catch(() => "")).trim();

          if (!name || name.length < 3) continue;

          console.log(`[network]   Target: ${name} | ${headline.slice(0, 60)}...`);

          // Generate personalized message
          const message = await generateInviteMessage({
            targetName: name.trim(),
            targetTitle: headline.slice(0, 120),
            targetCompany: company.slice(0, 80),
            myRole: MY_ROLE,
          });

          console.log(`[network]   Message (${message.length} chars): "${message.slice(0, 80)}..."`);

          if (!dryRun) {
            // Click Connect button on the card
            const connectBtn = card.locator(
              'button:has-text("Connect"), button:has-text("Zaproś"), button:has-text("Nawiąż kontakt")'
            ).first();

            if (await connectBtn.count() > 0) {
              await connectBtn.click();
              await randomDelay(1000, 2000);

              // Click "Add a note" / "Dodaj notatkę"
              const addNoteBtn = page.locator(
                'button:has-text("Add a note"), button:has-text("Dodaj notatkę")'
              ).first();
              if (await addNoteBtn.count() > 0) {
                await addNoteBtn.click();
                await randomDelay(500, 1000);

                // Type the message
                const noteArea = page.locator(
                  "textarea#custom-message, textarea[name='message']"
                ).first();
                if (await noteArea.count() > 0) {
                  await noteArea.click();
                  await randomDelay(200, 500);
                  await noteArea.fill(message);
                  await randomDelay(500, 1000);

                  // Send invitation
                  const sendBtn = page.locator(
                    'button:has-text("Send"), button:has-text("Wyślij"), button[aria-label*="Send"]'
                  ).first();
                  if (await sendBtn.count() > 0) {
                    await sendBtn.click();
                    await randomDelay(1500, 3000);
                    sent++;
                    console.log(`[network]   ✅ Invite sent to ${name}`);
                    results.push({ name: name.trim(), title: headline, message, sent: true });
                  }
                }
              }
            } else {
              console.log(`[network]   ⏭️  No Connect button — may already be connected`);
              results.push({ name: name.trim(), title: headline, message, sent: false });
            }
          } else {
            // Dry run — just record
            console.log(`[network]   📝 DRY RUN — message generated, not sent.`);
            results.push({ name: name.trim(), title: headline, message, sent: false });
            sent++; // count dry runs toward limit for demo purposes
          }

          await randomDelay(2000, 4000);
        } catch (e) {
          console.error(`[network]   Error on card ${i}: ${e.message}`);
        }
      }
    }
  } finally {
    await browser.close();
    console.log("[network] Browser closed.");
  }

  console.log(
    `[network] Done. ${results.filter((r) => r.sent).length} invites sent, ${results.length} total.`
  );
  return results;
}

module.exports = { smartNetwork, TARGET_ROLES };
