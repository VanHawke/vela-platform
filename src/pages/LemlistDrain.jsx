// src/pages/LemlistDrain.jsx — One-shot Lemlist drain UI
// Pulls every lead from every Lemlist campaign + people db into Kiko contacts.
// Designed to be run ONCE before cancelling Lemlist.
import { useState, useEffect } from 'react'
import { Database, Download, CheckCircle2, AlertCircle, Loader2, Play } from 'lucide-react'

const C = {
  bg: '#0D0D0F',
  border: 'rgba(255,255,255,0.06)',
  text: 'rgba(245,245,248,0.92)', textSec: 'rgba(245,245,248,0.55)', textTer: 'rgba(245,245,248,0.32)',
  purple: '#A78BFA', teal: '#2DD4BF', green: '#34D399', red: '#F87171', amber: '#FBBF24',
  font: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
}
const glass = { background: 'rgba(20,20,22,0.55)', backdropFilter: 'blur(28px) saturate(1.4)', border: `0.5px solid ${C.border}`, borderRadius: 12 }


const EMPTY = { created: 0, updated: 0, unchanged: 0, skipped: 0, fieldsFilled: 0, errors: [] }

export default function LemlistDrain() {
  const [campaigns, setCampaigns] = useState([])
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState(false)
  const [log, setLog] = useState([])
  const [totals, setTotals] = useState({ ...EMPTY, totalFetched: 0 })
  const [currentTask, setCurrentTask] = useState('')
  const [lastDrain, setLastDrain] = useState(null)

  useEffect(() => { loadStatus(); loadCampaigns() }, [])

  async function loadStatus() {
    try {
      const r = await fetch('/api/lemlist-drain?action=status')
      const j = await r.json()
      if (j.lastDrain) setLastDrain(j.lastDrain)
    } catch {}
  }

  async function loadCampaigns() {
    try {
      const r = await fetch('/api/lemlist-drain?action=campaigns')
      const j = await r.json()
      if (j.ok) setCampaigns(j.campaigns || [])
    } catch (e) { addLog('error', 'Failed to load campaigns: ' + e.message) }
  }

  function addLog(level, msg) { setLog(l => [...l, { level, msg, t: new Date().toLocaleTimeString() }]) }
  function bumpTotals(s) {
    setTotals(t => ({
      created: t.created + (s.created || 0),
      updated: t.updated + (s.updated || 0),
      unchanged: t.unchanged + (s.unchanged || 0),
      skipped: t.skipped + (s.skipped || 0),
      fieldsFilled: t.fieldsFilled + (s.fieldsFilled || 0),
      errors: [...t.errors, ...(s.errors || [])],
      totalFetched: t.totalFetched + (s.fetched || 0),
    }))
  }


  async function runDrain(dryRun = false) {
    if (!confirm(dryRun ? 'Run a DRY drain (preview only, no writes)?' : `RUN FULL LEMLIST DRAIN?\n\nThis will pull every lead from every Lemlist campaign and the People DB, then merge them into your Kiko contacts table. Existing contact fields are NEVER overwritten — only blanks get filled.\n\nThis is the one-shot before cancelling Lemlist. Proceed?`)) return
    setRunning(true); setDone(false); setLog([]); setTotals({ ...EMPTY, totalFetched: 0 })
    const dryParam = dryRun ? '&dry=true' : ''

    // ─── 1) PEOPLE DB ───
    setCurrentTask('Draining People Database...')
    addLog('info', 'Starting people database drain')
    let offset = 0
    for (let i = 0; i < 100; i++) {
      try {
        const r = await fetch(`/api/lemlist-drain?action=people&offset=${offset}${dryParam}`, { method: 'POST' })
        const j = await r.json()
        if (!j.ok) { addLog('error', 'People page failed: ' + (j.error || 'unknown')); break }
        bumpTotals(j)
        addLog('info', `People offset ${offset}: fetched ${j.fetched}, +${j.created} new, ${j.updated} updated`)
        if (j.done || j.fetched === 0) break
        offset += 100
      } catch (e) { addLog('error', 'Network error: ' + e.message); break }
    }

    // ─── 2) EACH CAMPAIGN ───
    for (const c of campaigns) {
      setCurrentTask(`Draining campaign: ${c.name}`)
      addLog('info', `Campaign "${c.name}" — starting`)
      let cOffset = 0
      for (let i = 0; i < 50; i++) {
        try {
          const r = await fetch(`/api/lemlist-drain?action=campaign&id=${c.id}&offset=${cOffset}${dryParam}`, { method: 'POST' })
          const j = await r.json()
          if (!j.ok) { addLog('error', `Campaign ${c.name} page ${cOffset}: ${j.error}`); break }
          bumpTotals(j)
          addLog('info', `  ${c.name} offset ${cOffset}: ${j.fetched} fetched, +${j.created} new, ${j.updated} updated`)
          if (j.done || j.fetched === 0) break
          cOffset += 100
        } catch (e) { addLog('error', `${c.name}: ${e.message}`); break }
      }
    }

    // ─── 3) WRITE SUMMARY ALERT ───
    if (!dryRun) {
      setCurrentTask('Writing summary...')
      const finalStats = await new Promise(resolve => setTotals(t => { resolve(t); return t }))
      try {
        await fetch('/api/lemlist-drain?action=summary', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(finalStats) })
        addLog('success', 'Summary written to alerts')
      } catch (e) { addLog('error', 'Summary write failed: ' + e.message) }
    }

    setCurrentTask('')
    setRunning(false)
    setDone(true)
    addLog('success', 'DRAIN COMPLETE')
    loadStatus()
  }


  return (
    <div style={{ padding: '24px 32px', maxWidth: 1100, margin: '0 auto', fontFamily: C.font, color: C.text }}>
      <div style={{ marginBottom: 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <Database size={22} style={{ color: C.purple }} />
          <h1 style={{ fontSize: 22, fontWeight: 500, margin: 0 }}>Lemlist Drain</h1>
          <span style={{ fontSize: 9, padding: '2px 8px', borderRadius: 10, background: 'rgba(251,191,36,0.10)', color: C.amber, border: '0.5px solid rgba(251,191,36,0.20)', fontWeight: 500 }}>ONE-SHOT</span>
        </div>
        <p style={{ fontSize: 12, color: C.textTer, margin: 0 }}>Pull all leads from Lemlist into Kiko contacts. Run this ONCE before cancelling Lemlist. Existing fields are never overwritten — only blanks get filled.</p>
      </div>

      {/* Stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 18 }}>
        {[
          { label: 'Fetched', value: totals.totalFetched, color: C.purple },
          { label: 'New leads', value: totals.created, color: C.green },
          { label: 'Updated', value: totals.updated, color: C.teal },
          { label: 'Fields filled', value: totals.fieldsFilled, color: C.amber },
          { label: 'Unchanged', value: totals.unchanged, color: C.textTer },
        ].map(s => (
          <div key={s.label} style={{ ...glass, padding: 14 }}>
            <div style={{ fontSize: 9, color: C.textTer, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{s.label}</div>
            <div style={{ fontSize: 22, fontWeight: 500, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Action buttons */}
      <div style={{ ...glass, padding: 18, marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, color: C.text, marginBottom: 2 }}>Ready to drain</div>
            <div style={{ fontSize: 11, color: C.textTer }}>{campaigns.length} campaigns detected · People DB included</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => runDrain(true)} disabled={running} style={{ padding: '9px 16px', borderRadius: 6, border: `0.5px solid ${C.border}`, background: 'transparent', color: C.textSec, fontSize: 11, cursor: running ? 'not-allowed' : 'pointer', fontFamily: C.font }}>Dry run</button>
            <button onClick={() => runDrain(false)} disabled={running} style={{ padding: '9px 22px', borderRadius: 6, border: `0.5px solid rgba(167,139,250,0.30)`, background: 'rgba(167,139,250,0.12)', color: C.purple, fontSize: 11, fontWeight: 500, cursor: running ? 'not-allowed' : 'pointer', fontFamily: C.font, display: 'flex', alignItems: 'center', gap: 6 }}>
              {running ? <><Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> Draining...</> : <><Play size={11} /> Run full drain</>}
            </button>
          </div>
        </div>
        {currentTask && <div style={{ fontSize: 11, color: C.purple, padding: '8px 12px', borderRadius: 6, background: 'rgba(167,139,250,0.06)' }}>{currentTask}</div>}
      </div>

      {/* Live log */}
      {log.length > 0 && (
        <div style={{ ...glass, padding: 14, marginBottom: 16 }}>
          <div style={{ fontSize: 9, color: C.textTer, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>Activity log</div>
          <div style={{ maxHeight: 320, overflowY: 'auto', fontFamily: 'monospace', fontSize: 10 }}>
            {log.map((l, i) => (
              <div key={i} style={{ padding: '3px 0', color: l.level === 'error' ? C.red : l.level === 'success' ? C.green : C.textSec }}>
                <span style={{ color: C.textMut }}>[{l.t}] </span>{l.msg}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Last drain summary */}
      {lastDrain && !running && (
        <div style={{ ...glass, padding: 14 }}>
          <div style={{ fontSize: 9, color: C.textTer, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Last drain</div>
          <div style={{ fontSize: 12, color: C.text }}>{lastDrain.title}</div>
          <div style={{ fontSize: 10, color: C.textTer, marginTop: 4 }}>{new Date(lastDrain.created_at).toLocaleString('en-GB')}</div>
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
