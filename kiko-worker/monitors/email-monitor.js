// monitors/email-monitor.js — Checks for new emails from known contacts
// Creates USER-SPECIFIC alerts: each alert has the user_id of whose inbox received it
// Super admin sees all alerts via RLS. Regular users see only their own.

async function sbFetch(path, opts = {}) {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return [];
  const res = await fetch(`${url}/rest/v1/${path}`, {
    ...opts,
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...opts.headers },
  });
  if (!res.ok) return [];
  return res.json().catch(() => []);
}

async function getToken(email) {
  const rows = await sbFetch(`user_tokens?user_email=eq.${encodeURIComponent(email)}&provider=eq.google&select=refresh_token&limit=1`);
  if (!Array.isArray(rows) || !rows[0]?.refresh_token) return null;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_CLIENT_ID, client_secret: process.env.GOOGLE_CLIENT_SECRET, refresh_token: rows[0].refresh_token, grant_type: 'refresh_token' }),
  });
  const data = await res.json();
  return data.access_token || null;
}

async function createAlert(alert) {
  const existing = await sbFetch(`kiko_alerts?type=eq.${alert.type}&entity_id=eq.${encodeURIComponent(alert.entity_id)}&dismissed=eq.false&select=id&limit=1`);
  if (Array.isArray(existing) && existing.length > 0) return;
  await sbFetch('kiko_alerts', {
    method: 'POST',
    body: JSON.stringify({ id: crypto.randomUUID(), ...alert, created_at: new Date().toISOString(), dismissed: false }),
  });
  console.log(`[email-monitor] Alert: ${alert.title} → user: ${alert.user_id || 'all'}`);
}

export async function runEmailMonitor() {
  console.log('[email-monitor] Checking for new replies...');
  
  // Get team members with their UUIDs for user-specific alerts
  const users = await sbFetch('users?select=id,email,role');
  if (!Array.isArray(users) || !users.length) { console.log('[email-monitor] No users found'); return; }
  const userMap = {};
  for (const u of users) userMap[u.email] = u.id;
  
  try {
    // Load CRM contacts for matching
    const contacts = await sbFetch('contacts?select=id,data&limit=500');
    const knownEmails = new Set();
    const contactMap = {};
    if (Array.isArray(contacts)) {
      for (const c of contacts) {
        const email = c.data?.email?.toLowerCase();
        if (email) { knownEmails.add(email); contactMap[email] = { name: `${c.data.firstName || ''} ${c.data.lastName || ''}`.trim(), company: c.data.company, id: c.id }; }
      }
    }
    
    // Also check campaign targets for campaign-specific alerts
    const targets = await sbFetch('campaign_targets?select=id,contact_email,contact_name,sequence_id,status&limit=500');
    const campaignEmails = new Set();
    const campaignMap = {};
    if (Array.isArray(targets)) {
      for (const t of targets) {
        const email = t.contact_email?.toLowerCase();
        if (email) { campaignEmails.add(email); campaignMap[email] = { name: t.contact_name, sequenceId: t.sequence_id, status: t.status, targetId: t.id }; }
      }
    }
    
    let alertCount = 0;
    
    for (const userEmail of Object.keys(userMap)) {
      const token = await getToken(userEmail);
      if (!token) continue;
      const label = userEmail.split('@')[0];
      const userId = userMap[userEmail];
      const GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me';
      const res = await fetch(`${GMAIL}/messages?q=newer_than:1h is:inbox&maxResults=10`, { headers: { Authorization: `Bearer ${token}` } });
      const list = await res.json();
      if (!list.messages?.length) continue;
      
      for (const msg of list.messages.slice(0, 8)) {
        const detail = await fetch(`${GMAIL}/messages/${msg.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json());
        const hdrs = detail.payload?.headers || [];
        const from = hdrs.find(h => h.name === 'From')?.value || '';
        const subject = hdrs.find(h => h.name === 'Subject')?.value || '';
        const emailMatch = from.match(/<([^>]+)>/);
        const senderEmail = (emailMatch ? emailMatch[1] : from).toLowerCase().trim();
        const senderName = from.split('<')[0].trim().replace(/"/g, '');
        
        // Check if sender is a campaign prospect (highest priority)
        if (campaignEmails.has(senderEmail)) {
          const campaign = campaignMap[senderEmail];
          await createAlert({
            type: 'email_reply', severity: 'high',
            title: `Campaign reply from ${campaign.name || senderName}`,
            detail: `Subject: ${subject}. Prospect replied to campaign outreach. Received in ${label}'s inbox.`,
            entity_type: 'campaign_target', entity_id: campaign.targetId || senderEmail, entity_name: campaign.name || senderName,
            metadata: { from: senderEmail, subject, inbox: label, message_id: msg.id, sequence_id: campaign.sequenceId, source: 'campaign' },
            user_id: userId,
            expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
          });
          alertCount++;
        }
        // Check if sender is a known CRM contact
        else if (knownEmails.has(senderEmail)) {
          const contact = contactMap[senderEmail];
          await createAlert({
            type: 'email_reply', severity: 'medium',
            title: `Reply from ${contact.name || senderName}${contact.company ? ` (${contact.company})` : ''}`,
            detail: `Subject: ${subject}. Received in ${label}'s inbox.`,
            entity_type: 'contact', entity_id: contact.id || senderEmail, entity_name: contact.name || senderName,
            metadata: { from: senderEmail, subject, inbox: label, message_id: msg.id },
            user_id: userId,
            expires_at: new Date(Date.now() + 3 * 86400000).toISOString(),
          });
          alertCount++;
        }
        // Unknown sender from a business domain — auto-create contact + alert
        else {
          const domain = senderEmail.split('@')[1];
          const skipDomains = ['gmail.com','outlook.com','yahoo.com','hotmail.com','icloud.com','me.com','aol.com','protonmail.com','vanhawke.agency','vanhawke.com','googlemail.com','live.com','msn.com'];
          if (domain && !skipDomains.includes(domain) && senderName && senderName.length > 1) {
            // Auto-create contact in CRM
            const nameParts = senderName.split(' ');
            const firstName = nameParts[0] || senderName;
            const lastName = nameParts.slice(1).join(' ') || '';
            const company = domain.split('.')[0].charAt(0).toUpperCase() + domain.split('.')[0].slice(1);
            try {
              await sbFetch('contacts', {
                method: 'POST',
                body: JSON.stringify({
                  id: crypto.randomUUID(),
                  data: { firstName, lastName, email: senderEmail, company, source: 'inbound_email', notes: `Auto-created from inbound email: "${subject}" on ${new Date().toLocaleDateString('en-GB')}` },
                  created_at: new Date().toISOString(),
                }),
              });
              await createAlert({
                type: 'new_contact', severity: 'low',
                title: `New contact: ${senderName} (${company})`,
                detail: `Auto-created from inbound email. Subject: "${subject}". Domain: ${domain}. Created in CRM automatically.`,
                entity_type: 'contact', entity_id: senderEmail, entity_name: senderName,
                metadata: { from: senderEmail, subject, inbox: label, message_id: msg.id, domain, auto_created: true },
                user_id: userId,
                expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
              });
              alertCount++;
              console.log(`[email-monitor] Auto-created contact: ${senderName} (${company}) from ${senderEmail}`);
            } catch (e) { /* Contact might already exist — ignore duplicate errors */ }
          }
        }
      }
    }
    console.log(`[email-monitor] Complete. ${alertCount} new reply alerts.`);
  } catch (err) { console.error('[email-monitor] Error:', err.message); }
}
