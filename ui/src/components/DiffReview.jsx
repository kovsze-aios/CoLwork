import React, { useState } from "react";
import { motion } from "../lib/motion-lite";
import {
  Check,
  X,
  ArrowRight,
  AlertTriangle,
  Edit3,
  Shield,
} from "lucide-react";
import { cn } from "../lib/cn";

/**
 * DiffReview — Human-in-the-Loop safeguard for all LinkedIn actions.
 *
 * Renders a side-by-side comparison of "Current" vs "Proposed" content.
 * The AI MUST NOT auto-apply changes — the user must explicitly approve or reject.
 *
 * Props:
 *  - currentLabel / proposedLabel — section labels
 *  - currentContent / proposedContent — the content to compare
 *  - diffFields — array of { label, before, after } for structured diffs
 *  - onApprove — called when user clicks "Approve & Apply"
 *  - onReject — called when user clicks "Edit/Reject"
 *  - loading — shows spinner on approve button
 *  - warning — optional warning message shown above the buttons
 */

export default function DiffReview({
  currentLabel = "Current Profile",
  proposedLabel = "Proposed Changes",
  currentContent,
  proposedContent,
  diffFields = [],
  onApprove,
  onReject,
  loading = false,
  warning = null,
}) {
  const [editMode, setEditMode] = useState(false);
  const [editedContent, setEditedContent] = useState("");

  const handleReject = () => {
    if (editMode && editedContent.trim()) {
      onReject?.({ edited: editedContent });
    } else {
      onReject?.();
    }
  };

  const enableEdit = () => {
    setEditedContent(proposedContent || "");
    setEditMode(true);
  };

  const cancelEdit = () => {
    setEditMode(false);
    setEditedContent("");
  };

  const hasDiffs = diffFields.length > 0 || currentContent !== proposedContent;

  return (
    <div className="space-y-4 animate-slide-in">
      {/* ── Warning banner ──────────────────────────────────── */}
      {warning && (
        <div className="p-3 bg-amber-500/5 border border-amber-500/20 rounded-lg flex items-start gap-2">
          <AlertTriangle size={14} className="text-amber-400 mt-0.5 shrink-0" />
          <p className="text-xs text-amber-300">{warning}</p>
        </div>
      )}

      {/* ── Side-by-side panels ─────────────────────────────── */}
      {!hasDiffs ? (
        <div className="bento-card rounded-2xl p-8 text-center border-dashed">
          <Shield size={28} className="text-zinc-600 mx-auto mb-2" strokeWidth={1.5} />
          <p className="text-sm text-zinc-500">No differences to review.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Current */}
          <div className="bento-card rounded-2xl p-4 space-y-3 shadow-inner border border-zinc-800/70">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-zinc-500" />
              <p className="text-[10px] text-zinc-500 font-mono uppercase tracking-wider">
                {currentLabel}
              </p>
            </div>

            {diffFields.length > 0 ? (
              <div className="space-y-3">
                {diffFields.map((f, i) => (
                  <div key={i}>
                    <p className="text-[9px] text-zinc-600 font-mono uppercase mb-0.5">{f.label}</p>
                    <div className="bg-zinc-950/80 rounded-lg p-3 border border-zinc-800/50">
                      <p className="text-sm text-zinc-400 leading-relaxed whitespace-pre-wrap">
                        {f.before || <span className="text-zinc-600 italic">empty</span>}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-zinc-950/80 rounded-lg p-3 border border-zinc-800/50">
                <pre className="text-sm text-zinc-400 leading-relaxed whitespace-pre-wrap font-sans">
                  {currentContent || <span className="text-zinc-600 italic">empty</span>}
                </pre>
              </div>
            )}
          </div>

          {/* Proposed */}
          <div className="bento-card rounded-2xl p-4 space-y-3 shadow-inner border border-linkedin/30 ring-1 ring-linkedin/10">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-linkedin-light animate-pulse-glow" />
              <p className="text-[10px] text-linkedin-light font-mono uppercase tracking-wider">
                {proposedLabel}
              </p>
            </div>

            {editMode ? (
              <textarea
                className="w-full bg-zinc-950 border border-linkedin/40 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:border-linkedin focus:ring-1 focus:ring-linkedin/30 outline-none transition resize-none h-40 font-sans"
                value={editedContent}
                onChange={(e) => setEditedContent(e.target.value)}
              />
            ) : diffFields.length > 0 ? (
              <div className="space-y-3">
                {diffFields.map((f, i) => (
                  <div key={i}>
                    <p className="text-[9px] text-zinc-600 font-mono uppercase mb-0.5">{f.label}</p>
                    <div className="bg-linkedin/[0.04] rounded-lg p-3 border border-linkedin/20">
                      <p className="text-sm text-zinc-200 leading-relaxed whitespace-pre-wrap">
                        {f.after || <span className="text-zinc-600 italic">empty</span>}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-linkedin/[0.04] rounded-lg p-3 border border-linkedin/20">
                <pre className="text-sm text-zinc-200 leading-relaxed whitespace-pre-wrap font-sans">
                  {proposedContent || <span className="text-zinc-600 italic">empty</span>}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Action buttons ───────────────────────────────────── */}
      {hasDiffs && (
        <div className="flex items-center gap-3 pt-2">
          {editMode ? (
            <>
              <button
                onClick={handleReject}
                disabled={loading || !editedContent.trim()}
                className={cn(
                  "flex-1 text-white font-semibold py-3 rounded-lg flex items-center justify-center gap-2 shadow-lg transition-all duration-200",
                  editedContent.trim()
                    ? "btn-premium bg-linkedin hover:bg-linkedin-dark shadow-linkedin/20"
                    : "bg-zinc-800 text-zinc-600 cursor-not-allowed",
                )}
              >
                <Check size={18} /> Apply Edited Version
              </button>
              <button
                onClick={cancelEdit}
                disabled={loading}
                className="btn-premium px-4 py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-white/5 rounded-lg flex items-center gap-1.5 transition"
              >
                <X size={16} /> Cancel
              </button>
            </>
          ) : (
            <>
              <button
                onClick={onApprove}
                disabled={loading}
                className={cn(
                  "flex-1 text-white font-semibold py-3 rounded-lg flex items-center justify-center gap-2 shadow-lg transition-all duration-200",
                  loading
                    ? "bg-linkedin/60 cursor-wait"
                    : "btn-premium bg-linkedin hover:bg-linkedin-dark shadow-linkedin/20",
                )}
              >
                {loading ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Applying…
                  </span>
                ) : (
                  <>
                    <Check size={18} /> Approve &amp; Apply
                  </>
                )}
              </button>
              <button
                onClick={enableEdit}
                disabled={loading}
                className="btn-premium px-4 py-3 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-lg flex items-center gap-1.5 transition text-sm font-medium"
              >
                <Edit3 size={16} /> Edit
              </button>
              <button
                onClick={handleReject}
                disabled={loading}
                className="btn-premium px-4 py-3 bg-zinc-800 hover:bg-red-500/10 text-zinc-300 hover:text-red-300 border border-white/5 hover:border-red-500/30 rounded-lg flex items-center gap-1.5 transition"
              >
                <X size={16} /> Reject
              </button>
            </>
          )}
        </div>
      )}

      {/* ── Pipeline indicator ───────────────────────────────── */}
      <div className="flex items-center gap-2 text-[10px] font-mono text-zinc-600">
        <Shield size={10} />
        Human-in-the-Loop · AI suggestions require manual approval
      </div>
    </div>
  );
}
