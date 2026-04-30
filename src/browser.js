"use strict";

const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const COOKIES_FILE = process.env.COOKIES_FILE || "./data/cookies.json";
const COOKIES_PATH = path.resolve(COOKIES_FILE);

// Ensure data directory exists
fs.mkdirSync(path.dirname(COOKIES_PATH), { recursive: true });

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
];

function randomDelay(min = 800, max = 2500) {
  const ms = Math.floor(Math.random() * (max - min) + min);
  return new Promise((r) => setTimeout(r, ms));
}

function randomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

async function loadCookies(context) {
  if (fs.existsSync(COOKIES_PATH)) {
    const raw = fs.readFileSync(COOKIES_PATH, "utf-8");
    const cookies = JSON.parse(raw);
    if (cookies.length) {
      await context.addCookies(cookies);
      return true;
    }
  }
  return false;
}

async function saveCookies(context) {
  const cookies = await context.cookies();
  fs.mkdirSync(path.dirname(COOKIES_PATH), { recursive: true });
  fs.writeFileSync(COOKIES_PATH, JSON.stringify(cookies, null, 2));
}

/**
 * Human-like type into an input field.
 */
async function humanType(page, selector, text) {
  const el = await page.locator(selector);
  await el.click();
  await randomDelay(400, 1000);
  for (const ch of text) {
    await page.keyboard.type(ch, { delay: 60 + Math.random() * 120 });
  }
  await randomDelay(200, 600);
}

/**
 * Launch browser and log into LinkedIn.
 * Reuses saved cookies when possible.
 */
async function createSession(opts = {}) {
  const headless = process.env.HEADLESS === "true";

  const browser = await chromium.launch({
    headless,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--disable-dev-shm-usage",
      "--no-sandbox",
      "--disable-setuid-sandbox",
    ],
  });

  const context = await browser.newContext({
    userAgent: randomUserAgent(),
    viewport: { width: 1440, height: 900 },
    locale: "en-US",
    timezoneId: "Europe/Warsaw",
  });

  const page = await context.newPage();

  // Evade basic detection
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => false });
    Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3, 4, 5] });
    Object.defineProperty(navigator, "languages", { get: () => ["en-US", "en"] });
  });

  // Try cookie reuse first
  const hasCookies = await loadCookies(context);
  if (hasCookies && !opts.forceLogin) {
    await page.goto("https://www.linkedin.com/feed/", { waitUntil: "networkidle", timeout: 30000 });
    await randomDelay(2000, 4000);

    // Check if session is still valid
    const url = page.url();
    if (url.includes("/feed") || url.includes("/mynetwork")) {
      console.log("[browser] Session restored from cookies.");
      return { browser, context, page };
    }
    console.log("[browser] Cookies expired, re-authenticating...");
  }

  // Login flow
  const email = process.env.LINKEDIN_EMAIL;
  const password = process.env.LINKEDIN_PASSWORD;

  if (!email || !password) {
    throw new Error("[browser] LINKEDIN_EMAIL and LINKEDIN_PASSWORD must be set in .env");
  }

  console.log("[browser] Navigating to login page...");
  await page.goto("https://www.linkedin.com/login", { waitUntil: "networkidle", timeout: 30000 });
  await randomDelay(1500, 3000);

  await humanType(page, "#username", email);
  await randomDelay(500, 1000);
  await humanType(page, "#password", password);
  await randomDelay(800, 1500);

  await page.click('button[type="submit"]');
  await randomDelay(3000, 6000);

  // Handle possible verification
  const currentUrl = page.url();
  if (currentUrl.includes("/checkpoint/") || currentUrl.includes("/challenge/")) {
    console.log("[browser] ⚠️  Verification requested — please complete it manually in the browser window.");
    console.log("[browser] Waiting up to 120s for manual verification...");
    await page.waitForURL("**/feed/**", { timeout: 120000 });
    console.log("[browser] Verification passed.");
  }

  if (page.url().includes("/feed") || page.url().includes("/mynetwork")) {
    await saveCookies(context);
    console.log("[browser] Login successful, cookies saved.");
  } else {
    throw new Error(`[browser] Unexpected post-login URL: ${page.url()}`);
  }

  return { browser, context, page };
}

module.exports = { createSession, saveCookies, randomDelay, humanType, COOKIES_PATH };
