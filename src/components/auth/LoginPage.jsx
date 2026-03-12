import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Loader2, Eye, EyeOff } from 'lucide-react'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [gLoading, setGLoading] = useState(false)
  const [loginBg, setLoginBg] = useState(null)
  const [brandLogoUrl, setBrandLogoUrl] = useState(null)

  useEffect(() => {
    try { const bg = localStorage.getItem('vela_login_bg'); if (bg) setLoginBg(bg) } catch {}
    try { const logo = localStorage.getItem('vela_brand_logo'); if (logo) setBrandLogoUrl(logo) } catch {}
  }, [])

  const googleLogin = async () => {
    setGLoading(true); setError('')
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: {
      scopes: 'openid email profile https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/calendar',
      redirectTo: `${window.location.origin}/`, queryParams: { access_type: 'offline', prompt: 'consent' } } })
    if (error) { setError(error.message); setGLoading(false) }
  }

  const emailLogin = async (e) => {
    e.preventDefault(); setError('')
    if (!email || !password) { setError('Email and password required.'); return }
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError(error.message); setLoading(false) }
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-white">
      {/* Left — auth */}
      <div className="flex-1 flex items-center justify-center px-8">
        <div className="w-full max-w-[380px]">
          {brandLogoUrl ? (
            <img src={brandLogoUrl} alt="Brand" style={{ height: 40, objectFit: 'contain', marginBottom: 4 }} />
          ) : (
            <h1 className="text-[42px] font-light text-[#1A1A1A] tracking-[-0.02em] mb-1">Van Hawke</h1>
          )}
          <p className="text-[15px] text-[#ABABAB] mb-12">Sign in to Vela</p>
          {/* Google */}
          <button onClick={googleLogin} disabled={gLoading}
            className="w-full h-[52px] rounded-[14px] bg-white border border-black/[0.08] flex items-center justify-center gap-3 text-[15px] font-medium text-[#1A1A1A] hover:bg-[#FAFAFA] hover:border-black/[0.12] transition-all shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            {gLoading ? <Loader2 className="h-5 w-5 animate-spin" /> :
              <svg className="h-5 w-5" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>}
            Continue with Google
          </button>
          {/* Divider */}
          <div className="flex items-center gap-4 my-7">
            <div className="flex-1 h-px bg-black/[0.06]" /><span className="text-[12px] text-[#ABABAB]">or</span><div className="flex-1 h-px bg-black/[0.06]" />
          </div>
          {/* Email form */}
          <form onSubmit={emailLogin} className="space-y-3">
            <input type="email" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)}
              className="w-full h-12 rounded-xl border border-black/[0.06] bg-[#FAFAFA] px-4 text-[14px] text-[#1A1A1A] placeholder:text-[#ABABAB] outline-none focus:border-black/[0.12] transition-colors" />
            <div className="relative">
              <input type={showPw?'text':'password'} placeholder="Password" value={password} onChange={e=>setPassword(e.target.value)}
                className="w-full h-12 rounded-xl border border-black/[0.06] bg-[#FAFAFA] px-4 pr-12 text-[14px] text-[#1A1A1A] placeholder:text-[#ABABAB] outline-none focus:border-black/[0.12] transition-colors" />
              <button type="button" onClick={()=>setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#ABABAB] hover:text-[#6B6B6B]">
                {showPw ? <EyeOff className="h-5 w-5"/> : <Eye className="h-5 w-5"/>}
              </button>
            </div>

            {error && <p className="text-[13px] text-red-500 bg-red-50 px-3 py-2 rounded-xl">{error}</p>}
            <button type="submit" disabled={loading}
              className="w-full h-12 rounded-xl bg-[#1A1A1A] text-white text-[15px] font-medium hover:bg-black transition-colors">
              {loading ? <Loader2 className="h-5 w-5 animate-spin mx-auto" /> : 'Sign in'}
            </button>
          </form>
          <p className="text-center text-[11px] text-[#CDCDCD] mt-12">Powered by Vela Labs</p>
        </div>
      </div>
      {/* Right — editorial / background image */}
      <div className="hidden lg:flex w-[45%] items-end p-10 relative overflow-hidden"
        style={{
          background: loginBg ? `url(${loginBg}) center/cover no-repeat` : 'linear-gradient(135deg, #F8F8F8, #EEEEEE)',
        }}>
        {!loginBg && <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 rounded-full bg-black/[0.02] blur-[60px]" />}
        <p className="text-[13px] text-[#ABABAB] tracking-[0.15em] uppercase" style={{ textShadow: loginBg ? '0 1px 4px rgba(0,0,0,0.3)' : 'none', color: loginBg ? '#fff' : '#ABABAB' }}>Van Hawke</p>
      </div>
    </div>
  )
}
