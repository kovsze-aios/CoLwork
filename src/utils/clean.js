"use strict";

const ZERO_WIDTH = /[\u200B-\u200D\uFEFF\u00A0]/g;
const CTRL = /[\u0000-\u0008\u000B-\u001F\u007F]/g;
const QUOTES = /^["'`„""'']+|["'`„""'']+$/g;

function clean(str, { max, oneLine = false } = {}) {
  if (str === null || str === undefined) return "";
  let s = String(str);
  s = s.normalize("NFC").replace(ZERO_WIDTH, "").replace(CTRL, " ");
  if (oneLine) {
    s = s.replace(/[\r\n\t]+/g, " ");
  } else {
    s = s.replace(/\r\n?/g, "\n").replace(/\t/g, " ");
  }
  s = s.replace(/[ ]{2,}/g, " ").trim();
  s = s.replace(QUOTES, "").trim();
  if (max && s.length > max) s = s.slice(0, max).trim();
  return s;
}

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function url(u) {
  if (!u) return "";
  const s = clean(u, { oneLine: true });
  if (!/^https?:\/\//i.test(s)) return "";
  try {
    const parsed = new URL(s);
    parsed.hash = "";
    ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "trk", "trkInfo"].forEach((p) =>
      parsed.searchParams.delete(p)
    );
    return parsed.toString();
  } catch {
    return s;
  }
}

function nameCase(value) {
  const s = clean(value, { oneLine: true, max: 80 });
  if (!s) return "";
  return s
    .split(/\s+/)
    .map((w) => (w.length > 1 ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w.toUpperCase()))
    .join(" ");
}

function isoDate(d = new Date()) {
  const dt = d instanceof Date ? d : new Date(d);
  return Number.isNaN(dt.getTime()) ? new Date().toISOString() : dt.toISOString();
}

function csvSafe(value) {
  return clean(value, { oneLine: true }).replace(/[,;\t]/g, " ");
}

function tryJSON(raw, fallback = null) {
  if (raw === null || raw === undefined) return fallback;
  if (typeof raw === "object") return raw;
  let s = String(raw).trim();
  s = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  try {
    return JSON.parse(s);
  } catch {
    const m = s.match(/\{[\s\S]*\}/);
    if (m) {
      try { return JSON.parse(m[0]); } catch { return fallback; }
    }
    return fallback;
  }
}

module.exports = { clean, num, url, nameCase, isoDate, csvSafe, tryJSON };
