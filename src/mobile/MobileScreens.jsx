import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'

const C = {
  bg: '#FEFEFC', card: '#FFFFFF', alt: '#F5F4F1',
  text: '#0A0A0A', sub: '#6B6B6B', mut: '#A0A0A0',
  line: 'rgba(0,0,0,0.07)', line2: 'rgba(0,0,0,0.05)', accent: '#0A0A0A',
  serif: "'Source Serif 4', Georgia, serif",
  sans: "'Inter', system-ui, -apple-system, sans-serif",
  shadow: '0 1px 2px rgba(0,0,0,0.04)',
}

function Loading() {
  return <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0', color: C.mut, fontFamily: C.sans, fontSize: 13 }}>Loading...</div>
}

function greetingPart() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

function relTime(ts) {
  if (!ts) return ''
  const d = new Date(ts), now = new Date()
  const diff = (now - d) / 1000
  if (diff < 60) return 'now'
  if (diff < 3600) return Math.floor(diff / 60) + 'm'
  if (diff < 86400 && d.getDate() === now.getDate()) return Math.floor(diff / 3600) + 'h'
  const y = new Date(now); y.setDate(now.getDate() - 1)
  if (d.getDate() === y.getDate() && d.getMonth() === y.getMonth()) return 'Yesterday'
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export function MobileHome({ userName = 'there' }) {
  const nav = useNavigate()
  const inputRef = useRef(null)
  const [text, setText] = useState('')
  const [unread, setUnread] = useState(0)
  useEffect(() => {
    supabase.from('kiko_team_messages').select('read_by').order('created_at', { ascending: false }).limit(60)
      .then(({ data }) => setUnread((data || []).filter(m => !m.read_by || m.read_by.length === 0).length))
  }, [])
  const hasContent = text.trim().length > 0
  const go = (msg) => {
    const t = (msg != null ? msg : text).trim()
    nav('/chat', { state: t ? { initialMessage: t } : {} })
  }
  const ibtn = { width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', color: '#0A0A0A', cursor: 'pointer', position: 'relative', WebkitTapHighlightColor: 'transparent', padding: 0 }
  const ctlBtn = { width: 32, height: 32, borderRadius: 9999, border: '1px solid rgba(0,0,0,0.08)', background: 'rgba(0,0,0,0.04)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: '0 1px 2px rgba(0,0,0,0.12)', WebkitTapHighlightColor: 'transparent', padding: 0 }
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', background: C.bg, fontFamily: C.sans, color: C.text }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px 4px', flexShrink: 0 }}>
        <span style={{ fontFamily: C.serif, fontWeight: 400, fontSize: 23, color: C.text, letterSpacing: '-0.01em' }}>Kiko</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button onClick={() => nav('/chat', { state: { openHistory: true } })} style={ibtn} aria-label="Conversation history">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v5h5"/><path d="M3.05 13A9 9 0 1 0 6 5.3L3 8"/><path d="M12 7v5l3.5 2"/></svg>
          </button>
          <button onClick={() => nav('/messages')} style={ibtn} aria-label="Messenger">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.5 8.5 0 0 1-12.3 7.6L3.5 20.5l1.4-5.2A8.5 8.5 0 1 1 21 11.5z"/></svg>
            {unread > 0 && <span style={{ position: 'absolute', top: 6, right: 6, width: 8, height: 8, borderRadius: '50%', background: '#C8553D', border: '2px solid ' + C.bg }} />}
          </button>
        </div>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 clamp(20px, 6vw, 36px)', paddingBottom: 'calc(6vh + env(safe-area-inset-bottom, 0px))' }}>
        <div style={{ fontFamily: C.serif, fontWeight: 300, fontSize: 'clamp(25px, 7vw, 32px)', lineHeight: 1.18, letterSpacing: '-0.02em', textAlign: 'center', color: C.text }}>{greetingPart()}, {userName}</div>
        <div style={{ width: '100%', maxWidth: 460, margin: '22px auto 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#FFFFFF', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 26, boxShadow: '0 2px 10px rgba(0,0,0,0.05), 0 0 0 1px rgba(0,0,0,0.02)', padding: '9px 9px 9px 14px' }}>
            <button onClick={() => inputRef.current && inputRef.current.focus()} style={ctlBtn} aria-label="Add">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0A0A0A" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </button>
            <input ref={inputRef} value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); go() } }} placeholder="Ask Kiko anything…" enterKeyHint="send" style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'none', fontFamily: C.sans, fontSize: 17, color: '#0A0A0A', padding: '2px 4px' }} />
            <button onClick={() => nav('/voice')} style={ctlBtn} aria-label="Voice">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><rect x="4" y="8" width="2" height="8" rx="1" fill="rgba(90,100,112,0.6)"/><rect x="8" y="5" width="2" height="14" rx="1" fill="rgba(90,100,112,0.8)"/><rect x="12" y="7" width="2" height="10" rx="1" fill="rgba(90,100,112,1)"/><rect x="16" y="4" width="2" height="16" rx="1" fill="rgba(90,100,112,0.8)"/><rect x="20" y="9" width="2" height="6" rx="1" fill="rgba(90,100,112,0.6)"/></svg>
            </button>
            <button onClick={() => go()} aria-label="Send" style={{ width: 38, height: 38, borderRadius: 9999, background: hasContent ? '#E8700A' : '#0A0A0A', border: 'none', color: '#FFFFFF', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: hasContent ? '0 4px 16px rgba(232,112,10,0.3)' : '0 1px 3px rgba(0,0,0,0.2)', transition: 'all 250ms cubic-bezier(0.34, 1.56, 0.64, 1)', WebkitTapHighlightColor: 'transparent', padding: 0 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export function MobileMessenger() {
  const nav = useNavigate()
  const [channels, setChannels] = useState(null)
  const [msgs, setMsgs] = useState([])
  useEffect(() => {
    supabase.from('kiko_team_channels').select('*').order('last_message_at', { ascending: false }).then(({ data }) => setChannels(data || []))
    supabase.from('kiko_team_messages').select('*').order('created_at', { ascending: false }).then(({ data }) => setMsgs(data || []))
  }, [])
  const lastByCh = useMemo(() => {
    const m = {}
    for (const msg of (msgs || [])) { if (!m[msg.channel_id]) m[msg.channel_id] = msg }
    return m
  }, [msgs])
  if (!channels) return <Loading />
  const unread = channels.filter(ch => { const l = lastByCh[ch.id]; return l && (!l.read_by || l.read_by.length === 0) }).length
  return (
    <div style={{ position: 'absolute', inset: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', background: C.bg, fontFamily: C.sans, color: C.text }}>
      <div style={{ padding: 'calc(env(safe-area-inset-top, 0px) + 12px) 18px 6px' }}>
        <button onClick={() => nav('/')} aria-label="Back" style={{ width: 38, height: 38, marginLeft: -8, marginBottom: 4, borderRadius: '50%', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.sub }}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg></button>
        <h1 style={{ fontFamily: C.serif, fontWeight: 400, fontSize: 28, margin: 0, letterSpacing: '-0.02em' }}>Messenger</h1>
        <p style={{ color: C.sub, fontSize: 13, margin: '4px 0 0' }}>{unread > 0 ? unread + '  unread  \u00b7  ' : ''}your deal team</p>
      </div>
      <div style={{ padding: '8px 14px calc(80px + env(safe-area-inset-bottom, 0px))' }}>
        {channels.length === 0 && <div style={{ textAlign: 'center', color: C.mut, fontSize: 14, padding: '48px 0' }}>No conversations yet.</div>}
        {channels.map((ch, i) => {
          const last = lastByCh[ch.id]
          const name = ch.name || 'Channel'
          const init = name.replace(/[^A-Za-z0-9 ]/g, '').split(' ').filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase() || '#'
          const isUnread = last && (!last.read_by || last.read_by.length === 0)
          const preview = last ? ((last.from_name ? last.from_name.split(' ')[0] + ': ' : '') + (last.content || '')) : 'No messages yet'
          return (
            <div key={ch.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 4px', borderTop: i === 0 ? 'none' : '1px solid ' + C.line2 }}>
              <div style={{ width: 44, height: 44, borderRadius: '50%', background: C.alt, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 500, color: C.sub, flexShrink: 0 }}>{init}</div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontSize: 15, fontWeight: isUnread ? 600 : 450, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
                  <span style={{ fontSize: 11.5, color: C.mut, flexShrink: 0 }}>{last ? relTime(last.created_at) : ''}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 2 }}>
                  <span style={{ fontSize: 13, color: isUnread ? C.text : C.sub, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{preview}</span>
                  {isUnread && <span style={{ width: 8, height: 8, borderRadius: '50%', background: C.accent, flexShrink: 0 }} />}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
