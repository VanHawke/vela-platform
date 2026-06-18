import { useState, useEffect, useMemo, useCallback } from 'react'
import { setPageContext } from '@/lib/pageContext'
import { RefreshCw, Loader2, AlertTriangle, Plus, X, ExternalLink, FileDown, Check, Grid3X3, Target, Users } from 'lucide-react'

const T = {
  bg: '#FEFEFC', surface: '#FFFFFF', surfaceHover: 'rgba(0,0,0,0.03)',
  border: 'rgba(0,0,0,0.08)', borderHover: 'rgba(0,0,0,0.14)',
  text: '#0A0A0A', textSecondary: '#6B6B6B', textTertiary: '#A0A0A0',
  accent: '#0A0A0A', accentSoft: 'rgba(10,10,10,0.04)',
  blue: '#5a6470', red: '#b8643e', yellow: '#B89C5C', green: '#7d8a64',
  font: "'Inter', system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
  fontDisplay: "'Source Serif 4', Georgia, serif",
  gap: 'rgba(184,100,62,0.06)', gapBorder: 'rgba(184,100,62,0.20)',
  filled: 'rgba(125,138,100,0.08)', filledBorder: 'rgba(125,138,100,0.25)',
}

const TIER_BADGE = {
  title:     { bg: 'rgba(184,156,92,0.14)', color: '#8a6f2c', label: 'Title' },
  principal: { bg: 'rgba(90,100,112,0.14)', color: '#5a6470', label: 'Principal' },
  official:  { bg: 'rgba(125,138,100,0.14)', color: '#5a6644', label: 'Official' },
  technical: { bg: 'rgba(109,78,168,0.14)', color: '#6d4ea8', label: 'Technical' },
  partner:   { bg: 'rgba(0,0,0,0.05)',      color: '#6B6B6B', label: 'Partner' },
  supplier:  { bg: 'rgba(0,0,0,0.04)',      color: '#A0A0A0', label: 'Supplier' },
}

const TABS = [
  { id: 'heatmap', label: 'Heatmap', icon: Grid3X3, desc: 'Team × category overview' },
  { id: 'teams', label: 'Team Cards', icon: Users, desc: 'Deep dive per team' },
  { id: 'gaps', label: 'Gap Targeting', icon: Target, desc: 'Categories ranked by opportunity' },
  { id: 'alerts', label: 'Alerts', icon: AlertTriangle, desc: 'Partnership detection alerts' },
]

function TeamLogo({ team, size = 20 }) {
  const [imgError, setImgError] = useState(false)
  const showImg = team.logo_url && !imgError
  return (
    <div style={{ width: size, height: size, borderRadius: size * 0.3, background: team.color || '#6B6B6B', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      {showImg ? (
        <img src={team.logo_url} alt={team.name} style={{ width: size * 0.7, height: size * 0.7, objectFit: 'contain', filter: 'brightness(10)' }}
          onError={() => setImgError(true)} />
      ) : (
        <span style={{ fontSize: Math.max(size * 0.35, 8), fontWeight: 500, color: '#0A0A0A', letterSpacing: '-0.02em' }}>
          {team.name?.slice(0,2).toUpperCase()}
        </span>
      )}
    </div>
  )
}

export default function PartnershipMatrix({ user }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('heatmap')
  const [filterTeam, setFilterTeam] = useState('all')
  const [filterCategory, setFilterCategory] = useState('all')
  const [selectedTeam, setSelectedTeam] = useState(null)
  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState({ team_id: '', partner_name: '', category_id: '', tier: 'partner' })
  const [alerts, setAlerts] = useState([])
  const [lastRefresh, setLastRefresh] = useState('')

  const fetchAlerts = useCallback(async () => {
    try {
      const { createClient } = await import('@supabase/supabase-js')
      const sb = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY)
      const { data } = await sb.from('kiko_alerts')
        .select('*')
        .in('type', ['category_recommendation', 'convergence', 'partnership_gap', 'proactive_intel'])
        .eq('dismissed', false)
        .order('created_at', { ascending: false })
        .limit(30)
      setAlerts(data || [])
    } catch {}
  }, [])

  useEffect(() => { if (user?.id) fetchMatrix() }, [user?.id])
  useEffect(() => { if (tab === 'alerts') fetchAlerts() }, [tab, fetchAlerts])

  const fetchMatrix = async () => {
    setLoading(true)
    try {
      const res = await fetch('https://api.vanhawke.agency/api/partnership-matrix?action=matrix')
      const d = await res.json()
      setData(d)
      if (!selectedTeam && d.teams?.length) setSelectedTeam(d.teams[0].id)
    } catch (e) { console.error('[Matrix]', e) }
    finally { setLoading(false); setLastRefresh(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })) }
    setPageContext({ page: 'partnership-matrix', summary: `Partnership Matrix: ${data?.partnerships?.length || 0} partnerships, ${data?.gaps?.length || 0} gaps` })
  }

  const addPartnership = async () => {
    if (!addForm.team_id || !addForm.partner_name) return
    await fetch('https://api.vanhawke.agency/api/partnership-matrix', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'add', ...addForm }) })
    setShowAdd(false); setAddForm({ team_id: '', partner_name: '', category_id: '', tier: 'partner' }); fetchMatrix()
  }

  const removePartnership = async (id) => {
    if (!confirm('Remove this partnership?')) return
    await fetch('https://api.vanhawke.agency/api/partnership-matrix', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'remove', id }) })
    fetchMatrix()
  }

  const teams = data?.teams || []
  const categories = data?.categories || []
  const partnerships = data?.partnerships || []
  const matrix = data?.matrix || {}

  const filteredTeams = useMemo(() => filterTeam === 'all' ? teams : teams.filter(t => t.id === filterTeam), [teams, filterTeam])
  const filteredCats = useMemo(() => filterCategory === 'all' ? categories : categories.filter(c => c.id === filterCategory), [categories, filterCategory])

  const getTeamPartners = useCallback((teamId) => partnerships.filter(p => p.team_id === teamId), [partnerships])
  const getTeamGaps = useCallback((teamId) => {
    // Honor related_categories so overlap-tagged partners count toward the filled set
    const tp = getTeamPartners(teamId)
    const filled = new Set()
    for (const p of tp) {
      if (p.category_id) filled.add(p.category_id)
      if (Array.isArray(p.related_categories)) p.related_categories.forEach(rc => filled.add(rc))
    }
    return categories.filter(c => !filled.has(c.id))
  }, [categories, getTeamPartners])

  const totalGaps = useMemo(() => filteredTeams.reduce((a, t) => a + getTeamGaps(t.id).length, 0), [filteredTeams, getTeamGaps])

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontFamily: T.font }}><Loader2 size={20} style={{ animation: 'spin 1s linear infinite', color: T.textTertiary }} /></div>

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', fontFamily: T.font, background: 'transparent', color: T.text, overflow: 'hidden' }}>
      {/* Header — redesign v2 pattern */}
      <div style={{ padding: '20px 44px 14px', borderBottom: `1px solid ${T.border}`, background: T.surface, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.10em', textTransform: 'uppercase', color: '#0A0A0A', marginBottom: 10 }}>STRATEGY</div>
            <h1 style={{ fontSize: 36, fontWeight: 300, margin: 0, letterSpacing: '-0.018em', fontFamily: "'Source Serif 4', Georgia, serif" }}>Partnership Matrix</h1>
            <p style={{ fontSize: 12, color: T.textTertiary, margin: '6px 0 0' }}>
              <span style={{ fontFamily: T.fontDisplay, fontWeight: 300, fontSize: 15, color: T.text }}>{partnerships.length}</span> partnerships · <span style={{ fontFamily: T.fontDisplay, fontWeight: 300, fontSize: 15, color: T.text }}>{teams.length}</span> teams · <span style={{ fontFamily: T.fontDisplay, fontWeight: 300, fontSize: 15, color: T.red }}>{totalGaps}</span> gaps · Auto-scanned daily 7am{lastRefresh ? ` · Last loaded ${lastRefresh}` : ''}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <select value={filterTeam} onChange={e => setFilterTeam(e.target.value)} style={{ fontSize: 12, padding: '5px 8px', borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface, fontFamily: T.font, color: T.textSecondary }}>
              <option value="all">All Teams</option>
              {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} style={{ fontSize: 12, padding: '5px 8px', borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface, fontFamily: T.font, color: T.textSecondary }}>
              <option value="all">All Categories</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button onClick={fetchMatrix} style={{ fontSize: 12, padding: '5px 8px', borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface, color: T.textSecondary, cursor: 'pointer' }}><RefreshCw size={12} /></button>
            <a href={`/api/partnership-report?format=html${filterTeam !== 'all' ? `&team=${filterTeam}` : ''}`} target="_blank" rel="noopener"
              style={{ fontSize: 12, padding: '5px 10px', borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface, color: T.textSecondary, cursor: 'pointer', fontFamily: T.font, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 3 }}><FileDown size={11} />Export</a>
            <button onClick={() => setShowAdd(true)} style={{ fontSize: 12, padding: '5px 10px', borderRadius: 6, border: `1px solid ${T.accent}`, background: T.accent, color: '#FFFFFF', cursor: 'pointer', fontFamily: T.font, fontWeight: 500 }}><Plus size={11} style={{ marginRight: 3, verticalAlign: -1 }} />Add</button>
          </div>
        </div>

        {/* Tab bar — compact buttons matching render */}
        <div style={{ display: 'flex', gap: 3 }}>
          {TABS.map(t => { const I = t.icon; return (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              display: 'flex', alignItems: 'center', gap: 5, padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontFamily: T.font, fontSize: 12, fontWeight: 500, transition: 'all 0.15s',
              background: tab === t.id ? T.accent : 'transparent', color: tab === t.id ? '#FFFFFF' : T.textSecondary,
            }}><I size={12} />{t.label}</button>
          )})}
        </div>
      </div>

      {/* Add Modal */}
      {showAdd && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowAdd(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#FFFFFF', borderRadius: 12, padding: 20, width: 360, border: `1px solid ${T.border}`, boxShadow: '0 16px 48px rgba(0,0,0,0.12)' }}>
            <h3 style={{ fontSize: 15, fontWeight: 400, margin: '0 0 12px' }}>Add Partnership</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <select value={addForm.team_id} onChange={e => setAddForm(p => ({ ...p, team_id: e.target.value }))} style={{ fontSize: 13, padding: '6px 8px', borderRadius: 6, border: `1px solid ${T.border}`, fontFamily: T.font }}>
                <option value="">Select Team</option>{teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <input placeholder="Partner Name" value={addForm.partner_name} onChange={e => setAddForm(p => ({ ...p, partner_name: e.target.value }))} style={{ fontSize: 13, padding: '6px 8px', borderRadius: 6, border: `1px solid ${T.border}`, fontFamily: T.font }} />
              <select value={addForm.category_id} onChange={e => setAddForm(p => ({ ...p, category_id: e.target.value }))} style={{ fontSize: 13, padding: '6px 8px', borderRadius: 6, border: `1px solid ${T.border}`, fontFamily: T.font }}>
                <option value="">Select Category</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <select value={addForm.tier} onChange={e => setAddForm(p => ({ ...p, tier: e.target.value }))} style={{ fontSize: 13, padding: '6px 8px', borderRadius: 6, border: `1px solid ${T.border}`, fontFamily: T.font }}>
                {Object.keys(TIER_BADGE).map(t => <option key={t} value={t}>{TIER_BADGE[t].label}</option>)}
              </select>
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button onClick={() => setShowAdd(false)} style={{ flex: 1, fontSize: 13, padding: '6px 0', borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface, cursor: 'pointer', fontFamily: T.font }}>Cancel</button>
                <button onClick={addPartnership} style={{ flex: 1, fontSize: 13, padding: '6px 0', borderRadius: 6, border: 'none', background: T.accent, color: '#FFFFFF', cursor: 'pointer', fontFamily: T.font, fontWeight: 500 }}>Add</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ TAB: HEATMAP ═══ */}
      {tab === 'heatmap' && (
        <div style={{ flex: 1, overflow: 'auto', padding: '12px 44px 16px' }}>
          <div style={{ background: T.surface, borderRadius: 14, border: `1px solid ${T.border}`, overflow: 'auto' }}>
            <table style={{ borderCollapse: 'separate', borderSpacing: 0, width: '100%', fontSize: 11, fontFamily: T.font, minWidth: 800 }}>
              <thead>
                <tr>
                  <th style={{ position: 'sticky', left: 0, background: T.surface, padding: '6px 10px', textAlign: 'left', fontWeight: 600, fontSize: 8, color: T.textTertiary, textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: `1px solid ${T.border}`, zIndex: 2, minWidth: 110 }}>Team</th>
                  {filteredCats.map(c => (
                    <th key={c.id} style={{ padding: '4px 2px', fontWeight: 600, fontSize: 7, color: c.color || T.textTertiary, textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: `1px solid ${T.border}`, writingMode: 'vertical-rl', transform: 'rotate(180deg)', height: 60, overflow: 'hidden', whiteSpace: 'nowrap' }}>
                      {c.name.replace(/ \/ .*/,'').replace(/ & .*/,'')}
                    </th>
                  ))}
                  <th style={{ padding: '6px 8px', fontWeight: 600, fontSize: 8, color: T.textTertiary, textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: `1px solid ${T.border}`, textAlign: 'center' }}>Total</th>
                  <th style={{ padding: '6px 8px', fontWeight: 600, fontSize: 8, color: T.red, textTransform: 'uppercase', letterSpacing: '0.04em', borderBottom: `1px solid ${T.border}`, textAlign: 'center' }}>Gaps</th>
                </tr>
              </thead>
              <tbody>
                {filteredTeams.map(team => {
                  const tp = getTeamPartners(team.id)
                  const filledCats = new Set()
                  for (const p of tp) {
                    if (p.category_id) filledCats.add(p.category_id)
                    if (Array.isArray(p.related_categories)) p.related_categories.forEach(rc => filledCats.add(rc))
                  }
                  const gapCount = filteredCats.filter(c => !filledCats.has(c.id)).length
                  return (
                    <tr key={team.id} style={{ borderBottom: `1px solid ${T.border}` }}>
                      <td style={{ position: 'sticky', left: 0, background: T.surface, padding: '7px 10px', fontWeight: 500, zIndex: 1, fontSize: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <TeamLogo team={team} size={20} />
                          {team.name}
                        </div>
                      </td>
                      {filteredCats.map(c => {
                        const cp = (matrix[team.id]?.categories[c.id]) || []
                        const count = cp.length
                        const isDense = count >= 5
                        const isFilled = count > 0
                        return (
                          <td key={c.id} style={{ padding: '2px 1px', textAlign: 'center' }} title={isFilled ? cp.map(p => p.partner_name).join(', ') : `${team.name}: GAP — ${c.name}`}>
                            <div style={{
                              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                              width: 24, height: 22, borderRadius: 4, fontSize: 9, fontWeight: 500,
                              background: isDense ? 'rgba(125,138,100,0.25)' : isFilled ? 'rgba(125,138,100,0.12)' : 'rgba(184,100,62,0.08)',
                              color: isDense ? '#5a6b3d' : isFilled ? T.green : T.red,
                            }}>{isFilled ? count : '—'}</div>
                          </td>
                        )
                      })}
                      <td style={{ padding: '4px 10px', textAlign: 'center', fontWeight: 500, fontSize: 12 }}>{tp.length}</td>
                      <td style={{ padding: '4px 10px', textAlign: 'center', fontWeight: 500, fontSize: 12, color: gapCount > 10 ? T.red : gapCount > 5 ? T.yellow : T.green }}>{gapCount}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {/* Legend */}
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginTop: 8, fontSize: 10, color: T.textTertiary }}>
            <span>Legend:</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><div style={{ width: 16, height: 14, borderRadius: 3, background: 'rgba(125,138,100,0.25)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 7, fontWeight: 500, color: '#5a6b3d' }}>5+</div> Dense</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><div style={{ width: 16, height: 14, borderRadius: 3, background: 'rgba(125,138,100,0.12)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 7, fontWeight: 500, color: T.green }}>1-4</div> Active</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><div style={{ width: 16, height: 14, borderRadius: 3, background: 'rgba(184,100,62,0.08)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 7, fontWeight: 500, color: T.red }}>—</div> Open gap</span>
          </div>
        </div>
      )}

      {/* ═══ TAB: TEAM CARDS ═══ */}
      {tab === 'teams' && (
        <div style={{ flex: 1, overflow: 'auto', display: 'flex' }}>
          {/* Team selector sidebar */}
          <div style={{ width: 140, flexShrink: 0, borderRight: `1px solid ${T.border}`, background: T.surface, overflow: 'auto', padding: '8px 0' }}>
            {filteredTeams.map(t => {
              const gaps = getTeamGaps(t.id).length
              return (
                <button key={t.id} onClick={() => setSelectedTeam(t.id)} style={{
                  width: '100%', padding: '8px 14px', border: 'none', cursor: 'pointer', fontFamily: T.font, fontSize: 13, textAlign: 'left',
                  background: selectedTeam === t.id ? T.accentSoft : 'transparent', fontWeight: selectedTeam === t.id ? 600 : 400,
                  color: selectedTeam === t.id ? T.text : T.textSecondary, display: 'flex', alignItems: 'center', gap: 8, transition: 'all 0.1s',
                }}>
                  <TeamLogo team={t} size={20} />
                  <span style={{ flex: 1 }}>{t.name}</span>
                  {gaps > 0 && <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 50, background: `${T.red}12`, color: T.red, fontWeight: 400 }}>{gaps}</span>}
                </button>
              )
            })}
          </div>

          {/* Team detail panel */}
          <div style={{ flex: 1, overflow: 'auto', padding: '12px 20px 16px' }}>
            {(() => {
              const team = teams.find(t => t.id === selectedTeam)
              if (!team) return null
              const tp = getTeamPartners(team.id)
              const gaps = getTeamGaps(team.id)
              const byCat = {}
              for (const c of categories) byCat[c.id] = { cat: c, partners: [] }
              for (const p of tp) { if (byCat[p.category_id]) byCat[p.category_id].partners.push(p) }
              const filled = Object.values(byCat).filter(v => v.partners.length > 0)
              return (
                <div style={{ maxWidth: 800 }}>
                  {/* Team header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                    <TeamLogo team={team} size={36} />
                    <div style={{ flex: 1 }}>
                      <h2 style={{ fontSize: 19, fontWeight: 400, margin: 0 }}>{team.name}</h2>
                      <p style={{ fontSize: 12, color: T.textTertiary, margin: '2px 0 0' }}>
                        {team.full_name} · {team.engine}
                        {team.website && <> · <a href={team.website} target="_blank" rel="noopener" style={{ color: T.blue, textDecoration: 'none' }}>Partners page <ExternalLink size={8} style={{ verticalAlign: -1 }} /></a></>}
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: 10 }}>
                      <div><span style={{ fontFamily: T.fontDisplay, fontWeight: 300, fontSize: 18 }}>{tp.length}</span> <span style={{ fontSize: 10, color: T.textTertiary, textTransform: 'uppercase', letterSpacing: '0.04em' }}>partners</span></div>
                      <div><span style={{ fontFamily: T.fontDisplay, fontWeight: 300, fontSize: 18 }}>{filled.length}/{categories.length}</span> <span style={{ fontSize: 10, color: T.textTertiary, textTransform: 'uppercase', letterSpacing: '0.04em' }}>categories</span></div>
                      {gaps.length > 0 && <div><span style={{ fontFamily: T.fontDisplay, fontWeight: 300, fontSize: 18, color: T.red }}>{gaps.length}</span> <span style={{ fontSize: 10, color: T.red, textTransform: 'uppercase', letterSpacing: '0.04em' }}>gaps</span></div>}
                    </div>
                  </div>

                  {/* Filled categories */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginBottom: 16 }}>
                    {filled.map(({ cat, partners }) => (
                      <div key={cat.id} style={{ padding: '10px 12px', borderRadius: '0 10px 10px 0', background: T.surface, border: `1px solid ${T.border}`, borderLeft: `3px solid ${cat.color || T.blue}` }}>
                        <p style={{ fontSize: 10, fontWeight: 400, color: cat.color || T.textTertiary, margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{cat.name}</p>
                        {partners.map(p => { const badge = TIER_BADGE[p.tier] || TIER_BADGE.partner; return (
                          <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                            <span style={{ fontSize: 13, fontWeight: 500, flex: 1 }}>{p.partner_name}</span>
                            <span style={{ fontSize: 9, padding: '0 4px', borderRadius: 3, background: badge.bg, color: badge.color, fontWeight: 400 }}>{badge.label}</span>
                            <button onClick={() => removePartnership(p.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, opacity: 0.25, lineHeight: 1 }} title="Remove"><X size={10} color={T.red} /></button>
                          </div>
                        )})}
                      </div>
                    ))}
                    {/* Gap cards inline — dashed border */}
                    {gaps.map(c => (
                      <div key={`gap-${c.id}`} style={{ padding: '10px 12px', borderRadius: '0 10px 10px 0', background: 'rgba(184,100,62,0.02)', border: `1px dashed ${T.gapBorder}`, borderLeft: `3px dashed ${T.red}`, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                        <p style={{ fontSize: 10, fontWeight: 500, color: T.red, margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{c.name} — Open gap</p>
                        <p style={{ fontSize: 11, color: T.textTertiary, margin: 0 }}>No partner. <span onClick={() => window.location.href = `/campaigns?team=${encodeURIComponent(team.id)}&category=${encodeURIComponent(c.id)}`} style={{ color: T.red, cursor: 'pointer', fontWeight: 500 }}>Launch campaign →</span></p>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })()}
          </div>
        </div>
      )}

      {/* ═══ TAB: GAP TARGETING ═══ */}
      {tab === 'gaps' && (
        <div style={{ flex: 1, overflow: 'auto', padding: '12px 44px 16px' }}>
          <div style={{ maxWidth: 960 }}>
            {/* Team legend */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', marginBottom: 10, background: T.surface, borderRadius: 10, border: `1px solid ${T.border}`, flexWrap: 'wrap' }}>
              {filteredTeams.map(t => (
                <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: T.textSecondary }}>
                  <TeamLogo team={t} size={14} />
                  <span>{t.name.replace('Racing Bulls','RB').replace('Aston Martin','AMR').replace('Red Bull Racing','RBR')}</span>
                </div>
              ))}
            </div>
            {/* Rows in card container */}
            <div style={{ background: T.surface, borderRadius: 14, border: `1px solid ${T.border}`, overflow: 'hidden' }}>
            {(() => {
              const catGaps = filteredCats.map(c => {
                const teamsWithout = filteredTeams.filter(t => {
                  const filled = new Set(getTeamPartners(t.id).map(p => p.category_id))
                  return !filled.has(c.id)
                })
                return { cat: c, teamsWithout, gapCount: teamsWithout.length }
              }).sort((a, b) => b.gapCount - a.gapCount)

              return catGaps.map(({ cat, teamsWithout, gapCount }, idx) => (
                <div key={cat.id} style={{ display: 'flex', alignItems: 'center', padding: '8px 12px', borderBottom: idx < catGaps.length - 1 ? `1px solid ${T.border}` : 'none', background: gapCount >= 8 ? 'rgba(184,100,62,0.03)' : 'transparent' }}>
                  <div style={{ width: 150, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 500 }}>{cat.name}</div>
                  <div style={{ fontFamily: T.fontDisplay, fontWeight: 300, fontSize: 16, minWidth: 28, textAlign: 'center', color: gapCount >= 6 ? T.red : gapCount >= 3 ? T.yellow : T.green }}>{gapCount}</div>
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 3, paddingLeft: 10, flexWrap: 'wrap' }}>
                    {filteredTeams.map(t => {
                      const isGap = teamsWithout.some(tw => tw.id === t.id)
                      return (
                        <span key={t.id} style={{
                          fontSize: 10, fontWeight: 500, padding: '3px 7px', borderRadius: 4, cursor: 'default',
                          background: isGap ? 'transparent' : T.accent,
                          color: isGap ? T.red : '#FFFFFF',
                          border: isGap ? `1px dashed rgba(184,100,62,0.3)` : `1px solid ${T.accent}`,
                        }}>{t.name.replace('Racing Bulls','RB').replace('Aston Martin','AMR').replace('Red Bull Racing','RBR')}</span>
                      )
                    })}
                  </div>
                </div>
              ))
            })()}
            </div>
          </div>
        </div>
      )}

      {/* ── ALERTS TAB ── */}
      {tab === 'alerts' && (
        <div style={{ flex: 1, overflow: 'auto', padding: '12px 44px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* Dynamic gap alerts — generated from live matrix data for ALL teams */}
          {(() => {
            const gapAlerts = []
            for (const team of filteredTeams) {
              const gaps = getTeamGaps(team.id)
              for (const gap of gaps) {
                gapAlerts.push({ id: `gap-${team.id}-${gap.id}`, team, category: gap, type: 'dynamic_gap' })
              }
            }
            gapAlerts.sort((a, b) => a.category.name.localeCompare(b.category.name))
            const allItems = [
              ...alerts.filter(a => a.type !== 'category_recommendation' && !/\[MAISON\]/i.test(a.title) && !/maison|eyewear/i.test(a.title)).map(a => ({ ...a, isDynamic: false })),
              ...gapAlerts.map(g => ({ ...g, isDynamic: true })),
            ]
            if (allItems.length === 0) return <div style={{ textAlign: 'center', padding: 40, color: T.textTertiary, fontSize: 13 }}>No alerts or gaps detected.</div>
            return (<>
              {/* Intelligence alerts from kiko_alerts (partner changes, proactive intel) */}
              {alerts.filter(a => a.type !== 'category_recommendation' && !/\[MAISON\]/i.test(a.title) && !/maison|eyewear/i.test(a.title)).map(a => {
                const tc = { convergence: { border: T.blue, label: 'Partner Change' }, proactive_intel: { border: T.green, label: 'Intelligence' }, partnership_gap: { border: T.red, label: 'Gap Detected' } }[a.type] || { border: T.yellow, label: 'Alert' }
                const age = Math.floor((Date.now() - new Date(a.created_at).getTime()) / 3600000)
                const ageStr = age < 24 ? `${age}h ago` : `${Math.floor(age / 24)}d ago`
                return (
                  <div key={a.id} style={{ borderRadius: '0 14px 14px 0', background: `${tc.border}08`, padding: '14px 18px', borderLeft: `3px solid ${tc.border}`, border: `1px solid ${T.border}`, borderLeftWidth: 3, borderLeftColor: tc.border }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                      <div style={{ width: 28, height: 28, borderRadius: 8, background: `${tc.border}15`, display: 'grid', placeItems: 'center', flexShrink: 0 }}><AlertTriangle size={14} color={tc.border} /></div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <span style={{ fontSize: 13, fontWeight: 500 }}>{a.title}</span>
                          <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: 'rgba(0,0,0,0.04)', color: T.textSecondary }}>{tc.label}</span>
                          <span style={{ fontSize: 10, color: T.textTertiary, marginLeft: 'auto' }}>{ageStr}</span>
                        </div>
                        <div style={{ fontSize: 12, color: T.textSecondary, lineHeight: 1.5 }}>{a.detail}</div>
                      </div>
                    </div>
                  </div>
                )
              })}

              {/* Section header for gap opportunities */}
              {gapAlerts.length > 0 && (
                <div style={{ padding: '8px 0 4px', marginTop: 4 }}>
                  <h3 style={{ fontFamily: T.fontDisplay, fontWeight: 300, fontSize: 16, margin: 0, color: T.text }}>Category gaps across all teams <span style={{ fontFamily: T.font, fontSize: 12, color: T.red, fontWeight: 500 }}>{gapAlerts.length} opportunities</span></h3>
                </div>
              )}

              {/* Dynamic gap alerts grouped by category */}
              {(() => {
                const byCat = {}
                for (const g of gapAlerts) {
                  if (!byCat[g.category.id]) byCat[g.category.id] = { category: g.category, teams: [] }
                  byCat[g.category.id].teams.push(g.team)
                }
                return Object.values(byCat).sort((a, b) => b.teams.length - a.teams.length).map(({ category, teams: gapTeams }) => (
                  <div key={category.id} style={{ borderRadius: '0 14px 14px 0', background: 'rgba(184,100,62,0.03)', padding: '12px 18px', borderLeft: `3px solid ${T.red}`, border: `1px solid ${T.border}`, borderLeftWidth: 3, borderLeftColor: T.red }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                      <div style={{ width: 28, height: 28, borderRadius: 8, background: `${T.red}15`, display: 'grid', placeItems: 'center', flexShrink: 0 }}><Target size={14} color={T.red} /></div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <span style={{ fontSize: 13, fontWeight: 500 }}>{category.name}</span>
                          <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: `${T.red}10`, color: T.red, fontWeight: 500 }}>{gapTeams.length} team{gapTeams.length !== 1 ? 's' : ''} open</span>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 8 }}>
                          {gapTeams.map(t => (
                            <span key={t.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 6, background: T.surface, border: `1px solid ${T.border}`, fontSize: 11, fontWeight: 500 }}>
                              <TeamLogo team={t} size={14} /> {t.name}
                              <span onClick={() => window.location.href = `/campaigns?team=${encodeURIComponent(t.id)}&category=${encodeURIComponent(category.id)}`} style={{ color: T.red, cursor: 'pointer', marginLeft: 4, fontWeight: 500, fontSize: 10 }}>Launch →</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              })()}
            </>)
          })()}
        </div>
      )}
    </div>
  )
}
