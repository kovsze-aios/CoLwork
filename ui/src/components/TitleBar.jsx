import React, { useEffect, useState } from "react";
import { Minus, Square, X, Copy } from "lucide-react";
import { LogoWordmark } from "./Logo";

const ipc = typeof window !== "undefined" ? window.colwork : null;

export function TitleBar() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!ipc) return;
    ipc.window.isMaximized().then(setMaximized);
  }, []);

  const onMin = () => ipc?.window.minimize();
  const onMax = async () => setMaximized(await ipc.window.maximize());
  const onClose = () => ipc?.window.close();

  return (
    <div
      className="h-10 shrink-0 flex items-center justify-between surface-glass-strong border-b border-zinc-800/80 select-none relative z-20"
      style={{ WebkitAppRegion: "drag" }}
    >
      <div className="flex items-center gap-3 px-4">
        <LogoWordmark size={20} />
        <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-600">v8.2 · open source</span>
      </div>

      {ipc ? (
        <div className="flex h-full items-stretch" style={{ WebkitAppRegion: "no-drag" }}>
          <button
            onClick={onMin}
            className="w-11 grid place-items-center text-zinc-500 hover:text-white hover:bg-zinc-800/60 transition"
            aria-label="Minimize"
          >
            <Minus size={14} strokeWidth={1.8} />
          </button>
          <button
            onClick={onMax}
            className="w-11 grid place-items-center text-zinc-500 hover:text-white hover:bg-zinc-800/60 transition"
            aria-label="Maximize"
          >
            {maximized ? <Copy size={12} strokeWidth={1.8} /> : <Square size={12} strokeWidth={1.8} />}
          </button>
          <button
            onClick={onClose}
            className="w-11 grid place-items-center text-zinc-500 hover:text-white hover:bg-red-600/80 transition"
            aria-label="Close"
          >
            <X size={14} strokeWidth={1.8} />
          </button>
        </div>
      ) : (
        <div className="px-4 text-[10px] font-mono text-zinc-600">browser preview</div>
      )}
    </div>
  );
}

export default TitleBar;
