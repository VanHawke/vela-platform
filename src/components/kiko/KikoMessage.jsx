import { Avatar, AvatarFallback } from '@/components/ui/avatar'

export default function KikoMessage({ message }) {
  const isUser = message.role === 'user'
  const timestamp = message.timestamp
    ? new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'} mb-4`}>
      {!isUser && (
        <Avatar className="h-6 w-6 flex-shrink-0 mt-1">
          <AvatarFallback className="text-[10px] bg-white/10 text-white">K</AvatarFallback>
        </Avatar>
      )}
      <div className={`max-w-[75%] space-y-1 ${isUser ? 'items-end' : 'items-start'} flex flex-col`}>
        <div
          className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
            isUser
              ? 'bg-white text-black rounded-br-md'
              : 'bg-[#1A1A1A] text-white/90 rounded-bl-md'
          }`}
        >
          {message.content}
        </div>
        <div className={`flex items-center gap-2 ${isUser ? 'flex-row-reverse' : ''}`}>
          {timestamp && (
            <span className="text-[10px] text-white/20">{timestamp}</span>
          )}
          {message.meta && (
            <span className="text-[10px] text-white/15 font-mono">
              {message.meta.ttft && `${message.meta.ttft}ms`}
              {message.meta.model && ` · ${message.meta.model.replace('claude-', '').split('-')[0]}`}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
