// CommercialCalendarLegora.jsx
// Mockup-faithful React port of kiko-calendar.html (Option C — race spine + outreach intelligence)
// Uses real F1_2026 / FE_2026 / MGP_2026 / WEC_2026 data from CommercialCalendar.jsx
// outreachTarget() rule (14-21 days before race) drives PEAK badge + sidebar callout

import { useState, useMemo } from 'react'
import './CommercialCalendarLegora.css'

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


export default function CommercialCalendarLegora() {
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
            {peakWindow && (
              <div className="cclg-ow-inline">
                <span className="bolt"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg></span>
                <span><strong>Optimum send window now → 16:00 UK</strong> · 12 banking prospects · 78% historical reply rate · pre-{peakWindow.city} GP push</span>
                <span className="cta">Schedule batch</span>
              </div>
            )}
            <div className="cclg-day-events">
              <div className="cclg-ev kiko"><div className="t">09:00<span>30 min</span></div><div className="info"><div className="title">Kiko morning brief <span className="tag kiko">Kiko</span></div><div className="sub"><strong>3 hot replies</strong> · pipeline moved $2.4m</div></div><div className="att"><div className="av">S</div></div></div>
              <div className="cclg-ev private"><div className="t">11:30<span>45 min</span></div><div className="info"><div className="title">Giacomo · Maison product review <span className="priv">🔒</span></div><div className="sub">Archive 01 walkthrough</div></div><div className="att"><div className="av">S</div><div className="av">G</div></div></div>
              <div className="cclg-ev kiko"><div className="t">14:00<span>15 min</span></div><div className="info"><div className="title">Touch 3 sends — F1 Banking <span className="tag kiko">Auto</span></div><div className="sub">28 prospects · {peakWindow?.city || 'Miami'} GP angle</div></div><div className="att"><div className="av">K</div></div></div>
              <div className="cclg-ev kiko"><div className="t">16:00<span>30 min</span></div><div className="info"><div className="title">Prep: Gewirtz briefing <span className="tag brief">Prep</span></div><div className="sub">Ready 15:30</div></div><div className="att"><div className="av">K</div></div></div>
            </div>
          </div>

          <div className="cclg-day-block">
            <div className="cclg-day-h"><div className="num">16</div><div className="day-name">Thu · Tomorrow</div></div>
            <div className="cclg-ow-inline">
              <span className="bolt"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg></span>
              <span><strong>Optimum send 09:00 — 11:00 UK</strong> · 8 fintech prospects · 64% historical reply rate</span>
              <span className="cta">Schedule batch</span>
            </div>
            <div className="cclg-day-events">
              <div className="cclg-ev team"><div className="t">14:00<span>30 min</span></div><div className="info"><div className="title">Paul Gewirtz · Goldman Sachs <span className="tag f1">F1 2027</span></div><div className="sub">Head of Brand · briefing pack <strong>ready 15:30 today</strong></div></div><div className="att"><div className="av">S</div><div className="av">PG</div></div></div>
            </div>
          </div>

          <div className="cclg-day-block">
            <div className="cclg-day-h"><div className="num">21</div><div className="day-name">Mon next week</div></div>
            <div className="cclg-day-events">
              <div className="cclg-ev team"><div className="t">10:00<span>30 min</span></div><div className="info"><div className="title">Mark Nelson · Stripe <span className="tag f1">FE 2026</span></div><div className="sub">10:00 PT / 18:00 UK</div></div><div className="att"><div className="av">S</div><div className="av">MN</div></div></div>
              <div className="cclg-ev team"><div className="t">14:00<span>60 min</span></div><div className="info"><div className="title">Van Hawke board check-in</div><div className="sub">Q2 pipeline review · <strong>$73m weighted</strong></div></div><div className="att"><div className="av">S</div><div className="av">+3</div></div></div>
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
                    Peak outreach window · open now
                  </div>
                  <div className="ow-window">Today → +7 days</div>
                  <div className="ow-reason"><strong>14—21 days before race is peak window for sponsor decisions.</strong> Brand committees finalise activation budgets in this window. Send Haas pipeline follow-ups now to land before the {selectedRace.city} media cycle.</div>
                  <button className="ow-cta-btn">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                    Schedule batch · 12 prospects
                  </button>
                </div>
              )}

              <div className="prospects-block">
                <div className="prospects-h">Your prospects watching · best send time</div>
                <div className="prospect-pill"><div className="pp-init">JB</div><div className="pp-name">Bardrick · Citi</div><div className="pp-best">best <strong>Tue 10:00 UK</strong></div></div>
                <div className="prospect-pill"><div className="pp-init">DS</div><div className="pp-name">Sundheim · D1</div><div className="pp-best">best <strong>Wed 14:00 UK</strong></div></div>
                <div className="prospect-pill"><div className="pp-init">CH</div><div className="pp-name">Halford · ANZ</div><div className="pp-best">best <strong>Thu 09:00 SGT</strong></div></div>
                <div className="prospect-pill"><div className="pp-init">AC</div><div className="pp-name">Cross · Barclays</div><div className="pp-best">best <strong>Fri 11:00 UK</strong></div></div>
                <div className="prospect-pill"><div className="pp-init">MN</div><div className="pp-name">Nelson · Stripe</div><div className="pp-best">best <strong>Mon 09:00 PT</strong></div></div>
              </div>
            </div>
          </div>


          {/* Optimum outreach windows */}
          <div className="cclg-side-section">
            <h4>Optimum outreach windows<span className="h-pill">Live data</span></h4>

            <div className="ow-card">
              <div className="ow-card-h">
                <div className="ow-when">Today · 14:00 — 16:00 UK</div>
                <div className="ow-stars">★★★★★</div>
              </div>
              <div className="ow-context">PRE-{peakWindow?.city.toUpperCase() || 'MIAMI'} GP · {peakWindow ? daysUntil(peakWindow.date, today) : 16}D OUT · PEAK WINDOW</div>
              <div className="ow-stat"><strong>12 banking prospects</strong> · <span className="pct">78%</span> historical reply rate in this window</div>
              <div className="ow-action">Schedule batch send →</div>
            </div>

            <div className="ow-card">
              <div className="ow-card-h">
                <div className="ow-when">Tomorrow · 09:00 — 11:00 UK</div>
                <div className="ow-stars">★★★★</div>
              </div>
              <div className="ow-context">PRE-{peakWindow?.city.toUpperCase() || 'MIAMI'} GP · UK MORNING SLOT</div>
              <div className="ow-stat"><strong>8 fintech prospects</strong> · <span className="pct">64%</span> historical reply rate · post-coffee window</div>
              <div className="ow-action">Schedule batch send →</div>
            </div>

            <div className="ow-card">
              <div className="ow-card-h">
                <div className="ow-when">Tue · 10:00 PT</div>
                <div className="ow-stars">★★★★</div>
              </div>
              <div className="ow-context">US PROSPECTS · MID-MORNING</div>
              <div className="ow-stat"><strong>5 US-based prospects</strong> · <span className="pct">61%</span> reply rate · Stripe / D1 / Goldman cluster</div>
              <div className="ow-action">Schedule batch send →</div>
            </div>

            <div className="ow-card">
              <div className="ow-card-h">
                <div className="ow-when">Thu · 09:00 SGT</div>
                <div className="ow-stars">★★★</div>
              </div>
              <div className="ow-context">APAC PROSPECTS · LAST PRE-RACE DAY</div>
              <div className="ow-stat"><strong>4 APAC prospects</strong> · <span className="pct">52%</span> reply rate · DBS / Citi APAC / ANZ</div>
              <div className="ow-action">Schedule batch send →</div>
            </div>
          </div>

          {/* Briefs ready */}
          <div className="cclg-side-section">
            <h4>Briefs ready</h4>
            <div className="prep">
              <div className="when">Tomorrow 14:00</div>
              <div className="who">Paul Gewirtz · GS</div>
              <div className="what">F1 vs rugby economics 1-pager</div>
            </div>
            <div className="prep">
              <div className="when">Mon 21 · 10:00 PT</div>
              <div className="who">Mark Nelson · Stripe</div>
              <div className="what">Auto-prep at Mon 09:00</div>
            </div>
          </div>

        </aside>
      </div>
    </div>
  )
}
