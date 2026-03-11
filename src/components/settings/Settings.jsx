import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useNavigate } from 'react-router-dom'
import ImageUpload from './ImageUpload'
import { Check, ExternalLink, Unplug, UserPlus, Trash2, LogOut } from 'lucide-react'

const VOICES = [
  { id: 'shimmer', label: 'Shimmer', desc: 'Warm, expressive female' },
  { id: 'alloy', label: 'Alloy', desc: 'Neutral, balanced' },
  { id: 'echo', label: 'Echo', desc: 'Clear, articulate male' },
  { id: 'sage', label: 'Sage', desc: 'Calm, authoritative' },
  { id: 'verse', label: 'Verse', desc: 'Expressive, dynamic' },
  { id: 'coral', label: 'Coral', desc: 'Friendly, conversational' },
  { id: 'cedar', label: 'Cedar', desc: 'Deep, confident' },
  { id: 'marin', label: 'Marin', desc: 'Smooth, professional' },
]
const SPEEDS = [
  { id: 0.8, label: 'Slow' },
  { id: 0.9, label: 'Relaxed' },
  { id: 1.0, label: 'Normal' },
  { id: 1.1, label: 'Brisk' },
  { id: 1.2, label: 'Fast' },
]
const TABS = ['Profile', 'Kiko', 'Team', 'Appearance', 'Accounts']

const T = {
  bg: '#FAFAFA', surface: '#FFFFFF', surfaceHover: '#F5F5F5',
  border: 'rgba(0,0,0,0.06)', borderHover: 'rgba(0,0,0,0.12)',
  text: '#1A1A1A', textSecondary: '#6B6B6B', textTertiary: '#ABABAB',
  accent: '#1A1A1A', accentSoft: 'rgba(0,0,0,0.04)',
  radius: 16, radiusSm: 10,
  font: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
}

export default function Settings({ user }) {
  const navigate = useNavigate()
  const [tab, setTab] = useState('Profile')
  const [saved, setSaved] = useState(false)
  const [settings, setSettings] = useState({})
  const [googleStatus, setGoogleStatus] = useState(null)
  const [teamMembers, setTeamMembers] = useState([])
  const [invitations, setInvitations] = useState([])
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('member')

  const email = user?.email || ''
  const displayName = user?.user_metadata?.full_name || email.split('@')[0] || ''

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('connected') === 'google') { setTab('Accounts'); window.history.replaceState({}, '', '/settings') }
    if (params.get('error')) { setTab('Accounts'); window.history.replaceState({}, '', '/settings') }
  }, [])

  useEffect(() => { if (email) { loadSettings(); checkGoogleStatus(); loadTeam() } }, [email])

  const loadSettings = async () => {
    try {
      const { data } = await supabase.from('user_settings').select('*').eq('user_id', user?.id).single()
      if (data) setSettings(data)
    } catch {}
  }

  const saveSettings = async (updates) => {
    try {
      await supabase.from('user_settings').upsert({ user_id: user?.id, ...updates, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
      setSettings(prev => ({ ...prev, ...updates }))
      setSaved(true); setTimeout(() => setSaved(false), 2000)
    } catch {}
  }

  const checkGoogleStatus = async () => {
    try { const res = await fetch(`/api/google-token?email=${encodeURIComponent(email)}`); setGoogleStatus(await res.json()) }
    catch { setGoogleStatus({ connected: false }) }
  }

  const connectGoogle = () => { window.location.href = `/api/google-auth?email=${encodeURIComponent(email)}` }

  const disconnectGoogle = async () => {
    try { await supabase.from('user_tokens').delete().eq('user_email', email).eq('provider', 'google'); setGoogleStatus({ connected: false }) } catch {}
  }

  const loadTeam = async () => {
    try {
      const { data: members } = await supabase.from('users').select('id, email, full_name, role, created_at').order('created_at', { ascending: true })
      setTeamMembers(members || [])
      const { data: invites } = await supabase.from('invitations').select('*').eq('status', 'pending').order('created_at', { ascending: false })
      setInvitations(invites || [])
    } catch {}
  }

  const sendInvite = async () => {
    if (!inviteEmail.trim()) return
    const orgId = user?.app_metadata?.org_id
    if (!orgId) return
    try {
      await supabase.from('invitations').insert({ org_id: orgId, email: inviteEmail.trim().toLowerCase(), role: inviteRole, invited_by: user.id })
      setInviteEmail(''); setSaved(true); setTimeout(() => setSaved(false), 2000); loadTeam()
    } catch {}
  }

  const revokeInvite = async (id) => {
    await supabase.from('invitations').update({ status: 'revoked' }).eq('id', id); loadTeam()
  }

  const inputStyle = {
    width: '100%', height: 44, borderRadius: 12, border: `1px solid ${T.border}`,
    padding: '0 14px', fontSize: 14, color: T.text, fontFamily: T.font,
    outline: 'none', background: T.surface, boxSizing: 'border-box',
  }
  const labelStyle = { fontSize: 13, fontWeight: 500, color: T.text, display: 'block', marginBottom: 6, fontFamily: T.font }
  const cardStyle = { background: T.surface, borderRadius: T.radius, border: `1px solid ${T.border}`, padding: 20 }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: T.bg }}>
      {/* Header + Tabs */}
      <div style={{ padding: '24px 32px 0' }}>
        <h1 style={{ fontSize: 24, fontWeight: 600, color: T.text, margin: '0 0 20px', fontFamily: T.font }}>Settings</h1>
        <div style={{ display: 'flex', gap: 4, borderBottom: `1px solid ${T.border}` }}>
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: '10px 16px', borderRadius: '8px 8px 0 0', border: 'none',
              background: tab === t ? T.surface : 'transparent',
              color: tab === t ? T.text : T.textTertiary,
              fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: T.font,
              borderBottom: tab === t ? `2px solid ${T.accent}` : '2px solid transparent',
            }}>{t}</button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px 32px', maxWidth: 600 }}>
        {/* Profile */}
        {tab === 'Profile' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <label style={labelStyle}>Display Name</label>
              <input value={settings.display_name || displayName} onChange={e => setSettings(p => ({ ...p, display_name: e.target.value }))} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Email</label>
              <input value={email} disabled style={{ ...inputStyle, background: T.bg, color: T.textTertiary }} />
            </div>
            <div>
              <label style={labelStyle}>Email Signature</label>
              <textarea value={settings.email_signature || ''} onChange={e => setSettings(p => ({ ...p, email_signature: e.target.value }))}
                rows={3} style={{ ...inputStyle, height: 'auto', padding: '12px 14px', resize: 'none' }}
                placeholder="Sunny Sidhu&#10;CEO, Van Hawke Group" />
            </div>
            <div>
              <label style={{ ...labelStyle, marginBottom: 10 }}>Notifications</label>
              {['Email notifications', 'Desktop notifications', 'Sound alerts'].map((n, i) => {
                const key = ['email', 'desktop', 'sound'][i]
                const on = settings.notification_prefs?.[key] ?? true
                return (
                  <div key={n} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0' }}>
                    <span style={{ fontSize: 14, color: T.textSecondary, fontFamily: T.font }}>{n}</span>
                    <div onClick={() => setSettings(p => ({ ...p, notification_prefs: { ...(p.notification_prefs || {}), [key]: !on } }))}
                      style={{ width: 44, height: 24, borderRadius: 12, background: on ? T.accent : T.border, position: 'relative', cursor: 'pointer', transition: 'background 0.2s' }}>
                      <div style={{ width: 20, height: 20, borderRadius: '50%', background: '#fff', position: 'absolute', top: 2, transition: 'right 0.2s', right: on ? 2 : 22, boxShadow: '0 1px 3px rgba(0,0,0,0.15)' }} />
                    </div>
                  </div>
                )
              })}
            </div>
            <button onClick={() => saveSettings({ display_name: settings.display_name, timezone: settings.timezone, email_signature: settings.email_signature, notification_prefs: settings.notification_prefs })}
              style={{ height: 44, borderRadius: 12, background: T.accent, color: '#fff', border: 'none', fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: T.font, width: 'fit-content', padding: '0 28px' }}>
              {saved ? 'Saved!' : 'Save changes'}
            </button>
            <div style={{ height: 1, background: T.border, margin: '4px 0' }} />
            <button onClick={async () => { await supabase.auth.signOut(); navigate('/login') }}
              style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#C62828', fontFamily: T.font, padding: 0 }}>
              <LogOut size={16} /> Sign out
            </button>
          </div>
        )}

        {/* Kiko */}
        {tab === 'Kiko' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={cardStyle}>
              <h3 style={{ fontSize: 14, fontWeight: 600, color: T.text, margin: '0 0 12px', fontFamily: T.font }}>Voice</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                {VOICES.map(v => (
                  <button key={v.id} onClick={() => saveSettings({ kiko_voice: v.id })} style={{
                    padding: '10px 14px', borderRadius: T.radiusSm, border: `1px solid ${T.border}`,
                    background: (settings.kiko_voice || 'shimmer') === v.id ? T.accent : T.surface,
                    color: (settings.kiko_voice || 'shimmer') === v.id ? '#fff' : T.text,
                    fontSize: 13, cursor: 'pointer', fontFamily: T.font, textAlign: 'left',
                    display: 'flex', flexDirection: 'column', gap: 2,
                  }}>
                    <span style={{ fontWeight: 600 }}>{v.label}</span>
                    <span style={{ fontSize: 11, opacity: 0.7 }}>{v.desc}</span>
                  </button>
                ))}
              </div>
            </div>
            <div style={cardStyle}>
              <h3 style={{ fontSize: 14, fontWeight: 600, color: T.text, margin: '0 0 12px', fontFamily: T.font }}>Speech Speed</h3>
              <div style={{ display: 'flex', gap: 8 }}>
                {SPEEDS.map(s => (
                  <button key={s.id} onClick={() => saveSettings({ kiko_speed: s.id })} style={{
                    padding: '8px 14px', borderRadius: T.radiusSm, border: `1px solid ${T.border}`,
                    background: (settings.kiko_speed || 1.0) === s.id ? T.accent : T.surface,
                    color: (settings.kiko_speed || 1.0) === s.id ? '#fff' : T.textSecondary,
                    fontSize: 12, cursor: 'pointer', fontFamily: T.font,
                  }}>{s.label}</button>
                ))}
              </div>
            </div>
            <div style={cardStyle}>
              <h3 style={{ fontSize: 14, fontWeight: 600, color: T.text, margin: '0 0 8px', fontFamily: T.font }}>Model Routing</h3>
              <p style={{ fontSize: 13, color: T.textTertiary, lineHeight: 1.5, margin: 0, fontFamily: T.font }}>
                Kiko automatically routes queries: simple greetings use Haiku (fast), standard queries use Sonnet, complex analysis uses Sonnet with full tools.
              </p>
            </div>
            <div style={cardStyle}>
              <h3 style={{ fontSize: 14, fontWeight: 600, color: T.text, margin: '0 0 8px', fontFamily: T.font }}>Memory</h3>
              <p style={{ fontSize: 13, color: T.textTertiary, lineHeight: 1.5, margin: 0, fontFamily: T.font }}>
                Kiko remembers preferences, decisions, and context across sessions. Memories are automatically extracted from conversations.
              </p>
            </div>
          </div>
        )}

        {/* Team */}
        {tab === 'Team' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={cardStyle}>
              <h3 style={{ fontSize: 14, fontWeight: 600, color: T.text, margin: '0 0 12px', fontFamily: T.font }}>Invite Team Member</h3>
              <div style={{ display: 'flex', gap: 8 }}>
                <input value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendInvite()}
                  placeholder="colleague@company.com" style={{ ...inputStyle, flex: 1 }} />
                <select value={inviteRole} onChange={e => setInviteRole(e.target.value)}
                  style={{ ...inputStyle, width: 100, padding: '0 8px' }}>
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                </select>
                <button onClick={sendInvite} style={{
                  height: 44, padding: '0 16px', borderRadius: 12, background: T.accent, color: '#fff',
                  border: 'none', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: T.font,
                  display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
                }}><UserPlus size={14} /> Invite</button>
              </div>
            </div>

            {invitations.length > 0 && (
              <div>
                <h3 style={{ fontSize: 11, fontWeight: 600, color: T.textTertiary, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 8px', fontFamily: T.font }}>Pending Invitations</h3>
                {invitations.map(inv => (
                  <div key={inv.id} style={{ ...cardStyle, padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <div>
                      <p style={{ fontSize: 13, color: T.text, margin: 0, fontFamily: T.font }}>{inv.email}</p>
                      <p style={{ fontSize: 11, color: T.textTertiary, margin: '2px 0 0', fontFamily: T.font }}>{inv.role} · expires {new Date(inv.expires_at).toLocaleDateString()}</p>
                    </div>
                    <button onClick={() => revokeInvite(inv.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.textTertiary, padding: 4 }}><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
            )}

            <div>
              <h3 style={{ fontSize: 11, fontWeight: 600, color: T.textTertiary, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 8px', fontFamily: T.font }}>Team Members</h3>
              {teamMembers.length === 0 ? (
                <p style={{ fontSize: 13, color: T.textTertiary, fontFamily: T.font }}>No team members yet</p>
              ) : teamMembers.map(m => (
                <div key={m.id} style={{ ...cardStyle, padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: T.accentSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, color: T.text, fontFamily: T.font }}>
                      {(m.full_name || m.email)?.[0]?.toUpperCase()}
                    </div>
                    <div>
                      <p style={{ fontSize: 13, color: T.text, margin: 0, fontFamily: T.font }}>{m.full_name || m.email}</p>
                      <p style={{ fontSize: 11, color: T.textTertiary, margin: '2px 0 0', fontFamily: T.font }}>{m.email}</p>
                    </div>
                  </div>
                  <span style={{ fontSize: 11, padding: '4px 10px', borderRadius: 20, fontWeight: 500,
                    background: m.role === 'super_admin' ? '#F3E5F5' : m.role === 'admin' ? '#E3F2FD' : T.accentSoft,
                    color: m.role === 'super_admin' ? '#6A1B9A' : m.role === 'admin' ? '#1565C0' : T.textSecondary,
                  }}>{m.role}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Appearance */}
        {tab === 'Appearance' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={cardStyle}>
              <p style={{ fontSize: 13, color: T.textTertiary, lineHeight: 1.5, margin: 0, fontFamily: T.font }}>
                Theme customization coming soon. The current light theme matches the approved Van Hawke design system.
              </p>
            </div>
            <ImageUpload label="Kiko Avatar" storageKey="kiko_avatar" folder="avatars" aspectHint="Square, shown in chat" />
            <ImageUpload label="Login Background" storageKey="login_bg" folder="backgrounds" aspectHint="16:9 recommended" />
            <ImageUpload label="Sidebar Logo" storageKey="sidebar_logo" folder="logos" aspectHint="Horizontal, max 180px wide" />
          </div>
        )}

        {/* Accounts */}
        {tab === 'Accounts' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={cardStyle}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 40, height: 40, borderRadius: T.radiusSm, background: T.accentSoft, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                    </svg>
                  </div>
                  <div>
                    <p style={{ fontSize: 14, fontWeight: 500, color: T.text, margin: 0, fontFamily: T.font }}>Google</p>
                    <p style={{ fontSize: 12, color: T.textTertiary, margin: '2px 0 0', fontFamily: T.font }}>Gmail + Calendar</p>
                  </div>
                </div>
                {googleStatus?.connected ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: '#2E7D32' }}><Check size={12} /> Connected</span>
                    <button onClick={disconnectGoogle} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: T.textTertiary }}>
                      <Unplug size={12} /> Disconnect
                    </button>
                  </div>
                ) : (
                  <button onClick={connectGoogle} style={{
                    height: 36, padding: '0 16px', borderRadius: T.radiusSm, background: T.accent, color: '#fff',
                    border: 'none', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: T.font,
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}><ExternalLink size={12} /> Connect</button>
                )}
              </div>
              {googleStatus?.connected && (
                <div style={{ fontSize: 11, color: T.textTertiary, marginTop: 12, paddingLeft: 52, fontFamily: T.font }}>
                  <p style={{ margin: '0 0 2px' }}>Scopes: Gmail (full), Calendar, Profile</p>
                  <p style={{ margin: 0 }}>Last updated: {googleStatus.last_updated ? new Date(googleStatus.last_updated).toLocaleString() : 'Unknown'}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
