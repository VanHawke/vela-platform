// src/pages/Sourcing.jsx — Sprint B1: Web Search Sourcing Engine
import { useState, useEffect } from 'react'
import { Compass, Search, CheckCircle2, Loader2, Plus } from 'lucide-react'
import { supabase } from '@/lib/supabase'

const C = {
  bg: '#0D0D0F',
  border: 'rgba(255,255,255,0.06)',
  text: 'rgba(245,245,248,0.92)', textSec: 'rgba(245,245,248,0.55)', textTer: 'rgba(245,245,248,0.32)',
  purple: '#A78BFA', teal: '#2DD4BF', green: '#34D399', amber: '#FBBF24', red: '#F87171',
  font: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
}
const glass = { background: 'rgba(20,20,22,0.55)', backdropFilter: 'blur(28px) saturate(1.4)', border: `0.5px solid ${C.border}`, borderRadius: 12 }

export default function Sourcing() {
  const [sectors, setSectors] = useState([])
  const [sectorId, setSectorId] = useState('')
  const [count, setCount] = useState(15)
  const [geoOverride, setGeoOverride] = useState('')
  const [extraCriteria, setExtraCriteria] = useState('')
  const [loading, setLoading] = useState(false)
  const [run, setRun] = useState(null)
  const [accepted, setAccepted] = useState({})
  const [accepting, setAccepting] = useState(false)
  const [history, setHistory] = useState([])
  const [error, setError] = useState('')

  useEffect(() => { loadSectors(); loadHistory() }, [])

  async function loadSectors() {
    const { data } = await supabase
      .from('kiko_sector_definitions')
      .select('sector_id, name, priority')
      .order('priority', { ascending: true })
    if (data) {
      setSectors(data)
      if (data[0]) setSectorId(data[0].sector_id)
    }
  }

  async function loadHistory() {
    const { data } = await supabase
      .from('kiko_sourcing_runs')
      .select('id, sector_id, requested_count, returned_count, added_count, duplicate_count, status, started_at')
      .order('started_at', { ascending: false }).limit(10)
    setHistory(data || [])
  }

  async function runSourcing() {
    if (!sectorId) return
    setLoading(true); setRun(null); setAccepted({}); setError('')
    try {
      const r = await fetch('/api/source-web', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sector_id: sectorId, count, geo_override: geoOverride || undefined, extra_criteria: extraCriteria || undefined }),
      })
      const j = await r.json()
      if (!j.ok) { setError(j.error || 'Sourcing failed'); return }
      setRun(j)
      // Pre-select all "new" candidates
      const pre = {}
      ;(j.candidates || []).forEach((c, i) => { if (c.dedup_status === 'new') pre[i] = true })
      setAccepted(pre)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function acceptSelected() {
    if (!run?.run_id) return
    const toAccept = (run.candidates || []).filter((_, i) => accepted[i] && run.candidates[i].dedup_status === 'new')
    if (!toAccept.length) return
    setAccepting(true)
    try {
      const r = await fetch('/api/source-web?action=accept', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ run_id: run.run_id, accepted: toAccept }),
      })
      const j = await r.json()
      if (j.ok) {
        setRun(null); setAccepted({}); loadHistory()
      } else {
        setError(j.error || 'Accept failed')
      }
    } finally {
      setAccepting(false)
    }
  }

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1200, margin: '0 auto', fontFamily: C.font, color: C.text }}>
      <div style={{ marginBottom: 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <Compass size={22} style={{ color: C.purple }} />
          <h1 style={{ fontSize: 22, fontWeight: 500, margin: 0 }}>Lead Sourcing</h1>
          <span style={{ fontSize: 9, padding: '2px 8px', borderRadius: 10, background: 'rgba(167,139,250,0.10)', color: C.purple, border: '0.5px solid rgba(167,139,250,0.20)', fontWeight: 500 }}>WEB SEARCH</span>
        </div>
        <p style={{ fontSize: 12, color: C.textTer, margin: 0 }}>Source new companies via Sonnet + web search. Free expansion of your universe — zero new tools, zero new spend.</p>
      </div>

      {/* Form */}
      <div style={{ ...glass, padding: 18, marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div>
            <label style={{ fontSize: 9, color: C.textTer, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6, display: 'block' }}>Sector</label>
            <select value={sectorId} onChange={e => setSectorId(e.target.value)} style={{ width: '100%', padding: '8px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.04)', border: `0.5px solid ${C.border}`, color: C.text, fontSize: 12, fontFamily: C.font }}>
              {sectors.map(s => <option key={s.sector_id} value={s.sector_id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 9, color: C.textTer, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6, display: 'block' }}>Count</label>
            <input type="number" value={count} onChange={e => setCount(parseInt(e.target.value) || 15)} min={1} max={30} style={{ width: '100%', padding: '8px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.04)', border: `0.5px solid ${C.border}`, color: C.text, fontSize: 12, fontFamily: C.font }} />
          </div>
          <div>
            <label style={{ fontSize: 9, color: C.textTer, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6, display: 'block' }}>Geo override</label>
            <input value={geoOverride} onChange={e => setGeoOverride(e.target.value)} placeholder="e.g. EU, MENA" style={{ width: '100%', padding: '8px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.04)', border: `0.5px solid ${C.border}`, color: C.text, fontSize: 12, fontFamily: C.font }} />
          </div>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label style={{ fontSize: 9, color: C.textTer, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6, display: 'block' }}>Extra criteria (optional)</label>
          <input value={extraCriteria} onChange={e => setExtraCriteria(e.target.value)} placeholder="e.g. recently announced Series C, expanding into MENA" style={{ width: '100%', padding: '8px 10px', borderRadius: 6, background: 'rgba(255,255,255,0.04)', border: `0.5px solid ${C.border}`, color: C.text, fontSize: 12, fontFamily: C.font }} />
        </div>
        <button onClick={runSourcing} disabled={loading || !sectorId} style={{ padding: '9px 22px', borderRadius: 6, border: `0.5px solid rgba(167,139,250,0.30)`, background: 'rgba(167,139,250,0.12)', color: C.purple, fontSize: 11, fontWeight: 500, cursor: loading ? 'not-allowed' : 'pointer', fontFamily: C.font, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {loading ? <><Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> Searching...</> : <><Search size={11} /> Source companies</>}
        </button>
        {error && <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 6, background: 'rgba(248,113,113,0.08)', color: C.red, fontSize: 11 }}>{error}</div>}
      </div>

      {/* Results */}
      {run && (
        <div style={{ ...glass, padding: 18, marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: C.text }}>Candidates</div>
              <div style={{ fontSize: 11, color: C.textTer, marginTop: 2 }}>
                {run.stats?.returned} returned · <span style={{ color: C.green }}>{run.stats?.new} new</span> · <span style={{ color: C.amber }}>{run.stats?.duplicates} duplicates</span>
              </div>
            </div>
            <button onClick={acceptSelected} disabled={accepting || !Object.values(accepted).some(v => v)} style={{ padding: '8px 18px', borderRadius: 6, border: `0.5px solid rgba(52,211,153,0.30)`, background: 'rgba(52,211,153,0.12)', color: C.green, fontSize: 11, fontWeight: 500, cursor: accepting ? 'not-allowed' : 'pointer', fontFamily: C.font, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              {accepting ? <><Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> Adding...</> : <><Plus size={11} /> Accept selected</>}
            </button>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {(run.candidates || []).map((c, i) => (
              <label key={i} style={{ display: 'grid', gridTemplateColumns: '24px 1.5fr 1fr 3fr 80px', gap: 10, alignItems: 'center', padding: '10px 12px', borderRadius: 6, background: 'rgba(255,255,255,0.02)', border: `0.5px solid ${C.border}`, cursor: c.dedup_status === 'new' ? 'pointer' : 'default', opacity: c.dedup_status === 'new' ? 1 : 0.5 }}>
                <input type="checkbox" checked={!!accepted[i]} disabled={c.dedup_status !== 'new'} onChange={e => setAccepted({ ...accepted, [i]: e.target.checked })} />
                <div style={{ fontSize: 12, fontWeight: 500, color: C.text }}>{c.name}</div>
                <div style={{ fontSize: 11, color: C.textSec, fontFamily: 'monospace' }}>{c.domain}</div>
                <div style={{ fontSize: 10, color: C.textTer, lineHeight: 1.4 }}>{c.rationale}</div>
                <div style={{ fontSize: 9, padding: '3px 8px', borderRadius: 10, textAlign: 'center', background: c.dedup_status === 'new' ? 'rgba(52,211,153,0.10)' : 'rgba(251,191,36,0.10)', color: c.dedup_status === 'new' ? C.green : C.amber, border: `0.5px solid ${c.dedup_status === 'new' ? 'rgba(52,211,153,0.20)' : 'rgba(251,191,36,0.20)'}` }}>{c.dedup_status === 'new' ? 'NEW' : 'DUPE'}</div>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* History */}
      {history.length > 0 && (
        <div style={{ ...glass, padding: 18 }}>
          <div style={{ fontSize: 9, color: C.textTer, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>Recent runs</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {history.map(h => (
              <div key={h.id} style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr 1fr 1fr', gap: 10, padding: '10px 12px', borderRadius: 6, background: 'rgba(255,255,255,0.02)', border: `0.5px solid ${C.border}`, fontSize: 11 }}>
                <div style={{ color: C.text }}>{h.sector_id}</div>
                <div style={{ color: C.textSec }}>{h.returned_count} returned</div>
                <div style={{ color: C.green }}>{h.added_count || 0} added</div>
                <div style={{ color: C.amber }}>{h.duplicate_count} dupes</div>
                <div style={{ color: C.textTer, textAlign: 'right' }}>{new Date(h.started_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
