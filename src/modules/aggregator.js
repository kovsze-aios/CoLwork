"use strict";

const RssParser = require("rss-parser");
const cheerio = require("cheerio");
const { analyzeArticle, generatePost } = require("../ai");
const { clean } = require("../utils/clean");
const { safe } = require("../utils/retry");

const parser = new RssParser({ timeout: 12000 });

const TECH_FEEDS = [
  { name: "TechCrunch", url: "https://techcrunch.com/feed/" },
  { name: "The Verge", url: "https://www.theverge.com/rss/index.xml" },
  { name: "Hacker News", url: "https://hnrss.org/frontpage?points=50" },
  { name: "Ars Technica", url: "https://feeds.arstechnica.com/arstechnica/technology-lab" },
  { name: "ZDNet AI", url: "https://www.zdnet.com/topic/artificial-intelligence/rss.xml" },
];

function stripHtml(html) {
  if (!html) return "";
  try {
    return clean(cheerio.load(html).text(), { max: 1500 });
  } catch {
    return clean(String(html).replace(/<[^>]*>/g, " "), { max: 1500 });
  }
}

async function fetchFeed(feed) {
  return await safe(async () => {
    const raw = await parser.parseURL(feed.url);
    const items = (raw.items || []).slice(0, 5).map((item) => ({
      title: clean(item.title, { oneLine: true, max: 200 }),
      summary: stripHtml(item.contentSnippet || item.summary || item.content || ""),
      url: item.link || "",
      source: feed.name,
      date: item.pubDate || item.isoDate || "",
    })).filter((i) => i.title && i.summary);
    return items;
  }, [], `feed.${feed.name}`);
}

async function aggregateAndGenerate({ maxFeeds = 3, maxPosts = 3 } = {}) {
  const feeds = TECH_FEEDS.slice(0, maxFeeds);
  const results = await Promise.all(feeds.map(fetchFeed));

  const seen = new Set();
  const articles = results.flat().filter((a) => {
    if (seen.has(a.url)) return false;
    seen.add(a.url);
    return true;
  }).slice(0, maxPosts * 2);

  const posts = [];
  for (const article of articles) {
    if (posts.length >= maxPosts) break;
    try {
      const result = await analyzeArticle({ title: article.title, summary: article.summary, url: article.url });
      if (result.post && result.post.length > 100) {
        posts.push({
          title: article.title,
          post: result.post,
          hashtags: result.hashtags || [],
          source: article.source,
          url: article.url,
        });
      }
    } catch (e) {
      console.warn(`[aggregator] AI fail "${article.title.slice(0, 50)}": ${e.message?.slice(0, 80)}`);
    }
  }
  console.log(`[aggregator] ${posts.length}/${articles.length} posts ready`);
  return posts;
}

async function generateTrendingPost() {
  const TRENDING = [
    "Jak AI agenci zmieniają rynek pracy w 2026 roku",
    "Automatyzacja procesów vs. zatrudnianie — matematyka, której nikt nie robi",
    "Playwright + DeepSeek = agent, który sam ogarnia Twoje social media",
    "Dlaczego Prompt Engineering będzie wymagany w każdej branży do 2027",
    "Małe firmy, które wdrożyły AI agentów — 3 case studies",
  ];
  const topic = TRENDING[Math.floor(Math.random() * TRENDING.length)];
  const post = await generatePost({ topic, tone: "thought-leadership", length: "medium" });
  return { topic, post };
}

module.exports = { aggregateAndGenerate, generateTrendingPost, TECH_FEEDS };
