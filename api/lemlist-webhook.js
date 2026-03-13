import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  // Lemlist sends GET for verification, POST for events
  if (req.method === 'GET') return res.status(200).json({ ok: true })
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const event = req.body
  if (!event) return res.status(400).json({ error: 'Empty body' })

  const type = event.type || 'unknown'
  const email = event.email || event.leadEmail || ''
  const now = new Date().toISOString()

  // Skip if no email to match on
  if (!email) return res.status(200).json({ ok: true, skipped: 'no email' })

  try {
    // Find or create the contact in Supabase
    let { data: rows } = await supabase
      .from('contacts')
      .select('id, data')
      .filter('data->>email', 'eq', email)
      .limit(1)

    let contactId
    let contactData

    if (rows && rows.length > 0) {
      // Existing contact — update
      contactId = rows[0].id
      contactData = rows[0].data || {}
    } else {
      // New contact — create from Lemlist event data
      contactId = `lem_${Date.now()}`
      contactData = {
        id: contactId,
        email,
        firstName: event.firstName || event.leadFirstName || '',
        lastName: event.lastName || event.leadLastName || '',
        company: event.companyName || '',
        title: event.jobTitle || '',
        linkedin: event.linkedinUrl || '',
        source: 'Lemlist',
        status: 'Active',
        owner: 'Sunny Sidhu',
        preferredContact: 'Email',
        createdAt: now,
      }
    }

    // Enrich with any new data from the event
    let changed = false
    const vars = {
      firstName: event.firstName || event.leadFirstName,
      lastName: event.lastName || event.leadLastName,
      company: event.companyName,
      title: event.jobTitle,
      linkedin: event.linkedinUrl,
      phone: event.phone,
    }

    for (const [key, val] of Object.entries(vars)) {
      if (val && !contactData[key]) {
        contactData[key] = val
        changed = true
      }
    }

    // Track campaign info
    if (event.campaignName && contactData.lastCampaign !== event.campaignName) {
      contactData.lastCampaign = event.campaignName
      changed = true
    }
    if (event.campaignId && contactData.lemlistCampaignId !== event.campaignId) {
      contactData.lemlistCampaignId = event.campaignId
      changed = true
    }

    // Update last activity
    contactData.lastActivity = now.split('T')[0]

    // Map event types to status updates
    const statusMap = {
      emailsSent: null, // no status change
      emailsOpened: null,
      emailsClicked: null,
      emailsReplied: 'Replied',
      emailsBounced: 'Bounced',
      emailsUnsubscribed: 'Unsubscribed',
      emailsInterested: 'Interested',
      emailsNotInterested: 'Not Interested',
      linkedinReplied: 'Replied',
      linkedinInterested: 'Interested',
      linkedinNotInterested: 'Not Interested',
      manualInterested: 'Interested',
      manualNotInterested: 'Not Interested',
    }

    if (statusMap[type] !== undefined && statusMap[type] !== null) {
      contactData.outreachStatus = statusMap[type]
      changed = true
    }

    // Upsert the contact
    if (rows && rows.length > 0) {
      await supabase.from('contacts').update({
        data: contactData,
        updated_at: now,
      }).eq('id', contactId)
    } else {
      await supabase.from('contacts').insert({
        id: contactId,
        data: contactData,
        updated_at: now,
      })
    }

    // Log the activity
    await supabase.from('contact_activities').insert({
      contact_id: contactId,
      type,
      campaign_name: event.campaignName || null,
      campaign_id: event.campaignId || null,
      sequence_step: event.sequenceStep ?? null,
      email_subject: event.subject || null,
      details: JSON.stringify({
        sendUserEmail: event.sendUserEmail,
        isFirst: event.isFirst,
        leadStatus: event.status,
      }),
      created_at: now,
    })

    return res.status(200).json({ ok: true, type, email, contactId, isNew: !(rows && rows.length > 0) })
  } catch (e) {
    console.error('Lemlist webhook error:', e)
    return res.status(500).json({ error: e.message })
  }
}
