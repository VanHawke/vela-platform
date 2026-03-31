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
        `kiko_draft_actions?status=eq.pending&order=created_at.desc&limit=${limit}&select=id,action_type,payload,created_at,source`
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
        if (action_type === 'follow_up' || action_type === 'email') {
          // Create a task for the follow-up rather than auto-sending
          await sbFetch('tasks', {
            method: 'POST',
            body: JSON.stringify({
              data: {
                type: 'follow_up',
                notes: payload?.suggested_action || payload?.action || 'Follow up',
                company: payload?.entity || payload?.company || '',
                contactName: payload?.contact || '',
                completed: false,
                dueDate: new Date(Date.now() + 86400000).toISOString().split('T')[0],
                source: 'kiko_draft_action',
              },
            }),
          });
          executionResult = `Task created: follow up with ${payload?.entity || 'contact'}`;
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
