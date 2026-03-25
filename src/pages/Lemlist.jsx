import { useState, useEffect } from 'react'
import { setPageContext } from '@/lib/pageContext'
import { Mail, MousePointer, Reply, AlertTriangle, Clock, ChevronRight, RefreshCw } from 'lucide-react'
import T from '@/lib/theme'

export default function Lemlist({ user }) {
  const [campaigns, setCampaigns] = useState([])
  const [activities, setActivities] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedCampaign, setSelectedCampaign] = useState(null)
  const [actLoading, setActLoading] = useState(false)

  useEffect(() => { loadCampaigns() }, [])

  const loadCampaigns = async () => {
    setLoading(true)
    try {
      const [cRes, aRes] = await Promise.all([
        fetch('/api/lemlist-data?action=campaigns'),
        fetch('/api/lemlist-data?action=activities'),
      ])
      const c = await cRes.json()
      const a = await aRes.json()
      setCampaigns(Array.isArray(c) ? c : [])
      setActivities(Array.isArray(a) ? a : [])
      const topCampaigns = Array.isArray(c) ? c.slice(0, 8).map(x => `${x.name} (${x.status || 'draft'})`).join(', ') : ''
      const topActivities = Array.isArray(a) ? a.slice(0, 5).map(x => `${x.leadFirstName || ''} ${x.leadLastName || ''} · ${x.type || '?'}`).join(', ') : ''
      setPageContext({ page: 'lemlist', summary: `Lemlist: ${Array.isArray(c) ? c.length : 0} campaigns, ${Array.isArray(a) ? a.length : 0} recent events`, visibleItems: `Campaigns: ${topCampaigns}. Activity: ${topActivities}` })
    } catch (e) { console.error('[Lemlist]', e) }
    finally { setLoading(false) }
  }

  const selectCampaign = async (c) => {
    setSelectedCampaign(c)
    setActLoading(true)
    try {
      const res = await fetch(`/api/lemlist-data?action=activities&campaign_id=${c._id}`)
      const data = await res.json()
      setActivities(Array.isArray(data) ? data : [])
    } catch (e) { console.error(e) }
    finally { setActLoading(false) }
  }

  const typeIcon = (type) => {
    if (type?.includes('opened') || type?.includes('emailsOpened')) return <MousePointer size={12} style={{ color: 'rgba(139,108,246,0.5)' }} />
    if (type?.includes('clicked')) return <MousePointer size={12} style={{ color: 'rgba(0,212,170,0.5)' }} />
    if (type?.includes('replied')) return <Reply size={12} style={{ color: 'rgba(6,214,160,0.6)' }} />
    if (type?.includes('bounced')) return <AlertTriangle size={12} style={{ color: 'rgba(255,59,48,0.5)' }} />
    if (type?.includes('sent') || type?.includes('emailsSent')) return <Mail size={12} style={{ color: 'rgba(255,255,255,0.3)' }} />
    return <Mail size={12} style={{ color: 'rgba(255,255,255,0.2)' }} />
  }

  const typeColor = (type) => {
    if (type?.includes('replied')) return 'rgba(6,214,160,0.12)'
    if (type?.includes('opened')) return 'rgba(139,108,246,0.06)'
    if (type?.includes('bounced')) return 'rgba(255,59,48,0.06)'
    return 'transparent'
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: T.textTertiary, fontFamily: T.font, fontWeight: 300 }}>Loading Lemlist...</div>

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 56px)', fontFamily: T.font }}>
      {/* LEFT — Campaigns */}
      <div style={{ width: 300, borderRight: '1px solid rgba(255,255,255,0.04)', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
        <div style={{ padding: '16px 16px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ fontSize: 19, fontWeight: 400, color: T.text, margin: 0 }}>Lemlist</h1>
            <p style={{ fontSize: 12, color: T.textTertiary, fontWeight: 300, marginTop: 2 }}>{campaigns.length} campaigns</p>
          </div>
          <button onClick={loadCampaigns} style={{ width: 28, height: 28, borderRadius: 50, border: 'none', background: 'rgba(255,255,255,0.04)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.textTertiary }}>
            <RefreshCw size={12} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px 8px' }}>
          {/* All campaigns button */}
          <div onClick={() => { setSelectedCampaign(null); fetch('/api/lemlist-data?action=activities').then(r => r.json()).then(a => setActivities(Array.isArray(a) ? a : [])) }}
            style={{
              padding: '10px 12px', borderRadius: 10, marginBottom: 4, cursor: 'pointer', transition: 'all 0.15s',
              background: !selectedCampaign ? 'rgba(139,108,246,0.06)' : 'transparent',
              border: `1px solid ${!selectedCampaign ? 'rgba(139,108,246,0.15)' : 'transparent'}`,
            }}>
            <div style={{ fontSize: 13, fontWeight: 400, color: !selectedCampaign ? 'rgba(139,108,246,0.8)' : 'rgba(255,255,255,0.5)' }}>All campaigns</div>
          </div>

          {campaigns.map(c => {
            const isActive = selectedCampaign?._id === c._id
            return (
              <div key={c._id} onClick={() => selectCampaign(c)} style={{
                padding: '10px 12px', borderRadius: 10, marginBottom: 4, cursor: 'pointer', transition: 'all 0.15s',
                background: isActive ? 'rgba(139,108,246,0.06)' : 'rgba(255,255,255,0.02)',
                border: `1px solid ${isActive ? 'rgba(139,108,246,0.15)' : 'rgba(255,255,255,0.03)'}`,
              }}
                onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
                onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.02)' }}
              >
                <div style={{ fontSize: 13, fontWeight: 400, color: isActive ? 'rgba(139,108,246,0.8)' : 'rgba(255,255,255,0.6)', marginBottom: 2 }}>{c.name}</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 8, background: c.status === 'active' || c.status === 'running' ? 'rgba(6,214,160,0.08)' : 'rgba(255,255,255,0.04)', color: c.status === 'active' || c.status === 'running' ? 'rgba(6,214,160,0.5)' : T.textTertiary, fontWeight: 500 }}>{c.status || 'draft'}</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* RIGHT — Activity Feed */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px 10px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
          <h2 style={{ fontSize: 16, fontWeight: 400, color: T.text, margin: 0 }}>
            {selectedCampaign ? selectedCampaign.name : 'Recent Activity'}
          </h2>
          <p style={{ fontSize: 12, color: T.textTertiary, fontWeight: 300, marginTop: 2 }}>
            {actLoading ? 'Loading...' : `${activities.length} events`}
          </p>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 20px 20px' }}>
          {activities.length === 0 && !actLoading && (
            <div style={{ textAlign: 'center', padding: 40, color: T.textTertiary, fontWeight: 300, fontSize: 14 }}>No activities yet.</div>
          )}

          {activities.map((a, i) => (
            <div key={a._id || i} style={{
              padding: '10px 12px', borderRadius: 10, marginBottom: 4,
              background: typeColor(a.type), border: '1px solid rgba(255,255,255,0.03)',
              display: 'flex', gap: 10, alignItems: 'flex-start', transition: 'all 0.15s',
            }}>
              <div style={{ marginTop: 2, flexShrink: 0 }}>{typeIcon(a.type)}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', fontWeight: 400, marginBottom: 2 }}>
                  {a.leadFirstName || ''} {a.leadLastName || ''}{a.leadCompanyName ? ` · ${a.leadCompanyName}` : ''}
                </div>
                <div style={{ fontSize: 11, color: T.textTertiary, fontWeight: 300 }}>
                  {a.type?.replace(/([A-Z])/g, ' $1').trim() || 'Unknown'}{a.campaignName ? ` — ${a.campaignName}` : ''}
                </div>
              </div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.15)', fontWeight: 300, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 3 }}>
                <Clock size={8} />
                {a.createdAt ? new Date(a.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : ''}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
