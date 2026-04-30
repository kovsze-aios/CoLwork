"use strict";

const OpenAI = require("openai");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY || "sk-placeholder",
  baseURL: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com/v1",
});

const MODEL = process.env.DEEPSEEK_MODEL || "deepseek-chat";

// ── Existing functions (Level 1) ─────────────────────────────────────────────

async function generatePost({ topic, tone = "thought-leadership", length = "medium" }) {
  const lengthMap = { short: "800–1200 znaków", medium: "1500–2500 znaków", long: "3000–4500 znaków" };
  const targetLength = lengthMap[length] || lengthMap.medium;

  const prompt = `Jesteś ekspertem od automatyzacji procesów biznesowych, AI i e-commerce.
Napisz profesjonalny post na LinkedIn w języku polskim.

Temat: ${topic}
Ton: ${tone}
Długość: ${targetLength}

Wymagania:
- Angażujący haczyk (hook) w pierwszym zdaniu.
- 3–5 konkretnych insightów lub wskazówek popartych doświadczeniem.
- Jeden akapit o tym, jak automatyzacja / AI rozwiązuje konkretny problem biznesowy.
- Zakończ pytaniem do czytelników (call-to-engagement).
- Użyj 3–5 trafnych hashtagów na końcu.
- Format: krótkie akapity, maksymalnie 3 zdania na akapit, pusta linia między akapitami.
- Zero emoji. Profesjonalny, merytoryczny język.

Wygeneruj TYLKO treść posta, bez nagłówków, bez cudzysłowów otaczających całość.`;

  const resp = await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: "Jesteś profesjonalnym polskim copywriterem specjalizującym się w treściach LinkedIn o automatyzacji i AI. Odpowiadasz wyłącznie treścią posta, bez meta-komentarzy." },
      { role: "user", content: prompt },
    ],
    temperature: 0.8,
    max_tokens: 1500,
  });

  return resp.choices[0].message.content.trim();
}

async function generateAbout({ name, achievements, currentRole }) {
  const achievementsText = achievements.map((a, i) => `${i + 1}. ${a}`).join("\n");

  const prompt = `Jesteś ekspertem od personal brandingu na LinkedIn.
Napisz sekcję "O mnie" dla profilu LinkedIn w języku polskim.

Imię i nazwisko: ${name}
Stanowisko: ${currentRole}
Ostatnie osiągnięcia do uwzględnienia:
${achievementsText}

Wymagania:
- Maksymalnie 2600 znaków.
- Pierwsze 3 linijki to "hook" — najważniejsze, bo LinkedIn pokazuje tylko je przed "zobacz więcej".
- Podkreśl umiejętności łączenia AI z realnymi procesami biznesowymi.
- Wymień konkretne rezultaty (np. redukcja kosztów, wzrost konwersji, oszczędność czasu).
- Ton: pewny siebie, ale nie arogancki. Merytoryczny ekspert.
- Zakończ zaproszeniem do współpracy.
- Zero emoji.

Wygeneruj TYLKO treść sekcji, bez nagłówków, bez "O mnie:", bez cudzysłowów otaczających całość.`;

  const resp = await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: "Jesteś profesjonalnym polskim copywriterem LinkedIn. Odpowiadasz wyłącznie treścią sekcji, bez meta-komentarzy." },
      { role: "user", content: prompt },
    ],
    temperature: 0.7,
    max_tokens: 1200,
  });

  return resp.choices[0].message.content.trim();
}

async function analyzeJobFit({ title, description, company }) {
  const prompt = `Przeanalizuj tę ofertę pracy i oceń, czy pasuje do kandydata z doświadczeniem w:
- Prompt Engineering (DeepSeek, Claude, GPT)
- Automatyzacji procesów biznesowych (Make, n8n, skrypty Node.js)
- E-commerce (Medusa.js, Next.js, integracje API)
- Wdrażaniu AI w małych i średnich firmach

Oferta:
- Stanowisko: ${title}
- Firma: ${company}
- Opis: ${description.slice(0, 1500)}

Zwróć JSON w formacie:
{
  "score": <liczba 0-100, gdzie 100 = idealne dopasowanie>,
  "reasoning": "<2-3 zdania uzasadnienia po polsku>",
  "coverLetter": "<krótki, spersonalizowany list motywacyjny po polsku (max 800 znaków), podkreślający doświadczenie w automatyzacji i AI>"
}

ZWróć TYLKO JSON, bez markdowna, bez komentarzy.`;

  const resp = await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: "Jesteś asystentem kariery. Odpowiadasz wyłącznie czystym JSON." },
      { role: "user", content: prompt },
    ],
    temperature: 0.4,
    max_tokens: 800,
  });

  const raw = resp.choices[0].message.content.trim();
  return JSON.parse(raw.replace(/```json|```/g, "").trim());
}

// ── Level 2: Aggregator functions ─────────────────────────────────────────────

/**
 * Turn a raw tech article into a LinkedIn-ready business post.
 * @param {Object} article
 * @param {string} article.title - RSS article title
 * @param {string} article.summary - Extracted summary / first paragraphs
 * @param {string} article.url - Original URL for attribution
 * @returns {Promise<{post: string, hashtags: string[]}>}
 */
async function analyzeArticle({ title, summary, url }) {
  const prompt = `Jesteś ekspertem tłumaczącym skomplikowane technologie na język korzyści biznesowych.
Przeczytałeś artykuł i masz go przekształcić w post LinkedIn.

ARTYKUŁ:
Tytuł: ${title}
Źródło: ${url}
Treść (wyciąg): ${summary.slice(0, 2000)}

ZADANIE:
1. Wyjaśnij tę technologię / news w 2-3 zdaniach prostym językiem — tak, by zrozumiał to właściciel firmy, nie programista.
2. Wskaż 2-3 konkretne zastosowania biznesowe w kontekście automatyzacji / e-commerce / AI.
3. Podaj swoją opinię ekspercką (czy to game-changer, czy hype).
4. Zaproponuj 3-5 hashtagów pasujących do tematu.

Zwróć JSON w formacie:
{
  "post": "<gotowy post LinkedIn, max 2000 znaków, polski, profesjonalny>",
  "hashtags": ["#tag1", "#tag2", "#tag3"]
}

ZWróć TYLKO JSON, bez markdowna, bez komentarzy.`;

  const resp = await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: "Jesteś analitykiem IT i copywriterem. Odpowiadasz wyłącznie czystym JSON." },
      { role: "user", content: prompt },
    ],
    temperature: 0.6,
    max_tokens: 1200,
  });

  const raw = resp.choices[0].message.content.trim();
  return JSON.parse(raw.replace(/```json|```/g, "").trim());
}

// ── Level 2: Smart networking ────────────────────────────────────────────────

/**
 * Generate a personalized invite message for a LinkedIn connection.
 * @param {Object} opts
 * @param {string} opts.targetName - The person's name
 * @param {string} opts.targetTitle - Their headline / job title
 * @param {string} opts.targetCompany - Their current company
 * @param {string} opts.myRole - My current role
 * @returns {Promise<string>} - Invite message (max 200 chars, LinkedIn limit is 300)
 */
async function generateInviteMessage({ targetName, targetTitle, targetCompany, myRole }) {
  const prompt = `Jesteś ekspertem od networkingu biznesowego na LinkedIn.
Wygeneruj spersonalizowaną notkę do zaproszenia do kontaktów.

Odbiorca:
- Imię i nazwisko: ${targetName}
- Stanowisko: ${targetTitle || "Nieznane"}
- Firma: ${targetCompany || "Nieznana"}

Nadawca:
- Stanowisko: ${myRole || "AI Automation Engineer"}

Wymagania:
- MAX 200 ZNAKÓW (LinkedIn limit notki to 300, ale chcemy być bezpieczni).
- Wspomnij konkretnie stanowisko/firmę odbiorcy — pokaż, że nie jest to masowa wiadomość.
- Zaproponuj krótką wartość: wymiana doświadczeń, wspólny temat (AI, automatyzacja, tech).
- Ton: profesjonalny, ciepły, bez nachalności.
- Język polski.
- NIE używaj słowa "Witam" — użyj naturalnego otwarcia.
- NIE kończ na "Pozdrawiam" — zakończ zaproszeniem do kontaktu.

Wygeneruj TYLKO treść wiadomości, bez nagłówków, bez cudzysłowów, bez "Wiadomość:".`;

  const resp = await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: "Jesteś specjalistą od networkingu LinkedIn. Odpowiadasz wyłącznie treścią notki do zaproszenia." },
      { role: "user", content: prompt },
    ],
    temperature: 0.8,
    max_tokens: 200,
  });

  return resp.choices[0].message.content.trim().slice(0, 200);
}

// ── Level 2: Dynamic form answers ────────────────────────────────────────────

/**
 * Generate an answer to a custom application form question.
 * @param {Object} opts
 * @param {string} opts.question - The form question text
 * @param {string} opts.jobTitle - The job title being applied to
 * @param {string} opts.company - The company name
 * @returns {Promise<string>} - Concise answer in Polish
 */
async function generateFormAnswer({ question, jobTitle, company }) {
  const prompt = `Odpowiadasz na pytanie w formularzu rekrutacyjnym na LinkedIn.

Stanowisko: ${jobTitle}
Firma: ${company}
Pytanie rekrutera: "${question}"

Kandydat ma doświadczenie w:
- Prompt Engineering (DeepSeek, Claude, GPT)
- Automatyzacji procesów biznesowych (Make, n8n, Node.js, Playwright)
- E-commerce (Medusa.js, Next.js, integracje API)
- Wdrażaniu AI agentów w MŚP
- Redukcji kosztów operacyjnych przez automatyzację

Wymagania odpowiedzi:
- MAX 500 ZNAKÓW.
- Konkretna, merytoryczna, bez lania wody.
- Jeśli to pytanie o doświadczenie — podaj konkretny przykład z liczbami.
- Jeśli to pytanie o motywację — połącz pasję do AI z realnymi rezultatami.
- Język polski, profesjonalny.
- Nie zaczynaj od "Uważam, że..." — przejdź od razu do rzeczy.

Wygeneruj TYLKO treść odpowiedzi, bez cudzysłowów, bez "Odpowiedź:".`;

  const resp = await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: "Jesteś profesjonalnym kandydatem. Odpowiadasz wyłącznie treścią odpowiedzi na pytanie rekrutacyjne." },
      { role: "user", content: prompt },
    ],
    temperature: 0.5,
    max_tokens: 400,
  });

  return resp.choices[0].message.content.trim().slice(0, 500);
}

module.exports = {
  generatePost,
  generateAbout,
  analyzeJobFit,
  analyzeArticle,
  generateInviteMessage,
  generateFormAnswer,
};
