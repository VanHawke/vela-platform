import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { Loader2, Eye, EyeOff } from 'lucide-react'

const T = {
  text: '#1A1A1A', sub: '#ABABAB', border: 'rgba(0,0,0,0.06)', inputBg: 'rgba(255,255,255,0.5)',
  font: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
}

const KikoVortex = ({ size = 140, opacity = 0.10, spin = 22 }) => (
  <div style={{ animation: `loginVortexBreathe 6s ease-in-out infinite`, opacity }}>
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      style={{ animation: `loginVortexSpin ${spin}s linear infinite` }}>
      <circle cx="12" cy="12" r="3" fill={T.text} />
      <path d="M12 2C12 2 17 5.5 17 8.5" stroke={T.text} strokeWidth="1.8" strokeLinecap="round" />
      <path d="M22 12C22 12 18.5 17 15.5 17" stroke={T.text} strokeWidth="1.8" strokeLinecap="round" />
      <path d="M12 22C12 22 7 18.5 7 15.5" stroke={T.text} strokeWidth="1.8" strokeLinecap="round" />
      <path d="M2 12C2 12 5.5 7 8.5 7" stroke={T.text} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  </div>
)

const KikoVortexWhite = ({ size = 24 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    style={{ animation: 'loginVortexSpin 2s linear infinite' }}>
    <circle cx="12" cy="12" r="3" fill="#fff" />
    <path d="M12 2C12 2 17 5.5 17 8.5" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
    <path d="M22 12C22 12 18.5 17 15.5 17" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
    <path d="M12 22C12 22 7 18.5 7 15.5" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
    <path d="M2 12C2 12 5.5 7 8.5 7" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
  </svg>
)
const getGreeting = () => {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [gLoading, setGLoading] = useState(false)
  const [transitioning, setTransitioning] = useState(false)
  const [transitionStep, setTransitionStep] = useState(0)
  const leftRef = useRef(null)
  const rightRef = useRef(null)

  const googleLogin = async () => {
    setGLoading(true); setError('')
    startTransition()
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: {
      scopes: 'openid email profile https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/calendar',
      redirectTo: `${window.location.origin}/`, queryParams: { access_type: 'offline', prompt: 'consent' } } })
    if (error) { setError(error.message); setGLoading(false); setTransitioning(false); setTransitionStep(0) }
  }

  const emailLogin = async (e) => {
    e.preventDefault(); setError('')
    if (!email || !password) { setError('Email and password required.'); return }
    setLoading(true)
    startTransition()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError(error.message); setLoading(false); setTransitioning(false); setTransitionStep(0) }
  }
  const startTransition = () => {
    setTransitioning(true)
    setTimeout(() => setTransitionStep(1), 100)   // fade panels
    setTimeout(() => setTransitionStep(2), 600)   // kiko badge
    setTimeout(() => setTransitionStep(3), 1000)  // greeting
    setTimeout(() => setTransitionStep(4), 1400)  // stats
    setTimeout(() => setTransitionStep(5), 1800)  // progress bar
  }

  const inputStyle = {
    width: '100%', height: 48, borderRadius: 12, border: `0.5px solid ${T.border}`,
    background: T.inputBg, padding: '0 16px', fontSize: 14, color: T.text, outline: 'none',
    fontFamily: T.font, transition: 'border-color 0.15s',
  }

  const greeting = getGreeting()

  return (
    <div style={{ display: 'flex', width: '100vw', height: '100vh', overflow: 'hidden', background: '#fff', fontFamily: T.font, position: 'relative' }}>

      {/* ── LEFT: Frosted glass auth panel ── */}
      <div ref={leftRef} style={{
        flex: '0 0 55%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 40px',
        background: 'rgba(255,255,255,0.88)', backdropFilter: 'blur(40px)', WebkitBackdropFilter: 'blur(40px)',
        zIndex: 2, transition: 'opacity 0.5s ease-out', opacity: transitioning && transitionStep >= 1 ? 0 : 1,
      }}>
        <div style={{ width: '100%', maxWidth: 340 }}>
          {/* Vela mark + wordmark */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 36 }}>
            <div style={{ width: 32, height: 32, borderRadius: 9, background: T.text, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <KikoVortexWhite size={16} />
            </div>
            <span style={{ fontSize: 18, fontWeight: 500, color: T.text }}>Vela</span>
          </div>
          {/* Time-based greeting */}
          <h1 style={{ fontSize: 30, fontWeight: 300, color: T.text, letterSpacing: '-0.02em', margin: '0 0 4px' }}>{greeting}</h1>
          <p style={{ fontSize: 13, color: T.sub, margin: '0 0 32px' }}>Sign in to continue</p>

          {/* Google OAuth */}
          <button onClick={googleLogin} disabled={gLoading} style={{
            width: '100%', height: 48, borderRadius: 12, border: `0.5px solid ${T.border}`, background: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, fontSize: 14, fontWeight: 500,
            color: T.text, cursor: 'pointer', fontFamily: T.font, transition: 'all 0.15s',
            boxShadow: '0 2px 8px rgba(0,0,0,0.03), inset 0 1px 0 rgba(255,255,255,1)',
          }}>
            {gLoading ? <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> :
              <svg width="18" height="18" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>}
            Continue with Google
          </button>

          {/* Divider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0' }}>
            <div style={{ flex: 1, height: 1, background: T.border }} />
            <span style={{ fontSize: 11, color: T.sub }}>or</span>
            <div style={{ flex: 1, height: 1, background: T.border }} />
          </div>
          {/* Email form */}
          <form onSubmit={emailLogin}>
            <input type="email" placeholder="Email" value={email} onChange={e => setEmail(e.target.value)}
              style={{ ...inputStyle, marginBottom: 10 }} />
            <div style={{ position: 'relative', marginBottom: 10 }}>
              <input type={showPw ? 'text' : 'password'} placeholder="Password" value={password}
                onChange={e => setPassword(e.target.value)} style={{ ...inputStyle, paddingRight: 44 }} />
              <button type="button" onClick={() => setShowPw(!showPw)} style={{
                position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                background: 'none', border: 'none', cursor: 'pointer', color: T.sub, padding: 0,
              }}>
                {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
            {error && <p style={{ fontSize: 13, color: '#ef4444', background: '#fef2f2', padding: '8px 12px', borderRadius: 12, margin: '0 0 10px' }}>{error}</p>}
            <button type="submit" disabled={loading} style={{
              width: '100%', height: 48, borderRadius: 12, background: T.text, color: '#fff', border: 'none',
              fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: T.font, transition: 'background 0.15s',
            }}>
              {loading ? <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> : 'Sign in'}
            </button>
          </form>
          <p style={{ textAlign: 'center', fontSize: 10, color: '#CDCDCD', marginTop: 32 }}>Powered by Vela Labs</p>
        </div>
      </div>
      {/* ── RIGHT: Ambient vortex panel ── */}
      <div ref={rightRef} style={{
        flex: '0 0 45%', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#FAFAFA', overflow: 'hidden', transition: 'opacity 0.5s ease-out',
        opacity: transitioning && transitionStep >= 1 ? 0 : 1,
      }}>
        <KikoVortex size={140} opacity={0.10} spin={22} />
      </div>

      {/* ── TRANSITION OVERLAY: Sequential reveal ── */}
      {transitioning && transitionStep >= 2 && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 20, background: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          animation: 'loginFadeIn 0.3s ease-out forwards',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            {/* Kiko badge */}
            <div style={{
              width: 52, height: 52, borderRadius: 13, background: T.text,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              animation: 'loginScaleIn 0.4s ease-out forwards',
            }}>
              <KikoVortexWhite size={24} />
            </div>
            {/* Greeting */}
            {transitionStep >= 3 && (
              <>
                <h2 style={{ marginTop: 20, fontSize: 24, fontWeight: 300, color: T.text, animation: 'loginSlideUp 0.5s ease-out forwards' }}>
                  {greeting}, Sunny
                </h2>
                <p style={{ marginTop: 6, fontSize: 12, color: T.sub, animation: 'loginSlideUp 0.4s 0.15s ease-out both' }}>
                  Kiko is syncing your latest data
                </p>
              </>
            )}

            {/* Stats cascade */}
            {transitionStep >= 4 && (
              <div style={{ display: 'flex', gap: 28, marginTop: 28 }}>
                {[{ label: 'New alerts', value: '3' }, { label: 'Emails synced', value: '12' }, { label: 'Meetings today', value: '2' }].map((s, i) => (
                  <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: i < 2 ? 28 : 0 }}>
                    <div style={{ textAlign: 'center', animation: `loginSlideRight 0.4s ${i * 0.15}s ease-out both` }}>
                      <div style={{ fontSize: 11, color: T.sub, marginBottom: 4 }}>{s.label}</div>
                      <div style={{ fontSize: 22, fontWeight: 500, color: T.text }}>{s.value}</div>
                    </div>
                    {i < 2 && <div style={{ width: 1, height: 32, background: T.border, marginLeft: 0, animation: `loginFadeIn 0.3s ${i * 0.15 + 0.1}s ease-out both` }} />}
                  </div>
                ))}
              </div>
            )}

            {/* Progress bar */}
            {transitionStep >= 5 && (
              <div style={{ width: 140, height: 3, borderRadius: 2, background: 'rgba(0,0,0,0.06)', marginTop: 24, overflow: 'hidden', animation: 'loginFadeIn 0.3s ease-out forwards' }}>
                <div style={{ height: '100%', background: T.text, borderRadius: 2, width: 0, animation: 'loginFillBar 1.6s ease-in-out forwards' }} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}