// api/cron-prospect-intelligence.js — Autonomous prospect & company monitoring
// Runs daily at 10am. Monitors all CRM contacts and companies for changes.
// Detects: job changes, funding rounds, acquisitions, leadership moves, company news.
// Auto-updates CRM, suggests outreach, creates tasks.
import { sbFetch, cronHeartbeat } from './kiko-tools.js';

export default async function handler(req, res) {
  const hbId = await cronHeartbeat('cron-prospect-intelligence', 'started');
  const start = Date.now();

  try {
    const baseUrl = `http://localhost:${process.env.PORT || 3000}`;

    // 1. Get active pipeline contacts (people we care about)
    const contacts = await sbFetch('contacts?select=id,data&limit=50&order=updated_at.desc');
    const activeContacts = (contacts || [])
      .filter(c => c.data?.firstName && c.data?.company)
      .slice(0, 30);

    // 2. Get pipeline companies
    const companies = await sbFetch('companies?select=id,data&limit=30&order=updated_at.desc');
    const activeCompanies = (companies || [])
      .filter(c => c.data?.name)
      .slice(0, 20);

    // 3. Build monitoring request for Kiko
    const contactList = activeContacts.map(c => 
      `${c.data.firstName} ${c.data.lastName || ''} at ${c.data.company} (${c.data.title || 'unknown role'})`
    ).join('\n');

    const companyList = activeCompanies.map(c =>
      `${c.data.name} (${c.data.industry || 'unknown industry'})`
    ).join('\n');

    if (!contactList && !companyList) {
      await cronHeartbeat('cron-prospect-intelligence', 'finished', { heartbeatId: hbId, durationMs: Date.now() - start });
      return res.json({ ok: true, message: 'No contacts or companies to monitor' });
    }

    // 4. Call Kiko to research and act
    const kikoRes = await fetch(`${baseUrl}/api/kiko`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `PROSPECT INTELLIGENCE SCAN — Monitor these contacts and companies for changes. Use web_search to check each one.

═══ CONTACTS TO MONITOR ═══
${contactList}

═══ COMPANIES TO MONITOR ═══
${companyList}

FOR EACH CONTACT, search for:
1. Job change — have they moved to a new company? If YES: create a task to send congratulations AND update the CRM record with new company/title. Also add their OLD company as a new prospect (the replacement hire may be our new contact).
2. Promotion — same company, new title? Update CRM, suggest congratulatory note.
3. LinkedIn activity — any recent posts about sponsorship, partnerships, F1, or category-relevant topics? Flag as warm signal.

FOR EACH COMPANY, search for:
1. Funding round — new investment? Flag as outreach opportunity with angle: "congratulations on the raise, here is how F1 partnerships amplify at this stage."
2. Acquisition — bought or being bought? Flag with implications for existing deals.
3. New leadership — new CEO, CMO, or CRO? Flag as new contact to add to CRM + outreach.
4. Partnership announcements — any new sponsorship deals? Update the partnership matrix.
5. Layoffs or restructuring — flag as risk for active deals.

ACTIONS TO TAKE:
- For job changes: use manage_knowledge to save the update, create a task for congratulatory outreach
- For funding/acquisition: create a task with the specific outreach angle
- For new leadership: create a task to research the new person and add to CRM
- If nothing changed for a contact/company, skip it silently

Focus on the top 10 most important contacts and top 5 companies. Do NOT report on those with no changes.`,
        userEmail: 'sunny@vanhawke.agency',
        currentPage: 'contacts',
        conversationHistory: [],
        nostream: true, system: true,
      }),
      signal: AbortSignal.timeout(180000),
    });

    const data = await kikoRes.json().catch(() => ({}));
    console.log('[ProspectIntel] Complete:', (data.response || '').slice(0, 200));

    await cronHeartbeat('cron-prospect-intelligence', 'finished', {
      heartbeatId: hbId, durationMs: Date.now() - start,
      recordsProcessed: activeContacts.length + activeCompanies.length,
    });

    res.json({ ok: true, contacts: activeContacts.length, companies: activeCompanies.length, duration_ms: Date.now() - start });
  } catch (err) {
    console.error('[ProspectIntel] Failed:', err.message);
    await cronHeartbeat('cron-prospect-intelligence', 'error', { heartbeatId: hbId, errorMessage: err.message });
    res.json({ ok: false, error: err.message });
  }
}
