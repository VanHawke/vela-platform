// src/components/campaigns/SequenceFlowView.jsx — Visual flow diagram for campaign sequences
// Renders steps as connected nodes with yes/no branches for conditions.
import { Mail, Linkedin, GitBranch, Clock, ArrowDown } from 'lucide-react'

const NODE_STYLES = {
  email: { bg: '#F0F7FF', border: '#3B82F6', icon: '#3B82F6', label: 'Email' },
  linkedin: { bg: '#F0F9FF', border: '#0077B5', icon: '#0077B5', label: 'LinkedIn' },
  condition: { bg: '#FFFBEB', border: '#F59E0B', icon: '#F59E0B', label: 'Condition' },
}

const CONDITIONS = {
  opened: 'Email opened',
  not_opened: 'Not opened',
  clicked: 'Link clicked',
  not_clicked: 'Not clicked',
  replied: 'Replied',
  not_replied: 'No reply',
  no_reply: 'No reply',
}

function Connector({ label }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '4px 0' }}>
      <div style={{ width: 2, height: 16, background: 'rgba(0,0,0,0.12)' }} />
      {label && <span style={{ fontSize: 10, color: '#A0A0A0', padding: '2px 8px', background: '#F5F4F1', borderRadius: 10, margin: '2px 0' }}>{label}</span>}
      <div style={{ width: 2, height: 16, background: 'rgba(0,0,0,0.12)' }} />
    </div>
  )
}

function StepNode({ step, index, isSelected, onClick, conditions }) {
  const isCond = step.type === 'condition'
  const isLI = step.type === 'linkedin' || step.channel === 'linkedin'
  const type = isCond ? 'condition' : isLI ? 'linkedin' : 'email'
  const style = NODE_STYLES[type]
  const Icon = isCond ? GitBranch : isLI ? Linkedin : Mail
  const condMatch = conditions.find(c => c.step_number === index + 1)

  return (
    <div onClick={() => onClick?.(index)} style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'pointer',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '12px 20px',
        background: style.bg, border: `1.5px solid ${isSelected ? style.border : 'rgba(0,0,0,0.08)'}`,
        borderRadius: isCond ? 12 : 10, minWidth: 200, position: 'relative',
        boxShadow: isSelected ? `0 0 0 3px ${style.border}20` : 'none',
        transition: 'all 0.15s',
      }}>
        <div style={{ width: 28, height: 28, borderRadius: 6, background: `${style.icon}15`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon size={14} color={style.icon} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#0A0A0A' }}>
            Step {index + 1}: {style.label}
          </div>
          <div style={{ fontSize: 11, color: '#6B6B6B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {isCond
              ? CONDITIONS[step.condition_type] || step.condition_type || 'Condition'
              : step.subject || step.template?.slice(0, 40) || 'Draft pending'}
          </div>
        </div>
        {step.delay_days > 0 && (
          <span style={{ position: 'absolute', top: -8, right: -8, background: '#fff', border: '1px solid rgba(0,0,0,0.08)',
            borderRadius: 10, padding: '1px 6px', fontSize: 9, color: '#6B6B6B', display: 'flex', alignItems: 'center', gap: 2 }}>
            <Clock size={8} /> {step.delay_days}d
          </span>
        )}
      </div>

      {/* Condition branching display */}
      {isCond && (
        <div style={{ display: 'flex', gap: 40, marginTop: 8 }}>
          {/* YES path */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ width: 2, height: 12, background: '#06D6A0' }} />
            <span style={{ fontSize: 9, fontWeight: 600, color: '#06D6A0', padding: '2px 8px', background: '#ECFDF5', borderRadius: 8 }}>YES</span>
            <div style={{ width: 2, height: 8, background: '#06D6A0' }} />
            {step.yes_steps?.[0] && (
              <div style={{ padding: '6px 12px', background: '#ECFDF5', border: '1px solid #06D6A020', borderRadius: 8, fontSize: 10, color: '#059669', textAlign: 'center' }}>
                {step.yes_steps[0].channel === 'linkedin' ? '🔗 LinkedIn' : '📧 Email'}
              </div>
            )}
          </div>
          {/* NO path */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ width: 2, height: 12, background: '#F87171' }} />
            <span style={{ fontSize: 9, fontWeight: 600, color: '#F87171', padding: '2px 8px', background: '#FEF2F2', borderRadius: 8 }}>NO</span>
            <div style={{ width: 2, height: 8, background: '#F87171' }} />
            {step.no_steps?.[0] && (
              <div style={{ padding: '6px 12px', background: '#FEF2F2', border: '1px solid #F8717120', borderRadius: 8, fontSize: 10, color: '#DC2626', textAlign: 'center' }}>
                {step.no_steps[0].channel === 'linkedin' ? '🔗 LinkedIn' : '📧 Email'}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default function SequenceFlowView({ steps = [], conditions = [], selectedStep, onSelectStep, onAddStep }) {
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
      {/* Start node */}
      <div style={{ padding: '6px 16px', background: '#0A0A0A', color: '#fff', borderRadius: 20, fontSize: 11, fontWeight: 500, marginBottom: 4 }}>
        START
      </div>

      {steps.map((step, i) => (
        <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <Connector label={step.delay_days > 0 ? `Wait ${step.delay_days} day${step.delay_days > 1 ? 's' : ''}` : null} />
          <StepNode
            step={step} index={i}
            isSelected={selectedStep === i}
            onClick={onSelectStep}
            conditions={conditions}
          />
        </div>
      ))}

      {/* Add step buttons */}
      <Connector />
      {onAddStep && (
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => onAddStep('email')} style={{ padding: '4px 10px', borderRadius: 6, border: '1px dashed rgba(0,0,0,0.15)', background: 'transparent', color: '#6B6B6B', fontSize: 11, cursor: 'pointer' }}>+ Email</button>
          <button onClick={() => onAddStep('linkedin')} style={{ padding: '4px 10px', borderRadius: 6, border: '1px dashed rgba(0,0,0,0.15)', background: 'transparent', color: '#6B6B6B', fontSize: 11, cursor: 'pointer' }}>+ LinkedIn</button>
          <button onClick={() => onAddStep('condition')} style={{ padding: '4px 10px', borderRadius: 6, border: '1px dashed rgba(0,0,0,0.15)', background: 'transparent', color: '#6B6B6B', fontSize: 11, cursor: 'pointer' }}>+ Condition</button>
        </div>
      )}

      {/* End node */}
      <Connector />
      <div style={{ padding: '6px 16px', background: '#F5F4F1', color: '#6B6B6B', borderRadius: 20, fontSize: 11, fontWeight: 500 }}>
        END
      </div>
    </div>
  )
}
