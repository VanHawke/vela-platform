// src/pages/Sequences.jsx — Campaign dashboard (matching mockup renders exactly)
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { setPageContext } from '@/lib/pageContext'
import { Plus, Sparkles, X, Mail, Linkedin, Play, Pause, Users, ChevronRight, GitBranch, Rocket } from 'lucide-react'

// Design tokens — hardcoded to match mockup renders
import { C } from '@/lib/theme'
const pct = (n, d) => d > 0 ? Math.round((n / d) * 100) : 0

function Badge({ label, color }) {
  return <span style={{ fontSize: 10, padding: '3px 10px', borderRadius: 12, fontWeight: 500, background: `${color}12`, color, border: `1px solid ${color}22` }}>{label}</span>
}

export default function Sequences() {
  const nav = useNavigate()
  const [sequences, setSequences] = useState([])
  const [enrollments, setEnrollments] = useState([])
  const [sentMap, setSentMap] = useState({})
  const [showWiz, setShowWiz] = useState(false)
  const [wizCat, setWizCat] = useState('')
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
      supabase.from('kiko_outreach_queue').select('enrollment_id, status, opens_count, clicks_count, reply_received_at, reply_handled, sent_at'),
    ])
    setSequences(s || []); setEnrollments(e || [])
    // Build rich stats map keyed by enrollment_id
    const map = {}
    for (const item of (q || [])) {
      if (!map[item.enrollment_id]) map[item.enrollment_id] = { sent: 0, opens: 0, clicks: 0, replies: 0, unhandledReplies: 0 }
      if (item.status === 'sent' || item.sent_at) map[item.enrollment_id].sent += 1
      if ((item.opens_count || 0) > 0) map[item.enrollment_id].opens += 1
      if ((item.clicks_count || 0) > 0) map[item.enrollment_id].clicks += 1
      if (item.reply_received_at) map[item.enrollment_id].replies += 1
      if (item.reply_received_at && !item.reply_handled) map[item.enrollment_id].unhandledReplies += 1
    }
    setSentMap(map)
    setPageContext({ page: 'campaigns', summary: `Campaigns: ${(s||[]).length} sequences, ${(e||[]).length} enrolled leads`,
      visibleItems: (s||[]).slice(0, 6).map(x => `${x.name} (${x.is_active ? 'live' : 'draft'})`).join(', ') })
  }

  async function toggleActive(e, seqId, current) {
    e.stopPropagation(); setToggling(seqId)
    await supabase.from('kiko_sequences').update({ is_active: !current, updated_at: new Date().toISOString() }).eq('id', seqId)
    setSequences(prev => prev.map(s => s.id === seqId ? { ...s, is_active: !current } : s))
    setToggling(null)
  }

  async function generate() {
    if (!wizCat) return; setGenerating(true)
    try {
      const res = await fetch('/api/generate-sequence', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: wizCat, team: wizTeam, persona: wizPersona || undefined, numSteps: 7 }) })
      const data = await res.json()
      if (data.ok && data.id) { setShowWiz(false); nav(`/sequences/${data.id}`) } else alert(data.error || 'Generation failed')
    } catch (err) { alert(err.message) }
    setGenerating(false)
  }

  const totalEnrolled = enrollments.length
  const totalActive = enrollments.filter(e => e.status === 'active').length
  const totalReplied = enrollments.filter(e => e.status === 'replied').length
  const totalBounced = enrollments.filter(e => e.status === 'bounced').length
  const aggregateAll = Object.values(sentMap).reduce((acc, m) => ({
    sent: acc.sent + (m.sent || 0),
    opens: acc.opens + (m.opens || 0),
    clicks: acc.clicks + (m.clicks || 0),
    replies: acc.replies + (m.replies || 0),
    unhandledReplies: acc.unhandledReplies + (m.unhandledReplies || 0),
  }), { sent: 0, opens: 0, clicks: 0, replies: 0, unhandledReplies: 0 })
  const totalSent = aggregateAll.sent
  const totalOpens = aggregateAll.opens
  const totalClicks = aggregateAll.clicks
  const totalUnhandled = aggregateAll.unhandledReplies

  function cs(seqId) {
    const enr = enrollments.filter(e => e.sequence_id === seqId)
    const agg = enr.reduce((acc, e) => {
      const m = sentMap[e.id] || {}
      return {
        sent: acc.sent + (m.sent || 0),
        opens: acc.opens + (m.opens || 0),
        clicks: acc.clicks + (m.clicks || 0),
        replies: acc.replies + (m.replies || 0),
        unhandled: acc.unhandled + (m.unhandledReplies || 0),
      }
    }, { sent: 0, opens: 0, clicks: 0, replies: 0, unhandled: 0 })
    return {
      enrolled: enr.length,
      active: enr.filter(e => e.status === 'active').length,
      replied: enr.filter(e => e.status === 'replied').length || agg.replies,
      bounced: enr.filter(e => e.status === 'bounced').length,
      sent: agg.sent,
      opens: agg.opens,
      clicks: agg.clicks,
      unhandledReplies: agg.unhandled,
    }
  }

  const filtered = sequences
    .filter(s => !search || s.name.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => { if (a.is_active && !b.is_active) return -1; if (!a.is_active && b.is_active) return 1; return new Date(b.created_at) - new Date(a.created_at) })

  return (
    <div style={{ padding: '28px 32px', fontFamily: C.font, color: C.text, maxWidth: 960, margin: '0 auto' }}>
      {/* ═══ HEADER ═══ */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 500, margin: 0 }}>Campaigns</h1>
          <p style={{ fontSize: 12, color: C.textSec, margin: '6px 0 0' }}>{sequences.length} campaign{sequences.length !== 1 ? 's' : ''} · {totalEnrolled.toLocaleString()} leads · {totalSent.toLocaleString()} sent · {totalReplied} replied</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => nav('/sequences/new')} style={{ padding: '8px 16px', borderRadius: C.r, border: `0.5px solid ${C.border}`, background: C.card, color: C.textSec, fontSize: 13, cursor: 'pointer', fontFamily: C.font, display: 'flex', alignItems: 'center', gap: 6 }}><Plus size={14} /> New</button>
          <button onClick={() => setShowWiz(true)} style={{ padding: '8px 18px', borderRadius: C.r, border: `0.5px solid ${C.purple}30`, background: `${C.purple}10`, color: C.purple, fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: C.font, display: 'flex', alignItems: 'center', gap: 6 }}><Sparkles size={14} /> Generate with AI</button>
        </div>
      </div>

      {/* ═══ GLOBAL STATS ═══ */}
      {sequences.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10, marginBottom: 20 }}>
          {[
            { label: 'Enrolled', val: totalEnrolled, color: C.purple },
            { label: 'Sent', val: totalSent, color: C.text },
            { label: 'Opens', val: totalOpens, sub: totalSent > 0 ? `${pct(totalOpens, totalSent)}%` : null, color: C.blue },
            { label: 'Clicks', val: totalClicks, sub: totalSent > 0 ? `${pct(totalClicks, totalSent)}%` : null, color: C.teal },
            { label: 'Replied', val: totalReplied || aggregateAll.replies, sub: totalSent > 0 ? `${pct(totalReplied || aggregateAll.replies, totalSent)}%` : null, color: C.green },
            { label: 'Unhandled', val: totalUnhandled, color: totalUnhandled > 0 ? C.red : C.textMut },
          ].map((s, i) => (
            <div key={i} style={{ background: C.card, border: `0.5px solid ${C.border}`, borderRadius: C.r, padding: '14px', textAlign: 'center' }}>
              <div style={{ fontSize: 22, fontWeight: 500, color: s.val > 0 ? s.color : C.textMut, lineHeight: 1 }}>{s.val.toLocaleString()}{s.sub && <span style={{ fontSize: 11, fontWeight: 400, color: C.textSec, marginLeft: 4 }}>{s.sub}</span>}</div>
              <div style={{ fontSize: 9, color: C.textTer, marginTop: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}
      {/* Unhandled replies banner */}
      {totalUnhandled > 0 && (
        <div style={{ background: 'rgba(248,113,113,0.06)', border: `0.5px solid rgba(248,113,113,0.30)`, borderRadius: C.r, padding: '12px 16px', marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 12, color: C.text }}>
            <strong style={{ color: C.red }}>{totalUnhandled}</strong> {totalUnhandled === 1 ? 'reply' : 'replies'} need your response — drafts ready in Command Centre Priority section
          </div>
          <button onClick={() => nav('/command-centre')} style={{ padding: '6px 12px', borderRadius: 6, fontSize: 11, background: 'rgba(248,113,113,0.12)', color: C.red, border: `0.5px solid rgba(248,113,113,0.30)`, cursor: 'pointer', fontFamily: C.font }}>Open triage</button>
        </div>
      )}

      {/* ═══ SEARCH ═══ */}
      {sequences.length > 3 && (
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Filter campaigns..." style={{ width: '100%', padding: '10px 14px', borderRadius: C.r, border: `0.5px solid ${C.border}`, background: C.card, color: C.text, fontSize: 13, fontFamily: C.font, outline: 'none', boxSizing: 'border-box', marginBottom: 14 }} />
      )}

      {/* ═══ CAMPAIGN CARDS ═══ */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {filtered.map(seq => {
          const steps = seq.steps || [], stats = cs(seq.id)
          const emails = steps.filter(s => s.channel === 'email').length
          const linkedin = steps.filter(s => s.channel === 'linkedin').length
          const hasBranch = steps.some(s => s.type === 'condition')
          const totalDays = steps.reduce((sum, s) => sum + (s.delay_days || 0), 0)
          const replyRate = pct(stats.replied, stats.sent)
          const status = seq.is_active ? { label: 'Live', color: C.teal } : stats.enrolled > 0 ? { label: 'Paused', color: C.red } : { label: 'Draft', color: C.amber }

          return (
            <div key={seq.id} onClick={() => nav(`/sequences/${seq.id}`)}
              style={{ background: C.card, border: `0.5px solid ${C.border}`, borderRadius: C.r + 2, padding: '18px 22px', cursor: 'pointer', transition: 'all 0.2s ease', opacity: !seq.is_active && stats.enrolled === 0 ? 0.75 : 1 }}
              onMouseEnter={e => { e.currentTarget.style.background = C.cardHover; e.currentTarget.style.borderColor = C.borderHover }}
              onMouseLeave={e => { e.currentTarget.style.background = C.card; e.currentTarget.style.borderColor = C.border }}>
              {/* Row 1: Name + Status */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 500 }}>{seq.name}</div>
                  <div style={{ fontSize: 12, color: C.textTer, marginTop: 2 }}>
                    {emails} email{emails !== 1 ? 's' : ''} · {linkedin} LinkedIn{hasBranch ? ' · branching' : ''} · {totalDays} days
                    {seq.created_at && <span> · Created {new Date(seq.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Badge label={status.label} color={status.color} />
                  <button onClick={e => toggleActive(e, seq.id, seq.is_active)} disabled={toggling === seq.id}
                    style={{ width: 30, height: 30, borderRadius: C.r, cursor: 'pointer', border: `0.5px solid ${seq.is_active ? C.amber + '30' : C.teal + '30'}`, background: seq.is_active ? C.amber + '0A' : C.teal + '0A', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: toggling === seq.id ? 0.4 : 1 }}>
                    {seq.is_active ? <Pause size={13} style={{ color: C.amber }} /> : <Play size={13} style={{ color: C.teal }} />}
                  </button>
                </div>
              </div>

              {/* Row 2: Step flow icons */}
              <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 14 }}>
                {steps.map((s, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                    <div style={{ width: 24, height: 24, borderRadius: 6, background: s.type === 'condition' ? C.amber + '10' : s.channel === 'linkedin' ? C.linkedin + '15' : C.purple + '0A', display: 'flex', alignItems: 'center', justifyContent: 'center', border: `0.5px solid ${s.type === 'condition' ? C.amber + '20' : s.channel === 'linkedin' ? C.linkedin + '20' : C.purple + '10'}` }}>
                      {s.type === 'condition' ? <GitBranch size={11} style={{ color: C.amber }} /> : s.channel === 'linkedin' ? <Linkedin size={11} style={{ color: C.linkedin }} /> : <Mail size={11} style={{ color: C.purple + 'AA' }} />}
                    </div>
                    {i < steps.length - 1 && <ChevronRight size={9} style={{ color: C.textMut }} />}
                  </div>
                ))}
              </div>

              {/* Row 3: Stats */}
              <div style={{ display: 'flex', alignItems: 'stretch' }}>
                {[
                  { label: 'Enrolled', val: stats.enrolled, color: C.purple },
                  { label: 'Sent', val: stats.sent, color: C.text },
                  { label: 'Opens', val: stats.opens, sub: stats.sent > 0 ? `${pct(stats.opens, stats.sent)}%` : null, color: C.blue },
                  { label: 'Clicks', val: stats.clicks, sub: stats.sent > 0 ? `${pct(stats.clicks, stats.sent)}%` : null, color: C.teal },
                  { label: 'Replied', val: stats.replied, sub: stats.sent > 0 ? `${pct(stats.replied, stats.sent)}%` : null, color: C.green },
                  { label: 'Bounced', val: stats.bounced, color: C.red },
                ].map((m, i) => (
                  <div key={i} style={{ flex: 1, padding: '8px 0', textAlign: 'center', borderRight: i < 5 ? `0.5px solid ${C.border}` : 'none' }}>
                    <div style={{ fontSize: 16, fontWeight: 500, color: m.val > 0 ? m.color : C.textMut }}>{m.val}{m.sub && <span style={{ fontSize: 9, color: C.textSec, marginLeft: 3 }}>{m.sub}</span>}</div>
                    <div style={{ fontSize: 9, color: C.textTer, marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{m.label}</div>
                  </div>
                ))}
                {/* Reply rate bar */}
                {stats.sent > 0 && (
                  <div style={{ width: 80, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', paddingLeft: 14 }}>
                    <div style={{ fontSize: 15, fontWeight: 500, color: replyRate >= 10 ? C.green : replyRate > 0 ? C.amber : C.textMut }}>{replyRate}%</div>
                    <div style={{ width: '100%', height: 2, background: C.border, borderRadius: 1, marginTop: 4, overflow: 'hidden' }}>
                      <div style={{ height: '100%', borderRadius: 1, width: `${Math.min(replyRate, 100)}%`, background: replyRate >= 10 ? C.green : C.amber, transition: 'width 0.4s ease' }} />
                    </div>
                    <div style={{ fontSize: 8, color: C.textTer, marginTop: 3, textTransform: 'uppercase' }}>Reply rate</div>
                  </div>
                )}
              </div>

              {/* Unhandled reply badge */}
              {stats.unhandledReplies > 0 && (
                <div style={{ marginTop: 8, padding: '6px 10px', borderRadius: 6, background: 'rgba(248,113,113,0.06)', border: `0.5px solid rgba(248,113,113,0.20)`, fontSize: 11, color: C.red, display: 'flex', alignItems: 'center', gap: 6 }}>
                  ⚠ {stats.unhandledReplies} unhandled {stats.unhandledReplies === 1 ? 'reply' : 'replies'} — needs response
                </div>
              )}

              {/* Empty state for 0 leads */}
              {stats.enrolled === 0 && (
                <div style={{ fontSize: 12, color: C.textTer, marginTop: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Users size={12} style={{ color: C.textMut }} /> No leads enrolled — click to add contacts and launch
                </div>
              )}
            </div>
          )
        })}

        {/* Empty / no results states */}
        {!filtered.length && search && (
          <div style={{ background: C.card, border: `0.5px solid ${C.border}`, borderRadius: C.r, padding: 32, textAlign: 'center' }}>
            <div style={{ fontSize: 13, color: C.textSec }}>No campaigns matching "{search}"</div>
          </div>
        )}
        {!filtered.length && !search && (
          <div style={{ background: C.card, border: `0.5px solid ${C.border}`, borderRadius: C.r, padding: 48, textAlign: 'center' }}>
            <Rocket size={28} style={{ color: C.textMut, marginBottom: 12 }} />
            <div style={{ fontSize: 16, color: C.textSec, marginBottom: 6 }}>No campaigns yet</div>
            <div style={{ fontSize: 13, color: C.textTer, marginBottom: 20 }}>Generate your first outreach campaign with AI or build one manually</div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 14 }}>
              <button onClick={() => setShowWiz(true)} style={{ padding: '10px 20px', borderRadius: C.r, border: `0.5px solid ${C.purple}30`, background: C.purple + '10', color: C.purple, fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: C.font, display: 'flex', alignItems: 'center', gap: 6 }}><Sparkles size={14} /> Generate with AI</button>
              <button onClick={() => nav('/sequences/new')} style={{ padding: '10px 20px', borderRadius: C.r, border: `0.5px solid ${C.border}`, background: 'transparent', color: C.textSec, fontSize: 13, cursor: 'pointer', fontFamily: C.font, display: 'flex', alignItems: 'center', gap: 6 }}><Plus size={14} /> Build manually</button>
            </div>
            <div style={{ fontSize: 11, color: C.textMut }}>Suggested: Banking · FinTech · Telecoms · Energy · Gaming</div>
          </div>
        )}
      </div>

      {/* ═══ GENERATE WIZARD MODAL ═══ */}
      {showWiz && (
        <div style={{ position: 'fixed', inset: 0, background: 'var(--foreground)', backdropFilter: 'blur(16px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setShowWiz(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#161618', border: `0.5px solid ${C.border}`, borderRadius: 12, padding: 28, width: 460, maxWidth: '90vw', boxShadow: '0 24px 64px var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 20 }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8 }}><Sparkles size={16} style={{ color: C.purple }} /> Generate campaign</div>
                <div style={{ fontSize: 12, color: C.textTer, marginTop: 4 }}>Kiko creates a 7-touch sequence using research-backed psychology</div>
              </div>
              <button onClick={() => setShowWiz(false)} style={{ background: 'none', border: 'none', color: C.textTer, cursor: 'pointer' }}><X size={18} /></button>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, color: C.textTer, display: 'block', marginBottom: 5 }}>Category *</label>
              <input value={wizCat} onChange={e => setWizCat(e.target.value)} placeholder="Type or select below" autoFocus style={{ width: '100%', padding: '10px 14px', borderRadius: C.r, border: `0.5px solid ${C.border}`, background: C.card, color: C.text, fontSize: 14, fontFamily: C.font, outline: 'none', boxSizing: 'border-box' }} />
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 10 }}>
                {['Banking', 'FinTech', 'Telecoms', 'Cybersecurity', 'Cloud', 'CRM', 'AI/ML', 'Semiconductor', 'Robotics', 'Data', 'Logistics', 'Energy', 'Gaming', 'Tequila', 'Whiskey'].map(cat => (
                  <button key={cat} onClick={() => setWizCat(cat)} style={{ padding: '4px 12px', borderRadius: 5, fontSize: 11, cursor: 'pointer', fontFamily: C.font, border: `0.5px solid ${wizCat === cat ? C.purple + '40' : C.border}`, background: wizCat === cat ? C.purple + '10' : 'transparent', color: wizCat === cat ? C.purple : C.textTer, transition: 'all 0.15s' }}>{cat}</button>
                ))}
              </div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, color: C.textTer, display: 'block', marginBottom: 5 }}>F1 Team</label>
              <select value={wizTeam} onChange={e => setWizTeam(e.target.value)} style={{ width: '100%', padding: '10px 14px', borderRadius: C.r, border: `0.5px solid ${C.border}`, background: C.card, color: C.text, fontSize: 14, fontFamily: C.font, outline: 'none' }}>
                {['Haas F1 Team', 'Alpine F1 Team', 'Aston Martin F1 Team'].map(t => <option key={t} value={t} style={{ background: '#111' }}>{t}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 12, color: C.textTer, display: 'block', marginBottom: 5 }}>Target persona (optional)</label>
              <input value={wizPersona} onChange={e => setWizPersona(e.target.value)} placeholder="Auto: C-suite at $500M-$5B companies" style={{ width: '100%', padding: '10px 14px', borderRadius: C.r, border: `0.5px solid ${C.border}`, background: C.card, color: C.textSec, fontSize: 14, fontFamily: C.font, outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div style={{ padding: 12, borderRadius: C.r, background: C.purple + '06', border: `0.5px solid ${C.purple}12`, marginBottom: 18, fontSize: 12, color: C.textSec, lineHeight: 1.6 }}>
              4 emails + 3 LinkedIn touches over 14 days. Cialdini psychology. Race calendar awareness. Van Hawke voice.
            </div>
            <button onClick={generate} disabled={generating || !wizCat} style={{ width: '100%', padding: '12px 0', borderRadius: C.r, border: generating ? `0.5px solid ${C.border}` : `0.5px solid ${C.purple}30`, background: generating ? C.card : C.purple + '10', color: generating ? C.textTer : C.purple, fontSize: 14, fontWeight: 500, cursor: generating ? 'default' : 'pointer', fontFamily: C.font }}>
              {generating ? '⏳ Generating...' : '✨ Generate & open'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
