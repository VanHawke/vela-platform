// src/pages/Messages.jsx — Team messaging: presence, reactions, threading, Teams-quality file sharing
import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useVoiceCall } from '../hooks/useVoiceCall'

const API = 'https://api.vanhawke.agency'
const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY)
const EMOJIS = ['👍', '❤️', '😂', '🔥', '👀', '🎉']
const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB
const MAX_FILES = 10

const C = {
  bg: '#FFFFFF', surface: '#FAFAFA', card: '#F5F5F5',
  border: 'rgba(0,0,0,0.06)', borderLight: 'rgba(0,0,0,0.04)',
  text: '#0A0A0A', sub: '#6B6B6B', muted: '#A0A0A0',
  accent: '#E8700A', accentSoft: 'rgba(232,112,10,0.08)',
  green: '#16A34A', amber: '#D97706', red: '#DC2626', purple: '#7C3AED',
  font: "'Inter', system-ui, -apple-system, sans-serif",
}
const STATUS_COLORS = { online: C.green, away: C.amber, busy: C.red, offline: '#9CA3AF' }

const FILE_ICONS = { pdf: '📕', doc: '📝', docx: '📝', xls: '📊', xlsx: '📊', ppt: '📎', pptx: '📎', txt: '📄', csv: '📊', zip: '📦', default: '📄' }
const getFileIcon = (name) => { const ext = name?.split('.').pop()?.toLowerCase(); return FILE_ICONS[ext] || FILE_ICONS.default }
const formatFileSize = (bytes) => { if (bytes < 1024) return bytes + ' B'; if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB'; return (bytes / 1048576).toFixed(1) + ' MB' }

// Clean SVG icons — no emojis
const Icon = ({ name, size = 16, color = 'currentColor', strokeWidth = 1.8 }) => {
  const s = { width: size, height: size, flexShrink: 0, display: 'inline-block', verticalAlign: 'middle' }
  const p = { fill: 'none', stroke: color, strokeWidth, strokeLinecap: 'round', strokeLinejoin: 'round' }
  const icons = {
    phone: <svg style={s} viewBox="0 0 24 24" {...p}><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6A19.79 19.79 0 012.12 4.18 2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>,
    folder: <svg style={s} viewBox="0 0 24 24" {...p}><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>,
    search: <svg style={s} viewBox="0 0 24 24" {...p}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
    settings: <svg style={s} viewBox="0 0 24 24" {...p}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>,
    plus: <svg style={s} viewBox="0 0 24 24" {...p}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
    send: <svg style={s} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>,
    smile: <svg style={s} viewBox="0 0 24 24" {...p}><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>,
    reply: <svg style={s} viewBox="0 0 24 24" {...p}><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 00-4-4H4"/></svg>,
    edit: <svg style={s} viewBox="0 0 24 24" {...p}><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
    trash: <svg style={s} viewBox="0 0 24 24" {...p}><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>,
    pin: <svg style={s} viewBox="0 0 24 24" {...p}><path d="M12 17v5"/><path d="M9 2h6l-1 7h4l-6 7h-1l2-7H6l3-7z"/></svg>,
    hash: <svg style={s} viewBox="0 0 24 24" {...p}><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/></svg>,
    x: <svg style={s} viewBox="0 0 24 24" {...p}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
    check: <svg style={s} viewBox="0 0 24 24" {...p}><polyline points="20 6 9 17 4 12"/></svg>,
    muted: <svg style={s} viewBox="0 0 24 24" {...p}><path d="M11 5L6 9H2v6h4l5 4V5z"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>,
    download: <svg style={s} viewBox="0 0 24 24" {...p}><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
  }
  return icons[name] || null
}

function Avatar({ name, size = 32, color, status }) {
  const initials = (name || '??').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  const hue = name ? name.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 360 : 0
  const bg = color || `hsl(${hue}, 55%, 50%)`
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.36, fontWeight: 600, color: '#fff', fontFamily: C.font, position: 'relative', flexShrink: 0 }}>
      {initials}
      {status && <div style={{ position: 'absolute', bottom: 0, right: 0, width: size * 0.3, height: size * 0.3, borderRadius: '50%', background: STATUS_COLORS[status] || '#9CA3AF', border: `2px solid ${C.bg}` }} />}
    </div>
  )
}

// File card in messages — rich preview like Teams
function FileCard({ content, isMine }) {
  const imgMatch = content?.match(/📎 \[Image: ([^\]]+)\]\((https?:\/\/[^)]+)\)/)
  const fileMatch = content?.match(/📎 \[File: ([^\]]+)\|([^\]]*)\]\((https?:\/\/[^)]+)\)/)
  const legacyFile = content?.match(/📎 \[File: ([^\]]+)\]\((https?:\/\/[^)]+)\)/)
  if (imgMatch) return (
    <div><img src={imgMatch[2]} alt="" style={{ maxWidth: 300, maxHeight: 220, borderRadius: 8, display: 'block', cursor: 'pointer' }} onClick={() => window.open(imgMatch[2], '_blank')} /><span style={{ fontSize: 11, opacity: 0.7, marginTop: 2, display: 'block' }}>{imgMatch[1]}</span></div>
  )
  const name = fileMatch?.[1] || legacyFile?.[1] || 'File'
  const size = fileMatch?.[2] || ''
  const url = fileMatch?.[3] || legacyFile?.[2] || '#'
  return (
    <a href={url} target="_blank" rel="noopener" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 10, background: isMine ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.03)', border: `1px solid ${isMine ? 'rgba(255,255,255,0.15)' : C.borderLight}`, textDecoration: 'none', minWidth: 180 }}>
      <span style={{ fontSize: 24 }}>{getFileIcon(name)}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: isMine ? '#fff' : C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
        {size && <div style={{ fontSize: 10, color: isMine ? 'rgba(255,255,255,0.7)' : C.muted }}>{size}</div>}
      </div>
      <span style={{ fontSize: 14, color: isMine ? 'rgba(255,255,255,0.5)' : C.muted }}>↓</span>
    </a>
  )
}

// Link preview — auto-unfurl URLs in messages
function LinkPreview({ url, isMine }) {
  const [preview, setPreview] = useState(null)
  useEffect(() => {
    if (!url) return
    fetch(`${API}/api/team-messages?action=unfurl`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) })
      .then(r => r.json()).then(d => { if (d.preview) setPreview(d.preview) }).catch(() => {})
  }, [url])
  if (!preview) return null
  return (
    <a href={preview.url} target="_blank" rel="noopener" style={{ display: 'block', marginTop: 6, borderRadius: 10, overflow: 'hidden', border: `1px solid ${isMine ? 'rgba(255,255,255,0.15)' : C.borderLight}`, textDecoration: 'none', maxWidth: 320 }}>
      {preview.image && <img src={preview.image} alt="" style={{ width: '100%', height: 140, objectFit: 'cover', display: 'block' }} onError={e => e.target.style.display = 'none'} />}
      <div style={{ padding: '8px 10px', background: isMine ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.02)' }}>
        {preview.siteName && <div style={{ fontSize: 10, color: isMine ? 'rgba(255,255,255,0.6)' : C.muted, marginBottom: 2 }}>{preview.siteName}</div>}
        <div style={{ fontSize: 12, fontWeight: 600, color: isMine ? '#fff' : C.text, lineHeight: 1.3 }}>{preview.title}</div>
        {preview.description && <div style={{ fontSize: 11, color: isMine ? 'rgba(255,255,255,0.7)' : C.sub, marginTop: 3, lineHeight: 1.4 }}>{preview.description.slice(0, 120)}{preview.description.length > 120 ? '...' : ''}</div>}
      </div>
    </a>
  )
}

export default function Messages({ user }) {
  const [channels, setChannels] = useState([])
  const [activeChannel, setActiveChannel] = useState(null)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [typingUsers, setTypingUsers] = useState([])
  const [presence, setPresence] = useState({})
  const [replyTo, setReplyTo] = useState(null)
  const [hoveredMsg, setHoveredMsg] = useState(null)
  const [showReactions, setShowReactions] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const [stagedFiles, setStagedFiles] = useState([]) // Files staged before sending
  const [uploadProgress, setUploadProgress] = useState({}) // {filename: 0-100}
  const [editingMsg, setEditingMsg] = useState(null)
  const [editText, setEditText] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [showFilesPanel, setShowFilesPanel] = useState(false)
  const [showChannelSettings, setShowChannelSettings] = useState(false)
  const [channelRename, setChannelRename] = useState('')
  const [mutedChannels, setMutedChannels] = useState(() => {
    try { return JSON.parse(localStorage.getItem('kiko_muted_channels') || '[]') } catch { return [] }
  })
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)
  const fileInputRef = useRef(null)
  const typingTimeoutRef = useRef(null)
  const idleTimerRef = useRef(null)

  const userId = user?.id || '9f486437-4bf5-4111-abfe-fe19bfa76063'
  const userName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Sunny'

  // Voice calling
  const voice = useVoiceCall({ userId, userName, channelId: activeChannel })
  const [offlineCallConfirm, setOfflineCallConfirm] = useState(null) // { recipientId, recipientName }

  const loadChannels = useCallback(async () => {
    try { const res = await fetch(`${API}/api/team-messages?action=channels&userId=${userId}`); const d = await res.json(); setChannels(d.channels || []); if (!activeChannel && d.channels?.length) setActiveChannel(d.channels[0].id) } catch (e) {} finally { setLoading(false) }
  }, [userId, activeChannel])
  const loadMessages = useCallback(async () => {
    if (!activeChannel) return
    try { const res = await fetch(`${API}/api/team-messages?action=messages`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channelId: activeChannel }) }); const d = await res.json(); setMessages(d.messages || []); fetch(`${API}/api/team-messages?action=read`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channelId: activeChannel, userId }) }).catch(() => {}) } catch (e) {}
  }, [activeChannel, userId])
  const loadPresence = useCallback(async () => {
    try { const res = await fetch(`${API}/api/team-messages?action=presence`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId }) }); const d = await res.json(); const m = {}; (d.presence || []).forEach(p => { m[p.user_id] = p }); setPresence(m) } catch (e) {}
  }, [userId])

  // Effects: heartbeat, idle, data loading, realtime
  useEffect(() => { const ping = () => fetch(`${API}/api/team-messages?action=presence`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, status: 'online' }) }).catch(() => {}); ping(); const hb = setInterval(ping, 60000); return () => clearInterval(hb) }, [userId])
  useEffect(() => { const reset = () => { clearTimeout(idleTimerRef.current); idleTimerRef.current = setTimeout(() => { fetch(`${API}/api/team-messages?action=presence`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId, status: 'away' }) }).catch(() => {}) }, 300000) }; ['mousemove','keydown','click'].forEach(e => window.addEventListener(e, reset)); reset(); return () => { ['mousemove','keydown','click'].forEach(e => window.removeEventListener(e, reset)); clearTimeout(idleTimerRef.current) } }, [userId])
  useEffect(() => { loadChannels() }, [loadChannels])
  useEffect(() => { loadMessages(); setReplyTo(null); setStagedFiles([]) }, [loadMessages])
  useEffect(() => { loadPresence(); const i = setInterval(loadPresence, 30000); return () => clearInterval(i) }, [loadPresence])
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])
  useEffect(() => { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission() }, [])

  // Realtime: INSERT + UPDATE on messages
  useEffect(() => {
    const ch = supabase.channel('team-messages').on('postgres_changes', { event: '*', schema: 'public', table: 'kiko_team_messages' }, payload => {
      if (payload.eventType === 'INSERT' && payload.new.channel_id === activeChannel) {
        setMessages(prev => { if (prev.some(m => m.id === payload.new.id)) return prev; return [...prev.filter(m => !(m.id?.toString().startsWith('temp-') && m.content === payload.new.content && m.from_user_id === payload.new.from_user_id)), payload.new] })
      } else if (payload.eventType === 'UPDATE' && payload.new.channel_id === activeChannel) {
        setMessages(prev => prev.map(m => m.id === payload.new.id ? payload.new : m))
      }
      if (payload.eventType === 'INSERT' && payload.new.from_user_id !== userId && !mutedChannels.includes(payload.new.channel_id) && 'Notification' in window && Notification.permission === 'granted') {
        new Notification(`${payload.new.from_name}`, { body: payload.new.content?.slice(0, 100), tag: payload.new.id })
      }
      loadChannels()
    }).subscribe(); return () => supabase.removeChannel(ch)
  }, [activeChannel, channels, userId, loadChannels])

  // Typing indicator
  useEffect(() => { if (!activeChannel) return; const ch = supabase.channel(`typing-${activeChannel}`).on('broadcast', { event: 'typing' }, ({ payload }) => { if (payload.userId !== userId) { setTypingUsers(prev => prev.find(u => u.userId === payload.userId) ? prev : [...prev, { userId: payload.userId, name: payload.name }]); setTimeout(() => setTypingUsers(prev => prev.filter(u => u.userId !== payload.userId)), 3000) } }).subscribe(); return () => supabase.removeChannel(ch) }, [activeChannel, userId])
  useEffect(() => { const t = channels.reduce((s, ch) => s + (ch.unreadCount || 0), 0); window.dispatchEvent(new CustomEvent('kiko_unread_messages', { detail: { count: t } })) }, [channels])

  // Send message (text + any staged files)
  const sendMessage = async () => {
    const text = input.trim()
    if ((!text && stagedFiles.length === 0) || sending || !activeChannel) return
    setSending(true); setInput('')
    // Upload staged files first
    const fileContents = []
    for (const sf of stagedFiles) {
      setUploadProgress(prev => ({ ...prev, [sf.file.name]: 10 }))
      const ext = sf.file.name.split('.').pop()
      const path = `team-chat/${activeChannel}/${Date.now()}-${sf.file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
      const { error } = await supabase.storage.from('vela-assets').upload(path, sf.file, { contentType: sf.file.type })
      setUploadProgress(prev => ({ ...prev, [sf.file.name]: error ? -1 : 100 }))
      if (!error) {
        const { data: urlData } = supabase.storage.from('vela-assets').getPublicUrl(path)
        const isImg = sf.file.type.startsWith('image/')
        fileContents.push(isImg ? `📎 [Image: ${sf.file.name}](${urlData?.publicUrl})` : `📎 [File: ${sf.file.name}|${formatFileSize(sf.file.size)}](${urlData?.publicUrl})`)
      }
    }
    setStagedFiles([]); setUploadProgress({})
    // Build full message content
    const parts = []; if (text) parts.push(text); parts.push(...fileContents)
    const content = parts.join('\n')
    if (!content) { setSending(false); return }
    const optimistic = { id: 'temp-' + Date.now(), channel_id: activeChannel, from_user_id: userId, from_name: userName, content, message_type: 'text', created_at: new Date().toISOString(), reply_to: replyTo?.id || null, reactions: {}, read_by: [userId] }
    setMessages(prev => [...prev, optimistic]); setReplyTo(null)
    try { await fetch(`${API}/api/team-messages?action=send`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channelId: activeChannel, fromUserId: userId, fromName: userName, content, replyTo: replyTo?.id }) }) } catch (e) {}
    finally { setSending(false); inputRef.current?.focus() }
  }

  const handleReact = async (messageId, emoji) => {
    try { const res = await fetch(`${API}/api/team-messages?action=react`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messageId, userId, emoji }) }); const d = await res.json(); if (d.reactions) setMessages(prev => prev.map(m => m.id === messageId ? { ...m, reactions: d.reactions } : m)) } catch (e) {}
  }

  const handleEdit = async (messageId) => {
    if (!editText.trim()) return
    try { await fetch(`${API}/api/team-messages?action=edit`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messageId, userId, content: editText.trim() }) }) } catch (e) {}
    setEditingMsg(null); setEditText('')
  }

  const handleDelete = async (messageId) => {
    if (!confirm('Delete this message?')) return
    try { await fetch(`${API}/api/team-messages?action=delete`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messageId, userId }) }) } catch (e) {}
  }

  const filteredMessages = searchQuery
    ? messages.filter(m => m.content?.toLowerCase().includes(searchQuery.toLowerCase()) || m.from_name?.toLowerCase().includes(searchQuery.toLowerCase()))
    : messages

  // @mention autocomplete
  const TEAM_MEMBERS = [
    { id: '9f486437-4bf5-4111-abfe-fe19bfa76063', name: 'Sunny Sidhu', role: 'Principal' },
    { id: 'e818b670-e3e0-4956-b681-e1a42e8bd85c', name: 'Matt Smith', role: 'Head of Commercial Partnerships' },
    { id: '00000000-0000-0000-0000-000000000000', name: 'Kiko', role: 'AI Assistant' },
  ]
  const [mentionQuery, setMentionQuery] = useState('')
  const [showMentions, setShowMentions] = useState(false)
  const [mentionIdx, setMentionIdx] = useState(0)
  const [contactCard, setContactCard] = useState(null)

  const mentionMatches = TEAM_MEMBERS.filter(m => m.name.toLowerCase().includes(mentionQuery.toLowerCase()))

  const handleInputChangeWithMention = (e) => {
    const val = e.target.value; setInput(val)
    // Detect @ trigger
    const cursorPos = e.target.selectionStart
    const textBefore = val.slice(0, cursorPos)
    const atIdx = textBefore.lastIndexOf('@')
    if (atIdx >= 0 && (atIdx === 0 || textBefore[atIdx - 1] === ' ')) {
      const query = textBefore.slice(atIdx + 1)
      if (!query.includes(' ') && query.length < 20) { setMentionQuery(query); setShowMentions(true); setMentionIdx(0); return }
    }
    setShowMentions(false)
    // Typing broadcast
    if (activeChannel && !typingTimeoutRef.current) { supabase.channel(`typing-${activeChannel}`).send({ type: 'broadcast', event: 'typing', payload: { userId, name: userName } }).catch(() => {}); typingTimeoutRef.current = setTimeout(() => { typingTimeoutRef.current = null }, 2000) }
  }

  const insertMention = (member) => {
    const cursorPos = inputRef.current?.selectionStart || input.length
    const textBefore = input.slice(0, cursorPos)
    const atIdx = textBefore.lastIndexOf('@')
    const newInput = input.slice(0, atIdx) + `@${member.name} ` + input.slice(cursorPos)
    setInput(newInput); setShowMentions(false)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  const handleMentionKeyDown = (e) => {
    if (showMentions && mentionMatches.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIdx(i => Math.min(i + 1, mentionMatches.length - 1)) }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setMentionIdx(i => Math.max(i - 1, 0)) }
      else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); insertMention(mentionMatches[mentionIdx]); return }
      else if (e.key === 'Escape') { setShowMentions(false); return }
    }
    if (e.key === 'Enter' && !e.shiftKey && !showMentions) { e.preventDefault(); sendMessage() }
  }

  const handleInputChange = (e) => { setInput(e.target.value); if (activeChannel && !typingTimeoutRef.current) { supabase.channel(`typing-${activeChannel}`).send({ type: 'broadcast', event: 'typing', payload: { userId, name: userName } }).catch(() => {}); typingTimeoutRef.current = setTimeout(() => { typingTimeoutRef.current = null }, 2000) } }
  const handleKeyDown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }

  // File staging: add files to compose area before sending
  const stageFiles = (files) => {
    const newFiles = Array.from(files).slice(0, MAX_FILES - stagedFiles.length).filter(f => {
      if (f.size > MAX_FILE_SIZE) { alert(`${f.name} exceeds 50MB limit`); return false }
      return true
    }).map(f => ({ file: f, preview: f.type.startsWith('image/') ? URL.createObjectURL(f) : null, id: Date.now() + '-' + f.name }))
    setStagedFiles(prev => [...prev, ...newFiles].slice(0, MAX_FILES))
  }
  const removeStagedFile = (id) => { setStagedFiles(prev => { const f = prev.find(s => s.id === id); if (f?.preview) URL.revokeObjectURL(f.preview); return prev.filter(s => s.id !== id) }) }

  const handleFileInput = (e) => { if (e.target.files?.length) stageFiles(e.target.files); e.target.value = '' }
  const handleDrop = (e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files?.length) stageFiles(e.dataTransfer.files) }
  const handleDragOver = (e) => { e.preventDefault(); setDragOver(true) }
  const handleDragLeave = (e) => { if (e.currentTarget.contains(e.relatedTarget)) return; setDragOver(false) }
  const handlePaste = (e) => { const items = e.clipboardData?.items; if (!items) return; for (const item of items) { if (item.type.startsWith('image/')) { e.preventDefault(); const f = item.getAsFile(); if (f) stageFiles([f]); return } } }

  const activeChannelData = channels.find(c => c.id === activeChannel)
  const getChannelDisplayName = (ch) => ch?.name || 'Direct Message'
  const getPresenceStatus = (ch) => { if (!ch || ch.channel_type === 'group') return null; const other = ch.members?.find(m => m !== userId); return presence[other]?.status || 'offline' }

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontFamily: C.font, color: C.muted }}>Loading...</div>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 52px)', fontFamily: C.font, color: C.text, overflow: 'hidden' }}>
      {/* Breadcrumb + Title bar — matches Pipeline, Command Centre, etc. */}
      <div style={{ padding: '16px 24px 12px', borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 500, letterSpacing: '1.1px', textTransform: 'uppercase', color: C.sub, marginBottom: 6 }}>
          <span style={{ fontWeight: 600, color: C.text }}>Today</span>
          <span style={{ margin: '0 6px', color: C.muted }}>/</span>
          <span>Messages</span>
        </div>
        <h1 style={{ fontSize: 36, fontWeight: 300, fontFamily: "'Source Serif 4', Georgia, serif", letterSpacing: '-0.018em', margin: 0, color: C.text }}>Messages</h1>
      </div>

      {/* Main layout: sidebar + chat */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
      {/* Contact Card Popup */}
      {contactCard && (
        <div onClick={() => setContactCard(null)} style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: C.bg, borderRadius: 16, padding: 24, boxShadow: '0 8px 32px rgba(0,0,0,0.15)', width: 280, textAlign: 'center' }}>
            <Avatar name={contactCard.name} size={56} color={contactCard.name === 'Kiko' ? C.purple : undefined} status={presence[contactCard.id]?.status} />
            <div style={{ fontSize: 16, fontWeight: 700, marginTop: 12 }}>{contactCard.name}</div>
            <div style={{ fontSize: 12, color: C.sub, marginTop: 2 }}>{contactCard.role}</div>
            <div style={{ fontSize: 11, color: STATUS_COLORS[presence[contactCard.id]?.status] || '#9CA3AF', marginTop: 6, fontWeight: 500 }}>
              {presence[contactCard.id]?.status === 'online' ? '🟢 Online' : presence[contactCard.id]?.status === 'away' ? '🟡 Away' : presence[contactCard.id]?.status === 'busy' ? '🔴 Do Not Disturb' : '⚫ Offline'}
            </div>
            {presence[contactCard.id]?.status_message && <div style={{ fontSize: 11, color: C.muted, marginTop: 4, fontStyle: 'italic' }}>{presence[contactCard.id].status_message}</div>}
            <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'center' }}>
              <button onClick={() => setContactCard(null)} style={{ padding: '6px 16px', borderRadius: 8, background: C.accent, border: 'none', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: C.font }}>Message</button>
              <button style={{ padding: '6px 16px', borderRadius: 8, background: 'rgba(22,163,74,0.06)', border: '1px solid rgba(22,163,74,0.12)', color: C.green, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: C.font }}><Icon name="phone" size={14} color="#fff" /> Call</button>
            </div>
          </div>
        </div>
      )}
      {/* Channel List */}
      <div style={{ width: 280, borderRight: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', flexShrink: 0, background: C.surface }}>
        <div style={{ padding: '12px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 10, background: C.bg, border: `1px solid ${C.border}` }}>
            <span style={{ color: C.muted }}><Icon name="search" size={14} color={C.muted} /></span>
            <input placeholder="Search conversations..." style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontSize: 12, color: C.text, fontFamily: C.font }} />
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px' }}>
          {/* Section: Direct Messages */}
          <div style={{ padding: '8px 8px 4px', fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Direct Messages</div>
          {channels.filter(ch => ch.channel_type === 'dm').map(ch => {
            const isActive = ch.id === activeChannel; const st = getPresenceStatus(ch)
            return (
              <div key={ch.id} onClick={() => setActiveChannel(ch.id)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 10px', borderRadius: 10, cursor: 'pointer', marginBottom: 1, background: isActive ? C.accentSoft : 'transparent', transition: 'background 100ms' }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'rgba(0,0,0,0.03)' }} onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}>
                <Avatar name={getChannelDisplayName(ch)} size={36} status={st} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 13, fontWeight: ch.unreadCount ? 600 : 500 }}>{getChannelDisplayName(ch)}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      {mutedChannels.includes(ch.id) && <span style={{ color: C.muted }}><Icon name="muted" size={12} color={C.muted} /></span>}
                      {ch.lastMessage && <span style={{ fontSize: 10, color: C.muted }}>{new Date(ch.lastMessage.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>}
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: C.sub, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ch.lastMessage ? `${ch.lastMessage.from_name}: ${ch.lastMessage.content?.slice(0, 40)}` : 'No messages yet'}</div>
                </div>
                {ch.unreadCount > 0 && <div style={{ minWidth: 18, height: 18, borderRadius: 9, background: C.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#fff', padding: '0 5px', flexShrink: 0 }}>{ch.unreadCount}</div>}
              </div>
            )
          })}
          {/* Section: Channels */}
          <div style={{ padding: '12px 8px 4px', fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Channels</div>
          {channels.filter(ch => ch.channel_type === 'group').map(ch => {
            const isActive = ch.id === activeChannel
            return (
              <div key={ch.id} onClick={() => setActiveChannel(ch.id)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 10px', borderRadius: 10, cursor: 'pointer', marginBottom: 1, background: isActive ? C.accentSoft : 'transparent', transition: 'background 100ms' }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'rgba(0,0,0,0.03)' }} onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(124,58,237,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 600, color: C.purple, flexShrink: 0 }}>#</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 13, fontWeight: ch.unreadCount ? 600 : 500 }}>{getChannelDisplayName(ch)}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      {mutedChannels.includes(ch.id) && <span style={{ color: C.muted }}><Icon name="muted" size={12} color={C.muted} /></span>}
                      {ch.lastMessage && <span style={{ fontSize: 10, color: C.muted }}>{new Date(ch.lastMessage.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>}
                    </div>
                  </div>
                  <div style={{ fontSize: 11, color: C.sub, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ch.lastMessage ? `${ch.lastMessage.from_name}: ${ch.lastMessage.content?.slice(0, 40)}` : 'Start a conversation'}</div>
                </div>
                {ch.unreadCount > 0 && <div style={{ minWidth: 18, height: 18, borderRadius: 9, background: C.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#fff', padding: '0 5px', flexShrink: 0 }}>{ch.unreadCount}</div>}
              </div>
            )
          })}
        </div>
      </div>

      {/* Chat Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' }} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
        {/* Teams-style drag overlay — full translucent with centered icon */}
        {dragOver && (
          <div style={{ position: 'absolute', inset: 0, zIndex: 50, background: 'rgba(232,112,10,0.04)', backdropFilter: 'blur(2px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, pointerEvents: 'none' }}>
            <div style={{ width: 64, height: 64, borderRadius: 16, background: C.accentSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>📁</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: C.accent }}>Drop files to share</div>
            <div style={{ fontSize: 12, color: C.sub }}>Up to {MAX_FILES} files, max 50MB each</div>
          </div>
        )}

        {/* Header */}
        {activeChannelData && (
          <div style={{ padding: '10px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {activeChannelData.channel_type === 'group' ? <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(124,58,237,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>👥</div> : <Avatar name={getChannelDisplayName(activeChannelData)} size={32} status={getPresenceStatus(activeChannelData)} />}
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{getChannelDisplayName(activeChannelData)}</div>
                {(() => { const st = getPresenceStatus(activeChannelData); if (!st) return <div style={{ fontSize: 11, color: C.muted }}>{activeChannelData.members?.length || 0} members</div>; return <div style={{ fontSize: 11, color: STATUS_COLORS[st], display: 'flex', alignItems: 'center', gap: 4, fontWeight: 500 }}><div style={{ width: 5, height: 5, borderRadius: '50%', background: STATUS_COLORS[st] }} />{st === 'online' ? 'Online' : st === 'away' ? 'Away' : st === 'busy' ? 'Do Not Disturb' : 'Offline'}</div> })()}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => {
                const otherMember = activeChannelData.members?.find(m => m !== userId)
                const member = TEAM_MEMBERS.find(m => m.id === otherMember)
                const otherPresence = presence[otherMember]?.status
                if (!otherPresence || otherPresence === 'offline') {
                  setOfflineCallConfirm({ recipientId: otherMember, recipientName: member?.name || getChannelDisplayName(activeChannelData) }); return
                }
                voice.startCall(otherMember, member?.name || getChannelDisplayName(activeChannelData))
              }} style={{ height: 32, padding: '0 14px', borderRadius: 8, background: C.green, border: 'none', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontFamily: C.font }}><Icon name="phone" size={14} color="#fff" /> Call</button>
              <button onClick={() => setShowFilesPanel(!showFilesPanel)} style={{ height: 32, padding: '0 10px', borderRadius: 8, background: showFilesPanel ? C.accentSoft : C.card, border: `1px solid ${showFilesPanel ? C.accent : C.border}`, color: showFilesPanel ? C.accent : C.sub, fontSize: 12, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontFamily: C.font }}><Icon name="folder" size={14} /> Files</button>
              <button onClick={() => setSearchOpen(!searchOpen)} style={{ height: 32, padding: '0 10px', borderRadius: 8, background: searchOpen ? C.accentSoft : C.card, border: `1px solid ${searchOpen ? C.accent : C.border}`, color: searchOpen ? C.accent : C.sub, fontSize: 12, fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontFamily: C.font }}><Icon name="search" size={14} /></button>
              <button onClick={() => { setShowChannelSettings(true); setChannelRename(getChannelDisplayName(activeChannelData)) }} style={{ height: 32, width: 32, borderRadius: 8, background: C.card, border: `1px solid ${C.border}`, color: C.sub, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="settings" size={14} /></button>
            </div>
          </div>
        )}

        {/* Search bar */}
        {searchOpen && (
          <div style={{ padding: '8px 20px', borderBottom: `1px solid ${C.borderLight}`, background: C.surface }}>
            <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search messages..." autoFocus
              style={{ width: '100%', padding: '8px 12px', borderRadius: 10, border: `1px solid ${C.border}`, background: C.bg, fontSize: 13, fontFamily: C.font, color: C.text, outline: 'none' }} />
          </div>
        )}

        {/* Remote audio (hidden) */}
        <audio ref={voice.remoteAudioRef} autoPlay style={{ display: 'none' }} />

        {/* Call error toast */}
        {voice.callError && (
          <div style={{ position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)', zIndex: 70, background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 12, padding: '12px 20px', maxWidth: 440, boxShadow: '0 4px 16px rgba(0,0,0,0.1)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <Icon name="phone" size={18} color={C.red} />
            <div style={{ fontSize: 13, color: '#991B1B' }}>{voice.callError}</div>
          </div>
        )}

        {/* Incoming call overlay */}
        {voice.callState === 'ringing' && (
          <div style={{ position: 'absolute', inset: 0, zIndex: 60, background: 'rgba(255,255,255,0.97)', backdropFilter: 'blur(16px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20 }}>
            <div style={{ width: 72, height: 72, borderRadius: '50%', background: `linear-gradient(135deg, ${C.green}, #059669)`, display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'callPulse 2s ease-in-out infinite', boxShadow: `0 8px 32px rgba(22,163,74,0.2)` }}>
              <Icon name="phone" size={28} color="#fff" />
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 600 }}>{voice.remoteName}</div>
              <div style={{ fontSize: 13, color: C.green, fontWeight: 500, marginTop: 4 }}>Incoming call...</div>
            </div>
            <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
              <button onClick={() => voice.answerCall(window.__incomingOffer, window.__incomingCallerName, window.__incomingCallId)} style={{ width: 56, height: 56, borderRadius: '50%', background: C.green, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 4px 16px rgba(22,163,74,0.3)` }}>
                <Icon name="phone" size={22} color="#fff" />
              </button>
              <button onClick={() => voice.declineCall()} style={{ width: 56, height: 56, borderRadius: '50%', background: C.red, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 4px 16px rgba(220,38,38,0.3)` }}>
                <Icon name="x" size={22} color="#fff" />
              </button>
            </div>
          </div>
        )}

        {/* Active call overlay (calling or connected) */}
        {(voice.callState === 'calling' || voice.callState === 'connected' || voice.callState === 'ended') && (
          <div style={{ position: 'absolute', inset: 0, zIndex: 60, background: 'rgba(255,255,255,0.97)', backdropFilter: 'blur(16px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20 }}>
            <style>{`@keyframes callPulse { 0%,100%{transform:scale(1);box-shadow:0 0 0 0 rgba(22,163,74,0.2)} 50%{transform:scale(1.04);box-shadow:0 0 0 12px rgba(22,163,74,0)} }`}</style>
            <div style={{ width: 72, height: 72, borderRadius: '50%', background: voice.callState === 'ended' ? (voice.callEndReason === 'missed' ? C.card : `linear-gradient(135deg, ${C.green}, #059669)`) : voice.callState === 'connected' ? `linear-gradient(135deg, ${C.green}, #059669)` : C.card, display: 'flex', alignItems: 'center', justifyContent: 'center', animation: voice.callState === 'calling' ? 'callPulse 2s ease-in-out infinite' : 'none' }}>
              <Icon name="phone" size={28} color={voice.callState === 'connected' ? '#fff' : C.sub} />
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 600 }}>{voice.remoteName}</div>
              <div style={{ fontSize: 13, color: voice.callState === 'connected' ? C.green : C.muted, fontWeight: 500, marginTop: 4 }}>
                {voice.callState === 'ended' ? (voice.callEndReason === 'missed' ? 'No answer' : `Call ended${voice.callDuration > 0 ? ' \u00B7 ' + String(Math.floor(voice.callDuration / 60)).padStart(2, '0') + ':' + String(voice.callDuration % 60).padStart(2, '0') : ''}`) : voice.callState === 'calling' ? 'Calling...' : `${String(Math.floor(voice.callDuration / 60)).padStart(2, '0')}:${String(voice.callDuration % 60).padStart(2, '0')}`}
              </div>
            </div>
            {voice.callState !== 'ended' && <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
              <button onClick={() => voice.toggleMute()} style={{ width: 48, height: 48, borderRadius: 14, background: voice.isMuted ? C.accentSoft : C.card, border: `1px solid ${voice.isMuted ? C.accent : C.border}`, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
                <Icon name={voice.isMuted ? 'muted' : 'phone'} size={18} color={voice.isMuted ? C.accent : C.sub} />
                <span style={{ fontSize: 9, color: C.sub }}>{voice.isMuted ? 'Unmute' : 'Mute'}</span>
              </button>
              <button onClick={() => voice.endCall()} style={{ width: 48, height: 48, borderRadius: 14, background: C.red, border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, boxShadow: `0 4px 12px rgba(220,38,38,0.2)` }}>
                <Icon name="phone" size={18} color="#fff" />
                <span style={{ fontSize: 9, color: '#fff' }}>End</span>
              </button>
            </div>}
          </div>
        )}

        {/* Messages area */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {filteredMessages.length === 0 && <div style={{ textAlign: 'center', padding: '40px 0', color: C.muted, fontSize: 13 }}>{searchQuery ? 'No messages match your search.' : 'No messages yet. Start the conversation!'}</div>}
          {/* Date separator */}
          {filteredMessages.length > 0 && (
            <div style={{ textAlign: 'center', padding: '4px 0 12px' }}>
              <span style={{ fontSize: 11, color: C.muted, background: C.card, padding: '4px 14px', borderRadius: 20, fontWeight: 500 }}>Today</span>
            </div>
          )}
          {filteredMessages.map((msg, i) => {
            const isMine = msg.from_user_id === userId
            const showAvatar = i === 0 || messages[i - 1].from_user_id !== msg.from_user_id
            const isBot = msg.message_type === 'kiko_response'
            const isDeleted = !!msg.deleted_at
            const reactions = msg.reactions || {}
            const replyMsg = msg.reply_to ? messages.find(m => m.id === msg.reply_to) : null
            const isLastFromMe = isMine && (i === messages.length - 1 || messages[i + 1]?.from_user_id !== userId)
            const allRead = isMine && msg.read_by && msg.read_by.length > 1
            const isFile = msg.content?.includes('📎 [')

            return (
              <div key={msg.id} style={{ display: 'flex', flexDirection: isMine ? 'row-reverse' : 'row', alignItems: 'flex-end', gap: 8, marginTop: showAvatar ? 14 : 1 }}
                onMouseEnter={() => setHoveredMsg(msg.id)} onMouseLeave={() => { setHoveredMsg(null); setShowReactions(null) }}>
                <div style={{ width: 26, flexShrink: 0, cursor: showAvatar && !isMine ? 'pointer' : 'default' }} onClick={() => { if (showAvatar && !isMine) { const member = TEAM_MEMBERS.find(m => m.name === msg.from_name); if (member) setContactCard(member) } }}>
                  {showAvatar && !isMine && <Avatar name={msg.from_name} size={26} color={isBot ? C.purple : undefined} status={presence[msg.from_user_id]?.status} />}</div>
                <div style={{ maxWidth: '52%', position: 'relative' }}>
                  {showAvatar && !isMine && <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 3, marginLeft: 2, color: isBot ? C.purple : C.sub }}>{msg.from_name}{isBot && <span style={{ background: 'rgba(124,58,237,0.12)', color: C.purple, padding: '1px 6px', borderRadius: 4, fontSize: 9, marginLeft: 5 }}>AI</span>}</div>}
                  {msg.pinned && <div style={{ fontSize: 10, color: C.accent, marginBottom: 3, display: 'flex', alignItems: 'center', gap: 3 }}><Icon name="pin" size={12} color={C.accent} /> Pinned</div>}
                  {replyMsg && <div style={{ fontSize: 11, color: C.muted, padding: '4px 8px', borderLeft: `2px solid ${C.accent}`, marginBottom: 4, borderRadius: '0 4px 4px 0', background: 'rgba(0,0,0,0.02)' }}><span style={{ fontWeight: 600 }}>{replyMsg.from_name}:</span> {replyMsg.content?.slice(0, 60)}</div>}
                  <div style={{ padding: isFile ? '4px' : '9px 14px', borderRadius: isMine ? '14px 14px 4px 14px' : '14px 14px 14px 4px', background: isDeleted ? 'rgba(0,0,0,0.02)' : isMine ? C.accent : isBot ? 'rgba(124,58,237,0.07)' : C.card, border: isDeleted ? `1px solid ${C.borderLight}` : isMine ? 'none' : isBot ? '1px solid rgba(124,58,237,0.12)' : `1px solid ${C.borderLight}`, fontSize: 13, lineHeight: 1.6, color: isDeleted ? C.muted : isMine ? '#fff' : C.text, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontStyle: isDeleted ? 'italic' : 'normal', overflow: 'hidden' }}>
                    {isDeleted ? 'This message was deleted' : isFile ? <FileCard content={msg.content} isMine={isMine} /> :
                      editingMsg === msg.id ? (
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                          <input value={editText} onChange={e => setEditText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') handleEdit(msg.id); if (e.key === 'Escape') { setEditingMsg(null); setEditText('') } }} autoFocus
                            style={{ flex: 1, background: 'rgba(255,255,255,0.2)', border: 'none', outline: 'none', color: isMine ? '#fff' : C.text, fontSize: 13, fontFamily: C.font, padding: '2px 4px', borderRadius: 4 }} />
                          <button onClick={() => handleEdit(msg.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: isMine ? '#fff' : C.green }}><Icon name="check" size={12} /></button>
                          <button onClick={() => { setEditingMsg(null); setEditText('') }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: isMine ? 'rgba(255,255,255,0.6)' : C.muted }}><Icon name="x" size={12} /></button>
                        </div>
                      ) : (
                        <ReactMarkdown remarkPlugins={[remarkGfm]} components={{
                          p: ({children}) => <span>{children}</span>,
                          a: ({href, children}) => <a href={href} target="_blank" rel="noopener" style={{ color: isMine ? '#fff' : C.accent, textDecoration: 'underline' }}>{children}</a>,
                          code: ({children}) => <code style={{ background: isMine ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.05)', padding: '1px 4px', borderRadius: 3, fontSize: 12 }}>{children}</code>,
                          strong: ({children}) => <strong style={{ fontWeight: 700 }}>{children}</strong>,
                        }}>{msg.content}</ReactMarkdown>
                      )}
                  </div>
                  {msg.edited_at && !isDeleted && <span style={{ fontSize: 9, color: C.muted, marginLeft: 4 }}>(edited)</span>}
                  {/* Link preview for URLs in messages */}
                  {!isDeleted && !isFile && (() => { const urlMatch = msg.content?.match(/(https?:\/\/[^\s]+)/); return urlMatch ? <LinkPreview url={urlMatch[1]} isMine={isMine} /> : null })()}
                  {Object.keys(reactions).length > 0 && <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>{Object.entries(reactions).map(([emoji, users]) => <button key={emoji} onClick={() => handleReact(msg.id, emoji)} style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '2px 6px', borderRadius: 10, fontSize: 12, cursor: 'pointer', background: users.includes(userId) ? C.accentSoft : 'rgba(0,0,0,0.03)', border: `1px solid ${users.includes(userId) ? C.accent : C.borderLight}` }}>{emoji} <span style={{ fontSize: 10, color: C.sub }}>{users.length}</span></button>)}</div>}
                  <div style={{ fontSize: 10, color: C.muted, marginTop: 3, textAlign: isMine ? 'right' : 'left', display: 'flex', alignItems: 'center', gap: 4, justifyContent: isMine ? 'flex-end' : 'flex-start' }}>
                    {new Date(msg.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                    {isLastFromMe && allRead && <span style={{ color: C.green, fontSize: 9 }}>✓✓ Seen</span>}
                    {isLastFromMe && !allRead && !msg.id?.toString().startsWith('temp-') && <span style={{ fontSize: 9 }}><Icon name="check" size={12} /></span>}
                  </div>
                  {hoveredMsg === msg.id && !isDeleted && (
                    <div style={{ position: 'absolute', top: -4, [isMine ? 'left' : 'right']: 0, display: 'flex', gap: 2, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: '2px 4px', boxShadow: '0 2px 8px rgba(0,0,0,0.08)', zIndex: 10 }}>
                      <button onClick={() => setShowReactions(showReactions === msg.id ? null : msg.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, padding: '2px 4px' }} title="React"><Icon name="smile" size={14} /></button>
                      <button onClick={() => { setReplyTo(msg); inputRef.current?.focus() }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, padding: '2px 4px' }} title="Reply"><Icon name="reply" size={14} /></button>
                      {isMine && <button onClick={() => { setEditingMsg(msg.id); setEditText(msg.content) }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, padding: '2px 4px' }} title="Edit"><Icon name="edit" size={14} /></button>}
                      {isMine && <button onClick={() => handleDelete(msg.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, padding: '2px 4px' }} title="Delete"><Icon name="trash" size={14} /></button>}
                      <button onClick={async () => { await fetch(`${API}/api/team-messages?action=pin`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messageId: msg.id, pinned: !msg.pinned }) }); loadMessages() }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, padding: '2px 4px' }} title={msg.pinned ? 'Unpin' : 'Pin'}>📌</button>
                    </div>
                  )}
                  {showReactions === msg.id && <div style={{ position: 'absolute', top: -32, [isMine ? 'left' : 'right']: 0, zIndex: 20, display: 'flex', gap: 2, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 20, padding: '4px 6px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>{EMOJIS.map(e => <button key={e} onClick={() => { handleReact(msg.id, e); setShowReactions(null) }} style={{ background: 'none', border: 'none', fontSize: 16, cursor: 'pointer', padding: '2px 4px', borderRadius: 6 }}>{e}</button>)}</div>}
                </div>
              </div>
            )
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Typing indicator */}
        {typingUsers.length > 0 && <div style={{ padding: '2px 24px', fontSize: 11, color: C.muted, fontStyle: 'italic' }}>{typingUsers.map(u => u.name).join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing...</div>}

        {/* Reply bar */}
        {replyTo && (
          <div style={{ padding: '6px 24px', paddingRight: 90, display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(232,112,10,0.04)', borderTop: `1px solid ${C.borderLight}` }}>
            <div style={{ flex: 1, fontSize: 12, color: C.sub, borderLeft: `2px solid ${C.accent}`, paddingLeft: 8 }}>Replying to <strong>{replyTo.from_name}</strong>: {replyTo.content?.slice(0, 60)}</div>
            <button onClick={() => setReplyTo(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, fontSize: 14 }}><Icon name="x" size={12} /></button>
          </div>
        )}

        {/* Staged files preview — Teams-style compose area */}
        {stagedFiles.length > 0 && (
          <div style={{ padding: '8px 24px 0', display: 'flex', gap: 8, flexWrap: 'wrap', borderTop: `1px solid ${C.borderLight}` }}>
            {stagedFiles.map(sf => (
              <div key={sf.id} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 10, background: C.card, border: `1px solid ${C.border}`, maxWidth: 220 }}>
                {sf.preview ? (
                  <img src={sf.preview} alt="" style={{ width: 36, height: 36, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} />
                ) : (
                  <span style={{ fontSize: 22, flexShrink: 0 }}>{getFileIcon(sf.file.name)}</span>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sf.file.name}</div>
                  <div style={{ fontSize: 10, color: C.muted }}>{formatFileSize(sf.file.size)}</div>
                </div>
                {uploadProgress[sf.file.name] > 0 && uploadProgress[sf.file.name] < 100 && (
                  <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, background: C.borderLight, borderRadius: '0 0 10px 10px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', background: C.accent, width: `${uploadProgress[sf.file.name]}%`, transition: 'width 200ms' }} />
                  </div>
                )}
                <button onClick={() => removeStagedFile(sf.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, fontSize: 12, padding: 0, flexShrink: 0 }}><Icon name="x" size={12} /></button>
              </div>
            ))}
          </div>
        )}

        {/* Input area — right padding avoids KikoFloat overlap */}
        <div style={{ padding: '10px 24px 16px', paddingRight: 90 }}>
          <input ref={fileInputRef} type="file" accept="*/*" multiple onChange={handleFileInput} style={{ display: 'none' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 4px 4px 6px', borderRadius: 14, border: `1.5px solid ${C.border}`, background: C.bg, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', position: 'relative' }}>
            {/* @mention dropdown */}
            {showMentions && mentionMatches.length > 0 && (
              <div style={{ position: 'absolute', bottom: '100%', left: 6, marginBottom: 4, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 12, boxShadow: '0 4px 16px rgba(0,0,0,0.1)', overflow: 'hidden', minWidth: 200, zIndex: 20 }}>
                {mentionMatches.map((m, idx) => (
                  <div key={m.id} onClick={() => insertMention(m)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', cursor: 'pointer', background: idx === mentionIdx ? C.accentSoft : 'transparent', borderBottom: idx < mentionMatches.length - 1 ? `1px solid ${C.borderLight}` : 'none' }}>
                    <Avatar name={m.name} size={24} color={m.name === 'Kiko' ? C.purple : undefined} />
                    <div><div style={{ fontSize: 12, fontWeight: 600 }}>{m.name}</div><div style={{ fontSize: 10, color: C.muted }}>{m.role}</div></div>
                  </div>
                ))}
              </div>
            )}
            <button onClick={() => fileInputRef.current?.click()} style={{ width: 32, height: 32, borderRadius: 9999, background: C.card, border: `1px solid ${C.border}`, color: C.sub, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: C.sub }}><Icon name="plus" size={14} color={C.sub} /></button>
            <input ref={inputRef} value={input} onChange={handleInputChangeWithMention} onKeyDown={handleMentionKeyDown} onPaste={handlePaste}
              placeholder={stagedFiles.length ? `Add a message to ${stagedFiles.length} file${stagedFiles.length > 1 ? 's' : ''}...` : 'Type a message... @ to mention'}
              style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: C.text, fontSize: 13, fontFamily: C.font, padding: '6px 4px' }} />
            <button onClick={sendMessage} disabled={(!input.trim() && stagedFiles.length === 0) || sending} style={{
              width: 30, height: 30, borderRadius: 9999, background: (input.trim() || stagedFiles.length) ? C.accent : 'rgba(0,0,0,0.04)',
              border: `1px solid ${(input.trim() || stagedFiles.length) ? C.accent : C.border}`, cursor: (input.trim() || stagedFiles.length) ? 'pointer' : 'default',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 200ms ease',
            }}>
              <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke={(input.trim() || stagedFiles.length) ? '#fff' : C.muted} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
            </button>
          </div>
        </div>
      </div>

      {/* Shared Files Panel — slides in from right */}
      {showFilesPanel && (
        <div style={{ width: 280, borderLeft: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', flexShrink: 0, background: C.bg }}>
          <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, margin: 0 }}>Shared Files</h3>
            <button onClick={() => setShowFilesPanel(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, fontSize: 14 }}><Icon name="x" size={12} /></button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: 8 }}>
            {messages.filter(m => m.content?.includes('📎 [')).length === 0 && (
              <div style={{ textAlign: 'center', padding: '24px 0', color: C.muted, fontSize: 12 }}>No files shared yet</div>
            )}
            {messages.filter(m => m.content?.includes('📎 [')).map(m => {
              const imgMatch = m.content?.match(/📎 \[Image: ([^\]]+)\]\((https?:\/\/[^)]+)\)/)
              const fileMatch = m.content?.match(/📎 \[File: ([^\|^\]]+)\|?([^\]]*)\]\((https?:\/\/[^)]+)\)/)
              const name = imgMatch?.[1] || fileMatch?.[1] || 'File'
              const url = imgMatch?.[2] || fileMatch?.[3] || '#'
              const size = fileMatch?.[2] || ''
              const isImg = !!imgMatch
              return (
                <a key={m.id} href={url} target="_blank" rel="noopener" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 10, textDecoration: 'none', marginBottom: 2, background: 'rgba(0,0,0,0.02)', border: `1px solid ${C.borderLight}` }}>
                  {isImg ? <img src={url} alt="" style={{ width: 36, height: 36, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} /> : <span style={{ fontSize: 22 }}>{getFileIcon(name)}</span>}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</div>
                    <div style={{ fontSize: 10, color: C.muted }}>{m.from_name} · {new Date(m.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}{size ? ` · ${size}` : ''}</div>
                  </div>
                  <span style={{ fontSize: 12, color: C.muted }}>↓</span>
                </a>
              )
            })}
          </div>
        </div>
      )}

      {/* Channel Settings Modal */}
      {/* Offline call confirm modal */}
      {offlineCallConfirm && (
        <div onClick={() => setOfflineCallConfirm(null)} style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: C.bg, borderRadius: 16, padding: 24, boxShadow: '0 8px 32px rgba(0,0,0,0.15)', width: 320, textAlign: 'center' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: C.card, margin: '0 auto 12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="phone" size={24} color={C.sub} /></div>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>{offlineCallConfirm.recipientName}</div>
            <div style={{ fontSize: 13, color: C.muted, marginBottom: 20 }}>is currently offline. Do you still want to call?</div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button onClick={() => setOfflineCallConfirm(null)} style={{ padding: '8px 20px', borderRadius: 10, background: C.card, border: 'none', color: C.text, fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: C.font }}>Cancel</button>
              <button onClick={() => { voice.startCall(offlineCallConfirm.recipientId, offlineCallConfirm.recipientName); setOfflineCallConfirm(null) }} style={{ padding: '8px 20px', borderRadius: 10, background: C.green, border: 'none', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: C.font }}>Call anyway</button>
            </div>
          </div>
        </div>
      )}
      {showChannelSettings && activeChannelData && (
        <div onClick={() => setShowChannelSettings(false)} style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: C.bg, borderRadius: 16, padding: 24, boxShadow: '0 8px 32px rgba(0,0,0,0.15)', width: 320 }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, margin: '0 0 16px' }}>Channel Settings</h3>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: C.sub, display: 'block', marginBottom: 4 }}>Channel Name</label>
              <input value={channelRename} onChange={e => setChannelRename(e.target.value)}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 10, border: `1px solid ${C.border}`, fontSize: 13, fontFamily: C.font, color: C.text, outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: C.sub, display: 'block', marginBottom: 6 }}>Members</label>
              {(activeChannelData.members || []).map((mid, idx) => {
                const member = TEAM_MEMBERS.find(m => m.id === mid)
                return member ? (
                  <div key={mid} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0' }}>
                    <Avatar name={member.name} size={24} color={member.name === 'Kiko' ? C.purple : undefined} status={presence[mid]?.status} />
                    <span style={{ fontSize: 12, flex: 1 }}>{member.name}</span>
                    <span style={{ fontSize: 10, color: C.muted }}>{member.role}</span>
                  </div>
                ) : null
              })}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => {
                const isMuted = mutedChannels.includes(activeChannel)
                const newMuted = isMuted ? mutedChannels.filter(c => c !== activeChannel) : [...mutedChannels, activeChannel]
                setMutedChannels(newMuted); localStorage.setItem('kiko_muted_channels', JSON.stringify(newMuted))
              }} style={{ padding: '6px 16px', borderRadius: 8, background: mutedChannels.includes(activeChannel) ? 'rgba(220,38,38,0.06)' : C.card, border: `1px solid ${mutedChannels.includes(activeChannel) ? C.red : C.border}`, color: mutedChannels.includes(activeChannel) ? C.red : C.text, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: C.font, marginRight: 'auto' }}>
                {mutedChannels.includes(activeChannel) ? '🔔 Unmute' : '🔇 Mute'}
              </button>
              <button onClick={() => setShowChannelSettings(false)} style={{ padding: '6px 16px', borderRadius: 8, background: C.card, border: `1px solid ${C.border}`, color: C.text, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: C.font }}>Cancel</button>
              <button onClick={async () => {
                if (channelRename && channelRename !== getChannelDisplayName(activeChannelData)) {
                  await fetch(`${API}/api/team-messages?action=rename`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channelId: activeChannel, name: channelRename }) }).catch(() => {})
                  loadChannels()
                }
                setShowChannelSettings(false)
              }} style={{ padding: '6px 16px', borderRadius: 8, background: C.accent, border: 'none', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: C.font }}>Save</button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  )
}
