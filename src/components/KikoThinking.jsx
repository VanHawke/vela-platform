import { Loader2, Check, Wrench } from "lucide-react"

export default function KikoThinking({ steps = [], isActive = false }) {
  if (!steps.length) return null
  return (
    <div style={{
      margin: '8px 0 8px 36px',
      padding: '10px 14px',
      borderRadius: 8,
      background: 'rgba(25,25,25,0.30)',
      backdropFilter: 'blur(16px) saturate(1.4)',
      WebkitBackdropFilter: 'blur(16px) saturate(1.4)',
      border: '0.5px solid rgba(0,0,0,0.08)',
      borderTop: '0.5px solid rgba(0,0,0,0.05)',
      boxShadow: 'inset 3px 3px 0.5px -3.5px rgba(0,0,0,0.08), inset -3px -3px 0.5px -3.5px rgba(0,0,0,0.06), inset 1px 1px 1px -0.5px rgba(0,0,0,0.05), inset -1px -1px 1px -0.5px rgba(0,0,0,0.05), 0 4px 16px rgba(0,0,0,0.20)',
      borderLeft: isActive ? '2px solid rgba(0,0,0,0.10)' : '2px solid rgba(0,0,0,0.14)',
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {steps.map((step, i) => {
          const done = !isActive || i < steps.length - 1
          return (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0',
              fontSize: 12, color: done ? '#6B6B6B' : 'rgba(124,92,252,0.7)',
              fontFamily: "ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
            }}>
              {done
                ? <Check style={{ width: 13, height: 13, color: 'rgba(124,92,252,0.6)' }} />
                : <Loader2 style={{ width: 13, height: 13, color: 'rgba(124,92,252,0.5)', animation: 'spin 1s linear infinite' }} />
              }
              <Wrench style={{ width: 12, height: 12, color: '#A0A0A0' }} />
              <span style={{ fontWeight: 500 }}>{step.label}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
