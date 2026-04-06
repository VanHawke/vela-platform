// src/pages/SequenceDetail.jsx — Full sequence builder (Lemlist-style)
import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Mail, Linkedin, Plus, ChevronRight, Clock, Play, Pause, Users, BarChart3, Trash2, Save, Sparkles, ArrowLeft } from 'lucide-react'

const T = {
  bg: '#000000', surface: 'rgba(255,255,255,0.04)', surfaceHover: 'rgba(255,255,255,0.07)',
  border: 'rgba(255,255,255,0.08)', borderHover: 'rgba(255,255,255,0.14)',
  text: 'rgba(255,255,255,0.95)', textSecondary: 'rgba(255,255,255,0.55)', textTertiary: 'rgba(255,255,255,0.32)',
  font: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif",
  purple: '#7C5CFC', teal: '#00D4AA', red: '#FF4444', amber: '#F59E0B', green: '#4ADE80',
}
const glass = { background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(20px)', border: `1px solid ${T.border}`, borderRadius: 12 }

const CHANNELS = [
  { id: 'email', label: 'Email', icon: Mail, color: T.purple },
  { id: 'linkedin', label: 'LinkedIn', icon: Linkedin, color: '#0077B5' },
]
const APPROACHES = ['authority-led', 'scarcity-led', 'social-proof', 'reciprocity', 'data-led', 'intelligence-led', 'competitive-led', 'relationship-led']
const PSYCHOLOGY = ['reciprocity', 'scarcity', 'authority', 'social_proof', 'commitment', 'liking', 'strategic_withdrawal', 'pattern_interrupt']

const VARIABLES = ['{firstName}','{lastName}','{companyName}','{category}','{revenue}','{ceo}','{cmo}','{cto}','{competitors}','{recentNews}','{raceWindow}','{fundingRound}','{prevSubject}']

export default function SequenceDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [sequence, setSequence] = useState(null)
  const [steps, setSteps] = useState([])
  const [enrollments, setEnrollments] = useState([])
  const [selectedStep, setSelectedStep] = useState(0)
  const [tab, setTab] = useState('sequence')
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  useEffect(() => { if (id && id !== 'new') loadSequence() }, [id])

  async function loadSequence() {
    const { data } = await supabase.from('kiko_sequences').select('*').eq('id', id).single()
    if (data) { setSequence(data); setSteps(data.steps || []) }
    const { data: enr } = await supabase.from('kiko_sequence_enrollments').select('*').eq('sequence_id', id).order('created_at', { ascending: false })
    setEnrollments(enr || [])
  }

  async function saveSequence() {
    setSaving(true)
    if (id === 'new') {
      const { data } = await supabase.from('kiko_sequences').insert({ name: sequence?.name || 'New Sequence', description: sequence?.description || '', target_persona: sequence?.target_persona || '', steps, is_active: true }).select().single()
      if (data) navigate(`/sequences/${data.id}`, { replace: true })
    } else {
      await supabase.from('kiko_sequences').update({ name: sequence?.name, description: sequence?.description, target_persona: sequence?.target_persona, steps, updated_at: new Date().toISOString() }).eq('id', id)
    }
    setSaving(false); setDirty(false)
  }

  function addStep(channel = 'email') {
    const newStep = { step: steps.length + 1, delay_days: steps.length === 0 ? 0 : 3, channel, approach: 'authority-led', psychology: 'reciprocity', subject: '', template: '' }
    setSteps([...steps, newStep]); setSelectedStep(steps.length); setDirty(true)
  }

  function updateStep(idx, field, value) {
    const updated = [...steps]; updated[idx] = { ...updated[idx], [field]: value }
    setSteps(updated); setDirty(true)
  }

  function deleteStep(idx) {
    const updated = steps.filter((_, i) => i !== idx).map((s, i) => ({ ...s, step: i + 1 }))
    setSteps(updated); if (selectedStep >= updated.length) setSelectedStep(Math.max(0, updated.length - 1)); setDirty(true)
  }

  async function askKikoToWrite(idx) {
    const step = steps[idx]; if (!step) return
    updateStep(idx, 'template', '⏳ Kiko is writing...')
    try {
      const res = await fetch('/api/kiko', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `Write the email body for step ${step.step} of an outreach sequence. Channel: ${step.channel}. Approach: ${step.approach}. Psychology: ${step.psychology}. Target: ${sequence?.target_persona || 'C-suite'}. Subject: ${step.subject || 'Haas F1 partnership'}. Keep to 2 paragraphs. No sign-off. Return ONLY the email text.`, stream: false })
      })
      const data = await res.json()
      const text = data?.content || data?.message || data?.choices?.[0]?.message?.content || 'Could not generate. Try again.'
      updateStep(idx, 'template', text)
    } catch { updateStep(idx, 'template', 'Error generating. Please write manually.') }
  }

  const currentStep = steps[selectedStep]
  const tabs = [
    { id: 'sequence', label: 'Sequence' },
    { id: 'leads', label: 'Lead List', count: enrollments.length },
    { id: 'overview', label: 'Overview' },
  ]

  if (id === 'new' && !sequence) {
    setSequence({ name: '', description: '', target_persona: '' })
  }

  return (
    <div style={{ padding: '20px 28px', fontFamily: T.font, color: T.text, maxWidth: 1400, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <button onClick={() => navigate('/sequences')} style={{ background: 'none', border: 'none', color: T.textSecondary, cursor: 'pointer', padding: 4 }}><ArrowLeft size={18} /></button>
        <input value={sequence?.name || ''} onChange={e => { setSequence({ ...sequence, name: e.target.value }); setDirty(true) }} placeholder="Sequence name..." style={{ fontSize: 22, fontWeight: 500, background: 'none', border: 'none', color: T.text, fontFamily: T.font, outline: 'none', flex: 1 }} />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {dirty && <span style={{ fontSize: 11, color: T.amber }}>Unsaved</span>}
          <button onClick={saveSequence} disabled={saving} style={{ padding: '7px 16px', borderRadius: 6, border: 'none', background: T.purple, color: '#fff', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: T.font, opacity: saving ? 0.5 : 1, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Save size={13} /> {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {/* Meta */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <input value={sequence?.target_persona || ''} onChange={e => { setSequence({ ...sequence, target_persona: e.target.value }); setDirty(true) }} placeholder="Target persona (e.g. CISO at $500M-$5B tech)" style={{ flex: 1, padding: '8px 12px', borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface, color: T.textSecondary, fontSize: 12, fontFamily: T.font, outline: 'none' }} />
        <input value={sequence?.description || ''} onChange={e => { setSequence({ ...sequence, description: e.target.value }); setDirty(true) }} placeholder="Description" style={{ flex: 1, padding: '8px 12px', borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface, color: T.textSecondary, fontSize: 12, fontFamily: T.font, outline: 'none' }} />
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 16, background: T.surface, borderRadius: 8, padding: 3, width: 'fit-content' }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: '7px 16px', borderRadius: 6, border: 'none', cursor: 'pointer', fontFamily: T.font, fontSize: 12, background: tab === t.id ? 'rgba(255,255,255,0.08)' : 'transparent', color: tab === t.id ? T.text : T.textSecondary, display: 'flex', alignItems: 'center', gap: 5 }}>
            {t.label} {t.count !== undefined && <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 3, background: 'rgba(124,92,252,0.1)', color: T.purple }}>{t.count}</span>}
          </button>
        ))}
      </div>

      {/* Sequence Builder Tab */}
      {tab === 'sequence' && (
        <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 16, minHeight: 500 }}>
          {/* LEFT — Visual Flow */}
          <div style={{ ...glass, padding: 16, overflowY: 'auto' }}>
            <div style={{ textAlign: 'center', padding: '8px 0 16px', fontSize: 11, color: T.textTertiary, borderBottom: `1px solid ${T.border}`, marginBottom: 12 }}>Sequence start</div>
            {steps.map((step, idx) => {
              const ch = CHANNELS.find(c => c.id === step.channel) || CHANNELS[0]
              const Icon = ch.icon
              const isSel = idx === selectedStep
              return (
                <div key={idx}>
                  {/* Delay */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '6px 0' }}>
                    <div style={{ width: 1, height: 16, background: T.border }} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center', marginBottom: 4 }}>
                    <Clock size={10} style={{ color: T.textTertiary }} />
                    <select value={step.delay_days} onChange={e => updateStep(idx, 'delay_days', parseInt(e.target.value))} style={{ background: 'transparent', border: 'none', color: T.amber, fontSize: 11, fontFamily: T.font, cursor: 'pointer', outline: 'none' }}>
                      <option value={0}>Send immediately</option>
                      {[1,2,3,4,5,7,10,14].map(d => <option key={d} value={d} style={{ background: '#111' }}>Wait {d} day{d > 1 ? 's' : ''}</option>)}
                    </select>
                  </div>
                  {/* Step Card */}
                  <div onClick={() => setSelectedStep(idx)} style={{ ...glass, padding: '10px 12px', cursor: 'pointer', borderColor: isSel ? T.purple : T.border, background: isSel ? 'rgba(124,92,252,0.06)' : glass.background, transition: 'all 0.15s' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <div style={{ width: 24, height: 24, borderRadius: 6, background: `${ch.color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Icon size={12} style={{ color: ch.color }} />
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 500, color: T.text, flex: 1 }}>{ch.label}</span>
                      <span style={{ fontSize: 10, color: T.textTertiary }}>Step {idx + 1}</span>
                      <button onClick={e => { e.stopPropagation(); deleteStep(idx) }} style={{ background: 'none', border: 'none', color: T.textTertiary, cursor: 'pointer', padding: 2 }}><Trash2 size={11} /></button>
                    </div>
                    {step.subject && <div style={{ fontSize: 11, color: T.textSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{step.subject}</div>}
                  </div>
                </div>
              )
            })}
            {/* Add step buttons */}
            <div style={{ display: 'flex', gap: 6, justifyContent: 'center', marginTop: 16, paddingTop: 12, borderTop: `1px solid ${T.border}` }}>
              <button onClick={() => addStep('email')} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface, color: T.textSecondary, fontSize: 11, cursor: 'pointer', fontFamily: T.font }}><Plus size={11} /> Email</button>
              <button onClick={() => addStep('linkedin')} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface, color: T.textSecondary, fontSize: 11, cursor: 'pointer', fontFamily: T.font }}><Plus size={11} /> LinkedIn</button>
            </div>
          </div>

          {/* RIGHT — Step Editor */}
          <div style={{ ...glass, padding: 20 }}>
            {currentStep ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                  {(() => { const Icon = (CHANNELS.find(c => c.id === currentStep.channel) || CHANNELS[0]).icon; return <Icon size={16} style={{ color: (CHANNELS.find(c => c.id === currentStep.channel) || CHANNELS[0]).color }} /> })()}
                  <span style={{ fontSize: 14, fontWeight: 500, color: T.text }}>Step {selectedStep + 1} · {currentStep.channel === 'email' ? 'Send automatic email' : 'LinkedIn message'}</span>
                </div>

                {/* Channel selector */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                  {CHANNELS.map(ch => (
                    <button key={ch.id} onClick={() => updateStep(selectedStep, 'channel', ch.id)} style={{ padding: '5px 12px', borderRadius: 5, border: `1px solid ${currentStep.channel === ch.id ? ch.color : T.border}`, background: currentStep.channel === ch.id ? `${ch.color}10` : 'transparent', color: currentStep.channel === ch.id ? ch.color : T.textTertiary, fontSize: 11, cursor: 'pointer', fontFamily: T.font, display: 'flex', alignItems: 'center', gap: 5 }}>
                      <ch.icon size={12} /> {ch.label}
                    </button>
                  ))}
                </div>

                {/* Approach + Psychology */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 10, color: T.textTertiary, display: 'block', marginBottom: 3 }}>Approach</label>
                    <select value={currentStep.approach || ''} onChange={e => updateStep(selectedStep, 'approach', e.target.value)} style={{ width: '100%', padding: '6px 8px', borderRadius: 5, border: `1px solid ${T.border}`, background: T.surface, color: T.textSecondary, fontSize: 11, fontFamily: T.font, outline: 'none' }}>
                      {APPROACHES.map(a => <option key={a} value={a} style={{ background: '#111' }}>{a}</option>)}
                    </select>
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 10, color: T.textTertiary, display: 'block', marginBottom: 3 }}>Psychology (Cialdini)</label>
                    <select value={currentStep.psychology || ''} onChange={e => updateStep(selectedStep, 'psychology', e.target.value)} style={{ width: '100%', padding: '6px 8px', borderRadius: 5, border: `1px solid ${T.border}`, background: T.surface, color: T.textSecondary, fontSize: 11, fontFamily: T.font, outline: 'none' }}>
                      {PSYCHOLOGY.map(p => <option key={p} value={p} style={{ background: '#111' }}>{p.replace(/_/g, ' ')}</option>)}
                    </select>
                  </div>
                </div>

                {/* Subject line (email only) */}
                {currentStep.channel === 'email' && (
                  <div style={{ marginBottom: 14 }}>
                    <label style={{ fontSize: 10, color: T.textTertiary, display: 'block', marginBottom: 3 }}>Subject line</label>
                    <input value={currentStep.subject || ''} onChange={e => updateStep(selectedStep, 'subject', e.target.value)} placeholder="Haas F1 Team — Exclusive {category} Partnership" style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface, color: T.text, fontSize: 13, fontFamily: T.font, outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                )}

                {/* Body / Template */}
                <div style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                    <label style={{ fontSize: 10, color: T.textTertiary }}>{currentStep.channel === 'email' ? 'Email body' : 'LinkedIn message'}</label>
                    <span style={{ fontSize: 10, color: T.textTertiary }}>{(currentStep.template || '').length} chars{currentStep.channel === 'linkedin' ? ' / 300 max' : ''}</span>
                  </div>
                  <textarea value={currentStep.template || ''} onChange={e => updateStep(selectedStep, 'template', e.target.value)} placeholder={currentStep.channel === 'email' ? 'Dear {firstName},\n\nAt this level of commercial engagement...' : 'Hi {firstName}, I advise F1 teams on technology partnerships...'} rows={currentStep.channel === 'email' ? 12 : 4} maxLength={currentStep.channel === 'linkedin' ? 300 : undefined} style={{ width: '100%', padding: '10px 12px', borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface, color: T.text, fontSize: 12, fontFamily: T.font, outline: 'none', resize: 'vertical', lineHeight: 1.6, boxSizing: 'border-box' }} />
                </div>

                {/* Variables */}
                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 10, color: T.textTertiary, display: 'block', marginBottom: 4 }}>Insert variable:</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {VARIABLES.map(v => (
                      <button key={v} onClick={() => updateStep(selectedStep, 'template', (currentStep.template || '') + v)} style={{ padding: '3px 8px', borderRadius: 4, border: `1px solid ${T.border}`, background: 'transparent', color: T.purple, fontSize: 10, cursor: 'pointer', fontFamily: T.font }}>{v}</button>
                    ))}
                  </div>
                </div>

                {/* Ask Kiko */}
                <button onClick={() => askKikoToWrite(selectedStep)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 6, border: `1px solid ${T.purple}40`, background: `${T.purple}10`, color: T.purple, fontSize: 12, cursor: 'pointer', fontFamily: T.font, width: '100%', justifyContent: 'center' }}>
                  <Sparkles size={14} /> Ask Kiko to write this step
                </button>
              </>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 300, color: T.textTertiary, fontSize: 13, gap: 12 }}>
                <Mail size={32} style={{ opacity: 0.3 }} />
                <span>Add a step to start building your sequence</span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => addStep('email')} style={{ padding: '7px 14px', borderRadius: 6, border: `1px solid ${T.purple}`, background: `${T.purple}10`, color: T.purple, fontSize: 12, cursor: 'pointer', fontFamily: T.font }}><Plus size={12} /> Add Email Step</button>
                  <button onClick={() => addStep('linkedin')} style={{ padding: '7px 14px', borderRadius: 6, border: '1px solid #0077B5', background: 'rgba(0,119,181,0.1)', color: '#0077B5', fontSize: 12, cursor: 'pointer', fontFamily: T.font }}><Plus size={12} /> Add LinkedIn Step</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Leads Tab */}
      {tab === 'leads' && (
        <div style={{ ...glass, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: `1px solid ${T.border}`, display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 13, fontWeight: 500 }}>Enrolled Contacts</span>
            <span style={{ fontSize: 11, color: T.textTertiary }}>{enrollments.length} leads</span>
          </div>
          {enrollments.length ? enrollments.map(e => (
            <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: `1px solid ${T.border}`, fontSize: 12 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: e.status === 'active' ? T.teal : e.status === 'replied' ? T.green : e.status === 'bounced' ? T.red : T.textTertiary }} />
              <div style={{ flex: 1 }}>
                <div style={{ color: T.text }}>{e.contact_name || e.contact_email}</div>
                <div style={{ fontSize: 10, color: T.textTertiary }}>{e.company}</div>
              </div>
              <div style={{ fontSize: 11, color: T.textSecondary }}>Step {e.current_step}/{steps.length}</div>
              <div style={{ width: 60, height: 3, background: T.border, borderRadius: 2 }}>
                <div style={{ height: '100%', borderRadius: 2, background: e.status === 'active' ? T.teal : T.green, width: `${(e.current_step / Math.max(steps.length, 1)) * 100}%` }} />
              </div>
              <span style={{ fontSize: 10, color: T.textTertiary }}>{e.status}</span>
            </div>
          )) : <div style={{ padding: 40, textAlign: 'center', color: T.textTertiary, fontSize: 12 }}>No leads enrolled. Go to Kiko and say "Start a sequence for [company] with [email]"</div>}
        </div>
      )}

      {/* Overview Tab */}
      {tab === 'overview' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <div style={{ ...glass, padding: 20, textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 500, color: T.text }}>{enrollments.length}</div>
            <div style={{ fontSize: 11, color: T.textTertiary }}>Total Enrolled</div>
          </div>
          <div style={{ ...glass, padding: 20, textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 500, color: T.teal }}>{enrollments.filter(e => e.status === 'active').length}</div>
            <div style={{ fontSize: 11, color: T.textTertiary }}>Active</div>
          </div>
          <div style={{ ...glass, padding: 20, textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 500, color: T.green }}>{enrollments.filter(e => e.status === 'replied').length}</div>
            <div style={{ fontSize: 11, color: T.textTertiary }}>Replied</div>
          </div>
          <div style={{ ...glass, padding: 20, textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 500, color: T.red }}>{enrollments.filter(e => e.status === 'bounced').length}</div>
            <div style={{ fontSize: 11, color: T.textTertiary }}>Bounced</div>
          </div>
          <div style={{ ...glass, padding: 20, textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 500, color: T.amber }}>{enrollments.length > 0 ? Math.round(enrollments.filter(e => e.status === 'replied').length / enrollments.length * 100) : 0}%</div>
            <div style={{ fontSize: 11, color: T.textTertiary }}>Reply Rate</div>
          </div>
          <div style={{ ...glass, padding: 20, textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 500, color: T.text }}>{steps.length}</div>
            <div style={{ fontSize: 11, color: T.textTertiary }}>Steps</div>
          </div>
        </div>
      )}
    </div>
  )
}
