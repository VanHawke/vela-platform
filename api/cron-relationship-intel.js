// api/cron-relationship-intel.js — Relationship Intelligence (Phase 17)
// Weekly scan of Gmail sent/received. Maps contact frequency, response times,
// warmth scores. Feeds into outreach and strategy agents.
import { sbFetch } from './kiko-tools.js';

export const config = { maxDuration: 45 };
const USER_ID = '9f486437-4bf5-4111-abfe-fe19bfa76063';
const USER_EMAIL = 'sunny@vanhawke.com';

async function getGoogleToken() {
  const { getGoogleToken: gt } = await import('./google-token.js');
  return gt(USER_EMAIL);
}


async function scanGmailContacts(token) {
  const contacts = {}; // email → { sent, received, lastSent, lastReceived, name }

  // Scan last 100 sent emails for outbound frequency
  const sentRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=in:sent&maxResults=100`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const sentData = await sentRes.json();
  const sentIds = (sentData.messages || []).map(m => m.id);

  for (const id of sentIds.slice(0, 80)) {
    try {
      const msgRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=To&metadataHeaders=Date`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const msg = await msgRes.json();
      const toHeader = (msg.payload?.headers || []).find(h => h.name === 'To')?.value || '';
      const dateHeader = (msg.payload?.headers || []).find(h => h.name === 'Date')?.value;
      const emailMatch = toHeader.match(/[\w.+-]+@[\w.-]+/);
      if (!emailMatch) continue;
      const email = emailMatch[0].toLowerCase();
      if (!contacts[email]) contacts[email] = { sent: 0, received: 0, lastSent: null, lastReceived: null, name: '' };
      contacts[email].sent++;
      const nameMatch = toHeader.match(/^([^<]+)</);
      if (nameMatch) contacts[email].name = nameMatch[1].trim().replace(/"/g, '');
      if (dateHeader) {
        const d = new Date(dateHeader);
        if (!contacts[email].lastSent || d > new Date(contacts[email].lastSent)) contacts[email].lastSent = d.toISOString();
      }
    } catch {}
  }


  // Scan last 100 received emails for inbound frequency
  const recvRes = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=in:inbox -from:me&maxResults=100`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const recvData = await recvRes.json();
  const recvIds = (recvData.messages || []).map(m => m.id);

  for (const id of recvIds.slice(0, 80)) {
    try {
      const msgRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Date`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const msg = await msgRes.json();
      const fromHeader = (msg.payload?.headers || []).find(h => h.name === 'From')?.value || '';
      const dateHeader = (msg.payload?.headers || []).find(h => h.name === 'Date')?.value;
      const emailMatch = fromHeader.match(/[\w.+-]+@[\w.-]+/);
      if (!emailMatch) continue;
      const email = emailMatch[0].toLowerCase();
      if (!contacts[email]) contacts[email] = { sent: 0, received: 0, lastSent: null, lastReceived: null, name: '' };
      contacts[email].received++;
      const nameMatch = fromHeader.match(/^([^<]+)</);
      if (nameMatch && !contacts[email].name) contacts[email].name = nameMatch[1].trim().replace(/"/g, '');
      if (dateHeader) {
        const d = new Date(dateHeader);
        if (!contacts[email].lastReceived || d > new Date(contacts[email].lastReceived)) contacts[email].lastReceived = d.toISOString();
      }
    } catch {}
  }

  return contacts;
}


function calculateWarmth(contact) {
  let score = 0.3; // baseline
  // Bidirectional communication = warm
  if (contact.sent > 0 && contact.received > 0) score += 0.2;
  // High frequency = warmer
  const total = contact.sent + contact.received;
  if (total >= 10) score += 0.2;
  else if (total >= 5) score += 0.1;
  // Recent activity = warmer
  const lastContact = contact.lastSent || contact.lastReceived;
  if (lastContact) {
    const daysSince = (Date.now() - new Date(lastContact)) / 86400000;
    if (daysSince < 7) score += 0.15;
    else if (daysSince < 30) score += 0.05;
    else score -= 0.1;
  }
  // Reciprocity ratio
  if (contact.sent > 0 && contact.received > 0) {
    const ratio = Math.min(contact.sent, contact.received) / Math.max(contact.sent, contact.received);
    score += ratio * 0.1; // balanced = warmer
  }
  return Math.min(Math.max(score, 0.05), 0.99);
}

function classifyRelationship(contact) {
  const total = contact.sent + contact.received;
  if (total >= 15 && contact.received > 3) return 'active_partner';
  if (total >= 5 && contact.received > 0) return 'engaged';
  if (contact.sent > 3 && contact.received === 0) return 'cold_outbound';
  if (contact.received > 3 && contact.sent === 0) return 'inbound_only';
  if (total >= 2) return 'early_stage';
  return 'minimal';
}


export default async function handler(req, res) {
  try {
    const token = await getGoogleToken();
    if (!token) return res.status(200).json({ ok: false, error: 'No Google token' });

    const contacts = await scanGmailContacts(token);
    const emails = Object.keys(contacts);
    if (!emails.length) return res.status(200).json({ ok: true, message: 'No contacts found', relationships: 0 });

    // Try to match with CRM contacts for company info
    const crmContacts = await sbFetch('contacts?select=data&limit=500').catch(() => []);
    const crmByEmail = {};
    for (const c of (Array.isArray(crmContacts) ? crmContacts : [])) {
      const email = (c.data?.email || '').toLowerCase();
      if (email) crmByEmail[email] = c.data;
    }

    let written = 0;
    for (const [email, data] of Object.entries(contacts)) {
      if (email === USER_EMAIL) continue; // skip self
      const warmth = calculateWarmth(data);
      const relType = classifyRelationship(data);
      const crm = crmByEmail[email];
      const company = crm?.company || email.split('@')[1]?.split('.')[0] || '';

      try {
        // Upsert
        const existing = await sbFetch(`kiko_relationships?user_id=eq.${USER_ID}&contact_email=eq.${encodeURIComponent(email)}&limit=1`);
        const row = {
          user_id: USER_ID, contact_email: email,
          contact_name: data.name || crm?.firstName || '',
          company: company,
          emails_sent: data.sent, emails_received: data.received,
          last_sent_at: data.lastSent, last_received_at: data.lastReceived,
          warmth_score: warmth, relationship_type: relType,
          last_analysed_at: new Date().toISOString(),
        };
        if (Array.isArray(existing) && existing.length > 0) {
          await sbFetch(`kiko_relationships?user_id=eq.${USER_ID}&contact_email=eq.${encodeURIComponent(email)}`, { method: 'PATCH', body: JSON.stringify(row) });
        } else {
          await sbFetch('kiko_relationships', { method: 'POST', body: JSON.stringify(row) });
        }
        written++;
      } catch {}
    }

    return res.status(200).json({ ok: true, relationships: written, total_contacts: emails.length });
  } catch (err) {
    return res.status(200).json({ ok: false, error: err.message });
  }
}
