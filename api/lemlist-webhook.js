import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)
const ORG_ID = '35975d96-c2c9-4b6c-b4d4-bb947ae817d5'

export default async function handler(req, res) {
  // Lemlist sends GET for verification, POST for events
  if (req.method === 'GET') return res.status(200).json({ ok: true })
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const event = req.body
  if (!event) return res.status(400).json({ error: 'Empty body' })

  const type = event.type || 'unknown'
  const email = event.email || event.leadEmail || ''
  const now = new Date().toISOString()

  // === INTENT SIGNAL HANDLING ===
  const signalTypes = ['companyIsHiring', 'companyRaisedFunds', 'jobChange', 'newHire', 'companyEmployeeVisitedMyWebsite']
  if (signalTypes.includes(type)) {
    const contact = event.contact || {}
    const company = event.company || {}
    const name = [contact.firstName, contact.lastName].filter(Boolean).join(' ') || contact.email || ''
    const companyName = company.name || event.companyName || ''
    const severity = (type === 'companyRaisedFunds' || type === 'jobChange') ? 'high' : 'medium'
    const labels = { companyIsHiring: '👥 Hiring', companyRaisedFunds: '💰 Fundraising', jobChange: '🔄 Job Change', newHire: '🆕 New Hire', companyEmployeeVisitedMyWebsite: '🌐 Website Visit' }
    const title = `${labels[type] || type}: ${companyName || name}`
    await supabase.from('kiko_alerts').insert({
      type: 'intent_signal', severity, title,
      detail: `${title}. ${contact.jobTitle ? `Role: ${contact.jobTitle}.` : ''} ${name ? `Contact: ${name}.` : ''}`,
      entity_type: 'signal', entity_name: companyName || name,
      action: type === 'companyRaisedFunds' ? 'Budget window — draft outreach' : type === 'jobChange' ? 'Re-engage at new company' : 'Review signal',
      metadata: { signal_type: type, company: companyName, contact: name, email: contact.email, source: 'lemlist_webhook' },
      expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
    })
    if (severity === 'high') {
      await supabase.from('tasks').insert({
        id: `tsig_${Date.now()}`, org_id: ORG_ID, updated_at: now,
        data: { type: type === 'companyRaisedFunds' ? 'Timing Opportunity' : 'Re-engage',
          company: companyName, contact: name, notes: title,
          dueDate: new Date(Date.now() + 2 * 86400000).toISOString().split('T')[0],
          completed: false, createdAt: now, assignedTo: 'Sunny Sidhu', autoCreated: true },
      })
    }
    return res.status(200).json({ ok: true, type: 'signal', signal: type, entity: companyName || name })
  }

  // Skip if no email to match on (campaign events need email)
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

    // Log to universal activities feed
    await supabase.from('activities').insert({
      type: `lemlist_${type}`, entity_name: [contactData.firstName, contactData.lastName].filter(Boolean).join(' ') || email,
      subject: event.subject || event.campaignName || type, status: 'completed', completed_at: now,
      metadata: { campaign: event.campaignName, campaignId: event.campaignId, email, step: event.sequenceStep }
    }).catch(() => {}) // non-blocking

    // === PIPELINE NOTIFICATIONS + AUTO-DEAL CREATION ===
    const name = [contactData.firstName, contactData.lastName].filter(Boolean).join(' ') || email
    const company = contactData.company || event.companyName || ''

    // High-intent events → create "In Dialogue" deal + urgent notification
    const highIntent = ['emailsReplied', 'emailsInterested', 'linkedinReplied', 'linkedinInterested', 'manualInterested']
    if (highIntent.includes(type)) {
      // Check if deal already exists for this contact
      const { data: existingDeals } = await supabase.from('deals')
        .select('id').filter('data->>contactEmail', 'eq', email).limit(1)

      let dealId = existingDeals?.[0]?.id
      if (!dealId) {
        // Auto-create "In Dialogue" deal
        dealId = `lem_deal_${Date.now()}`
        const pipeline = event.campaignName?.includes('Haas') ? 'Haas F1'
          : event.campaignName?.includes('Alpine') ? 'Alpine F1' : 'Haas F1'
        await supabase.from('deals').insert({
          id: dealId,
          org_id: ORG_ID,
          data: {
            title: `${company || name} — Inbound from ${event.campaignName || 'Lemlist'}`,
            stage: 'In Dialogue', pipeline,
            contactEmail: email, contactName: name, company,
            source: 'Lemlist', campaign: event.campaignName || '',
            owner: 'Sunny Sidhu', createdAt: now, lastActivity: now,
          },
          updated_at: now,
        })
      }

      // Create urgent notification
      await supabase.from('pipeline_notifications').insert({
        type: type.includes('Replied') ? 'reply' : 'interested',
        title: `${name} ${type.includes('Replied') ? 'replied' : 'showed interest'}`,
        body: `${name}${company ? ` (${company})` : ''} — ${event.campaignName || 'Campaign'}. Deal moved to In Dialogue.`,
        deal_id: dealId, contact_id: contactId, contact_name: name, company_name: company,
        pipeline: 'Haas F1', stage: 'In Dialogue',
        source: 'lemlist', campaign_name: event.campaignName || null,
        priority: 'high', metadata: { eventType: type, email },
      })
    }

    // Medium-intent events → notification only (no deal)
    const mediumIntent = ['emailsClicked', 'emailsOpened']
    if (mediumIntent.includes(type) && event.isFirst) {
      await supabase.from('pipeline_notifications').insert({
        type: type === 'emailsClicked' ? 'engagement' : 'engagement',
        title: `${name} ${type === 'emailsClicked' ? 'clicked a link' : 'opened email'}`,
        body: `${name}${company ? ` (${company})` : ''} — ${event.campaignName || 'Campaign'}, Step ${event.sequenceStep || '?'}`,
        contact_id: contactId, contact_name: name, company_name: company,
        source: 'lemlist', campaign_name: event.campaignName || null,
        priority: 'low', metadata: { eventType: type, email, step: event.sequenceStep },
      })
    }

    return res.status(200).json({ ok: true, type, email, contactId, isNew: !(rows && rows.length > 0) })
  } catch (e) {
    console.error('Lemlist webhook error:', e)
    return res.status(500).json({ error: e.message })
  }
}
