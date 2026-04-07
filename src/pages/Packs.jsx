// src/pages/Packs.jsx — Vertical Pack management UI
// Shows the active pack, sectors, scoring weights, target roles, framework.
// Layer 3 of the Kiko architecture made visible and editable.
import { useState, useEffect } from 'react'
import { Layers, Sliders, Target, Users, Briefcase, Edit3, Check, X } from 'lucide-react'

const C = {
  bg: '#0D0D0F', card: '#141416', cardHover: '#1A1A1E',
  border: 'rgba(255,255,255,0.06)', borderHover: 'rgba(255,255,255,0.10)',
  text: 'rgba(245,245,248,0.92)', textSec: 'rgba(245,245,248,0.55)',
  textTer: 'rgba(245,245,248,0.32)', textMut: 'rgba(245,245,248,0.16)',
  purple: '#A78BFA', teal: '#2DD4BF', green: '#34D399',
  red: '#F87171', amber: '#FBBF24', blue: '#60A5FA',
  font: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", r: 8,
}
const glass = { background: 'rgba(20,20,22,0.55)', backdropFilter: 'blur(28px) saturate(1.4)', WebkitBackdropFilter: 'blur(28px) saturate(1.4)', border: `0.5px solid ${C.border}`, borderRadius: 12 }


export default function Packs() {
  const [pack, setPack] = useState(null)
  const [sectors, setSectors] = useState([])
  const [loading, setLoading] = useState(true)
  const [editingWeights, setEditingWeights] = useState(false)
  const [weightDraft, setWeightDraft] = useState({})
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const r = await fetch('/api/packs?action=active')
      const j = await r.json()
      if (j.pack) {
        setPack(j.pack)
        setSectors(j.sectors || [])
        setWeightDraft(j.pack.scoring_weights || {})
      }
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  async function saveWeights() {
    if (!pack) return
    const total = Object.values(weightDraft).reduce((s, v) => s + (parseFloat(v) || 0), 0)
    if (Math.abs(total - 100) > 0.1) { alert(`Weights must sum to 100. Currently: ${total}`); return }
    setSaving(true)
    try {
      const r = await fetch(`/api/packs?id=${pack.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scoring_weights: weightDraft }),
      })
      const j = await r.json()
      if (j.pack) { setPack(j.pack); setEditingWeights(false) }
    } catch (e) { alert('Save failed: ' + e.message) }
    setSaving(false)
  }


  if (loading) return <div style={{ padding: 40, color: C.textTer, fontFamily: C.font }}>Loading active pack...</div>
  if (!pack) return <div style={{ padding: 40, color: C.textTer, fontFamily: C.font }}>No active vertical pack.</div>

  const weights = pack.scoring_weights || {}
  const totalWeight = Object.values(weights).reduce((s, v) => s + (parseFloat(v) || 0), 0)
  const targetRoles = pack.target_roles || []
  const framework = pack.campaign_framework || {}
  const touches = framework.touches || []

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1400, margin: '0 auto', fontFamily: C.font, color: C.text }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <Layers size={22} style={{ color: C.purple }} />
          <h1 style={{ fontSize: 22, fontWeight: 500, margin: 0 }}>Vertical Pack</h1>
          <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 10, background: 'rgba(45,212,191,0.10)', color: C.teal, border: '0.5px solid rgba(45,212,191,0.20)', fontWeight: 500 }}>ACTIVE</span>
        </div>
        <p style={{ fontSize: 12, color: C.textTer, margin: 0 }}>Layer 3 of Kiko OS — the only industry-specific configuration. Every module reads this.</p>
      </div>

      {/* Pack identity */}
      <div style={{ ...glass, padding: 20, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: 'linear-gradient(135deg, rgba(167,139,250,0.20), rgba(45,212,191,0.20))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Briefcase size={20} style={{ color: C.purple }} /></div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 500 }}>{pack.name}</div>
            <div style={{ fontSize: 11, color: C.textTer, marginTop: 2 }}>{pack.slug} · v{pack.version}</div>
          </div>
        </div>
        {pack.description && <div style={{ fontSize: 12, color: C.textSec, marginTop: 12, lineHeight: 1.6 }}>{pack.description}</div>}
      </div>


      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        {/* Scoring Weights — editable */}
        <div style={{ ...glass, padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Sliders size={14} style={{ color: C.purple }} />
              <span style={{ fontSize: 12, fontWeight: 500 }}>SponsorSignal Weights</span>
            </div>
            {!editingWeights ? (
              <button onClick={() => setEditingWeights(true)} style={{ padding: '4px 10px', borderRadius: 5, border: `0.5px solid ${C.border}`, background: 'rgba(167,139,250,0.04)', color: C.purple, fontSize: 10, cursor: 'pointer', fontFamily: C.font, display: 'flex', alignItems: 'center', gap: 4 }}><Edit3 size={9} />Edit</button>
            ) : (
              <div style={{ display: 'flex', gap: 4 }}>
                <button onClick={() => { setWeightDraft(weights); setEditingWeights(false); }} style={{ padding: '4px 8px', borderRadius: 5, border: `0.5px solid ${C.border}`, background: 'transparent', color: C.textSec, fontSize: 10, cursor: 'pointer', fontFamily: C.font }}><X size={9} /></button>
                <button onClick={saveWeights} disabled={saving} style={{ padding: '4px 8px', borderRadius: 5, border: 'none', background: 'rgba(45,212,191,0.10)', color: C.teal, fontSize: 10, cursor: 'pointer', fontFamily: C.font }}><Check size={9} /></button>
              </div>
            )}
          </div>
          {Object.entries(editingWeights ? weightDraft : weights).map(([key, val]) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <span style={{ fontSize: 11, color: C.textSec, flex: 1, textTransform: 'capitalize' }}>{key.replace(/_/g, ' ')}</span>
              {editingWeights ? (
                <input type="number" min="0" max="100" value={weightDraft[key]} onChange={e => setWeightDraft({ ...weightDraft, [key]: parseFloat(e.target.value) || 0 })} style={{ width: 60, padding: '4px 8px', borderRadius: 5, border: `0.5px solid ${C.border}`, background: 'rgba(255,255,255,0.02)', color: C.text, fontSize: 11, fontFamily: C.font, outline: 'none', textAlign: 'right' }} />
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 80, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.04)', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${val}%`, background: 'linear-gradient(90deg, #7C5CFC, #2DD4BF)' }} />
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 500, color: C.text, width: 36, textAlign: 'right' }}>{val}%</span>
                </div>
              )}
            </div>
          ))}
          <div style={{ fontSize: 9, color: editingWeights && Math.abs(Object.values(weightDraft).reduce((s, v) => s + (parseFloat(v) || 0), 0) - 100) > 0.1 ? C.red : C.textTer, marginTop: 10, textAlign: 'right' }}>
            Total: {(editingWeights ? Object.values(weightDraft).reduce((s, v) => s + (parseFloat(v) || 0), 0) : totalWeight).toFixed(0)}% {editingWeights && '(must equal 100)'}
          </div>
        </div>


        {/* Target Roles */}
        <div style={{ ...glass, padding: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <Users size={14} style={{ color: C.purple }} />
            <span style={{ fontSize: 12, fontWeight: 500 }}>Target Roles</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {targetRoles.map(role => (
              <span key={role} style={{ padding: '5px 11px', borderRadius: 12, background: 'rgba(167,139,250,0.06)', border: `0.5px solid rgba(167,139,250,0.12)`, color: C.purple, fontSize: 11, fontWeight: 500 }}>{role}</span>
            ))}
          </div>
        </div>
      </div>

      {/* Sectors */}
      <div style={{ ...glass, padding: 20, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <Target size={14} style={{ color: C.purple }} />
          <span style={{ fontSize: 12, fontWeight: 500 }}>Active Sectors</span>
          <span style={{ fontSize: 9, color: C.textTer, marginLeft: 4 }}>· {sectors.length} configured</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
          {sectors.map(s => (
            <div key={s.id} style={{ padding: 12, borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: `0.5px solid ${C.border}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 8, background: 'rgba(167,139,250,0.10)', color: C.purple, fontWeight: 500 }}>#{s.priority}</span>
                <span style={{ fontSize: 12, fontWeight: 500, color: C.text }}>{s.name}</span>
              </div>
              {s.description && <div style={{ fontSize: 10, color: C.textTer, lineHeight: 1.4, marginBottom: 6 }}>{s.description}</div>}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                {(s.keywords || []).slice(0, 6).map((k, i) => (
                  <span key={i} style={{ fontSize: 9, padding: '1px 5px', borderRadius: 4, background: 'rgba(255,255,255,0.03)', color: C.textTer }}>{k}</span>
                ))}
                {(s.keywords || []).length > 6 && <span style={{ fontSize: 9, color: C.textMut }}>+{s.keywords.length - 6}</span>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Campaign Framework */}
      <div style={{ ...glass, padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <Briefcase size={14} style={{ color: C.purple }} />
          <span style={{ fontSize: 12, fontWeight: 500 }}>Campaign Framework</span>
          <span style={{ fontSize: 9, color: C.textTer, marginLeft: 4 }}>· {touches.length}-touch sequence</span>
        </div>
        {touches.map((t, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: i < touches.length - 1 ? `0.5px solid ${C.border}` : 'none' }}>
            <span style={{ width: 24, height: 24, borderRadius: 6, background: 'rgba(167,139,250,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 500, color: C.purple }}>{t.step}</span>
            <span style={{ fontSize: 11, fontWeight: 500, color: C.text, textTransform: 'capitalize', flex: 1 }}>{(t.approach || '').replace(/_/g, ' ')}</span>
            <span style={{ fontSize: 10, color: C.textSec, textTransform: 'capitalize' }}>{(t.psychology || '').replace(/_/g, ' ')}</span>
            <span style={{ fontSize: 10, color: C.textTer, padding: '2px 7px', borderRadius: 8, background: t.channel === 'linkedin' ? 'rgba(0,119,181,0.10)' : 'rgba(167,139,250,0.06)' }}>{t.channel}</span>
            <span style={{ fontSize: 10, color: C.textTer, width: 60, textAlign: 'right' }}>+{t.delay_days}d</span>
          </div>
        ))}
        {framework.min_score_threshold && (
          <div style={{ marginTop: 14, padding: 10, borderRadius: 6, background: 'rgba(45,212,191,0.04)', border: `0.5px solid rgba(45,212,191,0.10)`, fontSize: 10, color: C.teal }}>
            Minimum SponsorSignal score for outreach: <strong>{framework.min_score_threshold}/100</strong>
          </div>
        )}
      </div>
    </div>
  )
}
