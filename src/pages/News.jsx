import { useState, useEffect } from 'react'
import { Newspaper, Star, TrendingUp, Zap, Filter, ExternalLink, RefreshCw, Loader2 } from 'lucide-react'

const T = {
  bg: '#FAFAFA', surface: '#FFFFFF', surfaceHover: '#F5F5F5',
  border: 'rgba(0,0,0,0.06)', borderHover: 'rgba(0,0,0,0.12)',
  text: '#1A1A1A', textSecondary: '#6B6B6B', textTertiary: '#ABABAB',
  accent: '#1A1A1A', accentSoft: 'rgba(0,0,0,0.04)',
  blue: '#007AFF', red: '#FF3B30', yellow: '#FF9500', green: '#34C759',
  font: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
}

const CATEGORIES = [
  { id: 'all', label: 'All News' },
  { id: 'partnerships', label: 'Partnerships', icon: '🤝' },
  { id: 'sports_sponsorship', label: 'Sponsorship Deals' },
  { id: 'f1_sponsorship', label: 'F1 Sponsorship' },
  { id: 'market_activity', label: 'Market Activity' },
  { id: 'brand_ambassador', label: 'Brand Ambassador' },
  { id: 'formula_e', label: 'Formula E' },
  { id: 'f1_general', label: 'F1 General' },
  { id: 'team_news', label: 'Team News' },
]

const relevanceBadge = (score) => {
  if (score >= 8) return { label: 'High', color: T.red, bg: 'rgba(255,59,48,0.08)' }
  if (score >= 5) return { label: 'Medium', color: T.yellow, bg: 'rgba(255,149,0,0.08)' }
  return { label: 'Low', color: T.textTertiary, bg: T.accentSoft }
}

const timeAgo = (date) => {
  const mins = Math.floor((Date.now() - new Date(date)) / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return days === 1 ? 'Yesterday' : `${days}d ago`
}

export default function News() {
  const [articles, setArticles] = useState([])
  const [category, setCategory] = useState('sports_sponsorship')
  const [dealsOnly, setDealsOnly] = useState(false)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)

  useEffect(() => { fetchArticles() }, [category, dealsOnly, page])

  const fetchArticles = async () => {
    setLoading(articles.length === 0)
    try {
      const params = new URLSearchParams({ action: 'list', page: String(page), limit: '30' })
      if (category === 'partnerships') params.set('partnerships', 'true')
      else if (category !== 'all') params.set('category', category)
      if (dealsOnly) params.set('deals', 'true')
      const res = await fetch(`/api/news-agent?${params}`)
      const data = await res.json()
      setArticles(data.articles || [])
      setTotal(data.total || 0)
    } catch (e) { console.error('[News] Fetch error:', e) }
    finally { setLoading(false) }
  }

  const handleSync = async () => {
    setSyncing(true)
    try {
      await fetch('/api/news-agent', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'sync' }) })
      await fetchArticles()
    } catch {} finally { setSyncing(false) }
  }

  const handleStar = async (article) => {
    const newVal = !article.is_starred
    setArticles(prev => prev.map(a => a.id === article.id ? { ...a, is_starred: newVal } : a))
    await fetch('/api/news-agent', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'star', id: article.id, value: newVal }) })
  }

  return (
    <div style={{ display: 'flex', height: '100%', fontFamily: T.font, background: T.bg, color: T.text }}>
      {/* Sidebar — Categories */}
      <div style={{ width: 220, borderRight: `1px solid ${T.border}`, background: T.surface, padding: '16px 0', flexShrink: 0, overflowY: 'auto' }}>
        <div style={{ padding: '0 16px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: '-0.01em' }}>Categories</span>
          <button onClick={handleSync} disabled={syncing} style={{ background: 'none', border: 'none', cursor: 'pointer', color: T.textSecondary, display: 'flex', alignItems: 'center' }}>
            {syncing ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <RefreshCw size={14} />}
          </button>
        </div>
        {CATEGORIES.map(cat => (
          <button key={cat.id} onClick={() => { setCategory(cat.id); setPage(1) }} style={{
            display: 'block', width: '100%', textAlign: 'left', padding: '8px 16px', border: 'none', cursor: 'pointer', fontSize: 12,
            fontFamily: T.font, fontWeight: category === cat.id ? 600 : 400,
            background: category === cat.id ? T.accentSoft : 'transparent',
            color: category === cat.id ? T.text : T.textSecondary,
            borderRadius: 0,
          }}>{cat.label}</button>
        ))}
        <div style={{ borderTop: `1px solid ${T.border}`, margin: '8px 0' }} />
        <button onClick={() => { setDealsOnly(!dealsOnly); setPage(1) }} style={{
          display: 'flex', alignItems: 'center', gap: 6, width: '100%', textAlign: 'left', padding: '8px 16px', border: 'none', cursor: 'pointer', fontSize: 12,
          fontFamily: T.font, fontWeight: dealsOnly ? 600 : 400,
          background: dealsOnly ? 'rgba(255,59,48,0.06)' : 'transparent',
          color: dealsOnly ? T.red : T.textSecondary,
        }}><Zap size={12} /> Deal Signals Only</button>
        <div style={{ padding: '12px 16px', fontSize: 11, color: T.textTertiary }}>{total} articles</div>
      </div>

      {/* Main content — Article cards */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.02em', margin: 0 }}>
            {CATEGORIES.find(c => c.id === category)?.label || 'News'}{dealsOnly ? ' — Deal Signals' : ''}
          </h2>
          <span style={{ fontSize: 11, color: T.textTertiary }}>16 feeds · Auto-updates every 30 min</span>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: T.textTertiary }}>
            <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
          </div>
        ) : articles.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60, color: T.textTertiary, fontSize: 13 }}>No articles found</div>
        ) : (
          <div style={{ display: 'grid', gap: 12 }}>
            {articles.map(article => {
              const badge = relevanceBadge(article.relevance_score)
              return (
                <div key={article.id} style={{
                  background: T.surface, borderRadius: 10, border: `1px solid ${T.border}`, padding: 14,
                  display: 'flex', gap: 14, alignItems: 'flex-start', transition: 'border-color 0.15s',
                }} onMouseOver={e => e.currentTarget.style.borderColor = T.borderHover}
                   onMouseOut={e => e.currentTarget.style.borderColor = T.border}>

                  {/* Image thumbnail */}
                  {article.image_url && (
                    <img src={article.image_url} alt="" style={{ width: 80, height: 56, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }}
                      onError={e => e.target.style.display = 'none'} />
                  )}
                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <span style={{ fontSize: 10, color: T.textTertiary, fontWeight: 500 }}>{article.source_name}</span>
                      <span style={{ fontSize: 10, color: T.textTertiary }}>·</span>
                      <span style={{ fontSize: 10, color: T.textTertiary }}>{timeAgo(article.published_at)}</span>
                      {article.deal_signal && (
                        <span style={{ fontSize: 9, fontWeight: 600, color: T.red, background: 'rgba(255,59,48,0.08)', padding: '1px 5px', borderRadius: 4 }}>DEAL SIGNAL</span>
                      )}
                      {article.intelligence?.is_partnership_announcement && (
                        <span style={{ fontSize: 9, fontWeight: 600, color: T.blue, background: 'rgba(0,122,255,0.08)', padding: '1px 5px', borderRadius: 4 }}>PARTNERSHIP</span>
                      )}
                      {article.intelligence?.partnership_team && (
                        <span style={{ fontSize: 9, fontWeight: 500, color: T.green, background: 'rgba(52,199,89,0.08)', padding: '1px 5px', borderRadius: 4 }}>{article.intelligence.partnership_team} ← {article.intelligence.partnership_partner}</span>
                      )}
                    </div>
                    <a href={article.article_url} target="_blank" rel="noopener noreferrer" style={{
                      fontSize: 13, fontWeight: 500, color: T.text, textDecoration: 'none', lineHeight: 1.35,
                      display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
                    }}>{article.title}</a>

                    {/* Tags row */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 4, background: badge.bg, color: badge.color, fontWeight: 500 }}>
                        {badge.label} ({article.relevance_score}/10)
                      </span>
                      {(article.key_topics || []).slice(0, 3).map((t, i) => (
                        <span key={i} style={{ fontSize: 9, padding: '1px 5px', borderRadius: 4, background: T.accentSoft, color: T.textSecondary }}>{t}</span>
                      ))}
                      {(article.matched_companies || []).map((c, i) => (
                        <span key={i} style={{ fontSize: 9, padding: '1px 5px', borderRadius: 4, background: 'rgba(0,122,255,0.08)', color: T.blue, fontWeight: 500 }}>
                          {c.name || c}
                        </span>
                      ))}
                    </div>
                  </div>
                  {/* Actions */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
                    <button onClick={(e) => { e.stopPropagation(); handleStar(article) }} style={{
                      background: 'none', border: 'none', cursor: 'pointer', color: article.is_starred ? T.yellow : T.textTertiary, padding: 2
                    }}><Star size={14} fill={article.is_starred ? T.yellow : 'none'} /></button>
                    <a href={article.article_url} target="_blank" rel="noopener noreferrer" style={{ color: T.textTertiary, padding: 2 }}>
                      <ExternalLink size={14} />
                    </a>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Pagination */}
        {total > 30 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 16 }}>
            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} style={{
              padding: '6px 14px', fontSize: 11, borderRadius: 6, border: `1px solid ${T.border}`,
              background: T.surface, color: T.text, cursor: page <= 1 ? 'default' : 'pointer', opacity: page <= 1 ? 0.4 : 1, fontFamily: T.font
            }}>Previous</button>
            <span style={{ fontSize: 11, color: T.textTertiary, padding: '6px 0' }}>Page {page} of {Math.ceil(total / 30)}</span>
            <button disabled={page >= Math.ceil(total / 30)} onClick={() => setPage(p => p + 1)} style={{
              padding: '6px 14px', fontSize: 11, borderRadius: 6, border: `1px solid ${T.border}`,
              background: T.surface, color: T.text, cursor: page >= Math.ceil(total / 30) ? 'default' : 'pointer', opacity: page >= Math.ceil(total / 30) ? 0.4 : 1, fontFamily: T.font
            }}>Next</button>
          </div>
        )}
      </div>
    </div>
  )
}
