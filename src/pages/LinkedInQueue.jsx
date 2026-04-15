// src/pages/LinkedInQueue.jsx
// Manual LinkedIn action queue. The cron writes here when a sequence has a LinkedIn step.
import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { setPageContext } from '@/lib/pageContext'
import T from '@/lib/theme'
import PageHeader from '@/components/layout/PageHeader'
import { Linkedin, ExternalLink, Check, Copy, RefreshCw, Search } from 'lucide-react'

function timeAgo(d) {
  if (!d) return ''
  const diff = Math.floor((Date.now() - new Date(d)) / 1000)
  if (diff < 60) return 'now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

export default function LinkedInQueue() {
  const nav = useNavigate()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('pending')
  const [search, setSearch] = useState('')
  const [copiedId, setCopiedId] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data: queue } = await supabase.from('kiko_linkedin_queue').select('*').order('created_at', { ascending: false }).limit(200)
    const enrollIds = [...new Set((queue || []).map(q => q.enrollment_id).filter(Boolean))]
    let enrolls = []
    if (enrollIds.length > 0) {
      const { data } = await supabase.from('kiko_sequence_enrollments').select('id, linkedin_url, title, contact_email, sequence_id').in('id', enrollIds)
      enrolls = data || []
    }
    const enriched = (queue || []).map(q => {
      const enr = enrolls.find(e => e.id === q.enrollment_id)
      return { ...q, linkedin_url: enr?.linkedin_url || null, title: enr?.title || '', contact_email: enr?.contact_email || '', sequence_id: enr?.sequence_id || null }
    })
    setItems(enriched)
    setLoading(false)
    setPageContext({ page: 'linkedin', summary: 'LinkedIn queue: ' + enriched.filter(i => i.status === 'pending').length + ' pending' })
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const ch = supabase.channel('linkedin_queue').on('postgres_changes', { event: '*', schema: 'public', table: 'kiko_linkedin_queue' }, () => load()).subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [load])

  async function markSent(item) {
    await supabase.from('kiko_linkedin_queue').update({ status: 'sent', actioned_at: new Date().toISOString() }).eq('id', item.id)
    if (item.enrollment_id) {
      const { data: enr } = await supabase.from('kiko_sequence_enrollments').select('current_step, sequence_id').eq('id', item.enrollment_id).single()
      if (enr) {
        const { data: seq } = await supabase.from('kiko_sequences').select('steps').eq('id', enr.sequence_id).single()
        const allSteps = seq?.steps || []
        const nextStep = allSteps.find(s => s.step === (enr.current_step + 1))
        await supabase.from('kiko_sequence_enrollments').update({
          current_step: enr.current_step + 1,
          next_send_at: nextStep ? new Date(Date.now() + (nextStep.delay_days || 3) * 86400000).toISOString() : null,
          status: nextStep ? 'active' : 'completed',
          completed_at: nextStep ? null : new Date().toISOString(),
        }).eq('id', item.enrollment_id)
      }
    }
    load()
  }

  async function skipItem(item) {
    if (!confirm('Skip this LinkedIn action for ' + item.contact_name + '? They will move to the next step without one being sent.')) return
    await supabase.from('kiko_linkedin_queue').update({ status: 'skipped', actioned_at: new Date().toISOString() }).eq('id', item.id)
    load()
  }

  function copyMessage(item) {
    navigator.clipboard.writeText(item.message || '')
    setCopiedId(item.id)
    setTimeout(() => setCopiedId(null), 1500)
  }

  const filtered = items.filter(i => {
    if (filter !== 'all' && i.status !== filter) return false
    if (search) {
      const q = search.toLowerCase()
      return i.contact_name?.toLowerCase().includes(q) || i.company?.toLowerCase().includes(q) || i.message?.toLowerCase().includes(q)
    }
    return true
  })

  const counts = {
    pending: items.filter(i => i.status === 'pending').length,
    sent: items.filter(i => i.status === 'sent').length,
    skipped: items.filter(i => i.status === 'skipped').length,
    all: items.length,
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <PageHeader
        eyebrowCategory="OUTREACH"
        eyebrowSuffix="LinkedIn queue"
        title="LinkedIn"
        subtitle="Manual LinkedIn actions queued from your campaigns. Send each message yourself in LinkedIn, then mark sent."
      />
      <div style={{ padding: '8px 32px 24px', fontFamily: T.font, color: T.text, maxWidth: 1200, margin: '0 auto', overflowY: 'auto' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end', marginBottom: 20 }}>
          <button onClick={load} style={{ padding: '8px 14px', borderRadius: 6, border: '1px solid rgba(0,0,0,0.10)', background: 'transparent', color: T.text, fontSize: 12, cursor: 'pointer', fontFamily: T.font, display: 'flex', alignItems: 'center', gap: 6 }}>
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 360 }}>
          <Search size={12} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: T.textTertiary }} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, company, or message..." style={{ width: '100%', padding: '8px 10px 8px 30px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.10)', background: 'rgba(0,0,0,0.20)', color: T.text, fontSize: 12, fontFamily: T.font, outline: 'none' }} />
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {[['pending', 'Pending', counts.pending], ['sent', 'Sent', counts.sent], ['skipped', 'Skipped', counts.skipped], ['all', 'All', counts.all]].map(([id, label, count]) => (
            <button key={id} onClick={() => setFilter(id)} style={{
              padding: '7px 14px', borderRadius: 6, border: '1px solid ' + (filter === id ? 'rgba(0,0,0,0.10)' : 'transparent'),
              background: filter === id ? 'rgba(0,0,0,0.06)' : 'transparent',
              color: filter === id ? '#0A0A0A' : T.textSecondary, fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: T.font,
            }}>{label} <span style={{ fontSize: 10, opacity: 0.7, marginLeft: 4 }}>{count}</span></button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 60, textAlign: 'center', fontSize: 13, color: T.textTertiary }}>Loading...</div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: 80, textAlign: 'center' }}>
          <Linkedin size={32} style={{ color: 'rgba(0,119,181,0.3)', marginBottom: 12 }} />
          <div style={{ fontSize: 14, color: T.textSecondary, marginBottom: 6 }}>No {filter !== 'all' ? filter : ''} LinkedIn actions</div>
          <div style={{ fontSize: 11, color: T.textTertiary }}>When a campaign with LinkedIn steps fires, the actions appear here for you to send manually.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map(item => (
            <div key={item.id} style={{ padding: '16px 18px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 500, color: T.text }}>{item.contact_name || 'Unknown'}</div>
                  <div style={{ fontSize: 11, color: T.textTertiary, marginTop: 2 }}>{item.title}{item.title && item.company && ' · '}{item.company}</div>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span style={{ fontSize: 10, color: T.textTertiary }}>{timeAgo(item.created_at)}</span>
                  {item.status === 'pending' && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: 'rgba(251,191,36,0.10)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.25)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 500 }}>Pending</span>}
                  {item.status === 'sent' && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: 'rgba(0,0,0,0.06)', color: '#0A0A0A', border: '1px solid rgba(0,0,0,0.10)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 500 }}>Sent</span>}
                  {item.status === 'skipped' && <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, background: 'rgba(148,163,184,0.10)', color: '#94a3b8', border: '1px solid rgba(148,163,184,0.25)', textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 500 }}>Skipped</span>}
                </div>
              </div>
              <div style={{ padding: '12px 14px', borderRadius: 6, background: 'rgba(0,0,0,0.20)', border: '1px solid rgba(255,255,255,0.04)', fontSize: 12, color: T.textSecondary, lineHeight: 1.6, marginBottom: 12, whiteSpace: 'pre-wrap' }}>
                {item.message || <em style={{ color: T.textTertiary }}>(no message)</em>}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {item.linkedin_url && (
                  <a href={item.linkedin_url} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 14px', borderRadius: 6, border: '1px solid rgba(0,119,181,0.30)', background: 'rgba(0,119,181,0.08)', color: '#5fa8d3', fontSize: 11, fontWeight: 500, cursor: 'pointer', fontFamily: T.font, textDecoration: 'none' }}>
                    <ExternalLink size={11} /> Open LinkedIn profile
                  </a>
                )}
                <button onClick={() => copyMessage(item)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 14px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.10)', background: 'transparent', color: T.text, fontSize: 11, cursor: 'pointer', fontFamily: T.font }}>
                  <Copy size={11} /> {copiedId === item.id ? 'Copied' : 'Copy message'}
                </button>
                {item.status === 'pending' && (
                  <>
                    <button onClick={() => markSent(item)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 14px', borderRadius: 6, border: '1px solid rgba(0,0,0,0.10)', background: 'rgba(0,0,0,0.05)', color: '#0A0A0A', fontSize: 11, fontWeight: 500, cursor: 'pointer', fontFamily: T.font }}>
                      <Check size={11} /> Mark sent
                    </button>
                    <button onClick={() => skipItem(item)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 14px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.10)', background: 'transparent', color: T.textTertiary, fontSize: 11, cursor: 'pointer', fontFamily: T.font }}>
                      Skip
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      </div>
    </div>
  )
}
