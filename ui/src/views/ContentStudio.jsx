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
          <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <Sparkles size={22} strokeWidth={1.7} className="text-linkedin-light" />
            Content Studio
          </h2>
          <p className="text-sm text-zinc-500 mt-1">
            Generate LinkedIn posts and short-form video scripts. Browse your publication archive.
          </p>
        </div>
        <button
          onClick={loadArchive}
          className="text-xs flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900/60 hover:bg-zinc-800/60 text-zinc-300 border border-zinc-800 rounded-lg transition backdrop-blur-sm"
        >
          <RefreshCw size={12} /> Refresh archive
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── Generator ───────────────────────────────────────────────── */}
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-5 space-y-4 backdrop-blur-sm">
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
            className="w-full bg-linkedin hover:bg-linkedin-dark disabled:bg-zinc-800 disabled:text-zinc-600 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-lg transition-all flex items-center justify-center gap-2 shadow-lg shadow-linkedin/10"
          >
            {running ? (
              <><Loader2 size={16} className="animate-spin" /> {mode === "video" ? "Oscar is scripting…" : "Paul is writing…"}</>
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
                    className="text-[11px] flex items-center gap-1 px-2 py-1 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 rounded transition"
                  >
                    {copied ? <><Check size={11} className="text-green-400" /> Copied</> : <><Copy size={11} /> Copy</>}
                  </button>
                  <button
                    onClick={saveOutput}
                    className="text-[11px] flex items-center gap-1 px-2 py-1 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border border-zinc-800 rounded transition"
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
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-5 backdrop-blur-sm">
          <h3 className="text-sm font-semibold text-zinc-200 mb-4 flex items-center gap-2">
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
            <div className="border border-dashed border-zinc-800 rounded-lg p-8 text-center">
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
    </div>
  );
}
