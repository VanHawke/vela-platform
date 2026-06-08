// src/pages/CompanyDetail.jsx — Redesign v2: Rich company detail with intelligence
import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { ArrowLeft, ExternalLink, TrendingUp, DollarSign, Shield, Flag, Users, AlertTriangle, Building2 } from 'lucide-react'

export default function CompanyDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const [company, setCompany] = useState(null)
  const [contacts, setContacts] = useState([])
  const [deals, setDeals] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { load() }, [id])

  const load = async () => {
    setLoading(true)
    const { data } = await supabase.from('companies').select('id, data').eq('id', id).single()
    if (data) {
      setCompany({ id: data.id, ...data.data })
      // Load contacts at this company
      const companyName = data.data?.name
      if (companyName) {
        const { data: contactRows } = await supabase.from('contacts').select('id, data')
          .or(`data->>company.eq.${companyName},data->>companyName.eq.${companyName}`)
          .limit(20)
        setContacts((contactRows || []).map(c => ({ id: c.id, ...c.data })))
        // Load deals
        const { data: dealRows } = await supabase.from('deals').select('data')
          .filter('data->>company', 'eq', companyName).limit(10)
        setDeals((dealRows || []).map(d => d.data))
      }
    }
    setLoading(false)
  }

  const fmtCurrency = (n) => { if (!n) return '—'; const num = typeof n === 'string' ? parseFloat(n.replace(/[^0-9.]/g, '')) : n; if (isNaN(num)) return n; if (num >= 1e9) return `$${(num/1e9).toFixed(1)}bn`; if (num >= 1e6) return `$${(num/1e6).toFixed(0)}m`; if (num >= 1e3) return `$${(num/1e3).toFixed(0)}k`; return `$${num}` }
  const font = "'Source Serif 4', Georgia, serif"
  const sh = { fontFamily: font, fontWeight: 300, fontSize: 16, letterSpacing: '-0.01em', margin: '0 0 10px', color: '#0A0A0A' }
  const card = { background: '#fff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 14, padding: '2px 0', marginBottom: 16 }
  const field = { display: 'flex', justifyContent: 'space-between', padding: '7px 14px', borderBottom: '1px solid rgba(0,0,0,0.04)' }
  const fl = { fontSize: 11, color: '#A0A0A0' }
  const fv = { fontSize: 12, fontWeight: 450 }
  const sig = { display: 'flex', alignItems: 'flex-start', gap: 8, padding: '8px 14px', borderBottom: '1px solid rgba(0,0,0,0.04)' }
  const sigIcon = (bg, color) => ({ width: 24, height: 24, borderRadius: 6, display: 'grid', placeItems: 'center', flexShrink: 0, background: bg })
  const cc = { padding: '10px 14px', background: '#fff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 14, marginBottom: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }

  if (loading) return <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}><div style={{ color: '#A0A0A0', fontSize: 13 }}>Loading…</div></div>
  if (!company) return <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}><p style={{ fontSize: 13, color: '#A0A0A0' }}>Company not found</p><button onClick={() => nav('/records?view=companies')} style={{ fontSize: 12, color: '#0A0A0A', background: 'none', border: 'none', cursor: 'pointer', marginTop: 8 }}>Back to Records</button></div>

  const c = company
  const subtitle = [c.industry || c.sector, c.country, c.website || c.domain].filter(Boolean).join(' · ')

  return (
    <div style={{ fontFamily: "'Inter', system-ui, sans-serif", color: '#0A0A0A', background: '#FEFEFC', minHeight: 'calc(100vh - 56px)' }}>
      {/* Header */}
      <div style={{ padding: '16px 44px', borderBottom: '1px solid rgba(0,0,0,0.08)', display: 'flex', alignItems: 'center', gap: 12, background: '#fff' }}>
        <button onClick={() => nav('/records?view=companies')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex' }}>
          <ArrowLeft size={18} stroke="#6B6B6B" />
        </button>
        <div>
          <h1 style={{ fontFamily: font, fontWeight: 300, fontSize: 22, letterSpacing: '-0.015em', margin: 0 }}>{c.name}</h1>
          <div style={{ fontSize: 12, color: '#6B6B6B', marginTop: 2 }}>{subtitle}</div>
        </div>
      </div>

      <div style={{ padding: '20px 44px', maxWidth: 720 }}>
        {/* Company information */}
        <h2 style={sh}>Company information</h2>
        <div style={card}>
          <div style={field}><span style={fl}>Industry</span><span style={fv}>{c.industry || c.sector || '—'}</span></div>
          <div style={field}><span style={fl}>Size</span><span style={fv}>{c.employees || c.size || '—'}</span></div>
          <div style={field}><span style={fl}>Founded</span><span style={fv}>{c.founded || '—'}</span></div>
          <div style={field}><span style={fl}>Location</span><span style={fv}>{c.country || c.address || '—'}</span></div>
          <div style={field}><span style={fl}>Website</span><span style={fv}>{c.website || c.domain ? <a href={`https://${(c.website || c.domain).replace(/^https?:\/\//, '')}`} target="_blank" rel="noopener noreferrer" style={{ color: '#0077B5', textDecoration: 'none', fontSize: 12 }}>{c.website || c.domain}</a> : '—'}</span></div>
          <div style={{ ...field, borderBottom: 'none' }}><span style={fl}>Revenue</span><span style={fv}>{c.revenueEst || '—'}</span></div>
        </div>

        {/* Funding */}
        {(c.totalFunding || c.lastRound || c.valuation) && (<>
          <h2 style={sh}>Funding</h2>
          <div style={card}>
            {c.totalFunding && <div style={field}><span style={fl}>Total funding</span><span style={fv}>{c.totalFunding}</span></div>}
            {c.lastRound && <div style={field}><span style={fl}>Last round</span><span style={fv}>{c.lastRound}</span></div>}
            {c.valuation && <div style={{ ...field, borderBottom: 'none' }}><span style={fl}>Valuation</span><span style={fv}>{c.valuation}</span></div>}
          </div>
        </>)}

        {/* Sponsorship & partnerships */}
        <h2 style={sh}>Sponsorship & partnerships</h2>
        <div style={{ ...card, padding: '4px 0' }}>
          {deals.length > 0 ? deals.map((d, i) => (
            <div key={i} style={sig}>
              <div style={sigIcon('rgba(0,119,181,0.08)')}><Flag size={12} color="#0077B5" /></div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 500 }}>{d.name || d.company} — {fmtCurrency(d.value)}</div>
                <div style={{ fontSize: 11, color: '#6B6B6B', marginTop: 1 }}>{d.stage || 'Pipeline'} · {d.pipeline || 'Haas F1 2026'}</div>
              </div>
            </div>
          )) : (
            <div style={sig}>
              <div style={sigIcon('rgba(0,119,181,0.08)')}><Flag size={12} color="#0077B5" /></div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 500 }}>No current F1/FE sponsorships on record</div>
                <div style={{ fontSize: 11, color: '#6B6B6B', marginTop: 1 }}>Check pipeline for active conversations</div>
              </div>
            </div>
          )}
        </div>

        {/* Key signals */}
        <h2 style={sh}>Key signals</h2>
        <div style={{ ...card, padding: '4px 0' }}>
          {c.lastActivity && (
            <div style={sig}>
              <div style={sigIcon('rgba(125,138,100,0.10)')}><TrendingUp size={12} color="#7d8a64" /></div>
              <div><div style={{ fontSize: 12, fontWeight: 500 }}>Last activity: {new Date(c.lastActivity).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</div></div>
            </div>
          )}
          {c.employees && (
            <div style={sig}>
              <div style={sigIcon('rgba(125,138,100,0.10)')}><Users size={12} color="#7d8a64" /></div>
              <div><div style={{ fontSize: 12, fontWeight: 500 }}>Headcount: {c.employees}</div><div style={{ fontSize: 11, color: '#6B6B6B', marginTop: 1 }}>{c.industry || ''}</div></div>
            </div>
          )}
          {c.notes && (
            <div style={{ ...sig, borderBottom: 'none' }}>
              <div style={sigIcon('rgba(184,156,92,0.12)')}><AlertTriangle size={12} color="#B89C5C" /></div>
              <div><div style={{ fontSize: 12, fontWeight: 500 }}>Notes</div><div style={{ fontSize: 11, color: '#6B6B6B', marginTop: 1, lineHeight: 1.5 }}>{typeof c.notes === 'string' ? c.notes.slice(0, 200) : ''}</div></div>
            </div>
          )}
          {!c.lastActivity && !c.employees && !c.notes && (
            <div style={{ padding: '14px', color: '#A0A0A0', fontSize: 12, textAlign: 'center' }}>No signals available yet</div>
          )}
        </div>

        {/* Competitors */}
        {c.competitors && Array.isArray(c.competitors) && c.competitors.length > 0 && (
          <>
            <h2 style={sh}>Competitors</h2>
            <div style={{ ...card, padding: '4px 0' }}>
              {c.competitors.map((comp, i) => {
                const name = typeof comp === 'string' ? comp : comp.name || '—'
                const reason = typeof comp === 'object' ? comp.reason : null
                const threat = typeof comp === 'object' ? comp.threat : null
                return (
                  <div key={i} style={sig}>
                    <div style={sigIcon(threat === 'direct' ? 'rgba(184,100,62,0.10)' : 'rgba(0,0,0,0.04)')}>
                      <Building2 size={12} color={threat === 'direct' ? '#b8643e' : '#6B6B6B'} />
                    </div>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 500 }}>{name}{threat ? <span style={{ fontSize: 10, color: threat === 'direct' ? '#b8643e' : '#6B6B6B', marginLeft: 6 }}>({threat})</span> : null}</div>
                      {reason && <div style={{ fontSize: 11, color: '#6B6B6B', marginTop: 1 }}>{reason}</div>}
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}

        {/* Contacts at company */}
        {contacts.length > 0 && (<>
          <h2 style={sh}>Contacts at {c.name}</h2>
          {contacts.map(ct => (
            <div key={ct.id} onClick={() => nav(`/contacts/${ct.id}`)} style={cc}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.14)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.05)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(0,0,0,0.08)'; e.currentTarget.style.boxShadow = 'none' }}>
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 500 }}>{ct.name || [ct.firstName, ct.lastName].filter(Boolean).join(' ') || '—'}</div>
                <div style={{ fontSize: 11, color: '#6B6B6B' }}>{ct.title || '—'}</div>
              </div>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#A0A0A0" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
            </div>
          ))}
        </>)}

        {/* Active deals */}
        {deals.length > 0 && (<>
          <h2 style={{ ...sh, marginTop: 16 }}>Active deals</h2>
          {deals.map((d, i) => (
            <div key={i} style={cc}>
              <div>
                <div style={{ fontSize: 12.5, fontWeight: 500 }}>{d.name || d.company} — {fmtCurrency(d.value)}</div>
                <div style={{ fontSize: 11, color: '#6B6B6B' }}>{d.stage} · {d.pipeline || '—'} · {d.probability || 0}%</div>
              </div>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#A0A0A0" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>
            </div>
          ))}
        </>)}
      </div>
    </div>
  )
}
