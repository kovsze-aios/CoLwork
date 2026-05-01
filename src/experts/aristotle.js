"use strict";

// Aristotle v4.1 — Chief Research Officer + Evidence-Based RAG Engine
// Reads local PDF/TXT files, indexes them, and writes papers grounded
// STRICTLY in the provided sources. Zero hallucination policy.

const fs = require("fs");
const path = require("path");
const pdfParse = require("pdf-parse");
const { client, MODEL } = require("../ai");
const { withRetry } = require("../utils/retry");
const { logAction } = require("../utils/memory");

const APA_DATE = new Date().getFullYear();

// ── File ingestion ───────────────────────────────────────────────────────────

/**
 * Read and index all .txt and .pdf files from a directory.
 * Assigns each file a Source ID (A, B, C...) for in-text citation.
 *
 * @param {string} dirPath - Path to the directory containing sources
 * @returns {Promise<Array<{id: string, filename: string, content: string, wordCount: number}>>}
 */
async function ingestSources(dirPath) {
  if (!fs.existsSync(dirPath)) {
    console.warn(`[aristotle] Sources dir not found: ${dirPath}`);
    return [];
  }

  const files = fs.readdirSync(dirPath).filter(
    (f) => f.endsWith(".txt") || f.endsWith(".pdf")
  );

  if (!files.length) {
    console.warn(`[aristotle] No .txt or .pdf files in: ${dirPath}`);
    return [];
  }

  console.log(`[aristotle] Ingesting ${files.length} source file(s)...`);

  const sources = [];
  const labels = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

  for (let i = 0; i < files.length; i++) {
    const filepath = path.join(dirPath, files[i]);
    const ext = path.extname(files[i]).toLowerCase();
    let content = "";

    try {
      if (ext === ".pdf") {
        const buf = fs.readFileSync(filepath);
        const data = await pdfParse(buf);
        content = data.text;
      } else {
        content = fs.readFileSync(filepath, "utf-8");
      }
    } catch (e) {
      console.warn(`[aristotle] Failed to read ${files[i]}: ${e.message}`);
      continue;
    }

    const cleaned = content
      .replace(/\r\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    if (!cleaned) continue;

    const source = {
      id: `Źródło ${labels[i]}`,
      filename: files[i],
      filepath,
      content: cleaned,
      wordCount: cleaned.split(/\s+/).length,
    };

    sources.push(source);
    console.log(`[aristotle]   ${source.id}: ${files[i]} (${source.wordCount} words)`);
  }

  return sources;
}

// ── Strict RAG paper generation ──────────────────────────────────────────────

/**
 * Generate a strictly evidence-based paper using ONLY the ingested sources.
 * No model prior knowledge allowed — every claim must cite a source.
 *
 * @param {object} opts
 * @param {string} opts.topic
 * @param {"academic"|"whitepaper"|"casestudy"} [opts.format]
 * @param {string} [opts.audience]
 * @param {number} [opts.targetWords]
 * @param {Array} opts.sources - Result from ingestSources()
 * @returns {Promise<object>}
 */
async function generatePaper(opts) {
  const format = opts.format || "whitepaper";
  const targetWords = opts.targetWords || 2000;
  const sources = opts.sources || [];

  if (sources.length === 0) {
    // Fallback to web-based generation (original behavior)
    console.warn("[aristotle] No sources provided — falling back to web research mode.");
    return generatePaperWebMode(opts);
  }

  // Build the source dossier
  const dossier = sources.map((s) => {
    return [
      `═══════════════════════════════════════`,
      `${s.id}: ${s.filename}`,
      `═══════════════════════════════════════`,
      s.content,
    ].join("\n");
  }).join("\n\n");

  const formatGuides = {
    academic: `Struktura akademicka:
- Abstract (150-200 słów)
- Introduction (problem, research question)
- Methodology (jak przeprowadzono analizę)
- Results / Findings (główne ustalenia — TYLKO z dokumentów)
- Discussion (interpretacja wyłącznie na podstawie dokumentów)
- Conclusion
- References / Bibliography (lista wszystkich użytych źródeł z ID)`,
    whitepaper: `Struktura B2B Whitepaper:
- Executive Summary (1 strona — wnioski TYLKO z dokumentów)
- Problem Statement
- Evidence Analysis (co mówią dokumenty)
- Solution Implications
- Conclusion + Bibliography`,
    casestudy: `Struktura Case Study:
- Client Profile (z dokumentów)
- The Challenge (z dokumentów)
- Evidence & Results (TYLKO z dokumentów)
- Lessons Learned (z dokumentów)
- Bibliography`,
  };

  const structureGuide = formatGuides[format] || formatGuides.whitepaper;

  const prompt = `JESTEŚ RYGORYSTYCZNYM NAUKOWCEM W TRYBIE "STRICT EXTRACTION".

MASZ ZAKAZ KORZYSTANIA Z OGÓLNEJ WIEDZY MODELU.
Możesz używać TYLKO informacji zawartych w poniższych dokumentach.
Jeśli jakaś informacja NIE znajduje się w dokumentach, pomiń ją LUB napisz:
"Brak danych w materiale źródłowym."

FORMAT: ${format.toUpperCase()}
${structureGuide}

TEMAT: ${opts.topic}
GRUPA DOCELOWA: ${opts.audience || "Decydenci biznesowi, CTO"}

═══════════════════════
DOKUMENTY ŹRÓDŁOWE (JEDYNE DOZWOLONE ŹRÓDŁA):
═══════════════════════

${dossier}

═══════════════════════
ZASADY CYTATÓW (EXACT CITATION):
═══════════════════════

1. Po KAŻDYM zdaniu zawierającym fakt z dokumentu wstaw ZNAK CYTATU:
   Format: (Autor, Rok — patrz: NAZWA_PLIKU)
   Przykład: "Firmy odnotowały 42% wzrost konwersji (Jaworski & Wolska, 2025 — patrz: test_badanie.txt)."

2. Jeśli cytujesz konkretną wartość liczbową, MUSISZ podać źródło.
   Np.: "Skrócenie czasu odpowiedzi z 4.2h do 6.3min (Źródło A: test_badanie.txt)."

3. Jeśli dokument NIE zawiera nazwy autora ani roku:
   Użyj: (Źródło X: nazwa_pliku) jako cytatu.

4. Jeśli temat wymaga informacji spoza dokumentów:
   Napisz: "[Brak danych w materiale źródłowym — wymagane dodatkowe badanie.]"

5. Na końcu artykułu utwórz sekcję "BIBLIOGRAFIA" zawierającą WSZYSTKIE użyte źródła:
   - Źródło A: nazwa_pliku (format oryginalnego dokumentu)
   - Źródło B: nazwa_pliku (format oryginalnego dokumentu)

TON: Profesjonalny, merytoryczny, rygorystyczny naukowo.
JĘZYK: Polski.
SŁOWA DOCELOWE: ~${targetWords}

WYgeneruj PEŁNY artykuł. Zero halucynacji. Tylko to co w dokumentach.`;

  try {
    const resp = await withRetry(() => client.chat.completions.create({
      model: MODEL,
      messages: [
        {
          role: "system",
          content: "Jesteś Aristotle — rygorystyczny naukowiec CoLwork w trybie STRICT EXTRACTION. Używasz TYLKO informacji z dostarczonych dokumentów. Nigdy nie zmyślasz. Każdy fakt cytujesz znacznikiem źródła. Odpowiadasz TYLKO treścią artykułu.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 4000,
    }), { retries: 2, label: "aristotle.rag" });

    const fullText = resp.choices[0].message.content.trim();

    // Parse sections
    const sections = {};
    const sectionOrder = [];
    const parts = fullText.split(/^## /gm);
    if (parts[0] && parts[0].trim()) {
      sections.preamble = parts[0].trim();
    }
    for (let i = 1; i < parts.length; i++) {
      const lines = parts[i].split("\n");
      const title = lines[0].trim();
      const body = lines.slice(1).join("\n").trim();
      const key = title.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 40);
      sections[key] = { title, body };
      sectionOrder.push(key);
    }

    const titleMatch = fullText.match(/^# (.+)$/m);
    const title = titleMatch ? titleMatch[1].trim() : opts.topic;

    // Count citations: (Author ..., Source X: ..., Źródło X: ...
    const citationPattern = /(?:\([^)]*(?:Źródło|Source|Autor|patrz)[^)]*\)|\[Brak danych w material)/gi;
    const citationCount = (fullText.match(citationPattern) || []).length;

    // Build bibliography section from sources
    const bibliography = sources.map((s) => `- **${s.id}**: ${s.filename} (${s.wordCount} słów)`).join("\n");

    logAction("aristotle_rag_paper", {
      topic: opts.topic,
      format,
      wordCount: fullText.split(/\s+/).length,
      sourceCount: sources.length,
      citationCount,
      strictMode: true,
    });

    return {
      title,
      sections,
      sectionOrder,
      fullText,
      bibliography,
      format,
      wordCount: fullText.split(/\s+/).length,
      citationCount,
      sourceCount: sources.length,
      strictMode: true,
    };
  } catch (e) {
    console.error(`[aristotle] RAG generation failed: ${e.message}`);
    return {
      title: opts.topic,
      sections: { error: { title: "Error", body: `Generation failed: ${e.message}` } },
      sectionOrder: ["error"],
      fullText: `# ${opts.topic}\n\nGeneration failed: ${e.message}`,
      bibliography: "",
      format,
      wordCount: 0,
      citationCount: 0,
      sourceCount: sources.length,
      strictMode: true,
    };
  }
}

/**
 * Fallback: web-research mode (original behavior from v4.0).
 * Used when no local sources provided.
 */
async function generatePaperWebMode(opts) {
  const format = opts.format || "whitepaper";
  const sources = (opts.sourceFindings || []).join("\n\n");

  const structureGuide = {
    academic: "Abstract → Introduction → Literature Review → Methodology → Results → Discussion → Conclusion → References",
    whitepaper: "Executive Summary → Problem Statement → Current Landscape → Solution Architecture → Technical Deep-Dive → ROI → Implementation → Conclusion",
    casestudy: "Client Profile → Challenge → Solution → Implementation → Results → Lessons Learned → Next Steps",
  };

  const prompt = `Jesteś Aristotle — Chief Research Officer CoLwork.
Napisz ${format.toUpperCase()} po polsku na temat: "${opts.topic}".

Struktura: ${structureGuide[format] || structureGuide.whitepaper}
Słowa docelowe: ~${opts.targetWords || 2000}

Dane z researchu (Sherlock):
${sources || "Brak — użyj ogólnej wiedzy."}

ZASADY ANTY-HALUCYNACYJNE:
1. NIE zmyślaj nazwisk, tytułów badań, konkretnych liczb.
2. Zamiast fake'owych cytatów: [TUTAJ WSTAW CYTAT Z BADANIA O <temat>]
3. Zamiast fake'owych metryk: [INSERT REAL METRICS FROM <źródło>]

Wygeneruj PEŁNY artykuł z ## nagłówkami sekcji.`;

  const resp = await withRetry(() => client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: "Jesteś Aristotle — Research Officer CoLwork. Piszesz artykuły po polsku. Zero halucynacji." },
      { role: "user", content: prompt },
    ],
    temperature: 0.5,
    max_tokens: 4000,
  }), { retries: 2, label: "aristotle.web" });

  const fullText = resp.choices[0].message.content.trim();
  const citationMarkers = (fullText.match(/\[INSERT|\[TUTAJ WSTAW|\[SOURCE NEEDED/g) || []).length;

  return {
    title: opts.topic,
    sections: { body: { title: "Content", body: fullText } },
    sectionOrder: ["body"],
    fullText,
    bibliography: "",
    format,
    wordCount: fullText.split(/\s+/).length,
    citationCount: citationMarkers,
    sourceCount: 0,
    strictMode: false,
  };
}

/**
 * Generate an executive summary (1-pager) from a full paper.
 */
async function executiveSummary(fullText) {
  const resp = await withRetry(() => client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: "Stwórz 1-stronicowe executive summary po polsku. Max 400 słów. Same konkrety." },
      { role: "user", content: `Streszcz:\n\n${fullText.slice(0, 4000)}` },
    ],
    temperature: 0.4,
    max_tokens: 800,
  }), { retries: 2, label: "aristotle.summary" });

  return resp.choices[0].message.content.trim();
}

module.exports = { ingestSources, generatePaper, executiveSummary };
