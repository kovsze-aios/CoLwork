"use strict";

const TRANSIENT_CODES = new Set([
  "ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "EAI_AGAIN",
  "ENETUNREACH", "EHOSTUNREACH", "EPIPE", "ECONNABORTED",
]);

const TRANSIENT_HTTP = new Set([408, 429, 500, 502, 503, 504, 522, 524]);

function isTransient(err) {
  if (!err) return false;
  if (TRANSIENT_CODES.has(err.code)) return true;
  const status = err.response?.status || err.status;
  if (status && TRANSIENT_HTTP.has(status)) return true;
  if (typeof err.message === "string") {
    const m = err.message.toLowerCase();
    if (m.includes("timeout") || m.includes("rate limit") || m.includes("network")) return true;
  }
  return false;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function withRetry(fn, opts = {}) {
  const retries = opts.retries ?? 3;
  const baseDelay = opts.baseDelay ?? 800;
  const maxDelay = opts.maxDelay ?? 8000;
  const label = opts.label || "task";
  const onRetry = opts.onRetry;

  let attempt = 0;
  let lastErr;
  while (attempt <= retries) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastErr = err;
      const transient = isTransient(err);
      if (!transient || attempt === retries) {
        throw err;
      }
      const delay = Math.min(maxDelay, baseDelay * Math.pow(2, attempt)) + Math.floor(Math.random() * 250);
      if (onRetry) onRetry({ attempt: attempt + 1, retries, delay, err });
      else console.warn(`[retry] ${label} attempt ${attempt + 1}/${retries} failed (${err.code || err.response?.status || err.message?.slice(0, 60)}); retrying in ${delay}ms`);
      await sleep(delay);
      attempt++;
    }
  }
  throw lastErr;
}

async function safe(fn, fallback = null, label = "safe") {
  try {
    return await fn();
  } catch (err) {
    console.warn(`[safe:${label}] swallowed: ${err.message?.slice(0, 120)}`);
    return fallback;
  }
}

module.exports = { withRetry, safe, isTransient, sleep };
