#!/usr/bin/env node
"use strict";

require("dotenv").config();

const { createSession } = require("./src/browser");
const { updateAboutSection } = require("./src/modules/profile");
const { createAndPublishPost, TOPICS } = require("./src/modules/content");
const { searchAndApply } = require("./src/modules/jobs");
const { aggregateAndGenerate, generateTrendingPost } = require("./src/modules/aggregator");
const { smartNetwork } = require("./src/modules/network");

const COMMAND = process.argv[2]?.toLowerCase();
const ARGS = process.argv.slice(3);

function printBanner() {
  console.log(`
  ╔══════════════════════════════════════════════════════╗
  ║      🤖  LINKEDIN AI AGENT v2.0 — GOD MODE  🤖     ║
  ║   DeepSeek v4 Pro  •  Playwright  •  node-cron      ║
  ║   Aggregator  •  Smart Network  •  Dynamic Forms    ║
  ╚══════════════════════════════════════════════════════╝
  `);
}

function printHelp() {
  console.log(`
🔹 USAGE: node index.js <command> [options]

COMMANDS ── Level 1 ───────────────────────────────────────────
  login          Log into LinkedIn and save session cookies

  about          Update the "About" section with AI-generated content
    --name=      Full name (optional, auto-detected)
    --role=      Current role (optional)
    --dry        Generate text without saving

  post           Generate and publish a LinkedIn post
    --topic=     Custom topic (optional, auto-picked from 8 topics)
    --tone=      "inspirational" | "technical" | "thought-leadership"
    --dry        Generate without publishing

  jobs           Search and evaluate job listings
    --query=     Custom search query (repeatable)
    --apply      Auto-apply w/ dynamic form answers (DeepSeek-powered)
    --limit=     Max results per query (default: 10)

COMMANDS ── Level 2 (God Mode) ─────────────────────────────────
  aggregate      Fetch tech news, generate AI posts
    --feeds=     Max RSS feeds to query (default: 3)
    --posts=     Max posts to generate (default: 3)
    --trending   Generate trending topic post instead of news
    --publish    Auto-publish the best post to LinkedIn

  network        Smart networking: find CTO/CEO/Founder, send invites
    --role=      Target role (repeatable, default: CTO, CEO, Founder)
    --limit=     Max invites to send (default: 5)
    --dry        Generate messages without sending

  cron           Start background scheduler (Mon/Wed/Fri posts, Tue/Thu networking)
    --run-now    Execute Monday post job immediately on start

  topics         Show the 8 curated topic suggestions for posts

EXAMPLES:
  node index.js login
  node index.js about --role="AI Automation Engineer" --dry
  node index.js post --tone=technical
  node index.js jobs --query="Prompt Engineer" --apply
  node index.js aggregate --trending --publish
  node index.js network --role="CTO" --role="Founder" --limit=5
  node index.js cron            # start background scheduler
  node index.js cron --run-now  # start + immediate post
  `);
}

(async () => {
  printBanner();

  if (!COMMAND || COMMAND === "help") {
    printHelp();
    process.exit(0);
  }

  // ── LOGIN ──────────────────────────────────────────────────────────────────
  if (COMMAND === "login") {
    console.log("🔹 LOGIN: Authenticating and saving session...\n");
    const { browser } = await createSession({ forceLogin: true });
    await browser.close();
    console.log("\n✅ Login complete. Cookies saved to ./data/cookies.json");
    process.exit(0);
  }

  // ── ABOUT ──────────────────────────────────────────────────────────────────
  if (COMMAND === "about") {
    const name = ARGS.find((a) => a.startsWith("--name="))?.split("=")[1];
    const currentRole = ARGS.find((a) => a.startsWith("--role="))?.split("=")[1];
    const dry = ARGS.includes("--dry");

    if (dry) {
      const { generateAbout } = require("./src/ai");
      const text = await generateAbout({
        name: name || "Specjalista AI",
        achievements: [
          "Wdrożenie hybrydowego sklepu internetowego z pełną automatyzacją procesów",
          "Redukcja kosztów operacyjnych o 40% dzięki integracji AI i no-code",
          "Integracja DeepSeek v4 Pro do analizy danych sprzedażowych e-commerce",
        ],
        currentRole: currentRole || "AI Automation Engineer",
      });
      console.log("\n📝 Generated About (DRY RUN):\n");
      console.log("─".repeat(50));
      console.log(text);
      console.log("─".repeat(50));
    } else {
      console.log("🔹 ABOUT: Updating profile About section...\n");
      await updateAboutSection({
        name,
        currentRole,
        achievements: [
          "Wdrożenie hybrydowego sklepu internetowego Medusa.js + Next.js z automatyzacją procesów",
          "Redukcja kosztów operacyjnych o 40% dzięki automatyzacji (Make, n8n, Node.js)",
          "Integracja DeepSeek v4 Pro do analizy danych i personalizacji ofert w e-commerce",
          "Optymalizacja ISR i cachowania — sklep ładuje się <50ms z cache'u Next.js",
        ],
      });
    }
    process.exit(0);
  }

  // ── POST ───────────────────────────────────────────────────────────────────
  if (COMMAND === "post") {
    const topic = ARGS.find((a) => a.startsWith("--topic="))?.split("=")[1];
    const tone = ARGS.find((a) => a.startsWith("--tone="))?.split("=")[1];
    const dry = ARGS.includes("--dry");

    if (tone && !["inspirational", "technical", "thought-leadership"].includes(tone)) {
      console.error(`❌ Invalid tone: "${tone}". Use: inspirational | technical | thought-leadership`);
      process.exit(1);
    }

    console.log(`🔹 POST: ${dry ? "DRY RUN" : "Generating & publishing"}...\n`);
    const result = await createAndPublishPost({ topic, tone, dryRun: dry });
    console.log(`\n✅ Post ${result.published ? "published" : "generated (dry run)"}: "${result.topic}"`);
    process.exit(0);
  }

  // ── JOBS ───────────────────────────────────────────────────────────────────
  if (COMMAND === "jobs") {
    const queries = ARGS.filter((a) => a.startsWith("--query=")).map((a) => a.split("=")[1]);
    const apply = ARGS.includes("--apply");
    const limitArg = ARGS.find((a) => a.startsWith("--limit="))?.split("=")[1];
    const limit = limitArg ? parseInt(limitArg, 10) : 10;

    console.log(`🔹 JOBS: Searching & evaluating${apply ? " (AUTO-APPLY ENABLED)" : ""}...\n`);
    const results = await searchAndApply({
      queries: queries.length ? queries : undefined,
      maxResults: limit,
      autoApply: apply,
    });

    console.log("\n📊 RESULTS (sorted by match score):\n");
    console.log("─".repeat(70));

    for (const r of results) {
      const icon = r.score >= 80 ? "🟢" : r.score >= 60 ? "🟡" : "🔴";
      console.log(`${icon} ${r.score}/100 | ${r.title} @ ${r.company}`);
      console.log(`   ${r.reasoning}`);
      if (r.applied) console.log(`   ✅ AUTO-APPLIED (dynamic form answers by DeepSeek)`);
      if (r.coverLetter) {
        console.log(`   📝 Cover letter preview: ${r.coverLetter.slice(0, 120)}...`);
      }
      console.log("");
    }

    if (results.length === 0) {
      console.log("  No matching jobs found. Try broadening your search queries.");
    }

    console.log("─".repeat(70));
    process.exit(0);
  }

  // ── AGGREGATE ──────────────────────────────────────────────────────────────
  if (COMMAND === "aggregate") {
    const feedsArg = ARGS.find((a) => a.startsWith("--feeds="))?.split("=")[1];
    const postsArg = ARGS.find((a) => a.startsWith("--posts="))?.split("=")[1];
    const trending = ARGS.includes("--trending");
    const publish = ARGS.includes("--publish");

    const maxFeeds = feedsArg ? parseInt(feedsArg, 10) : 3;
    const maxPosts = postsArg ? parseInt(postsArg, 10) : 3;

    if (trending) {
      console.log("🔹 AGGREGATOR: Generating trending topic post...\n");
      const { topic, post } = await generateTrendingPost();
      console.log(`📝 Topic: ${topic}`);
      console.log("─".repeat(50));
      console.log(post);
      console.log("─".repeat(50));

      if (publish) {
        console.log("\n🔹 Publishing to LinkedIn...");
        await createAndPublishPost({ topic, dryRun: false });
        console.log("✅ Published.");
      }
    } else {
      console.log(`🔹 AGGREGATOR: Fetching ${maxFeeds} feeds, generating ${maxPosts} posts...\n`);
      const posts = await aggregateAndGenerate({ maxFeeds, maxPosts });

      for (let i = 0; i < posts.length; i++) {
        const p = posts[i];
        console.log(`\n📰 POST ${i + 1}/${posts.length}: ${p.title}`);
        console.log(`   Source: ${p.source} | ${p.url}`);
        console.log(`   Hashtags: ${p.hashtags.join(" ")}`);
        console.log("─".repeat(50));
        console.log(p.post);
        console.log("─".repeat(50));
      }

      if (publish && posts.length > 0) {
        console.log("\n🔹 Publishing best post to LinkedIn...");
        await createAndPublishPost({ topic: posts[0].post.slice(0, 200), dryRun: false });
        console.log("✅ Published.");
      }

      if (posts.length === 0) {
        console.log("⚠️  No articles found. Try --trending for a generated topic instead.");
      }
    }
    process.exit(0);
  }

  // ── NETWORK ────────────────────────────────────────────────────────────────
  if (COMMAND === "network") {
    const roles = ARGS.filter((a) => a.startsWith("--role=")).map((a) => a.split("=")[1]);
    const limitArg = ARGS.find((a) => a.startsWith("--limit="))?.split("=")[1];
    const limit = limitArg ? parseInt(limitArg, 10) : 5;
    const dry = ARGS.includes("--dry");

    console.log(`🔹 NETWORK: Smart networking${dry ? " (DRY RUN)" : ""}...\n`);
    console.log(`   Target roles: ${roles.length ? roles.join(", ") : "CTO, CEO, Founder (defaults)"}`);
    console.log(`   Max invites: ${limit}\n`);

    const results = await smartNetwork({
      roles: roles.length ? roles : undefined,
      maxInvites: limit,
      dryRun: dry,
    });

    console.log("\n📊 NETWORKING RESULTS:\n");
    console.log("─".repeat(70));
    for (const r of results) {
      const icon = r.sent ? "✅" : "📝";
      console.log(`${icon} ${r.name} | ${r.title.slice(0, 60)}`);
      console.log(`   Message: "${r.message.slice(0, 100)}..."`);
      console.log("");
    }
    console.log("─".repeat(70));
    console.log(`\nSent: ${results.filter((r) => r.sent).length}/${results.length}`);
    process.exit(0);
  }

  // ── CRON ───────────────────────────────────────────────────────────────────
  if (COMMAND === "cron") {
    const runNow = ARGS.includes("--run-now");
    console.log("🔹 CRON: Starting background scheduler...\n");

    const { start } = require("./src/cron");
    start({ runNow });

    console.log("⏳ Scheduler running. The agent will:");
    console.log("   • Post content Mon/Wed/Fri at 09:00 CET");
    console.log("   • Send 5 connection invites Tue/Thu at 10:00 CET");
    console.log("\nPress Ctrl+C to stop.\n");
    // Keep process alive
  }

  // ── TOPICS ─────────────────────────────────────────────────────────────────
  if (COMMAND === "topics") {
    console.log("🔹 CURATED TOPICS for LinkedIn posts:\n");
    TOPICS.forEach((t, i) => console.log(`  ${i + 1}. ${t}`));
    console.log(`\nUsage: node index.js post --topic="<paste topic here>"`);
    process.exit(0);
  }

  // ── UNKNOWN ────────────────────────────────────────────────────────────────
  console.error(`❌ Unknown command: "${COMMAND}"`);
  printHelp();
  process.exit(1);
})();
