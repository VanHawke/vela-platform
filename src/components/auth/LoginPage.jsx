// src/components/auth/LoginPage.jsx — REBUILT clean (Block C)
// Same structure: centered card, brand logo, Google OAuth primary, email collapsible, footer.
// Every color from tokens — zero hardcoded values.
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Loader2, Eye, EyeOff, ChevronDown, ChevronUp } from 'lucide-react'
import { t } from '@/lib/tokens'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [gLoading, setGLoading] = useState(false)
  const [showEmail, setShowEmail] = useState(false)
  const [customLogo] = useState(() => { try { return localStorage.getItem('custom_logo_url') } catch { return null } })
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
    transition: `opacity 0.6s ease ${delay}s, transform 0.6s ease ${delay}s`,
  })

  const inputStyle = {
    width: '100%', height: 44, borderRadius: t.radius,
    border: `1px solid ${t.input}`, background: t.bg,
    padding: '0 14px', fontSize: 14, color: t.fg, outline: 'none',
    fontFamily: t.fontSans, fontWeight: 400, transition: 'border-color 0.2s',
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      width: '100vw', height: '100vh', background: t.bg, fontFamily: t.fontSans, position: 'relative',
    }}>
      <div style={{ width: '100%', maxWidth: 380, textAlign: 'center', padding: '0 24px' }}>

        {/* Brand logo */}
        <div style={{ marginBottom: 48, display: 'flex', justifyContent: 'center', ...fade(0) }}>
          {customLogo ? (
            <img src={customLogo} alt="Logo" style={{ height: 28, maxWidth: 160, objectFit: 'contain' }} />
          ) : (
            <span style={{ fontSize: 13, fontWeight: 600, color: t.fg, letterSpacing: '0.18em' }}>
              VAN HAWKE<sup style={{ fontSize: 8, opacity: 0.5 }}>™</sup>
            </span>
          )}
        </div>

        {/* Kiko name + tagline */}
        <h1 style={{
          fontSize: 36, fontWeight: 600, color: t.fg, letterSpacing: '-0.03em',
          margin: '0 0 8px', fontFamily: t.fontSerif, ...fade(0.1)
        }}>Kiko</h1>
        <p style={{
          fontSize: 14, color: t.mutedFg, fontWeight: 400, margin: '0 0 40px',
          letterSpacing: '0.02em', ...fade(0.15)
        }}>Intelligence, Applied</p>

        {/* Primary CTA — Google OAuth */}
        <div style={fade(0.2)}>
          <button onClick={googleLogin} disabled={gLoading} style={{
            width: '100%', height: 48, borderRadius: t.radius,
            border: `1px solid ${t.border}`, background: t.card, color: t.fg,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: t.fontSans,
            transition: 'all 0.15s', boxShadow: t.shadowSm,
          }}
            onMouseEnter={e => { e.currentTarget.style.background = t.muted; e.currentTarget.style.borderColor = t.ring }}
            onMouseLeave={e => { e.currentTarget.style.background = t.card; e.currentTarget.style.borderColor = t.border }}
          >
            {gLoading ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : (
              <svg width="16" height="16" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
            )}
            Continue with Google
          </button>
        </div>

        {/* Email toggle */}
        <div style={{ marginTop: 16, ...fade(0.25) }}>
          <button onClick={() => setShowEmail(!showEmail)} style={{
            background: 'none', border: 'none', color: t.mutedFg, fontSize: 12, cursor: 'pointer',
            fontFamily: t.fontSans, fontWeight: 400, display: 'flex', alignItems: 'center', gap: 4,
            margin: '0 auto', padding: '8px 0',
          }}>
            Sign in with email {showEmail ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
        </div>

        {/* Email form (collapsible) */}
        <div style={{
          overflow: 'hidden',
          maxHeight: showEmail ? 260 : 0,
          opacity: showEmail ? 1 : 0,
          transition: 'max-height 0.3s ease, opacity 0.2s ease',
          marginTop: showEmail ? 12 : 0,
        }}>
          <form onSubmit={emailLogin}>
            <input
              type="email" placeholder="Email" value={email}
              onChange={e => setEmail(e.target.value)}
              style={{ ...inputStyle, marginBottom: 8 }}
              onFocus={e => e.target.style.borderColor = t.ring}
              onBlur={e => e.target.style.borderColor = t.input}
            />
            <div style={{ position: 'relative', marginBottom: 10 }}>
              <input
                type={showPw ? 'text' : 'password'} placeholder="Password" value={password}
                onChange={e => setPassword(e.target.value)}
                style={{ ...inputStyle, paddingRight: 40 }}
                onFocus={e => e.target.style.borderColor = t.ring}
                onBlur={e => e.target.style.borderColor = t.input}
              />
              <button type="button" onClick={() => setShowPw(!showPw)} style={{
                position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer', color: t.mutedFg, padding: 0,
              }}>{showPw ? <EyeOff size={16} /> : <Eye size={16} />}</button>
            </div>

            {error && (
              <p style={{
                fontSize: 13, color: t.destructive,
                background: 'color-mix(in srgb, var(--destructive) 8%, transparent)',
                padding: '8px 12px', borderRadius: t.radius,
                margin: '0 0 10px', border: `1px solid ${t.destructive}`,
                fontFamily: t.fontSans, fontWeight: 400,
              }}>{error}</p>
            )}

            <button type="submit" disabled={loading} style={{
              width: '100%', height: 44, borderRadius: t.radius,
              background: t.primary, color: t.primaryFg, border: 'none',
              fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: t.fontSans,
              transition: 'all 0.15s', opacity: loading ? 0.5 : 1,
            }}>
              {loading ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : 'Sign in'}
            </button>
          </form>
        </div>

        {/* Footer */}
        <p style={{ fontSize: 11, color: t.mutedFg, marginTop: 40, fontWeight: 400, ...fade(0.3) }}>By Van Hawke</p>
      </div>
    </div>
  )
}
