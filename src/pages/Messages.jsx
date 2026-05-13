// src/pages/Messages.jsx — Team messaging with real-time chat
import { useState, useEffect, useRef, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'

const API = 'https://api.vanhawke.agency'
const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY)

const C = {
  bg: '#FFFFFF', surface: '#FAFAFA', card: '#F5F5F5',
  border: 'rgba(0,0,0,0.06)', borderLight: 'rgba(0,0,0,0.04)',
  text: '#0A0A0A', sub: '#6B6B6B', muted: '#A0A0A0',
  accent: '#E8700A', accentSoft: 'rgba(232,112,10,0.08)',
  green: '#16A34A', amber: '#F59E0B', red: '#DC2626',
  font: "'Inter', system-ui, -apple-system, sans-serif",
}

const REACTIONS = ['👍', '❤️', '😂', '😮', '🔥', '👏']

function Avatar({ name, size = 32, color, status }) {
  const initials = (name || '??').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  const hue = name ? name.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 360 : 0
  const bg = color || `hsl(${hue}, 55%, 50%)`
  const statusColor = status === 'online' ? C.green : status === 'away' ? C.amber : status === 'offline' ? C.red : null
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.36, fontWeight: 600, color: '#fff', fontFamily: C.font, position: 'relative', flexShrink: 0 }}>
      {initials}
      {statusColor && <div style={{ position: 'absolute', bottom: 0, right: 0, width: size * 0.28, height: size * 0.28, borderRadius: '50%', background: statusColor, border: `2px solid ${C.bg}` }} />}
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
  const [typingUsers, setTypingUsers] = useState([])
  const [replyTo, setReplyTo] = useState(null)
  const [hoveredMsg, setHoveredMsg] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)
  const fileInputRef = useRef(null)
  const typingTimeoutRef = useRef(null)

  const userId = user?.id || '9f486437-4bf5-4111-abfe-fe19bfa76063'
  const userName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Sunny'

  // Load channels
  const loadChannels = useCallback(async () => {
    try {
      const res = await fetch(`${API}/api/team-messages?action=channels&userId=${userId}`)
      const data = await res.json()
      setChannels(data.channels || [])
      if (!activeChannel && data.channels?.length) setActiveChannel(data.channels[0].id)
    } catch (e) { console.error('[Messages] Load channels:', e) }
    finally { setLoading(false) }
  }, [userId, activeChannel])

  // Load messages
  const loadMessages = useCallback(async () => {
    if (!activeChannel) return
    try {
      const res = await fetch(`${API}/api/team-messages?action=messages`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId: activeChannel })
      })
      const data = await res.json()
      setMessages(data.messages || [])
      fetch(`${API}/api/team-messages?action=read`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId: activeChannel, userId })
      }).catch(() => {})
    } catch (e) { console.error('[Messages] Load messages:', e) }
  }, [activeChannel, userId])

  useEffect(() => { loadChannels() }, [loadChannels])
  useEffect(() => { loadMessages() }, [loadMessages])
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  // Notification permission
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission()
  }, [])

  // Realtime subscription
  useEffect(() => {
    const channel = supabase.channel('team-messages')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'kiko_team_messages' }, payload => {
        if (payload.eventType === 'INSERT') {
          const m = payload.new
          if (m.channel_id === activeChannel) {
            setMessages(prev => {
              if (prev.some(x => x.id === m.id)) return prev
              return [...prev.filter(x => !(x.id?.toString().startsWith('temp-') && x.content === m.content && x.from_user_id === m.from_user_id)), m]
            })
          }
          if (m.from_user_id !== userId && 'Notification' in window && Notification.permission === 'granted') {
            new Notification(`${m.from_name}`, { body: m.content.slice(0, 80), tag: m.id })
          }
        } else if (payload.eventType === 'UPDATE' && payload.new.channel_id === activeChannel) {
          setMessages(prev => prev.map(x => x.id === payload.new.id ? payload.new : x))
        }
        loadChannels()
      }).subscribe()
    return () => supabase.removeChannel(channel)
  }, [activeChannel, loadChannels, userId])

  // Typing indicator
  useEffect(() => {
    if (!activeChannel) return
    const ch = supabase.channel(`typing-${activeChannel}`)
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (payload.userId !== userId) {
          setTypingUsers(prev => prev.find(u => u.userId === payload.userId) ? prev : [...prev, { userId: payload.userId, name: payload.name }])
          setTimeout(() => setTypingUsers(prev => prev.filter(u => u.userId !== payload.userId)), 3000)
        }
      }).subscribe()
    return () => supabase.removeChannel(ch)
  }, [activeChannel, userId])

  // Unread badge dispatch
  useEffect(() => {
    const total = channels.reduce((s, c) => s + (c.unreadCount || 0), 0)
    window.dispatchEvent(new CustomEvent('kiko_unread_messages', { detail: { count: total } }))
  }, [channels])

  // Send message
  const sendMessage = async () => {
    if (!input.trim() || sending || !activeChannel) return
    setSending(true)
    const content = input.trim()
    setInput('')
    const replyId = replyTo?.id || null
    setReplyTo(null)
    const optimistic = { id: 'temp-' + Date.now(), channel_id: activeChannel, from_user_id: userId, from_name: userName, content, message_type: 'text', reply_to: replyId, reactions: {}, created_at: new Date().toISOString() }
    setMessages(prev => [...prev, optimistic])
    try {
      await fetch(`${API}/api/team-messages?action=send`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId: activeChannel, fromUserId: userId, fromName: userName, content, replyTo: replyId })
      })
    } catch (e) { console.error('[Messages] Send:', e) }
    finally { setSending(false); inputRef.current?.focus() }
  }

  const handleKeyDown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }

  const handleInputChange = (e) => {
    setInput(e.target.value)
    if (!activeChannel || typingTimeoutRef.current) return
    supabase.channel(`typing-${activeChannel}`).send({ type: 'broadcast', event: 'typing', payload: { userId, name: userName } }).catch(() => {})
    typingTimeoutRef.current = setTimeout(() => { typingTimeoutRef.current = null }, 2000)
  }

  // File upload
  const uploadAndSend = async (file) => {
    if (!file || !activeChannel) return
    if (file.size > 5 * 1024 * 1024) { alert('Max 5MB'); return }
    const ext = file.name.split('.').pop()
    const path = `team-chat/${activeChannel}/${Date.now()}.${ext}`
    const { error } = await supabase.storage.from('vela-assets').upload(path, file, { contentType: file.type })
    if (error) { console.error('[Messages] Upload:', error); return }
    const { data: urlData } = supabase.storage.from('vela-assets').getPublicUrl(path)
    const content = file.type.startsWith('image/') ? `📎 [Image: ${file.name}](${urlData?.publicUrl})` : `📎 [File: ${file.name}](${urlData?.publicUrl})`
    const optimistic = { id: 'temp-' + Date.now(), channel_id: activeChannel, from_user_id: userId, from_name: userName, content, message_type: 'text', reactions: {}, created_at: new Date().toISOString() }
    setMessages(prev => [...prev, optimistic])
    await fetch(`${API}/api/team-messages?action=send`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channelId: activeChannel, fromUserId: userId, fromName: userName, content }) }).catch(() => {})
  }

  const handleFileInput = (e) => { if (e.target.files?.[0]) { uploadAndSend(e.target.files[0]); e.target.value = '' } }

  // Drag & drop
  const handleDrop = (e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer.files?.[0]) uploadAndSend(e.dataTransfer.files[0]) }
  const handleDragOver = (e) => { e.preventDefault(); setDragOver(true) }
  const handleDragLeave = () => setDragOver(false)

  // Clipboard paste (screenshots)
  const handlePaste = (e) => {
    const items = e.clipboardData?.items
    if (!items) return
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault()
        const file = item.getAsFile()
        if (file) uploadAndSend(new File([file], `screenshot-${Date.now()}.png`, { type: file.type }))
        break
      }
    }
  }

  // Reactions
  const toggleReaction = async (msgId, emoji) => {
    setMessages(prev => prev.map(m => {
      if (m.id !== msgId) return m
      const reactions = { ...(m.reactions || {}) }
      const users = reactions[emoji] || []
      reactions[emoji] = users.includes(userId) ? users.filter(u => u !== userId) : [...users, userId]
      if (reactions[emoji].length === 0) delete reactions[emoji]
      return { ...m, reactions }
    }))
    setShowReactions(null)
    await fetch(`${API}/api/team-messages?action=react`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messageId: msgId, userId, emoji }) }).catch(() => {})
  }

  const activeChannelData = channels.find(c => c.id === activeChannel)
  const getDisplayName = (ch) => ch?.name || 'Chat'
  const getReplyMsg = (id) => messages.find(m => m.id === id)

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontFamily: C.font, color: C.muted }}>Loading...</div>

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 52px)', fontFamily: C.font, color: C.text, overflow: 'hidden' }}>
      {/* Channel list */}
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
              <div key={ch.id} onClick={() => { setActiveChannel(ch.id); setReplyTo(null) }} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px', borderRadius: 12, cursor: 'pointer', marginBottom: 1, background: isActive ? C.accentSoft : 'transparent' }}>
                {ch.channel_type === 'group'
                  ? <div style={{ width: 38, height: 38, borderRadius: '50%', background: 'rgba(124,58,237,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, flexShrink: 0 }}>👥</div>
                  : <Avatar name={getDisplayName(ch)} size={38} status="online" />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 13, fontWeight: ch.unreadCount ? 600 : 500 }}>{getDisplayName(ch)}</span>
                    {ch.lastMessage && <span style={{ fontSize: 10, color: C.muted }}>{new Date(ch.lastMessage.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>}
                  </div>
                  {ch.lastMessage && <div style={{ fontSize: 12, color: C.sub, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ch.lastMessage.from_name}: {ch.lastMessage.content.slice(0, 50)}</div>}
                </div>
                {ch.unreadCount > 0 && <div style={{ minWidth: 18, height: 18, borderRadius: 9, background: C.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#fff', padding: '0 5px', flexShrink: 0 }}>{ch.unreadCount}</div>}
              </div>
            )
          })}
        </div>
      </div>

      {/* Chat area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' }} onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
        {/* Drag overlay */}
        {dragOver && <div style={{ position: 'absolute', inset: 0, zIndex: 50, background: 'rgba(232,112,10,0.06)', border: '2px dashed #E8700A', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: C.accent, fontWeight: 600, pointerEvents: 'none' }}>Drop file to share</div>}

        {/* Header */}
        {activeChannelData && (
          <div style={{ padding: '10px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {activeChannelData.channel_type === 'group'
                ? <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(124,58,237,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>👥</div>
                : <Avatar name={getDisplayName(activeChannelData)} size={32} status="online" />}
              <div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{getDisplayName(activeChannelData)}</div>
                <div style={{ fontSize: 11, color: C.green, display: 'flex', alignItems: 'center', gap: 4, fontWeight: 500 }}>
                  <div style={{ width: 5, height: 5, borderRadius: '50%', background: C.green }} /> Online
                </div>
              </div>
            </div>
            <button style={{ height: 32, padding: '0 12px', borderRadius: 8, background: 'rgba(22,163,74,0.06)', border: '1px solid rgba(22,163,74,0.12)', color: C.green, fontSize: 12, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontFamily: C.font }}>📞 Call</button>
          </div>
        )}

        {/* Messages */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {messages.length === 0 && <div style={{ textAlign: 'center', padding: '40px 0', color: C.muted, fontSize: 13 }}>No messages yet. Start the conversation!</div>}
          {messages.map((msg, i) => {
            const isMine = msg.from_user_id === userId
            const showAvatar = i === 0 || messages[i - 1].from_user_id !== msg.from_user_id
            const isBot = msg.message_type === 'kiko_response'
            const isHovered = hoveredMsg === msg.id
            const replyMsg = msg.reply_to ? getReplyMsg(msg.reply_to) : null
            const reactions = msg.reactions || {}
            const hasReactions = Object.keys(reactions).length > 0
            const isImage = msg.content.match(/📎 \[Image: [^\]]+\]\((https?:\/\/[^)]+)\)/)
            const isFile = msg.content.match(/📎 \[File: [^\]]+\]\((https?:\/\/[^)]+)\)/)

            return (
              <div key={msg.id} onMouseEnter={() => setHoveredMsg(msg.id)} onMouseLeave={() => setHoveredMsg(null)} style={{ display: 'flex', flexDirection: isMine ? 'row-reverse' : 'row', alignItems: 'flex-end', gap: 8, marginTop: showAvatar ? 14 : 1, position: 'relative' }}>
                <div style={{ width: 26, flexShrink: 0 }}>
                  {showAvatar && !isMine && <Avatar name={msg.from_name} size={26} color={isBot ? '#7C3AED' : undefined} status={isBot ? 'online' : undefined} />}
                </div>
                <div style={{ maxWidth: '60%' }}>
                  {showAvatar && !isMine && (
                    <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 3, marginLeft: 2, color: isBot ? '#7C3AED' : C.sub }}>
                      {msg.from_name}{isBot && <span style={{ background: 'rgba(124,58,237,0.08)', color: '#7C3AED', padding: '1px 6px', borderRadius: 4, fontSize: 9, marginLeft: 5 }}>AI</span>}
                    </div>
                  )}
                  {/* Reply quote */}
                  {replyMsg && (
                    <div style={{ fontSize: 11, color: C.sub, padding: '4px 8px', marginBottom: 2, borderLeft: `2px solid ${C.accent}`, borderRadius: '0 6px 6px 0', background: 'rgba(0,0,0,0.02)' }}>
                      <span style={{ fontWeight: 600 }}>{replyMsg.from_name}:</span> {replyMsg.content.slice(0, 60)}
                    </div>
                  )}
                  {/* Message bubble */}
                  <div style={{ padding: isImage ? '4px' : '9px 14px', borderRadius: isMine ? '14px 14px 4px 14px' : '14px 14px 14px 4px', background: isMine ? C.accent : isBot ? 'rgba(124,58,237,0.04)' : C.card, border: isMine ? 'none' : isBot ? '1px solid rgba(124,58,237,0.08)' : `1px solid ${C.borderLight}`, fontSize: 13, lineHeight: 1.6, color: isMine ? '#fff' : C.text, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {isImage ? (
                      <div><img src={msg.content.match(/\((https?:\/\/[^)]+)\)/)[1]} alt="" style={{ maxWidth: 280, maxHeight: 200, borderRadius: 10, display: 'block' }} /><span style={{ fontSize: 10, opacity: 0.7, padding: '2px 6px', display: 'block' }}>{msg.content.match(/\[Image: ([^\]]+)\]/)?.[1]}</span></div>
                    ) : isFile ? (
                      <a href={msg.content.match(/\((https?:\/\/[^)]+)\)/)[1]} target="_blank" rel="noopener" style={{ color: isMine ? '#fff' : C.accent, textDecoration: 'underline' }}>📎 {msg.content.match(/\[File: ([^\]]+)\]/)?.[1]}</a>
                    ) : msg.content}
                  </div>
                  {/* Reactions display */}
                  {hasReactions && (
                    <div style={{ display: 'flex', gap: 4, marginTop: 3, flexWrap: 'wrap' }}>
                      {Object.entries(reactions).map(([emoji, users]) => (
                        <button key={emoji} onClick={() => toggleReaction(msg.id, emoji)} style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '1px 6px', borderRadius: 10, border: users.includes(userId) ? `1px solid ${C.accent}` : `1px solid ${C.borderLight}`, background: users.includes(userId) ? C.accentSoft : 'rgba(0,0,0,0.02)', fontSize: 12, cursor: 'pointer' }}>
                          {emoji} <span style={{ fontSize: 10, color: C.sub }}>{users.length}</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {/* Timestamp + read receipt */}
                  <div style={{ fontSize: 10, color: C.muted, marginTop: 3, textAlign: isMine ? 'right' : 'left', paddingLeft: 2, paddingRight: 2 }}>
                    {new Date(msg.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                    {isMine && msg.read_by?.length > 1 && <span style={{ marginLeft: 4, color: C.green }}>✓✓</span>}
                  </div>
                </div>
                {/* Hover actions */}
                {isHovered && !msg.id?.toString().startsWith('temp-') && (
                  <div style={{ display: 'flex', gap: 2, position: 'absolute', top: -8, [isMine ? 'left' : 'right']: 40, background: C.bg, borderRadius: 8, border: `1px solid ${C.border}`, padding: 2, boxShadow: '0 2px 8px rgba(0,0,0,0.06)', zIndex: 10 }}>
                    {REACTIONS.slice(0, 3).map(e => <button key={e} onClick={() => toggleReaction(msg.id, e)} style={{ width: 26, height: 26, border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, borderRadius: 4 }}>{e}</button>)}
                    <button onClick={() => { setReplyTo(msg); inputRef.current?.focus() }} style={{ width: 26, height: 26, border: 'none', background: 'none', cursor: 'pointer', fontSize: 12, borderRadius: 4 }}>↩️</button>
                  </div>
                )}
              </div>
            )
          })}
          <div ref={messagesEndRef} />
        </div>

        {/* Typing indicator */}
        {typingUsers.length > 0 && <div style={{ padding: '2px 24px', fontSize: 11, color: C.muted, fontStyle: 'italic' }}>{typingUsers.map(u => u.name).join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing...</div>}

        {/* Reply bar */}
        {replyTo && (
          <div style={{ padding: '6px 24px', display: 'flex', alignItems: 'center', gap: 8, borderTop: `1px solid ${C.borderLight}`, background: 'rgba(232,112,10,0.03)' }}>
            <div style={{ flex: 1, fontSize: 12, color: C.sub, borderLeft: `2px solid ${C.accent}`, paddingLeft: 8 }}>
              Replying to <b>{replyTo.from_name}</b>: {replyTo.content.slice(0, 60)}
            </div>
            <button onClick={() => setReplyTo(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: C.muted }}>✕</button>
          </div>
        )}

        {/* Input */}
        <div style={{ padding: '10px 24px 16px' }}>
          <input ref={fileInputRef} type="file" accept="image/*,.pdf,.doc,.docx,.xlsx,.txt" onChange={handleFileInput} style={{ display: 'none' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 4px 4px 6px', borderRadius: 16, border: `1px solid ${C.border}`, background: C.bg, boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
            <button onClick={() => fileInputRef.current?.click()} style={{ width: 30, height: 30, borderRadius: 9999, background: 'rgba(0,0,0,0.04)', border: `1px solid ${C.border}`, color: C.text, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 13 }}>+</button>
            <input ref={inputRef} value={input} onChange={handleInputChange} onKeyDown={handleKeyDown} onPaste={handlePaste} placeholder="Type a message..." style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: C.text, fontSize: 13, fontFamily: C.font, padding: '6px 4px' }} />
            <span style={{ fontSize: 11, color: C.muted, whiteSpace: 'nowrap', marginRight: 4 }}>@kiko for AI</span>
            <button onClick={sendMessage} disabled={!input.trim() || sending} style={{ width: 30, height: 30, borderRadius: 9999, background: input.trim() ? C.accent : 'rgba(0,0,0,0.04)', border: `1px solid ${input.trim() ? C.accent : C.border}`, cursor: input.trim() ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke={input.trim() ? '#fff' : C.muted} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
