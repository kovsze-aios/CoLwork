"use strict";

// Feynman — Logic Officer
// Simplifies communication, cuts corporate jargon, evaluates CV logic
// for RevOps/Automation competency. Inspired by: "If you can't explain it
// simply, you don't understand it well enough."

const { client, MODEL } = require("../ai");
const { withRetry } = require("../utils/retry");

/**
 * Simplify a block of text — strip jargon, make it clear and direct.
 * @param {string} text
 * @param {"cv"|"message"|"post"|"report"} context
 * @returns {Promise<string>}
 */
async function simplify(text, context = "message") {
  const ctxMap = {
    cv: "CV / resume bullet points — make each achievement concrete with numbers where possible",
    message: "LinkedIn message or email — make it warm, direct, and jargon-free",
    post: "LinkedIn post — keep the insight but make it readable for a busy exec",
    report: "Internal report — preserve data but make conclusions crystal clear",
  };

  const resp = await withRetry(() => client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: `Jesteś Feynman — Logic Officer CoLwork. Twoja misja: upraszczać, nie gubiąc sensu. ${ctxMap[context] || ctxMap.message}. Odpowiadasz TYLKO uproszczonym tekstem. Bez meta-komentarzy.` },
      { role: "user", content: `Uprość to:\n\n${text.slice(0, 2000)}` },
    ],
    temperature: 0.3,
    max_tokens: 800,
  }), { retries: 2, label: "feynman.simplify" });

  return resp.choices[0].message.content.trim();
}

/**
 * Evaluate a CV/profile against RevOps + Automation competency markers.
 * @param {object} profile - { about, headline, experience[], skills[] }
 * @returns {Promise<{score: number, strengths: string[], gaps: string[], oneLiner: string}>}
 */
async function evaluateCV(profile) {
  const input = JSON.stringify({
    headline: profile.headline || "",
    about: (profile.about || "").slice(0, 1500),
    experience: (profile.experience || []).slice(0, 5),
    skills: (profile.skills || []).slice(0, 20),
  });

  const resp = await withRetry(() => client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: "Jesteś Feynman — oceniasz CV pod kątem RevOps i Automatyzacji. Odpowiadasz TYLKO JSON: {\"score\":0-100,\"strengths\":[\"...\"],\"gaps\":[\"...\"],\"oneLiner\":\"...\"}" },
      { role: "user", content: `Oceń to CV pod kątem kompetencji RevOps + AI Automation:\n${input}` },
    ],
    temperature: 0.3,
    max_tokens: 500,
    response_format: { type: "json_object" },
  }), { retries: 2, label: "feynman.evaluateCV" });

  try {
    return JSON.parse(resp.choices[0].message.content);
  } catch {
    return { score: 60, strengths: ["Doświadczenie techniczne"], gaps: ["Brak metryk RevOps"], oneLiner: "Solidne podstawy — uzupełnij o konkretne liczby." };
  }
}

module.exports = { simplify, evaluateCV };
