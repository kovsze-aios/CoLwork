import React from "react";
import {
  LayoutDashboard,
  Briefcase,
  FlaskConical,
  Sparkles,
  Terminal,
  Settings,
  Github,
} from "lucide-react";
import { LogoMark } from "./Logo";
import { cn } from "../lib/cn";

const NAV = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, hint: "System health & telemetry" },
  { id: "jobs", label: "Job Hunter", icon: Briefcase, hint: "Tailored CV + cover letter" },
  { id: "research", label: "Research Lab", icon: FlaskConical, hint: "RAG-powered profile optimizer" },
  { id: "content", label: "Content Studio", icon: Sparkles, hint: "Posts, scripts & publication archive" },
  { id: "terminal", label: "Terminal", icon: Terminal, hint: "Native shell" },
];

export function Sidebar({ active, setActive }) {
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
        <button
          onClick={() => window.colwork?.engine.openExternal("https://github.com/yourname/colwork")}
          title="GitHub"
          className="h-11 w-full grid place-items-center rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800/40 transition"
        >
          <Github size={18} strokeWidth={1.7} />
        </button>
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
