import { useState } from 'react'
import { Search, Plus, MessageSquare } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'

export default function ChatHistory({ conversations, activeId, onSelect, onNewChat, collapsed, onToggle }) {
  const [search, setSearch] = useState('')

  const filtered = (conversations || []).filter(c =>
    !search || (c.title || '').toLowerCase().includes(search.toLowerCase())
  )

  const formatTime = (ts) => {
    if (!ts) return ''
    const d = new Date(ts)
    const now = new Date()
    const diff = now - d
    if (diff < 86400000) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    if (diff < 604800000) return d.toLocaleDateString([], { weekday: 'short' })
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
  }

  if (collapsed) return null

  return (
    <div className="w-[280px] flex-shrink-0 border-l border-white/8 flex flex-col h-full bg-background">
      <div className="p-3 space-y-2 border-b border-white/8">
        <Button
          onClick={onNewChat}
          variant="outline"
          className="w-full h-9 text-sm border-white/10 text-white/60 hover:text-white hover:bg-white/5"
        >
          <Plus className="h-4 w-4 mr-2" /> New Chat
        </Button>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/20" />
          <Input
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 pl-8 text-xs bg-white/5 border-white/10 text-white placeholder:text-white/20"
          />
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2 space-y-0.5">
          {filtered.length === 0 && (
            <p className="text-xs text-white/20 text-center py-8">No conversations yet</p>
          )}
          {filtered.map((conv) => (
            <button
              key={conv.id}
              onClick={() => onSelect(conv.id)}
              className={`w-full text-left px-3 py-2.5 rounded-lg transition-all duration-150 group ${
                activeId === conv.id
                  ? 'bg-white/8 border-l-2 border-white'
                  : 'hover:bg-white/5 border-l-2 border-transparent'
              }`}
            >
              <div className="flex items-start gap-2">
                <MessageSquare className="h-3.5 w-3.5 text-white/20 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white/70 truncate">{conv.title || 'New conversation'}</p>
                  <p className="text-[10px] text-white/20 mt-0.5">{formatTime(conv.updated_at)}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}
