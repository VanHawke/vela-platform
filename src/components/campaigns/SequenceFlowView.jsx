// src/components/campaigns/SequenceFlowView.jsx — Visual flow diagram for campaign sequences
// Renders steps as connected nodes with drag-to-reorder + yes/no branches for conditions.
import { useState, useRef } from 'react'
import { Mail, Linkedin, GitBranch, Clock, GripVertical, Trash2 } from 'lucide-react'

const NODE_STYLES = {
  email: { bg: '#F0F7FF', border: '#3B82F6', icon: '#3B82F6', label: 'Email' },
  linkedin: { bg: '#F0F9FF', border: '#0077B5', icon: '#0077B5', label: 'LinkedIn' },
  condition: { bg: '#FFFBEB', border: '#F59E0B', icon: '#F59E0B', label: 'Condition' },
}

const CONDITIONS = {
  opened: 'Email opened', not_opened: 'Not opened',
  clicked: 'Link clicked', not_clicked: 'Not clicked',
  replied: 'Replied', not_replied: 'No reply', no_reply: 'No reply',
}

function Connector({ label, isDropTarget, onDragOver, onDrop }) {
  return (
    <div
      onDragOver={onDragOver} onDrop={onDrop}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '4px 0', minHeight: 32, transition: 'all 0.15s' }}
    >
      <div style={{ width: 2, height: isDropTarget ? 4 : 16, background: isDropTarget ? '#3B82F6' : 'rgba(0,0,0,0.12)', transition: 'all 0.15s' }} />
      {isDropTarget && (
        <div style={{ width: 120, height: 3, borderRadius: 2, background: '#3B82F6', margin: '4px 0', boxShadow: '0 0 8px #3B82F640' }} />
      )}
      {label && !isDropTarget && <span style={{ fontSize: 10, color: '#A0A0A0', padding: '2px 8px', background: '#F5F4F1', borderRadius: 10, margin: '2px 0' }}>{label}</span>}
      <div style={{ width: 2, height: isDropTarget ? 4 : 16, background: isDropTarget ? '#3B82F6' : 'rgba(0,0,0,0.12)', transition: 'all 0.15s' }} />
    </div>
  )
}

function StepNode({ step, index, isSelected, isDragging, onClick, onDragStart, onDragEnd, onDelete }) {
  const isCond = step.type === 'condition'
  const isLI = step.type === 'linkedin' || step.channel === 'linkedin'
  const type = isCond ? 'condition' : isLI ? 'linkedin' : 'email'
  const s = NODE_STYLES[type]
  const Icon = isCond ? GitBranch : isLI ? Linkedin : Mail

  return (
    <div
      draggable
      onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; onDragStart?.(index) }}
      onDragEnd={onDragEnd}
      onClick={() => onClick?.(index)}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'grab',
        opacity: isDragging ? 0.4 : 1, transition: 'opacity 0.15s',
      }}
    >
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px',
        background: s.bg, border: `1.5px solid ${isSelected ? s.border : 'rgba(0,0,0,0.08)'}`,
        borderRadius: isCond ? 12 : 10, minWidth: 220, position: 'relative',
        boxShadow: isSelected ? `0 0 0 3px ${s.border}20` : '0 1px 3px rgba(0,0,0,0.04)',
        transition: 'all 0.15s',
      }}>
        {/* Drag handle */}
        <GripVertical size={14} color="#C0C0C0" style={{ cursor: 'grab', flexShrink: 0 }} />
        <div style={{ width: 26, height: 26, borderRadius: 6, background: `${s.icon}12`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon size={13} color={s.icon} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#0A0A0A' }}>
            Step {index + 1}: {s.label}
          </div>
          <div style={{ fontSize: 11, color: '#6B6B6B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {isCond ? CONDITIONS[step.condition_type] || step.condition_type || 'Condition'
              : step.subject || step.template?.slice(0, 40) || 'Draft pending'}
          </div>
        </div>
        {/* Delete button */}
        <button onClick={e => { e.stopPropagation(); onDelete?.(index) }} style={{
          width: 22, height: 22, borderRadius: 4, border: 'none', background: 'transparent',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#C0C0C0', flexShrink: 0, transition: 'color 0.15s',
        }} onMouseOver={e => e.currentTarget.style.color = '#EF4444'}
           onMouseOut={e => e.currentTarget.style.color = '#C0C0C0'}>
          <Trash2 size={12} />
        </button>
        {step.delay_days > 0 && (
          <span style={{ position: 'absolute', top: -8, right: -8, background: '#fff', border: '1px solid rgba(0,0,0,0.08)',
            borderRadius: 10, padding: '1px 6px', fontSize: 9, color: '#6B6B6B', display: 'flex', alignItems: 'center', gap: 2 }}>
            <Clock size={8} /> {step.delay_days}d
          </span>
        )}
      </div>
      {isCond && (
        <div style={{ display: 'flex', gap: 40, marginTop: 8 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ width: 2, height: 12, background: '#06D6A0' }} />
            <span style={{ fontSize: 9, fontWeight: 600, color: '#06D6A0', padding: '2px 8px', background: '#ECFDF5', borderRadius: 8 }}>YES</span>
            <div style={{ width: 2, height: 8, background: '#06D6A0' }} />
            {step.yes_steps?.[0] && (
              <div style={{ padding: '6px 12px', background: '#ECFDF5', border: '1px solid #06D6A020', borderRadius: 8, fontSize: 10, color: '#059669' }}>
                {step.yes_steps[0].channel === 'linkedin' ? '🔗 LinkedIn' : '📧 Email'}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ width: 2, height: 12, background: '#F87171' }} />
            <span style={{ fontSize: 9, fontWeight: 600, color: '#F87171', padding: '2px 8px', background: '#FEF2F2', borderRadius: 8 }}>NO</span>
            <div style={{ width: 2, height: 8, background: '#F87171' }} />
            {step.no_steps?.[0] && (
              <div style={{ padding: '6px 12px', background: '#FEF2F2', border: '1px solid #F8717120', borderRadius: 8, fontSize: 10, color: '#DC2626' }}>
                {step.no_steps[0].channel === 'linkedin' ? '🔗 LinkedIn' : '📧 Email'}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default function SequenceFlowView({ steps = [], conditions = [], selectedStep, onSelectStep, onAddStep, onReorder, onDeleteStep }) {
  const [dragIndex, setDragIndex] = useState(null)
  const [dropTarget, setDropTarget] = useState(null)

  function handleDragOver(e, targetIndex) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (targetIndex !== dropTarget) setDropTarget(targetIndex)
  }

  function handleDrop(e, targetIndex) {
    e.preventDefault()
    if (dragIndex !== null && dragIndex !== targetIndex && onReorder) {
      // Reorder: remove from dragIndex, insert at targetIndex
      const reordered = [...steps]
      const [moved] = reordered.splice(dragIndex, 1)
      const insertAt = targetIndex > dragIndex ? targetIndex - 1 : targetIndex
      reordered.splice(insertAt, 0, moved)
      // Renumber steps
      const renumbered = reordered.map((s, i) => ({ ...s, step: i + 1 }))
      onReorder(renumbered)
    }
    setDragIndex(null)
    setDropTarget(null)
  }

  function handleDragEnd() { setDragIndex(null); setDropTarget(null) }

  if (!steps.length) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 60, color: '#A0A0A0', fontSize: 13 }}>
        <GitBranch size={32} style={{ marginBottom: 12, opacity: 0.3 }} />
        <p>No steps yet. Add your first step to build the sequence flow.</p>
        {onAddStep && (
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button onClick={() => onAddStep('email')} style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #3B82F620', background: '#F0F7FF', color: '#3B82F6', fontSize: 12, cursor: 'pointer' }}>+ Email</button>
            <button onClick={() => onAddStep('linkedin')} style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #0077B520', background: '#F0F9FF', color: '#0077B5', fontSize: 12, cursor: 'pointer' }}>+ LinkedIn</button>
            <button onClick={() => onAddStep('condition')} style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #F59E0B20', background: '#FFFBEB', color: '#F59E0B', fontSize: 12, cursor: 'pointer' }}>+ Condition</button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '24px 16px', overflowY: 'auto' }}>
      <div style={{ padding: '6px 16px', background: '#0A0A0A', color: '#fff', borderRadius: 20, fontSize: 11, fontWeight: 500, marginBottom: 4 }}>
        START
      </div>

      {steps.map((step, i) => (
        <div key={`step-${i}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <Connector
            label={step.delay_days > 0 ? `Wait ${step.delay_days} day${step.delay_days > 1 ? 's' : ''}` : null}
            isDropTarget={dropTarget === i}
            onDragOver={e => handleDragOver(e, i)}
            onDrop={e => handleDrop(e, i)}
          />
          <StepNode
            step={step} index={i}
            isSelected={selectedStep === i}
            isDragging={dragIndex === i}
            onClick={onSelectStep}
            onDragStart={setDragIndex}
            onDragEnd={handleDragEnd}
            onDelete={onDeleteStep}
          />
        </div>
      ))}

      {/* Trailing drop zone */}
      <Connector
        isDropTarget={dropTarget === steps.length}
        onDragOver={e => handleDragOver(e, steps.length)}
        onDrop={e => handleDrop(e, steps.length)}
      />

      {onAddStep && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          <button onClick={() => onAddStep('email')} style={{ padding: '4px 10px', borderRadius: 6, border: '1px dashed rgba(0,0,0,0.15)', background: 'transparent', color: '#6B6B6B', fontSize: 11, cursor: 'pointer' }}>+ Email</button>
          <button onClick={() => onAddStep('linkedin')} style={{ padding: '4px 10px', borderRadius: 6, border: '1px dashed rgba(0,0,0,0.15)', background: 'transparent', color: '#6B6B6B', fontSize: 11, cursor: 'pointer' }}>+ LinkedIn</button>
          <button onClick={() => onAddStep('condition')} style={{ padding: '4px 10px', borderRadius: 6, border: '1px dashed rgba(0,0,0,0.15)', background: 'transparent', color: '#6B6B6B', fontSize: 11, cursor: 'pointer' }}>+ Condition</button>
        </div>
      )}

      <Connector />
      <div style={{ padding: '6px 16px', background: '#F5F4F1', color: '#6B6B6B', borderRadius: 20, fontSize: 11, fontWeight: 500 }}>
        END
      </div>
    </div>
  )
}
