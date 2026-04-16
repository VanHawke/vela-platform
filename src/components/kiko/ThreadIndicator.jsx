// src/components/kiko/ThreadIndicator.jsx
// Multi-conversation awareness UI — pill in top nav showing parallel active threads
// Sunny spec 2026-04-12: foundation for cross-thread awareness, voice→text handoff
//
// Polls /api/active-threads every 30s for the user's conversations updated in
// the last 60min (excluding the current one). When clicked, opens a dropdown
// listing the threads — click any to switch context.
//
// Pairs with the [OTHER ACTIVE THREADS] system-prompt injection in api/kiko.js.

import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Layers, MessageCircle, Mic, ChevronRight } from 'lucide-react'

function timeAgoMins(d) {
  if (!d) return ''
  const mins = Math.floor((Date.now() - new Date(d)) / 60000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  return `${hrs}h ago`
}

export default function ThreadIndicator({ user, currentConvId, onSwitchThread }) {
  const [threads, setThreads] = useState([])
  const [open, setOpen] = useState(false)
  const dropdownRef = useRef(null)
  const navigate = useNavigate()

  // ── Realtime subscription on conversations table (v0.0.39) ──
  // Replaces the previous 30s polling. Subscribes to INSERT/UPDATE events on
  // the user's conversations and refetches the active threads list when fired.
  // Falls back to a 60s safety poll in case the realtime channel drops.
  useEffect(() => {
    if (!user?.id) return
    let alive = true

    const fetchThreads = async () => {
      try {
        const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString()
        const { data, error } = await supabase
          .from('conversations')
          .select('id, title, updated_at, metadata')
          .eq('user_id', user.id)
          .gte('updated_at', cutoff)
          .order('updated_at', { ascending: false })
          .limit(8)
        if (!alive || error) return
        const others = (data || []).filter(t => t.id !== currentConvId)
        setThreads(others)
      } catch {}
    }

    // Initial fetch
    fetchThreads()

    // Realtime channel — INSERT or UPDATE on this user's rows
    const channel = supabase
      .channel(`thread_indicator:${user.id}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'conversations', filter: `user_id=eq.${user.id}` },
        () => { fetchThreads() }
      )
      .subscribe()

    // Safety net: refetch every 60s in case channel silently drops
    const safetyPoll = setInterval(fetchThreads, 60_000)

    return () => {
      alive = false
      clearInterval(safetyPoll)
      try { supabase.removeChannel(channel) } catch {}
    }
  }, [user, currentConvId])

  // Click outside to close
  useEffect(() => {
    if (!open) return
    const handleClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  if (threads.length === 0) return null

  const switchTo = async (thread) => {
    setOpen(false)
    if (onSwitchThread) {
      // Load the thread messages and switch context
      try {
        const { data } = await supabase.from('conversations').select('messages, title').eq('id', thread.id).single()
        onSwitchThread({
          id: thread.id,
          messages: data?.messages || [],
          title: thread.title,
          type: thread.metadata?.source === 'voice' ? 'voice' : 'kiko'
        })
      } catch {}
    }
    // Touch the conversation so it bumps to top of recent
    supabase.from('conversations').update({ updated_at: new Date().toISOString() }).eq('id', thread.id).then(() => {})
  }

  return (
    <div ref={dropdownRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '5px 12px', borderRadius: 50,
          background: 'rgba(0,0,0,0.04)',
          border: '1px solid rgba(124,92,252,0.16)',
          color: 'rgba(124,92,252,0.85)',
          fontSize: 11, fontFamily: 'var(--font)', fontWeight: 500,
          cursor: 'pointer', transition: 'all 0.15s',
        }}
        onMouseOver={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.06)'; e.currentTarget.style.borderColor = 'rgba(124,92,252,0.24)' }}
        onMouseOut={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.04)'; e.currentTarget.style.borderColor = 'rgba(124,92,252,0.16)' }}
        title="Other active conversations"
      >
        <Layers size={11} />
        <span>{threads.length} active</span>
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 8px)', right: 0,
          width: 320,
          background: '#FFFFFF',
          backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
          borderRadius: 12,
          border: '1px solid rgba(0,0,0,0.08)',
          boxShadow: '0 16px 48px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.04)',
          padding: 8,
          zIndex: 9999,
        }}>
          <div style={{
            padding: '6px 10px 8px',
            fontSize: 10, fontWeight: 600, color: 'rgba(124,92,252,0.7)',
            textTransform: 'uppercase', letterSpacing: '0.08em',
            borderBottom: '1px solid rgba(255,255,255,0.04)', marginBottom: 4,
          }}>
            Other active conversations
          </div>
          {threads.map(thread => {
            const isVoice = thread.metadata?.source === 'voice'
            const Icon = isVoice ? Mic : MessageCircle
            const cleanTitle = (thread.title || 'Untitled').replace(/^(🎙|🎤)\s*/, '').slice(0, 50)
            return (
              <button
                key={thread.id}
                onClick={() => switchTo(thread)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  width: '100%', padding: '10px 12px', borderRadius: 8,
                  background: 'transparent', border: 'none', cursor: 'pointer',
                  textAlign: 'left', fontFamily: 'var(--font)',
                  transition: 'background 0.12s',
                }}
                onMouseOver={e => e.currentTarget.style.background = 'rgba(0,0,0,0.05)'}
                onMouseOut={e => e.currentTarget.style.background = 'transparent'}
              >
                <div style={{
                  width: 28, height: 28, borderRadius: 8,
                  background: isVoice ? 'rgba(0,0,0,0.06)' : 'rgba(0,0,0,0.06)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <Icon size={13} color={isVoice ? '#0A0A0A' : '#0A0A0A'} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 12, fontWeight: 500, color: '#fff',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {cleanTitle}
                  </div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.40)', marginTop: 2 }}>
                    {isVoice ? 'Voice' : 'Chat'} · {timeAgoMins(thread.updated_at)}
                  </div>
                </div>
                <ChevronRight size={12} color="rgba(255,255,255,0.25)" />
              </button>
            )
          })}
          <div style={{
            padding: '8px 10px 4px', marginTop: 4,
            fontSize: 9, color: 'rgba(255,255,255,0.30)', lineHeight: 1.5,
            borderTop: '1px solid rgba(255,255,255,0.04)',
          }}>
            Kiko sees these threads in her context. She can cross-reference what's discussed in each.
          </div>
        </div>
      )}
    </div>
  )
}
