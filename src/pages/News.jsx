import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, Loader2, Search, X, ExternalLink, Star } from 'lucide-react'
import { supabase } from '@/lib/supabase'

const T = {
  bg: '#07070B', surface: 'rgba(255,255,255,0.04)',
  border: 'rgba(255,255,255,0.08)', borderHover: 'rgba(255,255,255,0.12)',
  text: 'rgba(255,255,255,0.85)', textSecondary: 'rgba(255,255,255,0.45)', textTertiary: 'rgba(255,255,255,0.25)',
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
  deal:    { bg: 'rgba(225,6,0,0.08)', border: 'rgba(225,6,0,0.2)', text: '#FF6B6B', badge: '#E24B4A', label: 'Deal signal' },
  partner: { bg: 'rgba(55,138,221,0.08)', border: 'rgba(55,138,221,0.2)', text: '#85B7EB', badge: '#378ADD', label: 'Partnership' },
  official:{ bg: 'rgba(99,153,34,0.08)', border: 'rgba(99,153,34,0.2)', text: '#97C459', badge: '#639922', label: 'Official' },
  market:  { bg: 'rgba(239,159,39,0.08)', border: 'rgba(239,159,39,0.2)', text: '#EF9F27', badge: '#BA7517', label: 'Market' },
  fe:      { bg: 'rgba(127,119,221,0.08)', border: 'rgba(127,119,221,0.2)', text: '#AFA9EC', badge: '#7F77DD', label: 'Formula E' },
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
  const summary = article.summary?.replace(/^Official news from [^:]+:\s*/i, '').slice(0, 160)

  if (featured) {
    // Hero card for deal signals
    return (
      <div style={{ background: T.surface, border: `1.5px solid ${T.border}`, borderLeft: `3px solid ${sig.text || 'rgba(255,255,255,0.1)'}`, borderRadius: 16, padding: '20px 24px', cursor: 'default', transition: 'border-color 0.15s' }}
        onMouseEnter={e => e.currentTarget.style.borderColor = T.borderHover}
        onMouseLeave={e => e.currentTarget.style.borderColor = T.border}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          {sig.label && <span style={{ fontSize: 9, fontWeight: 400, letterSpacing: '0.04em', textTransform: 'uppercase', color: sig.text, background: sig.bg, border: `1px solid ${sig.border}`, padding: '2px 8px', borderRadius: 6 }}>{sig.label}</span>}
          {score >= 7 && <span style={{ fontSize: 10, color: sig.text || T.textTertiary }}>{score}/10</span>}
          <span style={{ fontSize: 10, color: T.textTertiary, marginLeft: 'auto' }}>{timeAgo(article.published_at)}</span>
          <button onClick={() => onStar(article)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: article.is_starred ? T.yellow : 'rgba(255,255,255,0.08)' }}><Star size={13} fill={article.is_starred ? T.yellow : 'none'} /></button>
        </div>
        <div style={{ fontSize: 16, fontWeight: 300, lineHeight: 1.45, color: T.text, marginBottom: 6, letterSpacing: '-0.01em' }}>{article.title}</div>
        {summary && <div style={{ fontSize: 12, color: T.textTertiary, lineHeight: 1.5, marginBottom: 8 }}>{summary}</div>}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.12)' }}>{article.source_name}</span>
          {article.url && <a href={article.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: sig.text || T.textSecondary, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4, opacity: 0.6, transition: 'opacity 0.15s' }} onMouseEnter={e => e.currentTarget.style.opacity = '1'} onMouseLeave={e => e.currentTarget.style.opacity = '0.6'}>Read <ExternalLink size={9} /></a>}
        </div>
      </div>
    )
  }

  // Compact row for general articles
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '10px 18px', borderRadius: 12, background: T.surface, border: `1px solid rgba(255,255,255,0.05)`, cursor: 'default', transition: 'all 0.15s' }}
      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.borderColor = T.border }}
      onMouseLeave={e => { e.currentTarget.style.background = T.surface; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.05)' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 400, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.4 }}>{article.title}</div>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.12)', marginTop: 2 }}>{article.source_name} · {timeAgo(article.published_at)}</div>
      </div>
      <button onClick={() => onStar(article)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: article.is_starred ? T.yellow : 'rgba(255,255,255,0.06)', flexShrink: 0 }}><Star size={12} fill={article.is_starred ? T.yellow : 'none'} /></button>
      {article.url && <a href={article.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: T.textTertiary, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0, opacity: 0.5, transition: 'opacity 0.15s', padding: '4px 10px', borderRadius: 50, border: `1px solid rgba(255,255,255,0.06)` }} onMouseEnter={e => e.currentTarget.style.opacity = '1'} onMouseLeave={e => e.currentTarget.style.opacity = '0.5'}>Read <ExternalLink size={9} /></a>}
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 50, border: `1px solid ${T.border}`, background: T.bg, width: 200 }}>
            <Search size={12} color={T.textTertiary} style={{ flexShrink: 0 }} />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…"
              style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: 12, color: T.text, width: '100%', fontFamily: T.font }} />
            {search && <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: T.textTertiary, display: 'flex' }}><X size={11} /></button>}
          </div>

          {/* Category filters */}
          <div style={{ display: 'flex', gap: 4, flex: 1, flexWrap: 'wrap' }}>
            {FILTERS.map(f => (
              <button key={f.id} onClick={() => setFilter(f.id)} style={{
                padding: '5px 11px', borderRadius: 50, fontSize: 11, fontFamily: T.font, cursor: 'pointer',
                fontWeight: filter === f.id ? 500 : 400, whiteSpace: 'nowrap', transition: 'all 0.1s',
                border: filter === f.id ? `1px solid ${T.text}` : `1px solid ${T.border}`,
                background: filter === f.id ? T.text : T.surface,
                color: filter === f.id ? 'rgba(255,255,255,0.9)' : T.textSecondary,
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
                color: window === w.id ? 'rgba(255,255,255,0.9)' : T.textSecondary, transition: 'all 0.1s',
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
                <div style={{ fontSize: 9, fontWeight: 400, letterSpacing: '0.06em', textTransform: 'uppercase', color: T.textTertiary, marginBottom: 8 }}>
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
                <div style={{ fontSize: 9, fontWeight: 400, letterSpacing: '0.06em', textTransform: 'uppercase', color: T.textTertiary, marginBottom: 8, marginTop: featured.length > 0 ? 8 : 0 }}>
                  {featured.length > 0 ? 'More' : 'Articles'} · {rest.length}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
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
