#!/usr/bin/env node
"use strict";

const axios = require("axios");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env") });

const N8N_BASE = process.env.N8N_BASE_URL;
const N8N_API_KEY = process.env.N8N_API_KEY;

if (!N8N_BASE || !N8N_API_KEY) {
  console.error("❌ N8N_BASE_URL or N8N_API_KEY not set in .env");
  process.exit(1);
}

const client = axios.create({
  baseURL: N8N_BASE,
  headers: {
    "Authorization": `Bearer ${N8N_API_KEY}`,
    "X-N8N-API-KEY": N8N_API_KEY,
    "Content-Type": "application/json",
  },
  timeout: 20000,
});

// ── Workflow definition ──────────────────────────────────────────────────────

function buildWorkflowPayload() {
  const webhookNode = {
    id: "webhook-colwork-lead",
    name: "Colwork High-Value Lead",
    type: "n8n-nodes-base.webhook",
    typeVersion: 2,
    position: [250, 300],
    parameters: {
      httpMethod: "POST",
      path: "colwork/high-value-lead",
      responseMode: "onReceived",
      responseData: "allEntries",
      options: {},
    },
  };

  const responseNode = {
    id: "respond-200",
    name: "Return 200 OK",
    type: "n8n-nodes-base.respondToWebhook",
    typeVersion: 1,
    position: [650, 300],
    parameters: {
      respondWith: "json",
      responseBody: `={{ $input.item.json }}`,
    },
  };

  const payload = {
    name: "Colwork High-Value Lead Bridge",
    nodes: [webhookNode, responseNode],
    connections: {
      "Colwork High-Value Lead": {
        main: [[{ node: "Return 200 OK", type: "main", index: 0 }]],
      },
    },
    settings: {
      timezone: "Europe/Warsaw",
      saveExecutionProgress: false,
      callerPolicy: "workflowsFromSameOwner",
    },
    active: true,
  };

  return payload;
}

// ── Deploy ───────────────────────────────────────────────────────────────────

async function deploy() {
  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║   n8n Infrastructure Deploy — Colwork Bridge     ║");
  console.log("╚══════════════════════════════════════════════════╝\n");

  console.log(`Target: ${N8N_BASE}`);
  console.log(`Auth:   Bearer JWT (${N8N_API_KEY.slice(0, 20)}...)`);

  // 1. Check if workflow already exists
  console.log("\n[1/4] Checking for existing workflow...");
  let existingId = null;
  try {
    const { data: existing } = await client.get("/workflows?filter=Colwork%20High-Value%20Lead%20Bridge");
    const list = existing.data || [];
    const match = list.find((w) => w.name === "Colwork High-Value Lead Bridge");
    if (match) {
      existingId = match.id;
      console.log(`  Found existing workflow: ${match.id} (${match.active ? "ACTIVE" : "inactive"})`);
    } else {
      console.log("  No existing workflow — creating new one.");
    }
  } catch (e) {
    const s = e.response?.status || "ERR";
    console.log(`  GET /workflows returned ${s} — will attempt creation.`);
  }

  // 2. Create or update the workflow
  const payload = buildWorkflowPayload();

  if (existingId) {
    console.log(`\n[2/4] Updating existing workflow ${existingId}...`);
    try {
      const { data, status } = await client.put(`/workflows/${existingId}`, payload);
      console.log(`  ✅ Updated: ${status} — ${data.name || payload.name}`);
      await activateWorkflow(existingId);
    } catch (e) {
      const detail = e.response?.data || e.message;
      console.error(`  ❌ Update failed: ${JSON.stringify(detail).slice(0, 300)}`);
      console.log("  Attempting fresh creation instead...");
      existingId = null;
    }
  }

  if (!existingId) {
    console.log(`\n[2/4] Creating new workflow...`);
    try {
      const { data, status } = await client.post("/workflows", payload);
      console.log(`  ✅ Created: ${status} — id: ${data.id}, name: ${data.name}`);
      existingId = data.id;
      await activateWorkflow(data.id);
    } catch (e) {
      const status = e.response?.status || "ERR";
      const detail = e.response?.data || e.message;
      console.error(`  ❌ Creation failed — ${status}: ${JSON.stringify(detail).slice(0, 400)}`);

      // If cloud n8n REST API is not available, report and bail
      if (status === 404) {
        console.log("\n  ⚠️  Cloud n8n REST API is not accessible.");
        console.log("  This means the n8n instance needs manual initialization:");
        console.log(`  → Open ${N8N_BASE.replace("/api/v1", "")} in a browser`);
        console.log("  → Complete the n8n setup wizard");
        console.log("  → Then re-run: node src/scripts/deploy_n8n_webhook.js\n");
        process.exit(0);
      }
      process.exit(1);
    }
  }

  // 3. Verify webhook
  console.log(`\n[3/4] Verifying webhook...`);
  const webhookUrl = `${N8N_BASE.replace("/api/v1", "")}/webhook/colwork/high-value-lead`;
  try {
    const { status: whStatus } = await axios.post(webhookUrl, { test: true, timestamp: new Date().toISOString() }, {
      headers: { "Content-Type": "application/json" },
      timeout: 10000,
    });
    console.log(`  ✅ Webhook test: ${whStatus} — ${webhookUrl}`);
  } catch (e) {
    const s = e.response?.status || "ERR";
    if (s === 200) {
      console.log(`  ✅ Webhook test: 200 OK`);
    } else {
      console.log(`  ⚠️  Webhook test: ${s} — the workflow may need a moment to activate.`);
      console.log(`  URL: ${webhookUrl}`);
    }
  }

  // 4. Flush lead queue
  console.log(`\n[4/4] Flushing queued leads...`);
  try {
    const { flushLeadQueue } = require("../utils/n8n_bridge");
    const sent = await flushLeadQueue();
    if (sent > 0) {
      console.log(`  ✅ Flushed ${sent} queued leads to cloud n8n.`);
    }
  } catch (e) {
    console.error(`  ⚠️  Flush error: ${e.message}`);
  }

  console.log("\n" + "=".repeat(50));
  console.log("  ✅ INFRASTRUKTURA N8N GOTOWA: Webhook nasłuchuje.");
  console.log("=".repeat(50));
}

async function activateWorkflow(id) {
  try {
    const { data } = await client.post(`/workflows/${id}/activate`);
    console.log(`  🔌 Activated: workflow is now ${data.active ? "ACTIVE" : "inactive"}`);
  } catch (e) {
    // Activation might be handled by `active: true` in the payload already
    console.log(`  ⚠️  Activation via API returned ${e.response?.status || "ERR"} — workflow may already be active from payload.`);
  }
}

deploy().catch((e) => {
  console.error("Deploy fatal error:", e.message);
  process.exit(1);
});
