import { useState } from "react";
import { ChevronDown, Search, Brain, Wrench, Check, Loader2 } from "lucide-react";

const ICONS = {
  search: Search,
  memory: Brain,
  tool: Wrench,
};

function ThinkingStep({ step, isLast, isActive }) {
  const [open, setOpen] = useState(true);
  const Icon = ICONS[step.type] || Wrench;
  const done = !isActive || !isLast;

  return (
    <div className="thinking-step">
      <button
        onClick={() => setOpen(o => !o)}
        className="thinking-step-header"
        aria-expanded={open}
      >
        <span className="thinking-step-icon-wrap">
          {done ? (
            <Check size={12} className="thinking-icon done" />
          ) : (
            <Loader2 size={12} className="thinking-icon spinning" />
          )}
        </span>
        <Icon size={13} className="thinking-type-icon" />
        <span className="thinking-label">{step.label}</span>
        {step.results?.length > 0 && (
          <span className="thinking-count">{step.results.length} results</span>
        )}
        <ChevronDown
          size={13}
          className="thinking-chevron"
          style={{ transform: open ? "rotate(0deg)" : "rotate(-90deg)" }}
        />
      </button>

      {open && step.results?.length > 0 && (
        <ul className="thinking-results">
          {step.results.map((r, i) => (
            <li key={i} className="thinking-result-item" style={{ animationDelay: `${i * 40}ms` }}>
              <span className="result-title">{r.title}</span>
              <span className="result-domain">{r.domain}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function KikoThinking({ steps = [], isActive = false }) {
  if (!steps.length) return null;

  return (
    <>
      <style>{`
        .kiko-thinking {
          margin: 6px 0 10px 0;
          border-left: 2px solid rgba(139, 92, 246, 0.4);
          padding-left: 12px;
          animation: thinkingPulse 2s ease-in-out infinite;
        }
        .kiko-thinking.done {
          animation: none;
          border-left-color: rgba(139, 92, 246, 0.2);
        }
        @keyframes thinkingPulse {
          0%, 100% { border-left-color: rgba(139, 92, 246, 0.3); }
          50% { border-left-color: rgba(139, 92, 246, 0.8); }
        }
        .thinking-step { margin-bottom: 2px; }
        .thinking-step-header {
          display: flex;
          align-items: center;
          gap: 6px;
          width: 100%;
          background: none;
          border: none;
          cursor: pointer;
          padding: 4px 6px;
          border-radius: 6px;
          color: rgba(255,255,255,0.55);
          font-size: 12px;
          text-align: left;
          transition: background 0.15s, color 0.15s;
        }
        .thinking-step-header:hover {
          background: rgba(255,255,255,0.05);
          color: rgba(255,255,255,0.8);
        }
        .thinking-step-icon-wrap {
          width: 16px;
          height: 16px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .thinking-icon.done { color: #a78bfa; }
        .thinking-icon.spinning {
          color: #a78bfa;
          animation: spin 1s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
        .thinking-type-icon { color: rgba(255,255,255,0.3); flex-shrink: 0; }
        .thinking-label { flex: 1; font-weight: 500; letter-spacing: 0.01em; }
        .thinking-count {
          font-size: 10px;
          background: rgba(139,92,246,0.15);
          color: #a78bfa;
          padding: 1px 6px;
          border-radius: 10px;
          border: 1px solid rgba(139,92,246,0.2);
        }
        .thinking-chevron {
          color: rgba(255,255,255,0.25);
          flex-shrink: 0;
          transition: transform 0.2s ease;
        }
        .thinking-results {
          list-style: none;
          margin: 3px 0 6px 22px;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 1px;
        }
        .thinking-result-item {
          display: flex;
          align-items: baseline;
          gap: 8px;
          padding: 3px 6px;
          border-radius: 4px;
          font-size: 11px;
          animation: fadeSlideIn 0.25s ease forwards;
          opacity: 0;
          background: rgba(255,255,255,0.02);
        }
        .thinking-result-item:hover { background: rgba(255,255,255,0.05); }
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(-3px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .result-title {
          color: rgba(255,255,255,0.65);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 220px;
          font-weight: 500;
        }
        .result-domain {
          color: rgba(255,255,255,0.28);
          font-size: 10px;
          white-space: nowrap;
          flex-shrink: 0;
        }
      `}</style>

      <div className={`kiko-thinking ${!isActive ? "done" : ""}`}>
        {steps.map((step, i) => (
          <ThinkingStep
            key={i}
            step={step}
            isLast={i === steps.length - 1}
            isActive={isActive}
          />
        ))}
      </div>
    </>
  );
}
