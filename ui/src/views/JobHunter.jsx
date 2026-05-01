import React, { useState } from "react";
import { Briefcase, Send, FileText, Mail, Award, Loader2, CheckCircle2, AlertCircle } from "lucide-react";

const PIPELINE = [
  { key: "normalize", name: "Normalize", desc: "Validate input" },
  { key: "scrape", name: "Sherlock", desc: "Company OSINT" },
  { key: "feynman", name: "Feynman", desc: "CV + cover letter" },
  { key: "seed", name: "Seed", desc: "Email assembly" },
  { key: "deliver", name: "Respond", desc: "Package returned" },
];

export default function JobHunter({ setActiveExpert }) {
  const [form, setForm] = useState({
    jobTitle: "",
    company: "",
    jobDescription: "",
    companyUrl: "",
    recruiterEmail: "",
    candidateName: "",
    candidateRole: "",
  });
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [stage, setStage] = useState(null);

  const submit = async () => {
    if (!form.jobTitle || !form.company) return;
    setRunning(true);
    setResult(null);
    setError(null);

    // Walk fake stages while the n8n call is in flight (real workflow runs on cloud)
    const stages = ["normalize", "scrape", "feynman", "seed", "deliver"];
    const expertMap = { normalize: null, scrape: "sherlock", feynman: "feynman", seed: "seed", deliver: null };
    let stageIdx = 0;
    const ticker = setInterval(() => {
      const s = stages[stageIdx];
      setStage(s);
      setActiveExpert?.(expertMap[s]);
      if (stageIdx < stages.length - 1) stageIdx++;
    }, 1200);

    try {
      const res = await window.colwork.engine.applyJob(form);
      if (!res || res.queued) {
        setError(res?.queued ? "Cloud unreachable — request queued for retry." : "No response from engine.");
      } else if (res.ok === false) {
        setError(res.error || "Workflow failed.");
      } else {
        setResult(res);
      }
    } catch (e) {
      setError(e.message || "Unexpected error.");
    } finally {
      clearInterval(ticker);
      setStage(null);
      setActiveExpert?.(null);
      setRunning(false);
    }
  };

  const saveAttachment = (att) => {
    window.colwork.engine.saveDialog({ defaultPath: att.filename, content: att.content });
  };

  const Field = ({ label, ...rest }) => (
    <label className="block">
      <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-mono">{label}</span>
      <input
        {...rest}
        className="mt-1 w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:border-linkedin focus:ring-1 focus:ring-linkedin/30 outline-none transition"
      />
    </label>
  );

  return (
    <div className="p-8 space-y-6 animate-slide-in max-w-[1400px]">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <Briefcase size={22} strokeWidth={1.7} className="text-linkedin-light" />
            Job Hunter
          </h2>
          <p className="text-sm text-zinc-500 mt-1">Single n8n call → tailored CV + cover letter + recruiter email. Cost: ~$0.001/run.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Form */}
        <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-5 space-y-3">
          <Field label="Job Title *" placeholder="Senior AI Engineer"
            value={form.jobTitle} onChange={(e) => setForm({ ...form, jobTitle: e.target.value })} />
          <Field label="Company *" placeholder="Acme AI"
            value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
          <Field label="Company URL" placeholder="https://acme.ai"
            value={form.companyUrl} onChange={(e) => setForm({ ...form, companyUrl: e.target.value })} />
          <Field label="Recruiter Email" placeholder="hr@acme.ai"
            value={form.recruiterEmail} onChange={(e) => setForm({ ...form, recruiterEmail: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Your Name" placeholder="Your full name"
              value={form.candidateName} onChange={(e) => setForm({ ...form, candidateName: e.target.value })} />
            <Field label="Your Role" placeholder="AI Automation Engineer"
              value={form.candidateRole} onChange={(e) => setForm({ ...form, candidateRole: e.target.value })} />
          </div>
          <label className="block">
            <span className="text-[10px] text-zinc-500 uppercase tracking-wider font-mono">Job Description</span>
            <textarea
              className="mt-1 w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-100 placeholder-zinc-600 focus:border-linkedin focus:ring-1 focus:ring-linkedin/30 outline-none transition h-32 resize-none font-mono"
              placeholder="Paste the full job description here…"
              value={form.jobDescription}
              onChange={(e) => setForm({ ...form, jobDescription: e.target.value })}
            />
          </label>

          <button
            onClick={submit}
            disabled={running || !form.jobTitle || !form.company}
            className="w-full bg-linkedin hover:bg-linkedin-dark disabled:bg-zinc-800 disabled:text-zinc-600 disabled:cursor-not-allowed text-white font-semibold py-2.5 rounded-lg transition-all flex items-center justify-center gap-2 shadow-lg shadow-linkedin/10"
          >
            {running ? (
              <><Loader2 size={16} className="animate-spin" /> Running board pipeline…</>
            ) : (
              <><Send size={16} /> Generate Application</>
            )}
          </button>
        </div>

        {/* Pipeline + Result */}
        <div className="space-y-4">
          <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-zinc-200 mb-4">Board Pipeline</h3>
            <div className="space-y-2">
              {PIPELINE.map((step) => {
                const idx = PIPELINE.findIndex((s) => s.key === stage);
                const myIdx = PIPELINE.findIndex((s) => s.key === step.key);
                const isActive = stage === step.key;
                const isDone = !running && (result || error)
                  ? true
                  : (stage && myIdx < idx);
                const color = isActive
                  ? "text-linkedin-light"
                  : isDone
                  ? "text-green-400"
                  : "text-zinc-600";
                return (
                  <div key={step.key} className="flex items-center gap-3 p-2.5 bg-zinc-950/60 rounded-lg border border-zinc-800/60">
                    <span className={`w-2 h-2 rounded-full ${isActive ? "bg-linkedin-light animate-pulse" : isDone ? "bg-green-400" : "bg-zinc-700"}`} />
                    <div className="flex-1">
                      <p className={`text-sm font-medium ${color}`}>{step.name}</p>
                      <p className="text-[11px] text-zinc-500 font-mono">{step.desc}</p>
                    </div>
                    {isActive && <Loader2 size={14} className="animate-spin text-linkedin-light" />}
                    {isDone && !isActive && <CheckCircle2 size={14} className="text-green-400" />}
                  </div>
                );
              })}
            </div>
          </div>

          {error && (
            <div className="p-4 bg-red-500/5 border border-red-500/20 rounded-xl flex items-start gap-3">
              <AlertCircle size={16} className="text-red-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-red-300">Generation failed</p>
                <p className="text-xs text-red-300/80 mt-1 font-mono">{error}</p>
              </div>
            </div>
          )}

          {result && (
            <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-5 space-y-3 animate-slide-in">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-green-400 flex items-center gap-2">
                  <Award size={16} /> Application package ready
                </h3>
                <span className="text-xs font-mono text-zinc-500">tokens: {result.usage?.promptTokens ?? 0}↑ / {result.usage?.completionTokens ?? 0}↓</span>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="bg-zinc-950 rounded-lg p-3 border border-zinc-800">
                  <p className="text-[10px] text-zinc-500 font-mono uppercase">Match</p>
                  <p className="text-2xl font-bold text-linkedin-light tabular-nums">{result.matchScore ?? "—"}</p>
                </div>
                <div className="bg-zinc-950 rounded-lg p-3 border border-zinc-800">
                  <p className="text-[10px] text-zinc-500 font-mono uppercase">CV</p>
                  <p className="text-2xl font-bold text-white tabular-nums">{(result.cv || "").length}</p>
                  <p className="text-[10px] text-zinc-600 font-mono">chars</p>
                </div>
                <div className="bg-zinc-950 rounded-lg p-3 border border-zinc-800">
                  <p className="text-[10px] text-zinc-500 font-mono uppercase">Letter</p>
                  <p className="text-2xl font-bold text-white tabular-nums">{(result.coverLetter || "").length}</p>
                  <p className="text-[10px] text-zinc-600 font-mono">chars</p>
                </div>
              </div>

              {result.keyAlignment?.length > 0 && (
                <div>
                  <p className="text-[10px] text-zinc-500 font-mono uppercase mb-1">Key Alignment</p>
                  <ul className="space-y-1">
                    {result.keyAlignment.slice(0, 5).map((k, i) => (
                      <li key={i} className="text-xs text-zinc-300 flex items-start gap-2">
                        <span className="text-linkedin-light">▸</span>{k}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {result.emailDraft && (
                <div className="p-3 bg-zinc-950 rounded-lg border border-zinc-800">
                  <p className="text-[10px] text-zinc-500 font-mono uppercase mb-1 flex items-center gap-1.5"><Mail size={10} /> Email Draft</p>
                  <p className="text-xs text-zinc-300"><span className="text-zinc-500">to:</span> {result.emailDraft.to || "—"}</p>
                  <p className="text-xs text-zinc-300 mt-0.5"><span className="text-zinc-500">subject:</span> {result.emailDraft.subject}</p>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {(result.emailDraft?.attachments || []).map((att, i) => (
                  <button
                    key={i}
                    onClick={() => saveAttachment(att)}
                    className="text-xs flex items-center gap-1.5 px-3 py-1.5 bg-linkedin/10 hover:bg-linkedin/20 text-linkedin-light border border-linkedin/30 rounded-lg transition"
                  >
                    <FileText size={12} /> Save {att.filename}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
