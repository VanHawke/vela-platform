// CommercialCalendar.jsx — F1 & Formula E race calendar with outreach windows
import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { ChevronLeft, ChevronRight, Flag, Zap } from 'lucide-react'

const T = {
  text: '#1A1A1A', textSecondary: '#6B6B6B', textTertiary: '#ABABAB',
  border: 'rgba(0,0,0,0.06)', bg: '#FAFAFA', surface: '#FFFFFF',
  font: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif",
  f1Red: '#E10600', feBlue: '#0066CC', gold: '#B86000',
}

const F1_2026 = [
  { round: 1,  name: 'Australian GP',        city: 'Melbourne',   date: '2026-03-14', end: '2026-03-16' },
  { round: 2,  name: 'Chinese GP',           city: 'Shanghai',    date: '2026-03-21', end: '2026-03-23', sprint: true },
  { round: 3,  name: 'Japanese GP',          city: 'Suzuka',      date: '2026-04-04', end: '2026-04-06' },
  { round: 4,  name: 'Bahrain GP',           city: 'Sakhir',      date: '2026-04-18', end: '2026-04-20' },
  { round: 5,  name: 'Saudi Arabian GP',     city: 'Jeddah',      date: '2026-04-25', end: '2026-04-27' },
  { round: 6,  name: 'Miami GP',             city: 'Miami',       date: '2026-05-02', end: '2026-05-04', sprint: true },
  { round: 7,  name: 'Emilia Romagna GP',    city: 'Imola',       date: '2026-05-16', end: '2026-05-18' },
  { round: 8,  name: 'Monaco GP',            city: 'Monte Carlo', date: '2026-05-23', end: '2026-05-25' },
  { round: 9,  name: 'Canadian GP',          city: 'Montréal',    date: '2026-06-13', end: '2026-06-15' },
  { round: 10, name: 'Spanish GP',           city: 'Barcelona',   date: '2026-06-27', end: '2026-06-29' },
  { round: 11, name: 'Austrian GP',          city: 'Spielberg',   date: '2026-07-04', end: '2026-07-06', sprint: true },
  { round: 12, name: 'British GP',           city: 'Silverstone', date: '2026-07-18', end: '2026-07-20' },
  { round: 13, name: 'Belgian GP',           city: 'Spa',         date: '2026-07-25', end: '2026-07-27' },
  { round: 14, name: 'Hungarian GP',         city: 'Budapest',    date: '2026-08-01', end: '2026-08-03' },
  { round: 15, name: 'Dutch GP',             city: 'Zandvoort',   date: '2026-08-29', end: '2026-08-31' },
  { round: 16, name: 'Italian GP',           city: 'Monza',       date: '2026-09-05', end: '2026-09-07' },
  { round: 17, name: 'Azerbaijan GP',        city: 'Baku',        date: '2026-09-19', end: '2026-09-21', sprint: true },
  { round: 18, name: 'Singapore GP',         city: 'Singapore',   date: '2026-10-03', end: '2026-10-05' },
  { round: 19, name: 'United States GP',     city: 'Austin',      date: '2026-10-17', end: '2026-10-19', sprint: true },
  { round: 20, name: 'Mexico City GP',       city: 'Mexico City', date: '2026-10-31', end: '2026-11-02' },
  { round: 21, name: 'São Paulo GP',         city: 'São Paulo',   date: '2026-11-07', end: '2026-11-09', sprint: true },
  { round: 22, name: 'Las Vegas GP',         city: 'Las Vegas',   date: '2026-11-20', end: '2026-11-22' },
  { round: 23, name: 'Qatar GP',             city: 'Lusail',      date: '2026-11-28', end: '2026-11-30', sprint: true },
  { round: 24, name: 'Abu Dhabi GP',         city: 'Abu Dhabi',   date: '2026-12-05', end: '2026-12-07' },
]

const FE_S12 = [
  { round: 1,  name: 'São Paulo E-Prix',     city: 'São Paulo',   date: '2025-12-06', end: '2025-12-06' },
  { round: 2,  name: 'Mexico City E-Prix',   city: 'Mexico City', date: '2026-01-10', end: '2026-01-10' },
  { round: 3,  name: 'Miami E-Prix',         city: 'Miami',       date: '2026-01-31', end: '2026-01-31' },
  { round: 4,  name: 'Jeddah E-Prix 1',      city: 'Jeddah',      date: '2026-02-14', end: '2026-02-14' },
  { round: 5,  name: 'Jeddah E-Prix 2',      city: 'Jeddah',      date: '2026-02-15', end: '2026-02-15' },
  { round: 6,  name: 'Madrid E-Prix',        city: 'Madrid',      date: '2026-03-15', end: '2026-03-15' },
  { round: 7,  name: 'Berlin E-Prix 1',      city: 'Berlin',      date: '2026-04-25', end: '2026-04-25' },
  { round: 8,  name: 'Berlin E-Prix 2',      city: 'Berlin',      date: '2026-04-26', end: '2026-04-26' },
  { round: 9,  name: 'Monaco E-Prix 1',      city: 'Monaco',      date: '2026-05-09', end: '2026-05-09' },
  { round: 10, name: 'Monaco E-Prix 2',      city: 'Monaco',      date: '2026-05-10', end: '2026-05-10' },
  { round: 11, name: 'Sanya E-Prix',         city: 'Sanya',       date: '2026-05-30', end: '2026-05-30' },
  { round: 12, name: 'Shanghai E-Prix 1',    city: 'Shanghai',    date: '2026-06-13', end: '2026-06-13' },
  { round: 13, name: 'Shanghai E-Prix 2',    city: 'Shanghai',    date: '2026-06-14', end: '2026-06-14' },
  { round: 14, name: 'Tokyo E-Prix 1',       city: 'Tokyo',       date: '2026-07-11', end: '2026-07-11' },
  { round: 15, name: 'Tokyo E-Prix 2',       city: 'Tokyo',       date: '2026-07-12', end: '2026-07-12' },
  { round: 16, name: 'London E-Prix 1',      city: 'London',      date: '2026-08-15', end: '2026-08-15' },
  { round: 17, name: 'London E-Prix 2',      city: 'London',      date: '2026-08-16', end: '2026-08-16' },
]

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December']
const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']

function getEventsForDate(dateStr) {
  const f1 = F1_2026.filter(e => dateStr >= e.date && dateStr <= e.end)
  const fe = FE_S12.filter(e => dateStr >= e.date && dateStr <= e.end)
  return { f1, fe }
}

function isOutreachWindow(dateStr) {
  // 3 weeks before any race weekend = ideal send window
  const d = new Date(dateStr)
  return F1_2026.some(e => {
    const race = new Date(e.date)
    const diff = (race - d) / (1000 * 60 * 60 * 24)
    return diff >= 14 && diff <= 21
  })
}

function getDaysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate()
}

function getFirstDayOfMonth(year, month) {
  let d = new Date(year, month, 1).getDay()
  return d === 0 ? 6 : d - 1 // Mon=0
}

function pad(n) { return String(n).padStart(2, '0') }
function toDateStr(year, month, day) { return `${year}-${pad(month + 1)}-${pad(day)}` }

export default function CommercialCalendar({ user }) {
  const today = new Date()
  const [viewYear, setViewYear] = useState(2026)
  const [viewMonth, setViewMonth] = useState(today.getFullYear() === 2026 ? today.getMonth() : 2) // Default March 2026
  const [selectedDate, setSelectedDate] = useState(null)
  const [deals, setDeals] = useState([])
  const [showF1, setShowF1] = useState(true)
  const [showFE, setShowFE] = useState(true)
  const [showWindows, setShowWindows] = useState(true)

  useEffect(() => {
    const orgId = user?.app_metadata?.org_id
    if (!orgId) return
    supabase.from('deals').select('id, data, updated_at')
      .then(({ data }) => setDeals((data || []).map(r => ({ ...r.data, _id: r.id }))))
  }, [user])

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1) }
    else setViewMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1) }
    else setViewMonth(m => m + 1)
  }
  const goToday = () => { setViewYear(today.getFullYear()); setViewMonth(today.getMonth()) }

  const daysInMonth = getDaysInMonth(viewYear, viewMonth)
  const firstDay = getFirstDayOfMonth(viewYear, viewMonth)
  const todayStr = toDateStr(today.getFullYear(), today.getMonth(), today.getDate())

  // Build calendar grid (6 weeks × 7 days)
  const cells = []
  const prevDays = getDaysInMonth(viewYear, viewMonth === 0 ? 11 : viewMonth - 1)
  for (let i = firstDay - 1; i >= 0; i--) cells.push({ day: prevDays - i, cur: false })
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, cur: true })
  while (cells.length < 42) cells.push({ day: cells.length - daysInMonth - firstDay + 1, cur: false })

  // Selected date events
  const selectedEvents = selectedDate ? getEventsForDate(selectedDate) : null
  const selectedDeals = selectedDate
    ? deals.filter(d => d.next_followup && d.next_followup.startsWith(selectedDate))
    : []

  // Upcoming races (next 4)
  const upcoming = [...F1_2026, ...FE_S12]
    .filter(e => e.date >= todayStr)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 5)

  return (
    <div style={{ display: 'flex', height: '100%', fontFamily: T.font, background: T.bg, overflow: 'hidden' }}>

      {/* ── Left: calendar ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '16px 20px', minWidth: 0, overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexShrink: 0 }}>
          <button onClick={prevMonth} style={{ width: 28, height: 28, borderRadius: 7, border: `1px solid ${T.border}`, background: T.surface, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.textSecondary }}>
            <ChevronLeft size={14} />
          </button>
          <h2 style={{ fontSize: 16, fontWeight: 500, color: T.text, minWidth: 180, textAlign: 'center' }}>
            {MONTHS[viewMonth]} {viewYear}
          </h2>
          <button onClick={nextMonth} style={{ width: 28, height: 28, borderRadius: 7, border: `1px solid ${T.border}`, background: T.surface, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: T.textSecondary }}>
            <ChevronRight size={14} />
          </button>
          <button onClick={goToday} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface, cursor: 'pointer', color: T.textSecondary, marginLeft: 4 }}>
            Today
          </button>
          <div style={{ flex: 1 }} />
          {/* Legend toggles */}
          {[
            { id: 'f1', label: 'F1', color: T.f1Red, val: showF1, set: setShowF1 },
            { id: 'fe', label: 'Formula E', color: T.feBlue, val: showFE, set: setShowFE },
            { id: 'win', label: 'Outreach windows', color: T.gold, val: showWindows, set: setShowWindows },
          ].map(({ id, label, color, val, set }) => (
            <button key={id} onClick={() => set(v => !v)} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, padding: '3px 8px', borderRadius: 6, border: `1px solid ${val ? color + '50' : T.border}`, background: val ? color + '10' : 'transparent', color: val ? color : T.textTertiary, cursor: 'pointer', transition: 'all 0.15s' }}>
              <div style={{ width: 7, height: 7, borderRadius: 2, background: val ? color : T.textTertiary }} />
              {label}
            </button>
          ))}
        </div>

        {/* Day headers */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 4, flexShrink: 0 }}>
          {DAYS.map(d => (
            <div key={d} style={{ textAlign: 'center', fontSize: 10, fontWeight: 500, color: T.textTertiary, padding: '4px 0', letterSpacing: '0.04em', textTransform: 'uppercase' }}>{d}</div>
          ))}
        </div>

        {/* Calendar grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gridTemplateRows: 'repeat(6, 1fr)', flex: 1, gap: 2, minHeight: 0 }}>
          {cells.map((cell, idx) => {
            const dateStr = cell.cur ? toDateStr(viewYear, viewMonth, cell.day) : null
            const { f1: cellF1, fe: cellFE } = dateStr ? getEventsForDate(dateStr) : { f1: [], fe: [] }
            const isWindow = showWindows && dateStr && isOutreachWindow(dateStr)
            const isToday = dateStr === todayStr
            const isSelected = dateStr === selectedDate
            const hasF1 = showF1 && cellF1.length > 0
            const hasFE = showFE && cellFE.length > 0
            const isRaceDay = dateStr && [...F1_2026, ...FE_S12].some(e => e.end === dateStr)

            return (
              <div key={idx} onClick={() => cell.cur && setSelectedDate(dateStr === selectedDate ? null : dateStr)}
                style={{
                  borderRadius: 8, padding: '6px 8px',
                  background: isSelected ? T.text : hasF1 ? T.f1Red + '12' : hasFE ? T.feBlue + '10' : isWindow ? T.gold + '08' : T.surface,
                  border: `1px solid ${isSelected ? T.text : isToday ? T.text : hasF1 ? T.f1Red + '40' : hasFE ? T.feBlue + '30' : isWindow ? T.gold + '30' : T.border}`,
                  cursor: cell.cur ? 'pointer' : 'default',
                  opacity: cell.cur ? 1 : 0.25,
                  display: 'flex', flexDirection: 'column', gap: 2, minHeight: 0,
                  transition: 'all 0.1s',
                }}>
                <span style={{
                  fontSize: 12, fontWeight: isToday || isSelected ? 600 : 400,
                  color: isSelected ? '#fff' : isToday ? T.text : cell.cur ? T.text : T.textTertiary,
                  lineHeight: 1,
                }}>
                  {cell.day}
                </span>
                {/* Event pills */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 1, flex: 1, minHeight: 0, overflow: 'hidden' }}>
                  {showF1 && cellF1.slice(0, 2).map((e, i) => (
                    <div key={i} style={{ fontSize: 9, lineHeight: 1.2, padding: '1px 4px', borderRadius: 3, background: isSelected ? 'rgba(255,255,255,0.2)' : T.f1Red, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 2 }}>
                      <Flag size={7} style={{ flexShrink: 0 }} />
                      {isRaceDay && e.end === dateStr ? e.city : e.name.replace(' GP', '').replace(' Grand Prix', '')}
                    </div>
                  ))}
                  {showFE && cellFE.slice(0, 1).map((e, i) => (
                    <div key={i} style={{ fontSize: 9, lineHeight: 1.2, padding: '1px 4px', borderRadius: 3, background: isSelected ? 'rgba(255,255,255,0.2)' : T.feBlue, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 2 }}>
                      <Zap size={7} style={{ flexShrink: 0 }} />
                      {e.city}
                    </div>
                  ))}
                  {isWindow && !hasF1 && !hasFE && (
                    <div style={{ fontSize: 9, color: T.gold, lineHeight: 1.2 }}>Outreach</div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Right: sidebar ── */}
      <div style={{ width: 280, flexShrink: 0, borderLeft: `1px solid ${T.border}`, display: 'flex', flexDirection: 'column', overflowY: 'auto', background: T.surface }}>

        {/* Selected date detail */}
        {selectedDate && (
          <div style={{ padding: '16px 16px 12px', borderBottom: `1px solid ${T.border}` }}>
            <p style={{ fontSize: 12, fontWeight: 500, color: T.text, marginBottom: 10 }}>
              {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
            {selectedEvents?.f1.length > 0 && selectedEvents.f1.map((e, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 8, padding: '8px 10px', borderRadius: 8, background: T.f1Red + '10', border: `1px solid ${T.f1Red}30` }}>
                <Flag size={14} color={T.f1Red} style={{ flexShrink: 0, marginTop: 1 }} />
                <div>
                  <p style={{ fontSize: 12, fontWeight: 500, color: T.f1Red, margin: 0 }}>R{e.round} — {e.name}</p>
                  <p style={{ fontSize: 10, color: T.textSecondary, margin: '2px 0 0' }}>{e.city}{e.sprint ? ' · Sprint' : ''}</p>
                </div>
              </div>
            ))}
            {selectedEvents?.fe.length > 0 && selectedEvents.fe.map((e, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 8, padding: '8px 10px', borderRadius: 8, background: T.feBlue + '10', border: `1px solid ${T.feBlue}30` }}>
                <Zap size={14} color={T.feBlue} style={{ flexShrink: 0, marginTop: 1 }} />
                <div>
                  <p style={{ fontSize: 12, fontWeight: 500, color: T.feBlue, margin: 0 }}>{e.name}</p>
                  <p style={{ fontSize: 10, color: T.textSecondary, margin: '2px 0 0' }}>Formula E S12 · {e.city}</p>
                </div>
              </div>
            ))}
            {isOutreachWindow(selectedDate) && (
              <div style={{ padding: '8px 10px', borderRadius: 8, background: T.gold + '10', border: `1px solid ${T.gold}40` }}>
                <p style={{ fontSize: 11, fontWeight: 500, color: T.gold, margin: 0 }}>Outreach window</p>
                <p style={{ fontSize: 10, color: T.textSecondary, margin: '2px 0 0' }}>14–21 days before a race — prime window for sponsor outreach</p>
              </div>
            )}
            {selectedEvents?.f1.length === 0 && selectedEvents?.fe.length === 0 && !isOutreachWindow(selectedDate) && (
              <p style={{ fontSize: 11, color: T.textTertiary }}>No race events</p>
            )}
          </div>
        )}

        {/* Upcoming races */}
        <div style={{ padding: '14px 16px' }}>
          <p style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: T.textTertiary, marginBottom: 10 }}>Upcoming</p>
          {upcoming.map((e, i) => {
            const isF1 = !e.name.includes('E-Prix')
            const daysTo = Math.ceil((new Date(e.date) - new Date(todayStr)) / 86400000)
            return (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 10, cursor: 'pointer' }}
                onClick={() => { setViewYear(parseInt(e.date.slice(0,4))); setViewMonth(parseInt(e.date.slice(5,7))-1); setSelectedDate(e.date) }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: isF1 ? T.f1Red + '12' : T.feBlue + '10', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {isF1 ? <Flag size={14} color={T.f1Red} /> : <Zap size={14} color={T.feBlue} />}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 12, fontWeight: 500, color: T.text, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.name}</p>
                  <p style={{ fontSize: 10, color: T.textTertiary, margin: '1px 0 0' }}>
                    {new Date(e.date + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} · {daysTo === 0 ? 'Today' : daysTo === 1 ? 'Tomorrow' : `${daysTo}d`}
                  </p>
                </div>
              </div>
            )
          })}
        </div>

        {/* Season stats */}
        <div style={{ padding: '0 16px 16px', marginTop: 'auto', borderTop: `1px solid ${T.border}`, paddingTop: 14 }}>
          <p style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: T.textTertiary, marginBottom: 8 }}>2026 Season</p>
          {[
            { label: 'F1 rounds', val: F1_2026.length, color: T.f1Red },
            { label: 'Sprint weekends', val: F1_2026.filter(e=>e.sprint).length, color: T.f1Red },
            { label: 'Formula E rounds', val: FE_S12.length, color: T.feBlue },
          ].map(({ label, val, color }) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
              <span style={{ fontSize: 11, color: T.textSecondary }}>{label}</span>
              <span style={{ fontSize: 13, fontWeight: 500, color }}>{val}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
