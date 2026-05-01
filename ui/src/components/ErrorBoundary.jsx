import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, stack: null };
  }

  static getDerivedStateFromError(error) {
    return { error, stack: error.stack || null };
  }

  componentDidCatch(error, info) {
    console.error("[CoLwork] React crash:", error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="h-full flex items-center justify-center p-8">
          <div className="bg-zinc-900/60 border border-red-500/30 rounded-xl p-6 max-w-lg text-center backdrop-blur-sm">
            <AlertTriangle size={32} className="text-red-400 mx-auto mb-3" strokeWidth={1.5} />
            <h3 className="text-base font-semibold text-red-300">Component Crashed</h3>
            <p className="text-xs text-zinc-400 mt-2 font-mono line-clamp-4">
              {this.state.error.message || "Unknown error"}
            </p>
            <button
              onClick={() => this.setState({ error: null, stack: null })}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-sm rounded-lg border border-zinc-700 transition"
            >
              <RefreshCw size={14} /> Retry
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
