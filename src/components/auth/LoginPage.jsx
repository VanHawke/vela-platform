import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Loader2, Eye, EyeOff, ChevronDown, ChevronUp } from 'lucide-react'
import T from '@/lib/theme'
import KikoAvatar from '@/components/kiko/KikoAvatar'
import { useOrg } from '@/contexts/OrgContext'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [gLoading, setGLoading] = useState(false)
  const [showEmail, setShowEmail] = useState(false)
  const { logoUrl: customLogo } = useOrg() || {}
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setTimeout(() => setMounted(true), 100) }, [])

  const googleLogin = async () => {
    setGLoading(true); setError('')
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        scopes: 'openid email profile https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/calendar',
        redirectTo: `${window.location.origin}/login`,
        queryParams: { access_type: 'offline' },
      }
    })
    if (error) { setError(error.message); setGLoading(false) }
  }

  const emailLogin = async (e) => {
    e.preventDefault(); setError('')
    if (!email || !password) { setError('Email and password required.'); return }
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError(error.message); setLoading(false) }
  }

  const fade = (delay) => ({
    opacity: mounted ? 1 : 0,
    transform: mounted ? 'translateY(0)' : 'translateY(16px)',
    transition: `opacity 0.9s ease ${delay}s, transform 0.9s ease ${delay}s`,
  })

  // Legora-style soft input — clean white with hairline border
  const cleanInput = {
    width: '100%', height: 48, borderRadius: T.radiusCta,
    border: `1px solid ${T.border}`,
    background: T.card,
    padding: '0 16px', fontSize: 13.5, color: T.text, outline: 'none',
    fontFamily: T.font, fontWeight: T.weightNormal, transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
  }

  // Subtle floating gradient orbs (warm Legora palette) for ambient atmosphere
  const orb = (top, left, color, size) => ({
    position: 'absolute', width: size, height: size, borderRadius: '50%',
    background: `radial-gradient(circle, ${color} 0%, transparent 70%)`,
    top, left, filter: 'blur(60px)', opacity: 0.5, zIndex: 1, pointerEvents: 'none',
    animation: 'kikoBreatheScale 16s ease-in-out infinite',
  })

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      width: '100vw', height: '100vh', background: T.bg,
      fontFamily: T.font, position: 'relative', overflow: 'hidden',
    }}>
      {/* Soft warm gradient orbs — Legora-style ambient background */}
      <div style={orb('-10%', '-5%', 'rgba(232,220,196,0.55)', 600)} />
      <div style={orb('60%', '70%', 'rgba(216,148,114,0.30)', 500)} />
      <div style={orb('40%', '40%', 'rgba(181,191,160,0.35)', 400)} />

      <div style={{ width: '100%', maxWidth: 380, textAlign: 'center', position: 'relative', zIndex: 5, padding: '0 24px' }}>

        {/* Spacer — brand wordmark removed */}
        <div style={{ marginBottom: 56, ...fade(0) }} />

        {/* Kiko waveform — soft, centred */}
        <div style={{
          width: '100%', maxWidth: 420, margin: '0 auto 28px', overflow: 'visible', padding: '8px 0',
          display: 'flex', justifyContent: 'center', alignItems: 'center', opacity: 0.85,
          WebkitMaskImage: 'linear-gradient(to right, transparent 0%, black 12%, black 88%, transparent 100%)',
          maskImage: 'linear-gradient(to right, transparent 0%, black 12%, black 88%, transparent 100%)',
          ...fade(0.2),
        }}>
          <KikoAvatar size={42} state="idle" />
        </div>

        {/* Kiko name in Source Serif 4 */}
        <h1 style={{
          fontSize: 44, fontWeight: 300, color: T.text,
          fontFamily: T.fontDisplay, letterSpacing: '-0.02em',
          margin: '0 0 8px', lineHeight: 1.0, ...fade(0.4),
        }}>Kiko</h1>
        <p style={{
          fontSize: 13, color: T.textSecondary, fontWeight: T.weightNormal,
          margin: '0 0 44px', letterSpacing: '0.01em', ...fade(0.5),
        }}>Intelligence, applied.</p>

        {/* Primary CTA — Google OAuth — Legora-style black */}
        <div style={fade(0.6)}>
          <button onClick={googleLogin} disabled={gLoading} style={{
            width: '100%', height: 48, borderRadius: T.radiusCta,
            border: 'none', background: T.accent, color: '#FFFFFF',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: T.font,
            transition: 'opacity 0.15s ease',
          }}
            onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
            onMouseLeave={e => e.currentTarget.style.opacity = '1'}
          >
            {gLoading ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> :
              <svg width="16" height="16" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>}
            Continue with Google
          </button>
        </div>

        {/* Email toggle */}
        <div style={{ marginTop: 14, ...fade(0.7) }}>
          <button onClick={() => setShowEmail(!showEmail)} style={{
            background: 'none', border: 'none', color: T.textSecondary, fontSize: 12, cursor: 'pointer',
            fontFamily: T.font, fontWeight: T.weightNormal, display: 'flex', alignItems: 'center', gap: 4, margin: '0 auto',
            transition: 'color 0.15s ease', padding: '8px 0',
          }}
            onMouseEnter={e => e.currentTarget.style.color = T.text}
            onMouseLeave={e => e.currentTarget.style.color = T.textSecondary}
          >
            Sign in with email {showEmail ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
        </div>

        {/* Email form — collapsed by default */}
        <div style={{ overflow: 'hidden', maxHeight: showEmail ? 260 : 0, opacity: showEmail ? 1 : 0, transition: 'max-height 0.4s ease, opacity 0.3s ease', marginTop: showEmail ? 12 : 0 }}>
          <form onSubmit={emailLogin}>
            <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)}
              style={{ ...cleanInput, marginBottom: 8 }}
              onFocus={e => { e.target.style.borderColor = T.text; e.target.style.boxShadow = `0 0 0 3px ${T.accentSoft}` }}
              onBlur={e => { e.target.style.borderColor = T.border; e.target.style.boxShadow = 'none' }} />
            <div style={{ position: 'relative', marginBottom: 10 }}>
              <input type={showPw ? 'text' : 'password'} placeholder="Password" value={password}
                onChange={e => setPassword(e.target.value)}
                style={{ ...cleanInput, paddingRight: 44 }}
                onFocus={e => { e.target.style.borderColor = T.text; e.target.style.boxShadow = `0 0 0 3px ${T.accentSoft}` }}
                onBlur={e => { e.target.style.borderColor = T.border; e.target.style.boxShadow = 'none' }} />
              <button type="button" onClick={() => setShowPw(!showPw)} style={{
                position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer', color: T.textSecondary, padding: 0,
              }}>{showPw ? <EyeOff size={16} /> : <Eye size={16} />}</button>
            </div>

            {error && <p style={{
              fontSize: 12.5, color: T.danger, background: 'rgba(184,100,62,0.06)',
              padding: '8px 14px', borderRadius: T.radiusCta, margin: '0 0 10px',
              border: `1px solid rgba(184,100,62,0.18)`, fontFamily: T.font, fontWeight: T.weightNormal,
            }}>{error}</p>}

            <button type="submit" disabled={loading} style={{
              width: '100%', height: 46, borderRadius: T.radiusCta,
              background: T.accent, color: '#FFFFFF', border: 'none',
              fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: T.font,
              transition: 'opacity 0.15s ease',
              opacity: loading ? 0.5 : 1,
            }}
              onMouseEnter={e => { if (!loading) e.currentTarget.style.opacity = '0.85' }}
              onMouseLeave={e => { if (!loading) e.currentTarget.style.opacity = '1' }}
            >{loading ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : 'Sign in'}</button>
          </form>
        </div>

        {/* Footer */}
        <p style={{
          fontSize: 11, color: T.textTertiary, marginTop: 48,
          fontWeight: T.weightNormal, letterSpacing: '0.06em', ...fade(0.8),
        }}>BY VAN HAWKE</p>
      </div>
    </div>
  )
}
