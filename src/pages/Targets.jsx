// src/pages/Targets.jsx — SponsorSignal ranked targets dashboard
// "Today's Top 25" view of scored companies with per-dimension breakdown.
import { useState, useEffect } from 'react'
import { Target, TrendingUp, Globe, Zap, Award, MessageSquare, ChevronRight, RefreshCw, Sparkles } from 'lucide-react'

const C = {
  bg: '#0D0D0F', card: '#141416', cardHover: '#1A1A1E',
  border: 'rgba(255,255,255,0.06)', borderHover: 'rgba(255,255,255,0.10)',
  text: 'rgba(245,245,248,0.92)', textSec: 'rgba(245,245,248,0.55)',
  textTer: 'rgba(245,245,248,0.32)', textMut: 'rgba(245,245,248,0.16)',
  purple: '#A78BFA', teal: '#2DD4BF', green: '#34D399',
  red: '#F87171', amber: '#FBBF24', blue: '#60A5FA',
  font: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
}
const glass = { background: 'rgba(20,20,22,0.55)', backdropFilter: 'blur(28px) saturate(1.4)', WebkitBackdropFilter: 'blur(28px) saturate(1.4)', border: `0.5px solid ${C.border}`, borderRadius: 12 }

const DIM_ICONS = { revenue_fit: TrendingUp, geography_fit: Globe, category_fit: Target, growth_signals: Zap, narrative_fit: Award }
const DIM_COLORS = { revenue_fit: C.teal, geography_fit: C.blue, category_fit: C.purple, growth_signals: C.amber, narrative_fit: '#F472B6' }


export default function Targets() {
  const [targets, setTargets] = useState([])
  const [thresholds, setThresholds] = useState({ outreachMin: 65, priorityMin: 85 })
  const [loading, setLoading] = useState(true)
  const [tier, setTier] = useState('all')
  const [expanded, setExpanded] = useState(null)
  const [scoring, setScoring] = useState(false)

  useEffect(() => { load() }, [tier])

  async function load() {
    setLoading(true)
    try {
      const r = await fetch(`/api/targets?tier=${tier}&limit=50`)
      const j = await r.json()
      setTargets(j.targets || [])
      if (j.thresholds) setThresholds(j.thresholds)
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  async function scoreMore() {
    setScoring(true)
    try {
      const r = await fetch('/api/score?bulk=true&limit=15', { method: 'POST' })
      const j = await r.json()
      if (j.ok) await load()
    } catch (e) { alert('Score failed: ' + e.message) }
    setScoring(false)
  }

  const counts = {
    all: targets.length,
    priority: targets.filter(t => t.composite_score >= thresholds.priorityMin).length,
    outreach: targets.filter(t => t.composite_score >= thresholds.outreachMin && t.composite_score < thresholds.priorityMin).length,
    below: targets.filter(t => t.composite_score < thresholds.outreachMin).length,
  }


  return (
    <div style={{ padding: '24px 32px', maxWidth: 1400, margin: '0 auto', fontFamily: C.font, color: C.text }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <Target size={22} style={{ color: C.purple }} />
            <h1 style={{ fontSize: 22, fontWeight: 500, margin: 0 }}>Targets</h1>
            <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: 'rgba(167,139,250,0.10)', color: C.purple, border: '0.5px solid rgba(167,139,250,0.20)', fontWeight: 500 }}>SPONSORSIGNAL</span>
          </div>
          <p style={{ fontSize: 12, color: C.textTer, margin: 0 }}>Companies ranked by SponsorSignal score · {targets.length} loaded</p>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={scoreMore} disabled={scoring} style={{ padding: '8px 14px', borderRadius: 6, border: `0.5px solid rgba(167,139,250,0.20)`, background: 'rgba(167,139,250,0.06)', color: C.purple, fontSize: 11, cursor: 'pointer', fontFamily: C.font, display: 'flex', alignItems: 'center', gap: 5 }}><Sparkles size={11} />{scoring ? 'Scoring...' : 'Score 15 more'}</button>
          <button onClick={load} style={{ padding: '8px 12px', borderRadius: 6, border: `0.5px solid ${C.border}`, background: 'transparent', color: C.textSec, fontSize: 11, cursor: 'pointer', fontFamily: C.font }}><RefreshCw size={11} /></button>
        </div>
      </div>

      {/* Tier filter */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {[
          { id: 'all', label: 'All', color: C.textSec },
          { id: 'priority', label: `Priority (≥${thresholds.priorityMin})`, color: C.teal },
          { id: 'outreach', label: `Outreach (≥${thresholds.outreachMin})`, color: C.purple },
          { id: 'below', label: `Below threshold`, color: C.textTer },
        ].map(t => (
          <button key={t.id} onClick={() => setTier(t.id)} style={{ padding: '6px 14px', borderRadius: 6, border: `0.5px solid ${tier === t.id ? t.color : C.border}`, background: tier === t.id ? `${t.color}10` : 'transparent', color: tier === t.id ? t.color : C.textTer, fontSize: 11, cursor: 'pointer', fontFamily: C.font }}>{t.label}</button>
        ))}
      </div>


      {loading ? (
        <div style={{ ...glass, padding: 60, textAlign: 'center', color: C.textTer, fontSize: 12 }}>Loading ranked targets...</div>
      ) : targets.length === 0 ? (
        <div style={{ ...glass, padding: 60, textAlign: 'center', color: C.textTer, fontSize: 12 }}>
          <Target size={28} style={{ marginBottom: 10, opacity: 0.4 }} /><br/>
          No scored companies yet. Click "Score 15 more" above to begin.
        </div>
      ) : (
        <div style={{ ...glass, overflow: 'hidden' }}>
          {targets.map((t, i) => {
            const score = parseFloat(t.composite_score)
            const tierColor = score >= thresholds.priorityMin ? C.teal : score >= thresholds.outreachMin ? C.purple : C.textTer
            const isExpanded = expanded === t.id
            const c = t.company || {}
            return (
              <div key={t.id} style={{ borderBottom: `0.5px solid ${C.border}` }}>
                <div onClick={() => setExpanded(isExpanded ? null : t.id)} style={{ padding: '14px 18px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ fontSize: 11, color: C.textTer, width: 24, textAlign: 'right' }}>#{i + 1}</div>
                  <div style={{ width: 48, height: 48, borderRadius: 10, background: `${tierColor}12`, border: `0.5px solid ${tierColor}30`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
                    <div style={{ fontSize: 16, fontWeight: 600, color: tierColor, lineHeight: 1 }}>{Math.round(score)}</div>
                    <div style={{ fontSize: 7, color: tierColor, opacity: 0.7, marginTop: 2 }}>SCORE</div>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                      <span style={{ fontSize: 13, fontWeight: 500, color: C.text }}>{c.name || t.company_id}</span>
                      {t.matched_sector_id && <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 8, background: 'rgba(167,139,250,0.06)', color: C.purple, fontWeight: 500 }}>{t.matched_sector_id.replace(/_/g, ' ')}</span>}
                    </div>
                    <div style={{ fontSize: 10, color: C.textTer }}>
                      {c.industry || 'unknown industry'}
                      {c.hq_location && ` · ${c.hq_location}`}
                      {c.employee_count && ` · ${c.employee_count} emp`}
                    </div>
                  </div>
                  {/* Mini dimension bars */}
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    {['revenue_fit', 'geography_fit', 'category_fit', 'growth_signals', 'narrative_fit'].map(k => {
                      const v = parseFloat(t[k] || 0)
                      return <div key={k} title={`${k}: ${v}`} style={{ width: 4, height: 28, borderRadius: 2, background: 'rgba(255,255,255,0.04)', overflow: 'hidden', position: 'relative' }}><div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: `${v}%`, background: DIM_COLORS[k] }} /></div>
                    })}
                  </div>
                  <ChevronRight size={14} style={{ color: C.textTer, transform: isExpanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }} />
                </div>

                {isExpanded && (
                  <div style={{ padding: '0 18px 18px 78px', background: 'rgba(255,255,255,0.01)' }}>
                    {/* Per-dimension breakdown */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 12 }}>
                      {['revenue_fit', 'geography_fit', 'category_fit', 'growth_signals', 'narrative_fit'].map(k => {
                        const Icon = DIM_ICONS[k]
                        const v = parseFloat(t[k] || 0)
                        return (
                          <div key={k} style={{ padding: 10, borderRadius: 6, background: 'rgba(255,255,255,0.02)', border: `0.5px solid ${C.border}` }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
                              <Icon size={10} style={{ color: DIM_COLORS[k] }} />
                              <span style={{ fontSize: 9, color: C.textTer, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{k.replace(/_/g, ' ')}</span>
                            </div>
                            <div style={{ fontSize: 18, fontWeight: 500, color: DIM_COLORS[k] }}>{v}</div>
                            <div style={{ width: '100%', height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.04)', overflow: 'hidden', marginTop: 5 }}>
                              <div style={{ width: `${v}%`, height: '100%', background: DIM_COLORS[k] }} />
                            </div>
                            {t.reasoning?.[k] && <div style={{ fontSize: 9, color: C.textSec, lineHeight: 1.4, marginTop: 6 }}>{t.reasoning[k]}</div>}
                          </div>
                        )
                      })}
                    </div>
                    {t.reasoning?.summary && (
                      <div style={{ padding: 12, borderRadius: 8, background: `${tierColor}06`, border: `0.5px solid ${tierColor}20` }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                          <Sparkles size={11} style={{ color: tierColor }} />
                          <span style={{ fontSize: 9, color: tierColor, textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 500 }}>Verdict</span>
                        </div>
                        <div style={{ fontSize: 11, color: C.text, lineHeight: 1.55 }}>{t.reasoning.summary}</div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
