"use strict";

// Oscar — Video Director
// Creates YouTube Shorts scripts from deployment logs.
// Format: "Obraz | Głos Dawida" — ready for HeyGen avatar rendering.

const { client, MODEL } = require("../ai");
const { withRetry } = require("../utils/retry");
const { logAction } = require("../utils/memory");

/**
 * Generate a YouTube Shorts script from a deployment or feature description.
 * HeyGen-compatible format: timestamped scenes with visual + voiceover.
 *
 * @param {object} input
 * @param {string} input.topic - What was deployed/built
 * @param {string} [input.hook] - Opening hook (auto-generated if omitted)
 * @param {string} [input.keyTakeaway] - One-sentence CTA
 * @param {number} [input.durationSec] - Target duration (default: 40s)
 * @returns {Promise<{title: string, scenes: Array<{time: string, visual: string, voice: string}>, cta: string}>}
 */
async function generateShortScript(input) {
  const duration = input.durationSec || 40;
  const hook = input.hook || "";

  const prompt = `Jesteś Oscar — reżyser wideo CoLwork. Tworzysz scenariusze YouTube Shorts (${duration}s) gotowe do nagrania przez HeyGen.

Format: "Obraz | Głos Dawida" — każda scena opisana w 1 linii.

TEMAT: ${input.topic}
${hook ? `HOOK: ${hook}` : "Wygeneruj własny hook."}

Wymagania:
- Hook w ciągu PIERWSZYCH 3 SEKUND (zatrzymanie scrolla).
- 5-8 scen, każda 4-8 sekund.
- Styl: szybkie cięcia, terminal/CLI w tle, kod jako tekstura.
- Głos: Dawid — ekspert AI, pewny siebie, żadnego "dzień dobry".
- Zakończ CTA: "${input.keyTakeaway || 'Subskrybuj po więcej AI automatyzacji.'}"

Zwróć JSON:
{
  "title": "<chwytliwy tytuł Shortsa, max 60 znaków>",
  "hook": "<tekst hooka, max 100 znaków>",
  "scenes": [
    { "time": "0-5s", "visual": "<co widać na ekranie>", "voice": "<co mówi Dawid>" },
    { "time": "5-10s", "visual": "...", "voice": "..." },
    ...
  ],
  "cta": "<końcowe wezwanie do akcji>",
  "hashtags": ["#AI", "#CoLwork", "#Automation"]
}

TYLKO JSON.`;

  try {
    const resp = await withRetry(() => client.chat.completions.create({
      model: MODEL,
      messages: [
        { role: "system", content: "Jesteś Oscar — reżyser YouTube Shorts. Odpowiadasz TYLKO JSON ze scenariuszem." },
        { role: "user", content: prompt },
      ],
      temperature: 0.9,
      max_tokens: 1000,
      response_format: { type: "json_object" },
    }), { retries: 2, label: "oscar.script" });

    const script = JSON.parse(resp.choices[0].message.content);
    logAction("video_script_generated", { topic: input.topic, scenes: script.scenes?.length || 0 });
    return script;
  } catch (e) {
    console.error(`[oscar] Script generation failed: ${e.message}`);
    return {
      title: `CoLwork: ${input.topic.slice(0, 50)}`,
      hook: "Automatyzacja, która działa podczas gdy śpisz.",
      scenes: [
        { time: "0-5s", visual: "Terminal z logo CoLwork", voice: `${input.topic} — wdrożone. Zero klikania.` },
        { time: "5-10s", visual: "Kod przewijający się w terminalu", voice: "CoLwork zrobił research, napisał kod i wysłał raport." },
        { time: "10-15s", visual: "Logo CoLwork + LinkedIn + n8n", voice: "Jeden agent. DeepSeek V4. Twoja kariera na autopilocie." },
      ],
      cta: input.keyTakeaway || "Subskrybuj po więcej AI automatyzacji.",
      hashtags: ["#AI", "#CoLwork", "#Automation"],
    };
  }
}

module.exports = { generateShortScript };
