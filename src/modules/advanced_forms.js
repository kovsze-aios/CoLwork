"use strict";

const cheerio = require("cheerio");

// ── Reduced DOM extraction ───────────────────────────────────────────────────

/**
 * Extract only form-relevant elements from the current page.
 * Runs inside the browser via page.evaluate().
 * Returns a compact JSON representation instead of shipping megabytes of HTML.
 */
const EXTRACT_SCRIPT = () => {
  const FORM_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT", "BUTTON"]);

  // Find the closest label text for a given element
  function findLabel(el) {
    // Check for <label for="el.id">
    if (el.id) {
      const label = document.querySelector(`label[for="${el.id}"]`);
      if (label) return label.textContent.trim().slice(0, 120);
    }
    // Walk up 3 levels looking for a <label> wrapper or sibling
    let parent = el.parentElement;
    for (let i = 0; i < 3 && parent; i++) {
      const label = parent.querySelector("label");
      if (label) return label.textContent.trim().slice(0, 120);
      // Also check preceding sibling
      const prev = parent.previousElementSibling;
      if (prev && prev.tagName === "LABEL") return prev.textContent.trim().slice(0, 120);
      parent = parent.parentElement;
    }
    return "";
  }

  const elements = [];
  for (const el of document.querySelectorAll("input, textarea, select, button")) {
    if (!FORM_TAGS.has(el.tagName)) continue;
    // Skip hidden/submit inputs without labels (noise)
    if (el.type === "hidden") continue;
    if (el.type === "submit" && !el.id && !el.name) continue;

    const label = findLabel(el);
    const tag = el.tagName.toLowerCase();
    const type = el.getAttribute("type") || "";
    const id = el.id || "";
    const name = el.name || "";
    const placeholder = el.placeholder || "";
    const ariaLabel = el.getAttribute("aria-label") || "";
    const autocomplete = el.getAttribute("autocomplete") || "";
    // Build a unique-ish CSS selector
    let selector = "";
    if (id) {
      selector = `#${CSS.escape(id)}`;
    } else if (name) {
      selector = `${tag}[name="${name}"]`;
    } else if (ariaLabel) {
      selector = `${tag}[aria-label="${ariaLabel}"]`;
    } else if (placeholder) {
      selector = `${tag}[placeholder="${placeholder}"]`;
    }

    elements.push({ tag, type, id, name, placeholder, ariaLabel, autocomplete, label, selector });
  }
  return elements;
};

/**
 * Scrape the page and return a compact JSON of form fields.
 * @param {import("playwright").Page} page
 * @returns {Promise<Array<{tag,type,id,name,placeholder,ariaLabel,autocomplete,label,selector}>>}
 */
async function extractFormSchema(page) {
  const raw = await page.evaluate(EXTRACT_SCRIPT);
  return raw;
}

// ── DeepSeek AI mapping ──────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Jesteś parserem formularzy rekrutacyjnych ATS. Twoim zadaniem jest analiza poniższego kodu HTML.
Zwróć WYŁĄCZNIE poprawny, surowy obiekt JSON bez znaczników markdown.
JSON musi mapować standardowe pola kandydata na dokładne selektory CSS znalezione w kodzie.

Wymagane klucze w JSON:
- "firstName"    → selektor dla pola imienia
- "lastName"     → selektor dla pola nazwiska
- "email"        → selektor dla pola email
- "phone"        → selektor dla pola telefonu
- "linkedinUrl"  → selektor dla pola URL LinkedIn (jeśli istnieje, inaczej null)
- "resumeUploadBtn" → selektor dla przycisku uploadu CV (jeśli istnieje, inaczej null)
- "submitBtn"    → selektor dla przycisku submit/Dalej/Aplikuj
- "coverLetter"  → selektor dla pola textarea (jeśli istnieje, inaczej null)
- "extraFields"  → tablica { selector, label, suggestedValue } dla pól spoza standardu

Zasady:
1. Jako selektory używaj DOKŁADNIE tych z pola "selector" w danych wejściowych.
2. Jeśli pole nie istnieje, ustaw null.
3. Nie zgaduj selektorów — jeśli nie jesteś pewien, ustaw null.
4. Dla "extraFields" użyj suggestowanej wartości na podstawie kontekstu kandydata (AI Automation Engineer, doświadczenie w e-commerce i agentach).

ZWróć TYLKO surowy JSON. Bez markdowna, bez komentarzy.`;

/**
 * Send reduced form schema to DeepSeek and get a field-to-selector mapping.
 * @param {Array} fields - The extracted form fields
 * @param {object} aiClient - OpenAI-compatible client (DeepSeek)
 * @param {string} model - Model name
 * @returns {Promise<object>}
 */
async function analyzeFieldsWithAI(fields, aiClient, model = "deepseek-chat") {
  const compactHTML = JSON.stringify(fields, null, 0);

  const resp = await aiClient.chat.completions.create({
    model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: compactHTML },
    ],
    temperature: 0.1,
    max_tokens: 1200,
  });

  return resp.choices[0].message.content.trim();
}

// ── Robust JSON parsing ──────────────────────────────────────────────────────

/**
 * Parse DeepSeek's response into a field mapping, with retry on failure.
 */
function parseMapping(raw, fields) {
  // Clean markdown wrappers
  let cleaned = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();

  // Try direct parse
  let mapping;
  try {
    mapping = JSON.parse(cleaned);
    return validateMapping(mapping);
  } catch {
    // Fallback: try to extract JSON object from the text
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        mapping = JSON.parse(match[0]);
        return validateMapping(mapping);
      } catch {
        // Second fallback: build basic mapping heuristically
        return buildFallbackMapping(fields);
      }
    }
    return buildFallbackMapping(fields);
  }
}

/**
 * Ensure the mapping has all required keys at minimum.
 */
function validateMapping(mapping) {
  const required = [
    "firstName", "lastName", "email", "phone",
    "linkedinUrl", "resumeUploadBtn", "submitBtn", "coverLetter", "extraFields",
  ];
  for (const key of required) {
    if (!(key in mapping)) {
      mapping[key] = null;
    }
  }
  if (!Array.isArray(mapping.extraFields)) {
    mapping.extraFields = [];
  }
  return mapping;
}

/**
 * Heuristic fallback: guess selectors by label text.
 * Used when DeepSeek returns unparseable output.
 */
function buildFallbackMapping(fields) {
  const find = (patterns) => {
    for (const f of fields) {
      const text = (f.label + " " + f.placeholder + " " + f.name + " " + f.id + " " + f.ariaLabel + " " + f.autocomplete).toLowerCase();
      for (const p of patterns) {
        if (text.includes(p)) return f.selector;
      }
    }
    return null;
  };

  const submitSelectors = [
    ...fields.filter((f) => f.tag === "button" || f.type === "submit").map((f) => f.selector),
    ...fields.filter(
      (f) => ["apply", "submit", "dalej", "next", "send", "aplikuj", "wyślij"].some(
        (kw) => (f.label + f.name + f.id).toLowerCase().includes(kw)
      )
    ).map((f) => f.selector),
  ];

  return {
    firstName: find(["first", "imię", "imie", "given", "vorname"]),
    lastName: find(["last", "nazwisko", "surname", "family", "nachname"]),
    email: find(["email", "e-mail", "mail"]),
    phone: find(["phone", "telefon", "tel", "numer"]),
    linkedinUrl: find(["linkedin", "linked"]),
    resumeUploadBtn: find(["resume", "cv", "upload", "plik", "załącz", "zalacz", "attach"]),
    submitBtn: submitSelectors[0] || null,
    coverLetter: find(["cover", "list", "motywacyjny", "motivation", "message", "wiadomość", "wiadomosc"]),
    extraFields: [],
  };
}

// ── Main exported function ───────────────────────────────────────────────────

/**
 * Analyze an external ATS form (Workday, Greenhouse, Lever, etc.).
 *
 * @param {import("playwright").Page} page - Playwright page loaded on the application form
 * @param {object} deepseekClient - OpenAI-compatible client instance (DeepSeek)
 * @returns {Promise<{
 *   mapping: object,
 *   fields: Array,
 *   source: "ai" | "fallback"
 * }>}
 */
async function analyzeExternalForm(page, deepseekClient) {
  console.log("[advanced_forms] Extracting form schema from page...");
  const fields = await extractFormSchema(page);
  console.log(`[advanced_forms]   Extracted ${fields.length} form elements.`);

  if (fields.length === 0) {
    console.warn("[advanced_forms]   No form elements found on page.");
    return { mapping: buildFallbackMapping([]), fields: [], source: "fallback" };
  }

  console.log("[advanced_forms] Sending schema to DeepSeek for field mapping...");
  let mapping;
  let source = "ai";

  try {
    const raw = await analyzeFieldsWithAI(fields, deepseekClient);
    mapping = parseMapping(raw, fields);
    source = "ai";
    console.log("[advanced_forms]   AI mapping successful.");
  } catch (e) {
    console.error(`[advanced_forms]   AI mapping failed: ${e.message}. Using heuristic fallback.`);
    mapping = buildFallbackMapping(fields);
    source = "fallback";
  }

  // Log the final mapping summary
  const found = Object.entries(mapping).filter(
    ([k, v]) => v !== null && k !== "extraFields"
  );
  console.log(`[advanced_forms]   Mapped ${found.length} standard fields + ${mapping.extraFields.length} extras.`);

  return { mapping, fields, source };
}

/**
 * Fill an external ATS form using a previously-analyzed mapping.
 * @param {import("playwright").Page} page
 * @param {object} mapping - The field-to-selector mapping from analyzeExternalForm
 * @param {object} profile - Candidate profile data
 * @param {string} profile.firstName
 * @param {string} profile.lastName
 * @param {string} profile.email
 * @param {string} profile.phone
 * @param {string} profile.linkedinUrl
 * @param {string} profile.coverLetter - Pre-generated cover letter text
 * @returns {Promise<boolean>}
 */
async function fillExternalForm(page, mapping, profile) {
  const fieldMap = {
    firstName: profile.firstName || "",
    lastName: profile.lastName || "",
    email: profile.email || "",
    phone: profile.phone || "",
    linkedinUrl: profile.linkedinUrl || "",
    coverLetter: profile.coverLetter || "",
  };

  let filled = 0;

  for (const [key, value] of Object.entries(fieldMap)) {
    const selector = mapping[key];
    if (!selector || !value) continue;

    try {
      const el = page.locator(selector).first();
      if (await el.count() === 0) continue;

      const tag = await el.evaluate((n) => n.tagName.toLowerCase()).catch(() => "");
      if (tag === "select") {
        await el.selectOption({ label: value }).catch(() => el.selectOption({ index: 1 }).catch(() => {}));
      } else {
        await el.click();
        await el.fill("");
        await el.fill(value);
      }
      filled++;
    } catch (e) {
      // Silently skip fields that fail to fill
    }
  }

  // Fill extra fields if values provided
  if (mapping.extraFields && Array.isArray(mapping.extraFields)) {
    for (const extra of mapping.extraFields) {
      if (!extra.selector || !extra.suggestedValue) continue;
      try {
        const el = page.locator(extra.selector).first();
        if (await el.count() === 0) continue;
        await el.click();
        await el.fill(extra.suggestedValue);
        filled++;
      } catch {
        // skip
      }
    }
  }

  console.log(`[advanced_forms] Filled ${filled} form fields.`);
  return filled > 0;
}

module.exports = { analyzeExternalForm, fillExternalForm, extractFormSchema };
