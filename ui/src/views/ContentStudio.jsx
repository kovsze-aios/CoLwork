import React, { useEffect, useState } from "react";
import { motion } from "../lib/motion-lite";
import {
  Sparkles,
  FileText,
  Video,
  Loader2,
  Copy,
  Check,
  Download,
  Folder,
  RefreshCw,
  AlertCircle,
  BookOpen,
  Plus,
  Save,
  FolderOpen,
  Trash2,
} from "lucide-react";
import { Skeleton, SkeletonLines } from "../components/Skeleton";
import { cn } from "../lib/cn";

const SUGGESTED_TOPICS = [
  "How automating ops freed me 15h/week",
  "Why prompt engineering is the most underrated skill of 2026",
  "5 processes every small business should automate first",
  "Building a hybrid e-commerce stack with Medusa.js + affiliates",
  "I shipped an AI agent that runs my whole shop end-to-end",
];

const TONES = [
  { id: "thought-leadership", label: "Thought leadership" },
  { id: "casual", label: "Casual" },
  { id: "technical", label: "Technical" },
  { id: "story", label: "Story-driven" },
];

export default function ContentStudio({ setActiveExpert }) {
  // Generation state
  const [topic, setTopic] = useState("");
  const [tone, setTone] = useState("thought-leadership");
  const [length, setLength] = useState("medium");
  const [mode, setMode] = useState("post"); // post | video
  const [seconds, setSeconds] = useState(60);
  const [running, setRunning] = useState(false);
  const [output, setOutput] = useState(null);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  // Publication archive
  const [archive, setArchive] = useState(null); // null = loading; [] = empty; [...] = items
  const [archiveError, setArchiveError] = useState(null);

  // Academic Projects (v11.0)
  const [academicProjects, setAcademicProjects] = useState(null);
  const [activeProject, setActiveProject] = useState(null);
  const [projectForm, setProjectForm] = useState({
    projectTitle: "",
    citationStyle: "APA",
    format: "academic",
    audience: "",
    targetWords: 2000,
  });
  const [projectSaving, setProjectSaving] = useState(false);
  const [outlineInput, setOutlineInput] = useState("");
  const [academicExpanded, setAcademicExpanded] = useState(false);

  const loadArchive = async () => {
    if (!window.colwork?.engine) {
      setArchive([]);
      return;
    }
    setArchive(null);
    setArchiveError(null);
    try {
      const res = await window.colwork.engine.listPublications();
      if (res?.ok) setArchive(res.items || []);
      else {
        setArchive([]);
        setArchiveError(res?.error || "Could not list publications");
      }
    } catch (e) {
      setArchive([]);
      setArchiveError(e.message);
    }
  };

  useEffect(() => { loadArchive(); }, []);

  // ── Academic Project Manager (v11.0) ────────────────────────
  const loadAcademicProjects = async () => {
    if (!window.colwork?.engine) { setAcademicProjects([]); return; }
    try {
      const res = await window.colwork.engine.academicListProjects();
      setAcademicProjects(res?.ok ? res.projects : []);
    } catch { setAcademicProjects([]); }
  };

  const handleCreateProject = async () => {
    if (!projectForm.projectTitle.trim()) return;
    const outline = outlineInput
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
    setProjectSaving(true);
    try {
      const res = await window.colwork.engine.academicCreateProject({
        ...projectForm,
        outline,
      });
      if (res?.ok) {
        const loaded = await window.colwork.engine.academicLoadProject(res.projectId);
        if (loaded?.ok) setActiveProject(loaded.project);
        await loadAcademicProjects();
        setAcademicExpanded(true);
      }
    } catch { /* ignore */ }
    setProjectSaving(false);
  };

  const handleLoadProject = async (projectId) => {
    try {
      const res = await window.colwork.engine.academicLoadProject(projectId);
      if (res?.ok) {
        setActiveProject(res.project);
        setAcademicExpanded(true);
      }
    } catch { /* ignore */ }
  };

  const handleSaveProject = async () => {
    if (!activeProject) return;
    setProjectSaving(true);
    try {
      // Snapshot last ~1000 words from fullText as context for next generation
      const words = (activeProject.fullText || "").split(/\s+/).filter(Boolean);
      const lastContext = words.slice(-1000).join(" ");
      const updated = { ...activeProject, lastContext };
      const res = await window.colwork.engine.academicSaveProject(updated);
      if (res?.ok) {
        setActiveProject(updated);
        await loadAcademicProjects();
      }
    } catch { /* ignore */ }
    setProjectSaving(false);
  };

  const handleDeleteProject = async (projectId) => {
    try {
      await window.colwork.engine.academicDeleteProject(projectId);
      if (activeProject?.projectId === projectId) setActiveProject(null);
      await loadAcademicProjects();
    } catch { /* ignore */ }
  };

  // Auto-load project list on mount
  useEffect(() => { loadAcademicProjects(); }, []);

  const generate = async () => {
    if (!topic.trim()) return;
    setRunning(true);
    setOutput(null);
    setError(null);
    // v10.0: Paul handles both posts and short-form video scripts (LinkedIn personal branding).
    setActiveExpert?.("paul");
    try {
      const res = mode === "video"
        ? await window.colwork.engine.generateVideoScript({ topic, lengthSec: seconds })
        : await window.colwork.engine.generatePost({ topic, tone, length });
      if (!res?.ok) {
        setError(res?.error || "Generation failed.");
      } else {
        setOutput(mode === "video" ? res.script : res.post);
      }
    } catch (e) {
      setError(e.message || "Unexpected error.");
    } finally {
      setActiveExpert?.(null);
      setRunning(false);
    }
  };

  const copyOutput = async () => {
    if (!output) return;
    try {
      await navigator.clipboard.writeText(output);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch { /* ignore */ }
  };

  const saveOutput = () => {
    if (!output) return;
    const ext = mode === "video" ? "script.md" : "post.md";
    const safeName = `${topic.slice(0, 40).replace(/[^\w\-]+/g, "_")}.${ext}`;
    window.colwork?.engine.saveDialog({ defaultPath: safeName, content: output });
  };

  return (
    <div className="p-8 space-y-6 max-w-[1400px]">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-3xl font-semibold tracking-tight leading-none flex items-center gap-3">
            <Sparkles size={26} strokeWidth={1.6} className="text-linkedin-light" />
            <span className="text-grad-heading">Content Studio</span>
          </h2>
          <p className="text-sm text-zinc-500 mt-2 tracking-wide">
            Generate LinkedIn posts and short-form video scripts. Browse your publication archive.
          </p>
        </div>
        <button
          onClick={loadArchive}
          className="btn-premium text-xs flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900/60 hover:bg-zinc-800/60 text-zinc-300 border border-white/5 rounded-lg backdrop-blur-md"
        >
          <RefreshCw size={12} /> Refresh archive
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── Generator ───────────────────────────────────────────────── */}
        <div className="bento-card rounded-2xl p-5 space-y-4 shadow-inner">
          {/* Mode tabs */}
          <div className="flex gap-1 p-1 bg-zinc-950 rounded-lg w-fit">
            {[
              { id: "post", label: "Post", icon: FileText },
              { id: "video", label: "Video script", icon: Video },
            ].map((m) => {
              const Icon = m.icon;
              return (
                <button
                  key={m.id}
                  onClick={() => setMode(m.id)}
                  className={cn(
                    "relative px-3 py-1.5 rounded-md text-xs font-medium transition flex items-center gap-1.5",
                    mode === m.id ? "text-white" : "text-zinc-500 hover:text-zinc-200",
                  )}
                >
                  {mode === m.id && (
                    <span className="absolute inset-0 rounded-md bg-linkedin/20 ring-1 ring-linkedin/40 transition-all" />
                  )}
                  <Icon size={12} className="relative z-10" />
                  <span className="relative z-10">{m.label}</span>
                </button>
              );
            })}
          </div>

          <label className="block">
            <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-mono">Topic *</span>
            <textarea
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="What do you want to say?"
              className="mt-1 w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:border-linkedin focus:ring-1 focus:ring-linkedin/30 outline-none transition h-20 resize-none"
            />
          </label>

          {/* Suggested topic chips */}
          <div className="flex flex-wrap gap-1.5">
            {SUGGESTED_TOPICS.map((t) => (
              <button
                key={t}
                onClick={() => setTopic(t)}
                className="text-[11px] px-2 py-1 bg-zinc-950 hover:bg-zinc-800/60 text-zinc-400 hover:text-white border border-zinc-800 rounded transition"
              >
                {t}
              </button>
            ))}
          </div>

          {mode === "post" ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-mono">Tone</span>
                <div className="mt-1 grid grid-cols-2 gap-1">
                  {TONES.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setTone(t.id)}
                      className={cn(
                        "text-[11px] px-2 py-1.5 rounded border transition",
                        tone === t.id
                          ? "bg-linkedin/15 text-linkedin-light border-linkedin/40"
                          : "bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-white",
                      )}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-mono">Length</span>
                <div className="mt-1 grid grid-cols-3 gap-1">
                  {["short", "medium", "long"].map((l) => (
                    <button
                      key={l}
                      onClick={() => setLength(l)}
                      className={cn(
                        "text-[11px] px-2 py-1.5 rounded border transition capitalize",
                        length === l
                          ? "bg-linkedin/15 text-linkedin-light border-linkedin/40"
                          : "bg-zinc-950 text-zinc-400 border-zinc-800 hover:text-white",
                      )}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div>
              <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-mono">
                Target length: <span className="text-zinc-300">{seconds}s</span>
              </span>
              <input
                type="range"
                min={15}
                max={180}
                step={5}
                value={seconds}
                onChange={(e) => setSeconds(Number(e.target.value))}
                className="w-full mt-1 accent-linkedin"
              />
              <div className="flex justify-between text-[10px] font-mono text-zinc-600 mt-0.5">
                <span>15s</span><span>60s</span><span>180s</span>
              </div>
            </div>
          )}

          <button
            onClick={generate}
            disabled={running || !topic.trim()}
            className={cn(
              "w-full text-white font-semibold py-2.5 rounded-lg flex items-center justify-center gap-2 shadow-lg shadow-linkedin/20",
              !running && topic.trim()
                ? "btn-premium bg-linkedin hover:bg-linkedin-dark"
                : "bg-zinc-800 text-zinc-600 cursor-not-allowed",
            )}
          >
            {running ? (
              <><Loader2 size={16} className="animate-spin" /> {mode === "video" ? "Paul is scripting…" : "Paul is writing…"}</>
            ) : (
              <><Sparkles size={16} /> {mode === "video" ? "Generate video script" : "Generate post"}</>
            )}
          </button>

          {/* Output */}
          {error && (
            <div className="p-3 bg-red-500/5 border border-red-500/20 rounded-lg flex items-start gap-2">
              <AlertCircle size={14} className="text-red-400 mt-0.5 shrink-0" />
              <p className="text-xs text-red-300">{error}</p>
            </div>
          )}

          {running && !output && (
            <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-4">
              <SkeletonLines count={6} />
            </div>
          )}

          {output && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-zinc-950 border border-zinc-800 rounded-lg p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-zinc-500 font-mono uppercase">
                  {mode === "video" ? "Script" : "Post"} · {output.length} chars
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={copyOutput}
                    className="btn-premium text-[11px] flex items-center gap-1 px-2 py-1 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-white/5 rounded"
                  >
                    {copied ? <><Check size={11} className="text-green-400" /> Copied</> : <><Copy size={11} /> Copy</>}
                  </button>
                  <button
                    onClick={saveOutput}
                    className="btn-premium text-[11px] flex items-center gap-1 px-2 py-1 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-white/5 rounded"
                  >
                    <Download size={11} /> Save
                  </button>
                </div>
              </div>
              <pre className="text-sm text-zinc-200 whitespace-pre-wrap leading-relaxed font-sans">{output}</pre>
            </motion.div>
          )}
        </div>

        {/* ── Publication archive ─────────────────────────────────────── */}
        <div className="bento-card rounded-2xl p-5 shadow-inner">
          <h3 className="text-sm font-semibold text-zinc-200 mb-4 flex items-center gap-2 tracking-tight">
            <Folder size={14} className="text-linkedin-light" />
            Publication archive
            {archive && archive.length > 0 && (
              <span className="text-[10px] font-mono text-zinc-500 ml-auto">{archive.length} files</span>
            )}
          </h3>

          {archive === null ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="p-3 bg-zinc-950 rounded-lg border border-zinc-800 space-y-2">
                  <Skeleton className="h-3 w-3/4" />
                  <Skeleton className="h-2 w-1/3" />
                </div>
              ))}
            </div>
          ) : archive.length === 0 ? (
            <div className="border border-dashed border-white/10 rounded-xl p-8 text-center">
              <FileText size={28} className="text-zinc-700 mx-auto mb-2" strokeWidth={1.5} />
              <p className="text-sm text-zinc-500">No publications yet.</p>
              <p className="text-xs text-zinc-600 mt-1 font-mono">
                Generated PDFs and posts land in <code>data/publications/</code>.
              </p>
              {archiveError && <p className="text-xs text-red-400 mt-2">{archiveError}</p>}
            </div>
          ) : (
            <ul className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
              {archive.map((it) => (
                <li
                  key={it.filename}
                  className="p-3 bg-zinc-950 rounded-lg border border-zinc-800 hover:border-linkedin/40 transition group"
                >
                  <div className="flex items-start gap-2">
                    <span
                      className={cn(
                        "shrink-0 mt-0.5 px-1.5 py-0.5 rounded text-[10px] font-mono uppercase border",
                        it.ext === "pdf"
                          ? "bg-rose-500/10 text-rose-300 border-rose-500/30"
                          : "bg-linkedin/10 text-linkedin-light border-linkedin/30",
                      )}
                    >
                      {it.ext}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-zinc-200 truncate">{it.filename}</p>
                      <p className="text-[10px] text-zinc-600 font-mono mt-0.5">
                        {(it.sizeBytes / 1024).toFixed(1)} KB · {new Date(it.modifiedAt).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* ── Academic Project Manager (v11.0) ───────────────────── */}
      <div className="bento-card rounded-2xl p-5 shadow-inner">
        <button
          onClick={() => setAcademicExpanded(!academicExpanded)}
          className="w-full flex items-center justify-between text-left"
        >
          <h3 className="text-sm font-semibold text-zinc-200 flex items-center gap-2 tracking-tight">
            <BookOpen size={14} className="text-linkedin-light" />
            Academic Projects
            {academicProjects && academicProjects.length > 0 && (
              <span className="text-[10px] font-mono text-zinc-500">{academicProjects.length} project{academicProjects.length !== 1 ? "s" : ""}</span>
            )}
          </h3>
          <span className="text-[10px] font-mono text-zinc-600">
            {academicExpanded ? "collapse ▲" : "expand ▼"}
          </span>
        </button>

        {academicExpanded && (
          <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left: Project list + Create form */}
            <div className="space-y-4">
              {/* Create new project */}
              <div className="bg-zinc-950/60 rounded-xl p-4 border border-zinc-800/70 space-y-3">
                <p className="text-[10px] text-zinc-500 font-mono uppercase tracking-wider flex items-center gap-1.5">
                  <Plus size={10} /> New Project
                </p>
                <input
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:border-linkedin focus:ring-1 focus:ring-linkedin/30 outline-none transition"
                  placeholder="Project title (e.g., PhD Chapter 3 — Literature Review)"
                  value={projectForm.projectTitle}
                  onChange={(e) => setProjectForm({ ...projectForm, projectTitle: e.target.value })}
                />
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-[9px] text-zinc-600 font-mono uppercase">Citation Style</span>
                    <select
                      className="mt-0.5 w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:border-linkedin outline-none"
                      value={projectForm.citationStyle}
                      onChange={(e) => setProjectForm({ ...projectForm, citationStyle: e.target.value })}
                    >
                      <option value="APA">APA</option>
                      <option value="Harvard">Harvard</option>
                      <option value="PN-ISO 690">PN-ISO 690</option>
                    </select>
                  </div>
                  <div>
                    <span className="text-[9px] text-zinc-600 font-mono uppercase">Format</span>
                    <select
                      className="mt-0.5 w-full bg-zinc-950 border border-zinc-800 rounded-lg px-2 py-1.5 text-xs text-zinc-200 focus:border-linkedin outline-none"
                      value={projectForm.format}
                      onChange={(e) => setProjectForm({ ...projectForm, format: e.target.value })}
                    >
                      <option value="academic">Academic</option>
                      <option value="whitepaper">Whitepaper</option>
                      <option value="casestudy">Case Study</option>
                    </select>
                  </div>
                </div>
                <input
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-100 placeholder-zinc-600 focus:border-linkedin outline-none transition"
                  placeholder="Outline (comma-separated chapters)"
                  value={outlineInput}
                  onChange={(e) => setOutlineInput(e.target.value)}
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-100 placeholder-zinc-600 focus:border-linkedin outline-none transition"
                    placeholder="Target audience"
                    value={projectForm.audience}
                    onChange={(e) => setProjectForm({ ...projectForm, audience: e.target.value })}
                  />
                  <input
                    type="number"
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-100 placeholder-zinc-600 focus:border-linkedin outline-none transition"
                    placeholder="Target words"
                    value={projectForm.targetWords}
                    onChange={(e) => setProjectForm({ ...projectForm, targetWords: Number(e.target.value) || 2000 })}
                  />
                </div>
                <button
                  onClick={handleCreateProject}
                  disabled={projectSaving || !projectForm.projectTitle.trim()}
                  className={cn(
                    "w-full text-white font-medium py-2 rounded-lg flex items-center justify-center gap-2 transition",
                    !projectSaving && projectForm.projectTitle.trim()
                      ? "btn-premium bg-linkedin hover:bg-linkedin-dark"
                      : "bg-zinc-800 text-zinc-600 cursor-not-allowed",
                  )}
                >
                  {projectSaving ? (
                    <><Loader2 size={14} className="animate-spin" /> Creating…</>
                  ) : (
                    <><Plus size={14} /> Create New Project</>
                  )}
                </button>
              </div>

              {/* Existing projects */}
              <div>
                <p className="text-[10px] text-zinc-500 font-mono uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <FolderOpen size={10} /> Saved Projects
                </p>
                {academicProjects === null ? (
                  <div className="space-y-2">
                    {Array.from({ length: 2 }).map((_, i) => (
                      <div key={i} className="p-3 bg-zinc-950 rounded-lg border border-zinc-800 animate-pulse">
                        <div className="h-3 bg-zinc-800 rounded w-2/3 mb-2" />
                        <div className="h-2 bg-zinc-800 rounded w-1/3" />
                      </div>
                    ))}
                  </div>
                ) : academicProjects.length === 0 ? (
                  <p className="text-xs text-zinc-600 font-mono p-4 text-center border border-dashed border-white/10 rounded-lg">
                    No projects yet. Create one above.
                  </p>
                ) : (
                  <ul className="space-y-1.5 max-h-[300px] overflow-y-auto">
                    {academicProjects.map((p) => (
                      <li
                        key={p.projectId}
                        className={cn(
                          "flex items-center gap-3 p-3 rounded-lg border transition group",
                          activeProject?.projectId === p.projectId
                            ? "bg-linkedin/10 border-linkedin/30"
                            : "bg-zinc-950 border-zinc-800 hover:border-linkedin/30",
                        )}
                      >
                        <button
                          onClick={() => handleLoadProject(p.projectId)}
                          className="flex-1 text-left min-w-0"
                        >
                          <p className="text-sm text-zinc-200 truncate">{p.projectTitle}</p>
                          <p className="text-[10px] text-zinc-600 font-mono mt-0.5">
                            {p.format} · {p.citationStyle} · {p.chapterCount} ch · {p.wordCount.toLocaleString()} words
                          </p>
                        </button>
                        <button
                          onClick={() => handleDeleteProject(p.projectId)}
                          className="shrink-0 p-1.5 rounded text-zinc-600 hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition"
                          title="Delete project"
                        >
                          <Trash2 size={13} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* Right: Active project state */}
            <div className="bg-zinc-950/60 rounded-xl p-4 border border-zinc-800/70">
              {activeProject ? (
                <div className="space-y-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-semibold text-white">{activeProject.projectTitle}</p>
                      <p className="text-[10px] text-zinc-500 font-mono mt-0.5">
                        {activeProject.format} · {activeProject.citationStyle} · {activeProject.projectId}
                      </p>
                    </div>
                    <button
                      onClick={handleSaveProject}
                      disabled={projectSaving}
                      className="btn-premium text-[11px] flex items-center gap-1.5 px-3 py-1.5 bg-linkedin/10 hover:bg-linkedin/20 text-linkedin-light border border-linkedin/30 rounded-lg transition"
                    >
                      {projectSaving ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <Save size={12} />
                      )}
                      Save
                    </button>
                  </div>

                  {/* Project state overview */}
                  <div className="grid grid-cols-4 gap-2 text-center">
                    {[
                      { label: "Chapters", value: (activeProject.outline || []).length },
                      { label: "Current Ch.", value: (activeProject.currentChapter || 0) + 1 },
                      { label: "Words", value: (activeProject.fullText || "").split(/\s+/).filter(Boolean).length.toLocaleString() },
                      { label: "Sources", value: (activeProject.sources || []).length },
                    ].map((s) => (
                      <div key={s.label} className="bg-zinc-950 rounded-lg p-2 border border-zinc-800">
                        <p className="text-[9px] text-zinc-500 font-mono uppercase">{s.label}</p>
                        <p className="text-sm font-bold text-zinc-200 tabular-nums">{s.value}</p>
                      </div>
                    ))}
                  </div>

                  {/* Outline */}
                  {(activeProject.outline || []).length > 0 && (
                    <div>
                      <p className="text-[9px] text-zinc-500 font-mono uppercase mb-1.5">Outline</p>
                      <ol className="space-y-1">
                        {activeProject.outline.map((ch, i) => (
                          <li
                            key={i}
                            className={cn(
                              "text-xs pl-3 border-l-2 py-0.5",
                              i === activeProject.currentChapter
                                ? "border-linkedin text-linkedin-light font-medium"
                                : "border-zinc-800 text-zinc-400",
                            )}
                          >
                            {i + 1}. {ch}
                            {i === activeProject.currentChapter && (
                              <span className="ml-2 text-[9px] font-mono text-linkedin-light/70">← current</span>
                            )}
                          </li>
                        ))}
                      </ol>
                    </div>
                  )}

                  {/* Last context */}
                  {activeProject.lastContext && (
                    <div>
                      <p className="text-[9px] text-zinc-500 font-mono uppercase mb-1">Continuation Context (last ~1K words)</p>
                      <div className="bg-zinc-950 rounded-lg p-3 border border-zinc-800 max-h-32 overflow-y-auto">
                        <p className="text-xs text-zinc-500 leading-relaxed font-mono">
                          {activeProject.lastContext.slice(-300)}…
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center gap-2 text-[10px] font-mono text-zinc-600">
                    <BookOpen size={10} />
                    State auto-loaded before AI generation — flawless continuation
                  </div>
                </div>
              ) : (
                <div className="h-full flex items-center justify-center py-12">
                  <div className="text-center">
                    <BookOpen size={28} className="text-zinc-700 mx-auto mb-2" strokeWidth={1.5} />
                    <p className="text-sm text-zinc-500">No project loaded.</p>
                    <p className="text-xs text-zinc-600 mt-1 font-mono">Create or select a project to begin.</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
