"use strict";

const path = require("path");
const fs = require("fs");
require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env") });

const { logAction } = require("./memory");
const { triggerWebhook } = require("./n8n_bridge");
const { clean, num, url, nameCase, isoDate, csvSafe } = require("./clean");

const SHEET_ID = process.env.GOOGLE_SHEET_ID || "";

// ── EXACT column order required by Google Sheets ─────────────────────────────
// MUST match the header row of the Sheet 1:1.
const COLUMNS = [
  "Data",
  "Imię i Nazwisko",
  "Firma",
  "Profil URL",
  "Ostatni Post",
  "Icebreaker AI",
  "Sentiment Score",
];

const FALLBACK_LOG = path.resolve(__dirname, "..", "..", "data", "sheets_queue.jsonl");

// ── Row builder ──────────────────────────────────────────────────────────────

function buildRow(entry = {}) {
  const date = isoDate(entry.timestamp || new Date()).slice(0, 19).replace("T", " ");
  const name = nameCase(entry.name || entry.fullName || "");
  const company = clean(entry.company || "", { oneLine: true, max: 80 });
  const profileUrl = url(entry.linkedinUrl || entry.profileUrl || "");
  const lastPost = clean(entry.lastPost || "", { oneLine: true, max: 240 });
  const icebreaker = clean(entry.aiHook || entry.icebreaker || entry.message || "", { oneLine: true, max: 240 });
  const sentiment = num(entry.sentimentScore ?? entry.engagementScore, 0);

  return {
    object: {
      "Data": date,
      "Imię i Nazwisko": name,
      "Firma": company,
      "Profil URL": profileUrl,
      "Ostatni Post": lastPost,
      "Icebreaker AI": icebreaker,
      "Sentiment Score": sentiment,
    },
    array: [date, name, company, profileUrl, lastPost, icebreaker, sentiment],
  };
}

function queueLocally(payload) {
  try {
    fs.mkdirSync(path.dirname(FALLBACK_LOG), { recursive: true });
    fs.appendFileSync(FALLBACK_LOG, JSON.stringify({ ts: Date.now(), payload }) + "\n");
  } catch { /* never crash on logging */ }
}

// ── Public API ───────────────────────────────────────────────────────────────

async function logToSheet(entry) {
  const { object, array } = buildRow(entry);

  // Skip rows missing any actionable identity (saves quota)
  if (!object["Imię i Nazwisko"] && !object["Firma"] && !object["Profil URL"]) {
    console.warn("[sheets] skipped empty row");
    return null;
  }

  logAction("sheets_sync", object);

  const payload = {
    sheetId: SHEET_ID,
    columns: COLUMNS,
    row: array,
    record: object,
  };

  let delivered = false;
  try {
    const res = await triggerWebhook("colwork/sheets-append", payload);
    delivered = res !== null;
  } catch (e) {
    console.warn(`[sheets] webhook error: ${e.message?.slice(0, 80)}`);
  }

  if (!delivered) {
    queueLocally(payload);
    console.warn(`[sheets] queued locally (${object["Imię i Nazwisko"] || "—"} @ ${object["Firma"] || "—"})`);
  } else {
    console.log(`[sheets] ✓ ${object["Imię i Nazwisko"]} @ ${object["Firma"]} (sentiment=${object["Sentiment Score"]})`);
  }

  return { delivered, row: object };
}

async function flushQueue() {
  if (!fs.existsSync(FALLBACK_LOG)) return 0;
  const lines = fs.readFileSync(FALLBACK_LOG, "utf-8").split("\n").filter(Boolean);
  if (!lines.length) return 0;

  let sent = 0;
  const remaining = [];
  for (const line of lines) {
    try {
      const { payload } = JSON.parse(line);
      const res = await triggerWebhook("colwork/sheets-append", payload);
      if (res !== null) sent++;
      else remaining.push(line);
    } catch {
      remaining.push(line);
    }
  }
  fs.writeFileSync(FALLBACK_LOG, remaining.join("\n") + (remaining.length ? "\n" : ""));
  console.log(`[sheets] flushed ${sent}/${lines.length} queued rows`);
  return sent;
}

async function syncMemoryToSheets() {
  const { getRecentActivity } = require("./memory");
  const activity = getRecentActivity(72);
  const rows = activity.recentActions.filter((a) => a.type === "sheets_sync" && a.payload);
  console.log(`[sheets] resyncing ${rows.length} recent rows`);
  for (const a of rows) await logToSheet(a.payload);
  await flushQueue();
}

module.exports = { logToSheet, syncMemoryToSheets, flushQueue, buildRow, COLUMNS };
