// CommercialCalendar.jsx — V1: 55/45 split, wider grid, full day names, richer detail
import { useState, useMemo } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

// ── Platform tokens ───────────────────────────────────────
const T = {
  bg: '#FAFAFA', surface: '#FFFFFF', surfaceHover: '#F5F5F5',
  border: 'rgba(0,0,0,0.06)', borderHover: 'rgba(0,0,0,0.12)',
  text: '#1A1A1A', textSecondary: '#6B6B6B', textTertiary: '#ABABAB',
  font: "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  f1: '#E10600', f1Light: '#FEF2F2', f1Border: '#F7C1C1', f1Dark: '#791F1F',
  fe: '#0055CC', feLight: '#EBF3FF', feBorder: '#B5D4F4', feDark: '#0C447C',
  amber: '#B86000', amberLight: '#FFF7ED', amberBorder: '#FAC775',
}

// ── Official logos — raw, no background box ───────────────
const SeriesIcon = ({ series, size = 22 }) => (
  <img
    src={series === 'f1' ? '/f1-logo.png' : '/fe-logo.png'}
    alt={series === 'f1' ? 'F1' : 'Formula E'}
    style={{ width: size, height: size, objectFit: 'contain', display: 'block', flexShrink: 0 }}
  />
)

// ── Race data (verified from formula1.com + fiaformulae.com) ─
const F1_2026 = [
  { round: 1,  name: 'Australian Grand Prix',    city: 'Melbourne',   date: '2026-03-06', end: '2026-03-08' },
  { round: 2,  name: 'Chinese Grand Prix',       city: 'Shanghai',    date: '2026-03-13', end: '2026-03-15', sprint: true },
  { round: 3,  name: 'Japanese Grand Prix',      city: 'Suzuka',      date: '2026-03-27', end: '2026-03-29' },
  { round: 4,  name: 'Miami Grand Prix',         city: 'Miami',       date: '2026-05-01', end: '2026-05-03', sprint: true },
  { round: 5,  name: 'Canadian Grand Prix',      city: 'Montréal',    date: '2026-05-22', end: '2026-05-24', sprint: true },
  { round: 6,  name: 'Monaco Grand Prix',        city: 'Monte Carlo', date: '2026-06-05', end: '2026-06-07' },
  { round: 7,  name: 'Barcelona-Catalunya GP',   city: 'Barcelona',   date: '2026-06-12', end: '2026-06-14' },
  { round: 8,  name: 'Austrian Grand Prix',      city: 'Spielberg',   date: '2026-06-26', end: '2026-06-28' },
  { round: 9,  name: 'British Grand Prix',       city: 'Silverstone', date: '2026-07-03', end: '2026-07-05', sprint: true },
  { round: 10, name: 'Belgian Grand Prix',       city: 'Spa',         date: '2026-07-17', end: '2026-07-19' },
  { round: 11, name: 'Hungarian Grand Prix',     city: 'Budapest',    date: '2026-07-24', end: '2026-07-26' },
  { round: 12, name: 'Dutch Grand Prix',         city: 'Zandvoort',   date: '2026-08-21', end: '2026-08-23', sprint: true },
  { round: 13, name: 'Italian Grand Prix',       city: 'Monza',       date: '2026-09-04', end: '2026-09-06' },
  { round: 14, name: 'Madrid Grand Prix',        city: 'Madrid',      date: '2026-09-11', end: '2026-09-13' },
  { round: 15, name: 'Azerbaijan Grand Prix',    city: 'Baku',        date: '2026-09-25', end: '2026-09-26', saturday: true },
  { round: 16, name: 'Singapore Grand Prix',     city: 'Singapore',   date: '2026-10-09', end: '2026-10-11', sprint: true },
  { round: 17, name: 'United States Grand Prix', city: 'Austin',      date: '2026-10-23', end: '2026-10-25' },
  { round: 18, name: 'Mexico City Grand Prix',   city: 'Mexico City', date: '2026-10-30', end: '2026-11-01' },
  { round: 19, name: 'São Paulo Grand Prix',     city: 'São Paulo',   date: '2026-11-06', end: '2026-11-08', sprint: true },
  { round: 20, name: 'Las Vegas Grand Prix',     city: 'Las Vegas',   date: '2026-11-19', end: '2026-11-21', saturday: true },
  { round: 21, name: 'Qatar Grand Prix',         city: 'Lusail',      date: '2026-11-27', end: '2026-11-29' },
  { round: 22, name: 'Abu Dhabi Grand Prix',     city: 'Abu Dhabi',   date: '2026-12-04', end: '2026-12-06' },
]
const FE_S12 = [
  { round: 1,  name: 'São Paulo E-Prix',   city: 'São Paulo',   date: '2025-12-06', end: '2025-12-06' },
  { round: 2,  name: 'Mexico City E-Prix', city: 'Mexico City', date: '2026-01-10', end: '2026-01-10' },
  { round: 3,  name: 'Miami E-Prix',       city: 'Miami',       date: '2026-01-31', end: '2026-01-31' },
  { round: 4,  name: 'Jeddah E-Prix 1',   city: 'Jeddah',      date: '2026-02-13', end: '2026-02-13' },
  { round: 5,  name: 'Jeddah E-Prix 2',   city: 'Jeddah',      date: '2026-02-14', end: '2026-02-14' },
  { round: 6,  name: 'Madrid E-Prix',     city: 'Madrid',      date: '2026-03-21', end: '2026-03-21' },
  { round: 7,  name: 'Berlin E-Prix 1',   city: 'Berlin',      date: '2026-05-02', end: '2026-05-02' },
  { round: 8,  name: 'Berlin E-Prix 2',   city: 'Berlin',      date: '2026-05-03', end: '2026-05-03' },
  { round: 9,  name: 'Monaco E-Prix 1',   city: 'Monaco',      date: '2026-05-16', end: '2026-05-16' },
  { round: 10, name: 'Monaco E-Prix 2',   city: 'Monaco',      date: '2026-05-17', end: '2026-05-17' },
  { round: 11, name: 'Sanya E-Prix',      city: 'Sanya',       date: '2026-06-20', end: '2026-06-20' },
  { round: 12, name: 'Shanghai E-Prix 1', city: 'Shanghai',    date: '2026-07-04', end: '2026-07-04' },
  { round: 13, name: 'Shanghai E-Prix 2', city: 'Shanghai',    date: '2026-07-05', end: '2026-07-05' },
  { round: 14, name: 'Tokyo E-Prix 1',    city: 'Tokyo',       date: '2026-07-25', end: '2026-07-25' },
  { round: 15, name: 'Tokyo E-Prix 2',    city: 'Tokyo',       date: '2026-07-26', end: '2026-07-26' },
  { round: 16, name: 'London E-Prix 1',   city: 'London',      date: '2026-08-15', end: '2026-08-15' },
  { round: 17, name: 'London E-Prix 2',   city: 'London',      date: '2026-08-16', end: '2026-08-16' },
]

// ── Helpers ───────────────────────────────────────────────
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const MONTHS_FULL  = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DAYS_FULL    = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday']

function pad2(n) { return String(n).padStart(2, '0') }
function toStr(y, m, d) { return `${y}-${pad2(m + 1)}-${pad2(d)}` }

function getNow() {
  const n = new Date()
  return toStr(n.getFullYear(), n.getMonth(), n.getDate())
}
function daysInMonth(y, m) { return new Date(y, m + 1, 0).getDate() }
function firstWeekday(y, m) { const d = new Date(y, m, 1).getDay(); return d === 0 ? 6 : d - 1 }

function daysUntil(dateStr, from) {
  const f = from || getNow()
  return Math.ceil((new Date(dateStr + 'T12:00:00') - new Date(f + 'T12:00:00')) / 86400000)
}
function fmtRange(date, end) {
  const d = new Date(date + 'T12:00:00'), e = new Date(end + 'T12:00:00')
  if (date === end) return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`
  if (d.getMonth() === e.getMonth()) return `${d.getDate()}–${e.getDate()} ${MONTHS_SHORT[d.getMonth()]}`
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} – ${e.getDate()} ${MONTHS_SHORT[e.getMonth()]}`
}
function fmtLong(dateStr) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  })
}

// Nearest F1 race that this date is 14–21 days before
function outreachTarget(dateStr) {
  return F1_2026.find(e => {
    const d = daysUntil(e.date, dateStr)
    return d >= 14 && d <= 21
  }) || null
}

// Events overlapping a specific date
function eventsOn(dateStr, showF1, showFE) {
  const f1 = showF1 ? F1_2026.filter(e => dateStr >= e.date && dateStr <= e.end) : []
  const fe = showFE ? FE_S12.filter(e => dateStr >= e.date && dateStr <= e.end) : []
  return { f1, fe }
}

// Cell styling logic
function cellStyle(dateStr, selected, today, showF1, showFE) {
  const { f1, fe } = eventsOn(dateStr, showF1, showFE)
  const isRaceDay = f1.some(e => e.end === dateStr)
  const hasF1     = f1.length > 0
  const hasFE     = fe.length > 0
  const isWindow  = !hasF1 && !hasFE && !!outreachTarget(dateStr)
  const isToday   = dateStr === today
  const isSel     = dateStr === selected

  let bg = T.surface, border = T.border
  if (isSel)       { bg = T.text;        border = T.text }
  else if (isRaceDay) { bg = T.f1;       border = T.f1 }
  else if (hasF1)  { bg = T.f1Light;     border = T.f1Border }
  else if (hasFE)  { bg = T.feLight;     border = T.feBorder }
  else if (isWindow) { bg = T.amberLight; border = T.amberBorder }

  return { bg, border: isToday ? T.text : border, isToday, isSel, isRaceDay, hasF1, hasFE, isWindow, f1, fe }
}

// ── Calendar cell ─────────────────────────────────────────
function Cell({ dateStr, isCurrent, selected, today, showF1, showFE, onClick }) {
  const day = parseInt(dateStr.slice(8))
  const s   = cellStyle(dateStr, selected, today, showF1, showFE)

  const numColor = s.isSel ? '#fff'
    : s.isRaceDay ? '#fff'
    : s.hasF1  ? T.f1Dark
    : s.hasFE  ? T.feDark
    : s.isWindow ? T.amber
    : T.text

  const pill = (bg, children) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '1px 5px', borderRadius: 3, background: bg, width: 'fit-content', maxWidth: '100%', overflow: 'hidden' }}>
      {children}
    </div>
  )

  return (
    <div
      onClick={() => isCurrent && onClick(dateStr)}
      style={{
        borderRadius: 7,
        padding: '7px 8px',
        background: s.bg,
        border: s.isToday ? `1.5px solid ${T.text}` : `0.5px solid ${s.border}`,
        display: 'flex', flexDirection: 'column', gap: 4,
        cursor: isCurrent ? 'pointer' : 'default',
        opacity: isCurrent ? 1 : 0.2,
        transition: 'border-color 0.12s',
        minHeight: 0,
      }}
      onMouseEnter={e => { if (isCurrent && !s.isSel) e.currentTarget.style.borderColor = T.borderHover }}
      onMouseLeave={e => { if (isCurrent && !s.isSel) e.currentTarget.style.borderColor = s.isToday ? T.text : s.border }}
    >
      <span style={{ fontSize: 12, fontWeight: s.isToday ? 600 : 400, color: numColor, lineHeight: 1, fontFamily: T.font }}>
        {day}
      </span>

      {/* Event pills — only on current-month cells */}
      {isCurrent && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 'auto' }}>
          {s.hasF1 && s.f1.slice(0, 1).map((e, i) => (
            <div key={i}>
              {pill(
                s.isSel || s.isRaceDay ? 'rgba(255,255,255,0.22)' : T.f1,
                <>
                  <img src="/f1-logo.png" alt="F1" style={{ width: 8, height: 8, objectFit: 'contain', display: 'block' }} />
                  <span style={{ fontSize: 8, color: '#fff', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', fontFamily: T.font }}>
                    {s.isRaceDay ? 'Race day' : `${e.city.slice(0, 3).toUpperCase()}${e.sprint ? ' ⚡' : ''}`}
                  </span>
                </>
              )}
            </div>
          ))}
          {s.hasFE && s.fe.slice(0, 1).map((e, i) => (
            <div key={i}>
              {pill(
                s.isSel ? 'rgba(255,255,255,0.22)' : T.fe,
                <>
                  <img src="/fe-logo.png" alt="FE" style={{ width: 8, height: 8, objectFit: 'contain', display: 'block' }} />
                  <span style={{ fontSize: 8, color: '#fff', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', fontFamily: T.font }}>
                    {e.city.slice(0, 3).toUpperCase()}
                  </span>
                </>
              )}
            </div>
          ))}
          {s.isWindow && (
            <div style={{ width: 7, height: 7, borderRadius: 2, background: T.amber }} />
          )}
        </div>
      )}
    </div>
  )
}

// ── Detail pane ───────────────────────────────────────────
function DetailPane({ selected, today, showF1, showFE, viewYear, viewMonth }) {
  const monthKey = `${viewYear}-${pad2(viewMonth + 1)}`

  // Events on the selected date
  const { f1: selF1, fe: selFE } = selected
    ? eventsOn(selected, showF1, showFE)
    : { f1: [], fe: [] }
  const selEvents = [
    ...selF1.map(e => ({ ...e, series: 'f1' })),
    ...selFE.map(e => ({ ...e, series: 'fe' })),
  ].sort((a, b) => a.date.localeCompare(b.date))
  const outreach = selected ? outreachTarget(selected) : null

  // All events in the current view month
  const monthEvents = useMemo(() => {
    const evts = []
    if (showF1) F1_2026.forEach(e => { if (e.date.startsWith(monthKey)) evts.push({ ...e, series: 'f1' }) })
    if (showFE) FE_S12.forEach(e => { if (e.date.startsWith(monthKey)) evts.push({ ...e, series: 'fe' }) })
    return evts.sort((a, b) => a.date.localeCompare(b.date))
  }, [monthKey, showF1, showFE])

  // Upcoming events across both series
  const upcoming = useMemo(() => {
    const evts = []
    if (showF1) F1_2026.forEach(e => { if (e.date >= today) evts.push({ ...e, series: 'f1' }) })
    if (showFE) FE_S12.forEach(e => { if (e.date >= today) evts.push({ ...e, series: 'fe' }) })
    return evts.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 5)
  }, [today, showF1, showFE])

  const isSelectedToday = selected === today

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: T.surface }}>
      {/* Header */}
      <div style={{ padding: '11px 18px', borderBottom: `0.5px solid ${T.border}`, background: T.bg, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 500, color: T.text, fontFamily: T.font }}>
          {selected ? fmtLong(selected) : 'Select a date'}
        </span>
        {isSelectedToday && (
          <span style={{ fontSize: 9, fontWeight: 600, color: '#1565C0', background: '#E3F2FD', border: '0.5px solid #B5D4F4', padding: '2px 9px', borderRadius: 4, fontFamily: T.font }}>Today</span>
        )}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Selected date — event cards */}
        {selected && selEvents.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {selEvents.map((event, i) => (
              <div key={i} style={{ padding: '12px 14px', borderRadius: 10, background: event.series === 'f1' ? T.f1Light : T.feLight, border: `0.5px solid ${event.series === 'f1' ? T.f1Border : T.feBorder}`, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <SeriesIcon series={event.series} size={36} />
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 14, fontWeight: 500, color: event.series === 'f1' ? T.f1Dark : T.feDark, margin: 0, fontFamily: T.font }}>{event.name}</p>
                  <p style={{ fontSize: 11, color: event.series === 'f1' ? T.f1 : T.fe, margin: '3px 0 0', fontFamily: T.font }}>
                    {event.series === 'f1' ? 'Formula 1' : 'Formula E'} · {event.city}
                    {event.series === 'f1' ? ` · R${event.round}` : ` · S12 R${event.round}`}
                    {event.sprint ? ' · Sprint' : ''}{event.saturday ? ' · Saturday' : ''}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* No event on selected date */}
        {selected && selEvents.length === 0 && (
          <p style={{ fontSize: 12, color: T.textTertiary, fontFamily: T.font }}>No race events on this date.</p>
        )}

        {/* Outreach nudge */}
        {outreach && (
          <div style={{ padding: '12px 14px', borderRadius: 8, background: T.amberLight, border: `0.5px solid ${T.amberBorder}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
              <div style={{ width: 6, height: 6, borderRadius: 1, background: T.amber, flexShrink: 0 }} />
              <p style={{ fontSize: 11, fontWeight: 500, color: T.amber, margin: 0, fontFamily: T.font }}>
                Outreach window · {outreach.name} in {daysUntil(outreach.date, selected)}d
              </p>
            </div>
            <p style={{ fontSize: 11, color: T.textSecondary, margin: 0, lineHeight: 1.5, fontFamily: T.font }}>
              14–21 days before race is peak window for sponsor decisions. Send Haas pipeline follow-ups now.
            </p>
          </div>
        )}

        {/* This month */}
        {monthEvents.length > 0 && (
          <div>
            <p style={{ fontSize: 9, fontWeight: 600, color: T.textTertiary, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10, fontFamily: T.font }}>
              {MONTHS_FULL[viewMonth]} {viewYear}
            </p>
            {monthEvents.map((e, i) => {
              const isPast   = e.end < today
              const isActive = selected && e.date <= selected && e.end >= selected
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: `0.5px solid ${T.border}`, opacity: isPast ? 0.38 : 1 }}>
                  <SeriesIcon series={e.series} size={22} />
                  <span style={{ flex: 1, fontSize: 12, fontWeight: isActive ? 500 : 400, color: T.text, fontFamily: T.font, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {e.name}{e.sprint ? ' ⚡' : ''}
                  </span>
                  <span style={{ fontSize: 10, color: isActive ? (e.series === 'f1' ? T.f1 : T.fe) : T.textTertiary, flexShrink: 0, fontFamily: T.font }}>
                    {isActive ? 'Today' : fmtRange(e.date, e.end)}{isPast ? ' ✓' : ''}
                  </span>
                </div>
              )
            })}
          </div>
        )}

        {/* Next up */}
        {upcoming.length > 0 && (
          <div>
            <p style={{ fontSize: 9, fontWeight: 600, color: T.textTertiary, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10, fontFamily: T.font }}>Next up</p>
            {upcoming.map((e, i) => {
              const days = daysUntil(e.date)
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: `0.5px solid ${T.border}` }}>
                  <SeriesIcon series={e.series} size={28} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 12, fontWeight: 500, color: T.text, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: T.font }}>{e.name}</p>
                    <p style={{ fontSize: 10, color: T.textTertiary, margin: '1px 0 0', fontFamily: T.font }}>
                      {e.city} · {e.series === 'f1' ? `R${e.round}` : `S12 R${e.round}`}{e.sprint ? ' · Sprint' : ''}
                    </p>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 500, color: T.textSecondary, flexShrink: 0, fontFamily: T.font }}>
                    {days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `${days}d`}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Main export ───────────────────────────────────────────
export default function CommercialCalendar() {
  const today    = getNow()
  const todayY   = parseInt(today.slice(0, 4))
  const todayM   = parseInt(today.slice(5, 7)) - 1

  const [viewYear,  setViewYear]  = useState(todayY)
  const [viewMonth, setViewMonth] = useState(todayM)
  const [selected,  setSelected]  = useState(null)
  const [showF1,    setShowF1]    = useState(true)
  const [showFE,    setShowFE]    = useState(true)

  const prevMonth = () => { if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1) } else setViewMonth(m => m - 1) }
  const nextMonth = () => { if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1) } else setViewMonth(m => m + 1) }
  const goToday   = () => { setViewYear(todayY); setViewMonth(todayM) }

  const dim      = daysInMonth(viewYear, viewMonth)
  const firstDay = firstWeekday(viewYear, viewMonth)
  const prevDim  = daysInMonth(viewYear, viewMonth === 0 ? 11 : viewMonth - 1)

  // Build 42-cell grid (Mon-start)
  const cells = []
  for (let i = firstDay - 1; i >= 0; i--) {
    const pm = viewMonth === 0 ? 11 : viewMonth - 1
    const py = viewMonth === 0 ? viewYear - 1 : viewYear
    cells.push({ date: toStr(py, pm, prevDim - i), current: false })
  }
  for (let d = 1; d <= dim; d++) cells.push({ date: toStr(viewYear, viewMonth, d), current: true })
  while (cells.length < 42) {
    const nm = viewMonth === 11 ? 0 : viewMonth + 1
    const ny = viewMonth === 11 ? viewYear + 1 : viewYear
    cells.push({ date: toStr(ny, nm, cells.length - dim - firstDay + 1), current: false })
  }

  // Stats for toggles
  const remF1 = F1_2026.filter(e => e.date >= today).length
  const remFE = FE_S12.filter(e => e.date >= today).length
  const nextEvt = [
    ...(showF1 ? F1_2026 : []),
    ...(showFE ? FE_S12 : []),
  ].filter(e => e.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0]
  const nextD = nextEvt ? daysUntil(nextEvt.date) : null

  const handleClick = (dateStr) => setSelected(s => s === dateStr ? null : dateStr)

  return (
    <div style={{ display: 'flex', height: '100%', fontFamily: T.font, background: T.bg, overflow: 'hidden' }}>

      {/* ── Left: grid (55%) ── */}
      <div style={{ width: '55%', flexShrink: 0, display: 'flex', flexDirection: 'column', borderRight: `0.5px solid ${T.border}`, background: T.bg }}>

        {/* Top nav */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 16px', background: T.surface, borderBottom: `0.5px solid ${T.border}`, flexShrink: 0 }}>
          <button onClick={prevMonth} style={{ width: 28, height: 28, borderRadius: 7, border: `0.5px solid ${T.border}`, background: T.surface, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.textSecondary, cursor: 'pointer' }}>
            <ChevronLeft size={13} />
          </button>
          <span style={{ flex: 1, textAlign: 'center', fontSize: 15, fontWeight: 500, color: T.text, fontFamily: T.font }}>
            {MONTHS_FULL[viewMonth]} {viewYear}
          </span>
          <button onClick={nextMonth} style={{ width: 28, height: 28, borderRadius: 7, border: `0.5px solid ${T.border}`, background: T.surface, display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.textSecondary, cursor: 'pointer' }}>
            <ChevronRight size={13} />
          </button>
          <div style={{ width: '0.5px', height: 16, background: T.border, margin: '0 2px' }} />
          {/* Series toggles */}
          {[
            { id: 'f1', label: 'F1',         on: showF1, set: setShowF1, bg: T.f1, rem: remF1 },
            { id: 'fe', label: 'Formula E',  on: showFE, set: setShowFE, bg: T.fe, rem: remFE },
          ].map(({ id, label, on, set, bg, rem }) => (
            <button key={id} onClick={() => set(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px 4px 7px', borderRadius: 6, border: `0.5px solid ${on ? T.border : T.border}`, background: on ? 'rgba(0,0,0,0.06)' : 'transparent', cursor: 'pointer', transition: 'all 0.15s' }}>
              <img src={id === 'f1' ? '/f1-logo.png' : '/fe-logo.png'} alt={label} style={{ width: 16, height: 16, objectFit: 'contain', display: 'block', flexShrink: 0 }} />
              <span style={{ fontSize: 11, fontWeight: 500, color: T.textSecondary, fontFamily: T.font }}>{label}</span>
              {on && <span style={{ fontSize: 9, color: T.textTertiary, fontFamily: T.font }}>{rem}</span>}
            </button>
          ))}
          <div style={{ width: '0.5px', height: 16, background: T.border, margin: '0 2px' }} />
          <button onClick={goToday} style={{ fontSize: 10, padding: '4px 10px', borderRadius: 6, border: `0.5px solid ${T.border}`, background: T.surface, color: T.textSecondary, cursor: 'pointer', fontFamily: T.font }}>Today</button>
          {/* Next race stat */}
          {nextD !== null && (
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
              <span style={{ fontSize: 14, fontWeight: 500, color: T.text, fontFamily: T.font }}>
                {nextD === 0 ? 'Today' : `${nextD}d`}
              </span>
              <span style={{ fontSize: 9, color: T.textTertiary, fontFamily: T.font }}>next race</span>
            </div>
          )}
        </div>

        {/* Day headers — full names */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', padding: '8px 12px 4px', gap: 3, background: T.surface, borderBottom: `0.5px solid ${T.border}`, flexShrink: 0 }}>
          {DAYS_FULL.map(d => (
            <div key={d} style={{ textAlign: 'center', fontSize: 9, color: T.textTertiary, letterSpacing: '0.02em', fontFamily: T.font }}>{d}</div>
          ))}
        </div>

        {/* Grid — 6 rows, fills remaining height */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gridTemplateRows: 'repeat(6, 1fr)', gap: 3, padding: '8px 12px 12px', flex: 1, minHeight: 0 }}>
          {cells.map((cell, idx) => (
            <Cell key={idx} dateStr={cell.date} isCurrent={cell.current} selected={selected} today={today} showF1={showF1} showFE={showFE} onClick={handleClick} />
          ))}
        </div>

        {/* Legend */}
        <div style={{ display: 'flex', gap: 14, padding: '8px 16px', borderTop: `0.5px solid ${T.border}`, background: T.surface, flexShrink: 0 }}>
          {[
            { bg: T.f1,    label: 'F1 weekend' },
            { bg: T.fe,    label: 'Formula E' },
            { bg: T.amber, label: 'Outreach window' },
          ].map(({ bg, label }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 8, height: 8, borderRadius: 2, background: bg }} />
              <span style={{ fontSize: 9, color: T.textTertiary, fontFamily: T.font }}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Right: detail (45%) ── */}
      <DetailPane
        selected={selected}
        today={today}
        showF1={showF1}
        showFE={showFE}
        viewYear={viewYear}
        viewMonth={viewMonth}
      />
    </div>
  )
}
