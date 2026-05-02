import React, { useState } from "react";
import { UserCheck, Sparkles, TrendingUp, TrendingDown, Loader2, AlertCircle, Hash, Lightbulb } from "lucide-react";

export default function ProfileOptimizer({ setActiveExpert }) {
  const [form, setForm] = useState({
    currentHeadline: "",
    currentAbout: "",
    skillsRaw: "",
    goal: "",
    language: "pl",
  });
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const submit = async () => {
    if (!form.goal) return;
    setRunning(true);
    setResult(null);
    setError(null);
    setActiveExpert?.("aristotle");
    try {
      const skills = form.skillsRaw
        .split(/[,\n]/)
        .map((s) => s.trim())
        .filter(Boolean);
      const res = await window.colwork.engine.optimizeProfile({
        currentHeadline: form.currentHeadline,
        currentAbout: form.currentAbout,
        currentSkills: skills,
        goal: form.goal,
        language: form.language,
      });
      if (!res || res.queued) {
        setError(res?.queued ? "Cloud unreachable — request queued." : "No response from engine.");
      } else if (res.ok === false) {
        setError(res.error || "Optimization failed.");
      } else {
        setResult(res);
      }
    } catch (e) {
      setError(e.message || "Unexpected error.");
    } finally {
      setActiveExpert?.(null);
      setRunning(false);
    }
  };

  const Delta = ({ before, after, label }) => {
    const d = (after ?? 0) - (before ?? 0);
    const positive = d >= 0;
    return (
      <div className="bg-zinc-950 border border-zinc-800 rounded-lg p-3">
        <p className="text-[10px] text-zinc-500 font-mono uppercase mb-1">{label}</p>
        <div className="flex items-baseline gap-2">
          <span className="text-zinc-600 tabular-nums">{before ?? 0}</span>
          <span className="text-zinc-700">→</span>
          <span className="text-white font-bold tabular-nums">{after ?? 0}</span>
          <span className={`ml-auto text-xs flex items-center gap-1 tabular-nums ${positive ? "text-green-400" : "text-red-400"}`}>
            {positive ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
            {positive ? "+" : ""}{d}
          </span>
        </div>
      </div>
    );
  };

  return (
    <div className="p-8 space-y-6 animate-slide-in max-w-[1400px]">
      <div>
        <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
          <UserCheck size={22} strokeWidth={1.7} className="text-linkedin-light" />
          Profile Optimizer
        </h2>
        <p className="text-sm text-zinc-500 mt-1">Aristotle audits your current profile against a target role — rebuilds headline, About, skills, and content angles in one call.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Form */}
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-5 space-y-3">
          <label className="block">
            <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-mono">Goal *</span>
            <textarea
              className="mt-1 w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:border-linkedin focus:ring-1 focus:ring-linkedin/30 outline-none transition h-20 resize-none"
              placeholder="Where do you want to be in 6 months? (the more specific, the better)"
              value={form.goal}
              onChange={(e) => setForm({ ...form, goal: e.target.value })}
            />
          </label>
          <label className="block">
            <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-mono">Current Headline</span>
            <input
              className="mt-1 w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:border-linkedin outline-none transition"
              placeholder="AI Engineer | Backend Developer"
              value={form.currentHeadline}
              onChange={(e) => setForm({ ...form, currentHeadline: e.target.value })}
            />
          </label>
          <label className="block">
            <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-mono">Current About</span>
            <textarea
              className="mt-1 w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:border-linkedin outline-none transition h-24 resize-none"
              placeholder="Paste your current About section…"
              value={form.currentAbout}
              onChange={(e) => setForm({ ...form, currentAbout: e.target.value })}
            />
          </label>
          <label className="block">
            <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-mono">Current Skills <span className="text-zinc-700">(comma or newline-separated)</span></span>
            <textarea
              className="mt-1 w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:border-linkedin outline-none transition h-20 resize-none font-mono text-xs"
              placeholder="Python, Node.js, Docker"
              value={form.skillsRaw}
              onChange={(e) => setForm({ ...form, skillsRaw: e.target.value })}
            />
          </label>
          <div className="flex gap-2">
            {["pl", "en"].map((l) => (
              <button
                key={l}
                onClick={() => setForm({ ...form, language: l })}
                className={`px-4 py-1.5 rounded-lg text-xs font-mono uppercase transition ${form.language === l ? "bg-linkedin text-white" : "bg-zinc-800 text-zinc-400 hover:text-white"}`}
              >
                {l}
              </button>
            ))}
          </div>
          <button
            onClick={submit}
            disabled={running || !form.goal}
            className="w-full bg-linkedin hover:bg-linkedin-dark disabled:bg-zinc-800 disabled:text-zinc-600 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-lg transition-all flex items-center justify-center gap-2 shadow-lg shadow-linkedin/10"
          >
            {running ? (
              <><Loader2 size={16} className="animate-spin" /> Aristotle is rebuilding…</>
            ) : (
              <><Sparkles size={16} /> Optimize Profile</>
            )}
          </button>
        </div>

        {/* Result */}
        <div className="space-y-4">
          {error && (
            <div className="p-4 bg-red-500/5 border border-red-500/20 rounded-xl flex items-start gap-3">
              <AlertCircle size={16} className="text-red-400 mt-0.5 shrink-0" />
              <p className="text-sm text-red-300">{error}</p>
            </div>
          )}

          {result ? (
            <>
              <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-5 space-y-3 animate-slide-in">
                <p className="text-[10px] text-zinc-500 font-mono uppercase">New Headline</p>
                <p className="text-base text-white font-medium leading-relaxed">{result.newHeadline}</p>
              </div>

              <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-5 space-y-3 animate-slide-in">
                <p className="text-[10px] text-zinc-500 font-mono uppercase">New About</p>
                <pre className="text-sm text-zinc-200 whitespace-pre-wrap leading-relaxed font-sans">{result.newAbout}</pre>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <Delta label="Headline score" before={result.audit?.before?.headlineScore} after={result.audit?.after?.headlineScore} />
                <Delta label="About score" before={result.audit?.before?.aboutScore} after={result.audit?.after?.aboutScore} />
                <Delta label="Skill count" before={result.audit?.before?.skillCount} after={result.audit?.after?.skillCount} />
              </div>

              {result.recommendedSkills?.length > 0 && (
                <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-5">
                  <p className="text-[10px] text-zinc-500 font-mono uppercase mb-2 flex items-center gap-1.5"><Hash size={10} /> Recommended Skills</p>
                  <div className="flex flex-wrap gap-1.5">
                    {result.recommendedSkills.map((s, i) => (
                      <span key={i} className="text-[11px] px-2 py-0.5 bg-linkedin/10 text-linkedin-light border border-linkedin/30 rounded font-mono">{s}</span>
                    ))}
                  </div>
                </div>
              )}

              {result.contentAngles?.length > 0 && (
                <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-5">
                  <p className="text-[10px] text-zinc-500 font-mono uppercase mb-2 flex items-center gap-1.5"><Lightbulb size={10} /> Content Angles</p>
                  <ul className="space-y-2">
                    {result.contentAngles.map((a, i) => (
                      <li key={i} className="text-xs text-zinc-300 leading-relaxed pl-3 border-l-2 border-linkedin/40">{a}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          ) : (
            !error && (
              <div className="bg-zinc-900/60 border border-zinc-800 border-dashed rounded-xl p-12 text-center">
                <UserCheck size={32} className="text-zinc-700 mx-auto mb-3" strokeWidth={1.5} />
                <p className="text-sm text-zinc-500">Your optimized profile will appear here.</p>
                <p className="text-xs text-zinc-600 mt-1 font-mono">~$0.0008 per run</p>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
