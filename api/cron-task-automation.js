// api/cron-task-automation.js — Kiko Task Automation Agent
import { cronHeartbeat } from './kiko-tools.js';
// Runs Mon-Fri 6:30am before morning brief
// 1. Merge duplicate tasks (same company + similar type)
// 2. Create follow-up tasks from stale deals (no task exists)
// 3. Flag overdue tasks
// 4. Auto-create tasks from recent deal stage changes
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const ORG_ID = '35975d96-c2c9-4b6c-b4d4-bb947ae817d5';

function daysBetween(d1, d2) {
  return Math.floor((new Date(d1) - new Date(d2)) / 86400000);
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

const STAGE_ACTIONS = {
  'Contact made': { type: 'Email Follow-up', daysTil: 3, notes: 'Follow up on initial contact' },
  'Qualified': { type: 'Schedule Call', daysTil: 5, notes: 'Schedule qualification call' },
  'In Dialogue': { type: 'Email Follow-up', daysTil: 7, notes: 'Advance conversation — send value proposition' },
  'Meeting arranged (brand x RH)': { type: 'Meeting Prep', daysTil: 2, notes: 'Prepare meeting materials and talking points' },
  'Proposal Sent': { type: 'Email Follow-up', daysTil: 5, notes: 'Chase proposal response' },
  'Negotiation': { type: 'Email Follow-up', daysTil: 3, notes: 'Follow up on negotiation points' },
};

async function mergeDuplicateTasks(tasks) {
  const active = tasks.filter(t => !t.data?.completed);
  const byKey = {};
  for (const t of active) {
    const company = (t.data?.company || '').toLowerCase().trim();
    const type = (t.data?.type || '').toLowerCase().trim();
    if (!company) continue;
    const key = `${company}::${type}`;
    if (!byKey[key]) byKey[key] = [];
    byKey[key].push(t);
  }
  let merged = 0;
  for (const [key, group] of Object.entries(byKey)) {
    if (group.length <= 1) continue;
    // Keep the most recent, delete the rest
    const sorted = group.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
    const keep = sorted[0];
    const dupes = sorted.slice(1);
    // Merge notes from duplicates into the kept task
    const allNotes = sorted.map(t => t.data?.notes).filter(Boolean);
    const mergedNotes = [...new Set(allNotes)].join(' | ');
    const earliestDue = sorted.map(t => t.data?.dueDate).filter(Boolean).sort()[0];
    await supabase.from('tasks').update({
      data: { ...keep.data, notes: mergedNotes, dueDate: earliestDue || keep.data?.dueDate },
      updated_at: new Date().toISOString()
    }).eq('id', keep.id);
    for (const d of dupes) {
      await supabase.from('tasks').delete().eq('id', d.id);
    }
    merged += dupes.length;
  }
  return merged;
}

async function createTasksFromStaleDeals(tasks, deals) {
  const activeTasks = tasks.filter(t => !t.data?.completed);
  const taskCompanies = new Set(activeTasks.map(t => (t.data?.company || '').toLowerCase()));
  const now = new Date();
  let created = 0;
  for (const deal of deals) {
    const d = deal.data || {};
    const company = (d.company || '').toLowerCase();
    if (!company || taskCompanies.has(company)) continue;
    const daysSince = daysBetween(now, deal.updated_at);
    if (daysSince < 14) continue; // Only stale deals (14d+)
    const contact = d.contactName || d.contact || '';
    const dueDate = addDays(now, 2);
    await supabase.from('tasks').insert({
      id: `t${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
      data: {
        type: 'Re-engage',
        company: d.company,
        contact,
        notes: `${daysSince}d since last activity. Stage: ${d.stage}. Auto-created by Kiko.`,
        dueDate,
        completed: false,
        createdAt: now.toISOString(),
        assignedTo: 'Sunny Sidhu',
        autoCreated: true,
      },
      org_id: ORG_ID,
      updated_at: now.toISOString(),
    });
    created++;
    if (created >= 5) break; // Max 5 auto-created per run
  }
  return created;
}

async function createTasksFromStageChanges(tasks) {
  const activeTasks = tasks.filter(t => !t.data?.completed);
  const taskCompanies = new Set(activeTasks.map(t => (t.data?.company || '').toLowerCase()));
  // Get recent stage changes (last 24h)
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: changes } = await supabase.from('activities')
    .select('*').eq('type', 'stage_change')
    .gt('created_at', since).order('created_at', { ascending: false });
  let created = 0;
  for (const change of (changes || [])) {
    const toStage = change.metadata?.to_stage;
    const company = change.entity_name || '';
    if (!company || !toStage || !STAGE_ACTIONS[toStage]) continue;
    if (taskCompanies.has(company.toLowerCase())) continue;
    const action = STAGE_ACTIONS[toStage];
    const now = new Date();
    await supabase.from('tasks').insert({
      id: `t${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
      data: {
        type: action.type,
        company,
        contact: '',
        notes: `${action.notes}. Auto-created after stage → ${toStage}.`,
        dueDate: addDays(now, action.daysTil),
        completed: false,
        createdAt: now.toISOString(),
        assignedTo: 'Sunny Sidhu',
        autoCreated: true,
      },
      org_id: ORG_ID,
      updated_at: now.toISOString(),
    });
    created++;
  }
  return created;
}

export default async function handler(req, res) {
  const __hbStart = Date.now();
  const __hbId = await cronHeartbeat('cron-task-automation', 'started');
  try {
  console.log('[TaskAutomation] Starting...');
  const now = new Date();
  try {
    const [{ data: tasks }, { data: deals }] = await Promise.all([
      supabase.from('tasks').select('*').order('updated_at', { ascending: false }),
      supabase.from('deals').select('id, data, updated_at')
        .not('data->>status', 'in', '("won","lost")')
        .order('updated_at', { ascending: false }),
    ]);

    // 1. Merge duplicates
    const merged = await mergeDuplicateTasks(tasks || []);

    // 2. Create tasks from stale deals (no existing task)
    const fromStale = await createTasksFromStaleDeals(tasks || [], deals || []);

    // 3. Create tasks from recent stage changes
    const fromStages = await createTasksFromStageChanges(tasks || []);

    // 4. Flag overdue count
    const active = (tasks || []).filter(t => !t.data?.completed);
    const overdue = active.filter(t => t.data?.dueDate && new Date(t.data.dueDate) < now);

    const summary = {
      merged_duplicates: merged,
      tasks_from_stale_deals: fromStale,
      tasks_from_stage_changes: fromStages,
      overdue_count: overdue.length,
      total_active: active.length - merged,
      timestamp: now.toISOString(),
    };

    // Log to kiko_alerts if any actions taken
    if (merged > 0 || fromStale > 0 || fromStages > 0) {
      const parts = [];
      if (merged > 0) parts.push(`merged ${merged} duplicate tasks`);
      if (fromStale > 0) parts.push(`created ${fromStale} re-engage tasks from stale deals`);
      if (fromStages > 0) parts.push(`created ${fromStages} tasks from stage changes`);
      await supabase.from('kiko_alerts').insert({
        type: 'task_automation',
        severity: 'low',
        title: `Task automation: ${parts.join(', ')}`,
        detail: JSON.stringify(summary),
        entity_type: 'system',
        entity_name: 'Kiko Task Automation',
        metadata: summary,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      });
    }

    console.log('[TaskAutomation] Complete:', JSON.stringify(summary));
    return res.json({ ok: true, ...summary });
  } catch (err) {
    console.error('[TaskAutomation] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
  } catch (__hbErr) {
    await cronHeartbeat('cron-task-automation', 'error', { heartbeatId: __hbId, errorMessage: __hbErr?.message || 'unknown' });
    throw __hbErr;
  }
}
