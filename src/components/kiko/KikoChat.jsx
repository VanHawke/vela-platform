import { useState, useRef, useEffect, useCallback } from 'react'
import { Send, Mic, AudioLines, PanelRightClose, PanelRightOpen } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { supabase } from '@/lib/supabase'
import KikoMessage from './KikoMessage'
import KikoVoice, { useMicInput } from './KikoVoice'
import ChatHistory from '@/components/layout/ChatHistory'
import { ScrollArea } from '@/components/ui/scroll-area'
import KikoThinking from '../KikoThinking'

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
  const [historyOpen, setHistoryOpen] = useState(false)
  const [voiceOpen, setVoiceOpen] = useState(false)
  const [thinkingSteps, setThinkingSteps] = useState([])
  const [isThinking, setIsThinking] = useState(false)
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
    setThinkingSteps([])
    setIsThinking(false)

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
            if (j.toolStatus) {
              if (j.toolStatus === null || j.toolStatus === '') {
                setIsThinking(false)
              } else {
                setIsThinking(true)
                setThinkingSteps(prev => [...prev, { type: 'tool', label: j.toolStatus, results: [] }])
              }
            }
            if (j.tool_start) {
              setIsThinking(true)
              setThinkingSteps(prev => [...prev, { type: j.tool_start.type || 'tool', label: j.tool_start.label || j.tool_start.name, results: [] }])
            }
            if (j.tool_result) {
              setThinkingSteps(prev => {
                const updated = [...prev]
                if (updated.length > 0) {
                  updated[updated.length - 1] = { ...updated[updated.length - 1], results: j.tool_result.results || [] }
                }
                return updated
              })
            }
          } catch {}
        }
      }

      setIsThinking(false)

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

  // Track last user voice text for Mem0 pairing
  const lastVoiceUserText = useRef('')

  // Mode 3 — Voice message callback (fires per individual transcript)
  // { role: 'user'|'assistant', content: string }
  const handleVoiceMessage = useCallback(async ({ role, content }) => {
    if (!content) return
    console.log('[VoiceMsg] Received:', role, JSON.stringify(content.slice(0, 80)))

    const msg = { role, content, timestamp: new Date().toISOString() }

    // Track user text for Mem0 pairing
    if (role === 'user') {
      lastVoiceUserText.current = content
    }

    // Add message bubble to chat immediately + save to Supabase
    setMessages(prev => {
      const updated = [...prev, msg]
      const toSave = updated.map(m => ({ role: m.role, content: m.content }))
      const currentConvId = activeConvIdRef.current
      console.log('[VoiceMsg] Saving', toSave.length, 'messages, convId:', currentConvId)
      saveConversation(toSave, currentConvId, content.slice(0, 60) || 'Voice conversation')
        .then(newId => {
          console.log('[VoiceMsg] saveConversation returned:', newId)
          if (newId && !currentConvId) {
            setActiveConvId(newId)
            activeConvIdRef.current = newId
          }
          loadConversations()
        })
        .catch(err => console.error('[VoiceMsg] saveConversation error:', err))
      return updated
    })

    // Mem0 — store after each complete exchange (assistant message arrives)
    if (role === 'assistant' && lastVoiceUserText.current) {
      console.log('[VoiceMsg] Sending exchange to Mem0')
      const userText = lastVoiceUserText.current
      lastVoiceUserText.current = ''
      fetch('/api/voice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mem0', userText, kikoText: content }),
      })
        .then(r => r.json())
        .then(d => console.log('[VoiceMsg] Mem0 response:', d))
        .catch(err => console.error('[VoiceMsg] Mem0 error:', err))
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
              {(thinkingSteps.length > 0) && (
                <KikoThinking steps={thinkingSteps} isActive={isThinking} />
              )}
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
        onVoiceMessage={handleVoiceMessage}
        user={user}
        onToolStart={(tool) => {
          setIsThinking(true);
          setThinkingSteps(prev => [...prev, { name: tool.name, input: tool.input, status: 'running' }]);
        }}
        onToolEnd={() => {
          setIsThinking(false);
          setThinkingSteps(prev => prev.map(s => ({ ...s, status: 'done' })));
        }}
      />
    </div>
  )
}
