import { Loader2, Check, Wrench } from "lucide-react"

export default function KikoThinking({ steps = [], isActive = false }) {
  if (!steps.length) return null
  return (
    <div style={{
      margin: '8px 0 8px 36px',
      padding: '10px 14px',
      borderRadius: 8,
      background: 'var(--card)',
      backdropFilter: 'blur(16px) saturate(1.4)',
      WebkitBackdropFilter: 'blur(16px) saturate(1.4)',
      border: '0.5px solid var(--ring)',
      borderTop: '0.5px solid var(--accent)',
      boxShadow: 'inset 3px 3px 0.5px -3.5px var(--accent), inset -3px -3px 0.5px -3.5px var(--accent), inset 1px 1px 1px -0.5px var(--accent), inset -1px -1px 1px -0.5px var(--accent), 0 4px 16px var(--border)',
      borderLeft: isActive ? '2px solid var(--ring)' : '2px solid var(--ring)',
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {steps.map((step, i) => {
          const done = !isActive || i < steps.length - 1
          return (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0',
              fontSize: 12, color: done ? 'var(--muted-foreground)' : 'var(--primary)',
              fontFamily: "ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
            }}>
              {done
                ? <Check style={{ width: 13, height: 13, color: 'var(--primary)' }} />
                : <Loader2 style={{ width: 13, height: 13, color: 'var(--primary)', animation: 'spin 1s linear infinite' }} />
              }
              <Wrench style={{ width: 12, height: 12, color: 'var(--accent)' }} />
              <span style={{ fontWeight: 500 }}>{step.label}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
