// src/components/archive/ArchivePanel.jsx
// Archive view (tab inside Pipeline): lists archived deals; opening one shows a
// ring-fenced re-engagement dossier (correspondence timeline) plus Kiko's brief.
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { ArrowLeft, Mail, Linkedin, FileText, ChevronRight, Lock, Sparkles, RefreshCw } from 'lucide-react'
import './archive.css'

const API = 'https://api.vanhawke.agency'
const fmtValue = (v) => {
  const n = Number(v) || 0
  if (n >= 1e6) return (n / 1e6).toFixed(n % 1e6 ? 1 : 0) + 'M'
  if (n >= 1e3) return (n / 1e3).toFixed(0) + 'K'
  return String(n)
}
const fmtDate = (val) => {
  if (!val) return ''
  const dt = new Date(val)
  if (isNaN(dt)) return String(val).slice(0, 10)
  return dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}
const channelIcon = (ch) => ch === 'linkedin' ? Linkedin : ch === 'email' ? Mail : FileText
const channelLabel = (item) => {
  const src = item.source
  if (src === 'campaign') return `Campaign · step ${item.step ?? '—'}`
  if (src === 'campaign_reply') return 'Reply (campaign)'
  if (src === 'gmail') return 'Email reply'
  if (src === 'linkedin') return 'LinkedIn'
  if (src === 'activity') return item.channel || 'Note'
  return item.channel || 'Activity'
}

const VERDICT_LABEL = { warm_reopen: 'Warm reopen', cool_hold: 'Cool — hold', do_not_reopen: "Don't reopen" }
const VERDICT_CLASS = { warm_reopen: 'arch-v-warm', cool_hold: 'arch-v-hold', do_not_reopen: 'arch-v-no' }

function BriefSection({ dealId }) {
  const [brief, setBrief] = useState(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [stale, setStale] = useState(false)

  useEffect(() => {
    let alive = true
    ;(async () => {
      setLoading(true)
      try {
        const res = await fetch(`${API}/api/archive/brief`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dealId }),
        })
        const j = await res.json()
        if (alive) { setBrief(j.brief || null); setStale(!!j.stale) }
      } catch { /* ignore */ }
      if (alive) setLoading(false)
    })()
    return () => { alive = false }
  }, [dealId])

  async function generate() {
    setGenerating(true)
    try {
      const res = await fetch(`${API}/api/archive/brief`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dealId, generate: true }),
      })
      const j = await res.json()
      setBrief(j.brief || null); setStale(false)
    } catch { /* ignore */ }
    setGenerating(false)
  }

  return (
    <div className="arch-brief-slot">
      <div className="arch-brief-head">
        <span className="arch-brief-label"><Sparkles size={13} /> Kiko's re-engagement brief</span>
        {brief && !generating && (
          <button className={`arch-brief-refresh ${stale ? 'is-stale' : ''}`} onClick={generate}>
            <RefreshCw size={11} /> {stale ? 'Inputs changed — refresh' : 'Refresh'}
          </button>
        )}
      </div>

      {generating ? (
        <div className="arch-brief-loading">Kiko is reading the relationship, the company and the market — about 45 seconds…</div>
      ) : loading ? (
        <div className="arch-brief-loading">Checking for a brief…</div>
      ) : !brief ? (
        <button className="arch-brief-generate" onClick={generate}><Sparkles size={14} /> Generate Kiko's brief</button>
      ) : (
        <div className="arch-brief-body">
          <div className="arch-brief-top">
            {brief.verdict && <span className={`arch-verdict ${VERDICT_CLASS[brief.verdict] || ''}`}>{VERDICT_LABEL[brief.verdict] || brief.verdict}</span>}
            {brief.headline && <span className="arch-brief-headline">{brief.headline}</span>}
          </div>
          <div className="arch-brief-fields">
            {brief.counterpart_read && <div className="arch-brief-field"><span className="arch-brief-k">The counterpart</span><p>{brief.counterpart_read}</p></div>}
            {brief.company_context && <div className="arch-brief-field"><span className="arch-brief-k">The company now</span><p>{brief.company_context}</p></div>}
            {brief.recommendation && <div className="arch-brief-field"><span className="arch-brief-k">Recommendation</span><p>{brief.recommendation}</p></div>}
            {brief.suggested_angle && <div className="arch-brief-field arch-brief-angle"><span className="arch-brief-k">Suggested angle</span><p>{brief.suggested_angle}</p></div>}
            {brief.timing && <div className="arch-brief-field"><span className="arch-brief-k">Timing</span><p>{brief.timing}</p></div>}
          </div>
        </div>
      )}
    </div>
  )
}

function Dossier({ deal, dossier, loading, onBack }) {
  const d = deal.data || {}
  const tl = dossier?.timeline || []
  return (
    <div className="arch-dossier">
      <button className="arch-back" onClick={onBack}><ArrowLeft size={15} /> Archive</button>

      <div className="arch-dossier-head">
        <h2 className="arch-dossier-company">{d.company || d.title}</h2>
        <div className="arch-dossier-meta">
          {d.contact && <span className="arch-meta-name">{d.contact}</span>}
          {d.value ? <span className="arch-meta-value">${fmtValue(d.value)}</span> : null}
          {d.archive_reason && <span className="arch-reason-pill">{d.archive_reason}</span>}
        </div>
      </div>

      <BriefSection dealId={deal.id} />

      <div className="arch-timeline-head">
        <span className="arch-timeline-title">Correspondence</span>
        <span className="arch-timeline-flags">
          {dossier?.viewer?.scoped && <span className="arch-flag"><Lock size={11} /> Your correspondence only</span>}
          {dossier?.counts?.truncated && <span className="arch-flag">Most recent {tl.length}</span>}
        </span>
      </div>

      {loading ? (
        <div className="arch-empty">Loading correspondence…</div>
      ) : dossier?.error ? (
        <div className="arch-empty">Couldn't load this dossier ({dossier.error}).</div>
      ) : !tl.length ? (
        <div className="arch-empty">No correspondence on record for this prospect.</div>
      ) : (
        <div className="arch-timeline">
          {tl.map((item, i) => {
            const Icon = channelIcon(item.channel)
            const inbound = item.direction === 'inbound'
            return (
              <div key={i} className={`arch-item ${inbound ? 'arch-in' : 'arch-out'}`}>
                <div className="arch-item-rail"><span className="arch-dot"><Icon size={12} /></span></div>
                <div className="arch-item-body">
                  <div className="arch-item-top">
                    <span className="arch-item-channel">{channelLabel(item)}</span>
                    <span className="arch-item-dir">{inbound ? 'In' : 'Out'}</span>
                    <span className="arch-item-date">{fmtDate(item.date)}</span>
                  </div>
                  {item.subject && <div className="arch-item-subject">{item.subject}</div>}
                  {item.snippet && <div className="arch-item-snippet">{item.snippet}</div>}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function ArchivePanel({ user }) {
  const [deals, setDeals] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [dossier, setDossier] = useState(null)
  const [dossierLoading, setDossierLoading] = useState(false)

  useEffect(() => {
    let alive = true
    ;(async () => {
      setLoading(true)
      const { data } = await supabase
        .from('deals').select('id, data, updated_at')
        .eq('data->>status', 'archived').order('updated_at', { ascending: false })
      if (alive) { setDeals(data || []); setLoading(false) }
    })()
    return () => { alive = false }
  }, [])

  async function openDossier(deal) {
    setSelected(deal); setDossier(null); setDossierLoading(true)
    try {
      const res = await fetch(`${API}/api/archive/dossier`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dealId: deal.id }),
      })
      const json = await res.json()
      setDossier(res.ok ? json : { error: json.error || ('http_' + res.status) })
    } catch (e) {
      setDossier({ error: 'network' })
    }
    setDossierLoading(false)
  }

  if (selected) {
    return <Dossier deal={selected} dossier={dossier} loading={dossierLoading}
      onBack={() => { setSelected(null); setDossier(null) }} />
  }

  return (
    <div className="arch-wrap">
      <div className="arch-head">
        <h2 className="arch-title">Archive</h2>
        <p className="arch-sub">Dormant relationships — full history and re-engagement intelligence, ready to reopen.</p>
      </div>

      {loading ? (
        <div className="arch-empty">Loading archive…</div>
      ) : !deals.length ? (
        <div className="arch-empty">No archived deals yet.</div>
      ) : (
        <div className="arch-grid">
          {deals.map((dl) => {
            const d = dl.data || {}
            return (
              <button key={dl.id} className="arch-card" onClick={() => openDossier(dl)}>
                <div className="arch-card-top">
                  <span className="arch-card-company">{d.company || d.title}</span>
                  {d.value ? <span className="arch-card-value">${fmtValue(d.value)}</span> : null}
                </div>
                <div className="arch-card-contact">{d.contact || '—'}</div>
                {d.archive_reason && <div className="arch-card-reason">{d.archive_reason}</div>}
                <div className="arch-card-foot">
                  <span className="arch-card-date">Archived {fmtDate(d.archived_at)}</span>
                  <span className="arch-card-open">Open dossier <ChevronRight size={13} /></span>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
