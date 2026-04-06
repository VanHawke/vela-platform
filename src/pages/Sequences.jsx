// src/pages/Sequences.jsx — Lemlist-quality campaign dashboard
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { setPageContext } from '@/lib/pageContext'
import T, { glass } from '@/lib/theme'
import { Plus, Sparkles, X, Mail, Linkedin, Play, Pause, Users, Send, TrendingUp, ChevronRight, GitBranch, Rocket } from 'lucide-react'

function pct(n, d) { return d > 0 ? Math.round((n / d) * 100) : 0 }

function statusBadge(isActive, hasEnrollments) {
  if (isActive === true) return { bg: 'rgba(45,212,191,0.08)', color: 'rgba(45,212,191,0.8)', border: 'rgba(45,212,191,0.15)', label: 'Live' }
  if (hasEnrollments) return { bg: 'rgba(248,113,113,0.08)', color: 'rgba(248,113,113,0.7)', border: 'rgba(248,113,113,0.15)', label: 'Paused' }
  return { bg: 'rgba(251,191,36,0.08)', color: 'rgba(251,191,36,0.8)', border: 'rgba(251,191,36,0.15)', label: 'Draft' }
}

export default function Sequences() {
  const navigate = useNavigate()
  const [sequences, setSequences] = useState([])
  const [enrollments, setEnrollments] = useState([])
  const [sentMap, setSentMap] = useState({})
  const [showWizard, setShowWizard] = useState(false)
  const [wizCategory, setWizCategory] = useState('')
  const [wizTeam, setWizTeam] = useState('Haas F1 Team')
  const [wizPersona, setWizPersona] = useState('')
  const [generating, setGenerating] = useState(false)
  const [toggling, setToggling] = useState(null)
  const [search, setSearch] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    const [{ data: s }, { data: e }, { data: q }] = await Promise.all([
      supabase.from('kiko_sequences').select('*').order('created_at', { ascending: false }),
      supabase.from('kiko_sequence_enrollments').select('*'),
      supabase.from('kiko_outreach_queue').select('enrollment_id').eq('status', 'sent'),
    ])
    setSequences(s || [])
    setEnrollments(e || [])
    const map = {}
    for (const item of (q || [])) {
      map[item.enrollment_id] = (map[item.enrollment_id] || 0) + 1
    }
    setSentMap(map)
    setPageContext({
      page: 'campaigns', summary: `Campaigns: ${(s||[]).length} sequences, ${(e||[]).length} enrolled leads`,
      visibleItems: (s||[]).slice(0, 6).map(x => `${x.name} (${x.is_active ? 'running' : 'paused'})`).join(', ')
    })
  }

  async function toggleActive(e, seqId, current) {
    e.stopPropagation()
    setToggling(seqId)
    await supabase.from('kiko_sequences').update({ is_active: !current, updated_at: new Date().toISOString() }).eq('id', seqId)
    setSequences(prev => prev.map(s => s.id === seqId ? { ...s, is_active: !current } : s))
    setToggling(null)
  }

  async function generate() {
    if (!wizCategory) return
    setGenerating(true)
    try {
      const res = await fetch('/api/generate-sequence', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: wizCategory, team: wizTeam, persona: wizPersona || undefined, numSteps: 7 }) })
      const data = await res.json()
      if (data.ok && data.id) { setShowWizard(false); navigate(`/sequences/${data.id}`) }
      else alert(data.error || 'Generation failed')
    } catch (err) { alert(err.message) }
    setGenerating(false)
  }

  const totalEnrolled = enrollments.length
  const totalActive = enrollments.filter(e => e.status === 'active').length
  const totalReplied = enrollments.filter(e => e.status === 'replied').length
  const totalBounced = enrollments.filter(e => e.status === 'bounced').length
  const totalCompleted = enrollments.filter(e => e.status === 'completed').length
  const totalSent = Object.values(sentMap).reduce((a, b) => a + b, 0)

  function campStats(seqId) {
    const enr = enrollments.filter(e => e.sequence_id === seqId)
    const enrolled = enr.length
    const active = enr.filter(e => e.status === 'active').length
    const replied = enr.filter(e => e.status === 'replied').length
    const bounced = enr.filter(e => e.status === 'bounced').length
    const completed = enr.filter(e => e.status === 'completed').length
    const sent = enr.reduce((sum, e) => sum + (sentMap[e.id] || 0), 0)
    return { enrolled, active, replied, bounced, completed, sent }
  }

  const card = { ...glass, padding: '16px 20px', cursor: 'pointer', transition: 'all 0.2s cubic-bezier(0.4,0,0.2,1)' }
  const statBox = { background: T.surface, border: `0.5px solid ${T.border}`, borderRadius: T.radius, padding: '14px 16px', textAlign: 'center' }

  // Sort: live first, then drafts. Filter by search.
  const filtered = sequences
    .filter(s => !search || s.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      if (a.is_active && !b.is_active) return -1
      if (!a.is_active && b.is_active) return 1
      return new Date(b.created_at) - new Date(a.created_at)
    })

  return (
    <div style={{ padding: '24px 28px', fontFamily: T.font, color: T.text, maxWidth: 960, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 400, margin: 0, color: T.text }}>Campaigns</h1>
          <p style={{ fontSize: 11, color: T.textTertiary, fontWeight: 300, margin: '4px 0 0' }}>
            {sequences.length} campaign{sequences.length !== 1 ? 's' : ''} · {totalEnrolled} leads · {totalSent} sent · {totalReplied} replied
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => navigate('/sequences/new')} style={{
            padding: '8px 16px', borderRadius: T.radiusSm, border: `0.5px solid ${T.border}`,
            background: 'transparent', color: T.textSecondary, fontSize: 12, fontWeight: 400,
            cursor: 'pointer', fontFamily: T.font, display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <Plus size={14} /> New
          </button>
          <button onClick={() => setShowWizard(true)} style={{
            padding: '8px 18px', borderRadius: T.radiusSm, border: 'none',
            background: 'rgba(255,224,194,0.08)', color: T.accent, fontSize: 12, fontWeight: 500,
            cursor: 'pointer', fontFamily: T.font, display: 'flex', alignItems: 'center', gap: 6,
            boxShadow: T.liquidBtnShadow, transition: 'all 0.2s',
          }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,224,194,0.14)'; e.currentTarget.style.boxShadow = T.liquidBtnHover }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,224,194,0.08)'; e.currentTarget.style.boxShadow = T.liquidBtnShadow }}
          >
            <Sparkles size={14} /> Generate with AI
          </button>
        </div>
      </div>

      {totalEnrolled > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 20 }}>
          {[
            { label: 'Enrolled', value: totalEnrolled, color: T.accent },
            { label: 'Sent', value: totalSent, color: 'rgba(238,238,238,0.70)' },
            { label: 'Replied', value: totalReplied, sub: totalSent > 0 ? `${pct(totalReplied, totalSent)}%` : null, color: T.success },
            { label: 'Active', value: totalActive, color: T.teal },
            { label: 'Bounced', value: totalBounced, sub: totalSent > 0 ? `${pct(totalBounced, totalSent)}%` : null, color: T.danger },
          ].map((s, i) => (
            <div key={i} style={statBox}>
              <div style={{ fontSize: 22, fontWeight: 500, color: s.color, lineHeight: 1 }}>{s.value}</div>
              <div style={{ fontSize: 10, color: T.textTertiary, marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {s.label}{s.sub && <span style={{ marginLeft: 4, color: T.textSecondary }}>{s.sub}</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Search filter */}
      {sequences.length > 3 && (
        <div style={{ marginBottom: 12 }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Filter campaigns..." style={{ width: '100%', padding: '8px 12px', borderRadius: T.radiusSm, border: `0.5px solid ${T.border}`, background: T.surface, color: T.text, fontSize: 12, fontFamily: T.font, outline: 'none', boxSizing: 'border-box' }} />
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filtered.map(seq => {
          const steps = seq.steps || []
          const emails = steps.filter(s => s.channel === 'email').length
          const linkedin = steps.filter(s => s.channel === 'linkedin').length
          const totalDays = steps.reduce((sum, s) => sum + (s.delay_days || 0), 0)
          const cs = campStats(seq.id)
          const replyRate = pct(cs.replied, cs.sent)
          const sb = statusBadge(seq.is_active, cs.enrolled > 0)

          return (
            <div key={seq.id} onClick={() => navigate(`/sequences/${seq.id}`)}
              style={card}
              onMouseEnter={e => { e.currentTarget.style.background = T.glassHover; e.currentTarget.style.borderColor = T.glassBorderHover }}
              onMouseLeave={e => { e.currentTarget.style.background = glass.background; e.currentTarget.style.borderColor = T.glassBorder }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 500, color: T.text, marginBottom: 2 }}>{seq.name}</div>
                  <div style={{ fontSize: 11, color: T.textTertiary, fontWeight: 300 }}>
                    {emails} email{emails !== 1 ? 's' : ''} · {linkedin} LinkedIn{steps.some(s => s.type === 'condition') ? ' · branching' : ''} · {totalDays} days
                    {seq.created_at && <span> · Created {new Date(seq.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 6, fontWeight: 500, background: sb.bg, color: sb.color, border: `1px solid ${sb.border}` }}>{sb.label}</span>
                  <button onClick={(e) => toggleActive(e, seq.id, seq.is_active)} disabled={toggling === seq.id}
                    style={{ width: 28, height: 28, borderRadius: T.radiusSm, cursor: 'pointer',
                      border: `0.5px solid ${seq.is_active ? 'rgba(251,191,36,0.2)' : 'rgba(45,212,191,0.2)'}`,
                      background: seq.is_active ? 'rgba(251,191,36,0.06)' : 'rgba(45,212,191,0.06)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: toggling === seq.id ? 0.4 : 1 }}
                    title={seq.is_active ? 'Pause campaign' : 'Resume campaign'}>
                    {seq.is_active ? <Pause size={12} style={{ color: 'rgba(251,191,36,0.8)' }} /> : <Play size={12} style={{ color: 'rgba(45,212,191,0.8)' }} />}
                  </button>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 3, alignItems: 'center', marginBottom: 12 }}>
                {steps.map((s, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                    <div style={{ width: 22, height: 22, borderRadius: 6,
                      background: s.type === 'condition' ? 'rgba(251,191,36,0.08)' : s.channel === 'linkedin' ? 'rgba(0,119,181,0.10)' : 'rgba(255,224,194,0.06)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      border: `0.5px solid ${s.type === 'condition' ? 'rgba(251,191,36,0.15)' : s.channel === 'linkedin' ? 'rgba(0,119,181,0.15)' : 'rgba(255,224,194,0.08)'}` }}>
                      {s.type === 'condition' ? <GitBranch size={10} style={{ color: 'rgba(251,191,36,0.7)' }} /> : s.channel === 'linkedin' ? <Linkedin size={10} style={{ color: 'rgba(0,119,181,0.7)' }} /> : <Mail size={10} style={{ color: 'rgba(255,224,194,0.5)' }} />}
                    </div>
                    {i < steps.length - 1 && <ChevronRight size={8} style={{ color: T.textMuted }} />}
                  </div>
                ))}
              </div>
              {cs.enrolled > 0 ? (
                <div style={{ display: 'flex', gap: 0, alignItems: 'stretch' }}>
                  {[
                    { label: 'Enrolled', value: cs.enrolled, color: T.accent },
                    { label: 'Sent', value: cs.sent, color: 'rgba(238,238,238,0.60)' },
                    { label: 'Replied', value: cs.replied, sub: cs.sent > 0 ? `${pct(cs.replied, cs.sent)}%` : null, color: T.success },
                    { label: 'Bounced', value: cs.bounced, color: T.danger },
                    { label: 'Active', value: cs.active, color: T.teal },
                  ].map((m, i) => (
                    <div key={i} style={{ flex: 1, padding: '8px 0', textAlign: 'center', borderRight: i < 4 ? `0.5px solid ${T.border}` : 'none' }}>
                      <div style={{ fontSize: 16, fontWeight: 500, color: m.value > 0 ? m.color : T.textMuted, lineHeight: 1 }}>
                        {m.value}{m.sub && <span style={{ fontSize: 10, fontWeight: 400, color: T.textTertiary, marginLeft: 3 }}>{m.sub}</span>}
                      </div>
                      <div style={{ fontSize: 9, color: T.textTertiary, marginTop: 3, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{m.label}</div>
                    </div>
                  ))}
                  {cs.sent > 0 && (
                    <div style={{ width: 80, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', paddingLeft: 12 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: replyRate >= 10 ? T.success : replyRate > 0 ? T.warning : T.textMuted }}>{replyRate}%</div>
                      <div style={{ width: '100%', height: 3, background: T.surface, borderRadius: 2, marginTop: 4, overflow: 'hidden' }}>
                        <div style={{ height: '100%', borderRadius: 2, width: `${Math.min(replyRate, 100)}%`, background: replyRate >= 10 ? T.success : T.warning, transition: 'width 0.3s ease' }} />
                      </div>
                      <div style={{ fontSize: 8, color: T.textTertiary, marginTop: 2, textTransform: 'uppercase' }}>Reply rate</div>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ fontSize: 11, color: T.textTertiary, fontWeight: 300, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Users size={12} style={{ color: T.textMuted }} /> No leads enrolled — click to add contacts and launch
                </div>
              )}
            </div>
          )
        })}
        {!filtered.length && search && (
          <div style={{ ...glass, padding: 32, textAlign: 'center' }}>
            <div style={{ fontSize: 13, color: T.textSecondary }}>No campaigns matching "{search}"</div>
          </div>
        )}
        {!filtered.length && !search && (
          <div style={{ ...glass, padding: 48, textAlign: 'center' }}>
            <TrendingUp size={28} style={{ color: T.textMuted, marginBottom: 10 }} />
            <div style={{ fontSize: 14, color: T.textSecondary, marginBottom: 6 }}>No campaigns yet</div>
            <div style={{ fontSize: 12, color: T.textTertiary, fontWeight: 300 }}>Click "Generate Campaign" to create your first outreach sequence</div>
          </div>
        )}
      </div>

      {showWizard && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(12px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setShowWizard(false)}>
          <div onClick={e => e.stopPropagation()} style={{ ...glass, padding: 28, width: 460, maxWidth: '90vw', boxShadow: T.glassShadowFloat }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 17, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Sparkles size={16} style={{ color: T.accent }} /> Generate campaign
                </div>
                <div style={{ fontSize: 12, color: T.textTertiary, marginTop: 2, fontWeight: 300 }}>
                  Kiko creates a 7-touch sequence using research-backed psychology
                </div>
              </div>
              <button onClick={() => setShowWizard(false)} style={{ background: 'none', border: 'none', color: T.textTertiary, cursor: 'pointer' }}><X size={16} /></button>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, color: T.textTertiary, display: 'block', marginBottom: 4 }}>Category *</label>
              <input value={wizCategory} onChange={e => setWizCategory(e.target.value)} placeholder="Type or select a category below" autoFocus
                style={{ width: '100%', padding: '10px 12px', borderRadius: T.radiusSm, border: `0.5px solid ${T.border}`, background: T.surface, color: T.text, fontSize: 13, fontFamily: T.font, outline: 'none', boxSizing: 'border-box' }} />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
                {['Banking', 'FinTech', 'Telecoms', 'Cybersecurity', 'Cloud', 'CRM', 'AI/ML', 'Semiconductor', 'Robotics', 'Data', 'Logistics', 'Energy', 'Gaming', 'Tequila', 'Whiskey'].map(cat => (
                  <button key={cat} onClick={() => setWizCategory(cat)} style={{
                    padding: '3px 10px', borderRadius: 4, fontSize: 10, cursor: 'pointer', fontFamily: T.font,
                    border: `0.5px solid ${wizCategory === cat ? 'rgba(255,224,194,0.25)' : T.border}`,
                    background: wizCategory === cat ? 'rgba(255,224,194,0.08)' : 'transparent',
                    color: wizCategory === cat ? T.accent : T.textTertiary,
                    transition: 'all 0.15s',
                  }}>{cat}</button>
                ))}
              </div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 11, color: T.textTertiary, display: 'block', marginBottom: 4 }}>F1 Team</label>
              <select value={wizTeam} onChange={e => setWizTeam(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', borderRadius: T.radiusSm, border: `0.5px solid ${T.border}`, background: T.surface, color: T.text, fontSize: 13, fontFamily: T.font, outline: 'none' }}>
                {['Haas F1 Team', 'Alpine F1 Team', 'Aston Martin F1 Team'].map(t => <option key={t} value={t} style={{ background: '#111' }}>{t}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 18 }}>
              <label style={{ fontSize: 11, color: T.textTertiary, display: 'block', marginBottom: 4 }}>Target persona (optional)</label>
              <input value={wizPersona} onChange={e => setWizPersona(e.target.value)} placeholder="Auto: C-suite at $500M-$5B companies"
                style={{ width: '100%', padding: '10px 12px', borderRadius: T.radiusSm, border: `0.5px solid ${T.border}`, background: T.surface, color: T.textSecondary, fontSize: 13, fontFamily: T.font, outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div style={{ padding: 10, borderRadius: T.radiusSm, background: 'rgba(255,224,194,0.03)', border: `0.5px solid rgba(255,224,194,0.08)`, marginBottom: 16, fontSize: 11, color: T.textSecondary, lineHeight: 1.5, fontWeight: 300 }}>
              4 emails + 3 LinkedIn touches over 14 days. Cialdini psychology progression. Race calendar awareness. Van Hawke communication style.
            </div>
            <button onClick={generate} disabled={generating || !wizCategory} style={{
              width: '100%', padding: '10px 0', borderRadius: T.radiusSm, border: 'none',
              background: generating ? T.surface : 'rgba(255,224,194,0.10)', color: generating ? T.textTertiary : T.accent,
              fontSize: 13, fontWeight: 500, cursor: generating ? 'default' : 'pointer', fontFamily: T.font,
              boxShadow: generating ? 'none' : T.liquidBtnShadow,
            }}>
              {generating ? '⏳ Generating...' : '✨ Generate & open'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
