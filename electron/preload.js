"use strict";

const { contextBridge, ipcRenderer } = require("electron");

// Expose a typed, sandbox-safe bridge to the React renderer.
contextBridge.exposeInMainWorld("colwork", {
  // ── Window chrome ────────────────────────────────────────
  window: {
    minimize: () => ipcRenderer.invoke("window.minimize"),
    maximize: () => ipcRenderer.invoke("window.maximize"),
    close: () => ipcRenderer.invoke("window.close"),
    isMaximized: () => ipcRenderer.invoke("window.isMaximized"),
  },

  // ── Engine (delegates into src/) ─────────────────────────
  engine: {
    health: () => ipcRenderer.invoke("engine.health"),
    applyJob: (payload) => ipcRenderer.invoke("engine.applyJob", payload),
    optimizeProfile: (payload) => ipcRenderer.invoke("engine.optimizeProfile", payload),
    usage: () => ipcRenderer.invoke("engine.usage"),
    openExternal: (url) => ipcRenderer.invoke("engine.openExternal", url),
    saveDialog: (args) => ipcRenderer.invoke("engine.saveDialog", args),
    // Content Studio
    listPublications: () => ipcRenderer.invoke("engine.listPublications"),
    readPublication: (filename) => ipcRenderer.invoke("engine.readPublication", { filename }),
    generatePost: (payload) => ipcRenderer.invoke("engine.generatePost", payload),
    generateVideoScript: (payload) => ipcRenderer.invoke("engine.generateVideoScript", payload),
    // Setup & .env management
    getSetupStatus: () => ipcRenderer.invoke("engine.getSetupStatus"),
    saveEnv: (content) => ipcRenderer.invoke("engine.saveEnv", { content }),
    // Activity Log (v10.0)
    activityFeed: () => ipcRenderer.invoke("engine.activityFeed"),
  },

  // ── PTY (terminal) ───────────────────────────────────────
  pty: {
    spawn: (id, opts) => ipcRenderer.invoke("pty.spawn", { id, ...(opts || {}) }),
    write: (id, data) => ipcRenderer.send("pty.write", { id, data }),
    resize: (id, cols, rows) => ipcRenderer.send("pty.resize", { id, cols, rows }),
    kill: (id) => ipcRenderer.invoke("pty.kill", { id }),
    onData: (id, handler) => {
      const listener = (_e, data) => handler(data);
      ipcRenderer.on(`pty.data.${id}`, listener);
      return () => ipcRenderer.removeListener(`pty.data.${id}`, listener);
    },
    onExit: (id, handler) => {
      const listener = (_e, code) => handler(code);
      ipcRenderer.on(`pty.exit.${id}`, listener);
      return () => ipcRenderer.removeListener(`pty.exit.${id}`, listener);
    },
  },

  // ── OTA Updater ─────────────────────────────────────────
  updater: {
    check: () => ipcRenderer.invoke("update.check"),
    install: () => ipcRenderer.invoke("update.install"),
    onChecking: (h) => { const l = () => h(); ipcRenderer.on("update.checking", l); return () => ipcRenderer.removeListener("update.checking", l); },
    onAvailable: (h) => { const l = (_e, i) => h(i); ipcRenderer.on("update.available", l); return () => ipcRenderer.removeListener("update.available", l); },
    onNotAvailable: (h) => { const l = () => h(); ipcRenderer.on("update.not-available", l); return () => ipcRenderer.removeListener("update.not-available", l); },
    onProgress: (h) => { const l = (_e, p) => h(p); ipcRenderer.on("update.download-progress", l); return () => ipcRenderer.removeListener("update.download-progress", l); },
    onDownloaded: (h) => { const l = (_e, i) => h(i); ipcRenderer.on("update.downloaded", l); return () => ipcRenderer.removeListener("update.downloaded", l); },
    onError: (h) => { const l = (_e, e) => h(e); ipcRenderer.on("update.error", l); return () => ipcRenderer.removeListener("update.error", l); },
  },

  // Build/runtime info
  meta: {
    platform: process.platform,
    versions: process.versions,
  },
});
