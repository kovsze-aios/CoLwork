"use strict";

const axios = require("axios");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env") });

const { withRetry } = require("./retry");

const N8N_BASE = process.env.N8N_BASE_URL || "http://localhost:5678/api/v1";
const N8N_API_KEY = process.env.N8N_API_KEY || "";
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || N8N_BASE.replace("/api/v1", "");
const N8N_TIMEOUT = parseInt(process.env.N8N_TIMEOUT_MS || "15000", 10);

const apiClient = axios.create({
  baseURL: N8N_BASE,
  headers: {
    "Authorization": `Bearer ${N8N_API_KEY}`,
    "X-N8N-API-KEY": N8N_API_KEY,
    "Content-Type": "application/json",
  },
  timeout: N8N_TIMEOUT,
  validateStatus: (s) => s < 500,
});

const webhookClient = axios.create({
  timeout: N8N_TIMEOUT,
  headers: { "Content-Type": "application/json" },
  validateStatus: (s) => s < 500,
});

function shortErr(e) {
  const status = e.response?.status || e.code || "ERR";
  const body = e.response?.data ? JSON.stringify(e.response.data).slice(0, 160) : (e.message || "").slice(0, 160);
  return `${status}: ${body}`;
}

async function getWorkflows() {
  try {
    const { data, status } = await withRetry(
      () => apiClient.get("/workflows"),
      { retries: 2, baseDelay: 600, label: "n8n.workflows" }
    );
    if (status >= 400) {
      console.warn(`[n8n] workflows status=${status}`);
      return [];
    }
    return data?.data || [];
  } catch (e) {
    console.warn(`[n8n] workflows failed — ${shortErr(e)}`);
    return [];
  }
}

async function triggerWorkflow(workflowId, payload = {}) {
  try {
    const { data, status } = await withRetry(
      () => apiClient.post(`/workflows/${workflowId}/execute`, payload),
      { retries: 2, baseDelay: 700, label: `n8n.exec.${workflowId}` }
    );
    if (status >= 400) {
      console.warn(`[n8n] workflow ${workflowId} status=${status}`);
      return null;
    }
    return data;
  } catch (e) {
    console.warn(`[n8n] trigger ${workflowId} failed — ${shortErr(e)}`);
    return null;
  }
}

async function triggerWebhook(webhookPath, payload = {}) {
  if (!N8N_WEBHOOK_URL) return null;
  const url = `${N8N_WEBHOOK_URL.replace(/\/$/, "")}/webhook/${webhookPath.replace(/^\//, "")}`;
  try {
    const { data, status } = await withRetry(
      () => webhookClient.post(url, payload),
      { retries: 2, baseDelay: 600, label: `n8n.webhook.${webhookPath}` }
    );
    if (status === 404) {
      // Webhook not configured — silent (not an error condition we should retry)
      return null;
    }
    if (status >= 400) {
      console.warn(`[n8n] webhook ${webhookPath} status=${status}`);
      return null;
    }
    return data ?? { ok: true };
  } catch (e) {
    console.warn(`[n8n] webhook ${webhookPath} failed — ${shortErr(e)}`);
    return null;
  }
}

async function sendLeadToOrchestrator(lead) {
  if (!lead?.score || lead.score < 80) return false;
  const result = await triggerWebhook("colwork/high-value-lead", {
    name: lead.name,
    title: lead.title,
    company: lead.company || "Unknown",
    score: lead.score,
    reasoning: lead.reasoning,
    linkedinUrl: lead.linkedinUrl || "",
    timestamp: new Date().toISOString(),
  });
  if (result === null) {
    const { logAction } = require("./memory");
    logAction("n8n_queued_lead", lead);
    return { queued: true, lead };
  }
  return result;
}

// ── New workflow endpoints (deployed Apr 2026) ──────────────────────────────

/**
 * Generate a tailored CV + cover letter + recruiter email for a job application.
 * @param {object} job - { jobTitle, company, jobDescription, companyUrl?, resumeMd?, recruiterEmail?, candidateName?, candidateRole? }
 * @returns {Promise<object|null>} - { ok, cv, coverLetter, emailDraft, matchScore, keyAlignment, ... } or null on failure
 */
async function applyToJob(job) {
  if (!job?.jobTitle || !job?.company) {
    console.warn("[n8n.apply] missing jobTitle/company");
    return null;
  }
  const result = await triggerWebhook("colwork/job-application", {
    jobTitle: job.jobTitle,
    company: job.company,
    jobDescription: job.jobDescription || "",
    companyUrl: job.companyUrl || "",
    resumeMd: job.resumeMd || "",
    recruiterEmail: job.recruiterEmail || "",
    candidateName: job.candidateName || process.env.OPERATOR_NAME || "",
    candidateRole: job.candidateRole || process.env.OPERATOR_ROLE || "AI Automation Engineer",
  });
  if (!result) {
    const { logAction } = require("./memory");
    logAction("job_apply_queued", job);
    return { queued: true, job };
  }
  return result;
}

/**
 * Optimize a LinkedIn profile (headline, About, skills) for a goal.
 * @param {object} profile - { currentHeadline, currentAbout?, currentSkills?, goal, language?, candidateName? }
 * @returns {Promise<object|null>} - { ok, newHeadline, newAbout, recommendedSkills, contentAngles, audit, ... } or null
 */
async function optimizeProfile(profile) {
  if (!profile?.goal) {
    console.warn("[n8n.optimize] missing goal");
    return null;
  }
  const result = await triggerWebhook("colwork/profile-optimize", {
    currentHeadline: profile.currentHeadline || "",
    currentAbout: profile.currentAbout || "",
    currentSkills: Array.isArray(profile.currentSkills) ? profile.currentSkills : [],
    goal: profile.goal,
    language: profile.language || "pl",
    candidateName: profile.candidateName || process.env.OPERATOR_NAME || "",
  });
  if (!result) {
    const { logAction } = require("./memory");
    logAction("profile_optimize_queued", profile);
    return { queued: true, profile };
  }
  return result;
}

async function flushLeadQueue() {
  const { loadMemory, saveMemory } = require("./memory");
  const memory = loadMemory();
  const queued = memory.actions.filter((a) => a.type === "n8n_queued_lead" && a.payload);
  if (!queued.length) return 0;
  let sent = 0;
  for (const entry of queued) {
    const result = await triggerWebhook("colwork/high-value-lead", { ...entry.payload, retry: true, originalTimestamp: entry.timestamp });
    if (result) {
      entry.type = "n8n_queued_lead_sent";
      sent++;
    }
  }
  saveMemory(memory);
  console.log(`[n8n] flushed ${sent}/${queued.length} queued leads`);
  return sent;
}

async function healthCheck() {
  try {
    const { data, status } = await apiClient.get("/workflows?limit=1");
    if (status >= 400) {
      return { ok: false, status, baseUrl: N8N_BASE, offlineMode: true };
    }
    return { ok: true, status, workflows: (data?.data || []).length, baseUrl: N8N_BASE };
  } catch (e) {
    const { loadMemory } = require("./memory");
    const queued = loadMemory().actions.filter((a) => a.type === "n8n_queued_lead").length;
    return { ok: false, error: shortErr(e), baseUrl: N8N_BASE, offlineMode: true, queuedLeads: queued };
  }
}

module.exports = {
  getWorkflows,
  triggerWorkflow,
  triggerWebhook,
  sendLeadToOrchestrator,
  applyToJob,
  optimizeProfile,
  flushLeadQueue,
  healthCheck,
};
