"use strict";

const path = require("path");
const fs = require("fs");

const MEMORY_PATH = path.resolve(__dirname, "..", "..", "data", "memory.json");

function ensureDir() {
  const dir = path.dirname(MEMORY_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadMemory() {
  ensureDir();
  try {
    if (fs.existsSync(MEMORY_PATH)) {
      const raw = fs.readFileSync(MEMORY_PATH, "utf-8");
      return JSON.parse(raw);
    }
  } catch {
    // Corrupted — start fresh
  }
  return { sessions: [], actions: [], lastUpdated: null };
}

function saveMemory(data) {
  ensureDir();
  data.lastUpdated = new Date().toISOString();
  fs.writeFileSync(MEMORY_PATH, JSON.stringify(data, null, 2));
}

/**
 * Log an action to the memory bank.
 * @param {"audit"|"post"|"network"|"job"|"login"|"report"|"error"} type
 * @param {object} payload
 */
function logAction(type, payload = {}) {
  const memory = loadMemory();
  const entry = {
    id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    timestamp: new Date().toISOString(),
    type,
    payload,
  };
  memory.actions.push(entry);

  // Keep only last 200 actions
  if (memory.actions.length > 200) {
    memory.actions = memory.actions.slice(-200);
  }

  saveMemory(memory);
  return entry;
}

/**
 * Start a new session record.
 */
function startSession(name) {
  const memory = loadMemory();
  const session = {
    id: `sess_${Date.now()}`,
    name,
    startedAt: new Date().toISOString(),
    events: [],
    completed: false,
  };
  memory.sessions.push(session);
  saveMemory(memory);
  return session;
}

/**
 * Mark the most recent session as completed.
 */
function completeSession(result) {
  const memory = loadMemory();
  if (memory.sessions.length > 0) {
    const s = memory.sessions[memory.sessions.length - 1];
    s.completed = true;
    s.completedAt = new Date().toISOString();
    s.result = result;
    saveMemory(memory);
    return s;
  }
  return null;
}

/**
 * Get a summary of recent activity for reporting.
 */
function getRecentActivity(hours = 24) {
  const memory = loadMemory();
  const since = Date.now() - hours * 3600 * 1000;
  return {
    totalActions: memory.actions.length,
    recentActions: memory.actions.filter((a) => new Date(a.timestamp).getTime() > since),
    sessions: memory.sessions.slice(-10),
    lastUpdated: memory.lastUpdated,
  };
}

module.exports = { logAction, startSession, completeSession, getRecentActivity, loadMemory, saveMemory };
