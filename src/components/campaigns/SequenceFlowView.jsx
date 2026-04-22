// src/components/campaigns/SequenceFlowView.jsx — Lemlist-style visual sequence builder
import { useState } from 'react'
import { Mail, Linkedin, GitBranch, Clock, Trash2, Plus, UserPlus, MessageSquare, Eye, Check } from 'lucide-react'

const C = {
  bg: '#FEFEFC', card: '#FFFFFF', border: 'rgba(0,0,0,0.08)',
  text: '#0A0A0A', textSec: '#6B6B6B', textTer: '#A0A0A0',
  purple: '#7C5CFC', teal: '#00D4AA', amber: '#D4A843',
  font: "'Inter', system-ui, sans-serif",
}

const STEP_TYPES = {
  email: { icon: Mail, color: '#7C5CFC', bg: 'rgba(124,92,252,0.06)', border: 'rgba(124,92,252,0.15)', label: 'Email' },
  linkedin_connect: { icon: UserPlus, color: '#0077B5', bg: 'rgba(0,119,181,0.06)', border: 'rgba(0,119,181,0.15)', label: 'Connection Request' },
  linkedin_message: { icon: MessageSquare, color: '#0077B5', bg: 'rgba(0,119,181,0.06)', border: 'rgba(0,119,181,0.15)', label: 'LinkedIn Message' },
  linkedin_visit: { icon: Eye, color: '#0077B5', bg: 'rgba(0,119,181,0.04)', border: 'rgba(0,119,181,0.10)', label: 'Profile Visit' },
  condition: { icon: GitBranch, color: '#D4A843', bg: 'rgba(212,168,67,0.06)', border: 'rgba(212,168,67,0.15)', label: 'Condition' },
  condition_accepted: { icon: Check, color: '#00B464', bg: 'rgba(0,180,100,0.06)', border: 'rgba(0,180,100,0.15)', label: 'Connection Accepted?' },
}

function getStepType(step) {
  if (step.type === 'condition') {
    if (step.condition_type === 'connection_accepted') return 'condition_accepted'
    return 'condition'
  }
  if (step.channel === 'linkedin') {
    if (step.action === 'invite') return 'linkedin_connect'
    if (step.action === 'visit') return 'linkedin_visit'
    return 'linkedin_message'
  }
  return 'email'
}

function StepCard({ step, index, isSelected, onClick, onDelete }) {
  const type = getStepType(step)
  const config = STEP_TYPES[type] || STEP_TYPES.email
  const Icon = config.icon
  const preview = step.template ? step.template.slice(0, 80) + (step.template.length > 80 ? '...' : '') : step.subject ? step.subject : ''

  return (
    <div
      onClick={onClick}
      style={{
        width: '100%', maxWidth: 380, padding: '14px 16px', borderRadius: 10,
        background: isSelected ? config.bg : C.card,
        border: `1.5px solid ${isSelected ? config.color : config.border}`,
        cursor: 'pointer', transition: 'all 0.15s ease',
        boxShadow: isSelected ? `0 2px 12px ${config.color}15` : '0 1px 3px rgba(0,0,0,0.04)',
        position: 'relative',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: config.bg, border: `1px solid ${config.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon size={16} style={{ color: config.color }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: C.text, fontFamily: C.font }}>{config.label}</div>
          {preview && <div style={{ fontSize: 11, color: C.textSec, fontFamily: C.font, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>{preview}</div>}
          {!preview && type !== 'condition' && type !== 'condition_accepted' && <div style={{ fontSize: 11, color: C.textTer, fontFamily: C.font, fontStyle: 'italic', marginTop: 2 }}>Click to write content</div>}
        </div>
        <div style={{ fontSize: 10, color: C.textTer, fontFamily: C.font, fontWeight: 500 }}>#{index + 1}</div>
      </div>
      {type === 'condition' && step.condition_type && (
        <div style={{ marginTop: 8, fontSize: 10, color: config.color, fontFamily: C.font, fontWeight: 500 }}>
          IF: {step.condition_type === 'no_reply' ? 'No reply' : step.condition_type === 'connection_accepted' ? 'Connection accepted' : step.condition_type === 'has_linkedin' ? 'Has LinkedIn' : step.condition_type}
        </div>
      )}
      {onDelete && (
        <button onClick={e => { e.stopPropagation(); onDelete() }} style={{ position: 'absolute', top: 8, right: 8, width: 22, height: 22, borderRadius: 6, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.4 }}
          onMouseOver={e => e.currentTarget.style.opacity = 1} onMouseOut={e => e.currentTarget.style.opacity = 0.4}>
          <Trash2 size={12} style={{ color: '#f87171' }} />
        </button>
      )}
    </div>
  )
}

function DelayChip({ days, onChange }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(days || 3)

  if (editing) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 0' }}>
        <Clock size={12} style={{ color: C.textTer }} />
        <span style={{ fontSize: 11, color: C.textSec, fontFamily: C.font }}>Wait</span>
        <input value={val} onChange={e => setVal(Number(e.target.value) || 0)} onBlur={() => { onChange(val); setEditing(false) }} onKeyDown={e => { if (e.key === 'Enter') { onChange(val); setEditing(false) } }}
          autoFocus type="number" min={0} max={30}
          style={{ width: 36, padding: '2px 4px', borderRadius: 4, border: `1px solid ${C.border}`, fontSize: 11, fontFamily: C.font, textAlign: 'center', outline: 'none', color: C.text }} />
        <span style={{ fontSize: 11, color: C.textSec, fontFamily: C.font }}>days</span>
      </div>
    )
  }

  return (
    <button onClick={() => setEditing(true)} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 20, border: `1px solid ${C.border}`, background: '#F9F9F7', cursor: 'pointer', fontSize: 10, color: C.textSec, fontFamily: C.font }}>
      <Clock size={10} /> Wait {days || 0} day{days !== 1 ? 's' : ''}
    </button>
  )
}

function AddStepButton({ onAdd }) {
  const [open, setOpen] = useState(false)

  const options = [
    { key: 'email', ...STEP_TYPES.email },
    { key: 'linkedin_connect', ...STEP_TYPES.linkedin_connect },
    { key: 'linkedin_message', ...STEP_TYPES.linkedin_message },
    { key: 'condition_accepted', ...STEP_TYPES.condition_accepted },
    { key: 'condition', ...STEP_TYPES.condition },
  ]

  return (
    <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <button onClick={() => setOpen(!open)} style={{ width: 28, height: 28, borderRadius: '50%', border: `1.5px dashed ${open ? C.purple : 'rgba(0,0,0,0.15)'}`, background: open ? 'rgba(124,92,252,0.06)' : 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}>
        <Plus size={14} style={{ color: open ? C.purple : C.textTer, transition: 'all 0.15s' }} />
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 34, left: '50%', transform: 'translateX(-50%)', background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: 6, zIndex: 10, width: 220 }}>
          {options.map(opt => {
            const Icon = opt.icon
            return (
              <button key={opt.key} onClick={() => { onAdd(opt.key); setOpen(false) }}
                style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 10px', borderRadius: 6, border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left', fontFamily: C.font, transition: 'background 0.1s' }}
                onMouseOver={e => e.currentTarget.style.background = opt.bg} onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
                <div style={{ width: 26, height: 26, borderRadius: 6, background: opt.bg, border: `1px solid ${opt.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon size={13} style={{ color: opt.color }} />
                </div>
                <span style={{ fontSize: 12, color: C.text, fontWeight: 500 }}>{opt.label}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function VerticalLine() {
  return <div style={{ width: 2, height: 16, background: 'rgba(0,0,0,0.08)', margin: '0 auto' }} />
}

export default function SequenceFlowView({ steps, selectedStep, onSelectStep, onAddStep, onDeleteStep, onUpdateDelay }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px 16px 40px', minHeight: 300 }}>
      {steps.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px 20px' }}>
          <div style={{ fontSize: 14, color: C.textSec, fontFamily: C.font, marginBottom: 16 }}>Add your first step to start building</div>
          <AddStepButton onAdd={onAddStep} />
        </div>
      )}

      {steps.map((step, i) => (
        <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
          {/* Delay chip (not on first step) */}
          {i > 0 && (
            <>
              <VerticalLine />
              <DelayChip days={step.delay_days} onChange={(d) => onUpdateDelay(i, d)} />
              <VerticalLine />
            </>
          )}

          {/* Step card */}
          <StepCard step={step} index={i} isSelected={selectedStep === i} onClick={() => onSelectStep(i)} onDelete={() => onDeleteStep(i)} />

          {/* "+" button after step */}
          <VerticalLine />
          <AddStepButton onAdd={(type) => onAddStep(type, i + 1)} />
        </div>
      ))}
    </div>
  )
}
