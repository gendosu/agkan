// ui.jsx — small shared UI bits
const { useState, useEffect, useRef, useMemo, useCallback } = React;

function Icon({ name, size = 18, color = "currentColor" }) {
  const s = size;
  const common = { width: s, height: s, viewBox: "0 0 24 24", fill: "none", stroke: color, strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" };
  switch (name) {
    case "terminal": return <svg {...common}><path d="M4 17l6-6-6-6"/><path d="M12 19h8"/></svg>;
    case "kanban": return <svg {...common}><rect x="3" y="3" width="6" height="14" rx="1.5"/><rect x="11" y="3" width="6" height="10" rx="1.5"/><rect x="19" y="3" width="2" height="7" rx="1"/></svg>;
    case "ai": return <svg {...common}><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/><circle cx="12" cy="12" r="4"/></svg>;
    case "db": return <svg {...common}><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.66 3.58 3 8 3s8-1.34 8-3V5"/><path d="M4 11v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6"/></svg>;
    case "tree": return <svg {...common}><rect x="3" y="3" width="6" height="4"/><rect x="3" y="17" width="6" height="4"/><rect x="15" y="10" width="6" height="4"/><path d="M9 5h3v7h3M9 19h3v-7"/></svg>;
    case "link": return <svg {...common}><path d="M10 14a5 5 0 007 0l3-3a5 5 0 00-7-7l-1 1"/><path d="M14 10a5 5 0 00-7 0l-3 3a5 5 0 007 7l1-1"/></svg>;
    case "tag": return <svg {...common}><path d="M20 12l-8 8-8-8V4h8z"/><circle cx="8.5" cy="8.5" r="1.5"/></svg>;
    case "browser": return <svg {...common}><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 9h20"/><circle cx="5" cy="6.5" r="0.5" fill={color}/><circle cx="7" cy="6.5" r="0.5" fill={color}/><circle cx="9" cy="6.5" r="0.5" fill={color}/></svg>;
    case "braces": return <svg {...common}><path d="M8 3C5 3 5 7 5 9s-2 3-2 3 2 1 2 3 0 6 3 6"/><path d="M16 3c3 0 3 4 3 6s2 3 2 3-2 1-2 3 0 6-3 6"/></svg>;
    case "arrow-right": return <svg {...common}><path d="M5 12h14M13 6l6 6-6 6"/></svg>;
    case "github": return <svg {...common} fill={color} stroke="none"><path d="M12 2a10 10 0 00-3.16 19.49c.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.45-1.15-1.11-1.46-1.11-1.46-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.89 1.53 2.34 1.09 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.56-1.11-4.56-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02a9.56 9.56 0 015 0c1.91-1.29 2.75-1.02 2.75-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85v2.74c0 .26.18.58.69.48A10 10 0 0012 2z"/></svg>;
    case "npm": return <svg width={size} height={size} viewBox="0 0 24 24" fill={color}><path d="M2 10h20v10h-10v-8h-3v8H2V10z"/></svg>;
    case "copy": return <svg {...common}><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>;
    case "check": return <svg {...common}><path d="M5 13l4 4L19 7"/></svg>;
    case "play": return <svg {...common} fill={color} stroke="none"><path d="M7 4l12 8-12 8z"/></svg>;
    case "pause": return <svg {...common}><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>;
    case "replay": return <svg {...common}><path d="M3 12a9 9 0 109-9"/><path d="M3 3v6h6"/></svg>;
    default: return null;
  }
}

function CopyButton({ text, t, small }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className={small ? "copy-btn" : "copy-btn"}
      onClick={() => {
        try { navigator.clipboard.writeText(text); } catch {}
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      }}
    >
      <Icon name={copied ? "check" : "copy"} size={12} /> {copied ? t.copied : t.copy}
    </button>
  );
}

Object.assign(window, { Icon, CopyButton });
