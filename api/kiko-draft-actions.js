// api/kiko-draft-actions.js — Draft Actions API (Phase 14)
// Lists pending draft actions, approves/dismisses them
import { sbFetch, logError } from './kiko-tools.js';

export default async function handler(req, res) {
  try {
    const { action, id, ...params } = req.method === 'GET' ? req.query : req.body || {};

    // LIST pending draft actions
    if (!action || action === 'list') {
      const limit = params.limit || 10;
      const drafts = await sbFetch(
        `kiko_draft_actions?status=eq.pending&order=created_at.desc&limit=${limit}&select=id,action_type,payload,created_at`
      );
      return res.json({ drafts: drafts || [], count: (drafts || []).length });
    }

    // DISMISS a draft action
    if (action === 'dismiss' && id) {
      await sbFetch(`kiko_draft_actions?id=eq.${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'rejected', resolved_at: new Date().toISOString() }),
      });
      return res.json({ success: true, id, status: 'rejected' });
    }

    // APPROVE a draft action
    if (action === 'approve' && id) {
      // Fetch the draft action
      const drafts = await sbFetch(`kiko_draft_actions?id=eq.${id}&limit=1`);
      if (!drafts?.length) return res.status(404).json({ error: 'Draft action not found' });

      const draft = drafts[0];
      const { action_type, payload } = draft;
      let executionResult = '';

      try {
        // Execute based on action type
        if (action_type === 'follow_up' || action_type === 'email' || action_type === 'auto_followup') {
          // Create a real Gmail draft the user can review and send
          let gmailDraftCreated = false;
          try {
            const { getGoogleToken } = await import('./google-token.js');
            const { getActiveUsers } = await import('./cron-utils.js');
            const users = await getActiveUsers();
            const email = users[0]?.email;
            if (email) {
              const token = await getGoogleToken(email);
              if (token && payload?.draft) {
                // Parse subject and body from the draft text
                const draftText = payload.draft || '';
                const subjectMatch = draftText.match(/SUBJECT:\s*(.+?)(?:\n|$)/i);
                const subject = subjectMatch ? subjectMatch[1].trim() : `Follow up: ${payload?.entity || 'contact'}`;
                // Strip SUBJECT: and ACTION: lines to get clean body
                const body = draftText
                  .replace(/^SUBJECT:.*$/mi, '')
                  .replace(/^ACTION:.*$/mi, '')
                  .trim();
                // Find recipient email from contacts if available
                let recipientEmail = payload?.recipient_email || '';
                if (!recipientEmail && payload?.entity) {
                  const contacts = await sbFetch(`contacts?select=data&data->>company=ilike.*${encodeURIComponent(payload.entity)}*&limit=1`);
                  if (contacts?.[0]?.data?.email) recipientEmail = contacts[0].data.email;
                }
                const toLine = recipientEmail ? `To: ${recipientEmail}\r\n` : '';
                const raw = Buffer.from(
                  `${toLine}From: ${email}\r\nSubject: ${subject}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body}`
                ).toString('base64url');
                const gmailRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/drafts', {
                  method: 'POST',
                  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                  body: JSON.stringify({ message: { raw } }),
                });
                if (gmailRes.ok) {
                  const gmailData = await gmailRes.json();
                  gmailDraftCreated = true;
                  executionResult = `Gmail draft created for ${payload?.entity || 'contact'} (draft ID: ${gmailData.id}). Open Gmail to review and send.`;
                }
              }
            }
          } catch (gmailErr) {
            console.error('[draft-actions] Gmail draft failed:', gmailErr.message);
          }
          // Fallback: create a task if Gmail draft failed
          if (!gmailDraftCreated) {
            await sbFetch('tasks', {
              method: 'POST',
              body: JSON.stringify({
                data: {
                  type: 'follow_up',
                  notes: payload?.suggested_action || payload?.action || payload?.draft?.slice(0, 200) || 'Follow up',
                  company: payload?.entity || payload?.company || '',
                  contactName: payload?.contact || '',
                  completed: false,
                  dueDate: new Date(Date.now() + 86400000).toISOString().split('T')[0],
                  source: 'kiko_draft_action',
                },
              }),
            });
            executionResult = `Task created (Gmail draft unavailable): follow up with ${payload?.entity || 'contact'}`;
          }
        } else if (action_type === 'deal_move') {
          // Move deal to suggested stage
          const dealName = payload?.entity || payload?.company;
          if (dealName) {
            const deals = await sbFetch(`deals?select=id,data&data->>company=ilike.*${encodeURIComponent(dealName)}*&limit=1`);
            if (deals?.[0]) {
              const deal = deals[0];
              const newStage = payload?.to_stage || payload?.suggested_stage || deal.data.stage;
              const oldStage = deal.data.stage;
              await sbFetch(`deals?id=eq.${deal.id}`, {
                method: 'PATCH',
                body: JSON.stringify({ data: { ...deal.data, stage: newStage } }),
              });
              // Log stage change
              await sbFetch('deal_stage_history', {
                method: 'POST',
                body: JSON.stringify({ deal_id: deal.id, from_stage: oldStage, to_stage: newStage, changed_by: 'kiko_draft_action' }),
              });
              executionResult = `Moved ${dealName} from "${oldStage}" to "${newStage}"`;
            } else {
              executionResult = `Could not find deal: ${dealName}`;
            }
          }
        } else if (action_type === 'task_create' || action_type === 'task') {
          await sbFetch('tasks', {
            method: 'POST',
            body: JSON.stringify({
              data: {
                type: payload?.task_type || 'action',
                notes: payload?.suggested_action || payload?.description || 'New task from Kiko',
                company: payload?.entity || payload?.company || '',
                completed: false,
                dueDate: payload?.due_date || new Date(Date.now() + 86400000).toISOString().split('T')[0],
                source: 'kiko_draft_action',
              },
            }),
          });
          executionResult = `Task created: ${payload?.suggested_action || 'action item'}`;
        } else if (action_type === 'task_complete') {
          // Confirm-CTA from a send — mark the originating task done (idempotent; the DB trigger fans out)
          const taskId = payload?.task_id;
          if (!taskId) {
            executionResult = 'No task linked to this confirmation.';
          } else {
            const trows = await sbFetch(`tasks?id=eq.${encodeURIComponent(taskId)}&select=id,data&limit=1`);
            const trow = trows?.[0];
            if (!trow) executionResult = 'That task no longer exists.';
            else if (trow.data?.completed) executionResult = `Already done${payload?.entity ? ` — ${payload.entity}` : ''}.`;
            else {
              await sbFetch(`tasks?id=eq.${encodeURIComponent(taskId)}`, {
                method: 'PATCH',
                body: JSON.stringify({ data: { ...trow.data, completed: true, completedAt: new Date().toISOString() }, updated_at: new Date().toISOString() }),
              });
              executionResult = `Task marked done${payload?.entity ? ` — ${payload.entity}` : ''}. Logged to the record.`;
            }
          }
        } else {
          executionResult = `Unknown action type: ${action_type}. Draft marked approved.`;
        }
      } catch (execErr) {
        executionResult = `Execution failed: ${execErr.message}`;
        await logError('kiko-draft-actions', execErr.message, `action_type=${action_type}, id=${id}`);
      }

      // Mark as approved regardless
      await sbFetch(`kiko_draft_actions?id=eq.${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'approved',
          resolved_at: new Date().toISOString(),
          execution_result: executionResult,
        }),
      });

      return res.json({ success: true, id, status: 'approved', result: executionResult });
    }

    return res.status(400).json({ error: 'Invalid action. Use: list, approve, dismiss' });
  } catch (err) {
    console.error('[kiko-draft-actions]', err);
    await logError('kiko-draft-actions', err.message).catch(() => {});
    return res.status(500).json({ error: err.message });
  }
}
