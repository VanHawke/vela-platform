// api/gmail-send.js — Send email directly via Gmail API (not draft)
import { getGoogleToken } from './cron-utils.js';
import { sbFetch, findOpenTaskForCompany } from './kiko-tools.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });
  const { to, subject, body, sender = 'sunny', cc, thread_id, isTest = false, task_id = null } = req.body || {};
  if (!to || !body) return res.status(400).json({ error: 'Missing to or body' });

  try {
    // Determine sender — accept full email or shorthand
    const senderRaw = (sender || 'sunny').toLowerCase()
    const isMatt = senderRaw.includes('matt')
    // Token lookup uses .com (how Google tokens are stored in user_tokens)
    const tokenEmail = isMatt ? 'matt.smith@vanhawke.com' : 'sunny@vanhawke.com'
    // From header uses .agency (the business email)
    const fromEmail = isMatt ? 'matt.smith@vanhawke.agency' : 'sunny@vanhawke.agency'
    
    const token = await getGoogleToken(tokenEmail);
    if (!token) return res.status(401).json({ error: `No Gmail token for ${tokenEmail}` });

    // Fetch sender's Gmail signature from their account's sendAs settings
    let signature = '';
    try {
      // Try the .agency alias first, then the .com email
      for (const tryEmail of [fromEmail, tokenEmail]) {
        const sigRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/settings/sendAs/${encodeURIComponent(tryEmail)}`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        if (sigRes.ok) {
          const sigData = await sigRes.json();
          if (sigData.signature) { signature = sigData.signature; break; }
        }
      }
      // Fallback: try kiko_user_config
      if (!signature) {
        const cfgRes = await sbFetch(`kiko_user_config?select=email_signature_html&email=eq.${encodeURIComponent(fromEmail)}&limit=1`);
        signature = cfgRes?.[0]?.email_signature_html || '';
      }
    } catch (e) { console.error('[gmail-send] Signature fetch error:', e.message); }

    // Build MIME message
    const fullBody = body + (signature ? `\n\n${signature}` : '');
    const headers = [
      `To: ${to}`,
      `From: ${fromEmail}`,
      `Subject: ${subject || '(no subject)'}`,
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset=UTF-8',
    ];
    if (cc) headers.push(`Cc: ${cc}`);
    
    const raw = Buffer.from(headers.join('\r\n') + '\r\n\r\n' + fullBody.replace(/\n/g, '<br>'))
      .toString('base64')
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    const sendBody = { raw };
    if (thread_id) sendBody.threadId = thread_id;

    const gmailRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(sendBody),
    });
    const result = await gmailRes.json();

    if (!gmailRes.ok) return res.status(500).json({ error: result.error?.message || 'Gmail send failed' });

    // Track the send — but NOT for test emails
    let taskConfirm = null;
    if (!isTest) {
      // 1. Track in email_tracking with follow-up due
      await sbFetch('kiko_email_tracking', { method: 'POST', body: JSON.stringify({
        sender_email: fromEmail,
        recipient_email: to,
        subject: subject || '',
        gmail_message_id: result.id,
        gmail_thread_id: result.threadId,
        source: 'direct_send',
        sent_at: new Date().toISOString(),
        follow_up_due: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
      }) }).catch(() => {});

      // 2. Dismiss any reply alerts for this recipient (they've been handled)
      const recipientName = to.split('@')[0].replace(/\./g, ' ').replace(/\b\w/g, c => c.toUpperCase())
      await sbFetch(`kiko_alerts?type=in.(email_reply,email_reply_manual)&entity_name=ilike.*${encodeURIComponent(recipientName.split(' ').pop())}*&dismissed=eq.false`, {
        method: 'PATCH', body: JSON.stringify({ dismissed: true })
      }).catch(() => {});

      // 3. Log activity
      await sbFetch('activities', { method: 'POST', body: JSON.stringify({
        type: 'email', direction: 'outbound', subject: subject || '',
        entity_name: recipientName,
        created_at: new Date().toISOString(),
        metadata: { sender: fromEmail, recipient: to },
      }) }).catch(() => {});

      // 3b. Resolve the task this send relates to (explicit task_id, else by the recipient's company) and stage a
      //     pending confirm-CTA. The send never auto-completes the task; the caller surfaces a tap that approves it.
      let resolvedTaskId = task_id;
      let resolvedTask = null;
      if (!resolvedTaskId) {
        const contact = (await sbFetch(`contacts?select=data&data->>email=ilike.${encodeURIComponent(to)}&limit=1`).catch(() => []))?.[0];
        const company = contact?.data?.company;
        if (company) { resolvedTask = await findOpenTaskForCompany(company).catch(() => null); resolvedTaskId = resolvedTask?.id || null; }
      }
      if (resolvedTaskId) {
        if (!resolvedTask) resolvedTask = (await sbFetch(`tasks?id=eq.${encodeURIComponent(resolvedTaskId)}&select=id,data&limit=1`).catch(() => []))?.[0];
        const tcompany = resolvedTask?.data?.company || '';
        const staged = await sbFetch('kiko_draft_actions', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({
          action_type: 'task_complete', status: 'pending',
          payload: { task_id: resolvedTaskId, entity: tcompany || recipientName, sent_to: to, summary: `Sent to ${recipientName}. Mark this task done?`, source: 'gmail_send' },
        }) }).catch(() => null);
        const draftActionId = Array.isArray(staged) ? staged[0]?.id : staged?.id;
        if (draftActionId) taskConfirm = { draft_action_id: draftActionId, company: tcompany, notes: resolvedTask?.data?.notes || '' };
      }

      // 4. Update contact last activity — or CREATE contact if doesn't exist
      let contactCompany = ''
      const contacts = await sbFetch(`contacts?select=id,data&data->>email=ilike.${encodeURIComponent(to)}&limit=1`).catch(() => []);
      if (contacts?.[0]) {
        contactCompany = contacts[0].data?.company || ''
        // MERGE — update lastActivity AND append interaction note
        const existingNotes = contacts[0].data?.notes || ''
        const timestamp = new Date().toISOString().split('T')[0]
        const newNote = `[${timestamp}] Outbound email sent: "${subject || '(no subject)'}". Sender: ${fromEmail}.`
        const updated = { ...contacts[0].data, lastActivity: timestamp, notes: (existingNotes + '\n' + newNote).trim() };
        await sbFetch(`contacts?id=eq.${contacts[0].id}`, { method: 'PATCH', body: JSON.stringify({ data: updated }) }).catch(() => {});
        
        // Also update the deal if one exists for this contact
        const deals = await sbFetch(`deals?select=id,data&data->>contactName=ilike.*${encodeURIComponent(recipientName.split(' ').pop())}*&limit=1`).catch(() => []);
        if (deals?.[0]) {
          const dealNotes = deals[0].data?.notes || ''
          const updatedDeal = { ...deals[0].data, lastActivity: timestamp, notes: (dealNotes + '\n' + newNote).trim() };
          await sbFetch(`deals?id=eq.${deals[0].id}`, { method: 'PATCH', body: JSON.stringify({ data: updatedDeal, updated_at: new Date().toISOString() }) }).catch(() => {});
        }
      } else {
        // Contact doesn't exist — auto-create from email metadata
        const [localPart] = to.split('@')
        const domain = to.split('@')[1] || ''
        const nameParts = localPart.replace(/[._]/g, ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1))
        const firstName = nameParts[0] || ''
        const lastName = nameParts.slice(1).join(' ') || ''
        const companyDomain = domain.replace(/\.(com|co\.uk|io|net|org)$/i, '')
        const newContact = {
          firstName, lastName, email: to, company: companyDomain.charAt(0).toUpperCase() + companyDomain.slice(1),
          source: 'kiko', lastActivity: new Date().toISOString().split('T')[0],
          createdAt: new Date().toISOString().split('T')[0],
          notes: `Auto-created by Kiko when email sent on "${subject || '(no subject)'}"`,
        }
        contactCompany = newContact.company
        await sbFetch('contacts', { method: 'POST', body: JSON.stringify({
          id: `kc${Date.now()}`, data: newContact, org_id: '35975d96-c2c9-4b6c-b4d4-bb947ae817d5', updated_at: new Date().toISOString(),
        }) }).catch(e => console.log('[gmail-send] Auto-create contact:', e.message));
      }

      // 5. Create follow-up task if this is a reply (not a cold outreach)
      if (subject?.toLowerCase().includes('re:')) {
        const dueDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        await sbFetch('tasks', { method: 'POST', body: JSON.stringify({
          id: `t${Date.now()}`,
          data: {
            type: 'Follow-up', notes: `Reply sent on "${subject}". Check for response or schedule next touchpoint.`,
            company: contactCompany, contact: recipientName, dueDate,
            completed: false, createdAt: new Date().toISOString(), assignedTo: isMatt ? 'Matt Smith' : 'Sunny Sidhu',
          },
          org_id: '35975d96-c2c9-4b6c-b4d4-bb947ae817d5',
          updated_at: new Date().toISOString(),
        }) }).catch(() => {});
      }
    } // end if (!isTest)

    return res.status(200).json({ success: true, messageId: result.id, threadId: result.threadId, isTest, taskConfirm });
  } catch (e) {
    console.error('[gmail-send] Error:', e);
    return res.status(500).json({ error: e.message });
  }
}
