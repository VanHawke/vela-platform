import { useState, useEffect } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { supabase } from '@/lib/supabase'
import ImageUpload from './ImageUpload'
import { Check, ExternalLink, Unplug } from 'lucide-react'

const FONTS = ['Inter', 'DM Sans', 'Geist', 'Satoshi']
const SIDEBAR_STYLES = ['glassmorphism', 'solid', 'minimal']
const DENSITIES = ['compact', 'default', 'spacious']
const VOICES = ['shimmer', 'alloy', 'echo', 'fable', 'onyx', 'nova']

const DEFAULT_THEME = {
  background: '#0A0A0A',
  surface: '#141414',
  border: 'rgba(255,255,255,0.08)',
  accent: '#FFFFFF',
  textPrimary: 'rgba(255,255,255,0.95)',
  textMuted: 'rgba(255,255,255,0.40)',
  font: 'Inter',
  sidebarStyle: 'glassmorphism',
  radius: 8,
  density: 'default',
}

export default function Settings({ user }) {
  const [tab, setTab] = useState('profile')
  const [theme, setTheme] = useState(DEFAULT_THEME)
  const [saved, setSaved] = useState(false)
  const [settings, setSettings] = useState({})
  const [googleStatus, setGoogleStatus] = useState(null)

  const email = user?.email || ''
  const displayName = user?.user_metadata?.full_name || email.split('@')[0] || ''

  // Check URL params for connection status
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('connected') === 'google') {
      setTab('accounts')
      // Clean URL
      window.history.replaceState({}, '', '/settings')
    }
    if (params.get('error')) {
      setTab('accounts')
      window.history.replaceState({}, '', '/settings')
    }
  }, [])

  // Load saved settings + theme
  useEffect(() => {
    if (email) {
      loadSettings()
      checkGoogleStatus()
    }
  }, [email])

  const loadSettings = async () => {
    try {
      const { data } = await supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', user?.id)
        .single()
      if (data) {
        setSettings(data)
        if (data.theme_config) setTheme({ ...DEFAULT_THEME, ...data.theme_config })
      }
    } catch {}
  }

  const saveSettings = async (updates) => {
    try {
      await supabase.from('user_settings').upsert({
        user_id: user?.id,
        ...updates,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' })
      setSettings(prev => ({ ...prev, ...updates }))
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      console.error('[Settings] Save error:', err)
    }
  }

  const checkGoogleStatus = async () => {
    try {
      const res = await fetch(`/api/google-token?email=${encodeURIComponent(email)}`)
      const data = await res.json()
      setGoogleStatus(data)
    } catch {
      setGoogleStatus({ connected: false })
    }
  }

  const connectGoogle = () => {
    window.location.href = `/api/google-auth?email=${encodeURIComponent(email)}`
  }

  const disconnectGoogle = async () => {
    try {
      // Delete token from Supabase (via service role would be better but client works with RLS)
      await supabase
        .from('user_tokens')
        .delete()
        .eq('user_email', email)
        .eq('provider', 'google')
      setGoogleStatus({ connected: false })
    } catch (err) {
      console.error('[Settings] Disconnect error:', err)
    }
  }

  const saveTheme = () => saveSettings({ theme_config: theme })

  const updateTheme = (key, value) => {
    setTheme(prev => ({ ...prev, [key]: value }))
  }

  const exportCSS = () => {
    const css = `:root {
  --vela-bg: ${theme.background};
  --vela-surface: ${theme.surface};
  --vela-border: ${theme.border};
  --vela-accent: ${theme.accent};
  --vela-text: ${theme.textPrimary};
  --vela-text-muted: ${theme.textMuted};
  --vela-font: '${theme.font}', system-ui, sans-serif;
  --vela-radius: ${theme.radius}px;
}`
    navigator.clipboard.writeText(css)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 max-w-3xl mx-auto w-full">
      <h1 className="text-xl font-semibold text-white mb-6">Settings</h1>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="bg-white/5 mb-6">
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="kiko">Kiko</TabsTrigger>
          <TabsTrigger value="visual">Appearance</TabsTrigger>
          <TabsTrigger value="images">Images</TabsTrigger>
          <TabsTrigger value="accounts">Accounts</TabsTrigger>
          <TabsTrigger value="about">About</TabsTrigger>
        </TabsList>

        {/* Profile */}
        <TabsContent value="profile" className="space-y-6">
          <div className="space-y-4">
            <div>
              <label className="text-sm text-white/50 block mb-1.5">Display Name</label>
              <Input
                value={settings.display_name || displayName}
                onChange={(e) => setSettings(prev => ({ ...prev, display_name: e.target.value }))}
                className="bg-white/5 border-white/10 text-white"
              />
            </div>
            <div>
              <label className="text-sm text-white/50 block mb-1.5">Email</label>
              <Input value={email} disabled className="bg-white/5 border-white/10 text-white" />
            </div>
            <div>
              <label className="text-sm text-white/50 block mb-1.5">Timezone</label>
              <select
                value={settings.timezone || 'Europe/London'}
                onChange={(e) => setSettings(prev => ({ ...prev, timezone: e.target.value }))}
                className="w-full h-10 px-3 rounded-md bg-white/5 border border-white/10 text-white text-sm"
              >
                {['Europe/London', 'America/New_York', 'America/Los_Angeles', 'Asia/Tokyo', 'Asia/Dubai', 'Australia/Sydney'].map(tz => (
                  <option key={tz} value={tz} className="bg-[#1A1A1A]">{tz}</option>
                ))}
              </select>
            </div>
            <ImageUpload
              label="Profile Photo"
              storageKey="user_avatar"
              folder="avatars"
              aspectHint="Square, at least 200x200px"
              currentUrl={user?.user_metadata?.avatar_url}
            />
            <Button onClick={() => saveSettings({ display_name: settings.display_name, timezone: settings.timezone })} className="bg-white text-black hover:bg-white/90">
              {saved ? 'Saved!' : 'Save Profile'}
            </Button>
          </div>
        </TabsContent>

        {/* Kiko */}
        <TabsContent value="kiko" className="space-y-6">
          <div className="space-y-4">
            <div className="bg-white/5 rounded-xl p-4 space-y-3">
              <h3 className="text-sm font-medium text-white">Voice</h3>
              <div className="grid grid-cols-3 gap-2">
                {VOICES.map(v => (
                  <button
                    key={v}
                    onClick={() => saveSettings({ kiko_voice: v })}
                    className={`px-3 py-2 rounded-lg text-xs capitalize transition-colors ${
                      (settings.kiko_voice || 'shimmer') === v ? 'bg-white text-black' : 'bg-white/5 text-white/50 hover:bg-white/10'
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
            <div className="bg-white/5 rounded-xl p-4 space-y-2">
              <h3 className="text-sm font-medium text-white">Model Routing</h3>
              <p className="text-xs text-white/30">
                Kiko automatically routes queries: simple greetings use Haiku (fast),
                standard queries use Sonnet, complex analysis uses Sonnet with full tools.
              </p>
            </div>
            <div className="bg-white/5 rounded-xl p-4 space-y-2">
              <h3 className="text-sm font-medium text-white">Memory (Mem0)</h3>
              <p className="text-xs text-white/30">
                Kiko remembers preferences, decisions, and context across sessions
                via Mem0. Memories are automatically extracted from conversations.
              </p>
            </div>
          </div>
        </TabsContent>

        {/* Appearance / Visual Builder */}
        <TabsContent value="visual" className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            {[
              ['background', 'Background'],
              ['surface', 'Surface'],
              ['accent', 'Accent'],
            ].map(([key, label]) => (
              <div key={key}>
                <label className="text-xs text-white/40 block mb-1">{label}</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={theme[key]}
                    onChange={(e) => updateTheme(key, e.target.value)}
                    className="h-8 w-8 rounded border-0 cursor-pointer bg-transparent"
                  />
                  <Input
                    value={theme[key]}
                    onChange={(e) => updateTheme(key, e.target.value)}
                    className="h-8 text-xs bg-white/5 border-white/10 text-white font-mono"
                  />
                </div>
              </div>
            ))}
          </div>

          <Separator className="bg-white/8" />

          {/* Font */}
          <div>
            <label className="text-xs text-white/40 block mb-1.5">Font Family</label>
            <div className="flex gap-2">
              {FONTS.map(f => (
                <button
                  key={f}
                  onClick={() => updateTheme('font', f)}
                  className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${
                    theme.font === f ? 'bg-white text-black' : 'bg-white/5 text-white/50 hover:bg-white/10'
                  }`}
                  style={{ fontFamily: f }}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          {/* Sidebar style */}
          <div>
            <label className="text-xs text-white/40 block mb-1.5">Sidebar Style</label>
            <div className="flex gap-2">
              {SIDEBAR_STYLES.map(s => (
                <button
                  key={s}
                  onClick={() => updateTheme('sidebarStyle', s)}
                  className={`px-3 py-1.5 rounded-lg text-xs capitalize transition-colors ${
                    theme.sidebarStyle === s ? 'bg-white text-black' : 'bg-white/5 text-white/50 hover:bg-white/10'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Radius */}
          <div>
            <label className="text-xs text-white/40 block mb-1.5">
              Border Radius: {theme.radius}px
            </label>
            <input
              type="range"
              min={0}
              max={16}
              value={theme.radius}
              onChange={(e) => updateTheme('radius', Number(e.target.value))}
              className="w-full accent-white"
            />
          </div>

          {/* Density */}
          <div>
            <label className="text-xs text-white/40 block mb-1.5">Density</label>
            <div className="flex gap-2">
              {DENSITIES.map(d => (
                <button
                  key={d}
                  onClick={() => updateTheme('density', d)}
                  className={`px-3 py-1.5 rounded-lg text-xs capitalize transition-colors ${
                    theme.density === d ? 'bg-white text-black' : 'bg-white/5 text-white/50 hover:bg-white/10'
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          <Separator className="bg-white/8" />

          <div className="flex gap-2">
            <Button onClick={saveTheme} className="bg-white text-black hover:bg-white/90">
              {saved ? 'Saved!' : 'Save Theme'}
            </Button>
            <Button variant="outline" onClick={exportCSS} className="border-white/10 text-white/60">
              Export CSS
            </Button>
            <Button variant="outline" onClick={() => setTheme(DEFAULT_THEME)} className="border-white/10 text-white/60">
              Reset
            </Button>
          </div>

          {/* Live preview */}
          <div>
            <label className="text-xs text-white/40 block mb-2">Preview</label>
            <div
              className="rounded-xl border overflow-hidden h-48 flex"
              style={{
                background: theme.background,
                borderColor: theme.border,
                borderRadius: theme.radius,
                fontFamily: `'${theme.font}', system-ui`,
              }}
            >
              <div
                className="w-14 flex-shrink-0 p-2 space-y-2 border-r"
                style={{
                  background: theme.sidebarStyle === 'glassmorphism' ? 'rgba(255,255,255,0.04)' :
                    theme.sidebarStyle === 'solid' ? theme.surface : 'transparent',
                  borderColor: theme.border,
                  backdropFilter: theme.sidebarStyle === 'glassmorphism' ? 'blur(24px)' : 'none',
                }}
              >
                {[1,2,3,4].map(i => (
                  <div key={i} className="h-3 rounded" style={{
                    background: i === 1 ? theme.accent : 'rgba(255,255,255,0.1)',
                    width: '100%',
                  }} />
                ))}
              </div>
              <div className="flex-1 p-4 flex flex-col items-center justify-center">
                <div className="h-4 w-32 rounded mb-2" style={{ background: theme.textPrimary }} />
                <div className="h-3 w-48 rounded" style={{ background: theme.textMuted }} />
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Images */}
        <TabsContent value="images" className="space-y-6">
          <ImageUpload label="Kiko Avatar" storageKey="kiko_avatar" folder="avatars" aspectHint="Square, shown in chat" />
          <ImageUpload label="Login Background" storageKey="login_bg" folder="backgrounds" aspectHint="16:9 recommended, dark editorial" />
          <ImageUpload label="Sidebar Logo" storageKey="sidebar_logo" folder="logos" aspectHint="Horizontal, max 180px wide" />
          <ImageUpload label="Company Logo" storageKey="company_logo" folder="logos" aspectHint="Square or horizontal" />
        </TabsContent>

        {/* Connected Accounts */}
        <TabsContent value="accounts" className="space-y-6">
          <div className="bg-white/5 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-white/10 flex items-center justify-center">
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-white">Google</p>
                  <p className="text-xs text-white/30">Gmail + Calendar</p>
                </div>
              </div>
              {googleStatus?.connected ? (
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1 text-xs text-green-400">
                    <Check className="h-3 w-3" /> Connected
                  </span>
                  <button
                    onClick={disconnectGoogle}
                    className="text-xs text-white/30 hover:text-red-400 transition-colors flex items-center gap-1"
                  >
                    <Unplug className="h-3 w-3" /> Disconnect
                  </button>
                </div>
              ) : (
                <Button onClick={connectGoogle} size="sm" className="bg-white text-black hover:bg-white/90 text-xs">
                  <ExternalLink className="h-3 w-3 mr-1" /> Connect
                </Button>
              )}
            </div>
            {googleStatus?.connected && (
              <div className="text-xs text-white/20 space-y-1 pl-[52px]">
                <p>Scopes: Gmail (full), Calendar, Profile</p>
                <p>Last updated: {googleStatus.last_updated ? new Date(googleStatus.last_updated).toLocaleString() : 'Unknown'}</p>
              </div>
            )}
          </div>
        </TabsContent>

        {/* About */}
        <TabsContent value="about" className="space-y-4">
          <div className="bg-white/5 rounded-xl p-6 space-y-3">
            <h3 className="text-lg font-semibold text-white">Vela Platform</h3>
            <p className="text-sm text-white/40">v2.0.0-alpha</p>
            <Separator className="bg-white/8" />
            <div className="space-y-1.5 text-sm text-white/40">
              <p>Built by <span className="text-white/60">Vela Labs</span></p>
              <p>Parent: <span className="text-white/60">Van Hawke Group</span></p>
              <p>AI: <span className="text-white/60">Anthropic Claude + OpenAI + Mem0</span></p>
              <p>Database: <span className="text-white/60">Supabase</span></p>
              <p>Voice: <span className="text-white/60">OpenAI Realtime (Shimmer)</span></p>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
