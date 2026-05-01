"use strict";

// Thin wrapper — actual analysis lives in src/ai.js (single client, retries, telemetry).
const { analyzeComments } = require("../ai");

async function scrapeComments(page) {
  return await page.evaluate(() => {
    const comments = [];
    const nodes = document.querySelectorAll(
      "article.comments-comment-item, div.comments-comment-entity, div.feed-shared-social-action-bar"
    );
    nodes.forEach((node) => {
      const author = node.querySelector(
        "span.comments-comment-meta__description-title, a.comment-author-name, span.feed-shared-actor__name"
      )?.textContent?.trim() || "Unknown";
      const text = node.querySelector(
        "span.comments-comment-item__main-content, div.comments-comment-item-content, div.feed-shared-text"
      )?.textContent?.trim() || "";
      const timestamp = node.querySelector(
        "time, span.comments-comment-meta__description-text"
      )?.textContent?.trim() || "";
      if (text) comments.push({ author, text, timestamp });
    });
    return comments;
  });
}

module.exports = { scrapeComments, analyzeComments };
