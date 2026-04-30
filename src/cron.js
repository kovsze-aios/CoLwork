"use strict";

const cron = require("node-cron");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

let jobs = [];

/**
 * Start the background scheduler.
 * @param {Object} opts
 * @param {boolean} [opts.runNow] - If true, execute Monday tasks immediately on start
 */
function start({ runNow = false } = {}) {
  console.log("[cron] 🕒 LinkedIn AI Agent — background scheduler starting...\n");

  // ── Monday, Wednesday, Friday: 9:00 AM Warsaw time ──────────────────────
  // LinkedIn peak: morning posts get highest engagement
  const postSchedule = "0 9 * * 1,3,5"; // crontab: At 09:00 on Mon, Wed, Fri
  jobs.push(
    cron.schedule(postSchedule, async () => {
      console.log(`[cron] 📅 [${new Date().toISOString()}] Running: Content Aggregator + Post`);
      try {
        const { aggregateAndGenerate } = require("./modules/aggregator");
        const { createAndPublishPost } = require("./modules/content");

        const articles = await aggregateAndGenerate({ maxFeeds: 3, maxPosts: 1 });

        if (articles.length > 0) {
          const best = articles[0];
          console.log(`[cron] Publishing aggregated post from: ${best.source}`);
          await createAndPublishPost({ topic: best.post.slice(0, 200), dryRun: false });
        } else {
          console.log("[cron] No articles found. Generating trending post instead...");
          const { generateTrendingPost } = require("./modules/aggregator");
          const { post } = await generateTrendingPost();
          await createAndPublishPost({ topic: post.slice(0, 200), dryRun: false });
        }
      } catch (e) {
        console.error(`[cron] ❌ Post job failed: ${e.message}`);
      }
    }, { timezone: "Europe/Warsaw" })
  );

  // ── Tuesday, Thursday: 10:00 AM Warsaw time ─────────────────────────────
  // Mid-week smart networking — connect with 5 decision-makers
  const networkSchedule = "0 10 * * 2,4"; // crontab: At 10:00 on Tue, Thu
  jobs.push(
    cron.schedule(networkSchedule, async () => {
      console.log(`[cron] 🤝 [${new Date().toISOString()}] Running: Smart Networking`);
      try {
        const { smartNetwork } = require("./modules/network");
        const results = await smartNetwork({ maxInvites: 5, dryRun: false });
        const sent = results.filter((r) => r.sent).length;
        console.log(`[cron] ✅ Networking complete. ${sent}/5 invites sent.`);
      } catch (e) {
        console.error(`[cron] ❌ Network job failed: ${e.message}`);
      }
    }, { timezone: "Europe/Warsaw" })
  );

  console.log("[cron] Schedule configured:");
  console.log("  📝 Content + Post:   Mon, Wed, Fri at 09:00 CET");
  console.log("  🤝 Smart Networking: Tue, Thu at 10:00 CET");
  console.log("[cron] Scheduler is running. Press Ctrl+C to stop.\n");

  // Optional: run Monday task immediately
  if (runNow) {
    console.log("[cron] ⚡ --run-now flag set. Executing content job immediately...");
    const { aggregateAndGenerate } = require("./modules/aggregator");
    aggregateAndGenerate({ maxFeeds: 3, maxPosts: 1 }).then(async (articles) => {
      if (articles.length > 0) {
        const { createAndPublishPost } = require("./modules/content");
        await createAndPublishPost({ topic: articles[0].post.slice(0, 200), dryRun: false });
      }
      console.log("[cron] ⚡ Immediate job complete.");
    }).catch((e) => console.error(`[cron] Immediate job failed: ${e.message}`));
  }
}

function stop() {
  console.log("[cron] Stopping all scheduled jobs...");
  for (const job of jobs) {
    job.stop();
  }
  jobs = [];
  console.log("[cron] All jobs stopped.");
}

// Graceful shutdown
process.on("SIGINT", () => {
  stop();
  process.exit(0);
});
process.on("SIGTERM", () => {
  stop();
  process.exit(0);
});

module.exports = { start, stop };
