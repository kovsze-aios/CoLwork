import React, { useState } from "react";
import { UserCheck, Sparkles, TrendingUp, TrendingDown, Loader2, AlertCircle, Hash, Lightbulb, ShieldCheck } from "lucide-react";
import DiffReview from "../components/DiffReview";

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
  const [approved, setApproved] = useState(false);
  const [applying, setApplying] = useState(false);

  const submit = async () => {
    if (!form.goal) return;
    setRunning(true);
    setResult(null);
    setError(null);
    setApproved(false);
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
    <div className="p-8 space-y-6 max-w-[1400px]">
      <div>
        <h2 className="text-3xl font-semibold tracking-tight leading-none flex items-center gap-3">
          <UserCheck size={26} strokeWidth={1.6} className="text-linkedin-light" />
          <span className="text-grad-heading">Profile Optimizer</span>
        </h2>
        <p className="text-sm text-zinc-500 mt-2 tracking-wide">
          Aristotle audits your current profile against a target role — rebuilds headline, About, skills, and content angles in one call.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Form */}
        <div className="bento-card rounded-2xl p-5 space-y-3 shadow-inner">
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
                className={`btn-premium px-4 py-1.5 rounded-lg text-xs font-mono uppercase ${form.language === l ? "bg-linkedin text-white" : "bg-zinc-800 text-zinc-400 hover:text-white"}`}
              >
                {l}
              </button>
            ))}
          </div>
          <button
            onClick={submit}
            disabled={running || !form.goal}
            className={`w-full text-white font-semibold py-2.5 rounded-lg flex items-center justify-center gap-2 shadow-lg shadow-linkedin/20 ${
              !running && form.goal
                ? "btn-premium bg-linkedin hover:bg-linkedin-dark"
                : "bg-zinc-800 text-zinc-600 cursor-not-allowed"
            }`}
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
            <div className="p-4 bg-red-500/5 border border-red-500/20 rounded-2xl flex items-start gap-3 backdrop-blur-md">
              <AlertCircle size={16} className="text-red-400 mt-0.5 shrink-0" />
              <p className="text-sm text-red-300">{error}</p>
            </div>
          )}

          {result ? (
            <div className="space-y-4">
              {!approved ? (
                <>
                  {/* Human-in-the-Loop: Review Diff */}
                  <DiffReview
                    currentLabel="Current Profile"
                    proposedLabel="AI Proposed Changes"
                    diffFields={[
                      { label: "Headline", before: form.currentHeadline || "(not provided)", after: result.newHeadline || "" },
                      { label: "About", before: form.currentAbout || "(not provided)", after: result.newAbout || "" },
                    ]}
                    warning="AI-generated profile changes require your review and approval before they take effect."
                    onApprove={async () => {
                      setApplying(true);
                      // Simulate apply — in production this would push to LinkedIn via n8n
                      await new Promise((r) => setTimeout(r, 800));
                      setApproved(true);
                      setApplying(false);
                    }}
                    onReject={() => {
                      setResult(null);
                      setError(null);
                    }}
                    loading={applying}
                  />

                  {/* Score deltas (informational) */}
                  <div className="grid grid-cols-3 gap-3">
                    <Delta label="Headline score" before={result.audit?.before?.headlineScore} after={result.audit?.after?.headlineScore} />
                    <Delta label="About score" before={result.audit?.before?.aboutScore} after={result.audit?.after?.aboutScore} />
                    <Delta label="Skill count" before={result.audit?.before?.skillCount} after={result.audit?.after?.skillCount} />
                  </div>

                  {result.recommendedSkills?.length > 0 && (
                    <div className="bento-card rounded-2xl p-5 shadow-inner">
                      <p className="text-[10px] text-zinc-500 font-mono uppercase mb-2 flex items-center gap-1.5"><Hash size={10} /> Recommended Skills</p>
                      <div className="flex flex-wrap gap-1.5">
                        {result.recommendedSkills.map((s, i) => (
                          <span key={i} className="text-[11px] px-2 py-0.5 bg-linkedin/10 text-linkedin-light border border-linkedin/30 rounded font-mono">{s}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {result.contentAngles?.length > 0 && (
                    <div className="bento-card rounded-2xl p-5 shadow-inner">
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
                /* Approved state — show applied confirmation */
                <div className="bento-card rounded-2xl p-5 space-y-3 shadow-inner border border-green-500/30 ring-1 ring-green-500/10">
                  <div className="flex items-center gap-2 text-green-400">
                    <ShieldCheck size={18} />
                    <p className="text-sm font-semibold">Profile Changes Approved &amp; Applied</p>
                  </div>
                  <div className="space-y-2">
                    <div>
                      <p className="text-[10px] text-zinc-500 font-mono uppercase">New Headline</p>
                      <p className="text-base text-white font-medium leading-relaxed">{result.newHeadline}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-zinc-500 font-mono uppercase">New About</p>
                      <pre className="text-sm text-zinc-200 whitespace-pre-wrap leading-relaxed font-sans">{result.newAbout}</pre>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            !error && (
              <div className="bento-card rounded-2xl border-dashed p-12 text-center shadow-inner">
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
