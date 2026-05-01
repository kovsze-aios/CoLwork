#!/usr/bin/env node
"use strict";

require("dotenv").config();

const chalk = require("chalk");
const inquirer = require("inquirer");
const { browserManager } = require("./src/browser");
const { updateAboutSection } = require("./src/modules/profile");
const { createAndPublishPost, TOPICS } = require("./src/modules/content");
const { searchAndApply } = require("./src/modules/jobs");
const { aggregateAndGenerate, generateTrendingPost } = require("./src/modules/aggregator");
const { smartNetwork } = require("./src/modules/network");
const {
  showWelcomeBanner, showSection, showSuccess, showWarn, showInfo, showError, showDivider,
  fmtScore, summary, spinner, withSpinner, BLUE, CYAN, DIM, GREEN, YELLOW, RED,
} = require("./src/utils/ui");
const { healthCheck, sendLeadToOrchestrator, flushLeadQueue, applyToJob, optimizeProfile } = require("./src/utils/n8n_bridge");
const fs = require("fs");
const path = require("path");
const { logToSheet, syncMemoryToSheets, flushQueue: flushSheets } = require("./src/utils/sheets");
const { getStaleLeads, generateFollowupMessage } = require("./src/modules/followup");
const { scrapeComments, analyzeComments } = require("./src/modules/sentiment");
const { fullVisualAudit } = require("./src/modules/visual_auditor");
const { generatePDF, sendEmail } = require("./src/modules/reporting");
const { logAction, getRecentActivity } = require("./src/utils/memory");
const { getUsage, scoreSentiment, generateIcebreaker } = require("./src/ai");
const { safe } = require("./src/utils/retry");

const COMMAND = process.argv[2]?.toLowerCase();
const ARGS = process.argv.slice(3);
const arg = (k) => ARGS.find((a) => a.startsWith(`--${k}=`))?.split("=")[1];
const flag = (k) => ARGS.includes(`--${k}`);
const argAll = (k) => ARGS.filter((a) => a.startsWith(`--${k}=`)).map((a) => a.split("=")[1]);

function printHelp() {
  console.log(`
${CYAN("USAGE")}: colwork <command> [options]

${CYAN("──── Level 1 ────────────────────────────────────────")}
  login            Authenticate to LinkedIn and persist cookies
  about            AI-rewrite the "About" section (--name, --role, --dry)
  post             Generate & publish a LinkedIn post (--topic, --tone, --dry)
  jobs             Search jobs (--query, --apply, --limit)
  topics           Show curated post topics

${CYAN("──── Level 2 (God Mode) ─────────────────────────────")}
  aggregate        Fetch tech RSS, generate posts (--feeds, --posts, --trending, --publish)
  network          Smart networking (--role, --limit, --dry)
  cron             Background scheduler (--run-now)
  health           System health + n8n + cost telemetry
  sentiment <url>  Analyze comments on a LinkedIn post
  followup         Show stale leads, generate follow-up messages (--days)
  visual <url>     Visual brand audit of a profile
  full-auto        Infinite Innovation Loop (sheets + content + network + report)
  flush            Retry queued n8n & Sheets payloads
  usage            Show current AI cost telemetry

${CYAN("──── Level 3 (n8n Cloud) ────────────────────────────")}
  apply            Generate tailored CV + cover letter + recruiter email
                   (--title, --company, --desc, --url, --resume, --to)
  optimize         AI-optimize LinkedIn profile (headline + About + skills)
                   (--goal, --headline, --about, --skills, --lang)

${CYAN("Examples:")}
  colwork login
  colwork post --tone=technical --dry
  colwork network --role=CTO --role=Founder --limit=5
  colwork aggregate --trending --publish
  colwork full-auto
`);
}

(async () => {
  showWelcomeBanner();

  if (!COMMAND || COMMAND === "help") {
    printHelp();
    process.exit(0);
  }

  try {
    if (COMMAND === "login") {
      showSection("LinkedIn Login");
      await browserManager.start({ forceLogin: true });
      await browserManager.stop();
      showSuccess("Cookies saved → data/cookies.json");
      process.exit(0);
    }

    if (COMMAND === "about") {
      const name = arg("name");
      const currentRole = arg("role");
      const dry = flag("dry");
      showSection("About Section Update");
      if (dry) {
        const { generateAbout } = require("./src/ai");
        const text = await withSpinner("Generating About text...", () =>
          generateAbout({
            name: name || "Specjalista AI",
            currentRole: currentRole || "AI Automation Engineer",
            achievements: [
              "Wdrożenie hybrydowego sklepu Medusa.js + Next.js",
              "Redukcja kosztów operacyjnych o 40%",
              "Integracja DeepSeek do analizy danych e-commerce",
            ],
          })
        );
        showDivider();
        console.log(text);
        showDivider();
      } else {
        await updateAboutSection({ name, currentRole });
      }
      process.exit(0);
    }

    if (COMMAND === "post") {
      const topic = arg("topic");
      const tone = arg("tone");
      const dry = flag("dry");
      if (tone && !["inspirational", "technical", "thought-leadership"].includes(tone)) {
        showWarn(`Invalid tone "${tone}" — using thought-leadership`);
      }
      showSection(`Post${dry ? " (dry run)" : ""}`);
      const result = await createAndPublishPost({ topic, tone, dryRun: dry });
      if (result.post) {
        showDivider();
        console.log(result.post);
        showDivider();
      }
      showSuccess(result.published ? `Published: "${result.topic}"` : `Generated: "${result.topic}"`);
      process.exit(0);
    }

    if (COMMAND === "jobs") {
      const queries = argAll("query");
      const apply = flag("apply");
      const limit = parseInt(arg("limit") || "10", 10);
      showSection(`Jobs${apply ? " (auto-apply)" : ""}`);
      const results = await searchAndApply({
        queries: queries.length ? queries : undefined,
        maxResults: limit,
        autoApply: apply,
      });
      if (!results.length) {
        showWarn("No jobs found.");
      } else {
        for (const r of results) {
          console.log(`  ${fmtScore(r.score)}/100  ${r.title} @ ${r.company}${r.applied ? GREEN("  ✓ applied") : ""}`);
          console.log(`    ${DIM(r.reasoning)}`);
        }
      }
      process.exit(0);
    }

    if (COMMAND === "aggregate") {
      const maxFeeds = parseInt(arg("feeds") || "3", 10);
      const maxPosts = parseInt(arg("posts") || "3", 10);
      const trending = flag("trending");
      const publish = flag("publish");
      showSection("Aggregator");
      if (trending) {
        const { topic, post } = await withSpinner("Generating trending post...", () => generateTrendingPost());
        console.log(`${CYAN("Topic:")} ${topic}`);
        showDivider();
        console.log(post);
        showDivider();
        if (publish) await createAndPublishPost({ topic, dryRun: false });
      } else {
        const posts = await withSpinner(`Fetching ${maxFeeds} feeds...`, () => aggregateAndGenerate({ maxFeeds, maxPosts }));
        posts.forEach((p, i) => {
          console.log(`\n  ${CYAN(`#${i + 1}`)} ${p.title}  ${DIM(`(${p.source})`)}`);
          console.log(`  ${DIM(p.hashtags.join(" "))}`);
          showDivider();
          console.log(p.post);
          showDivider();
        });
        if (publish && posts.length) {
          await createAndPublishPost({ topic: posts[0].post.slice(0, 200), dryRun: false });
        }
      }
      process.exit(0);
    }

    if (COMMAND === "network") {
      const roles = argAll("role");
      const limit = parseInt(arg("limit") || "5", 10);
      const dry = flag("dry");
      showSection(`Network${dry ? " (dry)" : ""}`);
      const results = await smartNetwork({
        roles: roles.length ? roles : undefined,
        maxInvites: limit,
        dryRun: dry,
      });

      // Hot path: log all leads to Sheets in flat-row format
      for (const r of results) {
        const sentiment = await safe(
          () => scoreSentiment(r.message || r.title || ""),
          { score: 0, label: "neutral" },
          "sent.score"
        );
        await logToSheet({
          name: r.name,
          company: r.company || "",
          title: r.title || r.headline || "",
          linkedinUrl: r.linkedinUrl || "",
          aiHook: r.message || "",
          sentimentScore: sentiment.score,
          lastPost: "",
        });
      }

      showDivider();
      results.forEach((r) => {
        const icon = r.sent ? GREEN("✓") : DIM("·");
        console.log(`  ${icon} ${r.name}  ${DIM(r.title?.slice(0, 60) || "")}`);
      });
      showDivider();
      showInfo(`Sent ${GREEN(results.filter((r) => r.sent).length)} / ${results.length}`);
      process.exit(0);
    }

    if (COMMAND === "cron") {
      const runNow = flag("run-now");
      showSection("Cron Scheduler");
      const { start } = require("./src/cron");
      start({ runNow });
      showInfo("Mon/Wed/Fri 09:00 — content posts");
      showInfo("Tue/Thu 10:00 — smart networking (5 invites)");
      console.log(DIM("\nPress Ctrl+C to stop.\n"));
      return; // keep alive
    }

    if (COMMAND === "health") {
      showSection("System Health");
      const n8n = await healthCheck();
      console.log(summary("n8n:", n8n.ok ? "ONLINE" : "OFFLINE", n8n.ok ? GREEN : YELLOW));
      console.log(summary("DeepSeek:", process.env.DEEPSEEK_API_KEY ? "CONFIGURED" : "MISSING", process.env.DEEPSEEK_API_KEY ? GREEN : RED));
      console.log(summary("SMTP:", process.env.SMTP_HOST || "—", process.env.SMTP_HOST ? GREEN : YELLOW));
      console.log(summary("Sheets ID:", (process.env.GOOGLE_SHEET_ID || "—").slice(0, 24) + "...", process.env.GOOGLE_SHEET_ID ? GREEN : YELLOW));
      const { loadDB } = require("./src/modules/followup");
      const db = loadDB();
      console.log(summary("Follow-up DB:", `${db.leads.length} leads / ${db.interactions.length} interactions`));
      const u = getUsage();
      console.log(summary("AI usage:", `${u.calls} calls / ${u.promptTokens + u.completionTokens} tok / $${u.costUsd.toFixed(4)}`));
      showDivider();
      process.exit(0);
    }

    if (COMMAND === "sentiment") {
      const url = ARGS[0];
      if (!url) { showError("Usage: colwork sentiment <linkedin_post_url>"); process.exit(1); }
      showSection("Sentiment Analysis");
      const page = await browserManager.start();
      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
        const comments = await scrapeComments(page);
        showInfo(`Scraped ${comments.length} comments`);
        const analysis = await analyzeComments(comments);
        showInfo(`Overall: ${analysis.overall}`);
        analysis.breakdown?.forEach((b) => {
          const icon = b.s === "positive" ? GREEN("+") : b.s === "negative" ? RED("−") : DIM("~");
          console.log(`  ${icon} [${b.i}] ${b.intent || ""}`);
        });
        showDivider();
        showInfo(`Action: ${analysis.actionable}`);
        logAction("sentiment", { url, overall: analysis.overall, count: comments.length });
      } finally {
        await safe(() => browserManager.stop(), null, "browser.stop");
      }
      process.exit(0);
    }

    if (COMMAND === "followup") {
      const days = parseInt(arg("days") || "7", 10);
      showSection(`Follow-up (stale > ${days}d)`);
      const stale = getStaleLeads(days);
      showInfo(`${stale.length} stale leads`);
      stale.slice(0, 10).forEach((lead) => {
        console.log(`  · ${lead.name}  ${DIM("@ " + lead.company)}  ${YELLOW(lead.status)}  ${DIM("last: " + (lead.lastInteraction || "never"))}`);
      });
      if (stale.length) {
        const { sendReport } = await inquirer.prompt([
          { type: "confirm", name: "sendReport", message: "Generate follow-up messages for top 5?", default: false },
        ]);
        if (sendReport) {
          for (const lead of stale.slice(0, 5)) {
            const msg = await generateFollowupMessage(lead.linkedinUrl);
            console.log(`\n  ${CYAN("→")} ${lead.name}`);
            console.log(`    ${msg}`);
          }
        }
      }
      process.exit(0);
    }

    if (COMMAND === "visual") {
      const url = ARGS[0] || process.env.LINKEDIN_PROFILE_URL;
      if (!url) {
        showError("Provide a LinkedIn profile URL: node index.js visual <url>  (or set LINKEDIN_PROFILE_URL in .env)");
        process.exit(1);
      }
      showSection("Visual Profile Auditor");
      const page = await browserManager.start();
      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
        const audit = await fullVisualAudit(page, url);
        console.log(summary("Score:", `${audit.consistencyScore}/100`));
        console.log(summary("Palette:", audit.paletteSummary));
        audit.recommendations.forEach((r, i) => console.log(`  ${CYAN(`#${i + 1}`)} ${r}`));
        logAction("visual_audit", { url, score: audit.consistencyScore });
      } finally {
        await safe(() => browserManager.stop(), null, "browser.stop");
      }
      process.exit(0);
    }

    if (COMMAND === "full-auto") {
      showSection("Infinite Innovation Loop");

      await withSpinner("[1/6] Resyncing Sheets queue...", () => syncMemoryToSheets());

      const { topic, post } = await withSpinner("[2/6] Generating trending post...", () => generateTrendingPost());
      logAction("post_draft", { topic });

      const leads = await withSpinner("[3/6] Smart networking scan (dry)...", () =>
        smartNetwork({ maxInvites: 3, dryRun: true })
      );

      showInfo(`[4/6] Scoring ${leads.length} leads + Sheets sync...`);
      for (const lead of leads) {
        const sent = await safe(() => scoreSentiment(lead.message || lead.title || ""), { score: 0 }, "sent");
        const ice = await safe(
          () => generateIcebreaker({ name: lead.name, title: lead.title, company: lead.company, lastPost: "" }),
          lead.message,
          "ice"
        );
        await logToSheet({
          name: lead.name,
          company: lead.company || "",
          title: lead.title || "",
          linkedinUrl: lead.linkedinUrl || "",
          aiHook: ice,
          sentimentScore: sent.score,
        });
        if (sent.score >= 80) {
          await sendLeadToOrchestrator({
            name: lead.name, title: lead.title, company: lead.company || "",
            score: sent.score, reasoning: "AI-scored high-value", linkedinUrl: lead.linkedinUrl || "",
          });
        }
      }

      const stale = getStaleLeads(7);
      showInfo(`[5/6] ${stale.length} leads need follow-up`);

      const u = getUsage();
      const activity = getRecentActivity(24);
      const pdfPath = await withSpinner("[6/6] Generating PDF + emailing...", async () => {
        const p = await generatePDF({
          title: "Colwork Innovation Report",
          content: [
            "# Daily Innovation Report",
            "",
            `**Date:** ${new Date().toISOString()}`,
            `**HQ:** ${process.env.HQ_LOCATION || "Sztum"}`,
            "",
            "## Activity",
            "",
            `- Actions today: ${activity.recentActions.length}`,
            `- Leads evaluated: ${leads.length}`,
            `- Stale leads: ${stale.length}`,
            `- AI calls: ${u.calls} (${u.promptTokens + u.completionTokens} tokens, $${u.costUsd.toFixed(4)})`,
            "",
            "## Generated Content",
            "",
            `**Topic:** ${topic}`,
            "",
            post,
          ].join("\n"),
        });
        if (process.env.REPORT_EMAIL_TO) {
          await sendEmail(p, process.env.REPORT_EMAIL_TO).catch(() => {});
        }
        return p;
      });

      showSuccess(`Loop complete — PDF: ${pdfPath}`);
      showInfo(`AI cost this run: $${u.costUsd.toFixed(4)} (${u.calls} calls)`);
      process.exit(0);
    }

    if (COMMAND === "flush") {
      showSection("Flush Queues");
      const n = await flushLeadQueue();
      const s = await flushSheets();
      showInfo(`n8n leads flushed: ${n}`);
      showInfo(`Sheets rows flushed: ${s}`);
      process.exit(0);
    }

    if (COMMAND === "usage") {
      const u = getUsage();
      showSection("AI Usage (this run)");
      console.log(summary("Calls:", u.calls));
      console.log(summary("Prompt tok:", u.promptTokens));
      console.log(summary("Completion tok:", u.completionTokens));
      console.log(summary("Cost USD:", `$${u.costUsd.toFixed(4)}`));
      process.exit(0);
    }

    if (COMMAND === "apply") {
      showSection("Board Pipeline: Job Application");
      const jobTitle = arg("title");
      const company = arg("company");
      const jobDescription = arg("desc") || "";
      const companyUrl = arg("url") || "";
      const resumePath = arg("resume");
      const recruiterEmail = arg("to") || "";
      if (!jobTitle || !company) {
        showError("Usage: colwork apply --title=... --company=... [--desc=...] [--url=...] [--resume=path.md] [--to=email]");
        process.exit(1);
      }

      // Load resume if provided
      let resumeMd = "";
      if (resumePath) {
        try { resumeMd = fs.readFileSync(path.resolve(resumePath), "utf8"); }
        catch (e) { showWarn(`Resume read failed: ${e.message}`); }
      }

      // Get browser page for Sherlock OSINT
      let page;
      try { page = await browserManager.start(); }
      catch { showWarn("Browser unavailable — Sherlock will work with limited intel."); }

      // Run the full Board pipeline
      const { runApplyPipeline } = require("./src/experts/board");
      const pipeline = await withSpinner(
        `Board: Sherlock 🔍 → Seed 🌱 → Feynman 📐 → n8n ⚡`,
        () => runApplyPipeline({ page, jobTitle, company, jobDescription, companyUrl, resumeMd, recruiterEmail })
      );

      // Stop browser
      if (page) await safe(() => browserManager.stop(), null, "browser.stop");

      // Show Board trace
      showDivider();
      console.log(BLUE("Board Trace:"));
      pipeline.steps.forEach((s) => {
        if (s.expert === "sherlock") console.log(`  🔍 Sherlock: ${s.intel?.culture?.slice(0, 80) || "No intel"}...`);
        if (s.expert === "seed") console.log(`  🌱 Seed: "${s.icebreaker?.hook?.slice(0, 80)}..."`);
        if (s.expert === "feynman") console.log(`  📐 Feynman: Score ${fmtScore(s.cvEval?.score)} — ${s.cvEval?.oneLiner || ""}`);
        if (s.expert === "n8n") console.log(`  ⚡ n8n: ${s.result?.queued ? "QUEUED" : "GENERATED"}`);
      });
      console.log(`  ⏱️  Pipeline: ${pipeline.durationMs}ms`);
      showDivider();

      // Save output
      const n8nResult = pipeline.steps.find((s) => s.expert === "n8n")?.result;
      if (n8nResult && !n8nResult.queued) {
        const outDir = path.resolve("data", "applications", `${Date.now()}_${company.replace(/\W+/g, "_")}`);
        fs.mkdirSync(outDir, { recursive: true });
        fs.writeFileSync(path.join(outDir, "CV.md"), n8nResult.cv || "");
        fs.writeFileSync(path.join(outDir, "CoverLetter.md"), n8nResult.coverLetter || "");
        fs.writeFileSync(path.join(outDir, "email.txt"),
          `To: ${n8nResult.emailDraft?.to || ""}\nSubject: ${n8nResult.emailDraft?.subject || ""}\n\n${n8nResult.emailDraft?.body || ""}`
        );
        fs.writeFileSync(path.join(outDir, "board_pipeline.json"), JSON.stringify(pipeline, null, 2));
        showSuccess(`Saved: ${outDir}`);
        showSuccess(`Match score: ${fmtScore(n8nResult.matchScore)} / 100`);
      } else {
        showWarn("n8n returned queued — application saved for retry.");
      }
      logAction("board_apply_complete", { company, jobTitle, durationMs: pipeline.durationMs });
      process.exit(0);
    }

    if (COMMAND === "optimize") {
      showSection("Board Pipeline: Profile Optimize");
      const goal = arg("goal");
      const currentHeadline = arg("headline") || "";
      const currentAbout = arg("about") || "";
      const skills = argAll("skills");
      const language = arg("lang") || "pl";
      if (!goal) {
        showError("Usage: colwork optimize --goal=\"...\" [--headline=...] [--about=...] [--skills=AI] [--skills=Node] [--lang=pl|en]");
        process.exit(1);
      }

      const { runOptimizePipeline } = require("./src/experts/board");
      const pipeline = await withSpinner(
        "Board: Feynman 📐 → Seed 🌱 → n8n ⚡",
        () => runOptimizePipeline({ goal, currentHeadline, currentAbout, currentSkills: skills, language })
      );

      // Show Board trace
      showDivider();
      console.log(BLUE("Board Trace:"));
      pipeline.steps.forEach((s) => {
        if (s.expert === "feynman") console.log(`  📐 Feynman: Score ${fmtScore(s.cvEval?.score)} — ${s.cvEval?.oneLiner || ""}`);
        if (s.expert === "seed") console.log(`  🌱 Seed: "${s.angle?.hook?.slice(0, 80)}..."`);
        if (s.expert === "n8n") console.log(`  ⚡ n8n: ${s.result?.queued ? "QUEUED" : "GENERATED"}`);
      });
      console.log(`  ⏱️  Pipeline: ${pipeline.durationMs}ms`);
      showDivider();

      const n8nResult = pipeline.steps.find((s) => s.expert === "n8n")?.result;
      if (n8nResult && !n8nResult.queued) {
        console.log(`${BLUE("New Headline:")}  ${n8nResult.newHeadline}`);
        showDivider();
        console.log(`${BLUE("New About:")}\n\n${n8nResult.newAbout}`);
        showDivider();
        console.log(`${BLUE("Recommended Skills:")} ${(n8nResult.recommendedSkills || []).join(", ")}`);
        showDivider();
        console.log(`${BLUE("Content Angles:")}`);
        (n8nResult.contentAngles || []).forEach((a, i) => console.log(`  ${BLUE(`#${i + 1}`)} ${a}`));
        showDivider();
        const a = n8nResult.audit || {};
        const dh = (a.delta?.headlineScore ?? 0); const da = (a.delta?.aboutScore ?? 0);
        const fmtDelta = (n) => n >= 0 ? GREEN(`+${n}`) : RED(`${n}`);
        console.log(summary("Headline score:", `${a.before?.headlineScore ?? 0} → ${a.after?.headlineScore ?? 0}  (${fmtDelta(dh)})`));
        console.log(summary("About score:", `${a.before?.aboutScore ?? 0} → ${a.after?.aboutScore ?? 0}  (${fmtDelta(da)})`));
        console.log(summary("Keyword coverage:", `${a.after?.keywordCoverage ?? 0}%`));
        const outFile = path.resolve("data", "optimizations", `${Date.now()}.json`);
        fs.mkdirSync(path.dirname(outFile), { recursive: true });
        fs.writeFileSync(outFile, JSON.stringify({ pipeline, n8nResult }, null, 2));
        showInfo(`Saved: ${outFile}`);
      } else {
        showWarn("n8n returned queued — optimization saved for retry.");
      }
      logAction("board_optimize_complete", { goal, durationMs: pipeline.durationMs });
      process.exit(0);
    }

    if (COMMAND === "research") {
      const topic = arg("topic");
      const format = arg("format") || "whitepaper";
      const audience = arg("audience") || "Decydenci biznesowi, CTO, RevOps Managerowie";
      const sourcesDir = arg("sources") || "";
      const dry = flag("dry");
      if (!topic) {
        showError("Usage: colwork research --topic=\"...\" [--format=academic|whitepaper|casestudy] [--sources=./data/nauka] [--audience=...] [--dry]");
        process.exit(1);
      }
      if (!["academic", "whitepaper", "casestudy"].includes(format)) {
        showWarn(`Unknown format "${format}" — using whitepaper.`);
      }

      // ── Step 1a: Ingest local sources (RAG mode) ──────────────────────────
      const { ingestSources, generatePaper, executiveSummary } = require("./src/experts/aristotle");
      let sources = [];
      let modeLabel = "Web Research";

      if (sourcesDir) {
        const absDir = path.resolve(sourcesDir);
        showInfo(`📚 Ingesting local sources: ${absDir}`);
        sources = await ingestSources(absDir);
        if (sources.length) {
          modeLabel = `Evidence-Based RAG (${sources.length} sources)`;
          showSuccess(`Ingested ${sources.length} source(s): ${sources.map((s) => s.id).join(", ")}`);
        }
      }

      // ── Step 1b: Sherlock web research (only if no local sources) ─────────
      let sourceFindings = [];
      if (!sources.length) {
        let page;
        try { page = await browserManager.start(); } catch { /* proceed without browser */ }

        if (page) {
          try {
            showInfo("🔍 Sherlock: Researching current trends...");
            const q = encodeURIComponent(`${topic} automation AI 2025 2026`);
            await page.goto(`https://html.duckduckgo.com/html/?q=${q}`, { waitUntil: "domcontentloaded", timeout: 20000 });
            const snippets = await page.evaluate(() => {
              const results = [];
              document.querySelectorAll(".result__snippet, .result__body").forEach((el, i) => {
                if (i < 8) results.push(el.textContent.trim().slice(0, 300));
              });
              return results;
            });
            sourceFindings = snippets;
            showSuccess(`Sherlock found ${snippets.length} web snippets.`);
          } catch (e) {
            showWarn(`Sherlock research limited: ${e.message}`);
          } finally {
            await safe(() => browserManager.stop(), null, "browser.stop");
          }
        }
      }

      showSection(`Research Pipeline: ${modeLabel} → Aristotle 📜 → Feynman 📐 → Paul 📢`);

      // ── Step 2: Aristotle — generate paper ────────────────────────────────
      const paper = await withSpinner(
        `Aristotle: Generating ${format} (${sources.length ? "STRICT RAG" : "web"} mode)...`,
        () => generatePaper({ topic, format, audience, sources, sourceFindings })
      );
      if (paper.strictMode) {
        showSuccess(`Aristotle (RAG): ${paper.wordCount} words, ${paper.citationCount} exact citations from ${paper.sourceCount} sources.`);
      } else {
        showSuccess(`Aristotle (Web): ${paper.wordCount} words, ${paper.citationCount} citation markers.`);
      }

      // ── Step 3: Feynman — logic check ─────────────────────────────────────
      const { simplify } = require("./src/experts/feynman");
      const logicCheck = await withSpinner(
        "Feynman: Logic check...",
        () => simplify(`Sprawdź logiczną spójność artykułu. Wskaż luki:\n\n${paper.fullText.slice(0, 3000)}`, "report")
      );
      showSuccess("Feynman: Logic verification complete.");

      // ── Step 4: Paul — LinkedIn promo post ────────────────────────────────
      const { generateBuildInPublicPost } = require("./src/experts/paul");
      const promoPost = await withSpinner(
        "Paul: Writing LinkedIn promo...",
        () => generateBuildInPublicPost(paper.title, `${format}: ${topic}. ${paper.wordCount} słów, ${paper.citationCount} cytatów.`)
      );

      // ── Step 5: Executive Summary + PDF ───────────────────────────────────
      const { generatePDF } = require("./src/modules/reporting");
      const execSummary = await withSpinner(
        "Generating executive summary...",
        () => executiveSummary(paper.fullText)
      );

      const pdfContent = [
        `# ${paper.title}`,
        `**Format:** ${format.toUpperCase()} | **Tryb:** ${paper.strictMode ? "Evidence-Based RAG" : "Web Research"} | **Słowa:** ${paper.wordCount}`,
        `**Źródła:** ${paper.sourceCount} | **Cytaty:** ${paper.citationCount}`,
        "",
        "---",
        "## Executive Summary",
        execSummary,
        "---",
        paper.fullText,
        "---",
        paper.bibliography ? `## BIBLIOGRAFIA\n\n${paper.bibliography}` : "",
        "---",
        "## Feynman Logic Check",
        logicCheck,
        "---",
        `*Generated by CoLwork v4.1 — Aristotle Evidence-Based RAG Engine. ${paper.strictMode ? "Strict Extraction mode: all claims grounded in provided sources." : ""}*`,
      ].filter(Boolean).join("\n\n");

      const outDir = path.resolve("data", "publications");
      fs.mkdirSync(outDir, { recursive: true });
      const slug = topic.slice(0, 50).replace(/\W+/g, "_").toLowerCase();
      const ts = Date.now();
      const pdfPath = path.join(outDir, `${slug}_${ts}.pdf`);
      const mdPath = path.join(outDir, `${slug}_${ts}.md`);
      fs.writeFileSync(mdPath, pdfContent);

      if (!dry) {
        await withSpinner("Rendering PDF...", () => generatePDF({ title: paper.title, content: pdfContent, outputPath: pdfPath }));
      }

      // ── Results display ───────────────────────────────────────────────────
      showDivider();
      console.log(`${BLUE("Mode:")}       ${paper.strictMode ? "EVIDENCE-BASED RAG (Strict Extraction)" : "WEB RESEARCH"}`);
      console.log(`${BLUE("Title:")}      ${paper.title}`);
      console.log(`${BLUE("Format:")}     ${format.toUpperCase()}`);
      console.log(`${BLUE("Words:")}      ${paper.wordCount}`);
      console.log(`${BLUE("Sources:")}    ${paper.sourceCount} ingested`);
      console.log(`${BLUE("Citations:")}  ${paper.citationCount} exact references`);
      showDivider();
      console.log(`${BLUE("Executive Summary:")}\n`);
      console.log(execSummary);
      showDivider();
      console.log(`${BLUE("LinkedIn Promo Post:")}\n`);
      console.log(promoPost);
      if (paper.bibliography) {
        showDivider();
        console.log(`${BLUE("Bibliography:")}\n`);
        console.log(paper.bibliography);
      }
      showDivider();
      console.log(summary("Markdown:", mdPath));
      if (!dry) console.log(summary("PDF:", pdfPath));
      if (dry) showWarn("DRY RUN — PDF not generated. Remove --dry to render.");

      // ── Step 6: DevLog ────────────────────────────────────────────────────
      const { publishDevLog } = require("./src/experts/paul");
      await publishDevLog({
        title: `[Research] ${paper.title}`,
        body: pdfContent.slice(0, 4000),
        status: dry ? "draft" : "published",
        version: "v4.1",
        tags: ["colwork", "research", format, paper.strictMode ? "rag" : "web"],
      });

      logAction("research_published", {
        topic, format,
        wordCount: paper.wordCount,
        citationCount: paper.citationCount,
        sourceCount: paper.sourceCount,
        strictMode: paper.strictMode,
        dry,
      });
      process.exit(0);
    }

    if (COMMAND === "ui") {
      showSection("CoLwork Enterprise Dashboard");
      const apiPort = parseInt(arg("api-port") || "3001", 10);
      const uiPort = parseInt(arg("ui-port") || "3000", 10);
      const { start } = require("./src/server/api");
      const { spawn } = require("child_process");
      const open = (await import("open")).default || require("open");

      showInfo(`Starting API server on port ${apiPort}...`);
      await start(apiPort);

      showInfo(`Starting UI on port ${uiPort}...`);
      const uiProc = spawn("npx", ["vite", "--port", String(uiPort), "--strictPort"], {
        cwd: path.join(__dirname, "ui"),
        stdio: "inherit",
        shell: true,
      });

      showSuccess(`Dashboard: http://localhost:${uiPort}`);
      showInfo("Press Ctrl+C to stop both servers.");

      // Auto-open browser
      try { await open(`http://localhost:${uiPort}`); } catch { /* fine */ }

      // Keep alive
      uiProc.on("exit", () => process.exit(0));
      return;
    }

    if (COMMAND === "deploy-n8n") {
      showSection("n8n Deploy");
      require("./src/scripts/deploy_n8n_webhook");
      return;
    }

    if (COMMAND === "topics") {
      showSection("Curated Topics");
      TOPICS.forEach((t, i) => console.log(`  ${CYAN(`${i + 1}.`)} ${t}`));
      process.exit(0);
    }

    showError(`Unknown command: "${COMMAND}"`);
    printHelp();
    process.exit(1);
  } catch (e) {
    showError(`Fatal: ${e.message}`);
    if (process.env.DEBUG) console.error(e.stack);
    process.exit(1);
  }
})();
