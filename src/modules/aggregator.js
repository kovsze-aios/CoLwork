"use strict";

const RssParser = require("rss-parser");
const cheerio = require("cheerio");
const { analyzeArticle, generatePost } = require("../ai");

const parser = new RssParser({ timeout: 15000 });

const TECH_FEEDS = [
  { name: "TechCrunch", url: "https://techcrunch.com/feed/" },
  { name: "The Verge", url: "https://www.theverge.com/rss/index.xml" },
  { name: "Hacker News", url: "https://hnrss.org/frontpage?points=50" },
  { name: "Ars Technica", url: "https://feeds.arstechnica.com/arstechnica/technology-lab" },
  { name: "ZDNet AI", url: "https://www.zdnet.com/topic/artificial-intelligence/rss.xml" },
];

/**
 * Fetch and parse a single RSS feed.
 * @returns {Promise<Array<{title: string, summary: string, url: string, source: string}>>}
 */
async function fetchFeed(feed) {
  try {
    const raw = await parser.parseURL(feed.url);
    const items = (raw.items || []).slice(0, 5).map((item) => ({
      title: item.title || "",
      summary: stripHtml(item.contentSnippet || item.summary || item.content || ""),
      url: item.link || "",
      source: feed.name,
      date: item.pubDate || item.isoDate || "",
    }));
    console.log(`[aggregator]   ${feed.name}: ${items.length} articles`);
    return items;
  } catch (e) {
    console.error(`[aggregator]   ${feed.name}: FAILED — ${e.message}`);
    return [];
  }
}

function stripHtml(html) {
  try {
    return cheerio.load(html || "").text().replace(/\s+/g, " ").trim();
  } catch {
    return (html || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  }
}

/**
 * Aggregate articles from all configured feeds, pick the best ones,
 * and generate LinkedIn-ready posts via DeepSeek.
 * @param {Object} opts
 * @param {number} [opts.maxFeeds] - Max feeds to query
 * @param {number} [opts.maxPosts] - Max AI-generated posts to return
 * @returns {Promise<Array<{title: string, post: string, hashtags: string[], source: string, url: string}>>}
 */
async function aggregateAndGenerate({ maxFeeds = 3, maxPosts = 3 } = {}) {
  console.log("[aggregator] Fetching tech news feeds...");

  const feeds = TECH_FEEDS.slice(0, maxFeeds);
  const feedPromises = feeds.map(fetchFeed);
  const results = await Promise.all(feedPromises);

  // Flatten, deduplicate by URL, sort by recency, pick top
  const seen = new Set();
  const articles = results
    .flat()
    .filter((a) => {
      if (!a.title || !a.summary || seen.has(a.url)) return false;
      seen.add(a.url);
      return true;
    })
    .slice(0, maxPosts * 2); // get more than needed, AI will filter

  console.log(`[aggregator] ${articles.length} unique articles. Sending to DeepSeek for analysis...`);

  const posts = [];
  for (const article of articles) {
    if (posts.length >= maxPosts) break;

    try {
      console.log(`[aggregator]   Analyzing: "${article.title.slice(0, 70)}..."`);
      const result = await analyzeArticle({
        title: article.title,
        summary: article.summary,
        url: article.url,
      });

      if (result.post && result.post.length > 100) {
        posts.push({
          title: article.title,
          post: result.post,
          hashtags: result.hashtags || [],
          source: article.source,
          url: article.url,
        });
        console.log(`[aggregator]   ✅ Post generated (${result.post.length} chars)`);
      }
    } catch (e) {
      console.error(`[aggregator]   ❌ AI analysis failed: ${e.message}`);
    }
  }

  console.log(`[aggregator] Done. Generated ${posts.length} posts from ${articles.length} articles.`);
  return posts;
}

/**
 * Generate a standalone thought-leadership post on a trending topic.
 * Picks a random topic from the curated list and generates a full post.
 * @returns {Promise<{topic: string, post: string}>}
 */
async function generateTrendingPost() {
  const TRENDING = [
    "Jak AI agenci zmieniają rynek pracy w 2026 roku",
    "Automatyzacja procesów vs. zatrudnianie — matematyka, której nikt nie robi",
    "Playwright + DeepSeek = agent, który sam ogarnia Twoje social media",
    "Dlaczego Prompt Engineering będzie wymagany w każdej branży do 2027",
    "Małe firmy, które wdrożyły AI agentów — 3 case studies",
  ];

  const topic = TRENDING[Math.floor(Math.random() * TRENDING.length)];
  console.log(`[aggregator] Generating trending post on: "${topic}"`);

  const post = await generatePost({ topic, tone: "thought-leadership", length: "medium" });
  return { topic, post };
}

module.exports = { aggregateAndGenerate, generateTrendingPost, TECH_FEEDS };
