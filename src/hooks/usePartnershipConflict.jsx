// usePartnershipConflict.js — Hook to check f1_partnerships for conflicts
// Used by Pipeline deal cards and Records detail views
// Checks if a company already sponsors a competitor in the same category

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

// Cache partnerships in memory to avoid re-fetching on every deal card render
let partnershipCache = null
let cacheTimestamp = 0
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

async function loadPartnerships() {
  const now = Date.now()
  if (partnershipCache && (now - cacheTimestamp) < CACHE_TTL) {
    return partnershipCache
  }
  const { data } = await supabase
    .from('f1_partnerships')
    .select('team, category, partner, status')
  partnershipCache = data || []
  cacheTimestamp = now
  return partnershipCache
}

export function usePartnershipConflict(companyName) {
  const [conflict, setConflict] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!companyName) { setLoading(false); return }
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const partnerships = await loadPartnerships()
      if (cancelled) return

      // Check if company name appears as a partner anywhere
      const matches = partnerships.filter(p =>
        p.partner && companyName &&
        p.partner.toLowerCase().includes(companyName.toLowerCase())
      )

      if (matches.length > 0) {
        setConflict({
          exists: true,
          partnerships: matches.map(m => ({
            team: m.team,
            category: m.category,
            status: m.status,
          })),
          summary: matches.map(m => `${m.category} at ${m.team}`).join(', '),
        })
      } else {
        setConflict({ exists: false, partnerships: [], summary: '' })
      }
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [companyName])

  return { conflict, loading }
}

// Batch version — check multiple companies at once
export function usePartnershipConflicts(companyNames) {
  const [conflicts, setConflicts] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!companyNames?.length) { setLoading(false); return }
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const partnerships = await loadPartnerships()
      if (cancelled) return

      const result = {}
      companyNames.forEach(name => {
        if (!name) return
        const matches = partnerships.filter(p =>
          p.partner && p.partner.toLowerCase().includes(name.toLowerCase())
        )
        result[name] = matches.length > 0
          ? { exists: true, summary: matches.map(m => `${m.category} at ${m.team}`).join(', ') }
          : { exists: false, summary: '' }
      })
      setConflicts(result)
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [companyNames?.join(',')])

  return { conflicts, loading }
}

// Inline conflict badge component
export function ConflictBadge({ companyName }) {
  const { conflict, loading } = usePartnershipConflict(companyName)
  if (loading || !conflict?.exists) return null
  return (
    <span title={conflict.summary} style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      fontSize: 9, fontWeight: 600, padding: '1px 6px',
      borderRadius: 4, background: 'rgba(184,100,62,0.10)',
      color: '#B8643E', border: '1px solid rgba(184,100,62,0.20)',
      textTransform: 'uppercase', letterSpacing: '0.04em',
      cursor: 'help', whiteSpace: 'nowrap',
    }}>
      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
      </svg>
      CONFLICT
    </span>
  )
}
