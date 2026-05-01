"use strict";

/**
 * MCP Server — exposes Colwork tools via Model Context Protocol.
 *
 * Tools:
 *   get_profile_audit  — Run a LinkedIn profile audit via DeepSeek
 *   generate_post      — Generate a professional LinkedIn post on a topic
 *
 * The server is designed to be started via `node src/mcp/server.js` or
 * integrated into the main CLI as `colwork mcp`.
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", "..", ".env") });

// Lightweight MCP tool definitions (no heavy SDK dependency at import time)
const TOOL_DEFINITIONS = [
  {
    name: "get_profile_audit",
    description:
      "Run an AI audit comparing a LinkedIn profile to a target resume. " +
      "Returns 3 key differences, positioning analysis, and a recommendation.",
    inputSchema: {
      type: "object",
      properties: {
        linkedinUrl: {
          type: "string",
          description: "URL of the LinkedIn profile to audit",
        },
        resumeText: {
          type: "string",
          description: "Target resume content in Markdown format",
        },
      },
      required: ["linkedinUrl", "resumeText"],
    },
  },
  {
    name: "generate_post",
    description:
      "Generate a professional LinkedIn post on automation, AI, or e-commerce topics. " +
      "Returns the post text and suggested hashtags.",
    inputSchema: {
      type: "object",
      properties: {
        topic: {
          type: "string",
          description: "Topic for the post (e.g. 'AI agents in SMBs')",
        },
        tone: {
          type: "string",
          enum: ["inspirational", "technical", "thought-leadership"],
          description: "Tone of the post",
          default: "thought-leadership",
        },
      },
      required: ["topic"],
    },
  },
];

/**
 * Execute a tool call and return the result.
 * @param {string} toolName
 * @param {object} args
 * @returns {Promise<{content: Array<{type: string, text: string}>}>}
 */
async function executeTool(toolName, args) {
  switch (toolName) {
    case "get_profile_audit": {
      const { generatePost } = require("../ai");
      const prompt = `Audyt profilu LinkedIn vs CV:\nProfil: ${args.linkedinUrl}\nCV: ${args.resumeText}\nPodaj 3 kluczowe różnice i rekomendację.`;
      const text = await generatePost({ topic: prompt, tone: "thought-leadership", length: "short" });
      return { content: [{ type: "text", text }] };
    }

    case "generate_post": {
      const { generatePost } = require("../ai");
      const text = await generatePost({
        topic: args.topic,
        tone: args.tone || "thought-leadership",
      });
      return { content: [{ type: "text", text }] };
    }

    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

/**
 * Start the MCP server on stdio (for use with `kimi mcp add --transport stdio colwork -- node src/mcp/server.js`).
 */
async function startServer() {
  // Dynamic import to avoid loading SDK when not needed
  const { McpServer, StdioServerTransport } = require("@modelcontextprotocol/sdk/server/mcp.js");
  const { z } = require("zod");

  const server = new McpServer({
    name: "colwork",
    version: "2.0.0",
  });

  // Register tools
  server.registerTool(
    "get_profile_audit",
    {
      description: TOOL_DEFINITIONS[0].description,
      inputSchema: {
        linkedinUrl: z.string().describe("URL of the LinkedIn profile"),
        resumeText: z.string().describe("Target resume in Markdown"),
      },
    },
    async ({ linkedinUrl, resumeText }) => {
      return await executeTool("get_profile_audit", { linkedinUrl, resumeText });
    }
  );

  server.registerTool(
    "generate_post",
    {
      description: TOOL_DEFINITIONS[1].description,
      inputSchema: {
        topic: z.string().describe("Post topic"),
        tone: z.enum(["inspirational", "technical", "thought-leadership"]).optional().default("thought-leadership"),
      },
    },
    async ({ topic, tone }) => {
      return await executeTool("generate_post", { topic, tone });
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[mcp] Colwork MCP server running on stdio");
}

// CLI entry: node src/mcp/server.js
if (require.main === module) {
  startServer().catch((e) => {
    console.error("[mcp] Fatal:", e.message);
    process.exit(1);
  });
}

module.exports = { TOOL_DEFINITIONS, executeTool, startServer };
