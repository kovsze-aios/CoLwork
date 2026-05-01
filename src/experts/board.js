"use strict";

// Board — MoE Orchestrator
// Routes job applications and profile optimizations through the full expert panel:
//   Sherlock (OSINT) → Seed (Icebreaker) → Feynman (Logic check) → n8n

const { investigate } = require("./sherlock");
const { generate } = require("./seed");
const { simplify, evaluateCV } = require("./feynman");
const { applyToJob, optimizeProfile } = require("../utils/n8n_bridge");
const { logAction } = require("../utils/memory");

/**
 * Full pipeline: analyze a job posting + company, generate tailored application.
 *
 * Flow:
 *   1. Sherlock investigates the company (culture, tech stack, pain points)
 *   2. Seed generates hyper-personalized icebreaker/cover letter hook
 *   3. Feynman simplifies the cover letter and evaluates CV alignment
 *   4. n8n generates final CV + cover letter + recruiter email
 *
 * @param {object} opts
 * @param {import("playwright").Page} [opts.page] - Browser page for Sherlock
 * @param {string} opts.jobTitle
 * @param {string} opts.company
 * @param {string} [opts.jobDescription]
 * @param {string} [opts.companyUrl]
 * @param {string} [opts.companyLinkedinUrl]
 * @param {string} [opts.resumeMd]
 * @param {string} [opts.recruiterEmail]
 * @returns {Promise<object>}
 */
async function runApplyPipeline(opts) {
  const pipeline = { steps: [], startTime: Date.now() };

  // ── Step 1: Sherlock ────────────────────────────────────────────────────
  console.log("[board] 🔍 Sherlock: Investigating company...");
  let intel = {};
  if (opts.page) {
    intel = await investigate(opts.page, {
      company: opts.company,
      companyUrl: opts.companyUrl,
      linkedinUrl: opts.companyLinkedinUrl,
    });
  } else {
    intel = {
      culture: "Nieznana (brak sesji przeglądarki)",
      techStack: [],
      recentNews: [],
      painPoints: [],
      strategy: "Standardowe podejście — podkreśl AI i automatyzację.",
    };
  }
  pipeline.steps.push({ expert: "sherlock", intel });
  logAction("board_sherlock", { company: opts.company, found: intel.techStack?.length || 0 });

  // ── Step 2: Seed ────────────────────────────────────────────────────────
  console.log("[board] 🌱 Seed: Crafting personalized icebreaker...");
  const icebreaker = await generate({
    name: "Hiring Manager",
    title: `Recruiter @ ${opts.company}`,
    company: opts.company,
    intel,
    context: opts.jobDescription?.slice(0, 500),
  });
  pipeline.steps.push({ expert: "seed", icebreaker });
  logAction("board_seed", { company: opts.company, hookLen: icebreaker.hook?.length || 0 });

  // ── Step 3: Feynman ─────────────────────────────────────────────────────
  console.log("[board] 📐 Feynman: Simplifying & evaluating alignment...");
  const simplifiedHook = await simplify(icebreaker.icebreaker, "message");
  const cvEval = await evaluateCV({
    headline: opts.jobTitle,
    about: opts.jobDescription?.slice(0, 1000) || "",
    skills: intel.techStack || [],
  });
  pipeline.steps.push({ expert: "feynman", simplifiedHook, cvEval });
  logAction("board_feynman", { score: cvEval.score, oneliner: cvEval.oneLiner });

  // ── Step 4: n8n ─────────────────────────────────────────────────────────
  console.log("[board] ⚡ n8n: Generating final application package...");
  const result = await applyToJob({
    jobTitle: opts.jobTitle,
    company: opts.company,
    jobDescription: opts.jobDescription || "",
    companyUrl: opts.companyUrl || "",
    resumeMd: [opts.resumeMd || "", `# Feynman Analysis\nScore: ${cvEval.score}/100\n${cvEval.oneLiner}\n\n## Sherlock Intel\nCulture: ${intel.culture}\nPain points: ${(intel.painPoints || []).join(", ")}\n\n## Seed Hook\n${simplifiedHook}`].filter(Boolean).join("\n\n"),
    recruiterEmail: opts.recruiterEmail || "",
    candidateName: opts.candidateName || process.env.OPERATOR_NAME || "",
    candidateRole: opts.candidateRole || process.env.OPERATOR_ROLE || "AI Automation Engineer",
  });

  pipeline.steps.push({ expert: "n8n", result });
  pipeline.durationMs = Date.now() - pipeline.startTime;
  logAction("board_pipeline_complete", { company: opts.company, durationMs: pipeline.durationMs });

  return pipeline;
}

/**
 * Full pipeline: optimize LinkedIn profile through expert panel.
 *
 * Flow:
 *   1. Feynman evaluates current profile
 *   2. Seed suggests positioning angle
 *   3. n8n generates optimized content
 *
 * @param {object} opts
 * @param {string} opts.goal - Optimization goal
 * @param {string} [opts.currentHeadline]
 * @param {string} [opts.currentAbout]
 * @param {string[]} [opts.currentSkills]
 * @param {string} [opts.language] - "pl" | "en"
 */
async function runOptimizePipeline(opts) {
  const pipeline = { steps: [], startTime: Date.now() };

  // ── Step 1: Feynman evaluates current state ──────────────────────────────
  console.log("[board] 📐 Feynman: Evaluating current profile...");
  const cvEval = await evaluateCV({
    headline: opts.currentHeadline || "",
    about: opts.currentAbout || "",
    skills: opts.currentSkills || [],
  });
  pipeline.steps.push({ expert: "feynman", cvEval });
  logAction("board_feynman_optimize", { score: cvEval.score });

  // ── Step 2: Seed suggests positioning ────────────────────────────────────
  console.log("[board] 🌱 Seed: Finding positioning angle...");
  const angle = await generate({
    name: opts.candidateName || process.env.OPERATOR_NAME || "Operator",
    title: opts.currentHeadline || "AI Automation Engineer",
    company: "CoLwork",
    intel: {
      painPoints: cvEval.gaps || [],
      culture: "AI-first, automation-native",
      techStack: opts.currentSkills || [],
      strategy: cvEval.oneLiner || "Pozycjonuj się jako ekspert AI + RevOps",
    },
    context: `Goal: ${opts.goal}`,
  });
  pipeline.steps.push({ expert: "seed", angle });
  logAction("board_seed_optimize", { goal: opts.goal, hookLen: angle.hook?.length || 0 });

  // ── Step 3: n8n generates final optimized content ────────────────────────
  console.log("[board] ⚡ n8n: Generating optimized profile...");
  const result = await optimizeProfile({
    currentHeadline: opts.currentHeadline || "",
    currentAbout: opts.currentAbout || "",
    currentSkills: opts.currentSkills || [],
    goal: `${opts.goal}\n\nFeynman Score: ${cvEval.score}/100\nGaps: ${(cvEval.gaps || []).join(", ")}\nSeed Angle: ${angle.icebreaker}`,
    language: opts.language || "pl",
    candidateName: opts.candidateName || process.env.OPERATOR_NAME || "",
  });

  pipeline.steps.push({ expert: "n8n", result });
  pipeline.durationMs = Date.now() - pipeline.startTime;
  logAction("board_optimize_complete", { goal: opts.goal, durationMs: pipeline.durationMs });

  return pipeline;
}

module.exports = { runApplyPipeline, runOptimizePipeline };
