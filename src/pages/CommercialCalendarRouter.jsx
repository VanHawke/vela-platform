// CommercialCalendarRouter.jsx
// Picks between OLD CommercialCalendar and NEW CommercialCalendarLegora based on redesign flag.

import { lazy, Suspense } from 'react'
import { useRedesignFlag } from '@/lib/redesignFlag'

const Old = lazy(() => import('./CommercialCalendar'))
const New = lazy(() => import('./CommercialCalendarLegora'))

export default function CommercialCalendarRouter(props) {
  const on = useRedesignFlag()
  return (
    <Suspense fallback={<div style={{ padding: 40, color: '#6B6B6B' }}>Loading…</div>}>
      {on ? <New {...props} /> : <Old {...props} />}
    </Suspense>
  )
}
