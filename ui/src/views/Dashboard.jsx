import React, { useEffect, useState } from "react";
import { Activity, Brain, Zap, Database, TrendingUp, Settings, Wifi, Key } from "lucide-react";
import { Skeleton, SkeletonCard } from "../components/Skeleton";

const ipc = typeof window !== "undefined" ? window.colwork : null;

function MetricCard({ label, value, sub, icon: Icon, accent = "linkedin" }) {
  const map = {
    linkedin: "text-linkedin-light border-l-linkedin",
    green: "text-green-400 border-l-green-400",
    amber: "text-amber-400 border-l-amber-400",
    zinc: "text-zinc-300 border-l-zinc-600",
  };
  return (
    <div className={`bg-zinc-900/60 border border-zinc-800 border-l-2 ${map[accent]} rounded-xl p-4 backdrop-blur-sm`}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] text-zinc-500 font-mono uppercase tracking-wider">{label}</p>
        {Icon && <Icon size={14} strokeWidth={1.7} className="text-zinc-600" />}
      </div>
      <p className="text-2xl font-bold text-white tabular-nums">{value}</p>
      {sub && <p className="text-[11px] text-zinc-500 mt-1 font-mono">{sub}</p>}
    </div>
  );
}

export default function Dashboard({ health }) {
  const u = health?.usage || {};
  const loading = !health;
  const [setup, setSetup] = useState(null);

  useEffect(() => {
    if (!ipc) return;
    ipc.engine.getSetupStatus().then(setup).catch(() => {});
  }, [health]);

  const needsSetup = setup && (!setup.configured?.n8n || !setup.configured?.deepseek);
  const envPath = setup?.envPath || "N/A";

  return (
    <div className="p-8 space-y-6 max-w-[1400px]">
      <div>
        <h2 className="text-2xl font-bold text-white tracking-tight">Dashboard</h2>
        <p className="text-sm text-zinc-500 mt-1">Real-time telemetry across the Mixture-of-Experts board.</p>
      </div>

      {/* First-boot setup banner */}
      {needsSetup && (
        <div className="bg-gradient-to-r from-amber-950/30 to-zinc-900/60 border border-amber-500/30 rounded-xl p-5 backdrop-blur-sm">
          <div className="flex items-start gap-3">
            <Settings size={20} strokeWidth={1.7} className="text-amber-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-amber-300">First-Boot Setup Required</h3>
              <p className="text-xs text-zinc-400 mt-1">
                Your <code className="text-linkedin-light bg-zinc-800/60 px-1 rounded">{envPath}</code> needs API keys.
                Open Settings → copy <code className="text-linkedin-light">.env.example</code> and fill in your keys.
              </p>
              <div className="flex flex-wrap gap-3 mt-3">
                <div className={`flex items-center gap-1.5 text-[11px] font-mono ${setup?.configured?.n8n ? "text-green-400" : "text-red-400"}`}>
                  {setup?.configured?.n8n ? <Wifi size={12} /> : <Wifi size={12} />}
                  n8n {setup?.configured?.n8n ? "configured" : "missing"}
                </div>
                <div className={`flex items-center gap-1.5 text-[11px] font-mono ${setup?.configured?.deepseek ? "text-green-400" : "text-red-400"}`}>
                  {setup?.configured?.deepseek ? <Key size={12} /> : <Key size={12} />}
                  DeepSeek {setup?.configured?.deepseek ? "configured" : "missing"}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {loading && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      )}

      {!loading && (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          label="n8n Cloud"
          value={health?.n8n?.connected ? "Online" : "Offline"}
          sub={health?.n8n?.baseUrl?.replace(/^https?:\/\//, "").slice(0, 28)}
          icon={Activity}
          accent={health?.n8n?.connected ? "green" : "amber"}
        />
        <MetricCard
          label="MoE Experts"
          value={health?.board?.active ?? 6}
          sub="board armed"
          icon={Brain}
        />
        <MetricCard
          label="AI Calls (run)"
          value={u.calls ?? 0}
          sub={`$${(u.costUsd ?? 0).toFixed(4)}`}
          icon={Zap}
          accent="amber"
        />
        <MetricCard
          label="Memory Actions"
          value={health?.memory?.totalActions ?? 0}
          sub="cumulative"
          icon={Database}
          accent="zinc"
        />
      </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-zinc-900/60 border border-zinc-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-zinc-200">Recent Activity</h3>
            <TrendingUp size={14} strokeWidth={1.7} className="text-zinc-600" />
          </div>
          <div className="space-y-1.5 max-h-96 overflow-y-auto pr-2">
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 py-1.5 border-b border-zinc-800/40">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-3 flex-1" />
                </div>
              ))
            ) : (health?.recentActivity || []).length > 0 ? (
              (health?.recentActivity || []).map((a, i) => (
                <div key={i} className="flex items-center gap-3 text-xs font-mono py-1.5 border-b border-zinc-800/40">
                  <span className="bg-zinc-800/80 px-1.5 py-0.5 rounded text-linkedin-light text-[10px] uppercase tracking-wider">{a.type}</span>
                  <span className="text-zinc-600 shrink-0 tabular-nums">{a.timestamp ? new Date(a.timestamp).toLocaleTimeString() : "—"}</span>
                  <span className="text-zinc-400 truncate flex-1">{a.summary}</span>
                </div>
              ))
            ) : (
              <p className="text-zinc-600 text-sm py-8 text-center">No activity yet — run a command to populate.</p>
            )}
          </div>
        </div>

        <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-zinc-200 mb-4">Mixture of Experts</h3>
          <div className="space-y-2 text-xs">
            {[
              { name: "Sherlock", role: "Company OSINT", color: "text-amber-400" },
              { name: "Feynman", role: "CV simplification", color: "text-linkedin-light" },
              { name: "Seed", role: "Icebreaker craft", color: "text-green-400" },
              { name: "Paul", role: "Post writer", color: "text-pink-400" },
              { name: "Oscar", role: "Video scripts", color: "text-violet-400" },
              { name: "Aristotle", role: "Research synth", color: "text-cyan-400" },
            ].map((e) => (
              <div key={e.name} className="flex items-center justify-between p-2.5 bg-zinc-950/60 rounded-lg border border-zinc-800/60">
                <div>
                  <p className={`font-semibold ${e.color}`}>{e.name}</p>
                  <p className="text-[10px] text-zinc-500 font-mono">{e.role}</p>
                </div>
                <span className="w-1.5 h-1.5 rounded-full bg-zinc-600" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
