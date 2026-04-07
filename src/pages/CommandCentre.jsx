// src/pages/CommandCentre.jsx — Morning Brief
// THE operating partner surface. Replaces old OutreachIntelligence.
// Structure per KIKO_REALITY.md Section G (locked):
// Yesterday / Today's Top 3 / This Week / Signals / Intelligence / Actionable Changes
// Pulls from existing tables only. No new schema. Honest empty states for deferred backend.

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { setPageContext } from '@/lib/pageContext'

export default function CommandCentre({ user }) {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState({
    yesterdayReplies: [],
    yesterdayMoves: [],
    yesterdayAlerts: 0,
    topPriorities: [],
    weekMetrics: {},
    staleDeals: [],
    signals: [],
    footerCounts: { contacts: 0, companies: 0, deals: 0 },
  })

  useEffect(() => {
    try { setPageContext({ page: 'command-centre', entity: null }) } catch {}
    loadBrief()
  }, [])

  async function loadBrief() {
    setLoading(true)
    try {
      const yesterdayISO = new Date(Date.now() - 24*60*60*1000).toISOString()

      const [repliesRes, movesRes, alertsCntRes, dealsRes, companiesRes, contactsRes, signalsRes] = await Promise.all([
        supabase.from('kiko_alerts').select('id, title, detail, entity_name, metadata, created_at').eq('type', 'reply_from_prospect').gte('created_at', yesterdayISO).order('created_at', { ascending: false }).limit(10),
        supabase.from('deals').select('id, data, updated_at').gte('updated_at', yesterdayISO).order('updated_at', { ascending: false }).limit(10),
        supabase.from('kiko_alerts').select('id', { count: 'exact', head: true }).gte('created_at', yesterdayISO),
        supabase.from('deals').select('id, data, updated_at').not('data->>status', 'in', '("won","lost")'),
        supabase.from('companies').select('id', { count: 'exact', head: true }),
        supabase.from('contacts').select('id', { count: 'exact', head: true }),
        supabase.from('kiko_alerts').select('id, type, severity, title, detail, entity_name, created_at').in('type', ['partnership', 'promotion', 'funding', 'stale_deal', 'competitor_sponsorship']).order('created_at', { ascending: false }).limit(8),
      ])

      const allDeals = dealsRes.data || []
      const pipelineValue = allDeals.reduce((s, d) => s + Number(d.data?.value || 0), 0)
      const weightedForecast = allDeals.reduce((s, d) => s + Number(d.data?.value || 0) * (Number(d.data?.probability || 0) / 100), 0)

      const fourteenDaysAgo = Date.now() - 14*24*60*60*1000
      const staleDeals = allDeals
        .filter(d => new Date(d.updated_at).getTime() < fourteenDaysAgo)
        .map(d => ({
          id: d.id,
          name: d.data?.title || d.data?.name || 'Untitled deal',
          value: Number(d.data?.value || 0),
          daysStale: Math.floor((Date.now() - new Date(d.updated_at).getTime()) / (24*60*60*1000)),
          company: d.data?.company || '',
        }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 5)

      const replies = repliesRes.data || []
      const priorities = []
      for (const r of replies.slice(0, 2)) {
        priorities.push({
          type: 'reply',
          title: `Reply to ${r.entity_name || 'prospect'}`,
          context: r.metadata?.company ? `${r.metadata.company} · Replied ${timeAgo(r.created_at)}` : `Replied ${timeAgo(r.created_at)}`,
          tag: 'Reply needed', tagColor: 'red',
          body: r.detail || 'Click Generate to draft reply in your voice.',
          alertId: r.id,
        })
      }
      if (staleDeals.length && priorities.length < 3) {
        const d = staleDeals[0]
        priorities.push({
          type: 'stale_deal',
          title: `Re-engage ${d.company || d.name} — ${d.daysStale}d stale`,
          context: `${formatUSD(d.value)} · ${d.company || 'Unassigned'} · Last touch ${d.daysStale}d ago`,
          tag: `Stale ${d.daysStale}d`, tagColor: 'amber',
          body: 'Click Generate to draft a re-engagement using recent news + category urgency.',
          dealId: d.id,
        })
      }
      while (priorities.length < 3) {
        priorities.push({
          type: 'sourcing',
          title: 'Source 15 cybersecurity prospects for Haas F1',
          context: `Dedupe against ${(companiesRes.count || 0).toLocaleString()} existing companies · CISO role targeting`,
          tag: 'Run sourcing', tagColor: 'purple',
          body: 'Kiko ready to web-search cybersecurity companies over $100M revenue, score via SponsorSignal, surface Tier 1 candidates only. ~40s runtime, no new spend.',
        })
        break
      }

      setData({
        yesterdayReplies: replies,
        yesterdayMoves: movesRes.data || [],
        yesterdayAlerts: alertsCntRes.count || 0,
        topPriorities: priorities.slice(0, 3),
        weekMetrics: {
          pipelineValue,
          weightedForecast,
          activeDealsCount: allDeals.length,
          staleDealsCount: staleDeals.length,
          staleDealsValue: staleDeals.reduce((s, d) => s + d.value, 0),
        },
        staleDeals,
        signals: signalsRes.data || [],
        footerCounts: {
          contacts: contactsRes.count || 0,
          companies: companiesRes.count || 0,
          deals: allDeals.length,
        },
      })
    } catch (e) {
      console.error('CommandCentre load error:', e)
    }
    setLoading(false)
  }

  return <BriefShell loading={loading} data={data} user={user} navigate={navigate} reload={loadBrief} />
}

function timeAgo(iso) {
  const d = Date.now() - new Date(iso).getTime()
  const h = Math.floor(d / 3600000)
  if (h < 1) return 'just now'
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h/24)}d ago`
}

function formatUSD(n) {
  if (n >= 1e6) return `$${(n/1e6).toFixed(1)}M`
  if (n >= 1e3) return `$${(n/1e3).toFixed(0)}k`
  return `$${n}`
}
// ═══════════ UI ═══════════

function BriefShell({ loading, data, user, navigate, reload }) {
  const now = new Date()
  const dateStr = now.toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
  const timeStr = now.toLocaleTimeString('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit' })
  const hour = now.getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening'
  const firstName = (user?.user_metadata?.full_name || user?.email || 'Sunny').split(' ')[0].split('@')[0]

  return (
    <div style={S.root}>
      {/* ambient gradient orbs */}
      <div style={{ ...S.orb, ...S.orbPurple }} />
      <div style={{ ...S.orb, ...S.orbTeal }} />

      <div style={S.container}>

        {/* HERO */}
        <header style={S.hero}>
          <h1 style={S.heroGreeting}>{greeting}, {firstName}.</h1>
          <div style={S.heroMeta}>
            <span>{dateStr}</span>
            <span style={S.heroDot} />
            <span>Weybridge · {timeStr}</span>
          </div>
          <div style={S.heroHeadline}>
            <div style={S.heroHeadlineText}>
              {loading ? 'Loading your brief…' : (
                <>
                  <strong style={{ color: 'var(--purple)', fontWeight: 500 }}>
                    {data.topPriorities.length} priorities today
                  </strong>
                  {data.yesterdayReplies.length > 0 && <> · {data.yesterdayReplies.length} prospect {data.yesterdayReplies.length === 1 ? 'reply needs' : 'replies need'} your eyes</>}
                  {data.staleDeals?.length > 0 && <> · {data.staleDeals.length} {data.staleDeals.length === 1 ? 'deal' : 'deals'} drifting</>}
                </>
              )}
            </div>
            <button style={S.btnGhost} onClick={reload}>↻ Refresh</button>
          </div>
        </header>

        {/* YESTERDAY */}
        <Section title="Yesterday" meta="24h activity">
          <div style={S.grid4}>
            <StatCard label="Replies received" value={data.yesterdayReplies.length} color="purple"
              detail={data.yesterdayReplies.length ? data.yesterdayReplies.slice(0, 2).map(r => r.entity_name || r.metadata?.from || 'Unknown').join(' · ') : 'No replies in last 24h'} />
            <StatCard label="Pipeline movement" value={data.yesterdayMoves.length} color="teal"
              detail={data.yesterdayMoves.length ? `${data.yesterdayMoves.length} deal${data.yesterdayMoves.length === 1 ? '' : 's'} updated` : 'No movement'} />
            <StatCard label="Touches sent" value="—" color="mute"
              detail="Available after first Kiko campaign (Step 7)" />
            <StatCard label="Alerts fired" value={data.yesterdayAlerts} color="amber"
              detail={`${data.yesterdayAlerts} total alerts · ${data.signals.length} signals live`} />
          </div>
        </Section>

        {/* TODAY — TOP 3 */}
        <Section title="Today — Your top 3" meta="Priorities Kiko ranked for you">
          {data.topPriorities.length === 0 && !loading && (
            <EmptyPanel text="Kiko has nothing critical for you today. Type a request into chat to start a sourcing run or draft outreach." />
          )}
          {data.topPriorities.map((p, i) => (
            <PriorityCard key={i} number={i + 1} priority={p} navigate={navigate} />
          ))}
        </Section>

        {/* THIS WEEK metrics */}
        <Section title="This week" meta="Live pipeline">
          <div style={S.grid3}>
            <Metric label="Pipeline value" value={formatUSD(data.weekMetrics.pipelineValue || 0)} delta={`${data.weekMetrics.activeDealsCount || 0} active deals`} />
            <Metric label="Weighted forecast" value={formatUSD(data.weekMetrics.weightedForecast || 0)} delta="Probability-adjusted" />
            <Metric label="Stale deals at risk" value={formatUSD(data.weekMetrics.staleDealsValue || 0)} delta={`${data.weekMetrics.staleDealsCount || 0} deals >14d`} negative />
          </div>
          <div style={{ ...S.grid3, marginTop: 12 }}>
            <Metric label="Reply rate" value="—" delta="Available after Step 7" muted />
            <Metric label="Active campaigns" value="—" delta="After Campaigns rebuild" muted />
            <Metric label="New sourced" value="—" delta="Available after Step 7" muted />
          </div>
        </Section>

        {/* SIGNALS */}
        <Section title="Signals" meta="Curated intelligence feed">
          {data.signals.length === 0 && !loading && (
            <EmptyPanel text="No signals yet. Kiko will surface partnership announcements, competitor sponsorships, executive promotions, and funding events here as they arrive." />
          )}
          {data.signals.map(s => <SignalRow key={s.id} signal={s} />)}
          {data.staleDeals?.length > 0 && (
            <SignalRow signal={{ type: 'stale_deal', title: `${data.staleDeals.length} deals untouched >14 days — combined ${formatUSD(data.weekMetrics.staleDealsValue || 0)} at risk`, detail: data.staleDeals.slice(0, 3).map(d => `${d.company || d.name} (${formatUSD(d.value)}, ${d.daysStale}d)`).join(' · ') }} />
          )}
        </Section>

        {/* INTELLIGENCE — Learning Layer 2 empty state */}
        <Section title="This week's intelligence" meta="Learning System · Layer 2">
          <EmptyPanel text="Structured sector performance, role effectiveness, and message diagnostics will populate here once the first real Kiko campaign sends data (Step 7). Locked architecture in KIKO_REALITY.md Section G." />
        </Section>

        {/* ACTIONABLE CHANGES — Behavioural Integration empty state */}
        <Section title="Actionable changes" meta="Behavioural integration · Step 9+">
          <EmptyPanel text="One-click scoring, targeting, and messaging adjustments will appear here once Learning Layer 2 ships. Every insight will tie to a concrete downstream change per the locked guardrails." />
        </Section>

        {/* FOOTER */}
        <footer style={S.footer}>
          <div style={S.footerStatus}>
            <span style={S.statusDot} />
            <span>
              Kiko OS · {data.footerCounts.contacts.toLocaleString()} contacts · {data.footerCounts.companies.toLocaleString()} companies · {data.footerCounts.deals.toLocaleString()} deals
            </span>
          </div>
          <div>Last updated {timeStr}</div>
        </footer>

      </div>
    </div>
  )
}
// ═══════════ Sub-components ═══════════

function Section({ title, meta, children }) {
  return (
    <section style={{ marginBottom: 28 }}>
      <div style={S.sectionHeader}>
        <div style={S.sectionTitle}>{title}</div>
        {meta && <div style={S.sectionMeta}>{meta}</div>}
      </div>
      {children}
    </section>
  )
}

function StatCard({ label, value, color, detail }) {
  const colorMap = { purple: '#A78BFA', teal: '#2DD4BF', green: '#34D399', amber: '#FBBF24', red: '#F87171', mute: 'rgba(245,245,248,0.32)' }
  return (
    <div style={S.statCard}>
      <div style={S.statLabel}>{label}</div>
      <div style={{ ...S.statValue, color: colorMap[color] || '#fff' }}>{value}</div>
      <div style={S.statDetail}>{detail}</div>
    </div>
  )
}

function PriorityCard({ number, priority, navigate }) {
  const tagStyles = {
    red: { bg: 'rgba(248,113,113,0.10)', color: '#F87171', border: 'rgba(248,113,113,0.20)' },
    amber: { bg: 'rgba(251,191,36,0.10)', color: '#FBBF24', border: 'rgba(251,191,36,0.20)' },
    purple: { bg: 'rgba(167,139,250,0.10)', color: '#A78BFA', border: 'rgba(167,139,250,0.20)' },
  }
  const tag = tagStyles[priority.tagColor] || tagStyles.purple
  return (
    <div style={S.priority}>
      <div style={S.priorityHeader}>
        <div style={S.priorityNumber}>{number}</div>
        <div style={{ flex: 1 }}>
          <div style={S.priorityTitle}>{priority.title}</div>
          <div style={S.priorityContext}>{priority.context}</div>
        </div>
        <div style={{ ...S.priorityTag, background: tag.bg, color: tag.color, border: `0.5px solid ${tag.border}` }}>{priority.tag}</div>
      </div>
      <div style={S.priorityBody}>{priority.body}</div>
      <div style={S.priorityActions}>
        {priority.type === 'reply' && (
          <>
            <button style={S.btnSuccess}>✓ Generate & review draft</button>
            <button style={S.btn}>View Gmail thread</button>
          </>
        )}
        {priority.type === 'stale_deal' && (
          <>
            <button style={S.btnPrimary}>Generate re-engagement draft</button>
            <button style={S.btn} onClick={() => navigate && navigate('/pipeline')}>Open deal</button>
          </>
        )}
        {priority.type === 'sourcing' && (
          <>
            <button style={S.btnPrimary}>Run sourcing now</button>
            <button style={S.btn}>Adjust filters</button>
          </>
        )}
      </div>
    </div>
  )
}

function Metric({ label, value, delta, negative, muted }) {
  return (
    <div style={S.metricCard}>
      <div style={S.metricLabel}>{label}</div>
      <div style={{ ...S.metricValue, color: muted ? 'rgba(245,245,248,0.32)' : '#fff' }}>{value}</div>
      <div style={{ ...S.metricDelta, color: negative ? '#F87171' : muted ? 'rgba(245,245,248,0.32)' : 'rgba(245,245,248,0.55)' }}>{delta}</div>
    </div>
  )
}

function SignalRow({ signal }) {
  const iconMap = { partnership: '🏎️', promotion: '🎯', funding: '💰', stale_deal: '⚠️', competitor_sponsorship: '🏁' }
  return (
    <div style={S.signal}>
      <div style={S.signalIcon}>{iconMap[signal.type] || '●'}</div>
      <div style={{ flex: 1 }}>
        <div style={S.signalTitle}>{signal.title}</div>
        {signal.detail && <div style={S.signalDetail}>{signal.detail}</div>}
      </div>
    </div>
  )
}

function EmptyPanel({ text }) {
  return (
    <div style={S.emptyPanel}>
      <div style={{ fontSize: 11, color: 'rgba(245,245,248,0.32)', lineHeight: 1.6 }}>{text}</div>
    </div>
  )
}

// ═══════════ Inline styles (locked CSS vars from MORNING_BRIEF_PREVIEW.html) ═══════════

const glass = {
  background: 'rgba(20,20,22,0.55)',
  backdropFilter: 'blur(28px) saturate(1.4)',
  WebkitBackdropFilter: 'blur(28px) saturate(1.4)',
  border: '0.5px solid rgba(255,255,255,0.06)',
  borderRadius: 12,
}

const S = {
  root: { background: '#0A0A0C', color: 'rgba(245,245,248,0.92)', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Inter,system-ui,sans-serif', fontWeight: 300, minHeight: '100vh', position: 'relative', overflow: 'hidden' },
  orb: { position: 'fixed', borderRadius: '50%', filter: 'blur(120px)', opacity: 0.35, pointerEvents: 'none', zIndex: 0 },
  orbPurple: { width: 600, height: 600, background: 'radial-gradient(circle,#7C5CFC 0%,transparent 70%)', top: -200, left: -150 },
  orbTeal: { width: 700, height: 700, background: 'radial-gradient(circle,#00D4AA 0%,transparent 70%)', bottom: -300, right: -200 },
  container: { maxWidth: 1280, margin: '0 auto', padding: '32px 40px 80px', position: 'relative', zIndex: 1 },

  hero: { marginBottom: 28 },
  heroGreeting: { fontSize: 32, fontWeight: 300, letterSpacing: '-0.02em', background: 'linear-gradient(135deg,rgba(245,245,248,0.92) 0%,#A78BFA 60%,#2DD4BF 100%)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', marginBottom: 6, margin: 0 },
  heroMeta: { fontSize: 12, color: 'rgba(245,245,248,0.32)', display: 'flex', gap: 14, alignItems: 'center', marginTop: 6 },
  heroDot: { width: 3, height: 3, borderRadius: '50%', background: 'rgba(245,245,248,0.18)' },
  heroHeadline: { ...glass, marginTop: 18, padding: '18px 22px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24, borderLeft: '2px solid #A78BFA' },
  heroHeadlineText: { fontSize: 14, color: 'rgba(245,245,248,0.92)', flex: 1 },

  sectionHeader: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14, padding: '0 4px' },
  sectionTitle: { fontSize: 10, fontWeight: 500, letterSpacing: '0.12em', color: 'rgba(245,245,248,0.55)', textTransform: 'uppercase' },
  sectionMeta: { fontSize: 10, color: 'rgba(245,245,248,0.32)' },

  grid4: { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 },
  grid3: { display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 },

  statCard: { ...glass, padding: '16px 18px' },
  statLabel: { fontSize: 9, color: 'rgba(245,245,248,0.32)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 },
  statValue: { fontSize: 24, fontWeight: 400, letterSpacing: '-0.01em', marginBottom: 4 },
  statDetail: { fontSize: 10, color: 'rgba(245,245,248,0.55)', lineHeight: 1.5 },

  priority: { ...glass, padding: '22px 24px', marginBottom: 12 },
  priorityHeader: { display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 },
  priorityNumber: { width: 26, height: 26, borderRadius: 8, background: 'rgba(167,139,250,0.10)', border: '0.5px solid rgba(167,139,250,0.20)', color: '#A78BFA', fontSize: 11, fontWeight: 500, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  priorityTitle: { fontSize: 14, fontWeight: 500, color: 'rgba(245,245,248,0.92)', marginBottom: 2 },
  priorityContext: { fontSize: 11, color: 'rgba(245,245,248,0.32)' },
  priorityTag: { padding: '4px 10px', borderRadius: 10, fontSize: 9, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em' },
  priorityBody: { padding: '14px 16px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '0.5px solid rgba(255,255,255,0.04)', fontSize: 12, color: 'rgba(245,245,248,0.55)', lineHeight: 1.65, marginBottom: 14 },
  priorityActions: { display: 'flex', gap: 8, flexWrap: 'wrap' },

  metricCard: { ...glass, padding: '16px 18px' },
  metricLabel: { fontSize: 9, color: 'rgba(245,245,248,0.32)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 },
  metricValue: { fontSize: 22, fontWeight: 400, letterSpacing: '-0.01em', marginBottom: 4 },
  metricDelta: { fontSize: 10 },

  signal: { ...glass, padding: '14px 18px', display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 8, borderRadius: 10 },
  signalIcon: { width: 30, height: 30, borderRadius: 8, background: 'rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 },
  signalTitle: { fontSize: 12, color: 'rgba(245,245,248,0.92)', fontWeight: 400, marginBottom: 3 },
  signalDetail: { fontSize: 10, color: 'rgba(245,245,248,0.32)' },

  emptyPanel: { ...glass, padding: '20px 24px', borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.08)' },

  btn: { padding: '8px 16px', borderRadius: 7, fontSize: 11, fontWeight: 500, border: '0.5px solid rgba(255,255,255,0.10)', background: 'transparent', color: 'rgba(245,245,248,0.55)', cursor: 'pointer', fontFamily: 'inherit' },
  btnPrimary: { padding: '8px 16px', borderRadius: 7, fontSize: 11, fontWeight: 500, background: 'rgba(167,139,250,0.12)', color: '#A78BFA', border: '0.5px solid rgba(167,139,250,0.30)', cursor: 'pointer', fontFamily: 'inherit' },
  btnSuccess: { padding: '8px 16px', borderRadius: 7, fontSize: 11, fontWeight: 500, background: 'rgba(52,211,153,0.12)', color: '#34D399', border: '0.5px solid rgba(52,211,153,0.30)', cursor: 'pointer', fontFamily: 'inherit' },
  btnGhost: { padding: '6px 12px', borderRadius: 6, fontSize: 10, background: 'transparent', color: 'rgba(245,245,248,0.55)', border: '0.5px solid rgba(255,255,255,0.10)', cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },

  footer: { marginTop: 40, paddingTop: 24, borderTop: '0.5px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 10, color: 'rgba(245,245,248,0.18)' },
  footerStatus: { display: 'flex', alignItems: 'center', gap: 8 },
  statusDot: { width: 6, height: 6, borderRadius: '50%', background: '#34D399', boxShadow: '0 0 8px rgba(52,211,153,0.6)' },
}
