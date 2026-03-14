import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') return res.status(405).json({ error: 'POST or GET' })
  const action = req.body?.action || req.query?.action || 'get'

  if (action === 'get') {
    const { data } = await supabase.from('kiko_alerts')
      .select('*')
      .eq('dismissed', false)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(10)
    return res.json({ alerts: data || [] })
  }

  if (action === 'dismiss') {
    const { id } = req.body
    if (!id) return res.status(400).json({ error: 'Provide alert id' })
    await supabase.from('kiko_alerts').update({ dismissed: true }).eq('id', id)
    return res.json({ dismissed: true })
  }


  if (action === 'scan') {
    try {
      // Clear expired alerts
      await supabase.from('kiko_alerts').delete().lt('expires_at', new Date().toISOString())

      const alerts = []
      const now = new Date()

      // 1. Stale deals (>30 days no activity, not closed)
      const { data: deals } = await supabase.from('deals').select('id, data')
      const staleDeals = (deals || []).filter(d => {
        const stage = d.data?.stage
        if (stage === 'Closed Won' || stage === 'Closed Lost') return false
        const last = d.data?.lastActivity ? new Date(d.data.lastActivity) : null
        if (!last) return true
        return (now - last) / 86400000 > 30
      })

      if (staleDeals.length > 0) {
        // Top 5 most stale
        const sorted = staleDeals.sort((a, b) => {
          const aD = a.data?.lastActivity ? new Date(a.data.lastActivity) : new Date(0)
          const bD = b.data?.lastActivity ? new Date(b.data.lastActivity) : new Date(0)
          return aD - bD
        }).slice(0, 5)

        for (const d of sorted) {
          const days = d.data?.lastActivity
            ? Math.floor((now - new Date(d.data.lastActivity)) / 86400000)
            : 999
          alerts.push({
            type: 'stale_deal',
            severity: days > 90 ? 'high' : 'medium',
            title: `${d.data?.company || d.data?.title} — ${days}d inactive`,
            detail: `${d.data?.pipeline || '?'} → ${d.data?.stage || '?'}. Contact: ${d.data?.contactName || '—'}. Last activity: ${d.data?.lastActivity ? new Date(d.data.lastActivity).toLocaleDateString('en-GB') : 'Never'}.`,
            entity_type: 'deal',
            entity_id: d.id,
            entity_name: d.data?.company || d.data?.title,
          })
        }
      }


      // 2. Pipeline bottleneck (too many deals stuck at one stage)
      const stageCounts = {}
      ;(deals || []).filter(d => d.data?.stage !== 'Closed Won' && d.data?.stage !== 'Closed Lost')
        .forEach(d => { const s = d.data?.stage || 'Unknown'; stageCounts[s] = (stageCounts[s] || 0) + 1 })
      const bottleneck = Object.entries(stageCounts).sort((a, b) => b[1] - a[1])[0]
      if (bottleneck && bottleneck[1] > 10) {
        alerts.push({
          type: 'pipeline_bottleneck',
          severity: 'medium',
          title: `${bottleneck[1]} deals stuck at "${bottleneck[0]}"`,
          detail: `Pipeline bottleneck detected. ${bottleneck[1]} active deals concentrated at ${bottleneck[0]} stage. Review and advance or disqualify.`,
          entity_type: 'pipeline',
          entity_name: bottleneck[0],
        })
      }

      // 3. Data quality — contacts with deals but missing email
      const { count: noEmailDeals } = await supabase.from('contacts')
        .select('id', { count: 'exact', head: true })
        .or('data->>email.is.null,data->>email.eq.')
        .not('data->>company', 'is', null)
      if (noEmailDeals > 100) {
        alerts.push({
          type: 'data_quality',
          severity: 'low',
          title: `${noEmailDeals} contacts missing email addresses`,
          detail: `These contacts have names and companies but no email — limiting outreach capability. Consider running email enrichment.`,
          entity_type: 'contacts',
        })
      }

      // Insert new alerts (avoid duplicates by checking type+entity in last 24h)
      for (const alert of alerts) {
        const { count } = await supabase.from('kiko_alerts')
          .select('id', { count: 'exact', head: true })
          .eq('type', alert.type)
          .eq('entity_name', alert.entity_name || '')
          .gt('created_at', new Date(now - 86400000).toISOString())
        if (!count || count === 0) {
          await supabase.from('kiko_alerts').insert(alert)
        }
      }

      return res.json({ scanned: true, alertsGenerated: alerts.length, staleDealCount: staleDeals.length })
    } catch(e) { return res.status(500).json({ error: e.message }) }
  }

  return res.status(400).json({ error: 'Use "get", "dismiss", or "scan"' })
}
