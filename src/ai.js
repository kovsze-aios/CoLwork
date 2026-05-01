"use strict";

const OpenAI = require("openai");
const path = require("path");
const fs = require("fs");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const { withRetry } = require("./utils/retry");
const { clean, tryJSON } = require("./utils/clean");

// ── Cost-minimal model routing ───────────────────────────────────────────────
// DeepSeek's cheapest non-reasoning chat model is `deepseek-chat`.
// We default to it everywhere and cap max_tokens aggressively.

const MODEL = process.env.DEEPSEEK_MODEL || "deepseek-chat";
const API_KEY = process.env.DEEPSEEK_API_KEY || "";

const client = new OpenAI({
  apiKey: API_KEY || "sk-placeholder",
  baseURL: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com/v1",
  timeout: 30000,
});

// ── Free-tier guardrails ─────────────────────────────────────────────────────
// Hard cap calls per process to avoid runaway spend; reset only on new process.

const HARD_CALL_LIMIT = parseInt(process.env.AI_MAX_CALLS_PER_RUN || "120", 10);
const HARD_TOKEN_LIMIT = parseInt(process.env.AI_MAX_TOKENS_PER_RUN || "180000", 10);
const usage = { calls: 0, promptTokens: 0, completionTokens: 0, costUsd: 0 };

// DeepSeek published prices (USD / 1M tokens) — adjust if pricing changes.
const PRICE_IN = parseFloat(process.env.DEEPSEEK_PRICE_IN || "0.27");
const PRICE_OUT = parseFloat(process.env.DEEPSEEK_PRICE_OUT || "1.10");

const TELEMETRY_PATH = path.resolve(__dirname, "..", "data", "ai_usage.jsonl");

function recordUsage(label, resp) {
  const u = resp?.usage || {};
  const promptT = u.prompt_tokens || 0;
  const compT = u.completion_tokens || 0;
  usage.calls++;
  usage.promptTokens += promptT;
  usage.completionTokens += compT;
  usage.costUsd += (promptT * PRICE_IN + compT * PRICE_OUT) / 1_000_000;
  try {
    fs.mkdirSync(path.dirname(TELEMETRY_PATH), { recursive: true });
    fs.appendFileSync(
      TELEMETRY_PATH,
      JSON.stringify({ ts: Date.now(), label, promptT, compT }) + "\n"
    );
  } catch { /* telemetry must never crash callers */ }
}

function getUsage() {
  return { ...usage };
}

function ensureBudget() {
  if (!API_KEY) throw new Error("DEEPSEEK_API_KEY missing in .env");
  if (usage.calls >= HARD_CALL_LIMIT) {
    throw new Error(`AI budget exceeded: ${usage.calls} calls (cap=${HARD_CALL_LIMIT})`);
  }
  if (usage.promptTokens + usage.completionTokens >= HARD_TOKEN_LIMIT) {
    throw new Error(`AI budget exceeded: ${usage.promptTokens + usage.completionTokens} tokens`);
  }
}

// ── Central call wrapper (retry + telemetry) ─────────────────────────────────

async function chat({ system, user, label, maxTokens = 400, temperature = 0.5, json = false }) {
  ensureBudget();
  const messages = [];
  if (system) messages.push({ role: "system", content: system });
  messages.push({ role: "user", content: user });

  const params = {
    model: MODEL,
    messages,
    temperature,
    max_tokens: maxTokens,
  };
  if (json) {
    params.response_format = { type: "json_object" };
  }

  const resp = await withRetry(
    () => client.chat.completions.create(params),
    { retries: 3, baseDelay: 700, label: `ai.${label}` }
  );
  recordUsage(label, resp);
  return clean(resp.choices?.[0]?.message?.content || "", { oneLine: false });
}

// ── Token-minimal prompts (Polish, terse, zero filler) ───────────────────────

const SYS_POL = "Polski copywriter LinkedIn. Bez emoji. Bez meta-komentarzy.";
const SYS_JSON = "Zwracasz wyłącznie poprawny JSON. Bez markdownu.";

async function generatePost({ topic, tone = "thought-leadership", length = "medium" } = {}) {
  const lengthMap = { short: 600, medium: 1400, long: 2400 };
  const charLimit = lengthMap[length] || lengthMap.medium;
  const tokens = Math.min(900, Math.ceil(charLimit / 2.2));

  const user = [
    `Temat: ${clean(topic, { max: 220 })}`,
    `Ton: ${tone}`,
    `Limit: ${charLimit} znaków`,
    "Struktura: hook (1 zd.) → 3 insighty → CTA → 3-5 hashtagów.",
    "Krótkie akapity. Po polsku. Tylko treść posta.",
  ].join("\n");

  return chat({ system: SYS_POL, user, label: "post", maxTokens: tokens, temperature: 0.7 });
}

async function generateAbout({ name, achievements = [], currentRole } = {}) {
  const ach = achievements.slice(0, 4).map((a, i) => `${i + 1}. ${clean(a, { max: 160 })}`).join("\n");
  const user = [
    `Imię: ${clean(name, { max: 60 })}`,
    `Rola: ${clean(currentRole, { max: 80 })}`,
    "Osiągnięcia:",
    ach,
    "Sekcja LinkedIn O mnie. Max 2400 znaków.",
    "Pierwsze 3 linijki = hook (LinkedIn obcina dalszą część).",
    "AI + biznes. Konkretne liczby. Pewny ton, bez emoji.",
    "Zakończ zaproszeniem do współpracy. Tylko treść sekcji.",
  ].join("\n");
  return chat({ system: SYS_POL, user, label: "about", maxTokens: 750, temperature: 0.6 });
}

async function analyzeJobFit({ title, description, company } = {}) {
  const user = [
    `Stanowisko: ${clean(title, { oneLine: true, max: 120 })}`,
    `Firma: ${clean(company, { oneLine: true, max: 80 })}`,
    `Opis: ${clean(description, { max: 1000 })}`,
    "",
    "Kandydat: Prompt Engineer + automatyzacja (Make/n8n/Node), Medusa.js+Next.js, agenci AI, redukcja kosztów.",
    "Zwróć JSON: {\"score\":0-100,\"reasoning\":\"<2 zd. PL>\",\"coverLetter\":\"<max 600 zn. PL>\"}",
  ].join("\n");
  const raw = await chat({ system: SYS_JSON, user, label: "job_fit", maxTokens: 450, temperature: 0.3, json: true });
  const parsed = tryJSON(raw, { score: 0, reasoning: "Parse failed.", coverLetter: "" });
  parsed.score = Math.max(0, Math.min(100, Number(parsed.score) || 0));
  parsed.reasoning = clean(parsed.reasoning, { max: 300 });
  parsed.coverLetter = clean(parsed.coverLetter, { max: 800 });
  return parsed;
}

async function analyzeArticle({ title, summary, url } = {}) {
  const user = [
    `Tytuł: ${clean(title, { oneLine: true, max: 200 })}`,
    `Treść: ${clean(summary, { max: 1200 })}`,
    "Przekształć w post LinkedIn (PL, max 1500 zn): wyjaśnij prosto, 2-3 zastosowania biznesowe, ocena ekspercka.",
    "Zwróć JSON: {\"post\":\"<treść>\",\"hashtags\":[\"#x\",\"#y\",\"#z\"]}",
  ].join("\n");
  const raw = await chat({ system: SYS_JSON, user, label: "article", maxTokens: 700, temperature: 0.55, json: true });
  const parsed = tryJSON(raw, { post: "", hashtags: [] });
  parsed.post = clean(parsed.post, { max: 1800 });
  parsed.hashtags = Array.isArray(parsed.hashtags) ? parsed.hashtags.slice(0, 6).map((h) => clean(h, { oneLine: true, max: 30 })) : [];
  return parsed;
}

async function generateInviteMessage({ targetName, targetTitle, targetCompany, myRole } = {}) {
  const user = [
    `Do: ${clean(targetName, { oneLine: true, max: 60 })} | ${clean(targetTitle, { oneLine: true, max: 100 })} @ ${clean(targetCompany, { oneLine: true, max: 60 })}`,
    `Ja: ${clean(myRole, { oneLine: true, max: 80 })}`,
    "Notka zaproszenia LinkedIn (max 200 zn., PL).",
    "Wspomnij ich rolę/firmę. Krótka wartość. Bez 'Witam'/'Pozdrawiam'. Tylko treść notki.",
  ].join("\n");
  const out = await chat({ system: SYS_POL, user, label: "invite", maxTokens: 130, temperature: 0.7 });
  return clean(out, { oneLine: true, max: 200 });
}

async function generateFormAnswer({ question, jobTitle, company } = {}) {
  const user = [
    `Stanowisko: ${clean(jobTitle, { oneLine: true, max: 80 })} @ ${clean(company, { oneLine: true, max: 60 })}`,
    `Pytanie: ${clean(question, { max: 300 })}`,
    "Kandydat: prompt engineer, automatyzacja Make/n8n/Node/Playwright, e-commerce Medusa+Next, AI w MŚP, redukcja kosztów.",
    "Odpowiedź PL, max 450 zn. Konkretna, z liczbami jeśli możliwe. Bez 'Uważam, że...'. Tylko treść.",
  ].join("\n");
  const out = await chat({ system: SYS_POL, user, label: "form_answer", maxTokens: 200, temperature: 0.4 });
  return clean(out, { max: 480 });
}

async function generateIcebreaker({ name, title, company, lastPost } = {}) {
  const user = [
    `Osoba: ${clean(name, { oneLine: true, max: 60 })} | ${clean(title, { oneLine: true, max: 100 })} @ ${clean(company, { oneLine: true, max: 60 })}`,
    `Ostatni post (wyciąg): ${clean(lastPost, { max: 280 })}`,
    "Icebreaker LinkedIn po polsku, max 180 zn. Konkretne nawiązanie do posta jeśli jest. Bez 'Witam'. Tylko treść.",
  ].join("\n");
  const out = await chat({ system: SYS_POL, user, label: "icebreaker", maxTokens: 110, temperature: 0.7 });
  return clean(out, { oneLine: true, max: 200 });
}

async function scoreSentiment(text) {
  if (!text || text.length < 4) return { score: 0, label: "neutral" };
  const user = [
    `Tekst: ${clean(text, { max: 600 })}`,
    "Zwróć JSON: {\"score\":-100..100,\"label\":\"positive|neutral|negative\"}",
  ].join("\n");
  const raw = await chat({ system: SYS_JSON, user, label: "sent_one", maxTokens: 80, temperature: 0.1, json: true });
  const parsed = tryJSON(raw, { score: 0, label: "neutral" });
  parsed.score = Math.max(-100, Math.min(100, Number(parsed.score) || 0));
  parsed.label = ["positive", "neutral", "negative"].includes(parsed.label) ? parsed.label : "neutral";
  return parsed;
}

async function analyzeComments(comments = []) {
  if (!comments.length) return { overall: "neutral", breakdown: [], actionable: "Brak komentarzy." };
  const block = comments
    .slice(0, 25)
    .map((c, i) => `[${i}]${clean(c.author, { oneLine: true, max: 40 })}: ${clean(c.text, { oneLine: true, max: 200 })}`)
    .join("\n");
  const user = [
    `Komentarze:\n${block}`,
    "Zwróć JSON: {\"overall\":\"positive|neutral|negative|mixed\",\"breakdown\":[{\"i\":0,\"s\":\"positive|neutral|negative\",\"intent\":\"<5 słów>\"}],\"actionable\":\"<1 zd. PL>\"}",
  ].join("\n");
  const raw = await chat({ system: SYS_JSON, user, label: "sent_batch", maxTokens: 500, temperature: 0.2, json: true });
  return tryJSON(raw, { overall: "neutral", breakdown: [], actionable: "Brak analizy." });
}

module.exports = {
  chat,
  generatePost,
  generateAbout,
  analyzeJobFit,
  analyzeArticle,
  generateInviteMessage,
  generateFormAnswer,
  generateIcebreaker,
  scoreSentiment,
  analyzeComments,
  getUsage,
  client,
  MODEL,
};
