// Campaigns.jsx — Legora-style sequence list + 5-touch builder
// Mockup-faithful port of kiko-campaigns.html

import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import PageHeader from '@/components/layout/PageHeader'
import './Campaigns.css'

const CHANNEL_ICONS = {
  email: 'M',
  linkedin: 'in',
  call: '☎',
  task: '✓',
}

const STATUS_CLASSES = {
  done: 'done',
  active: 'active',
  scheduled: 'scheduled',
  paused: 'paused',
  draft: 'draft',
}

export default function Campaigns({ user }) {
  const nav = useNavigate()
  const [campaigns, setCampaigns] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user?.id) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const { data, error } = await supabase
        .from('sequences')
        .select('*')
        .order('created_at', { ascending: false })
      if (cancelled) return
      if (error) { console.error('[Campaigns] fetch error', error); setCampaigns([]) }
      else {
        setCampaigns(data || [])
        if ((data || []).length > 0) setSelectedId(data[0].id)
      }
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [user?.id])

  const display = campaigns.length > 0 ? campaigns : MOCK_CAMPAIGNS
  const selected = display.find(c => c.id === selectedId) || display[0]


  const touches = selected?.touches || selected?.metadata?.touches || MOCK_TOUCHES

  return (
    <div className="cp">
      <PageHeader
        eyebrowCategory="OUTREACH"
        eyebrowSuffix="Active sequences"
        title="Campaigns"
        stats={[
          { value: display.length, label: 'Sequences' },
          { value: display.filter(c => c.status === 'active' || !c.status).length, label: 'Active' },
        ]}
        toolbar={
          <button className="cp-pri-btn">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
            New sequence
          </button>
        }
      />

      <div className="cp-body">
        {/* LEFT: sequence list */}
        <aside className="cp-list">
          <div className="cp-list-h">
            <input className="cp-search" placeholder="Search sequences..." />
          </div>
          <div className="cp-list-body">
            {display.map(c => {
              const isSel = c.id === (selected?.id)
              const stats = c.stats || c.metadata?.stats || { sent: 0, replied: 0 }
              const replyRate = stats.sent > 0 ? Math.round((stats.replied / stats.sent) * 100) : 0
              return (
                <div
                  key={c.id}
                  className={`cp-seq ${isSel ? 'selected' : ''}`}
                  onClick={() => setSelectedId(c.id)}
                >
                  <div className="cp-seq-row1">
                    <div className="cp-seq-name">{c.name || 'Untitled sequence'}</div>
                    <span className={`cp-seq-status ${STATUS_CLASSES[c.status] || 'active'}`}>{c.status || 'active'}</span>
                  </div>
                  <div className="cp-seq-meta">{c.sector || c.metadata?.sector || 'General'} · {touches.length} touches</div>
                  <div className="cp-seq-stats">
                    <span><strong>{stats.sent || 0}</strong> sent</span>
                    <span><strong>{stats.replied || 0}</strong> replied</span>
                    <span className="rate">{replyRate}%</span>
                  </div>
                </div>
              )
            })}
          </div>
        </aside>


        {/* RIGHT: 5-touch builder */}
        <main className="cp-builder">
          {selected ? (
            <>
              <div className="cp-builder-h">
                <div>
                  <div className="cp-eyebrow"><span className="cat">SEQUENCE</span><span className="sep">/</span>{selected.sector || 'Banking'}</div>
                  <h2 className="cp-builder-title">{selected.name || 'Untitled sequence'}</h2>
                  <div className="cp-builder-meta">{touches.length} touches · auto-send · paused on reply · timezone-aware</div>
                </div>
                <div className="cp-builder-actions">
                  <button className="cp-tool-btn">Pause</button>
                  <button className="cp-tool-btn">Duplicate</button>
                  <button className="cp-tool-btn danger">Archive</button>
                </div>
              </div>

              <div className="cp-touches">
                {touches.map((t, i) => {
                  const isCurrent = t.status === 'active' || t.status === 'scheduled'
                  return (
                    <div key={i} className={`cp-touch ${t.status || ''} ${isCurrent ? 'current' : ''}`}>
                      <div className="cp-touch-spine">
                        <div className={`cp-touch-num ${STATUS_CLASSES[t.status] || ''}`}>{i + 1}</div>
                        {i < touches.length - 1 && <div className="cp-touch-line"></div>}
                      </div>
                      <div className="cp-touch-card">
                        <div className="cp-touch-h">
                          <div className="cp-touch-title">Touch {i + 1} · {t.title || t.subject || 'Untitled'}</div>
                          <div className="cp-touch-pills">
                            <span className="cp-pill channel">{t.channel || 'email'}</span>
                            <span className={`cp-pill status ${STATUS_CLASSES[t.status] || ''}`}>{t.status || 'draft'}</span>
                            <span className="cp-pill day">Day {t.day || (i * 4) + 1}</span>
                          </div>
                        </div>
                        {t.subject && <div className="cp-touch-subject">{t.subject}</div>}
                        <div className="cp-touch-preview">{t.preview || t.body || '(no content)'}</div>
                        {t.stats && (
                          <div className="cp-touch-stats">
                            <span><strong>{t.stats.sent || 0}</strong> sent</span>
                            <span><strong>{t.stats.opened || 0}</strong> opened</span>
                            <span><strong>{t.stats.replied || 0}</strong> replied</span>
                            <span className="rate">{t.stats.sent > 0 ? Math.round((t.stats.replied / t.stats.sent) * 100) : 0}%</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}

                {/* Add touch button */}
                <div className="cp-touch">
                  <div className="cp-touch-spine">
                    <div className="cp-touch-num add">+</div>
                  </div>
                  <button className="cp-touch-add">Add touch</button>
                </div>
              </div>
            </>
          ) : (
            <div className="cp-empty">No sequences yet</div>
          )}
        </main>
      </div>
    </div>
  )
}


// ── Mock data fallback ──
const MOCK_CAMPAIGNS = [
  { id: 'm1', name: 'F1 2027 Banking', sector: 'Banking', status: 'active', stats: { sent: 28, replied: 4 } },
  { id: 'm2', name: 'FinTech FE 2026', sector: 'FinTech', status: 'active', stats: { sent: 18, replied: 2 } },
  { id: 'm3', name: 'Telecoms MotoGP', sector: 'Telecoms', status: 'active', stats: { sent: 12, replied: 1 } },
  { id: 'm4', name: 'Gaming FE 2026', sector: 'Gaming', status: 'paused', stats: { sent: 15, replied: 3 } },
  { id: 'm5', name: 'Banking WEC 2026', sector: 'Banking', status: 'draft', stats: { sent: 0, replied: 0 } },
]

const MOCK_TOUCHES = [
  { day: 1, channel: 'email', status: 'done', title: 'Authority intro', subject: 'F1 2027 — category control conversation', preview: 'Sunny here from Van Hawke — we represent Haas F1 commercial rights. We see a closed bundle opportunity in banking that closes by end of Q3.', stats: { sent: 28, opened: 24, replied: 2 } },
  { day: 5, channel: 'linkedin', status: 'done', title: 'LinkedIn connect', preview: 'Connection request with custom note referencing the email and Mercedes renewal context.', stats: { sent: 28, opened: 20, replied: 1 } },
  { day: 8, channel: 'email', status: 'active', title: 'Mercedes renewal angle', subject: 'Mercedes-HSBC renewal — 2027 implications', preview: 'Now that HSBC × Mercedes has renewed through 2027, the F1 banking category quietly closes for two years. Ten minutes this week to walk through the structural implications?', stats: { sent: 28, opened: 6, replied: 1 } },
  { day: 12, channel: 'linkedin', status: 'scheduled', title: 'LinkedIn DM (touch 4)', preview: 'DM to connected prospects with Miami GP race-week angle and specific call-to-action.', stats: { sent: 0, opened: 0, replied: 0 } },
  { day: 16, channel: 'email', status: 'draft', title: 'Breakup note', subject: 'Final note · F1 2027', preview: 'Final note before I close the file on this — happy to revisit when timing is better. Quick yes/no whether to keep on file?', stats: { sent: 0, opened: 0, replied: 0 } },
]
