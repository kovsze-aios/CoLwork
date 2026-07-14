"use strict";

// Academic State Engine v1.0 — Persistent project save/load for long-form writing.
// Each academic writing session has a .json state file in data/academic_projects/.

const path = require("path");
const fs = require("fs");

const PROJECTS_DIR = path.resolve(__dirname, "..", "..", "data", "academic_projects");

function ensureDir() {
  if (!fs.existsSync(PROJECTS_DIR)) fs.mkdirSync(PROJECTS_DIR, { recursive: true });
}

function projectPath(projectId) {
  return path.join(PROJECTS_DIR, `${projectId}.json`);
}

/**
 * @typedef {Object} AcademicProject
 * @property {string} projectId
 * @property {string} projectTitle
 * @property {string} createdAt
 * @property {string} updatedAt
 * @property {string[]} outline
 * @property {number} currentChapter
 * @property {"APA"|"Harvard"|"PN-ISO 690"} citationStyle
 * @property {string} lastContext — last ~1000 words generated
 * @property {string} fullText — complete accumulated text
 * @property {string[]} sources — file paths to ingested sources
 * @property {"academic"|"whitepaper"|"casestudy"} format
 * @property {string} [audience]
 * @property {number} [targetWords]
 */

const DEFAULT_PROJECT = () => ({
  projectId: `proj_${Date.now()}`,
  projectTitle: "Untitled Project",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  outline: [],
  currentChapter: 0,
  citationStyle: "APA",
  lastContext: "",
  fullText: "",
  sources: [],
  format: "academic",
  audience: "",
  targetWords: 2000,
});

function listProjects() {
  ensureDir();
  try {
    const files = fs.readdirSync(PROJECTS_DIR).filter((f) => f.endsWith(".json"));
    return files
      .map((f) => {
        try {
          const raw = fs.readFileSync(path.join(PROJECTS_DIR, f), "utf-8");
          const p = JSON.parse(raw);
          return {
            projectId: p.projectId,
            projectTitle: p.projectTitle,
            updatedAt: p.updatedAt,
            format: p.format,
            citationStyle: p.citationStyle,
            chapterCount: (p.outline || []).length,
            currentChapter: p.currentChapter || 0,
            wordCount: (p.fullText || "").split(/\s+/).filter(Boolean).length,
          };
        } catch {
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  } catch (e) {
    console.error("[academic_state] listProjects error:", e.message);
    return [];
  }
}

function loadProject(projectId) {
  ensureDir();
  const fp = projectPath(projectId);
  if (!fs.existsSync(fp)) return null;
  try {
    return JSON.parse(fs.readFileSync(fp, "utf-8"));
  } catch (e) {
    console.error(`[academic_state] loadProject(${projectId}) error:`, e.message);
    return null;
  }
}

function saveProject(project) {
  ensureDir();
  project.updatedAt = new Date().toISOString();
  if (!project.projectId) project.projectId = `proj_${Date.now()}`;
  if (!project.createdAt) project.createdAt = project.updatedAt;
  try {
    fs.writeFileSync(projectPath(project.projectId), JSON.stringify(project, null, 2), "utf-8");
    return { ok: true, projectId: project.projectId };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

function createProject(opts = {}) {
  const project = {
    ...DEFAULT_PROJECT(),
    ...opts,
    projectId: `proj_${Date.now()}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  return saveProject(project);
}

function deleteProject(projectId) {
  ensureDir();
  const fp = projectPath(projectId);
  if (!fs.existsSync(fp)) return { ok: false, error: "not_found" };
  try {
    fs.unlinkSync(fp);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Snapshot the last ~1000 words from generated text as continuation context.
 */
function snapshotContext(fullText) {
  if (!fullText) return "";
  const words = fullText.split(/\s+/).filter(Boolean);
  return words.slice(-1000).join(" ");
}

module.exports = {
  listProjects,
  loadProject,
  saveProject,
  createProject,
  deleteProject,
  snapshotContext,
  PROJECTS_DIR,
};
