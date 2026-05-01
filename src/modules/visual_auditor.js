"use strict";

const { client, MODEL } = require("../ai");
const { tryJSON } = require("../utils/clean");
const { withRetry } = require("../utils/retry");

const COLWORK_BRAND = "czerń (#0a0a0a), cyjan (#00bcd4), fiolet (#6b21a8), bursztyn (#d9a82f) — minimalizm, tech, premium";

async function auditVisualBranding(page, profileUrl) {
  const domColors = await page.evaluate(() => {
    const colors = new Set();
    document.querySelectorAll("*").forEach((node) => {
      const s = window.getComputedStyle(node);
      if (s.backgroundColor && s.backgroundColor !== "rgba(0, 0, 0, 0)" && s.backgroundColor !== "transparent") colors.add(s.backgroundColor);
      if (s.color && s.color !== "rgb(0, 0, 0)") colors.add(s.color);
    });
    return Array.from(colors).slice(0, 24);
  }).catch(() => []);

  const user = [
    `Branding COLWORK: ${COLWORK_BRAND}`,
    `Paleta profilu: ${domColors.join(", ").slice(0, 600)}`,
    "Zwróć JSON: {\"paletteSummary\":\"<1 zd.>\",\"consistencyScore\":0-100,\"colorPalette\":[\"#hex\"],\"recommendations\":[\"<1 zd.>\"]}",
  ].join("\n");

  try {
    const resp = await withRetry(() => client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: "Projektant. Tylko JSON." },
        { role: "user", content: user },
      ],
      temperature: 0.2,
      max_tokens: 350,
      response_format: { type: "json_object" },
    }), { retries: 2, label: "visual_audit" });
    const parsed = tryJSON(resp.choices?.[0]?.message?.content || "", null);
    if (parsed) return parsed;
  } catch (e) {
    console.warn(`[visual] AI failed: ${e.message?.slice(0, 100)}`);
  }
  return {
    paletteSummary: "Brak analizy AI.",
    consistencyScore: 50,
    colorPalette: [],
    recommendations: ["Dodaj akcent cyjanu w bannerze, by zbliżyć profil do palety COLWORK."],
  };
}

async function fullVisualAudit(page, profileUrl) {
  const branding = await auditVisualBranding(page, profileUrl);
  console.log(`[visual] consistency=${branding.consistencyScore}/100`);
  return branding;
}

module.exports = { auditVisualBranding, fullVisualAudit };
