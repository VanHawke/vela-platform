import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Eye, EyeOff, Loader2 } from 'lucide-react'

const LOGIN_BG_FALLBACK = 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1200&q=80'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [rememberMe, setRememberMe] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)

  const handleGoogleLogin = async () => {
    setError('')
    setGoogleLoading(true)
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          scopes: 'openid email profile https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/calendar',
          redirectTo: `${window.location.origin}/`,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      })
      if (error) setError(error.message)
    } catch (err) {
      setError('Google login failed. Please try again.')
    } finally {
      setGoogleLoading(false)
    }
  }

  const handleEmailLogin = async (e) => {
    e.preventDefault()
    setError('')
    if (!email || !password) {
      setError('Email and password are required.')
      return
    }
    setLoading(true)
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setError(error.message)
    } catch (err) {
      setError('Login failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden">
      {/* Left panel — editorial image */}
      <div className="hidden lg:block lg:w-1/2 relative">
        <img
          src={LOGIN_BG_FALLBACK}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-black/30" />
        <div className="absolute bottom-8 left-8">
          <span className="text-white/60 text-sm font-light tracking-widest uppercase">
            Van Hawke
          </span>
        </div>
      </div>

      {/* Right panel — auth form */}
      <div className="flex-1 lg:w-1/2 flex items-center justify-center px-6" style={{ background: '#0A0A0A' }}>
        <div className="w-full max-w-[380px] space-y-8">
          {/* Logo / Title */}
          <div className="space-y-2">
            <h1 className="text-3xl font-semibold text-white tracking-tight">Vela</h1>
            <p className="text-sm text-white/40">Sign in to your workspace</p>
          </div>

          {/* Google CTA */}
          <Button
            onClick={handleGoogleLogin}
            disabled={googleLoading}
            className="w-full h-12 bg-white hover:bg-gray-100 text-gray-900 font-medium rounded-lg flex items-center justify-center gap-3 transition-all duration-200"
          >
            {googleLoading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <svg className="h-5 w-5" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
            )}
            Continue with Google
          </Button>

          {/* Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-white/10" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="px-3 text-white/30" style={{ background: '#0A0A0A' }}>
                or sign in with email
              </span>
            </div>
          </div>

          {/* Email form */}
          <form onSubmit={handleEmailLogin} className="space-y-4">
            <div className="space-y-2">
              <Input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-12 bg-white/5 border-white/10 text-white placeholder:text-white/30 rounded-lg focus:border-white/20 focus:ring-0"
              />
            </div>
            <div className="space-y-2">
              <div className="relative">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="h-12 bg-white/5 border-white/10 text-white placeholder:text-white/30 rounded-lg pr-12 focus:border-white/20 focus:ring-0"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors"
                >
                  {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                </button>
              </div>
            </div>

            {/* Remember me */}
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="remember"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="h-4 w-4 rounded border-white/20 bg-white/5 text-white accent-white"
              />
              <label htmlFor="remember" className="text-sm text-white/40 select-none cursor-pointer">
                Remember me
              </label>
            </div>

            {/* Error */}
            {error && (
              <p className="text-sm text-red-400 bg-red-400/10 px-3 py-2 rounded-lg">
                {error}
              </p>
            )}

            {/* Submit */}
            <Button
              type="submit"
              disabled={loading}
              className="w-full h-12 bg-white/10 hover:bg-white/15 text-white font-medium rounded-lg transition-all duration-200"
            >
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Sign in'}
            </Button>
          </form>

          {/* Footer */}
          <p className="text-center text-[12px] text-white/20 pt-8">
            Powered by Vela Labs
          </p>
        </div>
      </div>
    </div>
  )
}
