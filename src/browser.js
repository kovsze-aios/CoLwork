"use strict";

const { chromium } = require("playwright-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const path = require("path");
const fs = require("fs");
const readline = require("readline");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

// Register stealth evasion plugin
chromium.use(StealthPlugin());

const COOKIES_PATH = path.resolve(__dirname, "..", "data", "cookies.json");
const DEFAULT_TIMEOUT = 60000; // 60s — czas na reakcję telefonu

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

/**
 * Pause execution until the user presses ENTER in the terminal.
 * Used for manual 2FA / Captcha intervention.
 */
function waitForHuman(promptMessage) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(promptMessage, () => {
      rl.close();
      resolve();
    });
  });
}

// ── BrowserManager class ─────────────────────────────────────────────────────

class BrowserManager {
  constructor() {
    this.browser = null;
    this.context = null;
    this.page = null;
    this._headless = process.env.HEADLESS === "true";
    this._stealthReady = false;
  }

  // ── Launch ──────────────────────────────────────────────────────────────

  async start({ forceLogin = false } = {}) {
    console.log(`[browser] Launching Chromium (headless=${this._headless}, stealth=on)...`);

    this.browser = await chromium.launch({
      headless: this._headless,
      args: [
        "--disable-blink-features=AutomationControlled",
        "--disable-dev-shm-usage",
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-features=IsolateOrigins,site-per-process",
        "--disable-web-security",
      ],
    });

    this.context = await this.browser.newContext({
      userAgent: randomUserAgent(),
      viewport: { width: 1440, height: 900 },
      locale: "en-US",
      timezoneId: "Europe/Warsaw",
      permissions: ["clipboard-read", "clipboard-write"],
    });

    this.page = await this.context.newPage();

    // Additional evasion scripts (stealth plugin handles most, these fill gaps)
    await this.page.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => false });
      Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3, 4, 5] });
      Object.defineProperty(navigator, "languages", { get: () => ["en-US", "en"] });
      window.chrome = { runtime: {} };
      const originalQuery = window.navigator.permissions.query;
      window.navigator.permissions.query = (parameters) =>
        parameters.name === "notifications"
          ? Promise.resolve({ state: Notification.permission })
          : originalQuery(parameters);
    });

    this._stealthReady = true;

    // Attempt session restore
    const restored = await this._loadSession();

    if (restored && !forceLogin) {
      await this.page.goto("https://www.linkedin.com/feed/", {
        waitUntil: "domcontentloaded",
        timeout: DEFAULT_TIMEOUT,
      });
      await randomDelay(2000, 4000);

      const url = this.page.url();
      if (url.includes("/feed") || url.includes("/mynetwork")) {
        console.log("[browser] Session restored from cookies.");
        return this.page;
      }
      console.log("[browser] Cookies expired, re-authenticating...");
    }

    // No valid cookies → login or wait
    await this._authenticate(forceLogin);
    return this.page;
  }

  // ── Session / Cookie management ─────────────────────────────────────────

  async _loadSession() {
    fs.mkdirSync(path.dirname(COOKIES_PATH), { recursive: true });

    if (!fs.existsSync(COOKIES_PATH)) {
      console.log("[browser] No cookies file found — fresh session required.");
      return false;
    }

    const raw = fs.readFileSync(COOKIES_PATH, "utf-8");
    let cookies;
    try {
      cookies = JSON.parse(raw);
    } catch {
      console.warn("[browser] Corrupted cookies file, removing.");
      fs.unlinkSync(COOKIES_PATH);
      return false;
    }

    if (!cookies.length) {
      return false;
    }

    await this.context.addCookies(cookies);
    console.log(`[browser] Loaded ${cookies.length} cookies from disk.`);
    return true;
  }

  async _saveSession() {
    const cookies = await this.context.cookies();
    fs.mkdirSync(path.dirname(COOKIES_PATH), { recursive: true });
    fs.writeFileSync(COOKIES_PATH, JSON.stringify(cookies, null, 2));
    console.log(`[browser] Saved ${cookies.length} cookies to ${COOKIES_PATH}`);
  }

  // ── Authentication ──────────────────────────────────────────────────────

  async _authenticate(forceLogin) {
    const email = process.env.LINKEDIN_EMAIL;
    const password = process.env.LINKEDIN_PASSWORD;

    // ── Path A: No credentials → full manual login ──────────────────────

    if (!email || !password) {
      console.log("[browser] No credentials in .env. Opening LinkedIn — please log in manually.");
      console.log("[browser] The script will detect login and save your session.");
      await this.page.goto("https://www.linkedin.com/login", {
        waitUntil: "domcontentloaded",
        timeout: DEFAULT_TIMEOUT,
      });
      await waitForHuman(
        "\n🔐 Zaloguj się ręcznie w oknie przeglądarki. Po zalogowaniu naciśnij ENTER tutaj...\n"
      );
      await this._postLoginSave();
      return;
    }

    // ── Path B: Credentials provided → auto-fill, then wait for 2FA ─────

    console.log("[browser] Navigating to login page...");
    await this.page.goto("https://www.linkedin.com/login", {
      waitUntil: "domcontentloaded",
      timeout: DEFAULT_TIMEOUT,
    });
    await randomDelay(1000, 2000);

    // Try to fill the username field — if it's not there within 5s,
    // LinkedIn has thrown a challenge (Captcha) before showing the form.
    const usernameField = this.page.locator("#username");
    try {
      await usernameField.waitFor({ state: "visible", timeout: 5000 });
      console.log("[browser] Login form detected. Filling credentials...");
    } catch {
      // No #username → challenge page (Captcha / 2FA before login form)
      console.log("");
      console.log("╔══════════════════════════════════════════════════════════════╗");
      console.log("║  ⚠️  WYKRYTO BLOKADĘ LUB 2FA!                              ║");
      console.log("║                                                            ║");
      console.log("║  LinkedIn rzucił Captcha lub weryfikację z wyprzedzeniem.  ║");
      console.log("║  Wykonaj weryfikację w otwartym oknie przeglądarki,        ║");
      console.log("║  a następnie naciśnij ENTER w tym terminalu,               ║");
      console.log("║  aby kontynuować...                                        ║");
      console.log("╚══════════════════════════════════════════════════════════════╝");
      console.log("");
      await waitForHuman("⏳ [oczekiwanie na ENTER...] ");
      await this._postLoginSave();
      return;
    }

    // Fill credentials
    await this.page.fill("#username", email);
    await randomDelay(400, 800);
    await this.page.fill("#password", password);
    await randomDelay(400, 800);

    await this.page.click('button[type="submit"]');

    // ── Post-submit: detect outcome ────────────────────────────────────

    // Check if auth success (feed nav icon appears)
    try {
      await this.page.waitForSelector(".global-nav__me", { timeout: 15000 });
      console.log("[browser] Login confirmed — feed loaded.");
      await this._saveSession();
      return;
    } catch {
      // .global-nav__me didn't appear — could be 2FA, Captcha, or error
    }

    // Check if we're on a challenge/checkpoint page
    const currentUrl = this.page.url();

    if (
      currentUrl.includes("/checkpoint/") ||
      currentUrl.includes("/challenge/") ||
      currentUrl.includes("/verification") ||
      currentUrl.includes("/two-factor")
    ) {
      console.log("");
      console.log("╔══════════════════════════════════════════════════════════════╗");
      console.log("║  ⚠️  WERYFIKACJA DWUETAPOWA (2FA / CAPTCHA)                 ║");
      console.log("║                                                            ║");
      console.log("║  LinkedIn wymaga dodatkowej weryfikacji.                    ║");
      console.log("║  Zatwierdź logowanie w aplikacji LinkedIn na telefonie      ║");
      console.log("║  lub rozwiąż Captcha w oknie przeglądarki.                  ║");
      console.log("║                                                            ║");
      console.log("║  Po zakończeniu weryfikacji naciśnij ENTER.                 ║");
      console.log("╚══════════════════════════════════════════════════════════════╝");
      console.log("");
      await waitForHuman("⏳ [oczekiwanie na ENTER...] ");
      await this._postLoginSave();
      return;
    }

    // Unknown post-login state — pause for human
    console.warn(`[browser] Unexpected post-login URL: ${currentUrl}`);
    await waitForHuman(
      "\n⚠️  Nieoczekiwany stan. Sprawdź okno przeglądarki i naciśnij ENTER, aby kontynuować...\n"
    );
    await this._postLoginSave();
  }

  /**
   * Post-login save: checks if we're on the feed, saves cookies.
   * Called after manual intervention (2FA, Captcha, ENTER press).
   */
  async _postLoginSave() {
    await randomDelay(1500, 3000);

    const url = this.page.url();
    const hasNav = (await this.page.locator(".global-nav__me").count()) > 0;

    if (url.includes("/feed") || url.includes("/mynetwork") || hasNav) {
      await this._saveSession();
      console.log("[browser] Login confirmed. Session saved.");
      return;
    }

    // Still not on feed — try navigating there
    console.log("[browser] Not on feed. Attempting direct navigation...");
    try {
      await this.page.goto("https://www.linkedin.com/feed/", {
        waitUntil: "domcontentloaded",
        timeout: DEFAULT_TIMEOUT,
      });
    } catch {
      // swallow navigation errors
    }
    await randomDelay(2000, 4000);

    const url2 = this.page.url();
    const hasNav2 = (await this.page.locator(".global-nav__me").count()) > 0;

    if (url2.includes("/feed") || url2.includes("/mynetwork") || hasNav2) {
      await this._saveSession();
      console.log("[browser] Navigated to feed. Session saved.");
    } else {
      console.warn(`[browser] ⚠️  Still not on feed (url=${url2}). Saving cookies anyway.`);
      await this._saveSession();
    }
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  async _humanType(selector, text) {
    const el = await this.page.locator(selector);
    await el.click();
    await randomDelay(400, 1000);
    for (const ch of text) {
      await this.page.keyboard.type(ch, { delay: 60 + Math.random() * 120 });
    }
    await randomDelay(200, 600);
  }

  // ── Teardown ────────────────────────────────────────────────────────────

  async stop() {
    if (this.browser) {
      await this.browser.close();
      console.log("[browser] Browser closed.");
    }
    this.browser = null;
    this.context = null;
    this.page = null;
    this._stealthReady = false;
  }

  // ── Status ──────────────────────────────────────────────────────────────

  get status() {
    return {
      running: this.browser !== null && this.browser.isConnected(),
      stealth: this._stealthReady,
      cookiesFile: COOKIES_PATH,
      cookiesExist: fs.existsSync(COOKIES_PATH),
      headless: this._headless,
    };
  }
}

// ── Singleton ────────────────────────────────────────────────────────────────

const browserManager = new BrowserManager();

module.exports = {
  BrowserManager,
  browserManager,
  randomDelay,
  randomUserAgent,
  waitForHuman,
  COOKIES_PATH,
};
