import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

export async function orgGuard(req, requiredModule = null) {
  const token = (req.headers.authorization || '').replace('Bearer ', '')
  if (!token) return { error: 'Unauthorised', status: 401 }

  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) return { error: 'Unauthorised', status: 401 }

  const orgId = user.app_metadata?.org_id
  if (!orgId) return { error: 'No org assigned', status: 403 }

  if (requiredModule) {
    const { data: org } = await supabase.from('organisations').select('modules, is_active').eq('id', orgId).single()
    if (!org?.is_active) return { error: 'Organisation inactive', status: 403 }
    if (!org?.modules?.[requiredModule]) return { error: `Module '${requiredModule}' not enabled`, status: 403 }
  }

  return { orgId, userId: user.id, role: user.app_metadata?.role }
}

export async function requireSuperAdmin(req) {
  const guard = await orgGuard(req, null)
  if (guard.error) return guard
  if (guard.role !== 'super_admin') return { error: 'Super admin only', status: 403 }
  return guard
}
