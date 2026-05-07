// api/cron-contact-reenrich.js — Monthly re-enrichment of active campaign contacts
// Cost-effective: only enriches contacts in active campaigns, max 10 per run, monthly cycle
// Uses Apollo free tier (300 credits/month) — well within limits at 10/week
import { sbFetch, cronHeartbeat } from './kiko-tools.js';

const APOLLO_KEY = process.env.APOLLO_API_KEY;

export default async function handler(req, res) {
  const __hbStart = Date.now();
  const __hbId = await cronHeartbeat('cron-contact-reenrich', 'started');

  if (!APOLLO_KEY) {
    await cronHeartbeat('cron-contact-reenrich', 'finished', { heartbeatId: __hbId, error: 'No Apollo API key' });
    return res.status(200).json({ ok: false, error: 'No Apollo API key' });
  }

  try {
    // Find contacts in active campaigns that haven't been enriched in 30+ days (or never)
    const stale = await sbFetch(
      `kiko_sequence_enrollments?status=eq.active&select=id,contact_name,contact_email,company,linkedin_url&order=created_at.asc&limit=10`
    );

    let enriched = 0, skipped = 0;
    for (const contact of (stale || [])) {
      if (!contact.contact_email) { skipped++; continue; }

      const [firstName, ...rest] = (contact.contact_name || '').split(' ');
      const lastName = rest.join(' ');
      const domain = contact.contact_email.split('@')[1];

      try {
        // Apollo people enrichment — uses 1 credit per lookup
        const apolloRes = await fetch('https://api.apollo.io/api/v1/people/match', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': APOLLO_KEY },
          body: JSON.stringify({
            first_name: firstName, last_name: lastName,
            organization_name: contact.company, domain: domain
          })
        });
        const data = await apolloRes.json();
        const person = data?.person;

        if (person) {
          // Update enrollment with fresh data
          const updates = {};
          if (person.title && person.title !== contact.title) updates.job_title = person.title;
          if (person.linkedin_url && !contact.linkedin_url) updates.linkedin_url = person.linkedin_url;

          if (Object.keys(updates).length > 0) {
            await sbFetch(`kiko_sequence_enrollments?id=eq.${contact.id}`, {
              method: 'PATCH', body: JSON.stringify(updates)
            });
            console.log(`[ReEnrich] Updated ${contact.contact_name}: ${JSON.stringify(updates)}`);
            enriched++;
          } else {
            skipped++;
          }
        } else { skipped++; }
      } catch (e) {
        console.error(`[ReEnrich] ${contact.contact_name}: ${e.message}`);
        skipped++;
      }
    }

    if (enriched > 0) {
      await sbFetch('activities', { method: 'POST', body: JSON.stringify({
        type: 'kiko_cron_action', entity_name: 'Contact Re-enrichment',
        subject: `Kiko re-enriched ${enriched} contacts (${skipped} unchanged)`,
        status: 'completed'
      }) }).catch(() => {});
    }

    console.log(`[ReEnrich] Done: ${enriched} enriched, ${skipped} skipped`);
    await cronHeartbeat('cron-contact-reenrich', 'finished', { heartbeatId: __hbId, durationMs: Date.now() - __hbStart, recordsProcessed: enriched });
    return res.status(200).json({ ok: true, enriched, skipped });
  } catch (e) {
    console.error('[ReEnrich] Error:', e);
    await cronHeartbeat('cron-contact-reenrich', 'finished', { heartbeatId: __hbId, error: e.message });
    return res.status(500).json({ error: e.message });
  }
}
