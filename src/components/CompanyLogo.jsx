// CompanyLogo — shows Clearbit logo or fallback initials
import { useState } from 'react'

export default function CompanyLogo({ domain, name, size = 24, style = {} }) {
  const [failed, setFailed] = useState(false)
  const initial = (name || '?')[0].toUpperCase()
  
  // Try to derive domain from company name if not provided
  const logoDomain = domain || (name ? name.toLowerCase().replace(/[^a-z0-9]/g, '') + '.com' : null)
  
  if (!logoDomain || failed) {
    return (
      <div style={{
        width: size, height: size, borderRadius: size > 20 ? 8 : 6, flexShrink: 0,
        background: 'rgba(255,224,194,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: size * 0.4, fontWeight: 600, color: 'rgba(255,224,194,0.5)', ...style,
      }}>{initial}</div>
    )
  }

  return (
    <img 
      src={`https://logo.clearbit.com/${logoDomain}`}
      alt={name || ''}
      onError={() => setFailed(true)}
      style={{ width: size, height: size, borderRadius: size > 20 ? 8 : 6, flexShrink: 0, objectFit: 'contain', background: 'rgba(238,238,238,0.06)', ...style }}
    />
  )
}
