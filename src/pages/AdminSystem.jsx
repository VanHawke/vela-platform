// src/pages/AdminSystem.jsx — Live control room for Kiko platform
// Fetches /api/selfcheck + Supabase stats, renders as tiles, auto-refreshes every 30s.
// Open in a tab and leave it open — red means something broke.
import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { T } from '../lib/theme'
import { RefreshCw, CheckCircle2, XCircle, Activity, Database, AlertTriangle, Zap, Clock, ArrowLeft } from 'lucide-react'

const REFRESH_INTERVAL_MS = 30000

export default function AdminSystem() {
  const nav = useNavigate()
  const [selfcheck, setSelfcheck] = useState(null)
  const [stats, setStats] = useState(null)
  const [heartbeats, setHeartbeats] = useState([])
  const [errors, setErrors] = useState([])
  const [healthAlerts, setHealthAlerts] = useState([])
  const [bundleHash, setBundleHash] = useState('')
  const [lastRefresh, setLastRefresh] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const [secondsAgo, setSecondsAgo] = useState(0)

  const fetchAll = useCallback(async () => {
    setRefreshing(true)
    try {
      // 1. Live selfcheck
      const selfRes = await fetch('/api/selfcheck', { cache: 'no-store' })
      const selfData = await selfRes.json()
      setSelfcheck(selfData)

      // 2. Data stats via direct Supabase queries
      const [
        { count: partnerships },
        { count: nullCat },
        { count: sequences },
        { count: enrollments },
        { count: queuedEmails },
        { count: linkedinQueue },
        { count: activeAlerts },
        { count: contacts },
        { count: organisations },
        { count: deals },
      ] = await Promise.all([
        supabase.from('f1_partnerships').select('*', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('f1_partnerships').select('*', { count: 'exact', head: true }).eq('status', 'active').is('category_id', null),
        supabase.from('kiko_sequences').select('*', { count: 'exact', head: true }),
        supabase.from('kiko_sequence_enrollments').select('*', { count: 'exact', head: true }),
        supabase.from('kiko_outreach_queue').select('*', { count: 'exact', head: true }).eq('status', 'queued'),
        supabase.from('kiko_linkedin_queue').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('kiko_alerts').select('*', { count: 'exact', head: true }).eq('dismissed', false),
        supabase.from('contacts').select('*', { count: 'exact', head: true }),
        supabase.from('organisations').select('*', { count: 'exact', head: true }),
        supabase.from('deals').select('*', { count: 'exact', head: true }),
      ])
      setStats({ partnerships, nullCat, sequences, enrollments, queuedEmails, linkedinQueue, activeAlerts, contacts, organisations, deals })

      // 3. Recent cron heartbeats — most recent run PER cron (deduped by cron_name)
      // Otherwise jobs-worker dominates the feed (288 runs/day at every-5-min)
      // Pull last 200 raw rows then dedupe in JS to keep one row per cron_name.
      const { data: hbRaw } = await supabase
        .from('kiko_cron_heartbeats')
        .select('cron_name, status, started_at, finished_at, duration_ms, records_processed, error_message')
        .gte('started_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .order('started_at', { ascending: false })
        .limit(200)
      const seenCrons = new Set()
      const dedupedHb = []
      for (const row of (hbRaw || [])) {
        if (seenCrons.has(row.cron_name)) continue
        seenCrons.add(row.cron_name)
        dedupedHb.push(row)
      }
      setHeartbeats(dedupedHb)

      // 4. Recent errors (last 24h, most recent 10)
      const { data: errData } = await supabase
        .from('kiko_error_log')
        .select('component, severity, error_message, created_at')
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .order('created_at', { ascending: false })
        .limit(10)
      setErrors(errData || [])

      // 4b. System health alerts — these used to email Sunny but are now in-app only
      // Pulls system_health rows from kiko_alerts in the last 24h, not yet expired
      const { data: healthData } = await supabase
        .from('kiko_alerts')
        .select('id, severity, title, detail, metadata, created_at, expires_at')
        .eq('type', 'system_health')
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .order('created_at', { ascending: false })
        .limit(20)
      // Filter out expired alerts client-side
      const now = new Date()
      setHealthAlerts((healthData || []).filter(a => !a.expires_at || new Date(a.expires_at) > now))

      // 5. Bundle hash (extracts from the root HTML)
      try {
        const htmlRes = await fetch('/?_=' + Date.now(), { cache: 'no-store' })
        const html = await htmlRes.text()
        const m = html.match(/assets\/index-([A-Za-z0-9_-]+)\.js/)
        if (m) setBundleHash(m[1])
      } catch { /* ignore */ }

      setLastRefresh(new Date())
      setSecondsAgo(0)
    } catch (err) {
      console.error('[AdminSystem] fetch failed:', err)
    } finally {
      setRefreshing(false)
    }
  }, [])

  // Initial load + auto-refresh every 30s
  useEffect(() => {
    fetchAll()
    const iv = setInterval(fetchAll, REFRESH_INTERVAL_MS)
    return () => clearInterval(iv)
  }, [fetchAll])

  // "X seconds ago" ticker
  useEffect(() => {
    const iv = setInterval(() => setSecondsAgo(s => s + 1), 1000)
    return () => clearInterval(iv)
  }, [lastRefresh])

  const passCount = selfcheck?.checks?.filter(c => c.status === 'PASS').length || 0
  const totalCount = selfcheck?.checks?.length || 0
  const overallOk = selfcheck?.overall === 'PASS'
  const errorCount = errors.length

  // ─── STYLES ───
  const page = { minHeight: '100vh', background: T.bg, color: T.text, fontFamily: T.font || 'Inter, system-ui, sans-serif', padding: '24px 32px' }
  const card = { background: T.card, border: `0.5px solid ${T.border}`, borderRadius: 10, padding: 20, marginBottom: 16 }
  const cardHeader = { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, fontSize: 12, fontWeight: 500, color: T.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 }
  const tileGrid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }
  const tile = (ok) => ({
    padding: '12px 14px', borderRadius: 8,
    background: ok ? 'rgba(45,212,191,0.04)' : 'rgba(248,113,113,0.06)',
    border: `0.5px solid ${ok ? 'rgba(45,212,191,0.20)' : 'rgba(248,113,113,0.25)'}`,
    display: 'flex', alignItems: 'center', gap: 10,
  })
  const statCard = { padding: '14px 16px', borderRadius: 8, background: T.surface, border: `0.5px solid ${T.border}`, minWidth: 140 }
  const statVal = { fontSize: 22, fontWeight: 600, color: T.text, lineHeight: 1 }
  const statLabel = { fontSize: 10, color: T.textTertiary, marginTop: 6, textTransform: 'uppercase', letterSpacing: 0.5 }

  return (
    <div style={page}>
      {/* ═══ HEADER ═══ */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button onClick={() => nav('/')} style={{ background: 'transparent', border: `0.5px solid ${T.border}`, color: T.textSecondary, padding: '7px 10px', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontSize: 11 }}><ArrowLeft size={12} />Home</button>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 500, color: T.text, margin: 0 }}>System Control Room</h1>
            <div style={{ fontSize: 11, color: T.textTertiary, marginTop: 2 }}>
              Bundle <code style={{ color: T.textSecondary, background: T.surface, padding: '1px 6px', borderRadius: 3 }}>{bundleHash || '...'}</code>
              {' · '}Auto-refresh every 30s
              {lastRefresh && ` · last refresh ${secondsAgo}s ago`}
            </div>
          </div>
        </div>
        <button
          onClick={fetchAll}
          disabled={refreshing}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 14px', borderRadius: 6,
            border: `0.5px solid ${T.border}`, background: T.surface,
            color: T.text, fontSize: 11, cursor: refreshing ? 'wait' : 'pointer',
          }}
        >
          <RefreshCw size={12} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
          {refreshing ? 'Refreshing...' : 'Refresh now'}
        </button>
      </div>

      {/* ═══ HEADLINE STATUS ═══ */}
      <div style={{ ...card, background: overallOk ? 'rgba(45,212,191,0.03)' : 'rgba(248,113,113,0.04)', border: `0.5px solid ${overallOk ? 'rgba(45,212,191,0.20)' : 'rgba(248,113,113,0.25)'}`, display: 'flex', alignItems: 'center', gap: 20 }}>
        {overallOk
          ? <CheckCircle2 size={40} color="#2DD4BF" />
          : <AlertTriangle size={40} color="#F87171" />}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 28, fontWeight: 600, color: overallOk ? '#2DD4BF' : '#F87171', lineHeight: 1 }}>
            {passCount} / {totalCount} {overallOk ? 'ALL SYSTEMS OPERATIONAL' : 'ATTENTION REQUIRED'}
          </div>
          <div style={{ fontSize: 11, color: T.textSecondary, marginTop: 6 }}>
            {overallOk
              ? 'Every invariant is passing. Kiko is healthy.'
              : `${totalCount - passCount} check${totalCount - passCount === 1 ? '' : 's'} failing — see the System Health tiles below for which one.`}
          </div>
        </div>
      </div>

      {/* ═══ DATA STATS ═══ */}
      <div style={card}>
        <div style={cardHeader}><Database size={12} /><span>Data Snapshot</span></div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <div style={statCard}><div style={statVal}>{stats?.partnerships ?? '—'}</div><div style={statLabel}>Partnerships Active</div></div>
          <div style={statCard}><div style={{ ...statVal, color: stats?.nullCat > 0 ? '#F87171' : T.text }}>{stats?.nullCat ?? '—'}</div><div style={statLabel}>NULL Category</div></div>
          <div style={statCard}><div style={statVal}>{stats?.sequences ?? '—'}</div><div style={statLabel}>Sequences</div></div>
          <div style={statCard}><div style={statVal}>{stats?.enrollments ?? '—'}</div><div style={statLabel}>Enrollments</div></div>
          <div style={statCard}><div style={statVal}>{stats?.queuedEmails ?? '—'}</div><div style={statLabel}>Queued Emails</div></div>
          <div style={statCard}><div style={statVal}>{stats?.linkedinQueue ?? '—'}</div><div style={statLabel}>LinkedIn Queue</div></div>
          <div style={statCard}><div style={statVal}>{stats?.activeAlerts ?? '—'}</div><div style={statLabel}>Active Alerts</div></div>
          <div style={statCard}><div style={statVal}>{stats?.contacts ?? '—'}</div><div style={statLabel}>Contacts</div></div>
          <div style={statCard}><div style={statVal}>{stats?.organisations ?? '—'}</div><div style={statLabel}>Organisations</div></div>
          <div style={statCard}><div style={statVal}>{stats?.deals ?? '—'}</div><div style={statLabel}>Deals</div></div>
        </div>
      </div>

      {/* ═══ SELFCHECK TILES ═══ */}
      <div style={card}>
        <div style={cardHeader}><Zap size={12} /><span>System Health ({totalCount} invariants)</span></div>
        <div style={tileGrid}>
          {(selfcheck?.checks || []).map(c => {
            const ok = c.status === 'PASS'
            return (
              <div key={c.name} style={tile(ok)}>
                {ok
                  ? <CheckCircle2 size={14} color="#2DD4BF" style={{ flexShrink: 0 }} />
                  : <XCircle size={14} color="#F87171" style={{ flexShrink: 0 }} />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 500, color: ok ? T.text : '#F87171', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name}</div>
                  {!ok && c.actual && <div style={{ fontSize: 9, color: T.textTertiary, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{String(c.actual).slice(0, 60)}</div>}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ═══ CRON ACTIVITY ═══ */}
      <div style={card}>
        <div style={cardHeader}><Clock size={12} /><span>Cron Activity (last 24h · {heartbeats.length} unique crons · most recent run per cron)</span></div>
        {heartbeats.length === 0 ? (
          <div style={{ fontSize: 11, color: T.textTertiary, fontStyle: 'italic' }}>No cron activity in the last 24 hours.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {heartbeats.map((hb, i) => {
              const bg = hb.status === 'error' ? 'rgba(248,113,113,0.06)' : hb.status === 'finished' ? 'rgba(45,212,191,0.03)' : 'rgba(167,139,250,0.03)'
              const bd = hb.status === 'error' ? 'rgba(248,113,113,0.25)' : hb.status === 'finished' ? 'rgba(45,212,191,0.15)' : 'rgba(167,139,250,0.15)'
              const when = new Date(hb.started_at)
              const mins = Math.round((Date.now() - when.getTime()) / 60000)
              const agoText = mins < 1 ? 'just now' : mins < 60 ? `${mins}m ago` : `${Math.round(mins/60)}h ago`
              return (
                <div key={i} style={{ padding: '8px 12px', borderRadius: 6, background: bg, border: `0.5px solid ${bd}`, display: 'flex', alignItems: 'center', gap: 10, fontSize: 11 }}>
                  <span style={{
                    fontSize: 9, fontWeight: 500, textTransform: 'uppercase', letterSpacing: 0.5, padding: '2px 6px', borderRadius: 3,
                    background: hb.status === 'error' ? 'rgba(248,113,113,0.15)' : hb.status === 'finished' ? 'rgba(45,212,191,0.12)' : 'rgba(167,139,250,0.12)',
                    color: hb.status === 'error' ? '#F87171' : hb.status === 'finished' ? '#2DD4BF' : '#A78BFA',
                    minWidth: 60, textAlign: 'center',
                  }}>{hb.status}</span>
                  <span style={{ color: T.text, fontWeight: 500, flex: 1 }}>{hb.cron_name}</span>
                  {hb.duration_ms != null && <span style={{ color: T.textTertiary, fontSize: 10 }}>{(hb.duration_ms / 1000).toFixed(1)}s</span>}
                  {hb.records_processed != null && hb.records_processed > 0 && <span style={{ color: T.textSecondary, fontSize: 10 }}>{hb.records_processed} rec</span>}
                  <span style={{ color: T.textTertiary, fontSize: 10, minWidth: 60, textAlign: 'right' }}>{agoText}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ═══ HEALTH ALERTS ═══ Surfaces system_health rows from kiko_alerts.
          These used to be emailed (cron-health-check WARNING emails) but are
          now in-app only per Sunny's request. ═══ */}
      <div style={card}>
        <div style={cardHeader}><Activity size={12} /><span>Health Center · {healthAlerts.length} active alert{healthAlerts.length === 1 ? '' : 's'}</span></div>
        {healthAlerts.length === 0 ? (
          <div style={{ padding: '12px 14px', borderRadius: 8, background: 'rgba(45,212,191,0.04)', border: '0.5px solid rgba(45,212,191,0.20)', fontSize: 11, color: '#2DD4BF', display: 'flex', alignItems: 'center', gap: 8 }}>
            <CheckCircle2 size={14} />All systems healthy. No active alerts.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {healthAlerts.map((a) => {
              const isCritical = a.severity === 'critical' || a.severity === 'high'
              const accent = isCritical ? '#EF4444' : '#FBBF24'
              const bg = isCritical ? 'rgba(239,68,68,0.04)' : 'rgba(251,191,36,0.04)'
              const border = isCritical ? 'rgba(239,68,68,0.22)' : 'rgba(251,191,36,0.22)'
              return (
                <div key={a.id} style={{ padding: '12px 14px', borderRadius: 8, background: bg, border: `0.5px solid ${border}`, borderLeft: `3px solid ${accent}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                    <span style={{ color: accent, fontSize: 11, fontWeight: 600 }}>{(a.severity || 'warning').toUpperCase()}</span>
                    <span style={{ color: T.textTertiary, fontSize: 9 }}>{new Date(a.created_at).toLocaleString('en-GB')}</span>
                  </div>
                  <div style={{ color: T.text, fontSize: 12, fontWeight: 500, marginBottom: 4 }}>{a.title}</div>
                  <div style={{ color: T.textSecondary, fontSize: 11, lineHeight: 1.4 }}>{(a.detail || '').slice(0, 400)}</div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ═══ ERROR LOG ═══ */}
      <div style={card}>
        <div style={cardHeader}><AlertTriangle size={12} /><span>Error Log (last 24h · {errorCount} {errorCount === 1 ? 'error' : 'errors'})</span></div>
        {errorCount === 0 ? (
          <div style={{ padding: '12px 14px', borderRadius: 8, background: 'rgba(45,212,191,0.04)', border: '0.5px solid rgba(45,212,191,0.20)', fontSize: 11, color: '#2DD4BF', display: 'flex', alignItems: 'center', gap: 8 }}>
            <CheckCircle2 size={14} />Zero errors in the last 24 hours.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {errors.map((e, i) => (
              <div key={i} style={{ padding: '10px 12px', borderRadius: 6, background: 'rgba(248,113,113,0.04)', border: '0.5px solid rgba(248,113,113,0.20)', fontSize: 11 }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ color: '#F87171', fontWeight: 500 }}>{e.component}</span>
                  <span style={{ color: T.textTertiary, fontSize: 9 }}>{new Date(e.created_at).toLocaleString('en-GB')}</span>
                </div>
                <div style={{ color: T.textSecondary, fontSize: 10, fontFamily: 'monospace' }}>{(e.error_message || '').slice(0, 220)}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ textAlign: 'center', fontSize: 10, color: T.textMuted, marginTop: 20, marginBottom: 20 }}>
        Kiko System Control Room · Live auto-refresh every 30s · /admin/system
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
