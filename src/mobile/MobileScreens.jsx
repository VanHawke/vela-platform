import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
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
  const [q, setQ] = useState('')
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
      const co = d.data && d.data.company
      const cn = d.data && d.data.contactName
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
      return { key: 'c' + c.id, kind: 'company', name, sub: [desc, emp].filter(Boolean).join('  \u00b7  '), status: dealStage.byCo[name] || ((c.data && Number(c.data.openDeals) > 0) ? 'Active deal' : null), to: '/records/company/' + c.id }
    })
    let all = people.concat(orgs)
    const ql = q.trim().toLowerCase()
    if (ql) all = all.filter(x => (x.name + ' ' + x.sub).toLowerCase().includes(ql))
    return all
  }, [contacts, companies, q, dealStage])
  if (contacts === null || companies === null) return <Loading />
  return (
    <div style={{ position: 'absolute', inset: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', background: C.bg, fontFamily: C.sans, color: C.text }}>
      <div style={{ padding: '20px 18px 6px' }}>
        <h1 style={{ fontFamily: C.serif, fontWeight: 400, fontSize: 28, margin: 0, letterSpacing: '-0.01em' }}>Records</h1>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search people & companies" style={{ width: '100%', marginTop: 12, boxSizing: 'border-box', border: '1px solid ' + C.line, background: C.card, borderRadius: 12, padding: '11px 14px', fontSize: 14, fontFamily: C.sans, color: C.text, outline: 'none' }} />
      </div>
      <div style={{ padding: '8px 18px calc(80px + env(safe-area-inset-bottom, 0px))' }}>
        <div style={{ fontSize: 11, fontWeight: 500, color: C.sub, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '2px 2px 11px' }}>{q ? items.length + ' results' : 'People & companies'}</div>
        {items.slice(0, 120).map(x => {
          const init = (x.name[0] || '?').toUpperCase()
          return (
            <div key={x.key} onClick={() => nav(x.to)} style={{ display: 'flex', alignItems: 'center', gap: 12, background: C.card, border: '1px solid ' + C.line, borderRadius: 14, padding: '11px 13px', marginBottom: 8, boxShadow: C.shadow }}>
              <div style={{ width: 36, height: 36, borderRadius: x.kind === 'company' ? 9 : '50%', background: C.alt, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 500, color: C.sub, flexShrink: 0 }}>{init}</div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 450, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{x.name}</div>
                {x.sub && <div style={{ fontSize: 13, color: C.sub, fontWeight: 300, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{x.sub}</div>}
              </div>
              {x.status && <span style={{ flexShrink: 0, padding: '3px 9px', borderRadius: 20, background: C.alt, fontSize: 11, fontWeight: 400, color: C.sub, whiteSpace: 'nowrap' }}>{x.status}</span>}
            </div>
          )
        })}
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

export function MobileToday({ userName = 'there' }) {
  const nav = useNavigate()
  const ctx = useOutletContext() || {}
  const [input, setInput] = useState('')
  const [deals, setDeals] = useState(null)
  useEffect(() => {
    supabase.from('deals').select('id, data, updated_at')
      .or('data->>archived.is.null,data->>archived.neq.true')
      .order('updated_at', { ascending: false })
      .then(({ data }) => setDeals(data || []))
  }, [])
  const attention = useMemo(() => {
    if (!deals) return []
    const late = ['Negotiation', 'Proposal', 'negotiation', 'proposal']
    return deals
      .filter(d => late.includes(d.data && d.data.stage))
      .sort((a, b) => (Number(b.data && b.data.value) || 0) - (Number(a.data && a.data.value) || 0))
      .slice(0, 5)
  }, [deals])
  const totalAttn = fmtTotals(sumByCurrency(attention))
  const send = (msg) => {
    const t = (msg || input).trim()
    if (!t) return
    try { ctx.setKikoMessages && ctx.setKikoMessages([]); ctx.setKikoConvId && ctx.setKikoConvId(null); ctx.setKikoResetKey && ctx.setKikoResetKey(k => k + 1) } catch (e) {}
    nav('/', { state: { initialMessage: t } })
  }
  const dateStr = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase()
  const chips = ['Brief me on today', 'Pipeline update', 'Check my email']
  return (
    <div style={{ position: 'absolute', inset: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', background: C.bg, fontFamily: C.sans, color: C.text }}>
      <div style={{ padding: '22px 20px calc(84px + env(safe-area-inset-bottom, 0px))' }}>
        <div style={{ fontSize: 11, fontWeight: 500, color: C.mut, letterSpacing: '0.08em', marginBottom: 8 }}>{dateStr}</div>
        <h1 style={{ fontFamily: C.serif, fontWeight: 400, fontSize: 30, lineHeight: 1.12, margin: 0, letterSpacing: '-0.015em' }}>{greetingPart()}, {userName}.</h1>
        <p style={{ color: C.sub, fontSize: 14, fontWeight: 300, margin: '8px 0 0', lineHeight: 1.4 }}>
          {!deals ? '\u2026' : attention.length > 0 ? (attention.length + (attention.length === 1 ? ' deal needs' : ' deals need') + ' your attention' + (totalAttn ? '  \u00b7  ' + totalAttn + ' in play' : '') + '.') : 'Pipeline is quiet right now. Ask me anything.'}
        </p>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 18, background: C.card, border: '1px solid ' + C.line, borderRadius: 26, padding: '7px 7px 7px 18px', boxShadow: C.shadow }}>
          <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') send() }} placeholder="Ask Kiko anything…" style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 15, fontFamily: C.sans, color: C.text, minWidth: 0 }} />
          <button onClick={() => send()} aria-label="Send" style={{ width: 38, height: 38, borderRadius: '50%', background: C.accent, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          </button>
        </div>

        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', marginTop: 12, paddingBottom: 2 }}>
          {chips.map(c => (
            <button key={c} onClick={() => send(c)} style={{ flexShrink: 0, border: '1px solid ' + C.line, background: C.card, cursor: 'pointer', borderRadius: 24, padding: '8px 14px', fontSize: 13, fontFamily: C.sans, fontWeight: 400, color: C.text, whiteSpace: 'nowrap' }}>{c}</button>
          ))}
        </div>

        {attention.length > 0 && (
          <div style={{ marginTop: 30 }}>
            <div style={{ fontSize: 11, fontWeight: 500, color: C.sub, textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 2px 11px' }}>Needs your attention</div>
            {attention.map(d => {
              const val = fmtValue(d.data && d.data.value, d.data && d.data.currency)
              return (
                <div key={d.id} onClick={() => nav('/pipeline')} style={{ background: C.card, border: '1px solid ' + C.line, borderRadius: 14, padding: '13px 14px', marginBottom: 8, boxShadow: C.shadow }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 450, color: C.text, lineHeight: 1.25 }}>{(d.data && (d.data.title || d.data.company)) || 'Untitled deal'}</div>
                      <div style={{ fontSize: 13, color: C.sub, fontWeight: 300, marginTop: 5, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ padding: '2px 8px', borderRadius: 20, background: C.alt, fontSize: 11, color: C.sub }}>{d.data && d.data.stage}</span>
                        {d.data && d.data.company ? <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.data.company}</span> : null}
                      </div>
                    </div>
                    {val && <span style={{ fontSize: 14, fontWeight: 500, color: C.text, whiteSpace: 'nowrap' }}>{val}</span>}
                  </div>
                </div>
              )
            })}
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
      <div style={{ padding: '20px 18px 10px' }}>
        <h1 style={{ fontFamily: C.serif, fontWeight: 400, fontSize: 28, margin: 0, letterSpacing: '-0.01em' }}>Messenger</h1>
        <p style={{ color: C.sub, fontSize: 13, fontWeight: 300, margin: '3px 0 0' }}>{unread > 0 ? unread + '  unread  \u00b7  ' : ''}your deal team</p>
      </div>
      <div style={{ padding: '0 10px calc(80px + env(safe-area-inset-bottom, 0px))' }}>
        {channels.length === 0 && <div style={{ textAlign: 'center', color: C.mut, fontSize: 14, padding: '48px 0' }}>No conversations yet.</div>}
        {channels.map(ch => {
          const last = lastByCh[ch.id]
          const name = ch.name || 'Channel'
          const init = name.replace(/[^A-Za-z0-9 ]/g, '').split(' ').filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase() || '#'
          const isUnread = last && (!last.read_by || last.read_by.length === 0)
          const preview = last ? ((last.from_name ? last.from_name.split(' ')[0] + ': ' : '') + (last.content || '')) : 'No messages yet'
          return (
            <div key={ch.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 12px', borderRadius: 14, marginBottom: 2 }}>
              <div style={{ width: 44, height: 44, borderRadius: '50%', background: C.alt, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 500, color: C.sub, flexShrink: 0 }}>{init}</div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                  <span style={{ fontSize: 15, fontWeight: isUnread ? 600 : 450, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
                  <span style={{ fontSize: 12, color: C.mut, flexShrink: 0 }}>{last ? relTime(last.created_at) : ''}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginTop: 2 }}>
                  <span style={{ fontSize: 13, color: isUnread ? C.text : C.sub, fontWeight: 300, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{preview}</span>
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
