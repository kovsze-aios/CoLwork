import React, { useEffect, useRef, useState } from "react";
import { Terminal as TermIcon, AlertTriangle } from "lucide-react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import "@xterm/xterm/css/xterm.css";

const SHELL_ID = "main";

const THEME = {
  background: "#09090b",
  foreground: "#e4e4e7",
  cursor: "#0A66C2",
  cursorAccent: "#09090b",
  selectionBackground: "#0A66C233",
  black: "#18181b",
  red: "#f87171",
  green: "#4ade80",
  yellow: "#facc15",
  blue: "#60a5fa",
  magenta: "#c084fc",
  cyan: "#22d3ee",
  white: "#e4e4e7",
  brightBlack: "#52525b",
  brightRed: "#fca5a5",
  brightGreen: "#86efac",
  brightYellow: "#fde047",
  brightBlue: "#93c5fd",
  brightMagenta: "#d8b4fe",
  brightCyan: "#67e8f9",
  brightWhite: "#ffffff",
};

export default function TerminalView({ embedded = false }) {
  const containerRef = useRef(null);
  const termRef = useRef(null);
  const fitRef = useRef(null);
  const cleanupRef = useRef(null);
  const [fallback, setFallback] = useState(false);
  const [bootError, setBootError] = useState(null);
  const [renderer, setRenderer] = useState("webgl");

  useEffect(() => {
    if (!containerRef.current) return;
    if (!window.colwork?.pty) {
      setFallback(true);
      return;
    }

    const term = new Terminal({
      fontFamily: "JetBrains Mono, monospace",
      fontSize: 13,
      lineHeight: 1.3,
      cursorBlink: true,
      cursorStyle: "bar",
      allowProposedApi: true,
      scrollback: 5000,
      theme: THEME,
      smoothScrollDuration: 0,
      fastScrollSensitivity: 5,
      fastScrollModifier: "alt",
    });
    const fit = new FitAddon();
    term.loadAddon(fit);

    // WebGL renderer for GPU-accelerated text — falls back to canvas silently
    try {
      const webgl = new WebglAddon();
      webgl.onContextLoss(() => {
        webgl.dispose();
        setRenderer("canvas");
      });
      term.loadAddon(webgl);
    } catch {
      setRenderer("canvas");
    }

    term.open(containerRef.current);
    fit.fit();
    termRef.current = term;
    fitRef.current = fit;

    let dataCleanup, exitCleanup;

    (async () => {
      const { cols, rows } = term;
      try {
        const result = await window.colwork.pty.spawn(SHELL_ID, { cols, rows });
        if (!result?.ok) {
          setFallback(true);
          term.write("\r\n\x1b[33m[colwork] Terminal fallback: pty unavailable.\x1b[0m\r\n");
          return;
        }
        term.write("\x1b[36m✱ CoLwork Terminal\x1b[0m  \x1b[2m" + (window.colwork?.meta?.platform || "") + "\x1b[0m\r\n\r\n");
        // DeepSeek environment status banner
        const isWin = window.colwork?.meta?.platform === "win32";
        term.write("\x1b[33m⚡ DeepSeek Environment\x1b[0m\r\n");
        term.write("\x1b[2m  ANTHROPIC_BASE_URL      \x1b[32m●\x1b[0m  " + (isWin ? "%ANTHROPIC_BASE_URL%" : "$ANTHROPIC_BASE_URL") + "\x1b[0m\r\n");
        term.write("\x1b[2m  ANTHROPIC_AUTH_TOKEN     \x1b[32m●\x1b[0m  " + (isWin ? "%ANTHROPIC_AUTH_TOKEN%" : "$ANTHROPIC_AUTH_TOKEN") + "\x1b[0m\r\n");
        term.write("\x1b[2m  ANTHROPIC_MODEL          \x1b[32m●\x1b[0m  deepseek-v4-pro[1m]\x1b[0m\r\n");
        term.write("\x1b[2m  CLAUDE_CODE_EFFORT_LEVEL \x1b[32m●\x1b[0m  max\x1b[0m\r\n");
        term.write("\x1b[2m  (5 more model variants injected)\x1b[0m\r\n");
        term.write("\r\n");

        dataCleanup = window.colwork.pty.onData(SHELL_ID, (data) => term.write(data));
        exitCleanup = window.colwork.pty.onExit(SHELL_ID, (code) => {
          term.write(`\r\n\x1b[31m[shell exited code=${code}]\x1b[0m\r\n`);
        });
        term.onData((d) => window.colwork.pty.write(SHELL_ID, d));
      } catch (e) {
        setBootError(e.message);
      }
    })();

    const onResize = () => {
      try {
        fit.fit();
        const { cols, rows } = term;
        window.colwork.pty.resize(SHELL_ID, cols, rows);
      } catch { /* ignore */ }
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(containerRef.current);
    window.addEventListener("resize", onResize);

    cleanupRef.current = () => {
      window.removeEventListener("resize", onResize);
      ro.disconnect();
      dataCleanup?.();
      exitCleanup?.();
      term.dispose();
    };

    return () => cleanupRef.current?.();
  }, []);

  if (fallback) {
    return (
      <div className={`${embedded ? "h-full" : "p-8"} flex items-center justify-center`}>
        <div className="bg-zinc-900/60 border border-amber-500/30 rounded-xl p-6 max-w-lg text-center">
          <AlertTriangle size={28} className="text-amber-400 mx-auto mb-3" />
          <p className="text-sm text-zinc-200 font-semibold">Terminal not available in this environment.</p>
          <p className="text-xs text-zinc-500 mt-2 font-mono">node-pty must be installed inside Electron. Run <span className="text-linkedin-light">npm install</span> in the project root.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`${embedded ? "h-full" : "h-[calc(100vh-9.5rem)] p-4"} flex flex-col`}>
      {!embedded && (
        <div className="flex items-center gap-2 mb-3">
          <TermIcon size={18} strokeWidth={1.7} className="text-linkedin-light" />
          <h2 className="text-base font-semibold text-white">Terminal</h2>
          <span className="text-[10px] font-mono text-zinc-600 ml-auto">{window.colwork?.meta?.platform}</span>
        </div>
      )}
      <div className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg overflow-hidden">
        <div ref={containerRef} className="h-full w-full" />
      </div>
      {bootError && (
        <div className="mt-2 text-xs text-red-400 font-mono">terminal: {bootError}</div>
      )}
    </div>
  );
}
