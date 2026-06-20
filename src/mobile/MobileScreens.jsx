import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'

const C = {
  bg: '#FEFEFC', card: '#FFFFFF', alt: '#F5F4F1',
  text: '#0A0A0A', sub: '#6B6B6B', mut: '#A0A0A0',
  line: 'rgba(0,0,0,0.07)', accent: '#0A0A0A',
  serif: "'Source Serif 4', Georgia, serif",
  sans: "'Inter', system-ui, -apple-system, sans-serif",
  shadow: '0 1px 2px rgba(0,0,0,0.04)',
}

function Loading() {
  return <div style={{ display: 'flex', justifyContent: 'center', padding: '60px 0', color: C.mut, fontFamily: C.sans, fontSize: 13 }}>Loading...</div>
}

function Screen({ title, subtitle, search, onSearch, right, children }) {
  return (
    <div style={{ position: 'absolute', inset: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', background: C.bg, fontFamily: C.sans, color: C.text }}>
      <div style={{ padding: '16px 18px 6px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h1 style={{ fontFamily: C.serif, fontWeight: 400, fontSize: 26, margin: 0, letterSpacing: '-0.01em' }}>{title}</h1>
          {subtitle && <p style={{ color: C.sub, fontSize: 13, fontWeight: 300, margin: '3px 0 0' }}>{subtitle}</p>}
        </div>
        {right}
      </div>
      {onSearch !== undefined && (
        <div style={{ padding: '8px 18px 10px' }}>
          <input value={search} onChange={e => onSearch(e.target.value)} placeholder="Search"
            style={{ width: '100%', boxSizing: 'border-box', height: 42, border: `1px solid ${C.line}`, borderRadius: 16, padding: '0 14px', fontSize: 15, fontFamily: C.sans, color: C.text, background: C.card, outline: 'none' }} />
        </div>
      )}
      <div style={{ padding: '4px 18px calc(80px + env(safe-area-inset-bottom, 0px))' }}>{children}</div>
    </div>
  )
}

function fmtValue(v, cur) {
  const n = Number(v)
  if (!n || isNaN(n)) return null
  const sym = cur === 'USD' ? '$' : cur === 'GBP' ? '\u00a3' : cur === 'EUR' ? '\u20ac' : (cur ? cur + ' ' : '\u20ac')
  if (n >= 1e6) return sym + (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'M'
  if (n >= 1e3) return sym + Math.round(n / 1e3) + 'k'
  return sym + n
}

function sumByCurrency(deals) {
  const by = {}
  for (const d of deals) { const c = (d.data && d.data.currency) || 'EUR'; const v = Number(d.data && d.data.value) || 0; if (v) by[c] = (by[c] || 0) + v }
  return by
}
function fmtTotals(by) {
  const entries = Object.entries(by).sort((a, b) => b[1] - a[1])
  if (!entries.length) return null
  return entries.slice(0, 2).map(([c, v]) => fmtValue(v, c)).join('  \u00b7  ')
}

export function MobilePipeline() {
  const [deals, setDeals] = useState(null)
  const [filter, setFilter] = useState('All')
  useEffect(() => {
    supabase.from('deals').select('id, data, updated_at')
      .or('data->>archived.is.null,data->>archived.neq.true')
      .order('updated_at', { ascending: false })
      .then(({ data }) => setDeals(data || []))
  }, [])
  const pipelines = useMemo(() => {
    const set = new Set();
    (deals || []).forEach(d => { const p = d.data && d.data.pipeline; if (p) set.add(p) })
    return Array.from(set)
  }, [deals])
  const filtered = useMemo(() => filter === 'All' ? (deals || []) : (deals || []).filter(d => (d.data && d.data.pipeline) === filter), [deals, filter])
  const groups = useMemo(() => {
    const by = {}
    for (const d of filtered) { const st = (d.data && d.data.stage) || 'Unsorted'; (by[st] = by[st] || []).push(d) }
    return Object.entries(by)
  }, [filtered])
  if (!deals) return <Loading />
  const totalStr = fmtTotals(sumByCurrency(filtered))
  return (
    <div style={{ position: 'absolute', inset: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', background: C.bg, fontFamily: C.sans, color: C.text }}>
      <div style={{ padding: '16px 18px 6px' }}>
        <h1 style={{ fontFamily: C.serif, fontWeight: 400, fontSize: 26, margin: 0, letterSpacing: '-0.01em' }}>Pipeline</h1>
        <p style={{ color: C.sub, fontSize: 13, fontWeight: 300, margin: '3px 0 0' }}>{totalStr ? totalStr + '  \u00b7  ' : ''}{filtered.length} {filtered.length === 1 ? 'deal' : 'deals'}</p>
      </div>
      {pipelines.length > 1 && (
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '6px 18px 12px' }}>
          {['All'].concat(pipelines).map(p => (
            <button key={p} onClick={() => setFilter(p)} style={{ flexShrink: 0, border: 'none', cursor: 'pointer', borderRadius: 24, padding: '7px 14px', fontSize: 13, fontFamily: C.sans, fontWeight: filter === p ? 500 : 400, background: filter === p ? C.accent : C.alt, color: filter === p ? '#fff' : C.sub, whiteSpace: 'nowrap' }}>{p}</button>
          ))}
        </div>
      )}
      <div style={{ padding: '0 18px calc(80px + env(safe-area-inset-bottom, 0px))' }}>
        {groups.map(([stage, items]) => {
          const stageTotal = fmtTotals(sumByCurrency(items))
          return (
            <div key={stage} style={{ marginBottom: 22 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', margin: '0 2px 9px' }}>
                <span style={{ fontSize: 11, fontWeight: 500, color: C.sub, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{stage}</span>
                <span style={{ fontSize: 12, color: C.mut, fontWeight: 500 }}>{stageTotal || items.length}</span>
              </div>
              {items.map(d => {
                const val = fmtValue(d.data && d.data.value, d.data && d.data.currency)
                const sub = [d.data && d.data.company, d.data && d.data.contactName].filter(Boolean).join('  \u00b7  ')
                return (
                  <div key={d.id} style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: '13px 14px', marginBottom: 8, boxShadow: C.shadow }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                      <span style={{ fontSize: 15, fontWeight: 450, color: C.text, lineHeight: 1.25 }}>{(d.data && (d.data.title || d.data.company)) || 'Untitled deal'}</span>
                      {val && <span style={{ fontSize: 14, fontWeight: 500, color: C.text, whiteSpace: 'nowrap' }}>{val}</span>}
                    </div>
                    {sub && <div style={{ fontSize: 13, color: C.sub, fontWeight: 300, marginTop: 3 }}>{sub}</div>}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function MobileRecords() {
  const nav = useNavigate()
  const [tab, setTab] = useState('people')
  const [q, setQ] = useState('')
  const [contacts, setContacts] = useState(null)
  const [companies, setCompanies] = useState(null)
  useEffect(() => {
    supabase.from('contacts').select('id, data').order('updated_at', { ascending: false }).range(0, 399).then(({ data }) => setContacts(data || []))
    supabase.from('companies').select('id, data').order('data->>name', { ascending: true }).range(0, 399).then(({ data }) => setCompanies(data || []))
  }, [])
  const loading = (tab === 'people' ? contacts : companies) === null
  const ql = q.trim().toLowerCase()
  const people = (contacts || []).filter(c => {
    const n = [c.data && c.data.firstName, c.data && c.data.lastName].filter(Boolean).join(' ')
    return !ql || (n + ' ' + ((c.data && c.data.company) || '') + ' ' + ((c.data && c.data.title) || '')).toLowerCase().includes(ql)
  })
  const orgs = (companies || []).filter(c => !ql || ((c.data && c.data.name) || '').toLowerCase().includes(ql))
  const Toggle = (
    <div style={{ display: 'flex', gap: 4, background: C.alt, borderRadius: 24, padding: 3 }}>
      {['people', 'companies'].map(t => (
        <button key={t} onClick={() => setTab(t)} style={{ border: 'none', cursor: 'pointer', borderRadius: 22, padding: '6px 12px', fontSize: 12, fontFamily: C.sans, fontWeight: tab === t ? 500 : 400, background: tab === t ? C.card : 'transparent', color: tab === t ? C.text : C.sub, boxShadow: tab === t ? C.shadow : 'none' }}>{t === 'people' ? 'People' : 'Companies'}</button>
      ))}
    </div>
  )
  return (
    <Screen title="Records" subtitle={tab === 'people' ? people.length + ' people' : orgs.length + ' companies'} search={q} onSearch={setQ} right={Toggle}>
      {loading ? <Loading /> : tab === 'people' ? people.map(c => {
        const name = [c.data && c.data.firstName, c.data && c.data.lastName].filter(Boolean).join(' ') || 'Unnamed'
        const init = (name[0] || '?').toUpperCase()
        const sub = [c.data && c.data.title, c.data && c.data.company].filter(Boolean).join('  \u00b7  ')
        return (
          <div key={c.id} onClick={() => nav('/records/contact/' + c.id)} style={{ display: 'flex', alignItems: 'center', gap: 12, background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: '11px 13px', marginBottom: 8, boxShadow: C.shadow }}>
            <div style={{ width: 34, height: 34, borderRadius: '50%', background: C.alt, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 500, color: C.sub, flexShrink: 0 }}>{init}</div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 450, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</div>
              {sub && <div style={{ fontSize: 13, color: C.sub, fontWeight: 300, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sub}</div>}
            </div>
          </div>
        )
      }) : orgs.map(c => (
        <div key={c.id} onClick={() => nav('/records/company/' + c.id)} style={{ display: 'flex', alignItems: 'center', gap: 12, background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: '11px 13px', marginBottom: 8, boxShadow: C.shadow }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, background: C.alt, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 500, color: C.sub, flexShrink: 0 }}>{((((c.data && c.data.name)) || '?')[0] || '?').toUpperCase()}</div>
          <div style={{ fontSize: 15, fontWeight: 450, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{(c.data && c.data.name) || 'Unnamed company'}</div>
        </div>
      ))}
    </Screen>
  )
}

export function MobileCampaigns() {
  const nav = useNavigate()
  const [seqs, setSeqs] = useState(null)
  useEffect(() => {
    supabase.from('kiko_sequences').select('*').order('created_at', { ascending: false }).then(({ data }) => setSeqs((data || []).filter(s => !s.archived)))
  }, [])
  if (!seqs) return <Loading />
  return (
    <Screen title="Campaigns" subtitle={seqs.length + ' sequences'}>
      {seqs.map(s => (
        <div key={s.id} onClick={() => nav('/campaigns/' + s.id)} style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: '13px 14px', marginBottom: 8, boxShadow: C.shadow, display: 'flex', alignItems: 'center', gap: 11 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: s.is_active ? '#3FA66A' : C.mut, flexShrink: 0 }} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 450, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name || 'Untitled sequence'}</div>
            <div style={{ fontSize: 12, color: C.sub, fontWeight: 300, marginTop: 2 }}>{s.is_active ? 'Active' : 'Paused'}</div>
          </div>
        </div>
      ))}
      {seqs.length === 0 && <div style={{ color: C.mut, fontSize: 14, padding: '20px 2px' }}>No campaigns yet.</div>}
    </Screen>
  )
}
