import React, { useEffect, useState } from "react";
import { Activity, Cpu, Zap, Wifi, WifiOff, DollarSign } from "lucide-react";

const EXPERTS = [
  { id: "sherlock", name: "Sherlock", task: "Company OSINT" },
  { id: "feynman", name: "Feynman", task: "CV simplification" },
  { id: "seed", name: "Seed", task: "Icebreaker crafting" },
  { id: "paul", name: "Paul", task: "Post writing" },
  { id: "oscar", name: "Oscar", task: "Video script" },
  { id: "aristotle", name: "Aristotle", task: "Research synthesis" },
];

/**
 * Bottom status bar — always visible. Shows live MoE agent indicator,
 * n8n connectivity, AI cost ticker, and platform info.
 */
export function StatusBar({ activeExpert, n8n, usage }) {
  const expert = EXPERTS.find((e) => e.id === activeExpert) || null;
  const online = !!n8n?.connected;

  return (
    <div className="h-7 shrink-0 flex items-center justify-between border-t border-zinc-800 surface-glass-strong px-3 text-[11px] font-mono text-zinc-500 select-none relative z-10">
      <div className="flex items-center gap-4">
        {expert ? (
          <span className="flex items-center gap-1.5 text-linkedin-light">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse-glow" />
            <Cpu size={11} strokeWidth={1.7} />
            <span className="font-semibold">{expert.name}:</span>
            <span className="text-zinc-400">{expert.task}…</span>
          </span>
        ) : (
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-zinc-600" />
            <Cpu size={11} strokeWidth={1.7} />
            <span>Board · idle</span>
          </span>
        )}
        <span className="flex items-center gap-1.5">
          {online ? <Wifi size={11} strokeWidth={1.7} className="text-green-400" /> : <WifiOff size={11} strokeWidth={1.7} className="text-red-400" />}
          n8n {online ? "online" : "offline"}
        </span>
        {n8n?.queuedLeads > 0 && (
          <span className="flex items-center gap-1 text-yellow-400">
            <Activity size={11} strokeWidth={1.7} /> {n8n.queuedLeads} queued
          </span>
        )}
      </div>

      <div className="flex items-center gap-4">
        <span className="flex items-center gap-1.5">
          <Zap size={11} strokeWidth={1.7} /> {usage?.calls ?? 0} calls
        </span>
        <span className="flex items-center gap-1.5">
          <DollarSign size={11} strokeWidth={1.7} /> ${(usage?.costUsd ?? 0).toFixed(4)}
        </span>
        <span className="text-zinc-600">
          {window.colwork?.meta?.platform || "web"}
        </span>
      </div>
    </div>
  );
}

export default StatusBar;
