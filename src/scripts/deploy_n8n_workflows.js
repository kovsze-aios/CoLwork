#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const axios = require("axios");
require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env") });

const N8N_BASE = (process.env.N8N_BASE_URL || "").replace(/\/$/, "");
const N8N_WEBHOOK_BASE = (process.env.N8N_WEBHOOK_URL || N8N_BASE.replace(/\/api\/v1$/, "")).replace(/\/$/, "");
const N8N_API_KEY = process.env.N8N_API_KEY;

if (!N8N_BASE || !N8N_API_KEY) {
  console.error("ERROR: N8N_BASE_URL or N8N_API_KEY missing in .env");
  process.exit(1);
}

const WORKFLOW_DIR = path.join(__dirname, "..", "..", "data", "n8n_workflows");
const ALLOWED_KEYS = ["name", "nodes", "connections", "settings", "staticData"];

const client = axios.create({
  baseURL: N8N_BASE,
  headers: {
    "X-N8N-API-KEY": N8N_API_KEY,
    "Accept": "application/json",
    "Content-Type": "application/json",
  },
  timeout: 30000,
  validateStatus: (s) => s < 500,
});

const C = {
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};

function log(...args) { console.log("  " + args.join(" ")); }
function header(title) {
  console.log("");
  console.log(C.cyan("▎") + " " + C.bold(title));
  console.log(C.dim("─".repeat(60)));
}

function sanitizeWorkflow(raw) {
  const out = {};
  for (const k of ALLOWED_KEYS) {
    if (raw[k] !== undefined) out[k] = raw[k];
  }
  if (!out.settings) out.settings = { timezone: "Europe/Warsaw", saveDataSuccessExecution: "all" };
  if (!Array.isArray(out.nodes)) throw new Error("workflow.nodes must be an array");
  if (typeof out.connections !== "object") throw new Error("workflow.connections must be an object");
  return out;
}

function listWorkflowFiles() {
  if (!fs.existsSync(WORKFLOW_DIR)) {
    console.error(`ERROR: ${WORKFLOW_DIR} not found`);
    process.exit(1);
  }
  return fs.readdirSync(WORKFLOW_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => path.join(WORKFLOW_DIR, f));
}

async function findExistingByName(name) {
  const { data } = await client.get(`/workflows?limit=250`);
  const list = data?.data || [];
  return list.find((w) => w.name === name) || null;
}

async function createOrUpdate(payload) {
  const existing = await findExistingByName(payload.name);
  if (existing) {
    log(C.dim("→"), "updating existing", C.yellow(existing.id));
    const { data, status } = await client.put(`/workflows/${existing.id}`, payload);
    if (status >= 400) {
      throw new Error(`PUT failed ${status}: ${JSON.stringify(data).slice(0, 300)}`);
    }
    return { id: existing.id, action: "updated", workflow: data };
  }
  log(C.dim("→"), "creating new workflow");
  const { data, status } = await client.post(`/workflows`, payload);
  if (status >= 400) {
    throw new Error(`POST failed ${status}: ${JSON.stringify(data).slice(0, 300)}`);
  }
  return { id: data.id, action: "created", workflow: data };
}

async function activate(id) {
  const { status, data } = await client.post(`/workflows/${id}/activate`);
  if (status >= 400) {
    return { ok: false, status, detail: JSON.stringify(data).slice(0, 200) };
  }
  return { ok: true, active: data.active };
}

function extractWebhookPath(workflow) {
  for (const n of workflow.nodes || []) {
    if (n.type === "n8n-nodes-base.webhook") {
      const p = n.parameters?.path;
      if (p) return p;
    }
  }
  return null;
}

async function deployFile(file) {
  const name = path.basename(file);
  header(`Deploy: ${name}`);

  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    log(C.red("✗"), "JSON parse error:", e.message);
    return { file, ok: false, error: "json-parse" };
  }

  let payload;
  try {
    payload = sanitizeWorkflow(raw);
  } catch (e) {
    log(C.red("✗"), "sanitize error:", e.message);
    return { file, ok: false, error: e.message };
  }

  log(C.cyan("◇"), "name:", C.bold(payload.name));
  log(C.cyan("◇"), "nodes:", payload.nodes.length);
  const webhookPath = extractWebhookPath(payload);
  if (webhookPath) log(C.cyan("◇"), "webhook path:", C.yellow(`/${webhookPath}`));

  let result;
  try {
    result = await createOrUpdate(payload);
  } catch (e) {
    log(C.red("✗"), "deploy error:", e.message);
    return { file, ok: false, error: e.message };
  }

  log(C.green("✓"), result.action, "id:", C.yellow(result.id));

  const act = await activate(result.id);
  if (act.ok) log(C.green("✓"), "activated:", act.active ? "ACTIVE" : "inactive");
  else log(C.yellow("⚠"), `activate ${act.status}: ${act.detail}`);

  const webhookUrl = webhookPath ? `${N8N_WEBHOOK_BASE}/webhook/${webhookPath}` : null;
  if (webhookUrl) log(C.cyan("→"), "webhook URL:", C.bold(webhookUrl));

  return { file, ok: true, id: result.id, name: payload.name, webhookUrl };
}

async function main() {
  console.log("");
  console.log(C.bold(C.cyan("╔════════════════════════════════════════════════════╗")));
  console.log(C.bold(C.cyan("║  Colwork → n8n Cloud — Universal Workflow Deploy   ║")));
  console.log(C.bold(C.cyan("╚════════════════════════════════════════════════════╝")));
  console.log("");
  log(C.dim("api  :"), N8N_BASE);
  log(C.dim("hook :"), N8N_WEBHOOK_BASE);
  log(C.dim("auth :"), `JWT (${N8N_API_KEY.slice(0, 16)}…)`);

  const files = listWorkflowFiles();
  if (!files.length) {
    console.error(C.red("No workflow JSON files found in"), WORKFLOW_DIR);
    process.exit(1);
  }

  const onlyArg = process.argv[2];
  const targets = onlyArg
    ? files.filter((f) => path.basename(f).includes(onlyArg))
    : files;

  if (!targets.length) {
    console.error(C.red(`No matches for "${onlyArg}"`));
    process.exit(1);
  }

  log(C.dim("queue:"), targets.map((f) => path.basename(f)).join(", "));

  const results = [];
  for (const file of targets) {
    results.push(await deployFile(file));
  }

  header("Summary");
  for (const r of results) {
    const icon = r.ok ? C.green("✓") : C.red("✗");
    const file = path.basename(r.file).padEnd(36);
    if (r.ok) log(icon, file, C.dim(r.id), r.webhookUrl ? C.cyan("→ " + r.webhookUrl) : "");
    else log(icon, file, C.red(r.error || "?"));
  }
  console.log("");
  const ok = results.filter((r) => r.ok).length;
  log(C.bold(`${ok}/${results.length}`), "workflows deployed");

  if (ok < results.length) process.exit(1);
}

main().catch((e) => {
  console.error(C.red("FATAL:"), e.message);
  process.exit(1);
});
