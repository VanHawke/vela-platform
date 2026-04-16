import { useState, useEffect, useRef, lazy, Suspense } from 'react'
import { supabase } from '@/lib/supabase'
import { useNavigate } from 'react-router-dom'
import T from '@/lib/theme'
import ImageUpload from './ImageUpload'
import SkillsManager from './SkillsManager'
import MemoryTab from './MemoryTab'
import { Check, ExternalLink, Unplug, UserPlus, Trash2, LogOut, X, Shield } from 'lucide-react'
import { ALL_PAGES, ROLE_DEFAULTS } from '@/lib/pagePermissions'
import { applyFavicon, DEFAULT_FAVICON } from '@/lib/favicon'
import { useOrg } from '@/contexts/OrgContext'

// Lazy-loaded health dashboard for the Health tab (super admin only)
const AdminSystem = lazy(() => import('@/pages/AdminSystem'))

const VOICES = [
  { id: 'coral', label: 'Coral', desc: 'Warm, natural, conversational' },
  { id: 'shimmer', label: 'Shimmer', desc: 'Soft, polished, feminine' },
  { id: 'sage', label: 'Sage', desc: 'Calm, authoritative, grounded' },
  { id: 'verse', label: 'Verse', desc: 'Expressive, dynamic, engaging' },
  { id: 'marin', label: 'Marin', desc: 'Smooth, professional, clear' },
  { id: 'alloy', label: 'Alloy', desc: 'Neutral, balanced, versatile' },
  { id: 'echo', label: 'Echo', desc: 'Clear, articulate, masculine' },
  { id: 'cedar', label: 'Cedar', desc: 'Deep, confident, resonant' },
]
const VOICE_STYLES = [
  { id: 'natural', label: 'Natural', desc: 'Relaxed, human-like delivery', instructions: 'Speak in a natural, relaxed, conversational tone. Be warm and genuine, as if talking to a trusted colleague over coffee.' },
  { id: 'professional', label: 'Professional', desc: 'Crisp, clear, boardroom-ready', instructions: 'Speak clearly and professionally with confident pacing. Articulate each point precisely, like a senior executive in a board meeting.' },
  { id: 'warm', label: 'Warm & Inviting', desc: 'Friendly, approachable, feminine', instructions: 'Speak with warmth, softness, and genuine friendliness. Let your voice feel inviting and approachable, with a gentle feminine energy. Smile through your words.' },
  { id: 'energetic', label: 'Energetic', desc: 'Upbeat, dynamic, motivating', instructions: 'Speak with energy and enthusiasm. Be dynamic and engaging, varying your pace and emphasis to keep the listener engaged and motivated.' },
  { id: 'calm', label: 'Calm & Soothing', desc: 'Gentle, measured, reassuring', instructions: 'Speak slowly and gently with a soothing, measured pace. Be reassuring and calming, like guiding someone through a complex decision with patience.' },
]
const SPEEDS = [
  { id: 0.8, label: 'Slow' },
  { id: 0.9, label: 'Relaxed' },
  { id: 1.0, label: 'Normal' },
  { id: 1.1, label: 'Brisk' },
  { id: 1.2, label: 'Fast' },
]
const TABS = ['Profile', 'Kiko', 'Memory', 'Skills', 'Navigation', 'Team', 'Organisation', 'Appearance', 'Accounts', 'Health']
const SUPER_ADMIN_TABS = ['Kiko', 'Memory', 'Skills', 'Navigation', 'Team', 'Organisation', 'Appearance', 'Accounts', 'Health'] // Only visible to super_admin — regular users see Profile only

// Theme imported from @/lib/theme.js

export default function Settings({ user }) {
  const navigate = useNavigate()
  const { branding: orgBranding, setBrandingFromServer } = useOrg()
  // Shared helper: PATCH /api/org-branding with a partial branding update,
  // then update OrgContext so UI across the app (favicon, title, logo) reflects
  // the change instantly without a page reload.
  const saveBranding = async (patch) => {
    if (!user?.id) { setSaveError('Not signed in'); return null }
    try {
      const res = await fetch('/api/org-branding', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id, patch }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        setSaveError(`Branding save failed: ${err.error || res.status}`)
        return null
      }
      const data = await res.json()
      if (data?.branding) setBrandingFromServer(data.branding)
      return data?.branding || null
    } catch (err) {
      setSaveError(`Branding save failed: ${err.message}`)
      return null
    }
  }
  const [tab, setTab] = useState('Profile')
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [settings, setSettings] = useState({})
  const [googleStatus, setGoogleStatus] = useState(null)
  const [teamMembers, setTeamMembers] = useState([])
  const [invitations, setInvitations] = useState([])
  const [inviteEmail, setInviteEmail] = useState('')
  const [permModalMember, setPermModalMember] = useState(null) // member object for permissions modal
  const [permEffective, setPermEffective] = useState({})
  const [permOverrides, setPermOverrides] = useState({})
  const [permSaving, setPermSaving] = useState(false)
  const [inviteRole, setInviteRole] = useState('user')
  const [currentUserRole, setCurrentUserRole] = useState('user')
  const [previewingVoice, setPreviewingVoice] = useState(null)
  const previewAudioRef = useRef(null)
  const [orgBibleContent, setOrgBibleContent] = useState('')
  const [orgBibleUpdatedAt, setOrgBibleUpdatedAt] = useState(null)
  const [orgBibleSaving, setOrgBibleSaving] = useState(false)
  const [userBibleContent, setUserBibleContent] = useState('')
  const [userBibleUpdatedAt, setUserBibleUpdatedAt] = useState(null)
  const [userBibleSaving, setUserBibleSaving] = useState(false)
  const [userOrgId, setUserOrgId] = useState(null)
  // Branding assets now live in organisations.branding (DB), exposed via OrgContext.
  // These local states mirror OrgContext for the currentUrl prop on ImageUpload.
  const navLogo = orgBranding?.logo_url || null
  const favicon = orgBranding?.favicon_url || null

  const DEFAULT_NAV = [
    { id: 'home', label: 'Home' }, { id: 'pipeline', label: 'Pipeline' },
    { id: 'contacts', label: 'Contacts' }, { id: 'organisations', label: 'Organisations' },
    { id: 'email', label: 'Command Centre' }, { id: 'partnership-matrix', label: 'Partnership Matrix' },
    { id: 'calendar', label: 'Calendar' },
    { id: 'lemlist', label: 'Lemlist' },
  ]
  const [navOrder, setNavOrder] = useState(DEFAULT_NAV)

  const ALL_TOP_NAV = [
    { id: 'home', label: 'Today', path: '/' },
    { id: 'pipeline', label: 'Pipeline', path: '/pipeline' },
    { id: 'campaigns', label: 'Campaigns', path: '/campaigns' },
    { id: 'command-centre', label: 'Command Centre', path: '/command-centre' },
    { id: 'calendar', label: 'Calendar', path: '/calendar' },
    { id: 'contacts', label: 'Contacts', path: '/contacts' },
    { id: 'organisations', label: 'Organisations', path: '/organisations' },
    { id: 'partnership-matrix', label: 'Partnership Matrix', path: '/partnership-matrix' },
    { id: 'linkedin', label: 'LinkedIn', path: '/linkedin' },
  ]
  const DEFAULT_TOP_NAV = ALL_TOP_NAV.map(t => t.id)
  const [topNavItems, setTopNavItems] = useState(DEFAULT_TOP_NAV)
  const [moreOrder, setMoreOrder] = useState(() => { try { const s = localStorage.getItem('kiko_more_order'); return s ? JSON.parse(s) : null } catch { return null } })

  useEffect(() => {
    const stored = localStorage.getItem('kiko_nav_order')
    if (stored) try { setNavOrder(JSON.parse(stored)) } catch {}
    const storedTop = localStorage.getItem('kiko_top_nav_v2')
    if (storedTop) try { setTopNavItems(JSON.parse(storedTop)) } catch {}
  }, [])

  const email = user?.email || ''

  async function previewVoice(voiceId) {
    // Stop any current preview
    if (previewAudioRef.current) { previewAudioRef.current.pause(); previewAudioRef.current = null }
    setPreviewingVoice(voiceId)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const userEmail = session?.user?.email || null
      const currentStyle = VOICE_STYLES.find(s => s.id === (settings.kiko_voice_style || 'natural'))
      const res = await fetch('/api/voice-preview', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          voice: voiceId,
          userEmail,
          speed: parseFloat(settings.kiko_speed) || 1.0,
          instructions: currentStyle?.instructions || '',
        })
      })
      if (!res.ok) { setPreviewingVoice(null); return }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      previewAudioRef.current = audio
      audio.onended = () => { setPreviewingVoice(null); URL.revokeObjectURL(url) }
      audio.onerror = () => { setPreviewingVoice(null); URL.revokeObjectURL(url) }
      await audio.play()
    } catch { setPreviewingVoice(null) }
  }
  const displayName = user?.user_metadata?.full_name || email.split('@')[0] || ''

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('connected') === 'google') { setTab('Accounts'); window.history.replaceState({}, '', '/settings') }
    if (params.get('error')) { setTab('Accounts'); window.history.replaceState({}, '', '/settings') }
  }, [])

  useEffect(() => {
    if (email) { loadSettings(); checkGoogleStatus(); loadTeam(); loadBibles() }
  }, [email])

  const loadBibles = async () => {
    if (!user?.id) return
    try {
      // Use team-list endpoint (service_role) to reliably get org_id — avoids RLS timing issues on anon client
      const teamRes = await fetch(`/api/team-list?user_id=${user.id}`)
      if (teamRes.ok) {
        const teamData = await teamRes.json()
        if (teamData.org?.id) {
          setUserOrgId(teamData.org.id)
          const orgRes = await fetch(`/api/org-bible?org_id=${teamData.org.id}`)
          if (orgRes.ok) { const d = await orgRes.json(); setOrgBibleContent(d.content || ''); setOrgBibleUpdatedAt(d.updated_at) }
        }
      }
      const userRes = await fetch(`/api/user-bible?user_id=${user.id}`)
      if (userRes.ok) { const d = await userRes.json(); setUserBibleContent(d.content || ''); setUserBibleUpdatedAt(d.updated_at) }
    } catch {}
  }

  const saveOrgBible = async () => {
    if (!userOrgId || !user?.id) return
    setOrgBibleSaving(true)
    try {
      const res = await fetch('/api/org-bible', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ org_id: userOrgId, content: orgBibleContent, user_id: user.id }) })
      if (res.ok) { setOrgBibleUpdatedAt(new Date().toISOString()); setSaved(true); setTimeout(() => setSaved(false), 2500) }
      else { const d = await res.json(); setSaveError(d.error || 'Save failed') }
    } catch (e) { setSaveError(e.message) }
    finally { setOrgBibleSaving(false) }
  }

  const saveUserBible = async () => {
    if (!user?.id) return
    setUserBibleSaving(true)
    try {
      const res = await fetch('/api/user-bible', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: user.id, content: userBibleContent }) })
      if (res.ok) { setUserBibleUpdatedAt(new Date().toISOString()); setSaved(true); setTimeout(() => setSaved(false), 2500) }
      else { const d = await res.json(); setSaveError(d.error || 'Save failed') }
    } catch (e) { setSaveError(e.message) }
    finally { setUserBibleSaving(false) }
  }

  const loadSettings = async () => {
    try {
      const { data } = await supabase.from('user_settings').select('*').eq('user_id', user?.id).single()
      if (data) setSettings(data)
      // Voice profile + sent_emails_analyzed + voice_last_learned live in kiko_user_config
      try {
        const { data: kc } = await supabase.from('kiko_user_config').select('email_voice_profile, voice_last_learned, sent_emails_analyzed, email_signature_html, email_signature_cold_html').eq('user_id', user?.id).maybeSingle()
        if (kc) setSettings(prev => ({ ...prev, email_voice_profile: kc.email_voice_profile, voice_last_learned: kc.voice_last_learned, sent_emails_analyzed: kc.sent_emails_analyzed, email_signature_html: prev?.email_signature_html || kc.email_signature_html, email_signature_cold_html: prev?.email_signature_cold_html || kc.email_signature_cold_html }))
      } catch {}
    } catch {}
  }

  const [sigUploading, setSigUploading] = useState(false)
  const [sigUploadError, setSigUploadError] = useState('')

  const uploadSignatureImage = async (file) => {
    if (!file) return
    setSigUploadError('')
    if (!file.type.startsWith('image/')) { setSigUploadError('Only image files'); return }
    if (file.size > 2 * 1024 * 1024) { setSigUploadError('Image too large (max 2MB)'); return }
    setSigUploading(true)
    try {
      const ext = file.name.split('.').pop() || 'png'
      const path = `signatures/${user?.id || 'anon'}-${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from('brand-assets').upload(path, file, { contentType: file.type, upsert: true })
      if (upErr) throw upErr
      const { data } = supabase.storage.from('brand-assets').getPublicUrl(path)
      const publicUrl = data?.publicUrl
      if (!publicUrl) throw new Error('No public URL returned')
      const imgTag = `<img src="${publicUrl}" width="120" alt="logo" />`
      // Append to current warm signature, or replace if empty
      setSettings(p => ({ ...p, email_signature_html: (p.email_signature_html || '') + (p.email_signature_html ? '\n' : '') + imgTag }))
    } catch (e) {
      setSigUploadError(e.message || 'Upload failed')
    } finally {
      setSigUploading(false)
    }
  }

  const saveSettings = async (updates) => {
    // Pre-flight: warn about Gmail inline images that won't render outside email
    const sigFields = [updates.email_signature_html, updates.email_signature_cold_html, updates.email_signature].filter(Boolean)
    for (const sig of sigFields) {
      if (typeof sig === 'string' && sig.length > 200000) {
        setSaveError('Signature too large (>200KB). Gmail inline images are embedded as base64 and exceed storage limits. Right-click any image in Gmail → "Copy image address", then re-paste with the image URL.')
        return
      }
    }
    try {
      const { error: usErr } = await supabase.from('user_settings').upsert({ user_id: user?.id, ...updates, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
      if (usErr) {
        console.error('[Settings] user_settings upsert failed:', usErr)
        setSaveError(`Save failed: ${usErr.message || 'unknown error'}`)
        return
      }
      // Mirror signature fields to kiko_user_config (canonical source for email-format wrapper)
      if (updates.email_signature_html !== undefined || updates.email_signature_cold_html !== undefined) {
        const mirror = {}
        if (updates.email_signature_html !== undefined) mirror.email_signature_html = updates.email_signature_html
        if (updates.email_signature_cold_html !== undefined) mirror.email_signature_cold_html = updates.email_signature_cold_html
        const { error: kcErr } = await supabase.from('kiko_user_config').update(mirror).eq('user_id', user?.id)
        if (kcErr) {
          console.error('[Settings] kiko_user_config mirror failed:', kcErr)
          // Non-fatal — primary save to user_settings already succeeded.
          // Show a soft warning so we know mirror is broken but don't block.
          setSaveError(`Saved to user_settings, but Kiko mirror failed: ${kcErr.message}. Outbound emails may not pick up the new signature until this is resolved.`)
        }
      }
      setSettings(prev => ({ ...prev, ...updates }))
      setSaved(true); setSaveError(null); setTimeout(() => setSaved(false), 2500)
      window.dispatchEvent(new Event('kiko_profile_updated'))
      // Sync brand logo to organisations table for login page (anon-accessible)
      if (updates.kiko_avatar_url !== undefined) {
        try {
          const orgId = user?.app_metadata?.org_id
          if (orgId) {
            const { data: org } = await supabase.from('organisations').select('branding').eq('id', orgId).maybeSingle()
            if (org) {
              await supabase.from('organisations').update({ branding: { ...(org.branding || {}), logo_url: updates.kiko_avatar_url } }).eq('id', orgId)
            }
          }
        } catch (orgErr) { console.error('[Settings] org branding sync failed:', orgErr) }
      }
    } catch (e) {
      console.error('[Settings] saveSettings fatal:', e)
      setSaveError(`Save crashed: ${e.message || String(e)}`)
    }
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
      const { data: members } = await supabase.from('kiko_user_config').select('id, user_id, email, display_name, role, job_title, location, active, created_at').order('created_at', { ascending: true })
      setTeamMembers(members || [])
      // Find current user's role
      const me = (members || []).find(m => m.email === email)
      if (me) setCurrentUserRole(me.role)
    } catch {}
  }

  const sendInvite = async () => {
    if (!inviteEmail.trim() || currentUserRole === 'user') return
    try {
      // Pre-provision the user in kiko_user_config so when they log in, their role is already set
      await supabase.from('kiko_user_config').upsert({
        user_id: '00000000-0000-0000-0000-000000000000', // placeholder until they log in
        email: inviteEmail.trim().toLowerCase(),
        display_name: inviteEmail.split('@')[0],
        role: inviteRole,
        company_name: teamMembers[0]?.company_name || '',
        active: true,
      }, { onConflict: 'email' })
      setInviteEmail(''); setSaved(true); setTimeout(() => setSaved(false), 2000); loadTeam()
    } catch {}
  }
  const changeRole = async (memberId, newRole) => {
    if (currentUserRole !== 'super_admin') return
    try {
      await supabase.from('kiko_user_config').update({ role: newRole, updated_at: new Date().toISOString() }).eq('id', memberId)
      loadTeam()
    } catch {}
  }
  const toggleActive = async (memberId, active) => {
    if (currentUserRole !== 'super_admin') return
    try {
      await supabase.from('kiko_user_config').update({ active: !active, updated_at: new Date().toISOString() }).eq('id', memberId)
      loadTeam()
    } catch {}
  }

  const revokeInvite = async (id) => {
    await supabase.from('invitations').update({ status: 'revoked' }).eq('id', id); loadTeam()
  }

  const inputStyle = {
    width: '100%', height: 44, borderRadius: 50, border: `1px solid ${T.border}`,
    padding: '0 14px', fontSize: 15, color: T.text, fontFamily: T.font,
    outline: 'none', background: T.surface, boxSizing: 'border-box',
  }
  const labelStyle = { fontSize: 14, fontWeight: 500, color: T.text, display: 'block', marginBottom: 6, fontFamily: T.font }
  const cardStyle = { background: '#FFFFFF', borderRadius: T.radius, border: `1px solid rgba(0,0,0,0.08)`, padding: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'transparent' }}>
      {/* Header + Tabs */}
      <div style={{ padding: '24px 32px 0' }}>
        <h1 style={{ fontSize: 25, fontWeight: 400, color: T.text, margin: '0 0 20px', fontFamily: T.font }}>Settings</h1>
        <div style={{ display: 'flex', gap: 4, borderBottom: `1px solid ${T.border}` }}>
          {TABS.filter(t => !SUPER_ADMIN_TABS.includes(t) || currentUserRole === 'super_admin').map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: '10px 16px', borderRadius: '8px 8px 0 0', border: 'none',
              background: tab === t ? T.surface : 'transparent',
              color: tab === t ? T.text : T.textTertiary,
              fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: T.font,
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
            {/* Profile Photo */}
            <div style={cardStyle}>
              <h3 style={{ fontSize: 15, fontWeight: 400, color: T.text, margin: '0 0 12px', fontFamily: T.font }}>Profile Photo</h3>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ width: 72, height: 72, borderRadius: '50%', overflow: 'hidden', background: T.accentSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: `2px solid ${T.border}` }}>
                  {settings.profile_photo_url ? (
                    <img src={settings.profile_photo_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <span style={{ fontSize: 25, fontWeight: 400, color: T.textTertiary, fontFamily: T.font }}>
                      {(settings.first_name || settings.display_name || email)?.[0]?.toUpperCase() || 'U'}
                    </span>
                  )}
                </div>
                <div>
                  <ImageUpload label="" storageKey={`profile_${user?.id}`} folder="profiles" onUploaded={(url) => setSettings(p => ({ ...p, profile_photo_url: url }))} currentUrl={settings.profile_photo_url} />
                </div>
              </div>
            </div>

            {/* Name */}
            <div style={cardStyle}>
              <h3 style={{ fontSize: 15, fontWeight: 400, color: T.text, margin: '0 0 12px', fontFamily: T.font }}>Personal Details</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>First Name</label>
                  <input value={settings.first_name || ''} onChange={e => setSettings(p => ({ ...p, first_name: e.target.value }))} placeholder="First" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Last Name</label>
                  <input value={settings.last_name || ''} onChange={e => setSettings(p => ({ ...p, last_name: e.target.value }))} placeholder="Last" style={inputStyle} />
                </div>
              </div>
              <div style={{ marginTop: 12 }}>
                <label style={labelStyle}>Email</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input value={email} disabled style={{ ...inputStyle, flex: 1, background: T.bg, color: T.textTertiary }} />
                  <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, background: 'rgba(52,199,89,0.1)', color: '#34C759', fontWeight: 500, flexShrink: 0 }}>Verified</span>
                </div>
              </div>
              <div style={{ marginTop: 12 }}>
                <label style={labelStyle}>Role / Title</label>
                <input value={settings.role_title || ''} onChange={e => setSettings(p => ({ ...p, role_title: e.target.value }))} placeholder="e.g. CEO, Account Executive" style={inputStyle} />
              </div>
              <div style={{ marginTop: 12 }}>
                <label style={labelStyle}>Phone</label>
                <input value={settings.phone || ''} onChange={e => setSettings(p => ({ ...p, phone: e.target.value }))} placeholder="+44 7xxx xxx xxx" style={inputStyle} />
              </div>
            </div>

            {/* Timezone + Bio */}
            <div style={cardStyle}>
              <h3 style={{ fontSize: 15, fontWeight: 400, color: T.text, margin: '0 0 12px', fontFamily: T.font }}>About</h3>
              <div>
                <label style={labelStyle}>Time Zone</label>
                <select value={settings.timezone || 'Europe/London'} onChange={e => setSettings(p => ({ ...p, timezone: e.target.value }))} style={{ ...inputStyle, height: 44, padding: '0 10px' }}>
                  {['Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Rome', 'Europe/Madrid',
                    'America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles',
                    'Asia/Dubai', 'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Kolkata', 'Asia/Singapore',
                    'Australia/Sydney', 'Pacific/Auckland', 'UTC'].map(tz => (
                    <option key={tz} value={tz}>{tz.replace(/_/g, ' ')}</option>
                  ))}
                </select>
              </div>
              <div style={{ marginTop: 12 }}>
                <label style={labelStyle}>Bio</label>
                <textarea value={settings.bio || ''} onChange={e => setSettings(p => ({ ...p, bio: e.target.value }))} placeholder="A brief description or tagline..." rows={3}
                  style={{ ...inputStyle, height: 'auto', minHeight: 80, padding: '10px 14px', resize: 'vertical' }} />
              </div>
              <div style={{ marginTop: 12 }}>
                <label style={labelStyle}>LinkedIn</label>
                <input value={settings.linkedin_url || ''} onChange={e => setSettings(p => ({ ...p, linkedin_url: e.target.value }))} placeholder="https://linkedin.com/in/yourprofile" style={inputStyle} />
              </div>
            </div>

            {/* Email Signature + Voice Profile */}
            <div style={cardStyle}>
              <h3 style={{ fontSize: 15, fontWeight: 400, color: T.text, margin: '0 0 12px', fontFamily: T.font }}>Email Signature & Voice</h3>

              {/* Save error banner — visible feedback when save fails */}
              {saveError && (
                <div style={{ padding: '12px 14px', borderRadius: 8, background: 'rgba(248,113,113,0.06)', border: '0.5px solid rgba(248,113,113,0.30)', marginBottom: 14, fontSize: 12, color: 'rgba(248,113,113,0.95)', fontFamily: T.font, lineHeight: 1.5 }}>
                  ⚠ {saveError}
                  <button onClick={() => setSaveError(null)} style={{ marginLeft: 10, padding: '2px 8px', borderRadius: 4, background: 'transparent', color: 'rgba(248,113,113,0.7)', border: '0.5px solid rgba(248,113,113,0.30)', fontSize: 10, cursor: 'pointer', fontFamily: T.font }}>dismiss</button>
                </div>
              )}

              {/* Voice profile status */}
              {settings.email_voice_profile && (
                <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(0,0,0,0.03)', border: '0.5px solid rgba(0,0,0,0.10)', marginBottom: 14, fontSize: 12, color: T.textSecondary, fontFamily: T.font }}>
                  ✓ Kiko learned your voice from <strong style={{ color: T.text }}>{settings.sent_emails_analyzed || 0} emails</strong>
                  {settings.voice_last_learned && <> · last updated {new Date(settings.voice_last_learned).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</>}
                  {settings.email_voice_profile?.tone && <> · tone: <strong style={{ color: T.text }}>{settings.email_voice_profile.tone}</strong></>}
                  {settings.email_voice_profile?.formality && <> · formality: <strong style={{ color: T.text }}>{settings.email_voice_profile.formality}</strong></>}
                </div>
              )}
              {!settings.email_voice_profile && (
                <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(251,191,36,0.05)', border: '0.5px solid rgba(251,191,36,0.20)', marginBottom: 14, fontSize: 12, color: T.textSecondary, fontFamily: T.font }}>
                  ⚠ No voice profile yet — runs Sundays at 4am, or trigger manually:&nbsp;
                  <button onClick={async () => { await fetch('/api/cron-email-voice-learning', { method: 'POST' }); alert('Voice learning queued — refresh in ~30s') }} style={{ padding: '3px 10px', borderRadius: 5, background: 'rgba(0,0,0,0.06)', color: T.accent, border: '0.5px solid rgba(0,0,0,0.10)', fontSize: 11, cursor: 'pointer', fontFamily: T.font }}>Run now</button>
                </div>
              )}

              {/* Signature status — Gmail is the source of truth, no editor needed */}
              <div style={{ padding: '14px 16px', borderRadius: 8, background: 'rgba(0,0,0,0.03)', border: '0.5px solid rgba(0,0,0,0.10)', marginBottom: 14, fontSize: 12, color: T.textSecondary, fontFamily: T.font, lineHeight: 1.6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ color: '#0A0A0A', fontSize: 14 }}>✓</span>
                  <strong style={{ color: T.text, fontSize: 13 }}>Using your Gmail signature</strong>
                </div>
                <div style={{ marginLeft: 22, color: T.textTertiary }}>
                  When Kiko sends emails on your behalf, it uses the signature you have configured in Gmail (including your logo). To change it, update your signature directly in <a href="https://mail.google.com/mail/u/0/#settings/general" target="_blank" rel="noopener" style={{ color: T.accent || '#0A0A0A', textDecoration: 'none' }}>Gmail Settings → General → Signature</a>.
                </div>
              </div>
            </div>

            {/* Notifications */}
            <div style={cardStyle}>
              <h3 style={{ fontSize: 15, fontWeight: 400, color: T.text, margin: '0 0 12px', fontFamily: T.font }}>Notifications</h3>
              {['Email notifications', 'Desktop notifications', 'Sound alerts'].map((n, i) => {
                const key = ['email', 'desktop', 'sound'][i]
                const on = settings.notification_prefs?.[key] ?? true
                return (
                  <div key={n} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0' }}>
                    <span style={{ fontSize: 15, color: T.textSecondary, fontFamily: T.font }}>{n}</span>
                    <div onClick={() => setSettings(p => ({ ...p, notification_prefs: { ...(p.notification_prefs || {}), [key]: !on } }))}
                      style={{ width: 44, height: 24, borderRadius: 50, background: on ? T.accent : T.border, position: 'relative', cursor: 'pointer', transition: 'background 0.2s' }}>
                      <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'rgba(0,0,0,0.04)', position: 'absolute', top: 2, transition: 'right 0.2s', right: on ? 2 : 22, boxShadow: '0 1px 3px #C0C0C0' }} />
                    </div>
                  </div>
                )
              })}
            </div>

            {/* In-app toast preferences (v0.0.40) */}
            <div style={cardStyle}>
              <h3 style={{ fontSize: 15, fontWeight: 400, color: T.text, margin: '0 0 4px', fontFamily: T.font }}>In-app toasts</h3>
              <div style={{ fontSize: 11, color: T.textTertiary, marginBottom: 12 }}>Control which event types pop a toast in the bottom-right corner. Mute anything you find too noisy.</div>
              {[
                { key: 'sequence_send', label: 'Sequence sends', desc: 'Toast when Kiko sends a batch of emails for an active campaign' },
                { key: 'alert', label: 'Alerts', desc: 'Errors, system warnings, failed actions' },
                { key: 'default', label: 'Other notifications', desc: 'Anything else (deal updates, reminders)' },
              ].map(({ key, label, desc }) => {
                const on = settings.notification_prefs?.[key] ?? true
                return (
                  <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, color: T.textSecondary, fontFamily: T.font }}>{label}</div>
                      <div style={{ fontSize: 11, color: T.textTertiary, marginTop: 2 }}>{desc}</div>
                    </div>
                    <div onClick={() => setSettings(p => ({ ...p, notification_prefs: { ...(p.notification_prefs || {}), [key]: !on } }))}
                      style={{ width: 44, height: 24, borderRadius: 50, background: on ? T.accent : T.border, position: 'relative', cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0, marginLeft: 16 }}>
                      <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'rgba(0,0,0,0.04)', position: 'absolute', top: 2, transition: 'right 0.2s', right: on ? 2 : 22, boxShadow: '0 1px 3px #C0C0C0' }} />
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Personal Bible (Layer 3) — moved from Kiko tab per Sunny's direction */}
            <div style={cardStyle}>
              <h3 style={{ fontSize: 15, fontWeight: 400, color: T.text, margin: '0 0 4px', fontFamily: T.font }}>Your Personal Context (Layer 3)</h3>
              <p style={{ fontSize: 12, color: T.textTertiary, margin: '0 0 12px', fontFamily: T.font }}>
                Private to you. Kiko sees this in every conversation. Add your preferences, personal details, communication style, or anything you want Kiko to always know about you.
              </p>
              <textarea
                value={userBibleContent}
                onChange={e => setUserBibleContent(e.target.value)}
                rows={10}
                style={{ width: '100%', border: `1px solid ${T.border}`, borderRadius: T.radiusSm, padding: 14, fontSize: 13, color: T.text, background: T.surface, fontFamily: T.mono, lineHeight: 1.6, resize: 'vertical', outline: 'none', boxSizing: 'border-box' }}
              />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
                <span style={{ fontSize: 11, color: T.textTertiary, fontFamily: T.font }}>
                  {userBibleContent.length.toLocaleString()} chars{userBibleUpdatedAt ? ` · Last saved ${new Date(userBibleUpdatedAt).toLocaleString('en-GB')}` : ''}
                </span>
                <button onClick={saveUserBible} disabled={userBibleSaving} style={{
                  padding: '8px 20px', borderRadius: 50, background: T.accent, color: '#fff',
                  border: 'none', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: T.font,
                  opacity: userBibleSaving ? 0.5 : 1,
                }}>{userBibleSaving ? 'Saving...' : 'Save Personal Context'}</button>
              </div>
            </div>

            <button onClick={() => saveSettings({
              display_name: settings.display_name, first_name: settings.first_name, last_name: settings.last_name,
              role_title: settings.role_title, phone: settings.phone, timezone: settings.timezone,
              bio: settings.bio, linkedin_url: settings.linkedin_url, profile_photo_url: settings.profile_photo_url,
              email_signature: settings.email_signature, email_signature_html: settings.email_signature_html, email_signature_cold_html: settings.email_signature_cold_html,
              notification_prefs: settings.notification_prefs,
            })}
              style={{ height: 44, borderRadius: 50, background: T.accent, color: '#FFFFFF', border: 'none', fontSize: 15, fontWeight: 500, cursor: 'pointer', fontFamily: T.font, width: 'fit-content', padding: '0 28px' }}>
              {saved ? 'Saved!' : 'Save changes'}
            </button>
          </div>
        )}

        {/* Kiko */}
        {tab === 'Kiko' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={cardStyle}>
              <h3 style={{ fontSize: 15, fontWeight: 400, color: T.text, margin: '0 0 4px', fontFamily: T.font }}>Voice</h3>
              <p style={{ fontSize: 12, color: T.textTertiary, margin: '0 0 14px', fontFamily: T.font }}>Choose Kiko's voice — click the play button to preview</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                {VOICES.map(v => {
                  const isSelected = (settings.kiko_voice || 'coral') === v.id
                  const isPreviewing = previewingVoice === v.id
                  return (
                    <div key={v.id} style={{
                      padding: '12px 14px', borderRadius: 8, border: `1.5px solid ${isSelected ? T.accent : T.border}`,
                      background: isSelected ? T.accent : '#FAFAF7',
                      color: isSelected ? '#FFFFFF' : T.text,
                      display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
                      transition: 'all 0.15s',
                    }} onClick={() => { saveSettings({ kiko_voice: v.id }); try { localStorage.setItem('kiko_voice', v.id) } catch {} }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 500, fontFamily: T.font }}>{v.label}</div>
                        <div style={{ fontSize: 11, opacity: 0.65, fontFamily: T.font, marginTop: 2 }}>{v.desc}</div>
                      </div>
                      <button onClick={(e) => { e.stopPropagation(); previewVoice(v.id) }} style={{
                        width: 34, height: 34, borderRadius: '50%', border: `1.5px solid ${isSelected ? 'rgba(255,255,255,0.3)' : 'rgba(0,0,0,0.12)'}`,
                        background: isSelected ? 'rgba(255,255,255,0.15)' : '#FFFFFF',
                        color: isSelected ? '#FFFFFF' : T.accent,
                        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 14, flexShrink: 0, fontWeight: 600,
                      }}>{isPreviewing ? '■' : '▶'}</button>
                    </div>
                  )
                })}
              </div>
            </div>

            <div style={cardStyle}>
              <h3 style={{ fontSize: 15, fontWeight: 400, color: T.text, margin: '0 0 4px', fontFamily: T.font }}>Voice Style</h3>
              <p style={{ fontSize: 12, color: T.textTertiary, margin: '0 0 14px', fontFamily: T.font }}>Controls tone, energy, and delivery — applies to both preview and live voice</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {VOICE_STYLES.map(s => {
                  const sel = (settings.kiko_voice_style || 'natural') === s.id
                  return (
                    <div key={s.id} onClick={() => { saveSettings({ kiko_voice_style: s.id }); try { localStorage.setItem('kiko_voice_style', s.id) } catch {} }} style={{
                      padding: '12px 16px', borderRadius: 8, border: `1.5px solid ${sel ? T.accent : T.border}`,
                      background: sel ? T.accent : '#FAFAF7',
                      color: sel ? '#FFFFFF' : T.text,
                      cursor: 'pointer', transition: 'all 0.15s',
                    }}>
                      <div style={{ fontSize: 14, fontWeight: 500, fontFamily: T.font }}>{s.label}</div>
                      <div style={{ fontSize: 11, opacity: 0.65, fontFamily: T.font, marginTop: 2 }}>{s.desc}</div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div style={cardStyle}>
              <h3 style={{ fontSize: 15, fontWeight: 400, color: T.text, margin: '0 0 4px', fontFamily: T.font }}>Speech Speed</h3>
              <p style={{ fontSize: 12, color: T.textTertiary, margin: '0 0 14px', fontFamily: T.font }}>Adjust how fast Kiko speaks</p>
              <div style={{ display: 'flex', gap: 8 }}>
                {SPEEDS.map(s => {
                  const sel = parseFloat(settings.kiko_speed || 1.0) === s.id
                  return (
                    <button key={s.id} onClick={() => { saveSettings({ kiko_speed: s.id }); try { localStorage.setItem('kiko_speed', String(s.id)) } catch {} }} style={{
                      padding: '10px 18px', borderRadius: 8, border: `1.5px solid ${sel ? T.accent : T.border}`,
                      background: sel ? T.accent : '#FAFAF7',
                      color: sel ? '#FFFFFF' : T.textSecondary,
                      fontSize: 13, cursor: 'pointer', fontFamily: T.font, fontWeight: 500,
                    }}>{s.label}</button>
                  )
                })}
              </div>
            </div>

            <div style={cardStyle}>
              <h3 style={{ fontSize: 15, fontWeight: 400, color: T.text, margin: '0 0 4px', fontFamily: T.font }}>Personality</h3>
              <p style={{ fontSize: 12, color: T.textTertiary, margin: '0 0 14px', fontFamily: T.font }}>How Kiko communicates in text responses</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {[
                  { id: 'concise', label: 'Concise', desc: 'Short, direct answers' },
                  { id: 'analytical', label: 'Analytical', desc: 'Detailed with reasoning' },
                  { id: 'warm', label: 'Warm', desc: 'Friendly and encouraging' },
                  { id: 'executive', label: 'Executive', desc: 'Board-level, strategic' },
                ].map(p => {
                  const sel = (settings.kiko_personality || 'executive') === p.id
                  return (
                    <button key={p.id} onClick={() => { saveSettings({ kiko_personality: p.id }); try { localStorage.setItem('kiko_personality', p.id) } catch {} }} style={{
                      padding: '10px 16px', borderRadius: 8, border: `1.5px solid ${sel ? T.accent : T.border}`,
                      background: sel ? T.accent : '#FAFAF7',
                      color: sel ? '#FFFFFF' : T.textSecondary,
                      fontSize: 13, cursor: 'pointer', fontFamily: T.font, textAlign: 'left',
                    }}>
                      <div style={{ fontWeight: 500 }}>{p.label}</div>
                      <div style={{ fontSize: 11, opacity: 0.6, marginTop: 2 }}>{p.desc}</div>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        )}
        {tab === 'Navigation' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Top Navigation Bar */}
            <div style={cardStyle}>
              <h3 style={{ fontSize: 15, fontWeight: 400, color: T.text, margin: '0 0 4px', fontFamily: T.font }}>Top Navigation Bar</h3>
              <p style={{ fontSize: 13, color: T.textTertiary, margin: '0 0 16px', fontFamily: T.font }}>Choose which pages appear in the floating top navigation. Home is always shown.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {/* Render enabled items in their actual order, then disabled items */}
                {[
                  ...topNavItems.map(id => ALL_TOP_NAV.find(t => t.id === id)).filter(Boolean),
                  ...ALL_TOP_NAV.filter(item => !topNavItems.includes(item.id))
                ].map((item, idx) => {
                  const isOn = topNavItems.includes(item.id)
                  const isHome = item.id === 'home'
                  const topIdx = topNavItems.indexOf(item.id)
                  const canMoveUp = isOn && !isHome && topIdx > 0 && topNavItems[0] === 'home' ? topIdx > 1 : topIdx > 0
                  const canMoveDown = isOn && !isHome && topIdx < topNavItems.length - 1
                  const moveItem = (dir) => {
                    const arr = [...topNavItems]
                    const from = arr.indexOf(item.id)
                    const to = from + dir
                    if (to < 0 || to >= arr.length) return
                    ;[arr[from], arr[to]] = [arr[to], arr[from]]
                    setTopNavItems(arr)
                    localStorage.setItem('kiko_top_nav_v2', JSON.stringify(arr))
                    window.dispatchEvent(new Event('kiko_top_nav_updated'))
                  }
                  return (
                    <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 50, background: isHome ? T.accentSoft : T.surface, border: `1px solid ${T.border}` }}>
                      {/* Reorder arrows */}
                      {isOn && !isHome ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 0, flexShrink: 0 }}>
                          <button onClick={() => moveItem(-1)} disabled={!canMoveUp} style={{ background: 'none', border: 'none', cursor: canMoveUp ? 'pointer' : 'default', color: canMoveUp ? T.textSecondary : 'rgba(0,0,0,0.08)', fontSize: 10, padding: '0 2px', lineHeight: 1 }}>▲</button>
                          <button onClick={() => moveItem(1)} disabled={!canMoveDown} style={{ background: 'none', border: 'none', cursor: canMoveDown ? 'pointer' : 'default', color: canMoveDown ? T.textSecondary : 'rgba(0,0,0,0.08)', fontSize: 10, padding: '0 2px', lineHeight: 1 }}>▼</button>
                        </div>
                      ) : <div style={{ width: 14 }} />}
                      <span style={{ flex: 1, fontSize: 14, fontWeight: 500, color: T.text, fontFamily: T.font }}>{item.label}</span>
                      {isHome ? (
                        <span style={{ fontSize: 10, color: T.textTertiary, padding: '2px 6px', borderRadius: 4, background: T.accentSoft }}>Always shown</span>
                      ) : (
                        <button onClick={() => {
                          const next = isOn ? topNavItems.filter(id => id !== item.id) : [...topNavItems, item.id]
                          setTopNavItems(next)
                          localStorage.setItem('kiko_top_nav_v2', JSON.stringify(next))
                          window.dispatchEvent(new Event('kiko_top_nav_updated'))
                        }} style={{
                          width: 38, height: 20, borderRadius: 50, border: 'none', cursor: 'pointer',
                          background: isOn ? T.accent : 'rgba(0,0,0,0.08)',
                          position: 'relative', transition: 'background 0.2s', padding: 0,
                        }}>
                          <div style={{
                            width: 16, height: 16, borderRadius: '50%', background: 'rgba(0,0,0,0.04)',
                            position: 'absolute', top: 2, left: isOn ? 20 : 2,
                            transition: 'left 0.2s', boxShadow: '0 1px 3px #C0C0C0',
                          }} />
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
              <button onClick={() => { setTopNavItems(DEFAULT_TOP_NAV); localStorage.setItem('kiko_top_nav_v2', JSON.stringify(DEFAULT_TOP_NAV)); window.dispatchEvent(new Event('kiko_top_nav_updated')) }}
                style={{ marginTop: 12, fontSize: 12, padding: '6px 12px', borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface, color: T.textSecondary, cursor: 'pointer', fontFamily: T.font }}>Reset to Default</button>
            </div>

            {/* More Dropdown Order */}
            <div style={cardStyle}>
              <h3 style={{ fontSize: 15, fontWeight: 400, color: T.text, margin: '0 0 4px', fontFamily: T.font }}>More Dropdown Order</h3>
              <p style={{ fontSize: 13, color: T.textTertiary, margin: '0 0 16px', fontFamily: T.font }}>Reorder items in the More dropdown menu.</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {(() => {
                  const moreItems = ALL_TOP_NAV.filter(n => !topNavItems.includes(n.id))
                  const ordered = moreOrder
                    ? [...moreItems].sort((a, b) => { const ai = moreOrder.indexOf(a.id); const bi = moreOrder.indexOf(b.id); return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi) })
                    : moreItems
                  return ordered.map((item, idx) => {
                    const canUp = idx > 0
                    const canDown = idx < ordered.length - 1
                    const moveMore = (dir) => {
                      const ids = ordered.map(i => i.id)
                      const from = idx; const to = idx + dir
                      if (to < 0 || to >= ids.length) return
                      ;[ids[from], ids[to]] = [ids[to], ids[from]]
                      setMoreOrder(ids)
                      localStorage.setItem('kiko_more_order', JSON.stringify(ids))
                      window.dispatchEvent(new Event('kiko_more_order_updated'))
                    }
                    return (
                      <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 50, background: T.surface, border: `1px solid ${T.border}` }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 0, flexShrink: 0 }}>
                          <button onClick={() => moveMore(-1)} disabled={!canUp} style={{ background: 'none', border: 'none', cursor: canUp ? 'pointer' : 'default', color: canUp ? T.textSecondary : 'rgba(0,0,0,0.08)', fontSize: 10, padding: '0 2px', lineHeight: 1 }}>▲</button>
                          <button onClick={() => moveMore(1)} disabled={!canDown} style={{ background: 'none', border: 'none', cursor: canDown ? 'pointer' : 'default', color: canDown ? T.textSecondary : 'rgba(0,0,0,0.08)', fontSize: 10, padding: '0 2px', lineHeight: 1 }}>▼</button>
                        </div>
                        <span style={{ flex: 1, fontSize: 14, fontWeight: 500, color: T.text, fontFamily: T.font }}>{item.label}</span>
                      </div>
                    )
                  })
                })()}
              </div>
            </div>
          </div>
        )}

        {/* Skills */}
        {tab === 'Skills' && <SkillsManager />}

        {tab === 'Memory' && <MemoryTab user={user} canExport={currentUserRole === 'super_admin' || currentUserRole === 'admin'} />}

        {/* Team */}
        {tab === 'Team' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Add user — super_admin and admin only */}
            {(currentUserRole === 'super_admin' || currentUserRole === 'admin') && (
              <div style={cardStyle}>
                <h3 style={{ fontSize: 15, fontWeight: 400, color: T.text, margin: '0 0 4px', fontFamily: T.font }}>Add User</h3>
                <p style={{ fontSize: 12, color: T.textTertiary, margin: '0 0 12px', fontFamily: T.font }}>Pre-provision a user. When they log in with Google, Kiko will recognise them.</p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendInvite()}
                    placeholder="colleague@company.com" style={{ ...inputStyle, flex: 1 }} />
                  <select value={inviteRole} onChange={e => setInviteRole(e.target.value)}
                    style={{ ...inputStyle, width: 110, padding: '0 8px' }}>
                    <option value="user">User</option>
                    <option value="admin">Admin</option>
                    {currentUserRole === 'super_admin' && <option value="super_admin">Super Admin</option>}
                  </select>
                  <button onClick={sendInvite} style={{
                    height: 44, padding: '0 16px', borderRadius: 50, background: T.accent, color: '#FFFFFF',
                    border: 'none', fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: T.font,
                    display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap',
                  }}><UserPlus size={14} /> Add</button>
                </div>
              </div>
            )}

            {/* User list */}
            <div>
              <h3 style={{ fontSize: 12, fontWeight: 400, color: T.textTertiary, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 8px', fontFamily: T.font }}>
                Users ({teamMembers.length})
              </h3>
              {teamMembers.length === 0 ? (
                <p style={{ fontSize: 14, color: T.textTertiary, fontFamily: T.font }}>No users yet</p>
              ) : teamMembers.map(m => (
                <div key={m.id} style={{ ...cardStyle, padding: '14px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, opacity: m.active ? 1 : 0.5 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}>
                    <div style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                      background: m.role === 'super_admin' ? 'rgba(0,0,0,0.08)' : m.role === 'admin' ? 'rgba(0,212,170,0.15)' : T.accentSoft,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 500,
                      color: m.role === 'super_admin' ? '#0A0A0A' : m.role === 'admin' ? '#0A0A0A' : T.textSecondary,
                      fontFamily: T.font,
                    }}>
                      {(m.display_name || m.email)?.[0]?.toUpperCase()}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontSize: 14, color: T.text, margin: 0, fontFamily: T.font, fontWeight: 400 }}>
                        {m.display_name || m.email.split('@')[0]}
                        {m.email === email && <span style={{ fontSize: 11, color: T.textTertiary, marginLeft: 6 }}>(you)</span>}
                      </p>
                      <p style={{ fontSize: 12, color: T.textTertiary, margin: '2px 0 0', fontFamily: T.font, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {m.email}{m.job_title ? ` · ${m.job_title}` : ''}{m.location ? ` · ${m.location}` : ''}
                      </p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    {/* Role selector — only super_admin can change roles, can't change own role */}
                    {currentUserRole === 'super_admin' && m.email !== email ? (
                      <select value={m.role} onChange={e => changeRole(m.id, e.target.value)}
                        style={{ fontSize: 12, padding: '5px 8px', borderRadius: 50, border: `1px solid ${T.border}`,
                          background: 'transparent', color: T.textSecondary, fontFamily: T.font, cursor: 'pointer', outline: 'none' }}>
                        <option value="user">User</option>
                        <option value="admin">Admin</option>
                        <option value="super_admin">Super Admin</option>
                      </select>
                    ) : (
                      <span style={{ fontSize: 12, padding: '5px 12px', borderRadius: 50, fontWeight: 500,
                        background: m.role === 'super_admin' ? 'rgba(0,0,0,0.08)' : m.role === 'admin' ? 'rgba(0,212,170,0.12)' : `${T.accentSoft}`,
                        color: m.role === 'super_admin' ? '#0A0A0A' : m.role === 'admin' ? '#0A0A0A' : T.textSecondary,
                        fontFamily: T.font,
                      }}>{m.role === 'super_admin' ? 'Super Admin' : m.role === 'admin' ? 'Admin' : 'User'}</span>
                    )}
                    {/* Permissions button — super_admin only */}
                    {currentUserRole === 'super_admin' && (
                      <button onClick={async () => {
                        setPermModalMember(m)
                        try {
                          const res = await fetch(`/api/user-permissions?user_id=${m.user_id}&organization_id=${userOrgId}`)
                          if (res.ok) { const d = await res.json(); setPermEffective(d.effective || {}); setPermOverrides(d.overrides || {}) }
                        } catch {}
                      }} title="Page permissions" style={{ background: 'none', border: `1px solid ${T.border}`, borderRadius: 6, cursor: 'pointer', color: T.textTertiary, padding: '4px 8px', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, fontFamily: T.font }}>
                        <Shield size={11} /> Permissions
                      </button>
                    )}
                    {/* Deactivate toggle — super_admin only, can't deactivate self */}
                    {currentUserRole === 'super_admin' && m.email !== email && (
                      <button onClick={() => toggleActive(m.id, m.active)} title={m.active ? 'Deactivate' : 'Reactivate'}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: m.active ? T.textTertiary : '#FF5050', padding: 4, fontSize: 14 }}>
                        {m.active ? '✓' : '✗'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Info card */}
            <div style={{ ...cardStyle, background: 'rgba(0,0,0,0.04)', borderColor: 'rgba(0,0,0,0.08)' }}>
              <p style={{ fontSize: 13, color: T.textSecondary, margin: 0, lineHeight: 1.6, fontFamily: T.font }}>
                <strong style={{ color: T.text }}>How it works:</strong> Anyone who logs in with Google is automatically added as a User. 
                Super Admins can promote users to Admin or Super Admin. Each user gets their own private Kiko experience — 
                personal context, email, calendar, and conversation memory are completely isolated. Shared data (CRM, pipeline, contacts) 
                is visible to everyone.
              </p>
            </div>
          </div>
        )}

        {/* Permissions Modal */}
        {permModalMember && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setPermModalMember(null)}>
            <div onClick={e => e.stopPropagation()} style={{ width: 420, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: 24, boxShadow: '0 16px 48px rgba(0,0,0,0.4)', maxHeight: '80vh', overflowY: 'auto' }}>
              <h3 style={{ fontSize: 15, fontWeight: 500, color: T.text, margin: '0 0 4px', fontFamily: T.font }}>Page permissions</h3>
              <p style={{ fontSize: 12, color: T.textTertiary, margin: '0 0 16px', fontFamily: T.font }}>{permModalMember.display_name || permModalMember.email} — {permModalMember.role}</p>
              {permModalMember.role === 'super_admin' && (
                <p style={{ fontSize: 12, color: T.accent, margin: '0 0 12px', fontFamily: T.font }}>Super admins always see all pages. Permissions cannot be restricted.</p>
              )}
              {ALL_PAGES.map(page => {
                const roleDefault = ROLE_DEFAULTS[permModalMember.role]?.includes(page.key) ?? false
                const isOverridden = page.key in permOverrides
                const effective = permEffective[page.key] !== false
                const isSA = permModalMember.role === 'super_admin'
                return (
                  <label key={page.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', cursor: isSA ? 'default' : 'pointer', borderBottom: `1px solid ${T.border}` }}>
                    <input type="checkbox" checked={effective} disabled={isSA || permSaving || page.alwaysVisible}
                      onChange={async () => {
                        const newVal = !effective
                        setPermSaving(true)
                        try {
                          if ((newVal === roleDefault) && isOverridden) {
                            await fetch('/api/user-permissions', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: permModalMember.user_id, organization_id: userOrgId, page_key: page.key, caller_id: user?.id }) })
                            setPermOverrides(prev => { const n = { ...prev }; delete n[page.key]; return n })
                          } else {
                            const res = await fetch('/api/user-permissions', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: permModalMember.user_id, organization_id: userOrgId, page_key: page.key, can_view: newVal, caller_id: user?.id }) })
                            if (res.ok) { const d = await res.json(); setPermEffective(d.effective || {}); setPermOverrides(prev => ({ ...prev, [page.key]: newVal })) }
                          }
                        } catch {}
                        setPermSaving(false)
                      }}
                      style={{ accentColor: T.accent, width: 16, height: 16 }} />
                    <span style={{ fontSize: 13, color: T.text, fontFamily: T.font, flex: 1 }}>{page.label}</span>
                    <span style={{ fontSize: 10, color: T.textTertiary, fontFamily: T.font }}>{isOverridden ? 'override' : `role default: ${roleDefault ? '✓' : '✗'}`}</span>
                  </label>
                )
              })}
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
                <button onClick={() => setPermModalMember(null)} style={{ padding: '8px 20px', borderRadius: 50, background: T.accent, color: '#fff', border: 'none', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: T.font }}>Close</button>
              </div>
            </div>
          </div>
        )}

        {/* Organisation Bible — super_admin only */}
        {tab === 'Organisation' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={cardStyle}>
              <h3 style={{ fontSize: 15, fontWeight: 400, color: T.text, margin: '0 0 4px', fontFamily: T.font }}>Organisation Doctrine (Layer 2)</h3>
              <p style={{ fontSize: 12, color: T.textTertiary, margin: '0 0 12px', fontFamily: T.font }}>
                This content is injected into Kiko's system prompt for ALL members of this organisation. It defines vocabulary, tone, industry rules, and company-specific doctrine. Only super_admin can edit.
              </p>
              <textarea
                value={orgBibleContent}
                onChange={e => setOrgBibleContent(e.target.value)}
                rows={18}
                style={{ width: '100%', border: `1px solid ${T.border}`, borderRadius: T.radiusSm, padding: 14, fontSize: 13, color: T.text, background: T.surface, fontFamily: T.mono, lineHeight: 1.6, resize: 'vertical', outline: 'none', boxSizing: 'border-box' }}
              />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
                <span style={{ fontSize: 11, color: T.textTertiary, fontFamily: T.font }}>
                  {orgBibleContent.length.toLocaleString()} chars{orgBibleUpdatedAt ? ` · Last saved ${new Date(orgBibleUpdatedAt).toLocaleString('en-GB')}` : ''}
                </span>
                <button onClick={saveOrgBible} disabled={orgBibleSaving} style={{
                  padding: '8px 20px', borderRadius: 50, background: T.accent, color: '#fff',
                  border: 'none', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: T.font,
                  opacity: orgBibleSaving ? 0.5 : 1,
                }}>{orgBibleSaving ? 'Saving...' : 'Save Doctrine'}</button>
              </div>
            </div>
          </div>
        )}

        {/* Appearance */}
        {tab === 'Appearance' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={cardStyle}>
              <h3 style={{ fontSize: 15, fontWeight: 400, color: T.text, margin: '0 0 4px', fontFamily: T.font }}>Branding</h3>
              <p style={{ fontSize: 13, color: T.textTertiary, lineHeight: 1.5, margin: '0 0 16px', fontFamily: T.font }}>
                Upload logos and images. Click to upload, crop to fit, then save.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

                {/* Logo — shown in navigation bar AND on login page */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: navLogo ? 6 : 0 }}>
                    <span />
                    {navLogo && <button onClick={() => saveBranding({ logo_url: null })} title="Reset to default" style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: T.textTertiary, padding: 0 }}><X size={12} /> Reset to default</button>}
                  </div>
                  <ImageUpload label="Logo" storageKey="logo" folder="logos" aspectHint="Shown in the top-left nav bar and above the sign-in form on the login page" currentUrl={navLogo} onUploaded={(url) => saveBranding({ logo_url: url })} />
                </div>

                {/* Browser Favicon */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: favicon ? 6 : 0 }}>
                    <span />
                    {favicon && <button onClick={() => saveBranding({ favicon_url: null })} title="Reset to default" style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: T.textTertiary, padding: 0 }}><X size={12} /> Reset to default</button>}
                  </div>
                  <ImageUpload label="Browser Favicon" storageKey="favicon" folder="logos" aspectHint="Square, shown in the browser tab (32×32 recommended)" currentUrl={favicon} onUploaded={(url) => saveBranding({ favicon_url: url })} />
                </div>

              </div>
            </div>
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
                    <p style={{ fontSize: 15, fontWeight: 500, color: T.text, margin: 0, fontFamily: T.font }}>Google</p>
                    <p style={{ fontSize: 13, color: T.textTertiary, margin: '2px 0 0', fontFamily: T.font }}>Gmail + Calendar</p>
                  </div>
                </div>
                {googleStatus?.connected ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, color: '#2E7D32' }}><Check size={12} /> Connected</span>
                    <button onClick={disconnectGoogle} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: T.textTertiary }}>
                      <Unplug size={12} /> Disconnect
                    </button>
                  </div>
                ) : (
                  <button onClick={connectGoogle} style={{
                    height: 36, padding: '0 16px', borderRadius: T.radiusSm, background: T.accent, color: '#FFFFFF',
                    border: 'none', fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: T.font,
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}><ExternalLink size={12} /> Connect</button>
                )}
              </div>
              {googleStatus?.connected && (
                <div style={{ fontSize: 12, color: T.textTertiary, marginTop: 12, paddingLeft: 52, fontFamily: T.font }}>
                  <p style={{ margin: '0 0 2px' }}>Scopes: Gmail (full), Calendar, Profile</p>
                  <p style={{ margin: 0 }}>Last updated: {googleStatus.last_updated ? new Date(googleStatus.last_updated).toLocaleString() : 'Unknown'}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'Health' && currentUserRole === 'super_admin' && (
          <div>
            <Suspense fallback={<div style={{ padding: 40, color: T.textTertiary, fontFamily: T.font }}>Loading health centre…</div>}>
              <AdminSystem />
            </Suspense>
          </div>
        )}
      </div>
    </div>
  )
}
