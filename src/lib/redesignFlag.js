// src/lib/redesignFlag.js
// Single feature flag controlling the Legora redesign.
// Toggle via the floating button (bottom-left) or by setting localStorage.kiko_redesign = '1' / '0'.
// When OFF, the platform renders exactly as the old version did (top nav, page headers, all original styling).
// When ON, the new Legora chrome is active.

const STORAGE_KEY = 'kiko_redesign'

export function isRedesignOn() {
  if (typeof window === 'undefined') return false
  return localStorage.getItem(STORAGE_KEY) === '1'
}

export function setRedesignOn(on) {
  localStorage.setItem(STORAGE_KEY, on ? '1' : '0')
  window.location.reload()
}

// React hook
import { useEffect, useState } from 'react'
export function useRedesignFlag() {
  const [on, setOn] = useState(isRedesignOn())
  useEffect(() => {
    const handler = () => setOn(isRedesignOn())
    window.addEventListener('storage', handler)
    return () => window.removeEventListener('storage', handler)
  }, [])
  return on
}
