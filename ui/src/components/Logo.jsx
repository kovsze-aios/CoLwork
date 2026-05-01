import React from "react";

/**
 * CoLwork logomark — synthesizes three signals:
 *   • Neural network: three layered nodes connected by edges (Mixture-of-Experts agents)
 *   • Connection: a strong horizontal "link" line through the middle (LinkedIn / networking)
 *   • Terminal: a chevron/cursor on the right (developer-first runtime)
 *
 * Pure SVG, no raster, scales infinitely. Honors `currentColor` for the chevron
 * so it inherits the page foreground when used as a glyph next to text.
 */
export function LogoMark({ size = 28, accent = "#0A66C2", className = "" }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="CoLwork logo"
    >
      <defs>
        <linearGradient id="cw-grad" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor={accent} stopOpacity="1" />
          <stop offset="100%" stopColor={accent} stopOpacity="0.55" />
        </linearGradient>
        <radialGradient id="cw-glow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0%" stopColor={accent} stopOpacity="0.35" />
          <stop offset="100%" stopColor={accent} stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Soft ambient glow */}
      <circle cx="32" cy="32" r="30" fill="url(#cw-glow)" />

      {/* Neural edges — left column → middle hub → right column */}
      <g stroke="url(#cw-grad)" strokeWidth="1.6" strokeLinecap="round">
        <line x1="14" y1="18" x2="32" y2="32" />
        <line x1="14" y1="32" x2="32" y2="32" />
        <line x1="14" y1="46" x2="32" y2="32" />
        <line x1="32" y1="32" x2="50" y2="22" />
        <line x1="32" y1="32" x2="50" y2="42" />
      </g>

      {/* Network nodes (agents) */}
      <g fill={accent}>
        <circle cx="14" cy="18" r="3" />
        <circle cx="14" cy="32" r="3" />
        <circle cx="14" cy="46" r="3" />
        <circle cx="50" cy="22" r="3" />
        <circle cx="50" cy="42" r="3" />
      </g>

      {/* Central hub — the MoE board */}
      <circle cx="32" cy="32" r="5" fill="#09090b" stroke={accent} strokeWidth="2" />
      <circle cx="32" cy="32" r="1.6" fill={accent} />

      {/* Terminal chevron + caret — bottom right, the developer surface */}
      <g stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" fill="none">
        <polyline points="42,52 47,57 42,62" />
        <line x1="50" y1="62" x2="56" y2="62" />
      </g>
    </svg>
  );
}

/**
 * Wordmark — logomark + "CoLwork" set in the system display font.
 * The dot of the "o" picks up the brand accent for a subtle visual hook.
 */
export function LogoWordmark({ size = 28, accent = "#0A66C2", className = "" }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <LogoMark size={size} accent={accent} />
      <span className="text-white font-bold tracking-tight" style={{ fontSize: Math.round(size * 0.62) }}>
        Co<span style={{ color: accent }}>L</span>work
      </span>
    </div>
  );
}

export default LogoMark;
