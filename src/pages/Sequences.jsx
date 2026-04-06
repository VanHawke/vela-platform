// src/pages/Sequences.jsx — Outreach Sequence Manager
// Visual UI for creating, managing, and analyzing automated email sequences
import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { Play, Pause, StopCircle, Plus, ChevronRight, Mail, Linkedin, Users, BarChart3, Clock, CheckCircle, XCircle, AlertTriangle } from 'lucide-react'

const T = {
  bg: '#000000', surface: 'rgba(255,255,255,0.04)', surfaceHover: 'rgba(255,255,255,0.07)',
  border: 'rgba(255,255,255,0.08)', borderHover: 'rgba(255,255,255,0.14)',
  text: 'rgba(255,255,255,0.95)', textSecondary: 'rgba(255,255,255,0.55)', textTertiary: 'rgba(255,255,255,0.32)',
  font: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif",
  purple: '#7C5CFC', teal: '#00D4AA', red: '#FF4444', amber: '#F59E0B', green: '#4ADE80',
}

const glass = {
  background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
  border: `1px solid ${T.border}`, borderRadius: 12,
}

// ── Stats Card ──
function StatCard({ icon: Icon, label, value, color }) {
  return (
    <div style={{ ...glass, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 14, flex: 1, minWidth: 160 }}>
      <div style={{ width: 36, height: 36, borderRadius: 8, background: `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={18} style={{ color }} />
      </div>
      <div>
        <div style={{ fontSize: 22, fontWeight: 500, color: T.text, fontFamily: T.font }}>{value}</div>
        <div style={{ fontSize: 11, color: T.textTertiary, fontFamily: T.font }}>{label}</div>
      </div>
    </div>
  )
}

// ── Sequence Card ──
function SequenceCard({ seq, enrollments, onSelect, selected }) {
  const enrolled = enrollments.filter(e => e.sequence_id === seq.id)
  const active = enrolled.filter(e => e.status === 'active').length
  const replied = enrolled.filter(e => e.status === 'replied').length
  const total = enrolled.length
  const steps = seq.steps || []
  const isSel = selected === seq.id

  return (
    <div onClick={() => onSelect(seq.id)} style={{ ...glass, padding: '16px 18px', cursor: 'pointer', borderColor: isSel ? T.purple : T.border, background: isSel ? 'rgba(124,92,252,0.06)' : glass.background, transition: 'all 0.15s' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 500, color: T.text, fontFamily: T.font }}>{seq.name}</div>
          <div style={{ fontSize: 11, color: T.textTertiary, fontFamily: T.font, marginTop: 2 }}>{seq.target_persona}</div>
        </div>
        <div style={{ fontSize: 10, padding: '3px 8px', borderRadius: 4, background: seq.is_active ? 'rgba(74,222,128,0.1)' : 'rgba(255,68,68,0.1)', color: seq.is_active ? T.green : T.red, fontFamily: T.font }}>
          {seq.is_active ? 'Active' : 'Paused'}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        {steps.map((s, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 22, height: 22, borderRadius: 6, background: s.channel === 'linkedin' ? 'rgba(0,119,181,0.15)' : 'rgba(124,92,252,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {s.channel === 'linkedin' ? <Linkedin size={11} style={{ color: '#0077B5' }} /> : <Mail size={11} style={{ color: T.purple }} />}
            </div>
            {i < steps.length - 1 && <ChevronRight size={10} style={{ color: T.textTertiary }} />}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 16, fontSize: 11, color: T.textSecondary, fontFamily: T.font }}>
        <span>{total} enrolled</span>
        <span style={{ color: T.teal }}>{active} active</span>
        <span style={{ color: T.green }}>{replied} replied</span>
      </div>
    </div>
  )
}

// ── Enrollment Row ──
function EnrollmentRow({ e, sequence, onPause, onCancel }) {
  const steps = sequence?.steps || []
  const total = steps.length
  const statusColors = { active: T.teal, replied: T.green, bounced: T.red, paused: T.amber, completed: T.textTertiary, cancelled: T.textTertiary }
  const statusIcons = { active: Play, replied: CheckCircle, bounced: XCircle, paused: Pause, completed: CheckCircle, cancelled: StopCircle }
  const Icon = statusIcons[e.status] || AlertTriangle
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: `1px solid ${T.border}`, fontSize: 13, fontFamily: T.font }}>
      <Icon size={14} style={{ color: statusColors[e.status] || T.textTertiary, flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: T.text, fontWeight: 400 }}>{e.contact_name || e.contact_email}</div>
        <div style={{ fontSize: 11, color: T.textTertiary, marginTop: 1 }}>{e.company}</div>
      </div>
      <div style={{ width: 90, textAlign: 'center' }}>
        <div style={{ fontSize: 12, color: T.textSecondary }}>Step {e.current_step}/{total}</div>
        <div style={{ height: 3, background: T.border, borderRadius: 2, marginTop: 4 }}>
          <div style={{ height: '100%', borderRadius: 2, background: statusColors[e.status], width: `${(e.current_step / Math.max(total, 1)) * 100}%`, transition: 'width 0.3s' }} />
        </div>
      </div>
      <div style={{ width: 80, textAlign: 'right', fontSize: 11, color: T.textTertiary }}>
        {e.next_send_at ? new Date(e.next_send_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—'}
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        {e.status === 'active' && (
          <button onClick={() => onPause(e.id)} style={{ padding: '4px 8px', borderRadius: 4, border: `1px solid ${T.border}`, background: 'transparent', color: T.textSecondary, fontSize: 10, cursor: 'pointer', fontFamily: T.font }}>Pause</button>
        )}
        {(e.status === 'active' || e.status === 'paused') && (
          <button onClick={() => onCancel(e.id)} style={{ padding: '4px 8px', borderRadius: 4, border: `1px solid rgba(255,68,68,0.2)`, background: 'transparent', color: T.red, fontSize: 10, cursor: 'pointer', fontFamily: T.font }}>Cancel</button>
        )}
      </div>
    </div>
  )
}

// ── LinkedIn Queue Item ──
function LinkedInItem({ item, onMarkSent, onSkip }) {
  return (
    <div style={{ ...glass, padding: '14px 16px', marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 500, color: T.text, fontFamily: T.font }}>{item.contact_name}</div>
          <div style={{ fontSize: 11, color: T.textTertiary, fontFamily: T.font }}>{item.company} · {item.message_type}</div>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={() => { navigator.clipboard.writeText(item.message); }} style={{ padding: '4px 10px', borderRadius: 4, border: `1px solid ${T.border}`, background: 'transparent', color: T.purple, fontSize: 10, cursor: 'pointer', fontFamily: T.font }}>Copy</button>
          <button onClick={() => onMarkSent(item.id)} style={{ padding: '4px 10px', borderRadius: 4, border: `1px solid rgba(74,222,128,0.2)`, background: 'transparent', color: T.green, fontSize: 10, cursor: 'pointer', fontFamily: T.font }}>Sent</button>
          <button onClick={() => onSkip(item.id)} style={{ padding: '4px 10px', borderRadius: 4, border: `1px solid ${T.border}`, background: 'transparent', color: T.textTertiary, fontSize: 10, cursor: 'pointer', fontFamily: T.font }}>Skip</button>
        </div>
      </div>
      <div style={{ fontSize: 12, color: T.textSecondary, fontFamily: T.font, lineHeight: 1.5, padding: '8px 12px', background: 'rgba(255,255,255,0.02)', borderRadius: 6, border: `1px solid ${T.border}` }}>{item.message}</div>
      {item.context && <div style={{ fontSize: 10, color: T.textTertiary, fontFamily: T.font, marginTop: 6 }}>{item.context}</div>}
    </div>
  )
}

// ── Main Page ──
export default function Sequences() {
  const [sequences, setSequences] = useState([])
  const [enrollments, setEnrollments] = useState([])
  const [queue, setQueue] = useState([])
  const [linkedinQueue, setLinkedinQueue] = useState([])
  const [selectedSeq, setSelectedSeq] = useState(null)
  const [tab, setTab] = useState('sequences')
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    const [seqRes, enrRes, queueRes, liRes] = await Promise.all([
      supabase.from('kiko_sequences').select('*').order('created_at'),
      supabase.from('kiko_sequence_enrollments').select('*').order('created_at', { ascending: false }),
      supabase.from('kiko_outreach_queue').select('*').eq('status', 'queued').order('scheduled_for'),
      supabase.from('kiko_linkedin_queue').select('*').eq('status', 'pending').order('priority', { ascending: false }),
    ])
    setSequences(seqRes.data || [])
    setEnrollments(enrRes.data || [])
    setQueue(queueRes.data || [])
    setLinkedinQueue(liRes.data || [])
    setLoading(false)
  }

  async function pauseEnrollment(id) {
    await supabase.from('kiko_sequence_enrollments').update({ status: 'paused' }).eq('id', id)
    await supabase.from('kiko_outreach_queue').update({ status: 'cancelled' }).eq('enrollment_id', id).eq('status', 'queued')
    loadData()
  }
  async function cancelEnrollment(id) {
    await supabase.from('kiko_sequence_enrollments').update({ status: 'cancelled' }).eq('id', id)
    await supabase.from('kiko_outreach_queue').update({ status: 'cancelled' }).eq('enrollment_id', id).eq('status', 'queued')
    loadData()
  }
  async function markLinkedinSent(id) {
    await supabase.from('kiko_linkedin_queue').update({ status: 'sent', actioned_at: new Date().toISOString() }).eq('id', id)
    loadData()
  }
  async function skipLinkedin(id) {
    await supabase.from('kiko_linkedin_queue').update({ status: 'skipped', actioned_at: new Date().toISOString() }).eq('id', id)
    loadData()
  }

  // Stats
  const totalActive = enrollments.filter(e => e.status === 'active').length
  const totalReplied = enrollments.filter(e => e.status === 'replied').length
  const totalEnrolled = enrollments.length
  const replyRate = totalEnrolled > 0 ? Math.round(totalReplied / totalEnrolled * 100) : 0
  const selectedEnrollments = selectedSeq ? enrollments.filter(e => e.sequence_id === selectedSeq) : enrollments
  const selectedSequence = sequences.find(s => s.id === selectedSeq)

  const tabs = [
    { id: 'sequences', label: 'Sequences', count: sequences.length },
    { id: 'enrollments', label: 'Enrollments', count: totalEnrolled },
    { id: 'queue', label: 'Email Queue', count: queue.length },
    { id: 'linkedin', label: 'LinkedIn Queue', count: linkedinQueue.length },
  ]

  return (
    <div style={{ padding: '24px 28px', fontFamily: T.font, color: T.text, maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 500, margin: 0, color: T.text }}>Outreach Sequences</h1>
        <p style={{ fontSize: 13, color: T.textTertiary, margin: '4px 0 0' }}>Automated multi-step outreach · Replaces Lemlist</p>
      </div>

      {/* Stats Row */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        <StatCard icon={Users} label="Total Enrolled" value={totalEnrolled} color={T.purple} />
        <StatCard icon={Play} label="Active" value={totalActive} color={T.teal} />
        <StatCard icon={CheckCircle} label="Replied" value={totalReplied} color={T.green} />
        <StatCard icon={BarChart3} label="Reply Rate" value={`${replyRate}%`} color={T.amber} />
        <StatCard icon={Clock} label="Queued Emails" value={queue.length} color={T.purple} />
        <StatCard icon={Linkedin} label="LinkedIn Pending" value={linkedinQueue.length} color="#0077B5" />
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 20, background: T.surface, borderRadius: 8, padding: 3 }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '8px 16px', borderRadius: 6, border: 'none', cursor: 'pointer', fontFamily: T.font, fontSize: 12, fontWeight: 400,
            background: tab === t.id ? 'rgba(255,255,255,0.08)' : 'transparent', color: tab === t.id ? T.text : T.textSecondary, transition: 'all 0.15s',
            display: 'flex', alignItems: 'center', gap: 6
          }}>
            {t.label}
            <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: tab === t.id ? 'rgba(124,92,252,0.15)' : 'rgba(255,255,255,0.04)', color: tab === t.id ? T.purple : T.textTertiary }}>{t.count}</span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === 'sequences' && (
        <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {sequences.map(seq => (
              <SequenceCard key={seq.id} seq={seq} enrollments={enrollments} onSelect={setSelectedSeq} selected={selectedSeq} />
            ))}
            {!sequences.length && <div style={{ ...glass, padding: 32, textAlign: 'center', color: T.textTertiary, fontSize: 13 }}>No sequences yet. Ask Kiko to create one.</div>}
          </div>
          {/* Right panel — enrollments for selected sequence */}
          <div style={{ ...glass, overflow: 'hidden' }}>
            <div style={{ padding: '12px 16px', borderBottom: `1px solid ${T.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 500, color: T.text }}>{selectedSequence?.name || 'All Enrollments'}</span>
              <span style={{ fontSize: 11, color: T.textTertiary }}>{selectedEnrollments.length} contacts</span>
            </div>
            <div style={{ maxHeight: 500, overflowY: 'auto' }}>
              {selectedEnrollments.map(e => (
                <EnrollmentRow key={e.id} e={e} sequence={sequences.find(s => s.id === e.sequence_id)} onPause={pauseEnrollment} onCancel={cancelEnrollment} />
              ))}
              {!selectedEnrollments.length && <div style={{ padding: 32, textAlign: 'center', color: T.textTertiary, fontSize: 12 }}>No enrollments. Say "Kiko, start a sequence for [company]" to begin.</div>}
            </div>
          </div>
        </div>
      )}

      {tab === 'enrollments' && (
        <div style={{ ...glass, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: `1px solid ${T.border}` }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: T.text }}>All Enrollments</span>
          </div>
          {enrollments.map(e => (
            <EnrollmentRow key={e.id} e={e} sequence={sequences.find(s => s.id === e.sequence_id)} onPause={pauseEnrollment} onCancel={cancelEnrollment} />
          ))}
          {!enrollments.length && <div style={{ padding: 32, textAlign: 'center', color: T.textTertiary, fontSize: 12 }}>No enrollments yet.</div>}
        </div>
      )}

      {tab === 'queue' && (
        <div style={{ ...glass, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: `1px solid ${T.border}` }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: T.text }}>Email Queue — Scheduled to Send</span>
          </div>
          {queue.map(q => (
            <div key={q.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: `1px solid ${T.border}`, fontSize: 12, fontFamily: T.font }}>
              <Mail size={14} style={{ color: T.purple, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: T.text }}>{q.to_name || q.to_email}</div>
                <div style={{ fontSize: 11, color: T.textTertiary }}>{q.subject}</div>
              </div>
              <div style={{ fontSize: 11, color: T.textSecondary }}>{q.company}</div>
              <div style={{ fontSize: 11, color: T.textTertiary, width: 80, textAlign: 'right' }}>
                {new Date(q.scheduled_for).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} {new Date(q.scheduled_for).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
              </div>
              <div style={{ fontSize: 10, padding: '2px 6px', borderRadius: 3, background: 'rgba(124,92,252,0.1)', color: T.purple }}>Step {q.step_number}</div>
            </div>
          ))}
          {!queue.length && <div style={{ padding: 32, textAlign: 'center', color: T.textTertiary, fontSize: 12 }}>No emails queued. Enroll contacts in sequences to start.</div>}
        </div>
      )}

      {tab === 'linkedin' && (
        <div>
          {linkedinQueue.map(item => (
            <LinkedInItem key={item.id} item={item} onMarkSent={markLinkedinSent} onSkip={skipLinkedin} />
          ))}
          {!linkedinQueue.length && <div style={{ ...glass, padding: 32, textAlign: 'center', color: T.textTertiary, fontSize: 12 }}>No LinkedIn messages pending. Sequences with LinkedIn steps will populate this queue.</div>}
        </div>
      )}
    </div>
  )
}
