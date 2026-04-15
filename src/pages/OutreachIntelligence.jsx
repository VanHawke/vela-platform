// OutreachIntelligence.jsx — Inbox / two-pane composer
// Mockup-faithful port of kiko-inbox.html
// Uses real reply data from Supabase

import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'

function formatWhen(iso) {
  const d = new Date(iso)
  const diffMs = Date.now() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.floor(diffHr / 24)
  if (diffDay < 7) return `${diffDay}d ago`
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}
import PageHeader from '@/components/layout/PageHeader'
import './OutreachIntelligence.css'

export default function OutreachIntelligence({ user }) {
  const [replies, setReplies] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState(null)
  const [whyOpen, setWhyOpen] = useState(true)
  const [filter, setFilter] = useState('all') // all / hot / unread
  const [draftBody, setDraftBody] = useState('')

  useEffect(() => {
    if (!user?.id) return
    let cancelled = false
    let sub = null
    const fetchReplies = async () => {
      setLoading(true)
      // Pull recent replies, joined with contact info
      const { data, error } = await supabase
        .from('activities')
        .select('id, subject, body, entity_name, created_at, metadata, contact_id, contacts(name, email, company)')
        .eq('type', 'reply')
        .order('created_at', { ascending: false })
        .limit(50)
      if (cancelled) return
      if (error) { console.error('[Inbox] fetch error', error); setReplies([]) }
      else { setReplies(data || []) }
      setLoading(false)
    }
    fetchReplies()
    // Real-time subscription — new replies appear instantly
    sub = supabase
      .channel('inbox-replies')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activities', filter: 'type=eq.reply' }, () => {
        fetchReplies()
      })
      .subscribe()
    return () => {
      cancelled = true
      if (sub) supabase.removeChannel(sub)
    }
  }, [user?.id])

  const filtered = useMemo(() => {
    if (filter === 'hot') return replies.filter(r => r.metadata?.hot)
    if (filter === 'unread') return replies.filter(r => !r.metadata?.read)
    return replies
  }, [replies, filter])

  const selected = filtered.find(r => r.id === selectedId) || filtered[0]
  const hotCount = replies.filter(r => r.metadata?.hot).length


  // Fallback mock data if no real replies (for first-time / empty state)
  const displayList = filtered.length > 0 ? filtered : MOCK_REPLIES
  const displaySelected = selected || MOCK_REPLIES[0]

  return (
    <div className="ib">
      <PageHeader
        eyebrowCategory="TODAY"
        eyebrowSuffix="Command Centre"
        title="Command Centre"
        stats={[
          { value: filtered.length || MOCK_REPLIES.length, label: 'Replies' },
          { value: hotCount || MOCK_REPLIES.filter(r => r.hot).length, label: 'Hot' },
        ]}
        toolbar={
          <button className="ib-pri-btn">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 2L11 13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
            Compose
          </button>
        }
      />

      <div className="ib-body">
        {/* LEFT: thread list */}
        <aside className="ib-list">
          <div className="ib-list-h">
            <div className="ib-seg">
              <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>All</button>
              <button className={filter === 'hot' ? 'active' : ''} onClick={() => setFilter('hot')}>Hot</button>
              <button className={filter === 'unread' ? 'active' : ''} onClick={() => setFilter('unread')}>Unread</button>
            </div>
          </div>
          <div className="ib-list-body">
            {displayList.map((r, i) => {
              const data = r.metadata || r
              // Prefer joined contact data, fall back to metadata, then mock fields
              const senderName = r.contacts?.name || data.from_name || data.from || 'Unknown'
              const senderCompany = r.contacts?.company || data.company || ''
              const subject = r.subject || data.subject || r.entity_name || data.entity_name || '(no subject)'
              const snippet = (r.body || data.snippet || data.preview || '').slice(0, 100)
              const when = data.when || (r.created_at ? formatWhen(r.created_at) : '—')
              const isSel = (r.id || i) === (displaySelected?.id || 0)
              return (
                <div
                  key={r.id || i}
                  className={`ib-thread ${isSel ? 'selected' : ''} ${data.hot ? 'hot' : ''}`}
                  onClick={() => setSelectedId(r.id || i)}
                >
                  <div className="ib-thread-row1">
                    <div className="ib-thread-name">{senderName}{senderCompany && <span style={{ color: '#A0A0A0', fontWeight: 400 }}> · {senderCompany}</span>}</div>
                    <div className="ib-thread-when">{when}</div>
                  </div>
                  <div className="ib-thread-subject">{subject}</div>
                  <div className="ib-thread-snippet">{snippet || ''}</div>
                  {data.hot && <span className="ib-thread-tag hot">HOT</span>}
                </div>
              )
            })}
          </div>
        </aside>


        {/* RIGHT: composer */}
        <main className="ib-pane">
          {displaySelected ? (
            <>
              <div className="ib-pane-h">
                <div>
                  <div className="ib-pane-from">{displaySelected.contacts?.name || displaySelected.metadata?.from_name || displaySelected.from || 'Unknown'}{displaySelected.contacts?.company && <span style={{ color: '#A0A0A0', fontWeight: 400, fontSize: '0.85em' }}> · {displaySelected.contacts.company}</span>}</div>
                  <div className="ib-pane-meta">{displaySelected.contacts?.email || displaySelected.metadata?.from_email || displaySelected.email || ''} · {displaySelected.metadata?.when || (displaySelected.created_at ? formatWhen(displaySelected.created_at) : displaySelected.when || '')}</div>
                </div>
                <div className="ib-pane-actions">
                  <button className="ib-icon-btn" title="Archive">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>
                  </button>
                  <button className="ib-icon-btn" title="Snooze">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                  </button>
                  <button className="ib-icon-btn" title="More">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>
                  </button>
                </div>
              </div>

              <div className="ib-pane-subject">{displaySelected.subject || displaySelected.metadata?.subject || displaySelected.entity_name || '(no subject)'}</div>

              <div className="ib-pane-body">
                <div className="ib-original">
                  {(displaySelected.body || displaySelected.metadata?.body || displaySelected.snippet || '').split('\n').map((p, i) => (
                    <p key={i}>{p}</p>
                  ))}
                </div>

                {/* Why this draft — collapsible */}
                <div className={`ib-why ${whyOpen ? 'open' : ''}`}>
                  <button className="ib-why-h" onClick={() => setWhyOpen(o => !o)}>
                    <span className="dot"></span>
                    <span>Why this draft</span>
                    <svg className="chev" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9"/></svg>
                  </button>
                  {whyOpen && (
                    <div className="ib-why-body">
                      <strong>Tone:</strong> Direct, formal — matches your previous touches with this account.<br/>
                      <strong>Hook:</strong> References the Mercedes renewal angle from Touch 3 (highest reply rate this quarter).<br/>
                      <strong>CTA:</strong> Specific next step — 30-min call this week.<br/>
                      <strong>Race context:</strong> Miami GP in 16d — peak window for sponsor decisions.
                    </div>
                  )}
                </div>

                {/* Composer */}
                <div className="ib-composer">
                  <div className="ib-composer-h">Reply</div>
                  <textarea
                    className="ib-composer-area"
                    value={draftBody || displaySelected.metadata?.draft_body || generateDraft(displaySelected)}
                    onChange={(e) => setDraftBody(e.target.value)}
                  />
                  <div className="ib-composer-foot">
                    <div className="ib-composer-tools">
                      <button className="ib-tool-btn">Regenerate</button>
                      <button className="ib-tool-btn">Tone: Direct</button>
                    </div>
                    <button className="ib-pri-btn">
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                      Send
                    </button>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="ib-empty">No replies yet</div>
          )}
        </main>
      </div>
    </div>
  )
}


// ── Mock fallback when no real replies in DB ──
const MOCK_REPLIES = [
  { id: 'm1', from_name: 'James Bardrick', from: 'james.bardrick@citi.com', subject: 'Re: F1 2027 Banking — Mercedes renewal', snippet: 'Hi Sunny, interesting point on Mercedes. Let me discuss with the team and revert next week...', when: '2h ago', hot: true, body: 'Hi Sunny,\n\nInteresting point on Mercedes — the renewal cycle does present an opening we should think about properly.\n\nLet me discuss with the team here and revert next week. Could we set up a 30 min call to walk through the commercial structure?\n\nBest,\nJames' },
  { id: 'm2', from_name: 'David Sundheim', from: 'd.sundheim@d1.com', subject: 'Re: F1 partnership thesis', snippet: 'Sunny, this aligns with what we have been thinking. Happy to take a meeting. Could you send the deck?', when: '4h ago', hot: true, body: 'Sunny,\n\nThis aligns with what we have been thinking on the sports IP side. Happy to take a meeting.\n\nCould you send through the deck and a couple of comparable transactions?\n\nDS' },
  { id: 'm3', from_name: 'Catherine Halford', from: 'c.halford@anz.com', subject: 'Re: ANZ × F1 brand strategy', snippet: 'Thanks for reaching out. Could we postpone the conversation until after the Asia road trip?', when: 'Yesterday', hot: false, body: 'Thanks for reaching out, Sunny.\n\nWe are heads-down on the APAC roadshow until end of month. Could we postpone the conversation until after I am back in Singapore?\n\nWill ping you the week of 28th April.\n\nCH' },
  { id: 'm4', from_name: 'Mark Nelson', from: 'mark@stripe.com', subject: 'Re: Formula E 2026', snippet: 'Sunny, FE is interesting for us. Let me loop in our brand team and come back with thoughts.', when: 'Yesterday', hot: false, body: 'Sunny,\n\nFE is interesting for us — particularly the Berlin and London E-Prix activation potential.\n\nLet me loop in our brand team and come back with thoughts later this week.\n\nM' },
  { id: 'm5', from_name: 'Paul Gewirtz', from: 'p.gewirtz@gs.com', subject: 'Re: Tomorrow 14:00', snippet: 'Confirmed for tomorrow 14:00. Send through any pre-read by EOD today.', when: '2 days ago', hot: false, body: 'Confirmed for tomorrow 14:00.\n\nPlease send through any pre-read by EOD today so I can review on the train in.\n\nPG' },
]

function generateDraft(reply) {
  if (!reply) return ''
  const name = (reply.metadata?.from_name || reply.from_name || 'there').split(' ')[0]
  return `${name},\n\nThanks for the quick turnaround.\n\nHappy to set up that call — let me know what works for you next week and I will send through the briefing pack ahead of time.\n\nThe key commercial structure we'd propose mirrors what's worked for the existing Haas roster — fixed annual rights fee plus race-by-race activation budgets, with category exclusivity inside banking.\n\nBest,\nSunny`
}
