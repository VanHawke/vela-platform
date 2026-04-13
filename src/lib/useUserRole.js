// src/lib/useUserRole.js — Hook: resolve current user's org role
// Returns { role, loading, isAdmin, isSuperAdmin, canExport }
import { useState, useEffect } from 'react'

let cachedRole = null
let cacheUserId = null

export function useUserRole(user) {
  const [role, setRole] = useState(cachedRole)
  const [loading, setLoading] = useState(!cachedRole)

  useEffect(() => {
    if (!user?.id) return
    if (cacheUserId === user.id && cachedRole) { setRole(cachedRole); setLoading(false); return }

    setLoading(true)
    fetch(`/api/team-list?user_id=${user.id}`)
      .then(r => r.json())
      .then(d => {
        const r = d.role || 'user'
        cachedRole = r
        cacheUserId = user.id
        setRole(r)
      })
      .catch(() => setRole('user'))
      .finally(() => setLoading(false))
  }, [user?.id])

  return {
    role: role || 'user',
    loading,
    isAdmin: role === 'admin' || role === 'super_admin',
    isSuperAdmin: role === 'super_admin',
    canExport: role === 'admin' || role === 'super_admin',
  }
}
