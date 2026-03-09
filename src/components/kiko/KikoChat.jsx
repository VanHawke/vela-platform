import { useState, useRef, useEffect, useCallback } from 'react'
import { Send, Mic, AudioLines, PanelRightClose, PanelRightOpen } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { supabase } from '@/lib/supabase'
import KikoMessage from './KikoMessage'
import KikoVoice, { useMicInput } from './KikoVoice'
import ChatHistory from '@/components/layout/ChatHistory'
import { ScrollArea } from '@/components/ui/scroll-area'

const CHIPS = [
  'Brief me on my pipeline',
  "What's happening in F1 this week",
  'What do I need to follow up on',
  "Summarise yesterday's activity",
]

function getGreeting() {
  const h = new Date().getHours()
  if (h >= 5 && h < 12) return 'Good morning'
  if (h >= 12 && h < 18) return 'Good afternoon'
  return 'Good evening'
}

export default function KikoChat({ user }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [streamText, setStreamText] = useState('')
  const [conversations, setConversations] = useState([])
  const [activeConvId, setActiveConvId] = useState(null)
  const [historyOpen, setHistoryOpen] = useState(true)
  const [voiceOpen, setVoiceOpen] = useState(false)
  const scrollRef = useRef(null)
  const inputRef = useRef(null)
  const { recording, startRecording, stopRecording } = useMicInput()

  // Load conversations from Supabase (uses authenticated client — RLS safe)
  useEffect(() => {
    if (user?.id) loadConversations()
  }, [user?.id])

  const loadConversations = async () => {
    try {
      const { data, error } = await supabase
        .from('conversations')
        .select('id, title, updated_at')
        .eq('user_id', user?.id)
        .order('updated_at', { ascending: false })
        .limit(50)
      if (error) console.error('[Chat] Load conversations error:', error.message)
      if (data) setConversations(data)
    } catch (err) {
      console.error('[Chat] Load conversations exception:', err)
    }
  }

  // Save conversation to Supabase (client-side, authenticated, RLS works)
  const saveConversation = async (allMessages, convId, firstUserMessage) => {
    console.log('[SaveConv] Called — msgCount:', allMessages.length, 'convId:', convId, 'userId:', user?.id, 'title:', firstUserMessage?.slice(0, 30))
    if (!user?.id) {
      console.warn('[SaveConv] No user.id — aborting')
      return convId
    }
    try {
      if (convId) {
        // Update existing conversation
        console.log('[SaveConv] Updating existing:', convId)
        const { error } = await supabase
          .from('conversations')
          .update({ messages: allMessages, updated_at: new Date().toISOString() })
          .eq('id', convId)
        if (error) console.error('[SaveConv] Update error:', error.message, error.details)
        else console.log('[SaveConv] Update success')
        return convId
      } else {
        // Insert new conversation
        console.log('[SaveConv] Inserting new conversation')
        const { data, error } = await supabase
          .from('conversations')
          .insert({
            user_id: user.id,
            title: (firstUserMessage || 'New conversation').slice(0, 60),
            messages: allMessages,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .select('id')
          .single()
        if (error) {
          console.error('[SaveConv] Insert error:', error.message, error.details, error.hint)
          return null
        }
        console.log('[SaveConv] Insert success — new id:', data?.id)
        return data?.id || null
      }
    } catch (err) {
      console.error('[SaveConv] Exception:', err)
      return convId
    }
  }

  // Auto-scroll on new messages
  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streamText])

  const handleSubmit = useCallback(async (text) => {
    const msg = (text || input).trim()
    if (!msg || streaming) return
    setInput('')

    const userMsg = { role: 'user', content: msg, timestamp: new Date().toISOString() }
    setMessages(prev => [...prev, userMsg])
    setStreaming(true)
    setStreamText('')

    const startTime = Date.now()

    try {
      const res = await fetch('/api/kiko', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: msg,
          userEmail: user?.email,
          conversationHistory: messages.slice(-20).map(m => ({ role: m.role, content: m.content })),
          conversationId: activeConvId,
        }),
      })

      if (!res.ok) throw new Error(`API error: ${res.status}`)

      const reader = res.body.getReader()
      const dec = new TextDecoder()
      let full = ''
      let buf = ''
      let meta = {}

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() || ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const d = line.slice(6)
          if (d === '[DONE]') continue
          try {
            const j = JSON.parse(d)
            if (j.delta) { full += j.delta; setStreamText(full) }
            if (j.meta) meta = j.meta
          } catch {}
        }
      }

      const ttft = meta.ttft || (Date.now() - startTime)
      const kikoMsg = {
        role: 'assistant',
        content: full,
        timestamp: new Date().toISOString(),
        meta: { ttft, model: meta.model, tier: meta.tier },
      }
      const updatedMessages = [...messages, userMsg, kikoMsg]
      setMessages(prev => [...prev, kikoMsg])
      setStreamText('')

      // Save to Supabase (client-side, authenticated)
      const newId = await saveConversation(
        updatedMessages.map(m => ({ role: m.role, content: m.content })),
        activeConvId,
        msg,
      )
      if (newId && !activeConvId) setActiveConvId(newId)
      loadConversations()
    } catch (err) {
      const errMsg = {
        role: 'assistant',
        content: `Sorry, something went wrong. ${err.message}`,
        timestamp: new Date().toISOString(),
      }
      setMessages(prev => [...prev, errMsg])
      setStreamText('')
    } finally {
      setStreaming(false)
    }
  }, [input, streaming, messages, user, activeConvId])

  const handleNewChat = () => {
    setMessages([])
    setActiveConvId(null)
    setStreamText('')
    inputRef.current?.focus()
  }

  const handleSelectConversation = async (convId) => {
    setActiveConvId(convId)
    try {
      const { data } = await supabase
        .from('conversations')
        .select('messages')
        .eq('id', convId)
        .single()
      if (data?.messages) setMessages(data.messages)
      else setMessages([])
    } catch {
      setMessages([])
    }
  }

  // Mode 2 — Mic toggle (STT → text input)
  const handleMicToggle = useCallback(async () => {
    if (recording) {
      const text = await stopRecording()
      if (text) {
        setInput(text)
        inputRef.current?.focus()
      }
    } else {
      await startRecording()
    }
  }, [recording, startRecording, stopRecording])

  // Track activeConvId in a ref so voice callbacks always see latest value
  const activeConvIdRef = useRef(activeConvId)
  useEffect(() => { activeConvIdRef.current = activeConvId }, [activeConvId])

  // Mode 3 — Voice exchange callback (fires per turn, not on close)
  // Adds messages to chat, saves to Supabase, feeds Mem0
  const handleVoiceExchange = useCallback(async ({ user: userText, kiko: kikoText }) => {
    console.log('[VoiceExchange] Called with userText:', JSON.stringify(userText), 'kikoText:', JSON.stringify(kikoText))
    const newMsgs = []
    if (userText) {
      newMsgs.push({ role: 'user', content: userText, timestamp: new Date().toISOString() })
    }
    if (kikoText) {
      newMsgs.push({ role: 'assistant', content: kikoText, timestamp: new Date().toISOString() })
    }
    if (newMsgs.length === 0) {
      console.warn('[VoiceExchange] No messages to save — returning early')
      return
    }

    console.log('[VoiceExchange] Adding', newMsgs.length, 'messages to state. activeConvIdRef:', activeConvIdRef.current, 'user?.id:', user?.id)

    // Update local state, then save async using ref for latest convId
    setMessages(prev => {
      const updated = [...prev, ...newMsgs]
      const toSave = updated.map(m => ({ role: m.role, content: m.content }))
      const currentConvId = activeConvIdRef.current
      console.log('[VoiceExchange] Inside setMessages — saving', toSave.length, 'messages, convId:', currentConvId)
      saveConversation(toSave, currentConvId, userText || 'Voice conversation')
        .then(newId => {
          console.log('[VoiceExchange] saveConversation returned:', newId, '(was:', currentConvId, ')')
          if (newId && !currentConvId) {
            setActiveConvId(newId)
            activeConvIdRef.current = newId
          }
          loadConversations()
        })
        .catch(err => console.error('[VoiceExchange] saveConversation error:', err))
      return updated
    })

    // Feed Mem0 with voice exchange (fire-and-forget)
    if (userText && kikoText) {
      console.log('[VoiceExchange] Sending to Mem0')
      fetch('/api/voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mem0', userText, kikoText }),
      })
        .then(r => r.json())
        .then(d => console.log('[VoiceExchange] Mem0 response:', d))
        .catch(err => console.error('[VoiceExchange] Mem0 error:', err))
    } else {
      console.log('[VoiceExchange] Skipping Mem0 — missing userText or kikoText')
    }
  }, [user])

  const hasMessages = messages.length > 0 || streaming

  return (
    <div className="flex h-full">
      {/* Centre zone */}
      <div className="flex-1 flex flex-col h-full relative">
        {/* Messages or welcome */}
        <div className="flex-1 overflow-y-auto">
          {!hasMessages ? (
            /* Welcome state */
            <div className="flex flex-col items-center justify-center h-full px-6">
              <Avatar className="h-14 w-14 mb-6">
                <AvatarFallback className="text-lg bg-white/10 text-white font-semibold">K</AvatarFallback>
              </Avatar>
              <h1 className="text-[32px] font-light text-white mb-1">
                {getGreeting()}, Sunny
              </h1>
              <p className="text-sm text-white/30 mb-10">How can I help today?</p>

              {/* Suggestion chips */}
              <div className="grid grid-cols-2 gap-3 max-w-md w-full">
                {CHIPS.map((chip) => (
                  <button
                    key={chip}
                    onClick={() => handleSubmit(chip)}
                    className="px-4 py-3 rounded-xl border border-white/10 text-sm text-white/50
                      hover:text-white hover:border-white/25 hover:shadow-[0_0_12px_rgba(255,255,255,0.05)]
                      transition-all duration-200 text-left"
                  >
                    {chip}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            /* Conversation */
            <div className="max-w-2xl mx-auto w-full px-6 py-6">
              {messages.map((msg, i) => (
                <KikoMessage key={i} message={msg} />
              ))}
              {streaming && streamText && (
                <KikoMessage
                  message={{ role: 'assistant', content: streamText + '▍' }}
                />
              )}
              <div ref={scrollRef} />
            </div>
          )}
        </div>

        {/* Input bar — fixed bottom */}
        <div className="p-4 pb-6">
          <div className="max-w-2xl mx-auto">
            <div className="flex items-center gap-2 bg-[#1A1A1A] rounded-[28px] px-4 h-14">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSubmit()}
                placeholder="Ask Kiko anything..."
                disabled={streaming}
                className="flex-1 bg-transparent text-white text-sm placeholder:text-white/25 outline-none"
              />
              <button
                onClick={handleMicToggle}
                className={`transition-colors p-1.5 ${recording ? 'text-red-400 animate-pulse' : 'text-white/25 hover:text-white/50'}`}
                title={recording ? 'Stop recording' : 'Voice input (Mode 2)'}
              >
                <Mic className="h-5 w-5" />
              </button>
              <button
                onClick={() => setVoiceOpen(true)}
                className="text-white/25 hover:text-white/50 transition-colors p-1.5"
                title="Voice conversation (Mode 3)"
              >
                <AudioLines className="h-5 w-5" />
              </button>
              <button
                onClick={() => handleSubmit()}
                disabled={!input.trim() || streaming}
                className="text-white/40 hover:text-white disabled:text-white/15 transition-colors p-1.5"
              >
                <Send className="h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* History toggle */}
      <button
        onClick={() => setHistoryOpen(!historyOpen)}
        className="absolute top-3 right-3 z-10 text-white/20 hover:text-white/50 transition-colors p-1.5"
      >
        {historyOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
      </button>

      {/* Right panel — chat history */}
      <ChatHistory
        conversations={conversations}
        activeId={activeConvId}
        onSelect={handleSelectConversation}
        onNewChat={handleNewChat}
        collapsed={!historyOpen}
        onToggle={() => setHistoryOpen(!historyOpen)}
      />

      {/* Voice Mode 3 overlay */}
      <KikoVoice
        open={voiceOpen}
        onClose={() => setVoiceOpen(false)}
        onExchange={handleVoiceExchange}
      />
    </div>
  )
}
