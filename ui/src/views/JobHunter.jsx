import React, { useState } from "react";
import {
  Briefcase,
  Send,
  FileText,
  Mail,
  Award,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Link2,
  ClipboardPaste,
  ShieldCheck,
} from "lucide-react";
import { cn } from "../lib/cn";
import DiffReview from "../components/DiffReview";

/**
 * v10.0 — Job Hunter
 *
 * Three named pipeline stages, each backed by a single MoE expert:
 *
 *   ① Analyzing Job   ← Sherlock      (company OSINT + JD parsing)
 *   ② Tailoring Resume ← Feynman      (CV + cover letter rewrite)
 *   ③ Drafting Outreach ← Seed         (recruiter email + LinkedIn DM)
 *
 * Input: paste either a Job URL (auto-extract on the n8n side) or the raw
 * Job Description. URL takes priority; if both are filled the URL wins.
 */

const PIPELINE = [
  {
    key: "analyze",
    name: "Analyzing Job",
    desc: "Sherlock parses the role + scans the company",
    expert: "sherlock",
  },
  {
    key: "tailor",
    name: "Tailoring Resume",
    desc: "Feynman rewrites your CV + cover letter",
    expert: "feynman",
  },
  {
    key: "outreach",
    name: "Drafting Outreach",
    desc: "Seed crafts the recruiter email & LinkedIn DM",
    expert: "seed",
  },
];

export default function JobHunter({ setActiveExpert }) {
  const [form, setForm] = useState({
    jobUrl: "",
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
  const [inputMode, setInputMode] = useState("url"); // "url" | "paste"
  const [approved, setApproved] = useState(false);
  const [applying, setApplying] = useState(false);

  const canSubmit = inputMode === "url"
    ? !!form.jobUrl.trim()
    : !!form.jobTitle.trim() && !!form.company.trim();

  const submit = async () => {
    if (!canSubmit) return;
    setRunning(true);
    setResult(null);
    setError(null);
    setApproved(false);

    // Walk the 3 named stages while the n8n call is in flight.
    // Backend execution is parallel-ish; the visible pace is purely UX.
    let stageIdx = 0;
    setStage(PIPELINE[0].key);
    setActiveExpert?.(PIPELINE[0].expert);
    const ticker = setInterval(() => {
      if (stageIdx < PIPELINE.length - 1) {
        stageIdx++;
        setStage(PIPELINE[stageIdx].key);
        setActiveExpert?.(PIPELINE[stageIdx].expert);
      }
    }, 1800);

    try {
      const payload = inputMode === "url"
        ? { jobUrl: form.jobUrl, candidateName: form.candidateName, candidateRole: form.candidateRole }
        : { ...form };
      const res = await window.colwork.engine.applyJob(payload);
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
    <div className="p-8 space-y-6 max-w-[1400px]">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-3xl font-semibold tracking-tight leading-none flex items-center gap-3">
            <Briefcase size={26} strokeWidth={1.6} className="text-linkedin-light" />
            <span className="text-grad-heading">Job Hunter</span>
          </h2>
          <p className="text-sm text-zinc-500 mt-2 tracking-wide">
            Paste a job → tailored CV + cover letter + recruiter email.
            <span className="text-zinc-600"> ~$0.001/run.</span>
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── Input form ───────────────────────────────────────────── */}
        <div className="bento-card rounded-2xl p-5 space-y-4 shadow-inner">
          {/* URL ↔ Paste-JD mode toggle */}
          <div className="flex gap-1 p-1 bg-zinc-950 rounded-lg w-fit">
            {[
              { id: "url", label: "Job URL", icon: Link2 },
              { id: "paste", label: "Paste JD", icon: ClipboardPaste },
            ].map((m) => {
              const Icon = m.icon;
              return (
                <button
                  key={m.id}
                  onClick={() => setInputMode(m.id)}
                  className={cn(
                    "relative px-3 py-1.5 rounded-md text-xs font-medium transition flex items-center gap-1.5",
                    inputMode === m.id ? "text-white" : "text-zinc-500 hover:text-zinc-200",
                  )}
                >
                  {inputMode === m.id && (
                    <span className="absolute inset-0 rounded-md bg-linkedin/20 ring-1 ring-linkedin/40" />
                  )}
                  <Icon size={12} className="relative z-10" />
                  <span className="relative z-10">{m.label}</span>
                </button>
              );
            })}
          </div>

          {inputMode === "url" ? (
            <Field
              label="Job URL *"
              type="url"
              placeholder="https://www.linkedin.com/jobs/view/4012345678/"
              value={form.jobUrl}
              onChange={(e) => setForm({ ...form, jobUrl: e.target.value })}
            />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Job Title *" placeholder="Senior AI Engineer"
                  value={form.jobTitle} onChange={(e) => setForm({ ...form, jobTitle: e.target.value })} />
                <Field label="Company *" placeholder="Acme AI"
                  value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
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
            </>
          )}

          <div className="border-t border-zinc-800/80 pt-4 space-y-3">
            <p className="text-[10px] text-zinc-500 uppercase tracking-wider font-mono">Optional</p>
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
          </div>

          <button
            onClick={submit}
            disabled={running || !canSubmit}
            className={cn(
              "w-full text-white font-semibold py-2.5 rounded-lg flex items-center justify-center gap-2",
              "shadow-lg shadow-linkedin/20",
              !running && canSubmit
                ? "btn-premium bg-linkedin hover:bg-linkedin-dark"
                : "bg-zinc-800 text-zinc-600 cursor-not-allowed",
            )}
          >
            {running ? (
              <><Loader2 size={16} className="animate-spin" /> Running pipeline…</>
            ) : (
              <><Send size={16} /> Generate Application</>
            )}
          </button>
        </div>

        {/* ── Pipeline + Result ───────────────────────────────────── */}
        <div className="space-y-4">
          <div className="bento-card rounded-2xl p-5 shadow-inner">
            <h3 className="text-sm font-semibold text-zinc-200 mb-4 tracking-tight">Pipeline</h3>
            <div className="space-y-2">
              {PIPELINE.map((step, idx) => {
                const activeIdx = PIPELINE.findIndex((s) => s.key === stage);
                const isActive = stage === step.key;
                const isDone = !running && (result || error)
                  ? !error
                  : (activeIdx >= 0 && idx < activeIdx);
                return (
                  <PipelineStage
                    key={step.key}
                    step={step}
                    idx={idx}
                    isActive={isActive}
                    isDone={isDone}
                  />
                );
              })}
            </div>
          </div>

          {error && (
            <div className="p-4 bg-red-500/5 border border-red-500/20 rounded-2xl flex items-start gap-3 backdrop-blur-md">
              <AlertCircle size={16} className="text-red-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-red-300">Generation failed</p>
                <p className="text-xs text-red-300/80 mt-1 font-mono">{error}</p>
              </div>
            </div>
          )}

          {result && (
            <div className="space-y-3">
              {!approved ? (
                <>
                  {/* Human-in-the-Loop: Review Diff before applying */}
                  <DiffReview
                    currentLabel="Current (Blank / Generic)"
                    proposedLabel="AI-Generated Application"
                    diffFields={[
                      { label: "Cover Letter", before: "(no cover letter yet)", after: result.coverLetter || "" },
                      ...(result.emailDraft?.body ? [{ label: "Email Body", before: "(no email draft)", after: result.emailDraft.body }] : []),
                    ]}
                    warning="AI-generated job application content requires your explicit review and approval. It will NOT be auto-submitted."
                    onApprove={async () => {
                      setApplying(true);
                      await new Promise((r) => setTimeout(r, 600));
                      setApproved(true);
                      setApplying(false);
                    }}
                    onReject={() => {
                      setResult(null);
                      setError(null);
                    }}
                    loading={applying}
                  />

                  {/* Stats preview (informational only — visible during review) */}
                  <div className="bento-card rounded-2xl p-4 shadow-inner">
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
                      <div className="mt-3">
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
                  </div>
                </>
              ) : (
                /* Approved state — application confirmed */
                <div className="bento-card rounded-2xl p-5 space-y-3 animate-slide-in shadow-inner border border-green-500/30 ring-1 ring-green-500/10">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-green-400 flex items-center gap-2">
                      <ShieldCheck size={16} /> Application Approved &amp; Ready
                    </h3>
                    <span className="text-xs font-mono text-zinc-500">
                      tokens: {result.usage?.promptTokens ?? 0}↑ / {result.usage?.completionTokens ?? 0}↓
                    </span>
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
                        className="btn-premium text-xs flex items-center gap-1.5 px-3 py-1.5 bg-linkedin/10 hover:bg-linkedin/20 text-linkedin-light border border-linkedin/30 rounded-lg"
                      >
                        <FileText size={12} /> Save {att.filename}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Pipeline stage card.
   - Idle:    flat zinc card with a numbered ring.
   - Active:  expands to show a mock document with a glowing
              scanning line traversing it. The 7-dot status row
              pulses and the expert name surfaces.
   - Done:    green-tinted card + checkmark.
   Heavily styled in pure CSS (see .scanline / .doc-line in index.css)
   so we don't reach for framer-motion on the prod-build hot path.
   ───────────────────────────────────────────────────────────── */
function PipelineStage({ step, idx, isActive, isDone }) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border transition-all duration-300 ease-out",
        isActive
          ? "bg-linkedin/[0.06] border-linkedin/40 shadow-[0_0_0_1px_rgba(10,102,194,0.30),0_8px_32px_-12px_rgba(10,102,194,0.45)]"
          : isDone
          ? "bg-green-500/[0.04] border-green-500/25"
          : "bg-zinc-950/60 border-white/5 hover:border-white/10",
      )}
    >
      <div className="flex items-center gap-3 p-3">
        <span
          className={cn(
            "shrink-0 w-7 h-7 rounded-full grid place-items-center text-[11px] font-mono font-bold border-2 transition-all duration-300",
            isActive
              ? "border-linkedin-light text-linkedin-light bg-linkedin/15 animate-pulse-glow"
              : isDone
              ? "border-green-400 text-green-400 bg-green-500/10"
              : "border-zinc-700 text-zinc-600",
          )}
        >
          {isDone && !isActive ? <CheckCircle2 size={14} /> : idx + 1}
        </span>

        <div className="flex-1 min-w-0">
          <p className={cn(
            "text-sm font-medium tracking-tight transition-colors duration-300",
            isActive ? "text-linkedin-light" : isDone ? "text-green-400" : "text-zinc-300",
          )}>
            {step.name}
          </p>
          <p className="text-[11px] text-zinc-500 font-mono mt-0.5">{step.desc}</p>
        </div>

        {/* MoE expert name — surfaces only while this stage is active */}
        {isActive && (
          <div className="shrink-0 flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-linkedin-light">
            <span className="relative flex w-1.5 h-1.5">
              <span className="absolute inset-0 rounded-full bg-linkedin-light animate-ping opacity-75" />
              <span className="relative inline-flex w-1.5 h-1.5 rounded-full bg-linkedin-light" />
            </span>
            {step.expert}
          </div>
        )}
        {isActive && <Loader2 size={14} className="animate-spin text-linkedin-light shrink-0" />}
      </div>

      {/* ── Scanning panel — only when active ────────────────── */}
      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-300 ease-out",
          isActive ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="overflow-hidden">
          <div className="relative mx-3 mb-3 mt-1 p-3 rounded-lg bg-zinc-950/80 border border-white/5 overflow-hidden">
            {/* Mock document — six skeleton lines */}
            <div className="space-y-2">
              <div className="doc-line w-3/4" />
              <div className="doc-line w-full" />
              <div className="doc-line w-5/6" />
              <div className="doc-line w-2/3" />
              <div className="doc-line w-full" />
              <div className="doc-line w-1/2" />
            </div>
            {/* The glowing scanning line */}
            {isActive && <div className="scanline" />}
          </div>
        </div>
      </div>
    </div>
  );
}
