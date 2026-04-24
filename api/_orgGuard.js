// api/_orgGuard.js — Super admin guard for admin endpoints
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

export async function requireSuperAdmin(req, res) {
  const authHeader = req.headers.authorization
  if (!authHeader) return { error: 'No auth token', user: null }
  const token = authHeader.replace('Bearer ', '')
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) return { error: 'Invalid token', user: null }
  const { data: config } = await supabase.from('kiko_user_config').select('role').eq('user_id', user.id).single()
  if (config?.role !== 'super_admin') return { error: 'Not super admin', user: null }
  return { error: null, user }
}
