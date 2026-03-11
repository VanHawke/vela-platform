import { Loader2, Check, Wrench } from "lucide-react"

export default function KikoThinking({ steps = [], isActive = false }) {
  if (!steps.length) return null
  return (
    <div className={`my-2 ml-9 border-l-2 pl-3 space-y-1 ${isActive ? 'border-[#1A1A1A]/30 animate-pulse' : 'border-[#E0E0E0]'}`}>
      {steps.map((step, i) => {
        const done = !isActive || i < steps.length - 1
        return (
          <div key={i} className="flex items-center gap-2 py-1 text-[12px] text-[#6B6B6B]">
            {done ? <Check className="h-3 w-3 text-[#1A1A1A]" /> : <Loader2 className="h-3 w-3 text-[#ABABAB] animate-spin" />}
            <Wrench className="h-3 w-3 text-[#CDCDCD]" />
            <span className="font-medium">{step.label}</span>
          </div>
        )
      })}
    </div>
  )
}
