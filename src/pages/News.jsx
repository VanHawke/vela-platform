import { useState, useEffect, useRef } from 'react'
import { Star, ExternalLink, RefreshCw, Loader2, Zap } from 'lucide-react'

const T = {
  bg: '#FAFAFA', surface: '#FFFFFF', surfaceHover: '#F5F5F5',
  border: 'rgba(0,0,0,0.06)', borderHover: 'rgba(0,0,0,0.12)',
  text: '#1A1A1A', textSecondary: '#6B6B6B', textTertiary: '#ABABAB',
  accent: '#1A1A1A', accentSoft: 'rgba(0,0,0,0.04)',
  red: '#C62828', redBg: 'rgba(198,40,40,0.08)',
  blue: '#0055CC', blueBg: 'rgba(0,85,204,0.08)',
  green: '#1a7a3a', greenBg: 'rgba(26,122,58,0.08)',
  yellow: '#FF9500',
  font: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
}

const TABS = [
  { id: 'deal_signal', label: 'Deal Signals' },
  { id: 'f1_sponsorship', label: 'F1 Sponsorship' },
  { id: 'partnerships', label: 'Partnerships' },
  { id: 'formula_e', label: 'Formula E' },
  { id: 'sports_sponsorship', label: 'Sponsorship' },
  { id: 'market_activity', label: 'Market Activity' },
  { id: 'team_news', label: 'Team News' },
  { id: 'all', label: 'All News' },
]

const timeAgo = (date) => {
  if (!date) return ''
  const mins = Math.floor((Date.now() - new Date(date)) / 60000)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  return days === 1 ? 'Yesterday' : `${days}d ago`
}

const imgFallbacks = [
  'linear-gradient(160deg,#0a0a14 0%,#1a1a3a 100%)',
  'linear-gradient(160deg,#0a0a00 0%,#2a2010 100%)',
  'linear-gradient(160deg,#0a000a 0%,#2a0a2a 100%)',
  'linear-gradient(160deg,#000a0a 0%,#0a2a2a 100%)',
  'linear-gradient(160deg,#0a0000 0%,#2a0808 100%)',
  'linear-gradient(160deg,#000a00 0%,#0a2a0a 100%)',
]

function ArticleBadges({ article }) {
  return (
    <>
      {article.deal_signal && (
        <span style={{ fontSize: 9, fontWeight: 600, color: T.red, background: T.redBg, padding: '1px 5px', borderRadius: 4 }}>DEAL SIGNAL</span>
      )}
      {article.intelligence?.is_partnership_announcement && (
        <span style={{ fontSize: 9, fontWeight: 600, color: T.blue, background: T.blueBg, padding: '1px 5px', borderRadius: 4 }}>PARTNERSHIP</span>
      )}
      {article.intelligence?.partnership_team && (
        <span style={{ fontSize: 9, fontWeight: 500, color: T.green, background: T.greenBg, padding: '1px 5px', borderRadius: 4 }}>
          {article.intelligence.partnership_team}
        </span>
      )}
    </>
  )
}

// ── Hero card (top 2 articles from A) ────────────────────
function HeroCard({ article, index, onStar }) {
  const [imgErr, setImgErr] = useState(false)
  const bg = imgFallbacks[index % imgFallbacks.length]
  return (
    <a href={article.article_url} target="_blank" rel="noopener noreferrer"
      style={{ textDecoration: 'none', display: 'flex', flexDirection: 'column', borderRight: index === 0 ? `1px solid ${T.border}` : 'none', cursor: 'pointer', flex: 1, minWidth: 0 }}
      onMouseOver={e => e.currentTarget.querySelector('.hero-text').style.background = T.surfaceHover}
      onMouseOut={e => e.currentTarget.querySelector('.hero-text').style.background = T.surface}>
      {/* Image */}
      <div style={{ height: 100, background: bg, position: 'relative', overflow: 'hidden', flexShrink: 0 }}>
        {article.image_url && !imgErr && (
          <img src={article.image_url} alt="" onError={() => setImgErr(true)}
            style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', inset: 0 }} />
        )}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.4) 0%, transparent 60%)' }} />
        <div style={{ position: 'absolute', top: 8, left: 8, display: 'flex', gap: 3 }}>
          <ArticleBadges article={article} />
        </div>
        <div style={{ position: 'absolute', top: 6, right: 6 }}>
          <button onClick={e => { e.preventDefault(); e.stopPropagation(); onStar(article) }}
            style={{ background: 'rgba(0,0,0,0.3)', border: 'none', borderRadius: 5, cursor: 'pointer', padding: '3px 4px', display: 'flex', color: article.is_starred ? T.yellow : 'rgba(255,255,255,0.7)' }}>
            <Star size={12} fill={article.is_starred ? T.yellow : 'none'} />
          </button>
        </div>
        {/* Relevance bar */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 2, background: 'rgba(255,255,255,0.15)' }}>
          <div style={{ height: '100%', width: `${(article.relevance_score || 0) * 10}%`, background: article.relevance_score >= 8 ? T.red : T.yellow, transition: 'width 0.3s' }} />
        </div>
      </div>
      {/* Text */}
      <div className="hero-text" style={{ padding: '10px 12px', background: T.surface, flex: 1, transition: 'background 0.12s' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
          <span style={{ fontSize: 9, fontWeight: 500, color: T.textTertiary }}>{article.source_name}</span>
          <span style={{ fontSize: 9, color: T.textTertiary, opacity: 0.4 }}>·</span>
          <span style={{ fontSize: 9, color: T.textTertiary }}>{timeAgo(article.published_at)}</span>
          <span style={{ marginLeft: 'auto', fontSize: 9, fontWeight: 500, color: article.relevance_score >= 8 ? T.red : T.yellow }}>{article.relevance_score}/10</span>
        </div>
        <div style={{ fontSize: 12, fontWeight: 500, color: T.text, lineHeight: 1.35, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {article.title}
        </div>
      </div>
    </a>
  )
}

// ── Ranked feed item (from B) ─────────────────────────────
function FeedItem({ article, rank, onStar }) {
  const [imgErr, setImgErr] = useState(false)
  const bg = imgFallbacks[rank % imgFallbacks.length]
  return (
    <div style={{ display: 'flex', gap: 10, padding: '9px 14px', borderBottom: `1px solid ${T.border}`, alignItems: 'flex-start', cursor: 'pointer', transition: 'background 0.1s' }}
      onMouseOver={e => e.currentTarget.style.background = T.surfaceHover}
      onMouseOut={e => e.currentTarget.style.background = 'transparent'}>
      <span style={{ fontSize: 15, fontWeight: 500, color: T.border, width: 18, flexShrink: 0, paddingTop: 1, lineHeight: 1.2, userSelect: 'none' }}>{rank}</span>
      {/* Thumb */}
      <div style={{ width: 48, height: 36, borderRadius: 5, flexShrink: 0, overflow: 'hidden', background: bg, position: 'relative' }}>
        {article.image_url && !imgErr && (
          <img src={article.image_url} alt="" onError={() => setImgErr(true)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <a href={article.article_url} target="_blank" rel="noopener noreferrer"
          style={{ fontSize: 12, fontWeight: 500, color: T.text, textDecoration: 'none', lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', marginBottom: 3 }}>
          {article.title}
        </a>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
          <ArticleBadges article={article} />
          <span style={{ fontSize: 9, color: T.textTertiary }}>{article.source_name} · {timeAgo(article.published_at)}</span>
        </div>
      </div>
      <button onClick={e => { e.stopPropagation(); onStar(article) }}
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: article.is_starred ? T.yellow : T.textTertiary, padding: 2, flexShrink: 0 }}>
        <Star size={12} fill={article.is_starred ? T.yellow : 'none'} />
      </button>
    </div>
  )
}

// ── Right panel signal card ───────────────────────────────
function SignalCard({ article }) {
  return (
    <a href={article.article_url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none', display: 'block' }}>
      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: '8px 10px', marginBottom: 6, cursor: 'pointer', transition: 'border-color 0.12s' }}
        onMouseOver={e => e.currentTarget.style.borderColor = T.borderHover}
        onMouseOut={e => e.currentTarget.style.borderColor = T.border}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 3 }}>
          <div style={{ width: 5, height: 5, borderRadius: '50%', background: T.red, flexShrink: 0 }} />
          <span style={{ fontSize: 8, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: T.red }}>Deal signal</span>
        </div>
        <div style={{ fontSize: 11, fontWeight: 500, color: T.text, lineHeight: 1.3, marginBottom: 2, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {article.title}
        </div>
        <div style={{ fontSize: 9, color: T.textTertiary }}>{article.source_name} · {timeAgo(article.published_at)}</div>
      </div>
    </a>
  )
}

// ── Right panel section header ────────────────────────────
function RightLabel({ children }) {
  return (
    <div style={{ fontSize: 9, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', color: T.textTertiary, marginBottom: 8 }}>
      {children}
    </div>
  )
}

// ── Stat bar item (from C) ────────────────────────────────
function StatItem({ value, label, accent, borderRight }) {
  return (
    <div style={{ padding: '10px 16px', borderRight: borderRight ? `1px solid ${T.border}` : 'none', flex: 1 }}>
      <div style={{ fontSize: 20, fontWeight: 500, lineHeight: 1, color: accent || T.text }}>{value}</div>
      <div style={{ fontSize: 10, color: T.textTertiary, marginTop: 2 }}>{label}</div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────
export default function News() {
  const [articles, setArticles] = useState([])
  const [allArticles, setAllArticles] = useState([]) // for stats
  const [category, setCategory] = useState('deal_signal')
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [lastSync, setLastSync] = useState(null)

  // Fetch articles for current tab
  useEffect(() => { fetchArticles() }, [category, page])
  // Fetch all once for stats
  useEffect(() => { fetchAllStats() }, [])

  const fetchArticles = async () => {
    setLoading(articles.length === 0)
    try {
      const params = new URLSearchParams({ action: 'list', page: String(page), limit: '50' })
      if (category === 'deal_signal') params.set('deals', 'true')
      else if (category === 'partnerships') params.set('partnerships', 'true')
      else if (category !== 'all') params.set('category', category)
      const res = await fetch(`/api/news-agent?${params}`)
      const data = await res.json()
      setArticles(data.articles || [])
      setTotal(data.total || 0)
    } catch (e) { console.error('[News]', e) }
    finally { setLoading(false) }
  }

  const fetchAllStats = async () => {
    try {
      const res = await fetch(`/api/news-agent?action=list&limit=200`)
      const data = await res.json()
      setAllArticles(data.articles || [])
      setLastSync(data.articles?.[0]?.published_at)
    } catch {}
  }

  const handleSync = async () => {
    setSyncing(true)
    try {
      await fetch('/api/news-agent', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'sync' }) })
      await fetchArticles()
      await fetchAllStats()
    } catch {} finally { setSyncing(false) }
  }

  const handleStar = async (article) => {
    const newVal = !article.is_starred
    setArticles(prev => prev.map(a => a.id === article.id ? { ...a, is_starred: newVal } : a))
    await fetch('/api/news-agent', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'star', id: article.id, value: newVal }) })
  }

  // Derive stats from all articles
  const dealSignals = allArticles.filter(a => a.deal_signal)
  const partnerships = allArticles.filter(a => a.intelligence?.is_partnership_announcement)
  const crmMatches = allArticles.filter(a => (a.matched_companies || []).length > 0)

  // Split articles: top 2 heroes + rest as ranked feed
  const sorted = [...articles].sort((a, b) => (b.relevance_score || 0) - (a.relevance_score || 0))
  const heroes = sorted.slice(0, 2)
  const feedItems = sorted.slice(2)

  // Right panel: deal signals (from all articles, not just current tab)
  const rightSignals = dealSignals.slice(0, 5)

  // Feed health: top sources
  const sourceCounts = allArticles.reduce((acc, a) => {
    if (a.source_name) acc[a.source_name] = (acc[a.source_name] || 0) + 1
    return acc
  }, {})
  const topSources = Object.entries(sourceCounts).sort((a, b) => b[1] - a[1]).slice(0, 5)
  const otherCount = Object.entries(sourceCounts).slice(5).reduce((s, [, v]) => s + v, 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', fontFamily: T.font, background: T.bg, color: T.text }}>

      {/* ── Tab bar ───────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', borderBottom: `1px solid ${T.border}`, background: T.surface, flexShrink: 0, overflowX: 'auto' }}>
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => { setCategory(tab.id); setPage(1) }} style={{
            padding: '10px 15px', fontSize: 12, fontFamily: T.font, whiteSpace: 'nowrap',
            fontWeight: category === tab.id ? 500 : 400,
            color: category === tab.id ? T.text : T.textSecondary,
            background: 'none', border: 'none', borderBottom: category === tab.id ? `2px solid ${T.accent}` : '2px solid transparent',
            marginBottom: -1, cursor: 'pointer', transition: 'color 0.1s',
          }}>{tab.label}</button>
        ))}
        <div style={{ flex: 1 }} />
        <div style={{ padding: '0 14px', display: 'flex', alignItems: 'center', gap: 10, fontSize: 10, color: T.textTertiary, whiteSpace: 'nowrap' }}>
          <span>16 feeds</span>
          <span style={{ opacity: 0.4 }}>·</span>
          <span>{lastSync ? timeAgo(lastSync) : '—'}</span>
          <button onClick={handleSync} disabled={syncing} style={{ width: 24, height: 24, borderRadius: 6, border: `1px solid ${T.border}`, background: T.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: T.textSecondary }}>
            {syncing ? <Loader2 size={11} style={{ animation: 'spin 1s linear infinite' }} /> : <RefreshCw size={11} />}
          </button>
        </div>
      </div>

      {/* ── Stats bar (from C) ────────────────── */}
      <div style={{ display: 'flex', borderBottom: `1px solid ${T.border}`, background: T.surface, flexShrink: 0 }}>
        <StatItem value={dealSignals.length} label="Deal signals" accent={T.red} borderRight />
        <StatItem value={partnerships.length} label="Partnerships" borderRight />
        <StatItem value={allArticles.length || total} label="Total articles" borderRight />
        <StatItem value={crmMatches.length} label="CRM matches" />
      </div>

      {/* ── Body ─────────────────────────────── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* Left: hero + feed */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRight: `1px solid ${T.border}` }}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1 }}>
              <Loader2 size={20} color={T.textTertiary} style={{ animation: 'spin 1s linear infinite' }} />
            </div>
          ) : articles.length === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, fontSize: 13, color: T.textTertiary }}>
              No articles found
            </div>
          ) : (
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {/* Hero row (from A) */}
              {heroes.length > 0 && (
                <div style={{ display: 'flex', borderBottom: `1px solid ${T.border}` }}>
                  {heroes.map((a, i) => <HeroCard key={a.id} article={a} index={i} onStar={handleStar} />)}
                </div>
              )}
              {/* Ranked feed (from B) */}
              {feedItems.length > 0 && (
                <div>
                  <div style={{ padding: '7px 14px 3px', fontSize: 9, fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', color: T.textTertiary }}>
                    More stories
                  </div>
                  {feedItems.map((a, i) => <FeedItem key={a.id} article={a} rank={i + 3} onStar={handleStar} />)}
                </div>
              )}
              {/* Pagination */}
              {total > 50 && (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8, padding: '12px 0', borderTop: `1px solid ${T.border}` }}>
                  <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} style={{ padding: '5px 12px', fontSize: 11, borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface, color: T.text, cursor: page <= 1 ? 'default' : 'pointer', opacity: page <= 1 ? 0.4 : 1, fontFamily: T.font }}>Prev</button>
                  <span style={{ fontSize: 11, color: T.textTertiary }}>Page {page} of {Math.ceil(total / 50)}</span>
                  <button disabled={page >= Math.ceil(total / 50)} onClick={() => setPage(p => p + 1)} style={{ padding: '5px 12px', fontSize: 11, borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface, color: T.text, cursor: 'pointer', fontFamily: T.font }}>Next</button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right panel (from B, enriched) */}
        <div style={{ width: 220, flexShrink: 0, overflowY: 'auto', background: T.bg, padding: 12 }}>
          {/* Deal signals */}
          <RightLabel>Deal signals</RightLabel>
          {rightSignals.length === 0 ? (
            <div style={{ fontSize: 11, color: T.textTertiary, marginBottom: 16 }}>No signals found</div>
          ) : (
            rightSignals.map(a => <SignalCard key={a.id} article={a} />)
          )}

          {/* CRM matches */}
          {crmMatches.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <RightLabel>CRM matches</RightLabel>
              {crmMatches.slice(0, 5).map(a => {
                const companies = a.matched_companies || []
                return companies.slice(0, 1).map((c, i) => {
                  const name = c.name || c
                  const initials = name.slice(0, 2).toUpperCase()
                  return (
                    <div key={`${a.id}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: `1px solid ${T.border}` }}>
                      <div style={{ width: 22, height: 22, borderRadius: 5, background: T.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: '#fff', fontWeight: 500, flexShrink: 0 }}>{initials}</div>
                      <div>
                        <div style={{ fontSize: 11, fontWeight: 500, color: T.text, lineHeight: 1.2 }}>{name}</div>
                        <div style={{ fontSize: 9, color: T.textTertiary }}>In article</div>
                      </div>
                    </div>
                  )
                })
              })}
            </div>
          )}

          {/* Feed health */}
          {topSources.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <RightLabel>Feed health</RightLabel>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {topSources.map(([src, count]) => (
                  <div key={src} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: T.textSecondary }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 150 }}>{src}</span>
                    <span style={{ color: T.text, fontWeight: 500, flexShrink: 0 }}>{count}</span>
                  </div>
                ))}
                {otherCount > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: T.textTertiary, borderTop: `1px solid ${T.border}`, paddingTop: 4, marginTop: 2 }}>
                    <span>+ other feeds</span>
                    <span style={{ color: T.text, fontWeight: 500 }}>{otherCount}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
