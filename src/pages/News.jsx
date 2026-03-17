import { useState, useEffect, useRef, useCallback } from 'react'
import { Star, ExternalLink, RefreshCw, Loader2, Search, X } from 'lucide-react'

const T = {
  bg: '#FAFAFA', surface: '#FFFFFF', surfaceHover: '#F5F5F5',
  border: 'rgba(0,0,0,0.06)', borderHover: 'rgba(0,0,0,0.12)',
  text: '#1A1A1A', textSecondary: '#6B6B6B', textTertiary: '#ABABAB',
  red: '#C62828', redBg: 'rgba(198,40,40,0.08)',
  blue: '#0055CC', blueBg: 'rgba(0,85,204,0.08)',
  green: '#1a7a3a', greenBg: 'rgba(26,122,58,0.08)',
  amber: '#B86000', amberBg: 'rgba(184,96,0,0.08)',
  yellow: '#FF9500',
  font: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
}

const FILTERS = [
  { id: 'deal_signal', label: 'Deal signals' },
  { id: 'f1_sponsorship', label: 'F1' },
  { id: 'partnerships', label: 'Partnerships' },
  { id: 'formula_e', label: 'Formula E' },
  { id: 'market_activity', label: 'Market' },
  { id: 'team_news', label: 'Team news' },
  { id: 'all', label: 'All' },
]

const timeAgo = (date) => {
  if (!date) return ''
  const mins = Math.floor((Date.now() - new Date(date)) / 60000)
  if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h`
  return Math.floor(hrs / 24) === 1 ? 'Yesterday' : `${Math.floor(hrs / 24)}d`
}

const scoreColor = (s) => s >= 8 ? T.red : s >= 6 ? T.amber : T.textTertiary

function Badge({ article }) {
  if (article.deal_signal)
    return <span style={{ fontSize: 8, fontWeight: 700, color: T.red, background: T.redBg, padding: '2px 5px', borderRadius: 4, letterSpacing: '0.03em' }}>SIGNAL</span>
  if (article.intelligence?.is_partnership_announcement)
    return <span style={{ fontSize: 8, fontWeight: 700, color: T.blue, background: T.blueBg, padding: '2px 5px', borderRadius: 4, letterSpacing: '0.03em' }}>PARTNER</span>
  if (article.category === 'formula_e')
    return <span style={{ fontSize: 8, fontWeight: 700, color: T.green, background: T.greenBg, padding: '2px 5px', borderRadius: 4, letterSpacing: '0.03em' }}>FE</span>
  return null
}

// ── Article row in the list pane ──────────────────────────
function ArticleRow({ article, selected, onSelect, onStar }) {
  const score = article.relevance_score || 0
  const initials = (article.source_name || '?').slice(0, 2).toUpperCase()
  return (
    <div onClick={() => onSelect(article)}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 9, padding: '10px 12px',
        borderBottom: `1px solid ${T.border}`, cursor: 'pointer', transition: 'background 0.1s',
        background: selected ? T.surfaceHover : T.surface,
        borderLeft: selected ? `2px solid ${T.text}` : '2px solid transparent',
        paddingLeft: selected ? 10 : 12,
      }}
      onMouseEnter={e => { if (!selected) e.currentTarget.style.background = T.surfaceHover }}
      onMouseLeave={e => { if (!selected) e.currentTarget.style.background = T.surface }}>

      {/* Source avatar */}
      <div style={{
        width: 28, height: 28, borderRadius: 7, background: 'rgba(0,0,0,0.04)',
        border: `1px solid ${T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 10, fontWeight: 600, color: T.textSecondary, flexShrink: 0, marginTop: 1,
      }}>{initials}</div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 12, fontWeight: selected ? 500 : 400, color: T.text, lineHeight: 1.35,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          marginBottom: 4,
        }}>{article.title}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <Badge article={article} />
          <span style={{ fontSize: 9, color: T.textTertiary }}>{article.source_name} · {timeAgo(article.published_at)}</span>
        </div>
      </div>

      {/* Score + star */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
        <span style={{ fontSize: 11, fontWeight: 500, color: scoreColor(score), lineHeight: 1 }}>{score || '—'}</span>
        <div style={{ width: 24, height: 2, borderRadius: 1, background: T.border }}>
          <div style={{ height: '100%', width: `${score * 10}%`, borderRadius: 1, background: scoreColor(score), transition: 'width 0.3s' }} />
        </div>
        <button onClick={e => { e.stopPropagation(); onStar(article) }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: article.is_starred ? T.yellow : T.textTertiary, lineHeight: 1 }}>
          <Star size={11} fill={article.is_starred ? T.yellow : 'none'} />
        </button>
      </div>
    </div>
  )
}

// ── Reading pane ──────────────────────────────────────────
function ReadPane({ article, onStar, allArticles }) {
  if (!article) return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: T.textTertiary }}>
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" style={{ opacity: 0.25 }}>
        <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>
      </svg>
      <span style={{ fontSize: 12, fontFamily: T.font }}>Select an article</span>
    </div>
  )

  const score = article.relevance_score || 0
  const scColor = scoreColor(score)
  const insightColor = article.deal_signal ? T.red : article.intelligence?.is_partnership_announcement ? T.blue : T.textSecondary
  const crm = article.matched_companies || []
  const topics = article.key_topics || []

  // Build intelligence text
  const intel = article.intelligence
  const insightLines = []
  if (intel?.why_relevant) insightLines.push(intel.why_relevant)
  else if (intel?.partnership_team && intel?.partnership_partner) insightLines.push(`${intel.partnership_team} × ${intel.partnership_partner} deal confirmed.`)
  if (intel?.market_implication) insightLines.push(intel.market_implication)
  const insightText = insightLines.join(' ') || 'Relevant to F1 sponsorship activity — review for outreach opportunity.'

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '20px 22px', background: T.surface }}>
      {/* Top row: badges + open link */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12, gap: 10 }}>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
          {article.deal_signal && <span style={{ fontSize: 9, fontWeight: 700, color: T.red, background: T.redBg, padding: '2px 7px', borderRadius: 4 }}>DEAL SIGNAL</span>}
          {article.intelligence?.is_partnership_announcement && <span style={{ fontSize: 9, fontWeight: 700, color: T.blue, background: T.blueBg, padding: '2px 7px', borderRadius: 4 }}>PARTNERSHIP</span>}
          {article.category === 'formula_e' && <span style={{ fontSize: 9, fontWeight: 700, color: T.green, background: T.greenBg, padding: '2px 7px', borderRadius: 4 }}>FORMULA E</span>}
          <span style={{ fontSize: 9, fontWeight: 500, color: scColor, background: `${scColor}12`, padding: '2px 7px', borderRadius: 4 }}>{score}/10</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <button onClick={() => onStar(article)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: article.is_starred ? T.yellow : T.textTertiary, padding: '3px 4px', display: 'flex' }}>
            <Star size={13} fill={article.is_starred ? T.yellow : 'none'} />
          </button>
          <a href={article.article_url} target="_blank" rel="noopener noreferrer"
            style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: T.textSecondary, textDecoration: 'none', padding: '4px 9px', borderRadius: 6, border: `1px solid ${T.border}` }}
            onMouseEnter={e => e.currentTarget.style.background = T.surfaceHover}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            Open <ExternalLink size={10} />
          </a>
        </div>
      </div>

      {/* Title */}
      <h2 style={{ fontSize: 15, fontWeight: 500, color: T.text, lineHeight: 1.35, margin: '0 0 6px', fontFamily: T.font }}>{article.title}</h2>
      <p style={{ fontSize: 11, color: T.textTertiary, margin: '0 0 16px', fontFamily: T.font }}>{article.source_name} · {timeAgo(article.published_at)} ago</p>

      {/* Intelligence block */}
      <div style={{ padding: '11px 13px', borderRadius: 8, background: `${insightColor}07`, borderLeft: `3px solid ${insightColor}`, marginBottom: 16 }}>
        <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: insightColor, marginBottom: 5, fontFamily: T.font }}>Intelligence</div>
        <p style={{ fontSize: 12, color: T.text, lineHeight: 1.6, margin: 0, fontFamily: T.font }}>{insightText}</p>
      </div>

      {/* CRM matches */}
      {crm.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: T.textTertiary, marginBottom: 8, fontFamily: T.font }}>CRM matches</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {crm.map((c, i) => {
              const name = c.name || c
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 8, border: `1px solid ${T.border}`, background: T.bg }}>
                  <div style={{ width: 18, height: 18, borderRadius: 4, background: T.text, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, color: '#fff', fontWeight: 600 }}>{name[0]}</div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 500, color: T.text, lineHeight: 1.1, fontFamily: T.font }}>{name}</div>
                    <div style={{ fontSize: 9, color: T.textTertiary, fontFamily: T.font }}>In CRM</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Topics */}
      {topics.length > 0 && (
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: T.textTertiary, marginBottom: 8, fontFamily: T.font }}>Topics</div>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
            {topics.map((t, i) => (
              <span key={i} style={{ fontSize: 10, padding: '3px 9px', borderRadius: 20, border: `1px solid ${T.border}`, background: T.bg, color: T.textSecondary, fontFamily: T.font }}>{t}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main export ───────────────────────────────────────────
export default function News() {
  const [articles, setArticles] = useState([])
  const [allArticles, setAllArticles] = useState([])
  const [filter, setFilter] = useState('deal_signal')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [lastSync, setLastSync] = useState(null)
  const searchRef = useRef(null)

  useEffect(() => { fetchArticles() }, [filter, page])
  useEffect(() => { fetchAllStats() }, [])

  const fetchArticles = async () => {
    setLoading(true)
    setSelected(null)
    try {
      const params = new URLSearchParams({ action: 'list', page: String(page), limit: '60' })
      if (filter === 'deal_signal') params.set('deals', 'true')
      else if (filter === 'partnerships') params.set('partnerships', 'true')
      else if (filter !== 'all') params.set('category', filter)
      const res = await fetch(`/api/news-agent?${params}`)
      const data = await res.json()
      const arts = data.articles || []
      setArticles(arts.sort((a, b) => (b.relevance_score || 0) - (a.relevance_score || 0)))
      setTotal(data.total || 0)
    } catch (e) { console.error('[News]', e) }
    finally { setLoading(false) }
  }

  const fetchAllStats = async () => {
    try {
      const res = await fetch(`/api/news-agent?action=list&limit=200`)
      const data = await res.json()
      const arts = data.articles || []
      setAllArticles(arts)
      setLastSync(arts[0]?.published_at)
    } catch {}
  }

  const handleSync = async () => {
    setSyncing(true)
    try {
      await fetch('/api/news-agent', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'sync' }) })
      await Promise.all([fetchArticles(), fetchAllStats()])
    } catch {} finally { setSyncing(false) }
  }

  const handleStar = async (article) => {
    const newVal = !article.is_starred
    const update = a => a.id === article.id ? { ...a, is_starred: newVal } : a
    setArticles(p => p.map(update))
    if (selected?.id === article.id) setSelected(s => ({ ...s, is_starred: newVal }))
    await fetch('/api/news-agent', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'star', id: article.id, value: newVal }) })
  }

  // Stats
  const dealCount = allArticles.filter(a => a.deal_signal).length
  const partnerCount = allArticles.filter(a => a.intelligence?.is_partnership_announcement).length
  const crmCount = allArticles.filter(a => (a.matched_companies || []).length > 0).length

  // Filter counts per tab
  const filterCounts = {
    deal_signal: allArticles.filter(a => a.deal_signal).length,
    partnerships: allArticles.filter(a => a.intelligence?.is_partnership_announcement).length,
  }

  // Local search filter
  const displayed = search.trim()
    ? articles.filter(a => {
        const q = search.toLowerCase()
        return a.title?.toLowerCase().includes(q) || a.source_name?.toLowerCase().includes(q) ||
          (a.key_topics || []).some(t => t.toLowerCase().includes(q))
      })
    : articles

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', fontFamily: T.font, background: T.bg, color: T.text }}>

      {/* ── Header: search + pills + sync ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: `1px solid ${T.border}`, background: T.surface, flexShrink: 0 }}>
        {/* Search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 8, border: `1px solid ${T.border}`, background: T.bg, minWidth: 180, maxWidth: 220 }}>
          <Search size={12} color={T.textTertiary} style={{ flexShrink: 0 }} />
          <input ref={searchRef} value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search articles…"
            style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: 12, color: T.text, width: '100%', fontFamily: T.font }} />
          {search && <button onClick={() => setSearch('')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: T.textTertiary, display: 'flex' }}><X size={11} /></button>}
        </div>

        {/* Filter pills */}
        <div style={{ display: 'flex', gap: 4, flex: 1, overflowX: 'auto' }}>
          {FILTERS.map(f => {
            const isActive = filter === f.id
            const cnt = filterCounts[f.id]
            return (
              <button key={f.id} onClick={() => { setFilter(f.id); setPage(1) }} style={{
                padding: '5px 11px', borderRadius: 20, fontSize: 11, fontFamily: T.font,
                fontWeight: isActive ? 500 : 400, whiteSpace: 'nowrap', cursor: 'pointer',
                border: isActive ? `1px solid ${T.text}` : `1px solid ${T.border}`,
                background: isActive ? T.text : T.surface,
                color: isActive ? '#fff' : T.textSecondary,
                transition: 'all 0.1s',
              }}>
                {f.label}
                {cnt ? <span style={{ marginLeft: 4, fontSize: 10, opacity: 0.65 }}>{cnt}</span> : null}
              </button>
            )
          })}
        </div>

        {/* Right: updated + sync */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <span style={{ fontSize: 10, color: T.textTertiary }}>{lastSync ? `${timeAgo(lastSync)} ago` : '—'}</span>
          <button onClick={handleSync} disabled={syncing} style={{ width: 24, height: 24, borderRadius: 6, border: `1px solid ${T.border}`, background: T.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: T.textSecondary }}>
            {syncing ? <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> : <RefreshCw size={11} />}
          </button>
        </div>
      </div>

      {/* ── Stats bar ── */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${T.border}`, background: T.surface, flexShrink: 0 }}>
        {[
          { val: dealCount, label: 'Deal signals', accent: T.red, border: true },
          { val: partnerCount, label: 'Partnerships', accent: null, border: true },
          { val: allArticles.length || total, label: 'Total articles', accent: null, border: true },
          { val: crmCount, label: 'CRM matches', accent: null, border: false },
        ].map(({ val, label, accent, border }) => (
          <div key={label} style={{ flex: 1, padding: '9px 16px', borderRight: border ? `1px solid ${T.border}` : 'none' }}>
            <div style={{ fontSize: 19, fontWeight: 500, lineHeight: 1, color: accent || T.text }}>{val}</div>
            <div style={{ fontSize: 10, color: T.textTertiary, marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* ── Two-pane body ── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* List pane */}
        <div style={{ width: 320, flexShrink: 0, display: 'flex', flexDirection: 'column', borderRight: `1px solid ${T.border}`, overflow: 'hidden' }}>
          <div style={{ padding: '5px 12px', borderBottom: `1px solid ${T.border}`, background: T.bg, flexShrink: 0 }}>
            <span style={{ fontSize: 10, color: T.textTertiary }}>
              {loading ? 'Loading…' : `${displayed.length} article${displayed.length !== 1 ? 's' : ''}${search ? ' matching' : ''}`}
            </span>
          </div>

          <div style={{ flex: 1, overflowY: 'auto' }}>
            {loading ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
                <Loader2 size={18} color={T.textTertiary} style={{ animation: 'spin 1s linear infinite' }} />
              </div>
            ) : displayed.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center', fontSize: 12, color: T.textTertiary }}>
                {search ? 'No articles match' : 'No articles found'}
              </div>
            ) : (
              displayed.map(a => (
                <ArticleRow key={a.id} article={a} selected={selected?.id === a.id}
                  onSelect={setSelected} onStar={handleStar} />
              ))
            )}
            {total > 60 && !search && (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, padding: '10px 0', borderTop: `1px solid ${T.border}` }}>
                <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface, cursor: page <= 1 ? 'default' : 'pointer', opacity: page <= 1 ? 0.4 : 1, fontFamily: T.font, color: T.text }}>Prev</button>
                <span style={{ fontSize: 10, color: T.textTertiary }}>p{page} of {Math.ceil(total / 60)}</span>
                <button onClick={() => setPage(p => p + 1)} disabled={page >= Math.ceil(total / 60)} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface, cursor: 'pointer', fontFamily: T.font, color: T.text }}>Next</button>
              </div>
            )}
          </div>
        </div>

        {/* Reading pane */}
        <ReadPane article={selected} onStar={handleStar} allArticles={allArticles} />
      </div>
    </div>
  )
}
