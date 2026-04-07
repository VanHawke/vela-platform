// src/pages/Leads.jsx — Lemlist-style People Database
import { useState, useEffect } from 'react'
import { Users, Search, Plus, Sparkles, Edit2, X, Mail, Linkedin, Briefcase, Building, MapPin, Upload, CheckCircle2, AlertCircle } from 'lucide-react'

const C = {
  bg: '#0D0D0F', card: '#141416',
  border: 'rgba(255,255,255,0.06)',
  text: 'rgba(245,245,248,0.92)', textSec: 'rgba(245,245,248,0.55)',
  textTer: 'rgba(245,245,248,0.32)', textMut: 'rgba(245,245,248,0.16)',
  purple: '#A78BFA', teal: '#2DD4BF', green: '#34D399',
  red: '#F87171', amber: '#FBBF24', blue: '#60A5FA',
  font: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
}
const glass = { background: 'rgba(20,20,22,0.55)', backdropFilter: 'blur(28px) saturate(1.4)', WebkitBackdropFilter: 'blur(28px) saturate(1.4)', border: `0.5px solid ${C.border}`, borderRadius: 12 }
const inputStyle = { padding: '8px 12px', borderRadius: 6, border: `0.5px solid ${C.border}`, background: 'rgba(255,255,255,0.02)', color: C.text, fontSize: 12, fontFamily: C.font, outline: 'none', width: '100%' }
const btn = (color = C.purple) => ({ padding: '8px 14px', borderRadius: 6, border: `0.5px solid ${color}30`, background: `${color}10`, color, fontSize: 11, cursor: 'pointer', fontFamily: C.font, display: 'flex', alignItems: 'center', gap: 6 })


const EMPTY_LEAD = { firstName: '', lastName: '', email: '', title: '', linkedin: '', company: '', phone: '', location: '', industry: '', notes: '' }

export default function Leads() {
  const [leads, setLeads] = useState([])
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState('all') // all|complete|incomplete
  const [editing, setEditing] = useState(null) // null | 'new' | leadObj
  const [form, setForm] = useState(EMPTY_LEAD)
  const [enriching, setEnriching] = useState(false)
  const [saving, setSaving] = useState(false)
  const [csvOpen, setCsvOpen] = useState(false)
  const [csvText, setCsvText] = useState('')
  const [importing, setImporting] = useState(false)

  useEffect(() => { load() }, [filter])

  async function load() {
    setLoading(true)
    try {
      const params = new URLSearchParams({ action: 'search', limit: '200' })
      if (filter === 'complete') { params.set('has_email', 'true'); params.set('has_linkedin', 'true') }
      if (filter === 'incomplete') params.set('incomplete', 'true')
      if (q) params.set('q', q)
      const r = await fetch('/api/leads?' + params.toString())
      const j = await r.json()
      setLeads(j.results || [])
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  function startNew() { setForm(EMPTY_LEAD); setEditing('new') }
  function startEdit(lead) { setForm({ ...EMPTY_LEAD, ...lead }); setEditing(lead) }

  async function save() {
    setSaving(true)
    try {
      const isNew = editing === 'new'
      const url = isNew ? '/api/leads?action=create' : `/api/leads?action=update&id=${editing.id}`
      const method = isNew ? 'POST' : 'PATCH'
      const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
      const j = await r.json()
      if (j.ok) { setEditing(null); await load() } else alert(j.error || 'save failed')
    } catch (e) { alert(e.message) }
    setSaving(false)
  }


  async function enrich() {
    if (editing === 'new') { alert('save first, then enrich'); return }
    setEnriching(true)
    try {
      const r = await fetch(`/api/leads?action=enrich&id=${editing.id}`, { method: 'POST' })
      const j = await r.json()
      if (j.ok) {
        setForm(f => ({ ...f, ...j.lead }))
        alert(`Enriched: ${j.updated?.length ? j.updated.join(', ') : 'no new fields'} (confidence: ${j.confidence || 'n/a'})`)
      } else alert(j.error || 'enrich failed')
    } catch (e) { alert(e.message) }
    setEnriching(false)
  }

  async function importCsv() {
    setImporting(true)
    try {
      const lines = csvText.trim().split('\n')
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/\s+/g, '_'))
      const rows = lines.slice(1).map(line => {
        const cells = line.split(',').map(c => c.trim())
        const obj = {}
        headers.forEach((h, i) => { obj[h] = cells[i] || '' })
        return obj
      })
      const r = await fetch('/api/leads?action=import_csv', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rows }) })
      const j = await r.json()
      if (j.ok) { setCsvOpen(false); setCsvText(''); await load(); alert(`Imported ${j.imported} leads`) }
      else alert(j.error || 'import failed')
    } catch (e) { alert(e.message) }
    setImporting(false)
  }

  const completion = (l) => {
    let n = 0
    if (l.email) n++; if (l.linkedin) n++; if (l.title) n++; if (l.company) n++; if (l.phone) n++
    return n
  }


  return (
    <div style={{ padding: '24px 32px', maxWidth: 1400, margin: '0 auto', fontFamily: C.font, color: C.text }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Users size={22} style={{ color: C.purple }} />
            <h1 style={{ fontSize: 22, fontWeight: 500, margin: 0 }}>Leads</h1>
          </div>
          <p style={{ fontSize: 12, color: C.textTer, margin: '4px 0 0 0' }}>People database · {leads.length} loaded</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setCsvOpen(true)} style={btn(C.blue)}><Upload size={11} /> Import CSV</button>
          <button onClick={startNew} style={btn(C.purple)}><Plus size={11} /> New lead</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 360 }}>
          <Search size={12} style={{ position: 'absolute', left: 10, top: 11, color: C.textTer }} />
          <input value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && load()} placeholder="Search by name, email, company, title..." style={{ ...inputStyle, paddingLeft: 28 }} />
        </div>
        {['all', 'complete', 'incomplete'].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{ padding: '7px 14px', borderRadius: 6, border: `0.5px solid ${filter === f ? C.purple : C.border}`, background: filter === f ? 'rgba(167,139,250,0.08)' : 'transparent', color: filter === f ? C.purple : C.textTer, fontSize: 11, cursor: 'pointer', fontFamily: C.font, textTransform: 'capitalize' }}>{f}</button>
        ))}
      </div>

      {loading ? (
        <div style={{ ...glass, padding: 60, textAlign: 'center', color: C.textTer, fontSize: 12 }}>Loading...</div>
      ) : leads.length === 0 ? (
        <div style={{ ...glass, padding: 60, textAlign: 'center', color: C.textTer, fontSize: 12 }}>No leads found. Click "New lead" or "Import CSV" to add some.</div>
      ) : (
        <div style={{ ...glass, overflow: 'hidden' }}>
          {leads.map(l => {
            const c = completion(l)
            const cColor = c >= 4 ? C.green : c >= 2 ? C.amber : C.red
            return (
              <div key={l.id} onClick={() => startEdit(l)} style={{ padding: '12px 18px', borderBottom: `0.5px solid ${C.border}`, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 36, height: 36, borderRadius: 18, background: `${C.purple}15`, color: C.purple, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 500 }}>{(l.firstName?.[0] || '?')}{(l.lastName?.[0] || '')}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: C.text }}>{l.firstName} {l.lastName}</div>
                  <div style={{ fontSize: 10, color: C.textTer, marginTop: 2 }}>{l.title || 'no title'} {l.company && `· ${l.company}`}</div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 10, color: C.textSec }}>
                  {l.email && <span title={l.email} style={{ display: 'flex', alignItems: 'center', gap: 3 }}><Mail size={10} style={{ color: C.green }} /></span>}
                  {l.linkedin && <span title="linkedin" style={{ display: 'flex', alignItems: 'center', gap: 3 }}><Linkedin size={10} style={{ color: C.blue }} /></span>}
                  <span style={{ padding: '2px 8px', borderRadius: 8, background: `${cColor}10`, color: cColor, fontWeight: 500 }}>{c}/5</span>
                </div>
              </div>
            )
          })}
        </div>
      )}


      {/* ─── EDIT/NEW DRAWER ─── */}
      {editing && (
        <div onClick={() => setEditing(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)', zIndex: 100, display: 'flex', justifyContent: 'flex-end' }}>
          <div onClick={e => e.stopPropagation()} style={{ width: 480, height: '100%', background: '#0F0F12', borderLeft: `0.5px solid ${C.border}`, padding: 28, overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
              <h2 style={{ fontSize: 16, fontWeight: 500, margin: 0, color: C.text }}>{editing === 'new' ? 'New lead' : 'Edit lead'}</h2>
              <button onClick={() => setEditing(null)} style={{ background: 'transparent', border: 'none', color: C.textTer, cursor: 'pointer' }}><X size={16} /></button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
              <div><label style={{ fontSize: 9, color: C.textTer, textTransform: 'uppercase', letterSpacing: '0.05em' }}>First name</label><input value={form.firstName} onChange={e => setForm({ ...form, firstName: e.target.value })} style={inputStyle} /></div>
              <div><label style={{ fontSize: 9, color: C.textTer, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Last name</label><input value={form.lastName} onChange={e => setForm({ ...form, lastName: e.target.value })} style={inputStyle} /></div>
            </div>
            <div style={{ marginBottom: 12 }}><label style={{ fontSize: 9, color: C.textTer, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Email</label><input value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="name@company.com" style={inputStyle} /></div>
            <div style={{ marginBottom: 12 }}><label style={{ fontSize: 9, color: C.textTer, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Job title</label><input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} style={inputStyle} /></div>
            <div style={{ marginBottom: 12 }}><label style={{ fontSize: 9, color: C.textTer, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Company</label><input value={form.company} onChange={e => setForm({ ...form, company: e.target.value })} style={inputStyle} /></div>
            <div style={{ marginBottom: 12 }}><label style={{ fontSize: 9, color: C.textTer, textTransform: 'uppercase', letterSpacing: '0.05em' }}>LinkedIn URL</label><input value={form.linkedin} onChange={e => setForm({ ...form, linkedin: e.target.value })} placeholder="https://linkedin.com/in/..." style={inputStyle} /></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
              <div><label style={{ fontSize: 9, color: C.textTer, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Phone</label><input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} style={inputStyle} /></div>
              <div><label style={{ fontSize: 9, color: C.textTer, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Location</label><input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} style={inputStyle} /></div>
            </div>
            <div style={{ marginBottom: 12 }}><label style={{ fontSize: 9, color: C.textTer, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Industry</label><input value={form.industry} onChange={e => setForm({ ...form, industry: e.target.value })} style={inputStyle} /></div>
            <div style={{ marginBottom: 18 }}><label style={{ fontSize: 9, color: C.textTer, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Notes</label><textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} rows={3} style={{ ...inputStyle, resize: 'vertical', fontFamily: C.font }} /></div>

            <div style={{ display: 'flex', gap: 8, paddingTop: 16, borderTop: `0.5px solid ${C.border}` }}>
              <button onClick={save} disabled={saving} style={{ ...btn(C.purple), flex: 1, justifyContent: 'center' }}>{saving ? 'Saving...' : 'Save lead'}</button>
              {editing !== 'new' && <button onClick={enrich} disabled={enriching} style={btn(C.teal)}><Sparkles size={11} />{enriching ? 'Enriching...' : 'AI enrich'}</button>}
            </div>
          </div>
        </div>
      )}


      {/* ─── CSV IMPORT MODAL ─── */}
      {csvOpen && (
        <div onClick={() => setCsvOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()} style={{ width: 560, background: '#0F0F12', border: `0.5px solid ${C.border}`, borderRadius: 14, padding: 28 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ fontSize: 16, fontWeight: 500, margin: 0 }}>Import leads from CSV</h2>
              <button onClick={() => setCsvOpen(false)} style={{ background: 'transparent', border: 'none', color: C.textTer, cursor: 'pointer' }}><X size={16} /></button>
            </div>
            <p style={{ fontSize: 11, color: C.textSec, marginBottom: 12 }}>Paste CSV with header row. Recognized columns: <code style={{ color: C.purple }}>firstName, lastName, email, title, company, linkedin, phone, location, industry</code></p>
            <textarea value={csvText} onChange={e => setCsvText(e.target.value)} rows={12} placeholder="firstName,lastName,email,title,company,linkedin&#10;Jane,Doe,jane@acme.com,CMO,Acme Inc,https://linkedin.com/in/janedoe" style={{ ...inputStyle, fontFamily: 'monospace', fontSize: 11, resize: 'vertical' }} />
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button onClick={importCsv} disabled={importing || !csvText.trim()} style={{ ...btn(C.purple), flex: 1, justifyContent: 'center' }}>{importing ? 'Importing...' : 'Import'}</button>
              <button onClick={() => setCsvOpen(false)} style={btn(C.textTer)}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
