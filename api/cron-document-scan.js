// api/cron-document-scan.js — Weekly re-scan of documents with outdated analysis
// Schedule: Sunday 6am UTC via Vercel cron

const CURRENT_SCAN_VERSION = 1
const MAX_RESCAN_PER_RUN = 5

export default async function handler(req, res) {
  const SB = process.env.VITE_SUPABASE_URL
  const SK = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
  if (!SB || !SK) return res.status(500).json({ error: 'Supabase not configured' })
  const h = { apikey: SK, Authorization: `Bearer ${SK}`, 'Content-Type': 'application/json' }

  try {
    // Find documents needing re-scan: outdated version OR not scanned in 30+ days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const url = `${SB}/rest/v1/documents?or=(scan_version.lt.${CURRENT_SCAN_VERSION},last_scanned_at.lt.${thirtyDaysAgo},last_scanned_at.is.null)&scan_status=neq.scanning&select=id,name,scan_version,last_scanned_at&limit=${MAX_RESCAN_PER_RUN}&order=last_scanned_at.asc.nullsfirst`
    const docsRes = await fetch(url, { headers: h })
    const docs = await docsRes.json()

    if (!Array.isArray(docs) || docs.length === 0) {
      console.log('[DocScan] No documents need re-scanning')
      return res.status(200).json({ scanned: 0, message: 'All documents up to date' })
    }

    console.log(`[DocScan] Found ${docs.length} documents to re-scan`)
    const results = []

    for (const doc of docs) {
      try {
        console.log(`[DocScan] Re-scanning: ${doc.name} (v${doc.scan_version})`)
        const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://vela-platform-one.vercel.app'
        const scanRes = await fetch(`${baseUrl}/api/documents`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'rescan', documentId: doc.id }),
        })
        const scanData = await scanRes.json()
        results.push({ id: doc.id, name: doc.name, success: scanRes.ok, team: scanData.links?.linked_team })
        console.log(`[DocScan] ${doc.name}: ${scanRes.ok ? 'OK' : 'FAILED'}`)
      } catch (err) {
        results.push({ id: doc.id, name: doc.name, success: false, error: err.message })
        console.error(`[DocScan] ${doc.name} error:`, err.message)
      }
    }

    return res.status(200).json({ scanned: results.length, results })
  } catch (err) {
    console.error('[DocScan] Cron error:', err.message)
    return res.status(500).json({ error: err.message })
  }
}
