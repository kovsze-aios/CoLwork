"use strict";

const chalk = require("chalk");
const boxen = require("boxen");

// ── CoLwork Brand Palette ────────────────────────────────────────────────────
const LINKEDIN_BLUE = "#0A66C2";
const BLUE = chalk.hex("#0A66C2");
const CYAN = chalk.hex("#22a7f0");
const WHITE = chalk.white;
const BOLD = chalk.bold;
const DIM = chalk.dim;
const GREEN = chalk.green;
const YELLOW = chalk.yellow;
const RED = chalk.red;
const GRAY = chalk.hex("#666666");

const ASCII_COLWORK = [
  "   ██████╗  ██████╗  ██╗         ██╗    ██╗  ██████╗  ██████╗  ██╗  ██╗",
  "  ██╔════╝ ██╔═══██╗ ██║         ██║    ██║ ██╔═══██╗ ██╔══██╗ ██║ ██╔╝",
  "  ██║      ██║   ██║ ██║         ██║ █╗ ██║ ██║   ██║ ██████╔╝ █████╔╝ ",
  "  ██║      ██║   ██║ ██║         ██║███╗██║ ██║   ██║ ██╔══██╗ ██╔═██╗ ",
  "  ╚██████╗ ╚██████╔╝ ███████╗    ╚███╔███╔╝ ╚██████╔╝ ██║  ██║ ██║  ██╗",
  "   ╚═════╝  ╚═════╝  ╚══════╝     ╚══╝╚══╝   ╚═════╝  ╚═╝  ╚═╝ ╚═╝  ╚═╝",
];

function renderAscii() {
  return ASCII_COLWORK.map((line) => BLUE(BOLD(line))).join("\n");
}

function renderSubtitle() {
  return DIM("Mixture of Experts Career Engine") + "  " + WHITE("|") + "  " + BLUE("v3.0");
}

function renderStatus() {
  const lines = [
    "",
    BOLD("MoE Board Status"),
    "",
    `  ${BLUE("●")} DeepSeek V4:        ${GREEN("ONLINE")}    ${DIM("(token-minimal • retry-adaptive)")}`,
    `  ${BLUE("●")} n8n Cloud:          ${GREEN("CONNECTED")} ${DIM("(Google Cloud Run EU-West3)")}`,
    `  ${BLUE("●")} Board Experts:      ${GREEN("5/5")}       ${DIM("(Feynman Sherlock Seed Paul Oscar)")}`,
    `  ${BLUE("●")} Stealth Browser:    ${GREEN("ARMED")}     ${DIM("(Ghost Cursor + Stealth Plugin)")}`,
    `  ${BLUE("●")} Memory Bank:        ${GREEN("ACTIVE")}    ${DIM("(data/memory.json)")}`,
    `  ${BLUE("●")} Google Workspace:   ${GREEN("SYNCED")}    ${DIM("(Docs + Sheets via n8n)")}`,
    "",
    `  ${DIM("Pipeline:")}  Sherlock → Seed → Feynman → n8n`,
    `  ${DIM("Content:")}   Paul (DevLogs) • Oscar (YouTube Shorts)`,
    "",
  ];
  return lines.join("\n");
}

function showWelcomeBanner() {
  const inner = [renderAscii(), "", renderSubtitle(), renderStatus()].join("\n");
  const banner = boxen(inner, {
    padding: { top: 1, bottom: 1, left: 3, right: 3 },
    margin: { top: 1, bottom: 1 },
    borderStyle: "double",
    borderColor: "blue",
    float: "center",
  });
  console.log(banner);
}

function showSection(title) {
  console.log("");
  console.log(BLUE("▎") + " " + BOLD(title));
  console.log(DIM("─".repeat(60)));
}

function showSuccess(msg) { console.log(`  ${GREEN("✓")} ${msg}`); }
function showWarn(msg) { console.log(`  ${YELLOW("⚠")} ${msg}`); }
function showError(msg) { console.log(`  ${RED("✗")} ${msg}`); }
function showInfo(msg) { console.log(`  ${BLUE("ℹ")} ${msg}`); }
function showDivider() { console.log(DIM("─".repeat(60))); }

function fmtScore(score) {
  const n = Number(score) || 0;
  if (n >= 80) return GREEN(`${n}`);
  if (n >= 60) return YELLOW(`${n}`);
  return RED(`${n}`);
}

function summary(label, value, color = BLUE) {
  return `  ${DIM(label.padEnd(18))} ${color(value)}`;
}

module.exports = {
  showWelcomeBanner, showSection,
  showSuccess, showWarn, showError, showInfo, showDivider,
  fmtScore, summary,
  BLUE, CYAN, DIM, GREEN, YELLOW, RED, GRAY, BOLD, WHITE,
};
