import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, Loader2, Search, X, ExternalLink, Star } from 'lucide-react'
import { supabase } from '@/lib/supabase'

const T = {
  bg: '#FAFAFA', surface: '#FFFFFF',
  border: 'rgba(0,0,0,0.06)', borderHover: 'rgba(0,0,0,0.12)',
  text: '#1A1A1A', textSecondary: '#6B6B6B', textTertiary: '#ABABAB',
  font: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  yellow: '#FF9500',
}

const FILTERS = [
  { id: 'all',          label: 'All' },
  { id: 'deal_signal',  label: 'Deal signals' },
  { id: 'partnerships', label: 'Partnerships' },
  { id: 'f1_sponsorship', label: 'F1' },
  { id: 'formula_e',   label: 'Formula E' },
  { id: 'market_activity', label: 'Market' },
]

const WINDOWS = [
  { id: 'today',  label: 'Today' },
  { id: 'week',   label: 'This week' },
  { id: 'month',  label: 'This month' },
  { id: 'all',    label: 'All time' },
]

// Signal config: color + label per type
const SIGNAL = {
  deal:    { bg: '#FCEBEB', border: '#F09595', text: '#791F1F', badge: '#E24B4A', label: 'Deal signal' },
  partner: { bg: '#E6F1FB', border: '#85B7EB', text: '#0C447C', badge: '#378ADD', label: 'Partnership' },
  official:{ bg: '#EAF3DE', border: '#97C459', text: '#27500A', badge: '#639922', label: 'Official' },
  market:  { bg: '#FAEEDA', border: '#EF9F27', text: '#633806', badge: '#BA7517', label: 'Market' },
  fe:      { bg: '#EEEDFE', border: '#AFA9EC', text: '#3C3489', badge: '#7F77DD', label: 'Formula E' },
  general: { bg: T.bg,      border: T.border,  text: T.textSecondary, badge: T.textTertiary, label: '' },
}

function getSignal(article) {
  if (article.deal_signal) return SIGNAL.deal
  if (article.intelligence?.is_partnership_announcement) return SIGNAL.partner
  if (article.category === 'formula_e') return SIGNAL.fe
  if (article.category === 'market_activity') return SIGNAL.market
  if ((article.source_name || '').includes('Official')) return SIGNAL.official
  return SIGNAL.general
}

const timeAgo = (date) => {
  if (!date) return ''
  const mins = Math.floor((Date.now() - new Date(date)) / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  if (hrs < 48) return 'Yesterday'
  return `${Math.floor(hrs / 24)}d ago`
}

function isInWindow(dateStr, windowId) {
  if (windowId === 'all') return true
  const d = new Date(dateStr)
  const now = new Date()
  if (windowId === 'today') {
    return d.toDateString() === now.toDateString()
  }
  if (windowId === 'week') {
    const cutoff = new Date(now); cutoff.setDate(now.getDate() - 7)
    return d >= cutoff
  }
  if (windowId === 'month') {
    const cutoff = new Date(now); cutoff.setDate(now.getDate() - 30)
    return d >= cutoff
  }
  return true
}

// ── Article card ──────────────────────────────────────────
function ArticleCard({ article, onStar, featured = false }) {
  const sig = getSignal(article)
  const score = article.relevance_score || 0
  const crm = (article.matched_companies || []).slice(0, 2)
  const isOfficial = (article.source_name || '').includes('Official')
  const summary = article.summary?.replace(/^Official news from [^:]+:\s*/i, '').slice(0, 160)

  const cardStyle = {
    background: featured ? sig.bg : T.surface,
    border: `0.5px solid ${featured ? sig.border : T.border}`,
    borderRadius: 12,
    padding: '14px 16px',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    cursor: 'default',
    transition: 'border-color 0.15s',
    position: 'relative',
  }

  return (
    <div style={cardStyle}
      onMouseEnter={e => e.currentTarget.style.borderColor = featured ? sig.border : T.borderHover}
      onMouseLeave={e => e.currentTarget.style.borderColor = featured ? sig.border : T.border}>

      {/* Top row: badges + time + star */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
        {sig.label && (
          <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.04em', textTransform: 'uppercase', color: sig.text, background: sig.bg, border: `0.5px solid ${sig.border}`, padding: '2px 6px', borderRadius: 4 }}>
            {sig.label}
          </span>
        )}
        {isOfficial && !sig.label.includes('Official') && (
          <span style={{ fontSize: 9, fontWeight: 500, color: '#27500A', background: '#EAF3DE', border: '0.5px solid #97C459', padding: '2px 6px', borderRadius: 4 }}>
            Official
          </span>
        )}
        {score >= 7 && (
          <span style={{ fontSize: 9, fontWeight: 600, color: sig.text || T.textTertiary, background: 'transparent', marginLeft: 2 }}>
            {score}/10
          </span>
        )}
        <span style={{ fontSize: 10, color: T.textTertiary, marginLeft: 'auto' }}>
          {timeAgo(article.published_at)}
        </span>
        <button onClick={e => { e.stopPropagation(); onStar(article) }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: article.is_starred ? T.yellow : T.textTertiary, display: 'flex', lineHeight: 1 }}>
          <Star size={12} fill={article.is_starred ? T.yellow : 'none'} />
        </button>
      </div>

      {/* Title */}
      <p style={{
        fontSize: featured ? 14 : 13, fontWeight: featured ? 500 : 400,
        color: featured ? sig.text : T.text, lineHeight: 1.4,
        margin: 0, fontFamily: T.font,
        display: '-webkit-box', WebkitLineClamp: featured ? 3 : 2,
        WebkitBoxOrient: 'vertical', overflow: 'hidden',
      }}>
        {article.title}
      </p>

      {/* Summary — only on featured or if has meaningful content */}
      {featured && summary && (
        <p style={{ fontSize: 11, color: sig.text, lineHeight: 1.5, margin: 0, opacity: 0.8 }}>
          {summary}
        </p>
      )}

      {/* CRM match chips */}
      {crm.length > 0 && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {crm.map((c, i) => {
            const name = c.name || c
            return (
              <span key={i} style={{ fontSize: 9, padding: '2px 6px', borderRadius: 4, background: 'rgba(0,0,0,0.04)', border: `0.5px solid ${T.border}`, color: T.textSecondary, fontFamily: T.font }}>
                {name} · CRM
              </span>
            )
          })}
        </div>
      )}

      {/* Bottom row: source + READ CTA */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 }}>
        <span style={{ fontSize: 10, color: T.textTertiary, fontFamily: T.font }}>
          {article.source_name?.replace(' (Official)', '') || '—'}
        </span>
        <a
          href={article.article_url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            fontSize: 11, fontWeight: 500,
            color: featured ? sig.text : T.textSecondary,
            background: featured ? `rgba(255,255,255,0.5)` : 'rgba(0,0,0,0.04)',
            border: `0.5px solid ${featured ? sig.border : T.border}`,
            padding: '4px 10px', borderRadius: 6,
            textDecoration: 'none',
            transition: 'all 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = featured ? 'rgba(255,255,255,0.75)' : 'rgba(0,0,0,0.07)' }}
          onMouseLeave={e => { e.currentTarget.style.background = featured ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.04)' }}
        >
          Read <ExternalLink size={9} />
        </a>
      </div>
    </div>
  )
}

// ── Main export ───────────────────────────────────────────
export default function News() {
  const [articles, setArticles] = useState([])
  const [filter, setFilter] = useState('all')
  const [window, setWindow] = useState('week')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)

  useEffect(() => { fetchArticles() }, [])

  const fetchArticles = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/news-agent?action=list&limit=200&page=1')
      const data = await res.json()
      // Sort chronologically — newest first
      const sorted = (data.articles || []).sort((a, b) => new Date(b.published_at) - new Date(a.published_at))
      setArticles(sorted)
    } catch (e) { console.error('[News]', e) }
    finally { setLoading(false) }
  }

  const handleSync = async () => {
    setSyncing(true)
    try {
      await fetch('/api/news-agent', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'sync' }) })
      await fetchArticles()
    } catch {} finally { setSyncing(false) }
  }

  const handleStar = useCallback(async (article) => {
    const newVal = !article.is_starred
    setArticles(prev => prev.map(a => a.id === article.id ? { ...a, is_starred: newVal } : a))
    await fetch('/api/news-agent', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'star', id: article.id, value: newVal }) })
  }, [])

  // Apply filters
  const displayed = articles.filter(a => {
    if (!isInWindow(a.published_at, window)) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      if (!a.title?.toLowerCase().includes(q) && !a.source_name?.toLowerCase().includes(q)) return false
    }
    if (filter === 'all') return true
    if (filter === 'deal_signal') return a.deal_signal
    if (filter === 'partnerships') return a.intelligence?.is_partnership_announcement || a.category === 'f1_sponsorship'
    return a.category === filter
  })

  // Stats
  const totalDeals = articles.filter(a => a.deal_signal).length
  const totalOfficial = articles.filter(a => (a.source_name || '').includes('Official')).length
  const todayCount = articles.filter(a => isInWindow(a.published_at, 'today')).length

  // Split into featured (top signals) + grid
  const featured = displayed.filter(a => a.deal_signal || a.intelligence?.is_partnership_announcement).slice(0, 2)
  const rest = displayed.filter(a => !featured.includes(a))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', fontFamily: T.font, background: T.bg, overflow: 'hidden' }}>

      {/* ── Header ── */}
      <div style={{ padding: '10px 16px', borderBottom: `1px solid ${T.border}`, background: T.surface, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>

          {/* Search */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 8, border: `1px solid ${T.border}`, background: T.bg, width: 200 }}>
            <Search size={12} color={T.textTertiary} style={{ flexShrink: 0 }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…"
              style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: 12, color: T.text, width: '100%', fontFamily: T.font }} />
            {search && <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: T.textTertiary, display: 'flex' }}><X size={11} /></button>}
          </div>

          {/* Category filters */}
          <div style={{ display: 'flex', gap: 4, flex: 1, flexWrap: 'wrap' }}>
            {FILTERS.map(f => (
              <button key={f.id} onClick={() => setFilter(f.id)} style={{
                padding: '5px 11px', borderRadius: 20, fontSize: 11, fontFamily: T.font, cursor: 'pointer',
                fontWeight: filter === f.id ? 500 : 400, whiteSpace: 'nowrap', transition: 'all 0.1s',
                border: filter === f.id ? `1px solid ${T.text}` : `1px solid ${T.border}`,
                background: filter === f.id ? T.text : T.surface,
                color: filter === f.id ? '#fff' : T.textSecondary,
              }}>{f.label}</button>
            ))}
          </div>

          {/* Time window */}
          <div style={{ display: 'flex', gap: 3 }}>
            {WINDOWS.map(w => (
              <button key={w.id} onClick={() => setWindow(w.id)} style={{
                padding: '5px 9px', borderRadius: 6, fontSize: 10, fontFamily: T.font, cursor: 'pointer',
                border: window === w.id ? `1px solid ${T.text}` : `1px solid ${T.border}`,
                background: window === w.id ? T.text : 'transparent',
                color: window === w.id ? '#fff' : T.textSecondary, transition: 'all 0.1s',
              }}>{w.label}</button>
            ))}
          </div>

          {/* Sync */}
          <button onClick={handleSync} disabled={syncing} style={{ width: 28, height: 28, borderRadius: 7, border: `1px solid ${T.border}`, background: T.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: T.textSecondary, flexShrink: 0 }}>
            {syncing ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <RefreshCw size={12} />}
          </button>
        </div>

        {/* Stats strip */}
        <div style={{ display: 'flex', gap: 20, marginTop: 8, paddingTop: 8, borderTop: `1px solid ${T.border}` }}>
          {[
            { val: displayed.length, label: 'showing' },
            { val: totalDeals, label: 'deal signals', accent: '#E24B4A' },
            { val: totalOfficial, label: 'official sources', accent: '#639922' },
            { val: todayCount, label: 'today' },
          ].map(({ val, label, accent }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
              <span style={{ fontSize: 15, fontWeight: 500, color: accent || T.text, lineHeight: 1 }}>{val}</span>
              <span style={{ fontSize: 10, color: T.textTertiary }}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Grid ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px' }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60 }}>
            <Loader2 size={20} color={T.textTertiary} style={{ animation: 'spin 1s linear infinite' }} />
          </div>
        ) : displayed.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: T.textTertiary, fontSize: 13 }}>
            {search ? 'No articles match' : 'No articles in this window'}
          </div>
        ) : (
          <>
            {/* Featured row — deal signals & partnerships */}
            {featured.length > 0 && (
              <>
                <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: T.textTertiary, marginBottom: 8 }}>
                  Signals
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: featured.length === 1 ? '1fr' : '1fr 1fr', gap: 10, marginBottom: 16 }}>
                  {featured.map(a => <ArticleCard key={a.id} article={a} onStar={handleStar} featured={true} />)}
                </div>
              </>
            )}

            {/* All articles grid */}
            {rest.length > 0 && (
              <>
                <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: T.textTertiary, marginBottom: 8, marginTop: featured.length > 0 ? 8 : 0 }}>
                  {featured.length > 0 ? 'More' : 'Articles'} · {rest.length}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
                  {rest.map(a => <ArticleCard key={a.id} article={a} onStar={handleStar} featured={false} />)}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
