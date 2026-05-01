import React, { useEffect, useState, useCallback, createContext, useContext } from "react";
import { X, AlertCircle, CheckCircle, Info, Loader2 } from "lucide-react";

const ToastCtx = createContext(null);

export function useToast() {
  return useContext(ToastCtx);
}

const ICONS = {
  error: AlertCircle,
  success: CheckCircle,
  info: Info,
  loading: Loader2,
};
const STYLES = {
  error: "border-red-500/30 bg-red-500/5 text-red-300",
  success: "border-green-500/30 bg-green-500/5 text-green-300",
  info: "border-linkedin/30 bg-linkedin/5 text-linkedin-light",
  loading: "border-zinc-500/30 bg-zinc-500/5 text-zinc-300",
};

function ToastItem({ toast, dismiss }) {
  useEffect(() => {
    if (toast.duration === 0) return;
    const t = setTimeout(() => dismiss(toast.id), toast.duration || 5000);
    return () => clearTimeout(t);
  }, [toast, dismiss]);

  const Icon = ICONS[toast.type || "info"];
  return (
    <div
      className={`flex items-start gap-2.5 p-3 border rounded-lg backdrop-blur-sm shadow-xl animate-slide-in max-w-sm ${STYLES[toast.type || "info"]}`}
    >
      <Icon size={14} strokeWidth={1.7} className={`shrink-0 mt-0.5 ${toast.type === "loading" ? "animate-spin" : ""}`} />
      <p className="text-xs flex-1 leading-relaxed">{toast.message}</p>
      <button onClick={() => dismiss(toast.id)} className="shrink-0 opacity-50 hover:opacity-100 transition">
        <X size={12} />
      </button>
    </div>
  );
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  let counter = 0;

  const add = useCallback((message, type = "info", duration) => {
    const id = ++counter;
    setToasts((prev) => [...prev.slice(-4), { id, message, type, duration }]);
    return id;
  }, []);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastCtx.Provider value={{ add, dismiss }}>
      {children}
      <div className="fixed bottom-10 right-4 z-[999] flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div key={t.id} className="pointer-events-auto">
            <ToastItem toast={t} dismiss={dismiss} />
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export default ToastProvider;
