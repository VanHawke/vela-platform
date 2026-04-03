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
      border: '0.5px solid rgba(32,30,24,0.50)',
      borderTop: '0.5px solid rgba(255,224,194,0.08)',
      boxShadow: 'inset 3px 3px 0.5px -3.5px rgba(255,224,194,0.12), inset -3px -3px 0.5px -3.5px rgba(255,224,194,0.10), inset 1px 1px 1px -0.5px rgba(255,224,194,0.08), inset -1px -1px 1px -0.5px rgba(255,224,194,0.08), 0 4px 16px rgba(0,0,0,0.20)',
      borderLeft: isActive ? '2px solid rgba(255,224,194,0.25)' : '2px solid rgba(32,30,24,0.40)',
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {steps.map((step, i) => {
          const done = !isActive || i < steps.length - 1
          return (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0',
              fontSize: 12, color: done ? 'rgba(238,238,238,0.5)' : 'rgba(255,224,194,0.7)',
              fontFamily: "ui-sans-serif, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
            }}>
              {done
                ? <Check style={{ width: 13, height: 13, color: 'rgba(255,224,194,0.6)' }} />
                : <Loader2 style={{ width: 13, height: 13, color: 'rgba(255,224,194,0.5)', animation: 'spin 1s linear infinite' }} />
              }
              <Wrench style={{ width: 12, height: 12, color: 'rgba(255,224,194,0.2)' }} />
              <span style={{ fontWeight: 500 }}>{step.label}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
