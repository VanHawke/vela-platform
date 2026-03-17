import { useState, useEffect, useMemo, useCallback } from 'react'
import { RefreshCw, Loader2, AlertTriangle, Plus, X, ExternalLink, FileDown, Check, Grid3X3, Target, Users } from 'lucide-react'

const T = {
  bg: '#FAFAFA', surface: '#FFFFFF', surfaceHover: '#F5F5F5',
  border: 'rgba(0,0,0,0.06)', borderHover: 'rgba(0,0,0,0.12)',
  text: '#1A1A1A', textSecondary: '#6B6B6B', textTertiary: '#ABABAB',
  accent: '#1A1A1A', accentSoft: 'rgba(0,0,0,0.04)',
  blue: '#007AFF', red: '#FF3B30', yellow: '#FF9500', green: '#34C759',
  font: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  gap: '#FEF2F2', gapBorder: '#FECACA', filled: '#F0FDF4', filledBorder: '#BBF7D0',
}

const TIER_BADGE = {
  title: { bg: '#FEF3C7', color: '#92400E', label: 'Title' },
  principal: { bg: '#DBEAFE', color: '#1E40AF', label: 'Principal' },
  official: { bg: '#D1FAE5', color: '#065F46', label: 'Official' },
  technical: { bg: '#E0E7FF', color: '#3730A3', label: 'Technical' },
  partner: { bg: '#F3F4F6', color: '#374151', label: 'Partner' },
  supplier: { bg: '#F3F4F6', color: '#6B7280', label: 'Supplier' },
}

const TABS = [
  { id: 'heatmap', label: 'Heatmap', icon: Grid3X3, desc: 'Team × category overview' },
  { id: 'teams', label: 'Team Cards', icon: Users, desc: 'Deep dive per team' },
  { id: 'gaps', label: 'Gap Targeting', icon: Target, desc: 'Categories ranked by opportunity' },
]

function TeamLogo({ team, size = 20 }) {
  const [imgError, setImgError] = useState(false)
  const showImg = team.logo_url && !imgError
  return (
    <div style={{ width: size, height: size, borderRadius: size * 0.3, background: team.color || '#333', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
      {showImg ? (
        <img src={team.logo_url} alt={team.name} style={{ width: size * 0.7, height: size * 0.7, objectFit: 'contain', filter: 'brightness(10)' }}
          onError={() => setImgError(true)} />
      ) : (
        <span style={{ fontSize: Math.max(size * 0.35, 8), fontWeight: 700, color: '#fff', letterSpacing: '-0.02em' }}>
          {team.name?.slice(0,2).toUpperCase()}
        </span>
      )}
    </div>
  )
}

export default function PartnershipMatrix() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('heatmap')
  const [filterTeam, setFilterTeam] = useState('all')
  const [filterCategory, setFilterCategory] = useState('all')
  const [selectedTeam, setSelectedTeam] = useState(null)
  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState({ team_id: '', partner_name: '', category_id: '', tier: 'partner' })

  useEffect(() => { fetchMatrix() }, [])

  const fetchMatrix = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/partnership-matrix?action=matrix')
      const d = await res.json()
      setData(d)
      if (!selectedTeam && d.teams?.length) setSelectedTeam(d.teams[0].id)
    } catch (e) { console.error('[Matrix]', e) }
    finally { setLoading(false) }
  }

  const addPartnership = async () => {
    if (!addForm.team_id || !addForm.partner_name) return
    await fetch('/api/partnership-matrix', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'add', ...addForm }) })
    setShowAdd(false); setAddForm({ team_id: '', partner_name: '', category_id: '', tier: 'partner' }); fetchMatrix()
  }

  const removePartnership = async (id) => {
    if (!confirm('Remove this partnership?')) return
    await fetch('/api/partnership-matrix', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'remove', id }) })
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
    const filled = new Set(getTeamPartners(teamId).map(p => p.category_id))
    return categories.filter(c => !filled.has(c.id))
  }, [categories, getTeamPartners])

  const totalGaps = useMemo(() => filteredTeams.reduce((a, t) => a + getTeamGaps(t.id).length, 0), [filteredTeams, getTeamGaps])

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontFamily: T.font }}><Loader2 size={20} style={{ animation: 'spin 1s linear infinite', color: T.textTertiary }} /></div>

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', fontFamily: T.font, background: T.bg, color: T.text, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '12px 20px', borderBottom: `1px solid ${T.border}`, background: T.surface, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0, letterSpacing: '-0.02em' }}>Partnership Matrix</h1>
            <p style={{ fontSize: 11, color: T.textTertiary, margin: '2px 0 0' }}>{partnerships.length} partnerships · {teams.length} teams · {totalGaps} gaps · Auto-scanned daily 7am</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <select value={filterTeam} onChange={e => setFilterTeam(e.target.value)} style={{ fontSize: 11, padding: '5px 8px', borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface, fontFamily: T.font, color: T.textSecondary }}>
              <option value="all">All Teams</option>
              {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} style={{ fontSize: 11, padding: '5px 8px', borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface, fontFamily: T.font, color: T.textSecondary }}>
              <option value="all">All Categories</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button onClick={fetchMatrix} style={{ fontSize: 11, padding: '5px 8px', borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface, color: T.textSecondary, cursor: 'pointer' }}><RefreshCw size={12} /></button>
            <a href={`/api/partnership-report?format=html${filterTeam !== 'all' ? `&team=${filterTeam}` : ''}`} target="_blank" rel="noopener"
              style={{ fontSize: 11, padding: '5px 10px', borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface, color: T.textSecondary, cursor: 'pointer', fontFamily: T.font, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 3 }}><FileDown size={11} />Export</a>
            <button onClick={() => setShowAdd(true)} style={{ fontSize: 11, padding: '5px 10px', borderRadius: 6, border: `1px solid ${T.blue}`, background: 'rgba(0,122,255,0.06)', color: T.blue, cursor: 'pointer', fontFamily: T.font, fontWeight: 500 }}><Plus size={11} style={{ marginRight: 3, verticalAlign: -1 }} />Add</button>
          </div>
        </div>

        {/* Tab bar */}
        <div style={{ display: 'flex', gap: 4 }}>
          {TABS.map(t => { const I = t.icon; return (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: T.font, fontSize: 12, fontWeight: tab === t.id ? 600 : 400, transition: 'all 0.15s',
              background: tab === t.id ? T.accent : 'transparent', color: tab === t.id ? '#fff' : T.textSecondary,
            }}><I size={13} />{t.label}</button>
          )})}
        </div>
      </div>

      {/* Add Modal */}
      {showAdd && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setShowAdd(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: T.surface, borderRadius: 12, padding: 20, width: 360, boxShadow: '0 8px 32px rgba(0,0,0,0.12)' }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 12px' }}>Add Partnership</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <select value={addForm.team_id} onChange={e => setAddForm(p => ({ ...p, team_id: e.target.value }))} style={{ fontSize: 12, padding: '6px 8px', borderRadius: 6, border: `1px solid ${T.border}`, fontFamily: T.font }}>
                <option value="">Select Team</option>{teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <input placeholder="Partner Name" value={addForm.partner_name} onChange={e => setAddForm(p => ({ ...p, partner_name: e.target.value }))} style={{ fontSize: 12, padding: '6px 8px', borderRadius: 6, border: `1px solid ${T.border}`, fontFamily: T.font }} />
              <select value={addForm.category_id} onChange={e => setAddForm(p => ({ ...p, category_id: e.target.value }))} style={{ fontSize: 12, padding: '6px 8px', borderRadius: 6, border: `1px solid ${T.border}`, fontFamily: T.font }}>
                <option value="">Select Category</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <select value={addForm.tier} onChange={e => setAddForm(p => ({ ...p, tier: e.target.value }))} style={{ fontSize: 12, padding: '6px 8px', borderRadius: 6, border: `1px solid ${T.border}`, fontFamily: T.font }}>
                {Object.keys(TIER_BADGE).map(t => <option key={t} value={t}>{TIER_BADGE[t].label}</option>)}
              </select>
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button onClick={() => setShowAdd(false)} style={{ flex: 1, fontSize: 12, padding: '6px 0', borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface, cursor: 'pointer', fontFamily: T.font }}>Cancel</button>
                <button onClick={addPartnership} style={{ flex: 1, fontSize: 12, padding: '6px 0', borderRadius: 6, border: 'none', background: T.accent, color: '#fff', cursor: 'pointer', fontFamily: T.font, fontWeight: 500 }}>Add</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══ TAB: HEATMAP ═══ */}
      {tab === 'heatmap' && (
        <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
          <div style={{ background: T.surface, borderRadius: 12, border: `1px solid ${T.border}`, overflow: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 10, fontFamily: T.font, minWidth: 800 }}>
              <thead>
                <tr>
                  <th style={{ position: 'sticky', left: 0, background: T.surface, padding: '8px 12px', textAlign: 'left', fontWeight: 600, borderBottom: `1px solid ${T.border}`, zIndex: 2, minWidth: 120, fontSize: 11 }}>Team</th>
                  {filteredCats.map(c => (
                    <th key={c.id} style={{ padding: '6px 3px', fontWeight: 400, borderBottom: `1px solid ${T.border}`, color: c.color || T.textTertiary, writingMode: 'vertical-rl', textOrientation: 'mixed', height: 100, fontSize: 9 }}>
                      {c.name.replace(/ \/ .*/,'')}
                    </th>
                  ))}
                  <th style={{ padding: '6px 8px', fontWeight: 600, borderBottom: `1px solid ${T.border}`, fontSize: 10 }}>Total</th>
                  <th style={{ padding: '6px 8px', fontWeight: 600, borderBottom: `1px solid ${T.border}`, color: T.red, fontSize: 10 }}>Gaps</th>
                </tr>
              </thead>
              <tbody>
                {filteredTeams.map(team => {
                  const tp = getTeamPartners(team.id)
                  const filledCats = new Set(tp.map(p => p.category_id))
                  const gapCount = filteredCats.filter(c => !filledCats.has(c.id)).length
                  return (
                    <tr key={team.id} style={{ borderBottom: `1px solid ${T.border}` }}>
                      <td style={{ position: 'sticky', left: 0, background: T.surface, padding: '6px 12px', fontWeight: 600, zIndex: 1, fontSize: 11 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <TeamLogo team={team} size={22} />
                          {team.name}
                        </div>
                      </td>
                      {filteredCats.map(c => {
                        const cp = (matrix[team.id]?.categories[c.id]) || []
                        const filled = cp.length > 0
                        return (
                          <td key={c.id} style={{ padding: 3, textAlign: 'center' }} title={filled ? cp.map(p => p.partner_name).join(', ') : `${team.name}: GAP — ${c.name}`}>
                            <span style={{ display: 'inline-block', width: 16, height: 16, borderRadius: 3, fontSize: 8, lineHeight: '16px', fontWeight: 600,
                              background: filled ? `${T.green}18` : `${T.red}12`, border: `1px solid ${filled ? T.green + '30' : T.red + '30'}`, color: filled ? T.green : T.red,
                            }}>{filled ? cp.length : '—'}</span>
                          </td>
                        )
                      })}
                      <td style={{ padding: '4px 8px', textAlign: 'center', fontWeight: 600 }}>{tp.length}</td>
                      <td style={{ padding: '4px 8px', textAlign: 'center', fontWeight: 600, color: gapCount > 10 ? T.red : gapCount > 5 ? T.yellow : T.green }}>{gapCount}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══ TAB: TEAM CARDS ═══ */}
      {tab === 'teams' && (
        <div style={{ flex: 1, overflow: 'auto', display: 'flex' }}>
          {/* Team selector sidebar */}
          <div style={{ width: 180, flexShrink: 0, borderRight: `1px solid ${T.border}`, background: T.surface, overflow: 'auto', padding: '8px 0' }}>
            {filteredTeams.map(t => {
              const gaps = getTeamGaps(t.id).length
              return (
                <button key={t.id} onClick={() => setSelectedTeam(t.id)} style={{
                  width: '100%', padding: '8px 14px', border: 'none', cursor: 'pointer', fontFamily: T.font, fontSize: 12, textAlign: 'left',
                  background: selectedTeam === t.id ? T.accentSoft : 'transparent', fontWeight: selectedTeam === t.id ? 600 : 400,
                  color: selectedTeam === t.id ? T.text : T.textSecondary, display: 'flex', alignItems: 'center', gap: 8, transition: 'all 0.1s',
                }}>
                  <TeamLogo team={t} size={20} />
                  <span style={{ flex: 1 }}>{t.name}</span>
                  {gaps > 0 && <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 8, background: `${T.red}12`, color: T.red, fontWeight: 600 }}>{gaps}</span>}
                </button>
              )
            })}
          </div>

          {/* Team detail panel */}
          <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
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
                      <h2 style={{ fontSize: 18, fontWeight: 600, margin: 0 }}>{team.name}</h2>
                      <p style={{ fontSize: 11, color: T.textTertiary, margin: '2px 0 0' }}>
                        {team.full_name} · {team.engine}
                        {team.website && <> · <a href={team.website} target="_blank" rel="noopener" style={{ color: T.blue, textDecoration: 'none' }}>Partners page <ExternalLink size={8} style={{ verticalAlign: -1 }} /></a></>}
                      </p>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 8, background: T.filled, color: '#166534', fontWeight: 500 }}>{tp.length} partners</span>
                      <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 8, background: T.accentSoft, color: T.textSecondary, fontWeight: 500 }}>{filled.length}/{categories.length} categories</span>
                      {gaps.length > 0 && <span style={{ fontSize: 11, padding: '3px 10px', borderRadius: 8, background: T.gap, color: '#991B1B', fontWeight: 500 }}>{gaps.length} gaps</span>}
                    </div>
                  </div>

                  {/* Filled categories */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8, marginBottom: 16 }}>
                    {filled.map(({ cat, partners }) => (
                      <div key={cat.id} style={{ padding: '10px 12px', borderRadius: 10, background: T.surface, border: `1px solid ${T.border}`, borderLeft: `3px solid ${cat.color || T.blue}` }}>
                        <p style={{ fontSize: 9, fontWeight: 600, color: cat.color || T.textTertiary, margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{cat.name}</p>
                        {partners.map(p => { const badge = TIER_BADGE[p.tier] || TIER_BADGE.partner; return (
                          <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                            <span style={{ fontSize: 12, fontWeight: 500, flex: 1 }}>{p.partner_name}</span>
                            <span style={{ fontSize: 8, padding: '0 4px', borderRadius: 3, background: badge.bg, color: badge.color, fontWeight: 600 }}>{badge.label}</span>
                            <button onClick={() => removePartnership(p.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, opacity: 0.25, lineHeight: 1 }} title="Remove"><X size={10} color={T.red} /></button>
                          </div>
                        )})}
                      </div>
                    ))}
                  </div>

                  {/* Gaps section */}
                  {gaps.length > 0 && (
                    <div style={{ background: T.gap, borderRadius: 10, padding: 14, border: `1px solid ${T.gapBorder}` }}>
                      <p style={{ fontSize: 10, fontWeight: 600, color: '#991B1B', textTransform: 'uppercase', letterSpacing: '0.04em', margin: '0 0 8px' }}>
                        {gaps.length} open categories — Van Hawke targeting opportunity
                      </p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {gaps.map(c => (
                          <span key={c.id} style={{ fontSize: 11, padding: '3px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.7)', color: '#991B1B', border: '1px solid rgba(226,75,74,0.2)', fontWeight: 500 }}>{c.name}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )
            })()}
          </div>
        </div>
      )}

      {/* ═══ TAB: GAP TARGETING ═══ */}
      {tab === 'gaps' && (
        <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>
          <div style={{ maxWidth: 900 }}>
            {/* Team legend with logos */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', marginBottom: 8, background: T.surface, borderRadius: 10, border: `1px solid ${T.border}`, flexWrap: 'wrap' }}>
              {filteredTeams.map(t => (
                <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: T.textSecondary }}>
                  <TeamLogo team={t} size={16} />
                  <span>{t.name.replace('Racing Bulls','RB').replace('Aston Martin','AMR').replace('Red Bull Racing','RBR')}</span>
                </div>
              ))}
            </div>
            {(() => {
              const catGaps = filteredCats.map(c => {
                const teamsWithout = filteredTeams.filter(t => {
                  const filled = new Set(getTeamPartners(t.id).map(p => p.category_id))
                  return !filled.has(c.id)
                })
                const teamsWith = filteredTeams.filter(t => {
                  const filled = new Set(getTeamPartners(t.id).map(p => p.category_id))
                  return filled.has(c.id)
                })
                return { cat: c, teamsWithout, teamsWith, gapCount: teamsWithout.length }
              }).sort((a, b) => b.gapCount - a.gapCount)

              return catGaps.map(({ cat, teamsWithout, teamsWith, gapCount }) => (
                <div key={cat.id} style={{ display: 'flex', alignItems: 'stretch', borderBottom: `1px solid ${T.border}`, minHeight: 48 }}>
                  {/* Category label */}
                  <div style={{ width: 180, flexShrink: 0, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 8, borderRight: `1px solid ${T.border}` }}>
                    <div style={{ width: 3, height: 24, borderRadius: 2, background: cat.color || T.textTertiary, flexShrink: 0 }} />
                    <span style={{ fontSize: 12, fontWeight: 500, flex: 1 }}>{cat.name}</span>
                    <span style={{ fontSize: 10, fontWeight: 600, padding: '1px 6px', borderRadius: 8,
                      background: gapCount >= 6 ? `${T.red}15` : gapCount >= 3 ? `${T.yellow}15` : `${T.green}15`,
                      color: gapCount >= 6 ? T.red : gapCount >= 3 ? T.yellow : T.green,
                    }}>{gapCount}</span>
                  </div>

                  {/* Team cells */}
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px', flexWrap: 'wrap' }}>
                    {filteredTeams.map(t => {
                      const isGap = teamsWithout.some(tw => tw.id === t.id)
                      return (
                        <span key={t.id} title={`${t.name}: ${isGap ? 'GAP — open opportunity' : 'Partner in place'}`}
                          style={{ fontSize: 9, fontWeight: 500, padding: '3px 8px', borderRadius: 4, cursor: 'default', transition: 'transform 0.1s',
                            background: isGap ? `${T.red}10` : T.accentSoft,
                            color: isGap ? T.red : T.textSecondary,
                            border: `1px solid ${isGap ? T.red + '25' : T.border}`,
                          }}
                          onMouseOver={e => e.target.style.transform = 'scale(1.06)'}
                          onMouseOut={e => e.target.style.transform = 'scale(1)'}
                        >{t.name.replace('Racing Bulls','RB').replace('Aston Martin','AMR').replace('Red Bull Racing','RBR')}</span>
                      )
                    })}
                  </div>
                </div>
              ))
            })()}
          </div>
        </div>
      )}
    </div>
  )
}
