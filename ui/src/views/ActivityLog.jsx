import React, { useEffect, useState } from "react";
import {
  History,
  Briefcase,
  UserCheck,
  Sparkles,
  RefreshCw,
  AlertCircle,
  FileText,
  CheckCircle2,
  Inbox,
} from "lucide-react";
import { cn } from "../lib/cn";
import { Skeleton } from "../components/Skeleton";

/**
 * v10.0 — Activity Log
 *
 * Single timeline of everything the operator has done across the three
 * mission-critical surfaces: Job Hunter, Profile Optimizer, Content Studio.
 * Lives at the landing route — replaces the old generic "Dashboard".
 *
 * Source of truth: `engine.activityFeed()` merges `data/memory.json` actions
 * with `data/publications/` files into a single time-sorted array, and
 * returns aggregate counts.
 */

const FILTERS = [
  { id: "all", label: "All", icon: History, accent: "linkedin" },
  { id: "job", label: "Jobs", icon: Briefcase, accent: "linkedin" },
  { id: "profile", label: "Profile", icon: UserCheck, accent: "amber" },
  { id: "content", label: "Content", icon: Sparkles, accent: "violet" },
];

const ACCENT_CLASSES = {
  linkedin: "bg-linkedin/10 text-linkedin-light border-linkedin/30",
  amber: "bg-amber-500/10 text-amber-300 border-amber-500/30",
  violet: "bg-violet-500/10 text-violet-300 border-violet-500/30",
};

// Human-readable labels for the raw memory.json action.type values.
const ACTION_LABELS = {
  job_apply: "Application sent",
  job_apply_queued: "Application queued (offline)",
  board_pipeline_complete: "Board pipeline completed",
  board_feynman: "Feynman tailored the resume",
  board_seed: "Seed drafted outreach",
  audit: "Profile audit completed",
  profile_optimize: "Profile rebuilt",
  profile_optimize_queued: "Profile rebuild queued",
  board_optimize_complete: "Profile pipeline completed",
  board_feynman_optimize: "Feynman scored profile",
  board_seed_optimize: "Seed found positioning angle",
  visual_audit: "Visual audit",
  post_published: "Post published to LinkedIn",
  post_generated: "Post drafted",
  video_script_generated: "Video script generated",
  aggregate_post: "Aggregator post created",
  publication: "Publication archived",
};

function ActivityIcon({ category, className }) {
  const Icon = category === "job" ? Briefcase
    : category === "profile" ? UserCheck
    : Sparkles;
  return <Icon size={14} strokeWidth={1.7} className={className} />;
}

function summarizeItem(item) {
  if (item.type === "publication") {
    const p = item.payload || {};
    return `${p.filename} · ${(p.sizeBytes / 1024).toFixed(1)} KB`;
  }
  const p = item.payload || {};
  if (p.company && p.jobTitle) return `${p.jobTitle} @ ${p.company}`;
  if (p.goal) return `Goal: ${p.goal.slice(0, 80)}`;
  if (p.topic) return `Topic: ${p.topic.slice(0, 80)}`;
  if (p.profile) return `Profile: ${p.profile}`;
  const summary = JSON.stringify(p);
  return summary.length > 90 ? summary.slice(0, 90) + "…" : summary;
}

export default function ActivityLog() {
  const [feed, setFeed] = useState(null); // null=loading, {ok, items, counts}
  const [filter, setFilter] = useState("all");

  const load = async () => {
    if (!window.colwork?.engine?.activityFeed) {
      setFeed({ ok: false, error: "Engine offline" });
      return;
    }
    setFeed(null);
    try {
      const res = await window.colwork.engine.activityFeed();
      setFeed(res);
    } catch (e) {
      setFeed({ ok: false, error: e.message });
    }
  };

  useEffect(() => { load(); }, []);

  const items = feed?.items || [];
  const filtered = filter === "all" ? items : items.filter((i) => i.category === filter);
  const counts = feed?.counts || { jobs: 0, profile: 0, content: 0, total: 0 };

  return (
    <div className="p-8 space-y-6 max-w-[1400px]">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <History size={22} strokeWidth={1.7} className="text-linkedin-light" />
            Activity Log
          </h2>
          <p className="text-sm text-zinc-500 mt-1">
            Unified timeline of jobs applied, profile rebuilds, and content shipped.
          </p>
        </div>
        <button
          onClick={load}
          className="text-xs flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900/60 hover:bg-zinc-800/60 text-zinc-300 border border-zinc-800 rounded-lg transition backdrop-blur-sm"
        >
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {/* Counters */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <CountCard label="Jobs touched" value={counts.jobs} icon={Briefcase} accent="linkedin" loading={!feed} />
        <CountCard label="Profile rebuilds" value={counts.profile} icon={UserCheck} accent="amber" loading={!feed} />
        <CountCard label="Content shipped" value={counts.content} icon={Sparkles} accent="violet" loading={!feed} />
        <CountCard label="Total events" value={counts.total} icon={History} accent="zinc" loading={!feed} />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-1 p-1 bg-zinc-950 border border-zinc-800 rounded-lg w-fit">
        {FILTERS.map((f) => {
          const Icon = f.icon;
          const isActive = filter === f.id;
          return (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={cn(
                "px-3 py-1.5 rounded-md text-xs font-medium transition flex items-center gap-1.5",
                isActive
                  ? "bg-zinc-800 text-white"
                  : "text-zinc-500 hover:text-zinc-200",
              )}
            >
              <Icon size={12} />
              {f.label}
            </button>
          );
        })}
      </div>

      {/* Feed */}
      <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl backdrop-blur-sm overflow-hidden">
        {feed === null ? (
          <ul className="divide-y divide-zinc-800/60">
            {Array.from({ length: 6 }).map((_, i) => (
              <li key={i} className="p-4 flex items-center gap-3">
                <Skeleton className="h-8 w-8 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3 w-1/3" />
                  <Skeleton className="h-2 w-2/3" />
                </div>
                <Skeleton className="h-3 w-16" />
              </li>
            ))}
          </ul>
        ) : feed?.ok === false ? (
          <div className="p-8 flex flex-col items-center text-center gap-2">
            <AlertCircle size={28} className="text-amber-400" />
            <p className="text-sm text-zinc-200">Could not load activity feed.</p>
            <p className="text-xs text-zinc-500 font-mono">{feed.error}</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 flex flex-col items-center text-center gap-2">
            <Inbox size={36} className="text-zinc-700" strokeWidth={1.5} />
            <p className="text-sm text-zinc-400">
              {filter === "all" ? "No activity yet." : `No ${filter} events yet.`}
            </p>
            <p className="text-xs text-zinc-600 font-mono">
              Run something from Job Hunter / Profile Optimizer / Content Studio — it lands here.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-zinc-800/60 max-h-[60vh] overflow-y-auto">
            {filtered.map((item, i) => (
              <li key={i} className="p-4 flex items-start gap-3 hover:bg-zinc-900/30 transition">
                <span
                  className={cn(
                    "shrink-0 w-8 h-8 rounded-full grid place-items-center border",
                    ACCENT_CLASSES[
                      item.category === "job" ? "linkedin"
                      : item.category === "profile" ? "amber"
                      : "violet"
                    ],
                  )}
                >
                  <ActivityIcon category={item.category} />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm text-zinc-100 font-medium truncate">
                      {ACTION_LABELS[item.type] || item.type}
                    </p>
                    {item.type === "job_apply" && (
                      <CheckCircle2 size={12} className="text-green-400 shrink-0" />
                    )}
                    {item.type === "publication" && (
                      <FileText size={12} className="text-zinc-500 shrink-0" />
                    )}
                  </div>
                  <p className="text-xs text-zinc-500 font-mono mt-0.5 truncate">
                    {summarizeItem(item)}
                  </p>
                </div>
                <span className="shrink-0 text-[11px] text-zinc-600 font-mono tabular-nums">
                  {item.timestamp ? new Date(item.timestamp).toLocaleString() : "—"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function CountCard({ label, value, icon: Icon, accent, loading }) {
  const accentClasses = {
    linkedin: "border-l-linkedin text-linkedin-light",
    amber: "border-l-amber-400 text-amber-300",
    violet: "border-l-violet-400 text-violet-300",
    zinc: "border-l-zinc-600 text-zinc-300",
  };
  return (
    <div className={cn(
      "bg-zinc-900/60 border border-zinc-800 border-l-2 rounded-xl p-4 backdrop-blur-sm",
      accentClasses[accent],
    )}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] text-zinc-500 font-mono uppercase tracking-wider">{label}</p>
        <Icon size={14} strokeWidth={1.7} className="text-zinc-600" />
      </div>
      {loading ? (
        <Skeleton className="h-7 w-12" />
      ) : (
        <p className="text-2xl font-bold text-white tabular-nums">{value ?? 0}</p>
      )}
    </div>
  );
}
