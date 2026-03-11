export default function KikoMessage({ message }) {
  const isUser = message.role === 'user'
  const ts = message.timestamp ? new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : null

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'} mb-4`}>
      {!isUser && (
        <div className="h-6 w-6 rounded-full bg-[#1A1A1A] flex items-center justify-center flex-shrink-0 mt-1">
          <span className="text-[9px] font-bold text-white">K</span>
        </div>
      )}
      <div className={`max-w-[75%] space-y-1 flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
        <div className={`px-4 py-2.5 rounded-2xl text-[14px] leading-relaxed whitespace-pre-wrap ${
          isUser ? 'bg-[#1A1A1A] text-white rounded-br-md' : 'bg-white border border-black/[0.06] text-[#1A1A1A] rounded-bl-md shadow-sm'
        }`}>{message.content}</div>
        {ts && <span className="text-[10px] text-[#CDCDCD]">{ts}</span>}
      </div>
    </div>
  )
}
