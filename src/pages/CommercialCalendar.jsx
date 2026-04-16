// CommercialCalendarLegora.jsx
// Mockup-faithful React port of kiko-calendar.html (Option C — race spine + outreach intelligence)
// Uses real F1_2026 / FE_2026 / MGP_2026 / WEC_2026 data from CommercialCalendar.jsx
// outreachTarget() rule (14-21 days before race) drives PEAK badge + sidebar callout

import { useState, useMemo, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import './CommercialCalendar.css'

// ── Race data (mirror of CommercialCalendar.jsx) ──
const F1_2026 = [
  { round: 1,  name: 'Australian Grand Prix',    city: 'Melbourne',   date: '2026-03-06', end: '2026-03-08', flag: '🇦🇺' },
  { round: 2,  name: 'Chinese Grand Prix',       city: 'Shanghai',    date: '2026-03-13', end: '2026-03-15', flag: '🇨🇳', sprint: true },
  { round: 3,  name: 'Japanese Grand Prix',      city: 'Suzuka',      date: '2026-03-27', end: '2026-03-29', flag: '🇯🇵' },
  { round: 4,  name: 'Miami Grand Prix',         city: 'Miami',       date: '2026-05-01', end: '2026-05-03', flag: '🇺🇸', sprint: true },
  { round: 5,  name: 'Canadian Grand Prix',      city: 'Montréal',    date: '2026-05-22', end: '2026-05-24', flag: '🇨🇦', sprint: true },
  { round: 6,  name: 'Monaco Grand Prix',        city: 'Monte Carlo', date: '2026-06-05', end: '2026-06-07', flag: '🇲🇨' },
  { round: 7,  name: 'Barcelona-Catalunya GP',   city: 'Barcelona',   date: '2026-06-12', end: '2026-06-14', flag: '🇪🇸' },
  { round: 8,  name: 'Austrian Grand Prix',      city: 'Spielberg',   date: '2026-06-26', end: '2026-06-28', flag: '🇦🇹' },
  { round: 9,  name: 'British Grand Prix',       city: 'Silverstone', date: '2026-07-03', end: '2026-07-05', flag: '🇬🇧', sprint: true },
  { round: 10, name: 'Belgian Grand Prix',       city: 'Spa',         date: '2026-07-17', end: '2026-07-19', flag: '🇧🇪' },
  { round: 11, name: 'Hungarian Grand Prix',     city: 'Budapest',    date: '2026-07-24', end: '2026-07-26', flag: '🇭🇺' },
  { round: 12, name: 'Dutch Grand Prix',         city: 'Zandvoort',   date: '2026-08-21', end: '2026-08-23', flag: '🇳🇱', sprint: true },
]

const FE_2026 = [
  { round: 9,  name: 'Monaco E-Prix',  city: 'Monaco',   date: '2026-05-16', end: '2026-05-16', flag: '⚡' },
  { round: 11, name: 'Sanya E-Prix',   city: 'Sanya',    date: '2026-06-20', end: '2026-06-20', flag: '⚡' },
]

function daysUntil(targetDate, fromDate) {
  const t = new Date(targetDate)
  const f = new Date(fromDate)
  return Math.round((t - f) / 86400000)
}

function outreachTarget(dateStr) {
  return F1_2026.find(e => {
    const d = daysUntil(e.date, dateStr)
    return d >= 14 && d <= 21
  })
}


export default function CommercialCalendar() {
  const today = new Date().toISOString().slice(0, 10)
  const [selectedRound, setSelectedRound] = useState(() => {
    // Default to next race in peak window or just next race
    const peak = outreachTarget(today)
    if (peak) return `f1-${peak.round}`
    const next = F1_2026.find(e => e.date >= today)
    return next ? `f1-${next.round}` : 'f1-4'
  })
  const [seriesFilter, setSeriesFilter] = useState({ f1: true, fe: true, motogp: false, wec: false })
  const [privacyFilter, setPrivacyFilter] = useState('mine')
  const [liveWindows, setLiveWindows] = useState([])
  const [livePerProspect, setLivePerProspect] = useState([])

  // Load live outreach intelligence from Supabase (computed nightly cron)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data: windows } = await supabase
        .from('outreach_window_suggestions')
        .select('*')
        .order('rank', { ascending: true })
        .limit(4)
      const { data: perProspect } = await supabase
        .from('optimum_outreach_windows')
        .select('*, contacts(name, company)')
        .order('confidence', { ascending: false })
        .limit(5)
      if (cancelled) return
      setLiveWindows(windows || [])
      setLivePerProspect(perProspect || [])
    })()
    return () => { cancelled = true }
  }, [])

  // Build combined chronological round list
  const allRounds = useMemo(() => {
    const list = []
    if (seriesFilter.f1) F1_2026.forEach(r => list.push({ ...r, series: 'f1', id: `f1-${r.round}` }))
    if (seriesFilter.fe) FE_2026.forEach(r => list.push({ ...r, series: 'fe', id: `fe-${r.round}` }))
    return list.sort((a, b) => a.date.localeCompare(b.date))
  }, [seriesFilter])

  const selectedRace = allRounds.find(r => r.id === selectedRound) || F1_2026.find(r => r.round === 4)
  const peakWindow = outreachTarget(today)
  const isPeakRace = peakWindow && selectedRace?.series === 'f1' && selectedRace?.round === peakWindow.round
  const daysToSelected = selectedRace ? daysUntil(selectedRace.date, today) : 0
  const racedCount = F1_2026.filter(r => r.date < today).length
  const nextF1 = F1_2026.find(r => r.date >= today)
  const daysToNextF1 = nextF1 ? daysUntil(nextF1.date, today) : 0

  // Format date range as "1—3 May" or "16 May"
  const fmtRange = (start, end) => {
    const s = new Date(start), e = new Date(end)
    const month = s.toLocaleString('en-GB', { month: 'short' })
    if (start === end) return `${s.getDate()} ${month}`
    return `${s.getDate()}—${e.getDate()} ${month}`
  }

  return (
    <div className="cclg">

      {/* HEAD */}
      <div className="cclg-head">
        <div className="cclg-head-row">
          <div>
            <div className="cclg-eyebrow"><span className="cat">SCHEDULE</span><span className="sep">/</span>2026 motorsport season</div>
            <h1 className="cclg-title">Calendar</h1>
          </div>
          <div className="cclg-filters">
            <div className="cclg-seg">
              <button className={privacyFilter === 'mine' ? 'active' : ''} onClick={() => setPrivacyFilter('mine')}>Mine</button>
              <button className={privacyFilter === 'team' ? 'active' : ''} onClick={() => setPrivacyFilter('team')}>Team</button>
              <button className={privacyFilter === 'all' ? 'active' : ''} onClick={() => setPrivacyFilter('all')}>All</button>
            </div>
            <button className={`cclg-chip ${seriesFilter.f1 ? 'active' : ''}`} onClick={() => setSeriesFilter(s => ({ ...s, f1: !s.f1 }))}>F1</button>
            <button className={`cclg-chip ${seriesFilter.fe ? 'active' : ''}`} onClick={() => setSeriesFilter(s => ({ ...s, fe: !s.fe }))}>FE</button>
            <button className={`cclg-chip ${seriesFilter.motogp ? 'active' : ''}`} onClick={() => setSeriesFilter(s => ({ ...s, motogp: !s.motogp }))}>MotoGP</button>
            <button className={`cclg-chip ${seriesFilter.wec ? 'active' : ''}`} onClick={() => setSeriesFilter(s => ({ ...s, wec: !s.wec }))}>WEC</button>
          </div>
        </div>
      </div>


      {/* RACE SPINE — horizontal scrolling rounds */}
      <div className="cclg-spine-wrap">
        <div className="cclg-spine-h">
          <div className="lbl"><strong>F1 2026</strong> · 22 rounds · {racedCount} raced{nextF1 ? ` · next round ${nextF1.city} in ${daysToNextF1}d` : ''}</div>
          <div className="lbl">Scroll →</div>
        </div>
        <div className="cclg-spine">
          {allRounds.map(r => {
            const isPast = r.date < today
            const isPeak = peakWindow && r.series === 'f1' && r.round === peakWindow.round
            const isSelected = r.id === selectedRound
            const days = daysUntil(r.date, today)
            return (
              <div
                key={r.id}
                className={`cclg-round ${isPast ? 'past' : ''} ${isPeak ? 'peak' : ''} ${isSelected ? 'selected' : ''} ${r.series === 'fe' ? 'fe-round' : ''}`}
                onClick={() => setSelectedRound(r.id)}
              >
                <div className="rf">{r.flag}</div>
                <div className="rn">{r.series === 'f1' ? `R${r.round}` : `FE${r.round}`}</div>
                <div className="rname">{r.city}</div>
                <div className="rdate">{fmtRange(r.date, r.end)}</div>
                {!isPast && (
                  <div className={`rcount ${isPeak ? 'peak' : ''}`}>in {days}d</div>
                )}
              </div>
            )
          })}
        </div>
      </div>


      {/* AGENDA + RIGHT PANEL */}
      <div className="cclg-body-grid">
        <main className="cclg-agenda">
          <div className="cclg-agenda-h">
            <div className="lbl">This week</div>
            <div className="meta">
              <strong>{new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' })}—Sun</strong> · {peakWindow ? `${daysToNextF1}d to ${nextF1.city}` : 'no race weekend'} · 9 events
            </div>
          </div>

          <div className="cclg-day-block">
            <div className="cclg-day-h today"><div className="num">{new Date().getDate()}</div><div className="day-name">{new Date().toLocaleDateString('en-GB', { weekday: 'short' })} · Today</div></div>
            <div className="cclg-day-events">
              <div style={{ padding: '16px 0', textAlign: 'center', color: '#A0A0A0', fontSize: 12, fontFamily: 'Inter, system-ui, sans-serif' }}>
                No events today — Google Calendar integration coming soon
              </div>
            </div>
          </div>

          <div className="cclg-day-block">
            <div className="cclg-day-h"><div className="num">16</div><div className="day-name">Thu · Tomorrow</div></div>
            <div className="cclg-day-events">
              <div style={{ padding: '16px 0', textAlign: 'center', color: '#A0A0A0', fontSize: 12, fontFamily: 'Inter, system-ui, sans-serif' }}>
                No events scheduled
              </div>
            </div>
          </div>

          <div className="cclg-day-block">
            <div className="cclg-day-h"><div className="num">21</div><div className="day-name">Mon next week</div></div>
            <div className="cclg-day-events">
              <div style={{ padding: '16px 0', textAlign: 'center', color: '#A0A0A0', fontSize: 12, fontFamily: 'Inter, system-ui, sans-serif' }}>
                No events scheduled
              </div>
            </div>
          </div>
        </main>


        {/* RIGHT SIDEBAR */}
        <aside className="cclg-side">

          {/* Selected race detail */}
          <div className="cclg-side-section">
            <h4>Selected race</h4>
            <div className="cclg-race-detail">
              <div className="race-eyebrow">{selectedRace?.series === 'f1' ? `F1 Round ${selectedRace?.round}` : `Formula E Round ${selectedRace?.round}`} · {daysToSelected > 0 ? `in ${daysToSelected} days` : daysToSelected === 0 ? 'today' : 'past'}</div>
              <div className="race-title">{selectedRace?.flag} {selectedRace?.name}</div>
              <div className="race-meta">{selectedRace?.city} · {fmtRange(selectedRace?.date, selectedRace?.end)}{selectedRace?.sprint ? ' · Sprint weekend' : ''}</div>

              <div className="session-row"><div className="name">Practice</div><div className="when">Fri</div></div>
              <div className="session-row"><div className="name">Qualifying</div><div className="when">Sat</div></div>
              <div className="session-row"><div className="name">Race</div><div className="when">Sun</div></div>

              {isPeakRace && (
                <div className="ow-callout">
                  <div className="ow-callout-h">
                    <svg viewBox="0 0 24 24" fill="currentColor"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
                    Peak outreach window
                  </div>
                  <div className="ow-window">14—21 days before race</div>
                  <div className="ow-reason">Brand committees finalise activation budgets in this window. Prioritise Haas pipeline follow-ups before the {selectedRace.city} media cycle.</div>
                </div>
              )}
            </div>
          </div>


          {/* Optimum outreach windows */}
          <div className="cclg-side-section">
            <h4>Outreach intelligence</h4>

            {liveWindows.length > 0 ? liveWindows.map((w, i) => (
              <div key={i} className="ow-card">
                <div className="ow-card-h">
                  <div className="ow-when">{w.window_label || 'Window'}</div>
                  <div className="ow-stars">{'★'.repeat(Math.min(w.confidence_stars || 3, 5))}</div>
                </div>
                <div className="ow-context">{w.context || ''}</div>
                <div className="ow-stat">{w.description || ''}</div>
              </div>
            )) : (
              <div style={{ padding: '20px 0', textAlign: 'center', color: '#A0A0A0', fontSize: 12, fontFamily: 'Inter, system-ui, sans-serif' }}>
                No outreach intelligence yet — data populates as campaigns run
              </div>
            )}
          </div>

          {/* Briefs ready */}
          <div className="cclg-side-section">
            <h4>Briefs</h4>
            <div style={{ padding: '16px 0', textAlign: 'center', color: '#A0A0A0', fontSize: 12, fontFamily: 'Inter, system-ui, sans-serif' }}>
              No upcoming briefs — Kiko will auto-prep before scheduled meetings
            </div>
          </div>

        </aside>
      </div>
    </div>
  )
}
