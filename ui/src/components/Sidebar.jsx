import React, { useEffect, useState } from "react";
import {
  Briefcase,
  UserCheck,
  Sparkles,
  History,
  Terminal,
  Settings,
  Github,
  Coffee,
  ArrowDownToLine,
  Loader2,
} from "lucide-react";
import { LogoMark } from "./Logo";
import { cn } from "../lib/cn";

const ipc = typeof window !== "undefined" ? window.colwork : null;

// v10.0 navigation — strictly LinkedIn / Job Hunter focus.
// Dashboard removed (rolled into Activity Log). Research Lab renamed to Profile Optimizer.
const NAV = [
  { id: "jobs", label: "Job Hunter", icon: Briefcase, hint: "Paste a job → tailored CV + cover letter + outreach" },
  { id: "profile", label: "Profile Optimizer", icon: UserCheck, hint: "Audit & rebuild your LinkedIn for a target role" },
  { id: "content", label: "Content Studio", icon: Sparkles, hint: "Posts & video scripts for personal branding" },
  { id: "activity", label: "Activity Log", icon: History, hint: "Applied jobs + generated content, unified" },
  { id: "terminal", label: "Terminal", icon: Terminal, hint: "Native shell" },
];

export function Sidebar({ active, setActive }) {
  const [updateState, setUpdateState] = useState("idle"); // idle | checking | available | downloading | downloaded
  const [updateProgress, setUpdateProgress] = useState(0);

  useEffect(() => {
    if (!ipc?.updater) return;
    const cleanups = [
      ipc.updater.onChecking(() => setUpdateState("checking")),
      ipc.updater.onAvailable(() => setUpdateState("available")),
      ipc.updater.onNotAvailable(() => setUpdateState("idle")),
      ipc.updater.onProgress((p) => {
        setUpdateState("downloading");
        setUpdateProgress(p.percent || 0);
      }),
      ipc.updater.onDownloaded(() => setUpdateState("downloaded")),
      ipc.updater.onError(() => setUpdateState("idle")),
    ];
    return () => cleanups.forEach((c) => c?.());
  }, []);

  const handleGithubClick = () => {
    if (updateState === "downloaded") {
      ipc?.updater.install();
    } else {
      ipc?.engine.openExternal("https://github.com/kovsze-aios/Colwork");
    }
  };

  const handleCoffeeClick = () => {
    ipc?.engine.openExternal("https://buycoffee.to/sportnotes.ai");
  };

  const updateTooltip = () => {
    switch (updateState) {
      case "checking": return "Checking for updates…";
      case "available": return "Update available — downloading…";
      case "downloading": return `Downloading ${Math.round(updateProgress)}%`;
      case "downloaded": return "Restart & Install update";
      default: return "GitHub";
    }
  };

  return (
    <aside className="w-16 shrink-0 surface-glass border-r border-zinc-800/70 flex flex-col items-center py-3 relative z-10">
      <div className="mb-4">
        <LogoMark size={28} />
      </div>

      <nav className="flex-1 flex flex-col gap-1.5 w-full px-2">
        {NAV.map((item) => {
          const Icon = item.icon;
          const isActive = active === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActive(item.id)}
              title={`${item.label} — ${item.hint}`}
              className={cn(
                "group relative h-11 w-full grid place-items-center rounded-lg transition-colors",
                isActive
                  ? "text-linkedin-light"
                  : "text-zinc-500 hover:text-white hover:bg-zinc-800/40",
              )}
            >
              {isActive && (
                <span className="absolute inset-0 rounded-lg bg-linkedin/15 ring-1 ring-linkedin/30 shadow-[0_0_18px_rgba(10,102,194,0.25)] transition-opacity" />
              )}
              {isActive && (
                <span className="absolute left-0 top-2 bottom-2 w-[2px] rounded-r bg-linkedin" />
              )}
              <Icon size={18} strokeWidth={1.7} className="relative z-10" />

              {/* Hover tooltip */}
              <span className="pointer-events-none absolute left-full ml-2 whitespace-nowrap rounded-md surface-glass-strong border border-zinc-700/70 px-2 py-1 text-[11px] text-zinc-200 opacity-0 translate-x-[-4px] group-hover:opacity-100 group-hover:translate-x-0 transition-all z-50 shadow-xl">
                {item.label}
              </span>
            </button>
          );
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-1.5 w-full px-2">
        {/* GitHub / OTA updater button */}
        <button
          onClick={handleGithubClick}
          title={updateTooltip()}
          className={cn(
            "h-11 w-full grid place-items-center rounded-lg transition relative",
            updateState === "downloaded"
              ? "text-green-400 bg-green-500/10 ring-1 ring-green-500/40 animate-pulse-glow"
              : updateState === "downloading"
              ? "text-linkedin-light bg-linkedin/10"
              : updateState === "available" || updateState === "checking"
              ? "text-linkedin-light"
              : "text-zinc-500 hover:text-white hover:bg-zinc-800/40",
          )}
        >
          {updateState === "downloading" ? (
            <>
              <Loader2 size={18} strokeWidth={1.7} className="animate-spin" />
              <span className="absolute -bottom-0.5 text-[8px] font-mono text-linkedin-light">
                {Math.round(updateProgress)}%
              </span>
            </>
          ) : updateState === "downloaded" ? (
            <ArrowDownToLine size={18} strokeWidth={1.7} />
          ) : (
            <Github size={18} strokeWidth={1.7} />
          )}
        </button>

        {/* Buy Me a Coffee */}
        <button
          onClick={handleCoffeeClick}
          title="Buy Me a Coffee"
          className="h-11 w-full grid place-items-center rounded-lg text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 transition"
        >
          <Coffee size={18} strokeWidth={1.7} />
        </button>

        {/* Settings */}
        <button
          onClick={() => setActive("settings")}
          title="Settings"
          className={cn(
            "h-11 w-full grid place-items-center rounded-lg transition",
            active === "settings"
              ? "bg-linkedin/15 text-linkedin-light ring-1 ring-linkedin/30"
              : "text-zinc-500 hover:text-white hover:bg-zinc-800/40",
          )}
        >
          <Settings size={18} strokeWidth={1.7} />
        </button>
      </div>
    </aside>
  );
}

export default Sidebar;
