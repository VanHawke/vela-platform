import { createClient } from '@supabase/supabase-js'
import { requireSuperAdmin } from '../_orgGuard.js'

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const guard = await requireSuperAdmin(req)
  if (guard.error) return res.status(guard.status).json({ error: guard.error })

  if (req.method === 'GET') {
    const { data } = await supabase.from('organisations').select('*').order('created_at')
    return res.json(data || [])
  }

  if (req.method === 'POST') {
    const { name, slug, plan = 'pro', modules, branding } = req.body
    if (!name || !slug) return res.status(400).json({ error: 'name and slug required' })
    const { data, error } = await supabase.from('organisations')
      .insert({ name, slug, plan, ...(modules && { modules }), ...(branding && { branding }) })
      .select().single()
    if (error) return res.status(500).json({ error: error.message })
    return res.status(201).json(data)
  }

  if (req.method === 'PATCH') {
    const { id, ...updates } = req.body
    if (!id) return res.status(400).json({ error: 'id required' })
    const { data, error } = await supabase.from('organisations')
      .update(updates).eq('id', id).select().single()
    if (error) return res.status(500).json({ error: error.message })
    return res.json(data)
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
