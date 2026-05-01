"use strict";

// Seed — Networker / Icebreaker Generator
// Crafts perfect opening messages that hit decision-makers' pain points
// identified by Sherlock. Uses pattern-interrupt hooks.

const { client, MODEL } = require("../ai");
const { withRetry } = require("../utils/retry");

/**
 * Generate a hyper-personalized icebreaker for a decision-maker.
 * Uses Sherlock's intel + Feynman's simplification to craft a message
 * that gets responses.
 *
 * @param {object} target
 * @param {string} target.name - Decision maker name
 * @param {string} target.title - Their role
 * @param {string} target.company - Company name
 * @param {object} [target.intel] - Sherlock's investigation results
 * @param {string[]} [target.intel.painPoints]
 * @param {string} [target.intel.culture]
 * @param {string[]} [target.intel.techStack]
 * @param {string} [target.intel.strategy]
 * @param {string} [target.context] - Additional context (e.g. "after their recent funding round")
 * @returns {Promise<{icebreaker: string, hook: string, fallback: string}>}
 */
async function generate(target) {
  const painPoints = (target.intel?.painPoints || []).join("; ") || "AI adoption, process automation";
  const techStack = (target.intel?.techStack || []).join(", ") || "unknown stack";
  const culture = target.intel?.culture || "";
  const strategy = target.intel?.strategy || "";

  const context = [
    `Target: ${target.name}, ${target.title} @ ${target.company}`,
    `Tech stack sygnały: ${techStack}`,
    `Pain points: ${painPoints}`,
    culture ? `Kultura: ${culture}` : "",
    strategy ? `Strategia Sherlocka: ${strategy}` : "",
    target.context || "",
  ].filter(Boolean).join("\n");

  const prompt = `Jesteś Seed — elite networker CoLwork. Tworzysz icebreakery, na które decydenci ODPOWIADAJĄ.

Zasady:
- MAX 180 znaków.
- ZACZNIJ od konkretnego insightu o firmie/bólu — nigdy od "Cześć" czy "Witam".
- Użyj pattern-interrupt: zacznij od pytania, statystyki lub kontrowersyjnej tezy.
- Pokaż, że ZROBIŁEŚ research (wspomnij tech stack lub konkretny problem).
- Zaproponuj wartość w 1 zdaniu.
- Zero corporate speak. Zero "z wyrazami szacunku".
- Język: polski, chyba że target jest EN — wtedy angielski.

Kontekst:
${context}

Zwróć JSON:
{
  "icebreaker": "<główny icebreaker 180 znaków>",
  "hook": "<sam początek — pierwsze 60 znaków, które zatrzymują scroll>",
  "fallback": "<krótsza wersja 100 znaków, bezpieczniejsza>"
}

TYLKO JSON.`;

  try {
    const resp = await withRetry(() => client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: "Jesteś Seed — najlepszy networker na LinkedIn. Odpowiadasz TYLKO JSON z icebreakerami." },
        { role: "user", content: prompt },
      ],
      temperature: 0.9,
      max_tokens: 400,
      response_format: { type: "json_object" },
    }), { retries: 2, label: "seed.generate" });

    return JSON.parse(resp.choices[0].message.content);
  } catch {
    return {
      icebreaker: `${target.name}, widzę że ${target.company} mocno inwestuje w tech — jak radzicie sobie z automatyzacją procesów? Mam kilka świeżych insightów z wdrożeń AI, którymi mogę się podzielić.`,
      hook: `${target.name}, widzę że ${target.company} mocno inwestuje w tech`,
      fallback: `Hej ${target.name.split(" ")[0]}, ciekawi mnie wasze podejście do AI w ${target.company}. Wymiana doświadczeń?`,
    };
  }
}

module.exports = { generate };
