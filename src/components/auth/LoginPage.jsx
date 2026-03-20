import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Loader2, Eye, EyeOff } from 'lucide-react'

const T = {
  text: '#1A1A1A', sub: '#ABABAB', border: 'rgba(0,0,0,0.08)', inputBg: 'rgba(255,255,255,0.5)',
  font: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
}

// 4-dot Kiko symbol for the avatar
const KikoDots = ({ size = 40, color = '#fff', animated = false }) => {
  const dots = [
    { cx: 15, cy: 17, delay: '0s' },
    { cx: 33, cy: 17, delay: '0.3s' },
    { cx: 20, cy: 31, delay: '0.6s' },
    { cx: 28, cy: 31, delay: '0.9s' },
  ]
  const r = size * 0.09
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      {dots.map((d, i) => (
        <circle key={i} cx={d.cx} cy={d.cy} r={Math.max(r, 2.5)} fill={color} opacity="0.85"
          style={animated ? { animation: `kikoDotPulse 2.5s ease-in-out ${d.delay} infinite` } : undefined} />
      ))}
    </svg>
  )
}

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [gLoading, setGLoading] = useState(false)

  const googleLogin = async () => {
    setGLoading(true); setError('')
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        scopes: 'openid email profile https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/calendar',
        redirectTo: `${window.location.origin}/login`,
        queryParams: { access_type: 'offline', prompt: 'consent' },
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

  const inputStyle = {
    width: '100%', height: 48, borderRadius: 12, border: `0.5px solid ${T.border}`,
    background: T.inputBg, padding: '0 16px', fontSize: 14, color: T.text, outline: 'none',
    fontFamily: T.font, transition: 'border-color 0.15s',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: '100vw', height: '100vh', background: '#FAFAFA', fontFamily: T.font }}>
      <div style={{ width: '100%', maxWidth: 340, textAlign: 'center' }}>

        {/* Kiko avatar — breathing animation with pulse rings */}
        <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 24 }}>
          {/* Pulse ring 1 */}
          <div style={{ position: 'absolute', width: 100, height: 100, borderRadius: 24, border: '1px solid rgba(26,26,26,0.08)', animation: 'kikoPulseRing 3s ease-out infinite' }} />
          {/* Pulse ring 2 */}
          <div style={{ position: 'absolute', width: 100, height: 100, borderRadius: 24, border: '1px solid rgba(26,26,26,0.06)', animation: 'kikoPulseRing 3s ease-out 1s infinite' }} />
          {/* Avatar */}
          <div style={{
            width: 72, height: 72, borderRadius: 20, background: T.text,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            animation: 'kikoBreatheScale 4s ease-in-out infinite',
          }}>
            <KikoDots size={32} color="#fff" animated />
          </div>
        </div>

        {/* Brand name */}
        <h1 style={{ fontSize: 28, fontWeight: 500, color: T.text, letterSpacing: '-0.02em', margin: '0 0 32px' }}>Kiko</h1>

        {/* Google OAuth */}
        <button onClick={googleLogin} disabled={gLoading} style={{
          width: '100%', height: 48, borderRadius: 12, border: `0.5px solid ${T.border}`, background: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, fontSize: 14, fontWeight: 500,
          color: T.text, cursor: 'pointer', fontFamily: T.font, transition: 'all 0.15s',
          boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
        }}>
          {gLoading ? <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> :
            <svg width="18" height="18" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>}
          Sign in with Google
        </button>

        {/* Divider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0' }}>
          <div style={{ flex: 1, height: 1, background: T.border }} />
          <span style={{ fontSize: 11, color: T.sub }}>or</span>
          <div style={{ flex: 1, height: 1, background: T.border }} />
        </div>

        {/* Email form */}
        <form onSubmit={emailLogin}>
          <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)} style={{ ...inputStyle, marginBottom: 10 }} />
          <div style={{ position: 'relative', marginBottom: 10 }}>
            <input type={showPw ? 'text' : 'password'} placeholder="Password" value={password}
              onChange={e => setPassword(e.target.value)} style={{ ...inputStyle, paddingRight: 44 }} />
            <button type="button" onClick={() => setShowPw(!showPw)} style={{
              position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', cursor: 'pointer', color: T.sub, padding: 0,
            }}>{showPw ? <EyeOff size={18} /> : <Eye size={18} />}</button>
          </div>
          {error && <p style={{ fontSize: 13, color: '#ef4444', background: '#fef2f2', padding: '8px 12px', borderRadius: 12, margin: '0 0 10px' }}>{error}</p>}
          <button type="submit" disabled={loading} style={{
            width: '100%', height: 48, borderRadius: 12, background: T.text, color: '#fff', border: 'none',
            fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: T.font, transition: 'background 0.15s',
          }}>{loading ? <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> : 'Sign in'}</button>
        </form>
      </div>
    </div>
  )
}
