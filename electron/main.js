"use strict";

const { app, BrowserWindow, ipcMain, shell, dialog } = require("electron");

// ── GPU rendering pipeline (must be set BEFORE app.ready) ─────────────────
app.commandLine.appendSwitch("enable-gpu-rasterization");
app.commandLine.appendSwitch("enable-zero-copy");
app.commandLine.appendSwitch("enable-accelerated-2d-canvas");
app.commandLine.appendSwitch("disable-frame-rate-limit");
app.commandLine.appendSwitch("enable-native-gpu-memory-buffers");
const path = require("path");
const fs = require("fs");
const os = require("os");

/**
 * Production .env discovery order (first hit wins):
 *   1. <userData>/.env           — written by the user post-install (preferred)
 *   2. <resourcesPath>/.env      — sysadmin / OEM drop-in next to app.asar
 *   3. <repo-root>/.env          — dev mode, when running `npm run dev`
 */
function loadEnv() {
  const dotenv = require("dotenv");
  const candidates = [
    app.isReady() ? path.join(app.getPath("userData"), ".env") : null,
    process.resourcesPath ? path.join(process.resourcesPath, ".env") : null,
    path.join(__dirname, "..", ".env"),
  ].filter(Boolean);
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      dotenv.config({ path: p });
      console.log(`[colwork] loaded .env from ${p}`);
      return p;
    }
  }
  console.warn("[colwork] no .env found — using process.env only");
  return null;
}
loadEnv();

/**
 * Auto-initialise .env on first boot.
 * If no .env is found in any of the discovery paths, copy .env.example
 * into <userData>/.env so the UI can guide the user through setup.
 */
function autoInitEnv() {
  const userDataEnv = path.join(app.getPath("userData"), ".env");
  if (fs.existsSync(userDataEnv)) return { existed: true, path: userDataEnv };
  const resourceEnv = process.resourcesPath ? path.join(process.resourcesPath, ".env") : null;
  if (resourceEnv && fs.existsSync(resourceEnv)) return { existed: true, path: resourceEnv };
  const repoEnv = path.join(__dirname, "..", ".env");
  if (fs.existsSync(repoEnv)) return { existed: true, path: repoEnv };
  // No .env anywhere — seed one from .env.example
  const examplePaths = [
    process.resourcesPath ? path.join(process.resourcesPath, ".env.example") : null,
    path.join(__dirname, "..", ".env.example"),
  ].filter(Boolean);
  for (const src of examplePaths) {
    if (fs.existsSync(src)) {
      try {
        fs.copyFileSync(src, userDataEnv);
        console.log(`[colwork] seeded .env from ${src} → ${userDataEnv}`);
        return { existed: false, seeded: true, path: userDataEnv };
      } catch (e) {
        console.warn(`[colwork] failed to seed .env: ${e.message}`);
        return { existed: false, seeded: false, error: e.message };
      }
    }
  }
  return { existed: false, seeded: false, error: ".env.example not found" };
}

const isDev = process.env.COLWORK_DEV === "1" || !app.isPackaged;
const VITE_URL = "http://localhost:3000";

let mainWindow = null;

// ── PTY (in-app terminal) ────────────────────────────────────────────────────
// Native modules with .node binaries must be loaded from app.asar.unpacked
// when the app is packaged. We try the regular require first (dev mode), then
// fall back to the unpacked path (production).
let pty = null;
try {
  // Prefer prebuilt multiarch (ships .node binaries for Electron's Node version)
  pty = require("@homebridge/node-pty-prebuilt-multiarch");
} catch {
  try {
    pty = require("node-pty");
  } catch (firstErr) {
    try {
      const unpackedPath = path.join(process.resourcesPath || "", "app.asar.unpacked", "node_modules", "node-pty");
      pty = require(unpackedPath);
    } catch {
      console.warn("[colwork] node-pty unavailable — terminal will use fallback shell:", firstErr.message);
    }
  }
}

const ptyShells = new Map();

function spawnPty(id, opts = {}) {
  if (!pty) return null;
  // Resolve shell: COMSPEC (cmd.exe) → PowerShell → bash fallback.
  // On Windows we prefer PowerShell when available (better ANSI/UTF-8 support).
  let shell;
  if (process.platform === "win32") {
    const ps = `${process.env.SystemRoot || "C:\\Windows"}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`;
    if (fs.existsSync(ps)) shell = ps;
    else shell = process.env.COMSPEC || "cmd.exe";
  } else {
    shell = process.env.SHELL || "/bin/bash";
  }
  // The PTY inherits the user's local environment + a few CoLwork helpers.
  // Anything Anthropic-flavoured is sourced from the user's own .env at runtime
  // — never baked into the binary — so the open-source build is safe to ship.
  const childEnv = {
    ...process.env,
    COLWORK_HOME: path.join(__dirname, ".."),
  };
  if (process.env.DEEPSEEK_API_KEY) {
    Object.assign(childEnv, {
      ANTHROPIC_BASE_URL: process.env.ANTHROPIC_BASE_URL || "https://api.deepseek.com/anthropic",
      ANTHROPIC_AUTH_TOKEN: process.env.DEEPSEEK_API_KEY,
      ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL || "deepseek-chat",
      ANTHROPIC_DEFAULT_OPUS_MODEL: process.env.ANTHROPIC_DEFAULT_OPUS_MODEL || "deepseek-chat",
      ANTHROPIC_DEFAULT_SONNET_MODEL: process.env.ANTHROPIC_DEFAULT_SONNET_MODEL || "deepseek-chat",
      ANTHROPIC_DEFAULT_HAIKU_MODEL: process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL || "deepseek-chat",
      CLAUDE_CODE_SUBAGENT_MODEL: process.env.CLAUDE_CODE_SUBAGENT_MODEL || "deepseek-chat",
      CLAUDE_CODE_EFFORT_LEVEL: process.env.CLAUDE_CODE_EFFORT_LEVEL || "max",
    });
  }
  const ptyProc = pty.spawn(shell, [], {
    name: "xterm-256color",
    cols: opts.cols || 100,
    rows: opts.rows || 28,
    cwd: opts.cwd || os.homedir(),  // os.homedir() avoids Error 267 inside packaged app.asar
    env: childEnv,
  });
  ptyShells.set(id, ptyProc);
  ptyProc.onData((data) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(`pty.data.${id}`, data);
    }
  });
  ptyProc.onExit(({ exitCode }) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(`pty.exit.${id}`, exitCode);
    }
    ptyShells.delete(id);
  });
  return ptyProc;
}

// ── Window ───────────────────────────────────────────────────────────────────

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    frame: false,
    titleBarStyle: "hidden",
    backgroundColor: "#09090b",
    show: false,
    icon: path.join(__dirname, "..", "build", "icon.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.once("ready-to-show", () => mainWindow.show());

  if (isDev) {
    mainWindow.loadURL(VITE_URL).catch(() => loadProdBundle());
  } else {
    loadProdBundle();
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("closed", () => { mainWindow = null; });
}

function loadProdBundle() {
  const indexPath = path.join(__dirname, "..", "ui", "dist", "index.html");
  if (fs.existsSync(indexPath)) mainWindow.loadFile(indexPath);
  else mainWindow.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(
    "<h1 style='font-family:sans-serif;color:#0A66C2;padding:40px;background:#09090b'>CoLwork — UI bundle missing. Run <code>npm run ui:build</code>.</h1>"
  ));
}

// ── IPC: window controls ─────────────────────────────────────────────────────

ipcMain.handle("window.minimize", () => mainWindow?.minimize());
ipcMain.handle("window.maximize", () => {
  if (!mainWindow) return false;
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
  return mainWindow.isMaximized();
});
ipcMain.handle("window.close", () => mainWindow?.close());
ipcMain.handle("window.isMaximized", () => mainWindow?.isMaximized() || false);

// ── IPC: PTY (terminal) ──────────────────────────────────────────────────────

ipcMain.handle("pty.spawn", (_e, { id, cols, rows, cwd }) => {
  if (ptyShells.has(id)) return { ok: true, existed: true, fallback: false };
  if (!pty) return { ok: false, fallback: true, message: "node-pty not installed; using read-only fallback" };
  spawnPty(id, { cols, rows, cwd });
  return { ok: true, fallback: false };
});

ipcMain.on("pty.write", (_e, { id, data }) => {
  ptyShells.get(id)?.write(data);
});

ipcMain.on("pty.resize", (_e, { id, cols, rows }) => {
  try { ptyShells.get(id)?.resize(cols, rows); } catch { /* shell exited */ }
});

ipcMain.handle("pty.kill", (_e, { id }) => {
  const p = ptyShells.get(id);
  if (p) { p.kill(); ptyShells.delete(id); return true; }
  return false;
});

// ── IPC: Engine bridge (calls into existing src/) ────────────────────────────

let engine = null;
function loadEngine() {
  if (engine) return engine;
  try {
    const n8nBridge = require(path.join(__dirname, "..", "src", "utils", "n8n_bridge"));
    const memory = require(path.join(__dirname, "..", "src", "utils", "memory"));
    const ai = require(path.join(__dirname, "..", "src", "ai"));
    engine = { n8nBridge, memory, ai };
  } catch (e) {
    console.error("[colwork] engine load error:", e.message);
    engine = { error: e.message };
  }
  return engine;
}

ipcMain.handle("engine.health", async () => {
  const eng = loadEngine();
  if (eng.error) return { ok: false, error: eng.error };
  const n8n = await eng.n8nBridge.healthCheck();
  const memory = (() => { try { return eng.memory.loadMemory(); } catch { return { actions: [] }; } })();
  const usage = eng.ai.getUsage?.() || { calls: 0, costUsd: 0 };
  const recent = (memory.actions || []).slice(-25).reverse().map((a) => ({
    type: a.type, timestamp: a.timestamp, summary: JSON.stringify(a.payload || {}).slice(0, 80),
  }));
  return {
    ok: true,
    n8n: { connected: n8n.ok, baseUrl: n8n.baseUrl, queuedLeads: n8n.queuedLeads || 0 },
    memory: { totalActions: (memory.actions || []).length },
    recentActivity: recent,
    usage,
    version: "10.0.0",
    board: { active: 6 },
  };
});

ipcMain.handle("engine.applyJob", async (_e, payload) => {
  const eng = loadEngine();
  if (eng.error) return { ok: false, error: eng.error };
  return await eng.n8nBridge.applyToJob(payload);
});

ipcMain.handle("engine.optimizeProfile", async (_e, payload) => {
  const eng = loadEngine();
  if (eng.error) return { ok: false, error: eng.error };
  return await eng.n8nBridge.optimizeProfile(payload);
});

ipcMain.handle("engine.usage", () => {
  const eng = loadEngine();
  return eng.error ? { calls: 0, costUsd: 0 } : (eng.ai.getUsage?.() || { calls: 0, costUsd: 0 });
});

ipcMain.handle("engine.openExternal", (_e, url) => shell.openExternal(url));

ipcMain.handle("engine.saveDialog", async (_e, { defaultPath, content }) => {
  const result = await dialog.showSaveDialog(mainWindow, { defaultPath });
  if (!result.canceled && result.filePath) {
    fs.writeFileSync(result.filePath, content || "", "utf-8");
    return { ok: true, path: result.filePath };
  }
  return { ok: false };
});

// ── IPC: Setup & .env management ──────────────────────────────────────────

ipcMain.handle("engine.getSetupStatus", () => {
  const envPath = loadEnv() || autoInitEnv().path || null;
  const hasN8nKey = !!(process.env.N8N_API_KEY && process.env.N8N_API_KEY.length > 10 && !process.env.N8N_API_KEY.includes("replace-me"));
  const hasN8nUrl = !!(process.env.N8N_BASE_URL && process.env.N8N_BASE_URL.length > 5 && !process.env.N8N_BASE_URL.includes("replace-me"));
  const hasDeepSeek = !!(process.env.DEEPSEEK_API_KEY && process.env.DEEPSEEK_API_KEY.length > 10 && !process.env.DEEPSEEK_API_KEY.includes("replace-me"));
  return {
    ok: true,
    envPath,
    envExists: !!envPath && fs.existsSync(envPath),
    configured: {
      n8n: hasN8nKey && hasN8nUrl,
      n8nKey: hasN8nKey,
      n8nUrl: hasN8nUrl,
      deepseek: hasDeepSeek,
    },
  };
});

ipcMain.handle("engine.saveEnv", async (_e, { content }) => {
  try {
    const target = path.join(app.getPath("userData"), ".env");
    fs.writeFileSync(target, content || "", "utf-8");
    // Reload env so newly saved values take effect immediately
    const dotenv = require("dotenv");
    dotenv.config({ path: target, override: true });
    console.log(`[colwork] .env saved & reloaded from ${target}`);
    // Reload engine modules so they pick up the new env
    engine = null;
    return { ok: true, path: target };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// ── Content Studio: posts, scripts, publication archive ────────────────────
const PUB_DIR = path.join(__dirname, "..", "data", "publications");

// Maps an action.type → which view it belongs to in the Activity Log.
// Anything not listed falls into "other" and is hidden from the log.
const JOB_ACTION_TYPES = new Set([
  "job_apply",
  "job_apply_queued",
  "board_pipeline_complete",
  "board_feynman",
  "board_seed",
  "audit",
]);
const PROFILE_ACTION_TYPES = new Set([
  "profile_optimize",
  "profile_optimize_queued",
  "board_optimize_complete",
  "board_feynman_optimize",
  "board_seed_optimize",
  "visual_audit",
]);
const CONTENT_ACTION_TYPES = new Set([
  "post_published",
  "video_script_generated",
  "post_generated",
  "aggregate_post",
]);

function categorizeAction(type) {
  if (JOB_ACTION_TYPES.has(type)) return "job";
  if (PROFILE_ACTION_TYPES.has(type)) return "profile";
  if (CONTENT_ACTION_TYPES.has(type)) return "content";
  return null;
}

ipcMain.handle("engine.activityFeed", () => {
  const eng = loadEngine();
  if (eng.error) return { ok: false, error: eng.error };
  try {
    // Memory log → categorized actions
    const memory = (() => { try { return eng.memory.loadMemory(); } catch { return { actions: [] }; } })();
    const actions = (memory.actions || [])
      .map((a) => ({
        ...a,
        category: categorizeAction(a.type),
      }))
      .filter((a) => a.category)
      .sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || ""));

    // Publications archive → content events (synthetic, since not always in memory)
    let pubs = [];
    if (fs.existsSync(PUB_DIR)) {
      pubs = fs.readdirSync(PUB_DIR)
        .filter((f) => /\.(md|pdf|txt)$/i.test(f))
        .map((f) => {
          const stat = fs.statSync(path.join(PUB_DIR, f));
          return {
            type: "publication",
            timestamp: stat.mtime.toISOString(),
            payload: { filename: f, sizeBytes: stat.size, ext: path.extname(f).slice(1).toLowerCase() },
            category: "content",
          };
        });
    }

    const all = [...actions, ...pubs]
      .sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || ""))
      .slice(0, 200);

    const counts = {
      jobs: actions.filter((a) => a.category === "job").length,
      profile: actions.filter((a) => a.category === "profile").length,
      content: actions.filter((a) => a.category === "content").length + pubs.length,
      total: all.length,
    };

    return { ok: true, items: all, counts };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle("engine.listPublications", () => {
  try {
    if (!fs.existsSync(PUB_DIR)) return { ok: true, items: [] };
    const items = fs.readdirSync(PUB_DIR)
      .filter((f) => /\.(md|pdf|txt)$/i.test(f))
      .map((f) => {
        const fp = path.join(PUB_DIR, f);
        const stat = fs.statSync(fp);
        return {
          filename: f,
          ext: path.extname(f).slice(1).toLowerCase(),
          sizeBytes: stat.size,
          modifiedAt: stat.mtime.toISOString(),
          path: fp,
        };
      })
      .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));
    return { ok: true, items };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle("engine.readPublication", (_e, { filename }) => {
  try {
    const safe = path.basename(filename || "");
    const fp = path.join(PUB_DIR, safe);
    if (!fp.startsWith(PUB_DIR) || !fs.existsSync(fp)) return { ok: false, error: "not_found" };
    const ext = path.extname(safe).slice(1).toLowerCase();
    if (ext === "pdf") return { ok: true, ext, binary: true, path: fp };
    return { ok: true, ext, content: fs.readFileSync(fp, "utf-8") };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle("engine.generatePost", async (_e, { topic, tone, length }) => {
  const eng = loadEngine();
  if (eng.error) return { ok: false, error: eng.error };
  try {
    const post = await eng.ai.generatePost({ topic, tone, length });
    return { ok: true, post, topic };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle("engine.generateVideoScript", async (_e, { topic, lengthSec }) => {
  const eng = loadEngine();
  if (eng.error) return { ok: false, error: eng.error };
  // Reuse the same chat plumbing as generatePost — we ask for a script-shaped output.
  try {
    const seconds = Math.max(15, Math.min(180, Number(lengthSec) || 60));
    const user = [
      `Temat: ${topic}`,
      `Długość docelowa: ${seconds}s wideo (≈${Math.round(seconds * 2.5)} słów).`,
      "Format: HOOK (3 sek) → punkty kluczowe (numerowane) → CTA.",
      "Konkretne liczby. Krótkie zdania. Polski. Bez emoji. Tylko skrypt.",
    ].join("\n");
    const text = await eng.ai.chat({
      system: "Jesteś scenarzystą krótkich form wideo (LinkedIn / Reels).",
      user,
      label: "video-script",
      maxTokens: 700,
      temperature: 0.7,
    });
    return { ok: true, script: text, topic, seconds };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

// ── App lifecycle ────────────────────────────────────────────────────────────

// ── Auto-updater (GitHub OTA) ─────────────────────────────────────────────

let updater = null;
try {
  const { autoUpdater } = require("electron-updater");
  updater = autoUpdater;
  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = true;
  updater.logger = console;

  updater.on("checking-for-update", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("update.checking");
    }
  });
  updater.on("update-available", (info) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("update.available", info);
    }
  });
  updater.on("update-not-available", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("update.not-available");
    }
  });
  updater.on("download-progress", (progress) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("update.download-progress", progress);
    }
  });
  updater.on("update-downloaded", (info) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("update.downloaded", info);
    }
  });
  updater.on("error", (err) => {
    console.warn("[colwork] updater error:", err.message);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("update.error", { message: err.message });
    }
  });
} catch (e) {
  console.warn("[colwork] electron-updater unavailable:", e.message);
}

ipcMain.handle("update.check", async () => {
  if (!updater) return { ok: false, error: "electron-updater not loaded" };
  try {
    const result = await updater.checkForUpdates();
    return { ok: true, ...(result?.updateInfo || {}) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle("update.install", () => {
  if (!updater) return { ok: false, error: "electron-updater not loaded" };
  updater.quitAndInstall();
  return { ok: true };
});

// ── App lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  // Seed .env from .env.example on first boot if missing
  autoInitEnv();
  createWindow();

  // Schedule OTA check 4s after boot (let the window paint first)
  if (updater && !isDev) {
    setTimeout(() => updater.checkForUpdatesAndNotify().catch(() => {}), 4000);
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  for (const p of ptyShells.values()) try { p.kill(); } catch { /* ignore */ }
  ptyShells.clear();
  if (process.platform !== "darwin") app.quit();
});

process.on("uncaughtException", (e) => console.error("[colwork.uncaught]", e));
process.on("unhandledRejection", (e) => console.error("[colwork.unhandled]", e));
