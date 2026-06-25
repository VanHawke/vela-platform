import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { supabase } from '@/lib/supabase'

const C = {
  bg: '#FEFEFC', card: '#FFFFFF', alt: '#F5F4F1',
  text: '#0A0A0A', sub: '#6B6B6B', mut: '#A0A0A0',
  line: 'rgba(0,0,0,0.07)', line2: 'rgba(0,0,0,0.05)', accent: '#0A0A0A',
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

function sumByCurrency(rows) {
  const by = {}
  for (const d of rows) { const c = (d.data && d.data.currency) || 'EUR'; const v = Number(d.data && d.data.value) || 0; if (v) by[c] = (by[c] || 0) + v }
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
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState('all')
  const [contacts, setContacts] = useState(null)
  const [companies, setCompanies] = useState(null)
  const [deals, setDeals] = useState([])
  useEffect(() => {
    supabase.from('contacts').select('id, data').order('updated_at', { ascending: false }).range(0, 299).then(({ data }) => setContacts(data || []))
    supabase.from('companies').select('id, data').order('updated_at', { ascending: false }).range(0, 299).then(({ data }) => setCompanies(data || []))
    supabase.from('deals').select('id, data').or('data->>archived.is.null,data->>archived.neq.true').then(({ data }) => setDeals(data || []))
  }, [])
  const dealStage = useMemo(() => {
    const byCo = {}, byContact = {}
    for (const d of (deals || [])) {
      const st = d.data && d.data.stage
      if (!st) continue
      const co = d.data && d.data.company, cn = d.data && d.data.contactName
      if (co && !byCo[co]) byCo[co] = st
      if (cn && !byContact[cn]) byContact[cn] = st
    }
    return { byCo, byContact }
  }, [deals])
  const items = useMemo(() => {
    const people = (contacts || []).map(c => {
      const name = [c.data && c.data.firstName, c.data && c.data.lastName].filter(Boolean).join(' ') || 'Unnamed'
      const company = (c.data && c.data.company) || ''
      return { key: 'p' + c.id, kind: 'person', name, sub: [c.data && c.data.title, company].filter(Boolean).join('  \u00b7  '), status: dealStage.byContact[name] || dealStage.byCo[company] || null, to: '/records/contact/' + c.id }
    })
    const orgs = (companies || []).map(c => {
      const name = (c.data && c.data.name) || 'Unnamed company'
      const desc = (c.data && (c.data.description || c.data.industry || c.data.sector)) || ''
      const emp = (c.data && c.data.employees) ? (c.data.employees + ' staff') : ''
      return { key: 'c' + c.id, kind: 'company', name, sub: [desc, emp].filter(Boolean).join('  \u00b7  '), status: dealStage.byCo[name] || ((c.data && Number(c.data.openDeals) > 0) ? 'Active' : null), to: '/records/company/' + c.id }
    })
    let all = filter === 'people' ? people : filter === 'companies' ? orgs : people.concat(orgs)
    const ql = q.trim().toLowerCase()
    if (ql) all = all.filter(x => (x.name + ' ' + x.sub).toLowerCase().includes(ql))
    return all
  }, [contacts, companies, q, filter, dealStage])
  if (contacts === null || companies === null) return <Loading />
  const segBtn = (key, label) => (
    <button key={key} onClick={() => setFilter(key)} style={{ flex: 1, border: 'none', borderRadius: 9, padding: '8px 0', fontFamily: C.sans, fontSize: 13, fontWeight: 500, cursor: 'pointer', background: filter === key ? C.card : 'transparent', color: filter === key ? C.text : C.sub, boxShadow: filter === key ? C.shadow : 'none' }}>{label}</button>
  )
  return (
    <div style={{ position: 'absolute', inset: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', background: C.bg, fontFamily: C.sans, color: C.text }}>
      <div style={{ padding: '18px 18px 0' }}>
        <h1 style={{ fontFamily: C.serif, fontWeight: 400, fontSize: 28, margin: 0, letterSpacing: '-0.02em' }}>Records</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, background: C.card, border: '1px solid ' + C.line, borderRadius: 13, padding: '11px 14px', marginTop: 12 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={C.mut} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search people & companies" style={{ border: 'none', outline: 'none', background: 'none', fontFamily: C.sans, fontSize: 15, color: C.text, width: '100%' }} />
        </div>
        <div style={{ display: 'flex', gap: 3, background: C.alt, borderRadius: 11, padding: 3, marginTop: 12 }}>{segBtn('all', 'All')}{segBtn('people', 'People')}{segBtn('companies', 'Companies')}</div>
      </div>
      <div style={{ padding: '10px 18px calc(80px + env(safe-area-inset-bottom, 0px))' }}>
        {items.slice(0, 150).map((x, i) => (
          <div key={x.key} onClick={() => nav(x.to)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 2px', borderTop: i === 0 ? 'none' : '1px solid ' + C.line2, cursor: 'pointer' }}>
            <div style={{ width: 38, height: 38, borderRadius: x.kind === 'company' ? 10 : '50%', background: C.alt, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 500, color: C.sub, flexShrink: 0 }}>{(x.name[0] || '?').toUpperCase()}</div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 500, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{x.name}</div>
              {x.sub && <div style={{ fontSize: 12.5, color: C.sub, marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{x.sub}</div>}
            </div>
            {x.status && <span style={{ flexShrink: 0, padding: '3px 9px', borderRadius: 18, background: C.alt, fontSize: 10.5, fontWeight: 500, color: C.sub, whiteSpace: 'nowrap' }}>{x.status}</span>}
          </div>
        ))}
        {items.length === 0 && <div style={{ textAlign: 'center', color: C.mut, fontSize: 14, padding: '40px 0' }}>No matches.</div>}
      </div>
    </div>
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


function greetingPart() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

function dateOverline() {
  const d = new Date()
  return d.toLocaleDateString('en-GB', { weekday: 'long' }).toUpperCase() + '  \u00b7  ' + d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' }).toUpperCase()
}

export function MobileToday({ userName = 'there' }) {
  const [deals, setDeals] = useState(null)
  const [msgs, setMsgs] = useState([])
  useEffect(() => {
    supabase.from('deals').select('id, data').or('data->>archived.is.null,data->>archived.neq.true').then(({ data }) => setDeals(data || []))
    supabase.from('kiko_team_messages').select('*').order('created_at', { ascending: false }).then(({ data }) => setMsgs(data || []))
  }, [])
  const hot = useMemo(() => (deals || [])
    .filter(d => { const st = d.data && d.data.stage; return st === 'Negotiation' || st === 'Proposal' })
    .sort((a, b) => Number((b.data && b.data.value) || 0) - Number((a.data && a.data.value) || 0))
    .slice(0, 5), [deals])
  const totals = useMemo(() => {
    const by = {}
    for (const d of hot) { const cur = (d.data && d.data.currency) || 'EUR'; by[cur] = (by[cur] || 0) + Number((d.data && d.data.value) || 0) }
    return by
  }, [hot])
  if (deals === null) return <Loading />
  const briefing = hot.length
    ? hot.length + ' deal' + (hot.length > 1 ? 's' : '') + ' need' + (hot.length > 1 ? '' : 's') + ' your attention  \u00b7  ' + fmtTotals(totals) + ' in play.'
    : 'Pipeline is quiet today.'
  const recent = (msgs || []).slice(0, 3)
  const pill = { display: 'inline-block', padding: '2px 8px', borderRadius: 16, background: C.alt, fontSize: 10.5, fontWeight: 500, color: C.sub, marginRight: 6 }
  return (
    <div style={{ position: 'absolute', inset: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', background: C.bg, fontFamily: C.sans, color: C.text }}>
      <div style={{ padding: '20px 18px calc(80px + env(safe-area-inset-bottom, 0px))' }}>
        <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.mut }}>{dateOverline()}</div>
        <h1 style={{ fontFamily: C.serif, fontWeight: 400, fontSize: 28, lineHeight: 1.1, letterSpacing: '-0.02em', margin: '5px 0 0' }}>{greetingPart()}, {userName}.</h1>
        <p style={{ fontSize: 14, lineHeight: 1.45, color: C.sub, margin: '8px 0 0' }}>{briefing}</p>

        {hot.length > 0 && (
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.mut, margin: '24px 2px 10px' }}>Needs attention</div>
            <div style={{ background: C.card, border: '1px solid ' + C.line, borderRadius: 15, overflow: 'hidden', boxShadow: C.shadow }}>
              {hot.map((d, i) => (
                <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '12px 14px', borderTop: i === 0 ? 'none' : '1px solid ' + C.line2 }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{(d.data && (d.data.name || d.data.title || d.data.company)) || 'Deal'}</div>
                    <div style={{ fontSize: 11.5, color: C.sub, marginTop: 3 }}><span style={pill}>{d.data && d.data.stage}</span>{(d.data && d.data.company) || ''}</div>
                  </div>
                  <div style={{ fontFamily: C.serif, fontWeight: 500, fontSize: 14, flexShrink: 0 }}>{fmtValue(d.data && d.data.value, d.data && d.data.currency)}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {recent.length > 0 && (
          <div>
            <div style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.mut, margin: '24px 2px 10px' }}>Recent updates</div>
            <div style={{ background: C.card, border: '1px solid ' + C.line, borderRadius: 15, overflow: 'hidden', boxShadow: C.shadow }}>
              {recent.map((m, i) => {
                const nm = m.from_name || 'Someone'
                const init = nm.split(' ').filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase()
                return (
                  <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '11px 14px', borderTop: i === 0 ? 'none' : '1px solid ' + C.line2 }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: C.alt, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 500, color: C.sub, flexShrink: 0 }}>{init}</div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{nm}</div>
                      <div style={{ fontSize: 12, color: C.sub, marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.content || ''}</div>
                    </div>
                    <span style={{ fontSize: 11, color: C.mut, flexShrink: 0 }}>{relTime(m.created_at)}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function relTime(ts) {
  if (!ts) return ''
  const d = new Date(ts), now = new Date()
  const diff = (now - d) / 1000
  if (diff < 60) return 'now'
  if (diff < 3600) return Math.floor(diff / 60) + 'm'
  if (diff < 86400 && d.getDate() === now.getDate()) return Math.floor(diff / 3600) + 'h'
  const y = new Date(now); y.setDate(now.getDate() - 1)
  if (d.getDate() === y.getDate() && d.getMonth() === y.getMonth()) return 'Yesterday'
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export function MobileMessenger() {
  const nav = useNavigate()
  const [channels, setChannels] = useState(null)
  const [msgs, setMsgs] = useState([])
  useEffect(() => {
    supabase.from('kiko_team_channels').select('*').order('last_message_at', { ascending: false }).then(({ data }) => setChannels(data || []))
    supabase.from('kiko_team_messages').select('*').order('created_at', { ascending: false }).then(({ data }) => setMsgs(data || []))
  }, [])
  const lastByCh = useMemo(() => {
    const m = {}
    for (const msg of (msgs || [])) { if (!m[msg.channel_id]) m[msg.channel_id] = msg }
    return m
  }, [msgs])
  if (!channels) return <Loading />
  const unread = channels.filter(ch => { const l = lastByCh[ch.id]; return l && (!l.read_by || l.read_by.length === 0) }).length
  return (
    <div style={{ position: 'absolute', inset: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', background: C.bg, fontFamily: C.sans, color: C.text }}>
      <div style={{ padding: 'calc(env(safe-area-inset-top, 0px) + 12px) 18px 6px' }}>
        <button onClick={() => nav('/')} aria-label="Back" style={{ width: 38, height: 38, marginLeft: -8, marginBottom: 4, borderRadius: '50%', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.sub }}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg></button>
        <h1 style={{ fontFamily: C.serif, fontWeight: 400, fontSize: 28, margin: 0, letterSpacing: '-0.02em' }}>Messenger</h1>
        <p style={{ color: C.sub, fontSize: 13, margin: '4px 0 0' }}>{unread > 0 ? unread + '  unread  \u00b7  ' : ''}your deal team</p>
      </div>
      <div style={{ padding: '8px 14px calc(80px + env(safe-area-inset-bottom, 0px))' }}>
        {channels.length === 0 && <div style={{ textAlign: 'center', color: C.mut, fontSize: 14, padding: '48px 0' }}>No conversations yet.</div>}
        {channels.map((ch, i) => {
          const last = lastByCh[ch.id]
          const name = ch.name || 'Channel'
          const init = name.replace(/[^A-Za-z0-9 ]/g, '').split(' ').filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase() || '#'
          const isUnread = last && (!last.read_by || last.read_by.length === 0)
          const preview = last ? ((last.from_name ? last.from_name.split(' ')[0] + ': ' : '') + (last.content || '')) : 'No messages yet'
          return (
            <div key={ch.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 4px', borderTop: i === 0 ? 'none' : '1px solid ' + C.line2 }}>
              <div style={{ width: 44, height: 44, borderRadius: '50%', background: C.alt, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 500, color: C.sub, flexShrink: 0 }}>{init}</div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontSize: 15, fontWeight: isUnread ? 600 : 450, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
                  <span style={{ fontSize: 11.5, color: C.mut, flexShrink: 0 }}>{last ? relTime(last.created_at) : ''}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 2 }}>
                  <span style={{ fontSize: 13, color: isUnread ? C.text : C.sub, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{preview}</span>
                  {isUnread && <span style={{ width: 8, height: 8, borderRadius: '50%', background: C.accent, flexShrink: 0 }} />}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}


const NUMW = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine']
function numWord(n) { return n < NUMW.length ? NUMW[n] : String(n) }
function cap(x) { return x.charAt(0).toUpperCase() + x.slice(1) }
function partOfDay() { const h = new Date().getHours(); return h < 12 ? 'this morning' : h < 18 ? 'this afternoon' : 'this evening' }

export function MobileHome({ userName = 'there' }) {
  const nav = useNavigate()
  const [text, setText] = useState('')
  const [unread, setUnread] = useState(0)
  useEffect(() => {
    supabase.from('kiko_team_messages').select('read_by').order('created_at', { ascending: false }).limit(60)
      .then(({ data }) => setUnread((data || []).filter(m => !m.read_by || m.read_by.length === 0).length))
  }, [])
  const go = (msg) => {
    const t = (msg != null ? msg : text).trim()
    nav('/chat', { state: t ? { initialMessage: t } : {} })
  }
  const ibtn = { width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', color: C.text, cursor: 'pointer', margin: '0 -8px', position: 'relative', WebkitTapHighlightColor: 'transparent' }
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', background: C.bg, fontFamily: C.sans, color: C.text }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'calc(env(safe-area-inset-top, 0px) + 14px) 18px 8px', flexShrink: 0 }}>
        <button onClick={() => nav('/chat', { state: { openHistory: true } })} style={ibtn} aria-label="Conversation history">
          <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 6h16M4 12h16M4 18h11"/></svg>
        </button>
        <button onClick={() => nav('/messages')} style={ibtn} aria-label="Messenger">
          <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.5 8.5 0 0 1-12.3 7.6L3.5 20.5l1.4-5.2A8.5 8.5 0 1 1 21 11.5z"/></svg>
          {unread > 0 && <span style={{ position: 'absolute', top: 7, right: 7, width: 8, height: 8, borderRadius: '50%', background: '#C8553D', border: '2px solid ' + C.bg }} />}
        </button>
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '0 22px', paddingBottom: 'calc(10vh + env(safe-area-inset-bottom, 0px))' }}>
        <div style={{ fontFamily: C.serif, fontWeight: 300, fontSize: 30, lineHeight: 1.2, letterSpacing: '-0.02em', textAlign: 'center', color: C.text }}>{greetingPart()}, {userName}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: C.card, border: '1px solid rgba(0,0,0,0.11)', borderRadius: 27, boxShadow: '0 1px 2px rgba(0,0,0,0.04)', padding: '7px 7px 7px 15px', marginTop: 22 }}>
          <span style={{ color: C.mut, display: 'flex', flexShrink: 0 }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg></span>
          <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); go() } }} placeholder="Ask Kiko anything" enterKeyHint="send" style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'none', fontFamily: C.sans, fontSize: 16, color: C.text }} />
          <span onClick={() => nav('/voice')} style={{ color: C.sub, display: 'flex', flexShrink: 0, cursor: 'pointer' }} aria-label="Voice"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="2" width="6" height="11" rx="3"/><path d="M5 10a7 7 0 0 0 14 0M12 17v4"/></svg></span>
          <button onClick={() => go()} aria-label="Send" style={{ width: 36, height: 36, borderRadius: '50%', background: C.accent, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: 'none', cursor: 'pointer' }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg></button>
        </div>
      </div>
    </div>
  )
}
