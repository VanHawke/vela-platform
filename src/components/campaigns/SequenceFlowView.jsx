// src/components/campaigns/SequenceFlowView.jsx — Lemlist-style visual sequence builder with condition branching
import { useState } from 'react'
import { Mail, Linkedin, GitBranch, Clock, Trash2, Plus, UserPlus, MessageSquare, Eye, Check, CheckCircle, XCircle } from 'lucide-react'

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

const CONDITION_LABELS = {
  no_reply: 'No reply', connection_accepted: 'Connection accepted',
  has_linkedin: 'Has LinkedIn URL', has_email: 'Has email', email_opened: 'Email opened',
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

function StepCard({ step, index, isSelected, onClick, onDelete, compact }) {
  const type = getStepType(step)
  const config = STEP_TYPES[type] || STEP_TYPES.email
  const Icon = config.icon
  const preview = step.template ? step.template.slice(0, 60) + (step.template.length > 60 ? '...' : '') : step.subject || ''
  const hasCondition = step.condition === 'connection_accepted'

  return (
    <div onClick={onClick} style={{
      width: '100%', maxWidth: compact ? 150 : 320, padding: compact ? '8px 10px' : '12px 14px', borderRadius: 10,
      background: isSelected ? config.bg : C.card,
      border: `1.5px solid ${isSelected ? config.color : config.border}`,
      cursor: 'grab', transition: 'all 0.15s ease',
      boxShadow: isSelected ? `0 2px 12px ${config.color}15` : '0 1px 3px rgba(0,0,0,0.04)',
      position: 'relative',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: compact ? 6 : 10 }}>
        <div style={{ width: compact ? 24 : 30, height: compact ? 24 : 30, borderRadius: 7, background: config.bg, border: `1px solid ${config.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon size={compact ? 12 : 14} style={{ color: config.color }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: compact ? 10 : 12, fontWeight: 600, color: C.text, fontFamily: C.font, display: 'flex', alignItems: 'center', gap: 4 }}>
            {config.label}
            {hasCondition && <span style={{ fontSize: 8, padding: '1px 5px', borderRadius: 4, background: 'rgba(212,168,67,0.12)', color: '#D4A843', fontWeight: 600 }}>IF CONNECTED</span>}
          </div>
          {!compact && step.approach && <div style={{ fontSize: 10, color: C.textTer, fontFamily: C.font, marginTop: 1 }}>{step.approach}</div>}
          {!compact && preview && !step.approach && <div style={{ fontSize: 11, color: C.textSec, fontFamily: C.font, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>{preview}</div>}
          {!compact && !preview && !step.approach && type !== 'condition' && type !== 'condition_accepted' && <div style={{ fontSize: 10, color: C.textTer, fontFamily: C.font, fontStyle: 'italic', marginTop: 1 }}>Click to edit</div>}
        </div>
        {!compact && <span style={{ fontSize: 9, color: C.textTer, fontFamily: C.font, fontWeight: 500 }}>#{index + 1}</span>}
      </div>
      {onDelete && !compact && (
        <button onClick={e => { e.stopPropagation(); onDelete() }} style={{ position: 'absolute', top: 6, right: 6, width: 20, height: 20, borderRadius: 5, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0.3 }}
          onMouseOver={e => e.currentTarget.style.opacity = 1} onMouseOut={e => e.currentTarget.style.opacity = 0.3}>
          <Trash2 size={11} style={{ color: '#f87171' }} />
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 0' }}>
        <Clock size={10} style={{ color: C.textTer }} />
        <input value={val} onChange={e => setVal(Number(e.target.value) || 0)} onBlur={() => { onChange(val); setEditing(false) }} onKeyDown={e => { if (e.key === 'Enter') { onChange(val); setEditing(false) } }}
          autoFocus type="number" min={0} max={30}
          style={{ width: 32, padding: '1px 3px', borderRadius: 4, border: `1px solid ${C.border}`, fontSize: 10, fontFamily: C.font, textAlign: 'center', outline: 'none', color: C.text }} />
        <span style={{ fontSize: 10, color: C.textSec, fontFamily: C.font }}>days</span>
      </div>
    )
  }
  return (
    <button onClick={() => setEditing(true)} style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '2px 8px', borderRadius: 12, border: `1px solid ${C.border}`, background: '#FAFAF8', cursor: 'pointer', fontSize: 9, color: C.textSec, fontFamily: C.font }}>
      <Clock size={9} /> {days || 0}d
    </button>
  )
}

function AddButton({ onAdd, small }) {
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
      <button onClick={() => setOpen(!open)} style={{ width: small ? 22 : 26, height: small ? 22 : 26, borderRadius: '50%', border: `1.5px dashed ${open ? C.purple : 'rgba(0,0,0,0.12)'}`, background: open ? 'rgba(124,92,252,0.06)' : 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}>
        <Plus size={small ? 11 : 13} style={{ color: open ? C.purple : C.textTer }} />
      </button>
      {open && (
        <div style={{ position: 'absolute', top: small ? 28 : 32, left: '50%', transform: 'translateX(-50%)', background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: 5, zIndex: 20, width: 200 }}>
          {options.map(opt => {
            const Icon = opt.icon
            return (
              <button key={opt.key} onClick={() => { onAdd(opt.key); setOpen(false) }}
                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 8px', borderRadius: 6, border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left', fontFamily: C.font, transition: 'background 0.1s' }}
                onMouseOver={e => e.currentTarget.style.background = opt.bg} onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
                <div style={{ width: 22, height: 22, borderRadius: 5, background: opt.bg, border: `1px solid ${opt.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon size={11} style={{ color: opt.color }} />
                </div>
                <span style={{ fontSize: 11, color: C.text, fontWeight: 500 }}>{opt.label}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function VLine({ h = 14 }) {
  return <div style={{ width: 2, height: h, background: 'rgba(0,0,0,0.08)', margin: '0 auto' }} />
}

// Condition branching — renders YES/NO paths with sub-steps
function ConditionBranch({ step, stepIndex, selectedStep, onSelectStep, onAddSubStep, onDeleteSubStep, onSelectSubStep }) {
  const condLabel = CONDITION_LABELS[step.condition_type] || step.condition_type
  const yesSteps = step.yes_steps || []
  const noSteps = step.no_steps || []

  return (
    <div style={{ width: '100%', maxWidth: 320 }}>
      {/* Branch lines */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 0, marginTop: 4 }}>
        <div style={{ width: '50%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          {/* YES branch */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6, marginTop: 4 }}>
            <CheckCircle size={12} style={{ color: '#00B464' }} />
            <span style={{ fontSize: 10, fontWeight: 600, color: '#00B464', fontFamily: C.font }}>YES</span>
          </div>
          <div style={{ width: 2, height: 8, background: 'rgba(0,180,100,0.3)' }} />
          {yesSteps.map((sub, si) => (
            <div key={`y${si}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
              <StepCard step={sub} index={si} isSelected={false} onClick={() => onSelectSubStep(stepIndex, 'yes', si)} compact />
              <div style={{ width: 2, height: 8, background: 'rgba(0,180,100,0.2)' }} />
            </div>
          ))}
          <AddButton small onAdd={(type) => onAddSubStep(stepIndex, 'yes', type)} />
        </div>

        <div style={{ width: 1, background: 'rgba(0,0,0,0.04)', margin: '0 6px' }} />

        <div style={{ width: '50%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          {/* NO branch */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6, marginTop: 4 }}>
            <XCircle size={12} style={{ color: '#f87171' }} />
            <span style={{ fontSize: 10, fontWeight: 600, color: '#f87171', fontFamily: C.font }}>NO</span>
          </div>
          <div style={{ width: 2, height: 8, background: 'rgba(248,113,113,0.3)' }} />
          {noSteps.map((sub, si) => (
            <div key={`n${si}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
              <StepCard step={sub} index={si} isSelected={false} onClick={() => onSelectSubStep(stepIndex, 'no', si)} compact />
              <div style={{ width: 2, height: 8, background: 'rgba(248,113,113,0.2)' }} />
            </div>
          ))}
          <AddButton small onAdd={(type) => onAddSubStep(stepIndex, 'no', type)} />
        </div>
      </div>
    </div>
  )
}

export default function SequenceFlowView({ steps, selectedStep, onSelectStep, onAddStep, onDeleteStep, onUpdateDelay, onUpdateStep }) {
  const [dragIdx, setDragIdx] = useState(null)
  const [dragOver, setDragOver] = useState(null)

  function handleDragStart(e, i) { setDragIdx(i); e.dataTransfer.effectAllowed = 'move' }
  function handleDragOver(e, i) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOver(i) }
  function handleDragLeave() { setDragOver(null) }
  function handleDrop(e, i) {
    e.preventDefault()
    if (dragIdx === null || dragIdx === i) { setDragIdx(null); setDragOver(null); return }
    const updated = [...steps]
    const [moved] = updated.splice(dragIdx, 1)
    updated.splice(i > dragIdx ? i - 1 : i, 0, moved)
    const renumbered = updated.map((s, j) => ({ ...s, step: j + 1 }))
    if (onUpdateStep) onUpdateStep(renumbered)
    onSelectStep(i > dragIdx ? i - 1 : i)
    setDragIdx(null); setDragOver(null)
  }
  function handleDragEnd() { setDragIdx(null); setDragOver(null) }

  function handleAddSubStep(stepIndex, branch, type) {
    const templates = { email: 'Dear {firstName},\n\n\n\nKind regards,\n\n{signature}', linkedin: 'Hi {firstName}, ' }
    let newSub = {}
    if (type === 'email') newSub = { channel: 'email', subject: '', template: templates.email, approach: 'authority-led' }
    else if (type === 'linkedin_connect') newSub = { channel: 'linkedin', action: 'invite', template: templates.linkedin }
    else if (type === 'linkedin_message') newSub = { channel: 'linkedin', action: 'message', template: templates.linkedin }
    else newSub = { channel: 'email', template: templates.email }

    const updated = [...steps]
    const step = { ...updated[stepIndex] }
    if (branch === 'yes') step.yes_steps = [...(step.yes_steps || []), newSub]
    else step.no_steps = [...(step.no_steps || []), newSub]
    updated[stepIndex] = step
    if (onUpdateStep) onUpdateStep(updated)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '16px 12px 32px', minHeight: 300 }}>
      {steps.length === 0 && (
        <div style={{ textAlign: 'center', padding: '30px 16px' }}>
          <div style={{ fontSize: 13, color: C.textSec, fontFamily: C.font, marginBottom: 12 }}>Add your first step</div>
          <AddButton onAdd={onAddStep} />
        </div>
      )}

      {steps.map((step, i) => {
        const isCondition = step.type === 'condition'
        const isDragging = dragIdx === i
        const isDragTarget = dragOver === i && dragIdx !== i
        return (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', opacity: isDragging ? 0.4 : 1, transition: 'opacity 0.15s' }}
            draggable onDragStart={e => handleDragStart(e, i)} onDragOver={e => handleDragOver(e, i)} onDragLeave={handleDragLeave} onDrop={e => handleDrop(e, i)} onDragEnd={handleDragEnd}
          >
            {/* Drop indicator */}
            {isDragTarget && <div style={{ width: '80%', height: 3, background: '#7C5CFC', borderRadius: 2, marginBottom: 4 }} />}
            {/* Delay chip */}
            {i > 0 && (
              <>
                <VLine />
                <DelayChip days={step.delay_days} onChange={(d) => onUpdateDelay(i, d)} />
                <VLine />
              </>
            )}

            {/* Step card */}
            <StepCard step={step} index={i} isSelected={selectedStep === i} onClick={() => onSelectStep(i)} onDelete={() => onDeleteStep(i)} />

            {/* Condition branches */}
            {isCondition && (
              <ConditionBranch step={step} stepIndex={i} selectedStep={selectedStep} onSelectStep={onSelectStep} onAddSubStep={handleAddSubStep} onSelectSubStep={(si, branch, subIdx) => onSelectStep(i)} />
            )}

            {/* "+" button after step */}
            <VLine />
            <AddButton onAdd={(type) => onAddStep(type, i + 1)} />
          </div>
        )
      })}
    </div>
  )
}
