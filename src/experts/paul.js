"use strict";

// Paul — Marketing / "Build in Public" DevLog Manager
// Listens to CLI deployment logs and writes DevLog entries to Google Docs (via n8n).
// Updates status + ID in Google Sheets for public accountability.

const { triggerWebhook } = require("../utils/n8n_bridge");
const { logAction } = require("../utils/memory");
const { clean, isoDate } = require("../utils/clean");

/**
 * Post a DevLog entry to Google Docs and Google Sheets.
 * Designed for "Build in Public" transparency.
 *
 * @param {object} entry
 * @param {string} entry.title - DevLog title (e.g. "Deployed Feynman logic evaluator")
 * @param {string} entry.body - Full markdown body
 * @param {string} [entry.status] - "deployed" | "testing" | "breaking" | "shipped"
 * @param {string} [entry.version] - Semver (e.g. "v3.0.1")
 * @param {string[]} [entry.tags] - Hashtags
 * @returns {Promise<{docDelivered: boolean, sheetDelivered: boolean}>}
 */
async function publishDevLog(entry) {
  const payload = {
    title: clean(entry.title, { oneLine: true, max: 200 }),
    body: clean(entry.body, { max: 5000 }),
    status: entry.status || "deployed",
    version: entry.version || "v3.0",
    tags: (entry.tags || ["colwork", "buildinpublic", "ai"]).join(", "),
    timestamp: isoDate(new Date()),
    docId: process.env.GOOGLE_DOCS_ID || "",
    sheetId: process.env.GOOGLE_SHEET_ID || "",
  };

  // Log locally
  logAction("devlog_published", payload);

  // Send to n8n → Google Docs append + Google Sheets update
  let docDelivered = false;
  let sheetDelivered = false;

  try {
    const result = await triggerWebhook("colwork/devlog-publish", payload);
    if (result) {
      docDelivered = true;
      sheetDelivered = true;
      console.log(`[paul] DevLog published: "${payload.title}"`);
    }
  } catch (e) {
    console.warn(`[paul] n8n webhook failed: ${e.message?.slice(0, 80)}. Queued locally.`);
  }

  return { docDelivered, sheetDelivered };
}

/**
 * Listen to a CLI command result and auto-publish a DevLog if significant.
 * @param {string} command - The CLI command that was run
 * @param {object} result - The result object
 */
async function autoLog(command, result) {
  const significant = [
    "full-auto", "deploy-n8n", "network", "jobs", "post",
  ];

  if (!significant.includes(command)) return null;

  const title = `[CoLwork] ${command} executed — ${isoDate(new Date()).slice(0, 10)}`;
  const body = [
    `## Command: \`colwork ${command}\``,
    `## Timestamp: ${new Date().toISOString()}`,
    "",
    "## Result",
    "```json",
    JSON.stringify(result, null, 2).slice(0, 3000),
    "```",
    "",
    `## Tags: #colwork #buildinpublic #${command}`,
  ].join("\n");

  return await publishDevLog({ title, body, status: "deployed", version: "v3.0", tags: ["colwork", command, "buildinpublic"] });
}

/**
 * Generate a "Build in Public" tweet/LinkedIn post about a deployment.
 */
async function generateBuildInPublicPost(deploymentName, whatChanged) {
  const { client, MODEL } = require("../ai");
  const { withRetry } = require("../utils/retry");

  const resp = await withRetry(() => client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: "Jesteś Paul — oficer marketingu CoLwork. Piszesz posty 'Build in Public' na LinkedIn. Krótko, autentycznie, bez hype'u. Po polsku. Max 800 znaków." },
      { role: "user", content: `Napisz post 'Build in Public' o wdrożeniu: "${deploymentName}". Co się zmieniło: ${whatChanged}. Wspomnij o CoLwork i automatyzacji AI.` },
    ],
    temperature: 0.7,
    max_tokens: 500,
  }), { retries: 2, label: "paul.post" });

  return resp.choices[0].message.content.trim();
}

module.exports = { publishDevLog, autoLog, generateBuildInPublicPost };
