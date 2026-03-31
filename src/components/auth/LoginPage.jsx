import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Loader2, Eye, EyeOff, ChevronDown, ChevronUp } from 'lucide-react'
import T from '@/lib/theme'
import AuroraCanvas from '@/components/AuroraCanvas'
import KikoWaveform from '@/components/kiko/KikoWaveform'

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
    transition: `opacity 0.9s ease ${delay}s, transform 0.9s ease ${delay}s`,
  })

  const glassInput = {
    width: '100%', height: 50, borderRadius: 14,
    border: '1px solid rgba(255,255,255,0.06)',
    background: 'rgba(255,255,255,0.03)',
    backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)',
    padding: '0 18px', fontSize: 14, color: 'rgba(255,255,255,0.8)', outline: 'none',
    fontFamily: T.font, fontWeight: 300, transition: 'all 0.2s',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100vw', height: '100vh', background: '#000000', fontFamily: T.font, position: 'relative', overflow: 'hidden' }}>
      <AuroraCanvas />

      {/* Ambient glow behind helix */}
      <div style={{ position: 'absolute', width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(circle, rgba(139,108,246,0.04) 0%, transparent 70%)', top: '50%', left: '50%', transform: 'translate(-50%, -65%)', zIndex: 1, pointerEvents: 'none' }} />

      <div style={{ width: '100%', maxWidth: 380, textAlign: 'center', position: 'relative', zIndex: 5, padding: '0 24px' }}>

        {/* Brand logo */}
        <div style={{ marginBottom: 64, display: 'flex', justifyContent: 'center', ...fade(0) }}>
          {customLogo ? (
            <img src={customLogo} alt="Logo" style={{ height: 28, maxWidth: 160, objectFit: 'contain', opacity: 0.5 }} />
          ) : (
            <>
              <span style={{ fontSize: 12, fontWeight: 400, color: 'rgba(255,255,255,0.2)', letterSpacing: '0.15em', fontFamily: T.font }}>VAN HAWKE</span>
              <span style={{ fontSize: 9, verticalAlign: 'super', color: 'rgba(255,255,255,0.12)', marginLeft: 2 }}>™</span>
            </>
          )}
        </div>

        {/* Kiko helix — large, centred, dramatic */}
        <div style={{ width: '100%', maxWidth: 420, margin: '0 auto 24px', overflow: 'visible', padding: '8px 0', ...fade(0.2),
          WebkitMaskImage: 'linear-gradient(to right, transparent 0%, black 8%, black 92%, transparent 100%)',
          maskImage: 'linear-gradient(to right, transparent 0%, black 8%, black 92%, transparent 100%)' }}>
          <KikoWaveform width={420} height={80} volume={0.15} />
        </div>

        {/* Kiko name + tagline */}
        <h1 style={{ fontSize: 33, fontWeight: 200, color: 'rgba(255,255,255,0.9)', letterSpacing: '-0.04em', margin: '0 0 6px', ...fade(0.4) }}>Kiko</h1>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.2)', fontWeight: 300, margin: '0 0 48px', letterSpacing: '0.02em', ...fade(0.5) }}>Intelligence, Applied</p>

        {/* Primary CTA — Google OAuth */}
        <div style={fade(0.6)}>
          <button onClick={googleLogin} disabled={gLoading} style={{
            width: '100%', height: 52, borderRadius: 14,
            border: '1px solid rgba(255,255,255,0.08)',
            background: 'rgba(255,255,255,0.04)',
            backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            fontSize: 14, fontWeight: 400, color: 'rgba(255,255,255,0.75)', cursor: 'pointer', fontFamily: T.font,
            transition: 'all 0.3s',
            boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
          }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'; e.currentTarget.style.transform = 'translateY(-1px)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.transform = 'translateY(0)' }}
          >
            {gLoading ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> :
              <svg width="16" height="16" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>}
            Continue with Google
          </button>
        </div>

        {/* Email toggle */}
        <div style={{ marginTop: 16, ...fade(0.7) }}>
          <button onClick={() => setShowEmail(!showEmail)} style={{
            background: 'none', border: 'none', color: 'rgba(255,255,255,0.15)', fontSize: 12, cursor: 'pointer',
            fontFamily: T.font, fontWeight: 300, display: 'flex', alignItems: 'center', gap: 4, margin: '0 auto',
            transition: 'color 0.2s', padding: '8px 0',
          }}
            onMouseEnter={e => e.currentTarget.style.color = 'rgba(255,255,255,0.35)'}
            onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.15)'}
          >
            Sign in with email {showEmail ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
        </div>

        {/* Email form — collapsed by default */}
        <div style={{ overflow: 'hidden', maxHeight: showEmail ? 260 : 0, opacity: showEmail ? 1 : 0, transition: 'max-height 0.4s ease, opacity 0.3s ease', marginTop: showEmail ? 12 : 0 }}>
          <form onSubmit={emailLogin}>
            <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)}
              style={{ ...glassInput, marginBottom: 8 }}
              onFocus={e => e.target.style.borderColor = 'rgba(139,108,246,0.25)'}
              onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.06)'} />
            <div style={{ position: 'relative', marginBottom: 10 }}>
              <input type={showPw ? 'text' : 'password'} placeholder="Password" value={password}
                onChange={e => setPassword(e.target.value)}
                style={{ ...glassInput, paddingRight: 44 }}
                onFocus={e => e.target.style.borderColor = 'rgba(139,108,246,0.25)'}
                onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.06)'} />
              <button type="button" onClick={() => setShowPw(!showPw)} style={{
                position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.12)', padding: 0,
              }}>{showPw ? <EyeOff size={16} /> : <Eye size={16} />}</button>
            </div>

            {error && <p style={{ fontSize: 13, color: 'rgba(255,80,80,0.7)', background: 'rgba(255,80,80,0.05)', padding: '8px 14px', borderRadius: 10, margin: '0 0 10px', border: '1px solid rgba(255,80,80,0.08)', fontFamily: T.font, fontWeight: 300 }}>{error}</p>}

            <button type="submit" disabled={loading} style={{
              width: '100%', height: 48, borderRadius: 14,
              background: 'linear-gradient(135deg, rgba(139,108,246,0.6), rgba(6,214,160,0.4))',
              color: 'rgba(255,255,255,0.9)', border: 'none',
              fontSize: 14, fontWeight: 400, cursor: 'pointer', fontFamily: T.font,
              transition: 'all 0.3s',
              boxShadow: '0 4px 24px rgba(139,108,246,0.2)',
              opacity: loading ? 0.5 : 1,
            }}
              onMouseEnter={e => { if (!loading) e.currentTarget.style.transform = 'translateY(-1px)' }}
              onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
            >{loading ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : 'Sign in'}</button>
          </form>
        </div>

        {/* Footer */}
        <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.08)', marginTop: 48, fontWeight: 300, ...fade(0.8) }}>By Van Hawke</p>
      </div>
    </div>
  )
}
