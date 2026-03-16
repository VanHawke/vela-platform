import { useState, useEffect, useMemo } from 'react'
import { Filter, RefreshCw, Loader2, AlertTriangle, ChevronDown, Plus, X, ExternalLink, LayoutGrid, List, FileDown } from 'lucide-react'

const T = {
  bg: '#FAFAFA', surface: '#FFFFFF', surfaceHover: '#F5F5F5',
  border: 'rgba(0,0,0,0.06)', borderHover: 'rgba(0,0,0,0.12)',
  text: '#1A1A1A', textSecondary: '#6B6B6B', textTertiary: '#ABABAB',
  accent: '#1A1A1A', accentSoft: 'rgba(0,0,0,0.04)',
  blue: '#007AFF', red: '#FF3B30', yellow: '#FF9500', green: '#34C759',
  font: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  gap: '#FEF2F2', gapBorder: '#FECACA',
}

const TIER_BADGE = {
  title: { bg: '#FEF3C7', color: '#92400E', label: 'Title' },
  principal: { bg: '#DBEAFE', color: '#1E40AF', label: 'Principal' },
  official: { bg: '#D1FAE5', color: '#065F46', label: 'Official' },
  technical: { bg: '#E0E7FF', color: '#3730A3', label: 'Technical' },
  partner: { bg: '#F3F4F6', color: '#374151', label: 'Partner' },
  supplier: { bg: '#F3F4F6', color: '#6B7280', label: 'Supplier' },
}

export default function PartnershipMatrix() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [filterTeam, setFilterTeam] = useState('all')
  const [filterCategory, setFilterCategory] = useState('all')
  const [showGapsOnly, setShowGapsOnly] = useState(false)
  const [view, setView] = useState('grid') // grid | heatmap
  const [showAdd, setShowAdd] = useState(false)
  const [addForm, setAddForm] = useState({ team_id: '', partner_name: '', category_id: '', tier: 'partner' })
  const [activity, setActivity] = useState(null)

  useEffect(() => { fetchMatrix(); fetchActivity() }, [])

  const fetchMatrix = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/partnership-matrix?action=matrix')
      const d = await res.json()
      setData(d)
    } catch (e) { console.error('[Matrix] Fetch error:', e) }
    finally { setLoading(false) }
  }

  const fetchActivity = async () => {
    try {
      const res = await fetch('/api/partnership-matrix?action=activity')
      const d = await res.json()
      setActivity(d)
    } catch (e) { console.error('[Matrix] Activity error:', e) }
  }

  const addPartnership = async () => {
    if (!addForm.team_id || !addForm.partner_name) return
    await fetch('/api/partnership-matrix', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'add', ...addForm })
    })
    setShowAdd(false)
    setAddForm({ team_id: '', partner_name: '', category_id: '', tier: 'partner' })
    fetchMatrix()
  }

  const removePartnership = async (id) => {
    if (!confirm('Remove this partnership?')) return
    await fetch('/api/partnership-matrix', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'remove', id })
    })
    fetchMatrix()
  }

  const filteredTeams = useMemo(() => {
    if (!data?.teams) return []
    let teams = data.teams
    if (filterTeam !== 'all') teams = teams.filter(t => t.id === filterTeam)
    return teams
  }, [data, filterTeam])

  const filteredCategories = useMemo(() => {
    if (!data?.categories) return []
    let cats = data.categories
    if (filterCategory !== 'all') cats = cats.filter(c => c.id === filterCategory)
    return cats
  }, [data, filterCategory])

  const totalGaps = useMemo(() => {
    if (!data?.matrix) return 0
    let g = 0
    for (const t of filteredTeams) {
      for (const c of filteredCategories) {
        if (!data.matrix[t.id]?.categories[c.id]?.length) g++
      }
    }
    return g
  }, [data, filteredTeams, filteredCategories])

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', fontFamily: T.font }}>
      <Loader2 size={20} style={{ animation: 'spin 1s linear infinite', color: T.textTertiary }} />
    </div>
  )

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', fontFamily: T.font, background: T.bg, color: T.text, overflow: 'hidden' }}>
      {/* Header toolbar */}
      <div style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: `1px solid ${T.border}`, background: T.surface, flexShrink: 0 }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0, letterSpacing: '-0.02em' }}>Partnership Matrix</h1>
          <p style={{ fontSize: 11, color: T.textTertiary, margin: '2px 0 0' }}>
            {data?.partnerships?.length || 0} partnerships · {filteredTeams.length} teams · {totalGaps} gaps · Auto-scanned daily 7am
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <select value={filterTeam} onChange={e => setFilterTeam(e.target.value)}
            style={{ fontSize: 11, padding: '5px 8px', borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface, fontFamily: T.font, color: T.textSecondary }}>
            <option value="all">All Teams</option>
            {(data?.teams || []).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>

          <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
            style={{ fontSize: 11, padding: '5px 8px', borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface, fontFamily: T.font, color: T.textSecondary }}>
            <option value="all">All Categories</option>
            {(data?.categories || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <button onClick={() => setShowGapsOnly(!showGapsOnly)} style={{
            fontSize: 11, padding: '5px 10px', borderRadius: 6, cursor: 'pointer', fontFamily: T.font, fontWeight: 500,
            border: `1px solid ${showGapsOnly ? T.red : T.border}`,
            background: showGapsOnly ? 'rgba(255,59,48,0.06)' : T.surface,
            color: showGapsOnly ? T.red : T.textSecondary,
          }}><AlertTriangle size={11} style={{ marginRight: 4, verticalAlign: -1 }} />Gaps Only</button>
          <button onClick={fetchMatrix} style={{ fontSize: 11, padding: '5px 8px', borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface, color: T.textSecondary, cursor: 'pointer' }}>
            <RefreshCw size={12} />
          </button>
          <a href={`/api/partnership-report?format=html${filterTeam !== 'all' ? `&team=${filterTeam}` : ''}`} target="_blank" rel="noopener"
            style={{ fontSize: 11, padding: '5px 10px', borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface, color: T.textSecondary, cursor: 'pointer', fontFamily: T.font, fontWeight: 500, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 3 }}>
            <FileDown size={11} />Export
          </a>
          <button onClick={() => setShowAdd(true)} style={{ fontSize: 11, padding: '5px 10px', borderRadius: 6, border: `1px solid ${T.blue}`, background: 'rgba(0,122,255,0.06)', color: T.blue, cursor: 'pointer', fontFamily: T.font, fontWeight: 500 }}>
            <Plus size={11} style={{ marginRight: 3, verticalAlign: -1 }} />Add
          </button>
          <div style={{ display: 'flex', borderRadius: 6, border: `1px solid ${T.border}`, overflow: 'hidden' }}>
            <button onClick={() => setView('grid')} style={{ fontSize: 11, padding: '5px 8px', border: 'none', cursor: 'pointer', background: view === 'grid' ? T.accent : T.surface, color: view === 'grid' ? '#fff' : T.textSecondary }}>
              <LayoutGrid size={12} />
            </button>
            <button onClick={() => setView('heatmap')} style={{ fontSize: 11, padding: '5px 8px', border: 'none', cursor: 'pointer', background: view === 'heatmap' ? T.accent : T.surface, color: view === 'heatmap' ? '#fff' : T.textSecondary }}>
              <List size={12} />
            </button>
          </div>
        </div>
      </div>

      {/* Add Partnership Modal */}
      {showAdd && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={() => setShowAdd(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: T.surface, borderRadius: 12, padding: 20, width: 360, boxShadow: '0 8px 32px rgba(0,0,0,0.12)' }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, margin: '0 0 12px' }}>Add Partnership</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <select value={addForm.team_id} onChange={e => setAddForm(p => ({ ...p, team_id: e.target.value }))}
                style={{ fontSize: 12, padding: '6px 8px', borderRadius: 6, border: `1px solid ${T.border}`, fontFamily: T.font }}>
                <option value="">Select Team</option>
                {(data?.teams || []).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <input placeholder="Partner Name" value={addForm.partner_name}
                onChange={e => setAddForm(p => ({ ...p, partner_name: e.target.value }))}
                style={{ fontSize: 12, padding: '6px 8px', borderRadius: 6, border: `1px solid ${T.border}`, fontFamily: T.font }} />
              <select value={addForm.category_id} onChange={e => setAddForm(p => ({ ...p, category_id: e.target.value }))}
                style={{ fontSize: 12, padding: '6px 8px', borderRadius: 6, border: `1px solid ${T.border}`, fontFamily: T.font }}>
                <option value="">Select Category</option>
                {(data?.categories || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <select value={addForm.tier} onChange={e => setAddForm(p => ({ ...p, tier: e.target.value }))}
                style={{ fontSize: 12, padding: '6px 8px', borderRadius: 6, border: `1px solid ${T.border}`, fontFamily: T.font }}>
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

      {/* Matrix grid */}
      <div style={{ flex: 1, overflow: 'auto', padding: 16 }}>

        {/* HEATMAP VIEW — compact team × category grid */}
        {view === 'heatmap' && (
          <div style={{ background: T.surface, borderRadius: 12, border: `1px solid ${T.border}`, overflow: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 10, fontFamily: T.font }}>
              <thead>
                <tr>
                  <th style={{ position: 'sticky', left: 0, background: T.surface, padding: '8px 12px', textAlign: 'left', fontWeight: 600, borderBottom: `1px solid ${T.border}`, zIndex: 2, minWidth: 120 }}>Team</th>
                  {filteredCategories.map(c => (
                    <th key={c.id} style={{ padding: '6px 4px', fontWeight: 500, borderBottom: `1px solid ${T.border}`, color: c.color || T.textTertiary, writingMode: 'vertical-rl', textOrientation: 'mixed', height: 100, fontSize: 9 }}>
                      {c.name.replace(/ \/ .*/,'')}
                    </th>
                  ))}
                  <th style={{ padding: '6px 8px', fontWeight: 600, borderBottom: `1px solid ${T.border}`, color: T.textSecondary }}>Total</th>
                  <th style={{ padding: '6px 8px', fontWeight: 600, borderBottom: `1px solid ${T.border}`, color: T.red }}>Gaps</th>
                </tr>
              </thead>
              <tbody>
                {filteredTeams.map(team => {
                  const td = data?.matrix?.[team.id]
                  if (!td) return null
                  const partners = Object.values(td.categories).flat()
                  const filledCats = new Set(partners.map(p => p.category_id))
                  const gapCount = filteredCategories.filter(c => !filledCats.has(c.id)).length
                  return (
                    <tr key={team.id} style={{ borderBottom: `1px solid ${T.border}` }}>
                      <td style={{ position: 'sticky', left: 0, background: T.surface, padding: '6px 12px', fontWeight: 600, zIndex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ width: 8, height: 8, borderRadius: 4, background: team.color, flexShrink: 0 }} />
                          {team.name}
                        </div>
                      </td>
                      {filteredCategories.map(c => {
                        const cp = td.categories[c.id] || []
                        const filled = cp.length > 0
                        return (
                          <td key={c.id} style={{ padding: '4px', textAlign: 'center' }} title={filled ? cp.map(p => p.partner_name).join(', ') : 'GAP'}>
                            <span style={{ display: 'inline-block', width: 14, height: 14, borderRadius: 3,
                              background: filled ? `${T.green}20` : `${T.red}15`,
                              border: `1.5px solid ${filled ? T.green : T.red}40`,
                              fontSize: 8, lineHeight: '14px', color: filled ? T.green : T.red, fontWeight: 700
                            }}>{filled ? cp.length : '—'}</span>
                          </td>
                        )
                      })}
                      <td style={{ padding: '4px 8px', textAlign: 'center', fontWeight: 600, color: T.text }}>{partners.length}</td>
                      <td style={{ padding: '4px 8px', textAlign: 'center', fontWeight: 600, color: gapCount > 5 ? T.red : T.yellow }}>{gapCount}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* GRID VIEW — expanded team cards */}
        {view === 'grid' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {filteredTeams.map(team => {
            const teamData = data?.matrix?.[team.id]
            if (!teamData) return null

            return (
              <div key={team.id} style={{ background: T.surface, borderRadius: 12, border: `1px solid ${T.border}`, overflow: 'hidden' }}>
                {/* Team header */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: `1px solid ${T.border}`, background: `${team.color}08` }}>
                  <div style={{ width: 6, height: 32, borderRadius: 3, background: team.color, flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <h3 style={{ fontSize: 14, fontWeight: 600, margin: 0 }}>{team.name}</h3>
                    <p style={{ fontSize: 10, color: T.textTertiary, margin: '1px 0 0' }}>{team.full_name} · {team.engine}</p>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {(() => {
                      const partners = Object.values(teamData.categories).flat()
                      const cats = new Set(partners.map(p => p.category_id))
                      const gapCount = filteredCategories.filter(c => !cats.has(c.id)).length
                      return <>
                        <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: T.accentSoft, color: T.textSecondary, fontWeight: 500 }}>{partners.length} partners</span>
                        {gapCount > 0 && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: 'rgba(255,59,48,0.08)', color: T.red, fontWeight: 500 }}>{gapCount} gaps</span>}
                      </>
                    })()}
                  </div>
                </div>

                {/* Category grid */}
                <div style={{ padding: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 8 }}>
                  {filteredCategories.map(cat => {
                    const partners = teamData.categories[cat.id] || []
                    const isEmpty = partners.length === 0
                    if (showGapsOnly && !isEmpty) return null
                    return (
                      <div key={cat.id} style={{
                        padding: '8px 10px', borderRadius: 8, minHeight: 52,
                        background: isEmpty ? T.gap : T.accentSoft,
                        border: `1px solid ${isEmpty ? T.gapBorder : 'transparent'}`,
                        borderLeft: `3px solid ${cat.color || T.textTertiary}`,
                      }}>
                        <p style={{ fontSize: 9, fontWeight: 600, color: cat.color || T.textTertiary, margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{cat.name}</p>
                        {isEmpty ? (
                          <p style={{ fontSize: 10, color: T.red, fontStyle: 'italic', margin: 0, opacity: 0.7 }}>No partner</p>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            {partners.map(p => {
                              const badge = TIER_BADGE[p.tier] || TIER_BADGE.partner
                              return (
                                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                  <span style={{ fontSize: 11, fontWeight: 500, color: T.text, flex: 1 }}>{p.partner_name}</span>
                                  <span style={{ fontSize: 8, padding: '0px 4px', borderRadius: 3, background: badge.bg, color: badge.color, fontWeight: 600 }}>{badge.label}</span>
                                  <button onClick={() => removePartnership(p.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, opacity: 0.3, lineHeight: 1 }} title="Remove">
                                    <X size={10} color={T.red} />
                                  </button>
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
        )}
      </div>

      {/* Activity Log */}
      {activity?.recent?.length > 0 && (
        <div style={{ padding: '0 16px 12px', flexShrink: 0 }}>
          <div style={{ background: T.surface, borderRadius: 10, border: `1px solid ${T.border}`, padding: '10px 14px', maxHeight: 120, overflow: 'auto' }}>
            <p style={{ fontSize: 10, fontWeight: 600, color: T.textTertiary, margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Recent Activity (7 days)</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {activity.recent.slice(0, 8).map((r, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11 }}>
                  <span style={{ width: 6, height: 6, borderRadius: 3, background: r.verified ? T.green : T.yellow, flexShrink: 0 }} />
                  <span style={{ color: T.text, fontWeight: 500 }}>{r.partner_name}</span>
                  <span style={{ color: T.textTertiary }}>→ {r.team_id}</span>
                  <span style={{ fontSize: 9, color: T.textTertiary, padding: '0 4px', background: T.accentSoft, borderRadius: 3 }}>{r.category_id}</span>
                  <span style={{ fontSize: 9, color: T.textTertiary, marginLeft: 'auto' }}>{new Date(r.updated_at).toLocaleDateString()}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
