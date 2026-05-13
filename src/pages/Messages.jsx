// src/pages/Messages.jsx — Team messaging with real-time chat + voice calling
import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'

const API = 'https://api.vanhawke.agency'
const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY)

const C = {
  bg: '#FFFFFF', surface: '#FAFAFA', card: '#F5F5F5',
  border: 'rgba(0,0,0,0.06)', borderLight: 'rgba(0,0,0,0.04)',
  text: '#0A0A0A', sub: '#6B6B6B', muted: '#A0A0A0',
  accent: '#E8700A', accentSoft: 'rgba(232,112,10,0.08)',
  green: '#16A34A', red: '#DC2626',
  font: "'Inter', system-ui, -apple-system, sans-serif",
}

function Avatar({ name, size = 32, color, online }) {
  const initials = (name || '??').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  const hue = name ? name.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 360 : 0
  const bg = color || `hsl(${hue}, 55%, 50%)`
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.36, fontWeight: 600, color: '#fff', fontFamily: C.font, position: 'relative', flexShrink: 0 }}>
      {initials}
      {online && <div style={{ position: 'absolute', bottom: 0, right: 0, width: size * 0.28, height: size * 0.28, borderRadius: '50%', background: C.green, border: `2px solid ${C.bg}` }} />}
    </div>
  )
}

export default function Messages({ user }) {
  const [channels, setChannels] = useState([])
  const [activeChannel, setActiveChannel] = useState(null)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

  const userId = user?.id || '9f486437-4bf5-4111-abfe-fe19bfa76063'
  const userName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Sunny'

  // Load channels
  const loadChannels = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/team-messages?action=channels&userId=${userId}`)
      const data = await res.json()
      setChannels(data.channels || [])
      if (!activeChannel && data.channels?.length) setActiveChannel(data.channels[0].id)
    } catch (e) { console.error('[Messages] Load channels failed:', e) }
    finally { setLoading(false) }
  }, [userId, activeChannel])

  // Load messages for active channel
  const loadMessages = useCallback(async () => {
    if (!activeChannel) return
    try {
      const res = await fetch(`${API}/api/team-messages?action=messages`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId: activeChannel })
      })
      const data = await res.json()
      setMessages(data.messages || [])
      // Mark as read
      fetch(`${API}/api/team-messages?action=read`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId: activeChannel, userId })
      }).catch(() => {})
    } catch (e) { console.error('[Messages] Load messages failed:', e) }
  }, [activeChannel, userId])

  useEffect(() => { loadChannels() }, [loadChannels])
  useEffect(() => { loadMessages() }, [loadMessages])

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Supabase Realtime subscription
  useEffect(() => {
    const channel = supabase.channel('team-messages')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'kiko_team_messages' }, payload => {
        const newMsg = payload.new
        if (newMsg.channel_id === activeChannel) {
          setMessages(prev => [...prev, newMsg])
        }
        // Refresh channel list for unread counts
        loadChannels()
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [activeChannel, loadChannels])

  // Send message
  const sendMessage = async () => {
    if (!input.trim() || sending || !activeChannel) return
    setSending(true)
    const content = input.trim()
    setInput('')
    // Optimistic add
    const optimistic = { id: 'temp-' + Date.now(), channel_id: activeChannel, from_user_id: userId, from_name: userName, content, message_type: 'text', created_at: new Date().toISOString() }
    setMessages(prev => [...prev, optimistic])
    try {
      await fetch(`${API}/api/team-messages?action=send`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId: activeChannel, fromUserId: userId, fromName: userName, content })
      })
    } catch (e) { console.error('[Messages] Send failed:', e) }
    finally { setSending(false); inputRef.current?.focus() }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  const activeChannelData = channels.find(c => c.id === activeChannel)
  const getChannelDisplayName = (ch) => {
    if (ch.channel_type === 'group') return ch.name
    // For DMs, show the other person's name
    return ch.name || 'Direct Message'
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontFamily: C.font, color: C.muted }}>Loading messages...</div>
  )

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 52px)', fontFamily: C.font, color: C.text, overflow: 'hidden' }}>
      {/* ── Channel List ── */}
      <div style={{ width: 280, borderRight: `1px solid ${C.border}`, display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        <div style={{ padding: '16px 16px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-0.02em', margin: 0 }}>Messages</h2>
            <button style={{ width: 28, height: 28, borderRadius: 8, background: C.accentSoft, border: 'none', color: C.accent, fontSize: 15, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600 }}>+</button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 12, background: 'rgba(0,0,0,0.02)', border: `1px solid ${C.borderLight}` }}>
            <span style={{ fontSize: 13, color: C.muted }}>🔍</span>
            <input placeholder="Search messages..." style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontSize: 12, color: C.text, fontFamily: C.font }} />
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 8px' }}>
          {channels.map(ch => {
            const isActive = ch.id === activeChannel
            return (
              <div key={ch.id} onClick={() => setActiveChannel(ch.id)} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 10px',
                borderRadius: 12, cursor: 'pointer', marginBottom: 1,
                background: isActive ? C.accentSoft : 'transparent',
                transition: 'all 120ms ease',
              }}>
                {ch.channel_type === 'group' ? (
                  <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'rgba(124,58,237,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, flexShrink: 0 }}>👥</div>
                ) : (
                  <Avatar name={getChannelDisplayName(ch)} size={38} online={true} />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 13, fontWeight: ch.unreadCount ? 600 : 500 }}>{getChannelDisplayName(ch)}</span>
                    {ch.lastMessage && <span style={{ fontSize: 10, color: C.muted }}>{new Date(ch.lastMessage.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>}
                  </div>
                  {ch.lastMessage && (
                    <div style={{ fontSize: 12, color: C.sub, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {ch.lastMessage.from_name}: {ch.lastMessage.content.slice(0, 50)}
                    </div>
                  )}
                </div>
                {ch.unreadCount > 0 && (
                  <div style={{ minWidth: 18, height: 18, borderRadius: 9, background: C.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#fff', padding: '0 5px', flexShrink: 0 }}>
                    {ch.unreadCount}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Chat Area ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' }}>
        {/* Header */}
        {activeChannelData && (
          <div style={{ padding: '10px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {activeChannelData.channel_type === 'group' ? (
                <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(124,58,237,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>👥</div>
              ) : (
                <Avatar name={getChannelDisplayName(activeChannelData)} size={32} online={true} />
              )}
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{getChannelDisplayName(activeChannelData)}</div>
                <div style={{ fontSize: 11, color: C.green, display: 'flex', alignItems: 'center', gap: 4, fontWeight: 500 }}>
                  <div style={{ width: 5, height: 5, borderRadius: '50%', background: C.green }} /> Online
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button style={{ height: 32, padding: '0 12px', borderRadius: 8, background: 'rgba(22,163,74,0.06)', border: '1px solid rgba(22,163,74,0.12)', color: C.green, fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontFamily: C.font }}>
                📞 Call
              </button>
            </div>
          </div>
        )}

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {messages.length === 0 && (
            <div style={{ textAlign: 'center', padding: '40px 0', color: C.muted, fontSize: 13 }}>No messages yet. Start the conversation!</div>
          )}
          {messages.map((msg, i) => {
            const isMine = msg.from_user_id === userId
            const showAvatar = i === 0 || messages[i - 1].from_user_id !== msg.from_user_id
            const isBot = msg.message_type === 'kiko_response'
            return (
              <div key={msg.id} style={{
                display: 'flex', flexDirection: isMine ? 'row-reverse' : 'row',
                alignItems: 'flex-end', gap: 8, marginTop: showAvatar ? 14 : 1,
              }}>
                <div style={{ width: 26, flexShrink: 0 }}>
                  {showAvatar && !isMine && <Avatar name={msg.from_name} size={26} color={isBot ? '#7C3AED' : undefined} />}
                </div>
                <div style={{ maxWidth: '60%' }}>
                  {showAvatar && !isMine && (
                    <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 3, marginLeft: 2, color: isBot ? '#7C3AED' : C.sub }}>
                      {msg.from_name}
                      {isBot && <span style={{ background: 'rgba(124,58,237,0.08)', color: '#7C3AED', padding: '1px 6px', borderRadius: 4, fontSize: 9, marginLeft: 5 }}>AI</span>}
                    </div>
                  )}
                  <div style={{
                    padding: '9px 14px',
                    borderRadius: isMine ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                    background: isMine ? C.accent : isBot ? 'rgba(124,58,237,0.04)' : C.card,
                    border: isMine ? 'none' : isBot ? '1px solid rgba(124,58,237,0.08)' : `1px solid ${C.borderLight}`,
                    fontSize: 13, lineHeight: 1.6,
                    color: isMine ? '#FFFFFF' : C.text,
                    whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                  }}>
                    {msg.content}
                  </div>
                  <div style={{ fontSize: 10, color: C.muted, marginTop: 3, textAlign: isMine ? 'right' : 'left', paddingLeft: 2, paddingRight: 2 }}>
                    {new Date(msg.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
            )
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div style={{ padding: '10px 24px 16px' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '4px 4px 4px 6px',
            borderRadius: 16, border: `1px solid ${C.border}`, background: C.bg,
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          }}>
            <button style={{ width: 30, height: 30, borderRadius: 9999, background: 'rgba(0,0,0,0.04)', border: `1px solid ${C.border}`, color: C.text, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 13 }}>+</button>
            <input
              ref={inputRef}
              value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message..."
              style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: C.text, fontSize: 13, fontFamily: C.font, padding: '6px 4px' }}
            />
            <span style={{ fontSize: 11, color: C.muted, whiteSpace: 'nowrap', marginRight: 4 }}>@kiko for AI</span>
            <button onClick={sendMessage} disabled={!input.trim() || sending} style={{
              width: 30, height: 30, borderRadius: 9999,
              background: input.trim() ? C.accent : 'rgba(0,0,0,0.04)',
              border: `1px solid ${input.trim() ? C.accent : C.border}`,
              cursor: input.trim() ? 'pointer' : 'default',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              transition: 'all 200ms ease',
            }}>
              <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke={input.trim() ? '#fff' : C.muted} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
