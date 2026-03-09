import { useState, useEffect } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { supabase } from '@/lib/supabase'
import ImageUpload from './ImageUpload'

const FONTS = ['Inter', 'DM Sans', 'Geist', 'Satoshi']
const SIDEBAR_STYLES = ['glassmorphism', 'solid', 'minimal']
const DENSITIES = ['compact', 'default', 'spacious']

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

  const displayName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || ''
  const email = user?.email || ''

  // Load saved theme
  useEffect(() => {
    loadTheme()
  }, [])

  const loadTheme = async () => {
    try {
      const { data } = await supabase
        .from('user_settings')
        .select('theme_config')
        .eq('user_id', user?.id)
        .single()
      if (data?.theme_config) setTheme({ ...DEFAULT_THEME, ...data.theme_config })
    } catch {}
  }

  const saveTheme = async () => {
    try {
      await supabase.from('user_settings').upsert({
        user_id: user?.id,
        theme_config: theme,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch {}
  }

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
          <TabsTrigger value="ai">AI Config</TabsTrigger>
          <TabsTrigger value="visual">Visual Builder</TabsTrigger>
          <TabsTrigger value="images">Images</TabsTrigger>
          <TabsTrigger value="about">About</TabsTrigger>
        </TabsList>

        {/* Profile */}
        <TabsContent value="profile" className="space-y-6">
          <div className="space-y-4">
            <div>
              <label className="text-sm text-white/50 block mb-1.5">Display Name</label>
              <Input value={displayName} disabled className="bg-white/5 border-white/10 text-white" />
            </div>
            <div>
              <label className="text-sm text-white/50 block mb-1.5">Email</label>
              <Input value={email} disabled className="bg-white/5 border-white/10 text-white" />
            </div>
            <ImageUpload
              label="Profile Photo"
              storageKey="user_avatar"
              folder="avatars"
              aspectHint="Square, at least 200x200px"
              currentUrl={user?.user_metadata?.avatar_url}
            />
          </div>
        </TabsContent>

        {/* AI Config */}
        <TabsContent value="ai" className="space-y-6">
          <div className="space-y-4">
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
            <div className="bg-white/5 rounded-xl p-4 space-y-2">
              <h3 className="text-sm font-medium text-white">Voice</h3>
              <p className="text-xs text-white/30">
                Mode 2 (mic icon): Speech-to-text via Whisper.
                Mode 3 (speak toggle): Full voice conversation via OpenAI Realtime (Shimmer voice).
              </p>
            </div>
          </div>
        </TabsContent>

        {/* Visual Builder */}
        <TabsContent value="visual" className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            {/* Colours */}
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
