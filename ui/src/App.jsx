import { useState, useEffect, useCallback } from "react";
import { AnimatePresence, motion } from "./lib/motion-lite";
import { ChevronUp, ChevronDown } from "lucide-react";
import { TitleBar } from "./components/TitleBar";
import { Sidebar } from "./components/Sidebar";
import { StatusBar } from "./components/StatusBar";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ToastProvider } from "./components/Toast";
import OnboardingModal from "./components/OnboardingModal";
import JobHunter from "./views/JobHunter";
import ProfileOptimizer from "./views/ProfileOptimizer";
import ContentStudio from "./views/ContentStudio";
import ActivityLog from "./views/ActivityLog";
import TerminalView from "./views/TerminalView";

const ipc = typeof window !== "undefined" ? window.colwork : null;

export default function App() {
  // v10.0 — Activity Log is the landing route (replaces the old Dashboard).
  const [view, setView] = useState("activity");
  const [health, setHealth] = useState(null);
  const [activeExpert, setActiveExpert] = useState(null);
  const [termOpen, setTermOpen] = useState(false);
  const [termHeight] = useState(280);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [setupChecked, setSetupChecked] = useState(false);

  const refresh = useCallback(async () => {
    if (!ipc) return;
    try {
      const h = await ipc.engine.health();
      setHealth(h);
    } catch { /* offline */ }
  }, []);

  // First-boot onboarding check
  useEffect(() => {
    if (!ipc || setupChecked) return;
    ipc.engine.getSetupStatus().then((s) => {
      setSetupChecked(true);
      if (s?.ok && !s.configured?.n8n && !s.configured?.deepseek) {
        setShowOnboarding(true);
      }
    }).catch(() => {});
  }, [setupChecked]);

  const onOnboardingDone = () => {
    setShowOnboarding(false);
    refresh();
    // Re-check setup for the Dashboard
    setSetupChecked(false);
  };

  useEffect(() => {
    refresh();
    const i = setInterval(refresh, 8000);
    return () => clearInterval(i);
  }, [refresh]);

  // Keyboard shortcuts:
  //   Ctrl/Cmd + `  → toggle terminal panel (VS Code muscle memory)
  //   Ctrl/Cmd + K  → also toggle terminal panel (Claude Code muscle memory)
  //   Ctrl/Cmd + 1..5 → jump straight to a view
  useEffect(() => {
    const handler = (e) => {
      const meta = e.ctrlKey || e.metaKey;
      if (!meta) return;
      if (e.key === "`" || e.key.toLowerCase() === "k") {
        e.preventDefault();
        setTermOpen((v) => !v);
        return;
      }
      // v10.0 nav order: Job Hunter, Profile, Content, Activity, Terminal
      const navMap = { 1: "jobs", 2: "profile", 3: "content", 4: "activity", 5: "terminal" };
      if (navMap[e.key]) {
        e.preventDefault();
        setView(navMap[e.key]);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const renderView = () => {
    switch (view) {
      case "jobs": return <JobHunter setActiveExpert={setActiveExpert} />;
      case "profile": return <ProfileOptimizer setActiveExpert={setActiveExpert} />;
      case "content": return <ContentStudio setActiveExpert={setActiveExpert} />;
      case "activity": return <ActivityLog />;
      case "terminal": return <TerminalView />;
      case "settings": return <SettingsPlaceholder />;
      default: return <ActivityLog />;
    }
  };

  return (
    <ToastProvider>
      <div className="flex flex-col h-screen w-screen overflow-hidden bg-zinc-950 text-zinc-100">
        <TitleBar />

        <div className="flex flex-1 overflow-hidden">
          <Sidebar active={view} setActive={setView} />

          <div className="flex-1 flex flex-col overflow-hidden stage-spotlight">
            <main className="flex-1 overflow-y-auto">
              <ErrorBoundary>
                <AnimatePresence mode="wait">
                  <motion.div
                    key={view}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -6 }}
                    transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                    className="h-full"
                  >
                    {renderView()}
                  </motion.div>
                </AnimatePresence>
              </ErrorBoundary>
            </main>

            {/* Bottom-docked terminal panel — VS-Code / Claude-Code style */}
            {view !== "terminal" && (
              <motion.div
                initial={false}
                animate={{ height: termOpen ? termHeight : 36 }}
                transition={{ type: "spring", stiffness: 320, damping: 36 }}
                className="shrink-0 border-t border-zinc-800 surface-glass-strong overflow-hidden"
              >
                <button
                  onClick={() => setTermOpen((v) => !v)}
                  className="h-9 w-full flex items-center justify-between px-3 text-[11px] font-mono uppercase tracking-wider text-zinc-500 hover:text-white hover:bg-zinc-900/40 transition"
                >
                  <span className="flex items-center gap-2">
                    <span className={`w-1.5 h-1.5 rounded-full ${termOpen ? "bg-linkedin-light animate-pulse-glow" : "bg-zinc-600"}`} />
                    Terminal
                    <span className="text-zinc-700">·</span>
                    <span className="text-zinc-600">Ctrl + `&nbsp;&nbsp;or&nbsp;&nbsp;Ctrl + K</span>
                  </span>
                  {termOpen ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                </button>
                {termOpen && (
                  <div className="h-[calc(100%-2.25rem)] p-2">
                    <TerminalView embedded />
                  </div>
                )}
              </motion.div>
            )}
          </div>
        </div>

        <StatusBar
          activeExpert={activeExpert}
          n8n={health?.n8n}
          usage={health?.usage}
        />
      </div>

      {showOnboarding && <OnboardingModal onDone={onOnboardingDone} />}
    </ToastProvider>
  );
}

function SettingsPlaceholder() {
  return (
    <div className="p-8 max-w-2xl">
      <h2 className="text-2xl font-bold text-white">Settings</h2>
      <p className="text-sm text-zinc-500 mt-2">
        Configuration is read from <code className="text-linkedin-light">.env</code> at the project root.
        Copy <code className="text-linkedin-light">.env.example</code> to get started.
      </p>
      <div className="mt-6 bg-zinc-900/60 border border-zinc-800 rounded-xl p-5 space-y-2 text-xs font-mono text-zinc-400 backdrop-blur-sm">
        <p><span className="text-zinc-500">DEEPSEEK_API_KEY</span> — LLM provider key</p>
        <p><span className="text-zinc-500">N8N_BASE_URL</span> — n8n cloud REST endpoint</p>
        <p><span className="text-zinc-500">N8N_API_KEY</span> — n8n public-api JWT</p>
        <p><span className="text-zinc-500">GOOGLE_SHEET_ID</span> — destination spreadsheet</p>
        <p><span className="text-zinc-500">OPERATOR_NAME</span> — your name (default for forms)</p>
      </div>
    </div>
  );
}
