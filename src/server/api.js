"use strict";

const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");

const app = express();
app.use(cors());
app.use(express.json({ limit: "5mb" }));

const DATA = path.resolve(__dirname, "..", "..", "data");

// ── Health + status ──────────────────────────────────────────────────────────

app.get("/api/health", async (req, res) => {
  const { healthCheck } = require("../utils/n8n_bridge");
  const { loadMemory } = require("../utils/memory");
  const memory = loadMemory();

  const n8n = await healthCheck();
  const recentActions = memory.actions?.slice(-20) || [];

  res.json({
    ok: true,
    version: "5.0.0",
    n8n: {
      connected: n8n.ok,
      status: n8n.status || "offline",
      workflows: n8n.workflows || 0,
    },
    board: {
      experts: ["Feynman", "Sherlock", "Seed", "Paul", "Oscar", "Aristotle"],
      active: 6,
    },
    memory: {
      totalActions: memory.actions?.length || 0,
      sessions: memory.sessions?.length || 0,
    },
    recentActivity: recentActions.map((a) => ({
      type: a.type,
      timestamp: a.timestamp,
      summary: JSON.stringify(a.payload || {}).slice(0, 120),
    })),
  });
});

// ── Live activity feed (server-sent events) ──────────────────────────────────

app.get("/api/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const { loadMemory } = require("../utils/memory");
  let lastCount = loadMemory().actions?.length || 0;

  const interval = setInterval(() => {
    const memory = loadMemory();
    const currentCount = memory.actions?.length || 0;
    if (currentCount > lastCount) {
      const newActions = (memory.actions || []).slice(lastCount);
      lastCount = currentCount;
      for (const action of newActions) {
        res.write(`data: ${JSON.stringify({ type: action.type, timestamp: action.timestamp, payload: action.payload })}\n\n`);
      }
    }
  }, 2000);

  req.on("close", () => clearInterval(interval));
});

// ── Research / RAG ───────────────────────────────────────────────────────────

app.post("/api/research", async (req, res) => {
  const { topic, format, audience, sourceFiles } = req.body;
  if (!topic) return res.status(400).json({ error: "topic required" });

  const { ingestSources, generatePaper, executiveSummary } = require("../experts/aristotle");

  let sources = [];
  if (sourceFiles && sourceFiles.length) {
    // Source files come as { filename, content } from UI upload
    const tmpDir = path.join(DATA, "tmp_uploads", `${Date.now()}`);
    fs.mkdirSync(tmpDir, { recursive: true });
    for (const f of sourceFiles) {
      const fp = path.join(tmpDir, f.filename);
      fs.writeFileSync(fp, f.content);
    }
    sources = await ingestSources(tmpDir);
    // Cleanup
    fs.rmSync(tmpDir, { recursive: true, force: true }).catch(() => {});
  }

  const paper = await generatePaper({ topic, format: format || "whitepaper", audience, sources });
  const summary = await executiveSummary(paper.fullText);

  res.json({ ok: true, ...paper, executiveSummary: summary });
});

// ── Job Application ──────────────────────────────────────────────────────────

app.post("/api/apply", async (req, res) => {
  const { jobTitle, company, jobDescription, companyUrl, resumeMd, runBoard } = req.body;
  if (!jobTitle || !company) return res.status(400).json({ error: "jobTitle and company required" });

  // Stream board steps
  if (runBoard) {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");

    const send = (step) => res.write(`data: ${JSON.stringify(step)}\n\n`);

    try {
      send({ step: "sherlock", status: "running", message: "Investigating company..." });
      const { investigate } = require("../experts/sherlock");
      // No browser in API mode — use AI-only
      const intel = await investigate(null, { company, companyUrl });

      send({ step: "sherlock", status: "done", intel });

      send({ step: "seed", status: "running", message: "Crafting icebreaker..." });
      const { generate } = require("../experts/seed");
      const icebreaker = await generate({
        name: "Hiring Manager",
        title: `Recruiter @ ${company}`,
        company,
        intel,
      });

      send({ step: "seed", status: "done", icebreaker });

      send({ step: "feynman", status: "running", message: "Evaluating CV alignment..." });
      const { evaluateCV } = require("../experts/feynman");
      const cvEval = await evaluateCV({ headline: jobTitle, about: jobDescription || "", skills: [] });

      send({ step: "feynman", status: "done", cvEval });

      send({ step: "n8n", status: "running", message: "Generating application package..." });
      const { applyToJob } = require("../utils/n8n_bridge");
      const result = await applyToJob({ jobTitle, company, jobDescription, companyUrl, resumeMd });
      send({ step: "n8n", status: "done", result });

      send({ step: "complete", status: "done" });
    } catch (e) {
      send({ step: "error", message: e.message });
    }
    res.end();
    return;
  }

  const { applyToJob } = require("../utils/n8n_bridge");
  const result = await applyToJob({ jobTitle, company, jobDescription, companyUrl, resumeMd });
  res.json({ ok: true, ...result });
});

// ── Content ──────────────────────────────────────────────────────────────────

app.get("/api/content", (req, res) => {
  const { loadMemory } = require("../utils/memory");
  const memory = loadMemory();
  const contentActions = (memory.actions || []).filter((a) =>
    ["post_draft", "research_published", "devlog_published", "video_script_generated", "board_apply_complete", "board_optimize_complete"].includes(a.type)
  ).slice(-30);

  res.json({ ok: true, content: contentActions.reverse() });
});

app.post("/api/content/post", async (req, res) => {
  const { topic, tone } = req.body;
  const { generatePost } = require("../ai");
  const post = await generatePost({ topic, tone: tone || "thought-leadership" });
  res.json({ ok: true, post });
});

app.post("/api/content/video-script", async (req, res) => {
  const { topic, lengthSec } = req.body;
  const { chat } = require("../ai");
  const seconds = Math.max(15, Math.min(180, Number(lengthSec) || 60));
  try {
    const script = await chat({
      system: "Jesteś scenarzystą krótkich form wideo (LinkedIn / Reels) dla osób budujących markę osobistą.",
      user: [
        `Temat: ${topic}`,
        `Długość docelowa: ${seconds}s wideo (≈${Math.round(seconds * 2.5)} słów).`,
        "Format: HOOK (3 sek) → punkty kluczowe (numerowane) → CTA.",
        "Konkretne liczby. Krótkie zdania. Polski. Bez emoji. Tylko skrypt.",
      ].join("\n"),
      label: "video-script",
      maxTokens: 700,
      temperature: 0.7,
    });
    res.json({ ok: true, script, seconds });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ── Publications ─────────────────────────────────────────────────────────────

app.get("/api/publications", (req, res) => {
  const pubDir = path.join(DATA, "publications");
  if (!fs.existsSync(pubDir)) return res.json({ files: [] });
  const files = fs.readdirSync(pubDir)
    .filter((f) => f.endsWith(".pdf") || f.endsWith(".md"))
    .map((f) => ({
      name: f,
      path: `/api/publications/${f}`,
      size: fs.statSync(path.join(pubDir, f)).size,
      created: fs.statSync(path.join(pubDir, f)).birthtime,
    }))
    .sort((a, b) => new Date(b.created) - new Date(a.created));
  res.json({ files });
});

app.get("/api/publications/:filename", (req, res) => {
  const fp = path.join(DATA, "publications", req.params.filename);
  if (!fs.existsSync(fp)) return res.status(404).json({ error: "not found" });
  res.sendFile(fp);
});

// ── Optimization ─────────────────────────────────────────────────────────────

app.post("/api/optimize", async (req, res) => {
  const { goal, currentHeadline, currentAbout, skills } = req.body;
  if (!goal) return res.status(400).json({ error: "goal required" });

  const { optimizeProfile } = require("../utils/n8n_bridge");
  const result = await optimizeProfile({
    goal,
    currentHeadline: currentHeadline || "",
    currentAbout: currentAbout || "",
    currentSkills: skills || [],
    language: "pl",
  });
  res.json({ ok: true, ...result });
});

// ── Start ────────────────────────────────────────────────────────────────────

function start(port = 3001) {
  return new Promise((resolve) => {
    app.listen(port, () => {
      console.log(`[api] CoLwork API server running on http://localhost:${port}`);
      resolve(port);
    });
  });
}

module.exports = { start, app };
